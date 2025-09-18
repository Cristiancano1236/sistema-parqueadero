const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');

// Insertar múltiples pagos para un movimiento ya finalizado
router.post('/bulk', verifyToken, async (req, res) => {
    try {
        const { id_movimiento, pagos } = req.body;
        if (!id_movimiento || !Array.isArray(pagos) || pagos.length === 0) {
            return res.status(400).json({ success:false, message:'Datos de pago inválidos' });
        }

        // Verificar que el movimiento corresponda a la empresa del usuario
        const [movs] = await pool.query(
            `SELECT m.id_movimiento, m.id_empresa FROM movimientos m WHERE m.id_movimiento = ?`,
            [id_movimiento]
        );
        if (movs.length === 0 || movs[0].id_empresa !== req.user.id_empresa) {
            return res.status(404).json({ success:false, message:'Movimiento no encontrado' });
        }

        // Insertar pagos
        const values = pagos
            .filter(p => p && p.metodo_pago && Number(p.monto) > 0)
            .map(p => [req.user.id_empresa, id_movimiento, p.metodo_pago, Number(p.monto), req.user.id]);

        if (values.length === 0) {
            return res.status(400).json({ success:false, message:'No hay pagos válidos' });
        }

        await pool.query(
            `INSERT INTO pagos (id_empresa, id_movimiento, metodo_pago, monto, id_usuario)
             VALUES ?`, [values]
        );

        res.json({ success:true, message:'Pagos registrados' });
    } catch (e) {
        console.error('Error bulk pagos:', e);
        res.status(500).json({ success:false, message:'Error al registrar pagos' });
    }
});

module.exports = router;


