const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');

// Obtener tarifa activa por tipo de vehículo para la empresa
async function obtenerTarifaActiva(idEmpresa, tipoVehiculo) {
    const [tarifas] = await pool.query(
        `SELECT * FROM tarifas 
         WHERE id_empresa = ? AND tipo_vehiculo = ? AND activa = TRUE 
         AND (fecha_vigencia_hasta IS NULL OR fecha_vigencia_hasta >= CURRENT_TIMESTAMP)
         ORDER BY fecha_vigencia_desde DESC LIMIT 1`,
        [idEmpresa, tipoVehiculo]
    );
    return tarifas[0] || null;
}

// Calcular total considerando modo de cobro y escalones
function calcularTotalMixto(minutos, tarifa) {
    const valorMin = Number(tarifa.valor_minuto);
    const valorHor = Number(tarifa.valor_hora);
    const valorDia = Number(tarifa.valor_dia_completo);
    const pasoMinAHr = Number(tarifa.paso_minutos_a_horas || 0);
    const pasoHrADia = Number(tarifa.paso_horas_a_dias || 0);
    const redHr = tarifa.redondeo_horas || 'arriba';
    const redDia = tarifa.redondeo_dias || 'arriba';

    let restante = minutos;
    let total = 0;
    let dias = 0, horas = 0, mins = 0;

    // Etapa minutos
    if (pasoMinAHr > 0 && restante > pasoMinAHr) {
        mins = pasoMinAHr;
        total += mins * valorMin;
        restante -= mins;
    } else {
        mins = restante;
        total += mins * valorMin;
        restante = 0;
    }

    // Etapa horas
    if (restante > 0) {
        let horasFloat = restante / 60;
        let horasCobrables = redHr === 'arriba' ? Math.ceil(horasFloat) : Math.floor(horasFloat);
        if (pasoHrADia > 0 && horasCobrables > pasoHrADia) {
            horasCobrables = pasoHrADia;
        }
        horas = horasCobrables;
        total += horas * valorHor;
        restante -= horas * 60;
    }

    // Etapa días
    if (restante > 0) {
        let diasFloat = restante / (24 * 60);
        let diasCobrables = redDia === 'arriba' ? Math.ceil(diasFloat) : Math.floor(diasFloat);
        dias = diasCobrables;
        total += dias * valorDia;
        restante = 0;
    }

    return { total: Number(total.toFixed(2)), dias, horas, minutos: mins };
}

function calcularTotal({ minutos, tarifa }) {
    const valorMin = Number(tarifa.valor_minuto);
    const valorHor = Number(tarifa.valor_hora);
    const valorDia = Number(tarifa.valor_dia_completo);
    const modo = tarifa.modo_cobro || 'mixto';

    if (modo === 'minuto') {
        return { total: Number((minutos * valorMin).toFixed(2)), dias: 0, horas: 0, minutos };
    }
    if (modo === 'hora') {
        const horas = Math.ceil(minutos / 60);
        return { total: Number((horas * valorHor).toFixed(2)), dias: 0, horas, minutos: minutos % 60 };
    }
    if (modo === 'dia') {
        const dias = Math.ceil(minutos / (24 * 60));
        return { total: Number((dias * valorDia).toFixed(2)), dias, horas: 0, minutos: minutos % (24*60) };
    }
    // mixto (escalonado)
    return calcularTotalMixto(minutos, tarifa);
}

// Registrar ingreso
router.post('/ingreso', verifyToken, async (req, res) => {
    try {
        const { placa, tipo } = req.body;
        const idEmpresa = req.user.id_empresa;

        if (!placa || !tipo) {
            return res.status(400).json({ success: false, message: 'Placa y tipo son obligatorios' });
        }

        const tarifa = await obtenerTarifaActiva(idEmpresa, tipo);
        if (!tarifa) {
            return res.status(400).json({ success: false, message: 'No hay tarifa activa para este tipo' });
        }

        // Crear vehículo si no existe
        const [vehiculos] = await pool.query(
            'SELECT id_vehiculo FROM vehiculos WHERE placa = ? AND id_empresa = ?',
            [placa, idEmpresa]
        );
        let idVehiculo;
        if (vehiculos.length === 0) {
            const [ins] = await pool.query(
                'INSERT INTO vehiculos (id_empresa, placa, tipo, color) VALUES (?, ?, ?, ?)',
                [idEmpresa, placa.toUpperCase(), tipo, 'N/A']
            );
            idVehiculo = ins.insertId;
        } else {
            idVehiculo = vehiculos[0].id_vehiculo;
        }

        // Verificar si ya está activo
        const [activos] = await pool.query(
            'SELECT id_movimiento FROM movimientos WHERE id_vehiculo = ? AND fecha_salida IS NULL',
            [idVehiculo]
        );
        if (activos.length > 0) {
            return res.status(409).json({ success: false, message: 'El vehículo ya está dentro' });
        }

        const [mov] = await pool.query(
            `INSERT INTO movimientos (id_empresa, id_vehiculo, id_tarifa, fecha_entrada, id_usuario_entrada, estado)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 'activo')`,
            [idEmpresa, idVehiculo, tarifa.id_tarifa, req.user.id]
        );

        const comprobante = {
            movimientoId: mov.insertId,
            placa: placa.toUpperCase(),
            tipo,
            fechaEntrada: new Date().toISOString(),
            tarifa: {
                valor_minuto: tarifa.valor_minuto,
                valor_hora: tarifa.valor_hora,
                valor_dia_completo: tarifa.valor_dia_completo
            }
        };

        res.status(201).json({ success: true, data: comprobante, message: 'Ingreso registrado' });
    } catch (error) {
        console.error('Error ingreso:', error);
        res.status(500).json({ success: false, message: 'Error al registrar ingreso' });
    }
});

// Registrar salida y calcular total
router.post('/salida', verifyToken, async (req, res) => {
    try {
        const { placa, metodoPago } = req.body;
        const idEmpresa = req.user.id_empresa;
        if (!placa) {
            return res.status(400).json({ success: false, message: 'Placa es obligatoria' });
        }

        const [vehiculos] = await pool.query(
            'SELECT id_vehiculo, tipo FROM vehiculos WHERE placa = ? AND id_empresa = ?',
            [placa, idEmpresa]
        );
        if (vehiculos.length === 0) {
            return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        }
        const vehiculo = vehiculos[0];

        const [movs] = await pool.query(
            'SELECT * FROM movimientos WHERE id_vehiculo = ? AND fecha_salida IS NULL',
            [vehiculo.id_vehiculo]
        );
        if (movs.length === 0) {
            return res.status(404).json({ success: false, message: 'El vehículo no tiene ingreso activo' });
        }
        const mov = movs[0];

        const tarifa = await obtenerTarifaActiva(idEmpresa, vehiculo.tipo);
        if (!tarifa) {
            return res.status(400).json({ success: false, message: 'No hay tarifa activa para este tipo' });
        }

        const [tiempo] = await pool.query(
            'SELECT TIMESTAMPDIFF(MINUTE, ?, CURRENT_TIMESTAMP) as minutos',
            [mov.fecha_entrada]
        );
        const minutos = tiempo[0].minutos;
        const { total, dias, horas, minutos: mins } = calcularTotal({ minutos, tarifa });

        await pool.query(
            `UPDATE movimientos SET fecha_salida = CURRENT_TIMESTAMP, total_a_pagar = ?, estado = 'finalizado', id_usuario_salida = ?
             WHERE id_movimiento = ?`,
            [total, req.user.id, mov.id_movimiento]
        );

        if (metodoPago) {
            await pool.query(
                `INSERT INTO pagos (id_empresa, id_movimiento, metodo_pago, monto, id_usuario)
                 VALUES (?, ?, ?, ?, ?)`,
                [idEmpresa, mov.id_movimiento, metodoPago, total, req.user.id]
            );
        }

        const factura = {
            movimientoId: mov.id_movimiento,
            placa: placa.toUpperCase(),
            tipo: vehiculo.tipo,
            fechaEntrada: mov.fecha_entrada,
            fechaSalida: new Date().toISOString(),
            detalleTiempo: { dias, horas, minutos: mins },
            tarifa: {
                valor_minuto: tarifa.valor_minuto,
                valor_hora: tarifa.valor_hora,
                valor_dia_completo: tarifa.valor_dia_completo
            },
            total
        };

        res.json({ success: true, data: factura, message: 'Salida registrada' });
    } catch (error) {
        console.error('Error salida:', error);
        res.status(500).json({ success: false, message: 'Error al registrar salida' });
    }
});

module.exports = router;

// Detalle por id_movimiento (para dashboard)
router.get('/detalle/:id', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT m.*, v.placa, v.tipo 
             FROM movimientos m 
             JOIN vehiculos v ON v.id_vehiculo = m.id_vehiculo
             WHERE m.id_movimiento = ?`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'No encontrado' });
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Error obteniendo detalle' });
    }
});

// Factura completa para reimpresión (incluye tarifa usada, tiempos y pagos)
router.get('/factura/:id', verifyToken, async (req, res) => {
    try {
        const idMov = Number(req.params.id);
        if (!idMov) return res.status(400).json({ success:false, message:'id inválido' });
        const [rows] = await pool.query(
            `SELECT m.*, v.placa, v.tipo, t.valor_minuto, t.valor_hora, t.valor_dia_completo
             FROM movimientos m
             JOIN vehiculos v ON v.id_vehiculo = m.id_vehiculo
             JOIN tarifas t ON t.id_tarifa = m.id_tarifa
             WHERE m.id_movimiento = ? AND m.id_empresa = ?`
            , [idMov, req.user.id_empresa]
        );
        if (rows.length === 0) return res.status(404).json({ success:false, message:'Movimiento no encontrado' });
        const m = rows[0];
        if (!m.fecha_salida) return res.status(400).json({ success:false, message:'Movimiento no finalizado' });
        // Calcular tiempos
        const fechaEntrada = new Date(m.fecha_entrada);
        const fechaSalida = new Date(m.fecha_salida);
        const diffMin = Math.max(0, Math.round((fechaSalida - fechaEntrada) / 60000));
        const dias = Math.floor(diffMin / (24*60));
        const remMin1 = diffMin % (24*60);
        const horas = Math.floor(remMin1 / 60);
        const minutos = remMin1 % 60;
        // Pagos
        const [pRows] = await pool.query(
            `SELECT metodo_pago, monto FROM pagos WHERE id_empresa = ? AND id_movimiento = ? ORDER BY id_pago ASC`,
            [req.user.id_empresa, idMov]
        );
        const factura = {
            movimientoId: m.id_movimiento,
            placa: m.placa,
            tipo: m.tipo,
            fechaEntrada: m.fecha_entrada,
            fechaSalida: m.fecha_salida,
            detalleTiempo: { dias, horas, minutos },
            tarifa: {
                valor_minuto: m.valor_minuto,
                valor_hora: m.valor_hora,
                valor_dia_completo: m.valor_dia_completo
            },
            total: Number(m.total_a_pagar||0),
            pagosList: pRows.map(p=>({ metodo_pago: p.metodo_pago, monto: Number(p.monto||0) }))
        };
        res.json({ success:true, data: factura });
    } catch (e) {
        console.error('movimientos/factura', e);
        res.status(500).json({ success:false, message:'Error obteniendo factura' });
    }
});


