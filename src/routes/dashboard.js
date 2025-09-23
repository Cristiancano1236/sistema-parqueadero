const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { toSafeInt } = require('../utils/sanitize');

// Middleware para verificar el token
const verifyToken = require('../middleware/auth');

// Obtener estadísticas del dashboard
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const pageSize = toSafeInt(req.query.pageSize, { min: 1, max: 50, fallback: 5 });
        const page = toSafeInt(req.query.page, { min: 0, max: 100000, fallback: 0 });
        const offset = page * pageSize;
        // Obtener vehículos actuales por tipo
        const [currentVehiclesByType] = await pool.query(
            `SELECT v.tipo, COUNT(*) as count
             FROM movimientos m
             JOIN vehiculos v ON v.id_vehiculo = m.id_vehiculo
             WHERE m.id_empresa = ? AND m.fecha_salida IS NULL
             GROUP BY v.tipo`
            , [req.user.id_empresa]
        );

        // Obtener ingresos del día (basado en movimientos finalizados por fecha de salida)
        const [todayIncome] = await pool.query(
            `SELECT COALESCE(SUM(total_a_pagar), 0) as total
             FROM movimientos
             WHERE id_empresa = ? AND estado = 'finalizado' AND DATE(fecha_salida) = CURRENT_DATE`
            , [req.user.id_empresa]
        );

        // Eliminado promedio de estadía

        // Obtener total de usuarios
        const [totalUsers] = await pool.query(
            'SELECT COUNT(*) as count FROM usuarios WHERE id_empresa = ? AND activo = true',
            [req.user.id_empresa]
        );

        // Obtener actividad reciente
        const [recentActivity] = await pool.query(
            `SELECT 
                m.id_movimiento as id,
                v.placa,
                v.tipo,
                m.fecha_entrada as entrada,
                CASE WHEN m.fecha_salida IS NULL THEN 'activo' ELSE 'finalizado' END as estado
             FROM movimientos m
             JOIN vehiculos v ON m.id_vehiculo = v.id_vehiculo
             WHERE m.id_empresa = ?
             ORDER BY CASE WHEN m.fecha_salida IS NULL THEN 0 ELSE 1 END, m.fecha_entrada DESC
             LIMIT ? OFFSET ?`,
            [req.user.id_empresa, pageSize, offset]
        );

        const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM movimientos WHERE id_empresa = ?`, [req.user.id_empresa]);
        const total = countRows[0].total || 0;
        const hasNext = offset + pageSize < total;

        res.json({
            currentVehiclesByType,
            todayIncome: todayIncome[0].total,
            totalUsers: totalUsers[0].count,
            recentActivity,
            paging: { page, pageSize, total, hasNext }
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener las estadísticas del dashboard'
        });
    }
});

module.exports = router;
