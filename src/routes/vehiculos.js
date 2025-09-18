const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');

// Middleware para verificar si el vehículo pertenece a la empresa del usuario
async function verificarPropiedadVehiculo(req, res, next) {
    try {
        const [vehiculo] = await pool.query(
            'SELECT id_vehiculo FROM vehiculos WHERE id_vehiculo = ? AND id_empresa = ?',
            [req.params.id, req.user.id_empresa]
        );

        if (vehiculo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Vehículo no encontrado'
            });
        }

        next();
    } catch (error) {
        console.error('Error al verificar propiedad del vehículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al verificar propiedad del vehículo'
        });
    }
}

// Obtener todos los vehículos de la empresa
router.get('/', verifyToken, async (req, res) => {
    try {
        const [vehiculos] = await pool.query(
            `SELECT v.*, 
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 
                            FROM movimientos m 
                            WHERE m.id_vehiculo = v.id_vehiculo 
                            AND m.fecha_salida IS NULL
                        ) THEN 'activo'
                        ELSE 'inactivo'
                    END as estado
             FROM vehiculos v
             WHERE v.id_empresa = ?
             ORDER BY v.fecha_registro DESC`,
            [req.user.id_empresa]
        );

        res.json(vehiculos);
    } catch (error) {
        console.error('Error al obtener vehículos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener los vehículos'
        });
    }
});

// Obtener un vehículo específico
router.get('/:id', verifyToken, verificarPropiedadVehiculo, async (req, res) => {
    try {
        const [vehiculos] = await pool.query(
            'SELECT * FROM vehiculos WHERE id_vehiculo = ? AND id_empresa = ?',
            [req.params.id, req.user.id_empresa]
        );

        res.json(vehiculos[0]);
    } catch (error) {
        console.error('Error al obtener vehículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener el vehículo'
        });
    }
});

// Historial de movimientos de un vehículo
router.get('/:id/historial', verifyToken, verificarPropiedadVehiculo, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT 
                m.id_movimiento,
                m.fecha_entrada,
                m.fecha_salida,
                m.total_a_pagar,
                m.estado,
                t.tipo_vehiculo,
                COALESCE(SUM(p.monto), 0) AS total_pagado,
                COUNT(p.id_pago) AS pagos
             FROM movimientos m
             JOIN tarifas t ON t.id_tarifa = m.id_tarifa
             LEFT JOIN pagos p ON p.id_movimiento = m.id_movimiento
             WHERE m.id_vehiculo = ?
             GROUP BY m.id_movimiento, m.fecha_entrada, m.fecha_salida, m.total_a_pagar, m.estado, t.tipo_vehiculo
             ORDER BY m.fecha_entrada DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener historial:', error);
        res.status(500).json({ success: false, message: 'Error al obtener historial' });
    }
});

// Crear nuevo vehículo
router.post('/', verifyToken, async (req, res) => {
    try {
        const { placa, tipo, color, modelo } = req.body;

        // Verificar si la placa ya existe en la empresa
        const [existente] = await pool.query(
            'SELECT id_vehiculo FROM vehiculos WHERE placa = ? AND id_empresa = ?',
            [placa, req.user.id_empresa]
        );

        if (existente.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un vehículo con esta placa'
            });
        }

        // Insertar nuevo vehículo
        const [result] = await pool.query(
            `INSERT INTO vehiculos (id_empresa, placa, tipo, color, modelo)
             VALUES (?, ?, ?, ?, ?)`,
            [req.user.id_empresa, placa, tipo, color, modelo]
        );

        res.status(201).json({
            success: true,
            message: 'Vehículo registrado exitosamente',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error al crear vehículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar el vehículo'
        });
    }
});

// Actualizar vehículo
router.put('/:id', verifyToken, verificarPropiedadVehiculo, async (req, res) => {
    try {
        const { placa, tipo, color, modelo } = req.body;

        // Verificar si la nueva placa ya existe (excluyendo el vehículo actual)
        const [existente] = await pool.query(
            'SELECT id_vehiculo FROM vehiculos WHERE placa = ? AND id_empresa = ? AND id_vehiculo != ?',
            [placa, req.user.id_empresa, req.params.id]
        );

        if (existente.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe otro vehículo con esta placa'
            });
        }

        // Actualizar vehículo
        await pool.query(
            `UPDATE vehiculos 
             SET placa = ?, tipo = ?, color = ?, modelo = ?
             WHERE id_vehiculo = ? AND id_empresa = ?`,
            [placa, tipo, color, modelo, req.params.id, req.user.id_empresa]
        );

        res.json({
            success: true,
            message: 'Vehículo actualizado exitosamente'
        });
    } catch (error) {
        console.error('Error al actualizar vehículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar el vehículo'
        });
    }
});

// Eliminar vehículo
router.delete('/:id', verifyToken, verificarPropiedadVehiculo, async (req, res) => {
    try {
        // Verificar si el vehículo tiene movimientos activos
        const [movimientos] = await pool.query(
            'SELECT id_movimiento FROM movimientos WHERE id_vehiculo = ? AND fecha_salida IS NULL',
            [req.params.id]
        );

        if (movimientos.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar un vehículo con movimientos activos'
            });
        }

        // Eliminar vehículo
        await pool.query(
            'DELETE FROM vehiculos WHERE id_vehiculo = ? AND id_empresa = ?',
            [req.params.id, req.user.id_empresa]
        );

        res.json({
            success: true,
            message: 'Vehículo eliminado exitosamente'
        });
    } catch (error) {
        console.error('Error al eliminar vehículo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar el vehículo'
        });
    }
});

module.exports = router;
