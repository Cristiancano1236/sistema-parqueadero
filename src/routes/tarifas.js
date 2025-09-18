const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');

// Obtener tarifas activas por tipo para la empresa
router.get('/current', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM tarifas WHERE id_empresa = ? AND activa = TRUE ORDER BY tipo_vehiculo`,
            [req.user.id_empresa]
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Error al obtener tarifas' });
    }
});

// Actualizar/crear nueva vigencia de tarifa por tipo
router.put('/', verifyToken, async (req, res) => {
    try {
        let {
            tipo_vehiculo,
            valor_minuto,
            valor_hora,
            valor_dia_completo,
            modo_cobro = 'mixto',
            paso_minutos_a_horas = 0,
            paso_horas_a_dias = 0,
            redondeo_horas = 'arriba',
            redondeo_dias = 'arriba'
        } = req.body;

        if (!tipo_vehiculo) {
            return res.status(400).json({ success: false, message: 'tipo_vehiculo es requerido' });
        }

        // Normalizar segun modo
        valor_minuto = Number(valor_minuto||0);
        valor_hora = Number(valor_hora||0);
        valor_dia_completo = Number(valor_dia_completo||0);
        if (modo_cobro === 'minuto') {
            if (valor_minuto <= 0) return res.status(400).json({success:false,message:'Debe definir valor por minuto > 0'});
            valor_hora = 0; valor_dia_completo = 0; paso_minutos_a_horas = 0; paso_horas_a_dias = 0;
        } else if (modo_cobro === 'hora') {
            if (valor_hora <= 0) return res.status(400).json({success:false,message:'Debe definir valor por hora > 0'});
            valor_minuto = 0; valor_dia_completo = 0; paso_minutos_a_horas = 0; paso_horas_a_dias = 0;
        } else if (modo_cobro === 'dia') {
            if (valor_dia_completo <= 0) return res.status(400).json({success:false,message:'Debe definir valor por día > 0'});
            valor_minuto = 0; valor_hora = 0; paso_minutos_a_horas = 0; paso_horas_a_dias = 0;
        } else { // mixto
            if (valor_minuto <= 0 || valor_hora <= 0 || valor_dia_completo <= 0) {
                return res.status(400).json({success:false,message:'En modo mixto todos los valores deben ser > 0'});
            }
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            // Desactivar vigencia actual de ese tipo
            await conn.query(
                `UPDATE tarifas SET activa = FALSE, fecha_vigencia_hasta = CURRENT_TIMESTAMP
                 WHERE id_empresa = ? AND tipo_vehiculo = ? AND activa = TRUE`,
                [req.user.id_empresa, tipo_vehiculo]
            );
            // Insertar nueva
            const [ins] = await conn.query(
                `INSERT INTO tarifas (
                    id_empresa, tipo_vehiculo, valor_hora, valor_minuto, valor_dia_completo,
                    fecha_vigencia_desde, activa, modo_cobro, paso_minutos_a_horas, paso_horas_a_dias,
                    redondeo_horas, redondeo_dias
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, TRUE, ?, ?, ?, ?, ?)`,
                [
                    req.user.id_empresa,
                    tipo_vehiculo,
                    valor_hora,
                    valor_minuto,
                    valor_dia_completo,
                    modo_cobro,
                    paso_minutos_a_horas,
                    paso_horas_a_dias,
                    redondeo_horas,
                    redondeo_dias
                ]
            );
            await conn.commit();
            res.json({ success: true, id_tarifa: ins.insertId, message: 'Tarifa actualizada' });
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Error al guardar la tarifa' });
    }
});

module.exports = router;


