const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// Middleware de autenticación
router.use(auth);

async function getTurnoAbierto(id_empresa){
    const [rows] = await pool.query(
        'SELECT * FROM turnos WHERE id_empresa=? AND estado="abierto" ORDER BY fecha_apertura DESC LIMIT 1',
        [id_empresa]
    );
    return rows[0] || null;
}

async function getTotalesSistema(id_empresa, fecha_desde, fecha_hasta){
    const [rows] = await pool.query(
        `SELECT 
            SUM(CASE WHEN metodo_pago='efectivo' THEN monto ELSE 0 END) AS efectivo,
            SUM(CASE WHEN metodo_pago='tarjeta' THEN monto ELSE 0 END) AS tarjeta,
            SUM(CASE WHEN metodo_pago='QR' THEN monto ELSE 0 END) AS qr,
            SUM(monto) AS total
         FROM pagos
         WHERE id_empresa=? AND fecha_pago BETWEEN ? AND COALESCE(?, NOW())`,
        [id_empresa, fecha_desde, fecha_hasta || null]
    );
    const r = rows[0] || {};
    return {
        efectivo: Number(r.efectivo||0),
        tarjeta: Number(r.tarjeta||0),
        qr: Number(r.qr||0),
        total: Number(r.total||0)
    };
}

async function getConteoTickets(id_empresa, fecha_desde, fecha_hasta){
    const [rows] = await pool.query(
        `SELECT v.tipo, COUNT(*) as cnt
         FROM movimientos m
         JOIN vehiculos v ON v.id_vehiculo = m.id_vehiculo
         WHERE m.id_empresa=? AND m.estado='finalizado'
           AND m.fecha_salida BETWEEN ? AND COALESCE(?, NOW())
         GROUP BY v.tipo`,
        [id_empresa, fecha_desde, fecha_hasta || null]
    );
    const map = { carro:0, moto:0, bici:0 };
    rows.forEach(r=>{ if (map[r.tipo]!=null) map[r.tipo] = Number(r.cnt||0); });
    return { total: map.carro + map.moto + map.bici, porTipo: map };
}

// Obtener turno activo de la empresa
router.get('/actual', async (req, res) => {
    try{
        const { id_empresa } = req.user;
        const t = await getTurnoAbierto(id_empresa);
        res.json({ success:true, data: t });
    }catch(err){
        res.status(500).json({ success:false, message:'Error obteniendo turno' });
    }
});

// Resumen de totales del sistema desde la apertura del turno activo
router.get('/resumen', async (req, res) => {
    try{
        const { id_empresa } = req.user;
        const t = await getTurnoAbierto(id_empresa);
        if (!t) return res.status(400).json({ success:false, message:'No hay turno abierto' });
        const tot = await getTotalesSistema(id_empresa, t.fecha_apertura, t.fecha_cierre);
        const stats = await getConteoTickets(id_empresa, t.fecha_apertura, t.fecha_cierre);
        res.json({ success:true, data:{ turno:t, totales: tot, stats } });
    }catch(err){
        res.status(500).json({ success:false, message:'Error calculando totales' });
    }
});

// Abrir turno
router.post('/abrir', async (req, res) => {
    try{
        const { id_empresa, id: id_usuario } = req.user;
        const { base_inicial, observacion_apertura } = req.body;
        // Validar que no haya uno abierto
        const [abiertos] = await pool.query(
            'SELECT id_turno FROM turnos WHERE id_empresa=? AND estado="abierto"',
            [id_empresa]
        );
        if (abiertos.length){
            return res.status(400).json({ success:false, message:'Ya existe un turno abierto' });
        }
        const [result] = await pool.query(
            'INSERT INTO turnos (id_empresa,id_usuario,base_inicial,observacion_apertura) VALUES (?,?,?,?)',
            [id_empresa, id_usuario, Number(base_inicial||0), observacion_apertura||null]
        );
        res.json({ success:true, data:{ id_turno: result.insertId } });
    }catch(err){
        res.status(500).json({ success:false, message:'Error abriendo turno' });
    }
});

// Cerrar turno: calcula totales por método en rango [apertura, ahora]
router.post('/cerrar', async (req, res) => {
    try{
        const { id_empresa } = req.user;
        const { total_efectivo, total_tarjeta, total_qr, total_general, observacion_cierre } = req.body;
        const t = await getTurnoAbierto(id_empresa);
        if (!t){
            return res.status(400).json({ success:false, message:'No hay turno abierto' });
        }
        const id_turno = t.id_turno;
        const expected = await getTotalesSistema(id_empresa, t.fecha_apertura, t.fecha_cierre);
        const userTotals = {
            efectivo: Number(total_efectivo||0),
            tarjeta: Number(total_tarjeta||0),
            qr: Number(total_qr||0),
            total: Number(total_general||0)
        };
        const diff = Number((userTotals.total - expected.total).toFixed(2));
        await pool.query(
            'UPDATE turnos SET fecha_cierre=CURRENT_TIMESTAMP, total_efectivo=?, total_tarjeta=?, total_qr=?, total_general=?, diferencia=?, observacion_cierre=?, estado="cerrado" WHERE id_turno=?',
            [userTotals.efectivo, userTotals.tarjeta, userTotals.qr, userTotals.total, diff, observacion_cierre||null, id_turno]
        );
        const [fresh] = await pool.query('SELECT * FROM turnos WHERE id_turno=?', [id_turno]);
        const cierre = fresh[0];
        const stats = await getConteoTickets(id_empresa, t.fecha_apertura, cierre.fecha_cierre);
        res.json({ success:true, data:{ id_turno, base: t.base_inicial, expected, userTotals, diferencia: diff, stats, turno: { id_turno, usuario: req.user.nombre } } });
    }catch(err){
        res.status(500).json({ success:false, message:'Error cerrando turno' });
    }
});

// Detalle de turno + totales del sistema para reimpresión
router.get('/detalle/:id', async (req, res) => {
    try{
        const { id_empresa } = req.user;
        const id_turno = Number(req.params.id);
        const [rows] = await pool.query(
            `SELECT t.*, u.nombre AS usuario, u.usuario_login
             FROM turnos t
             JOIN usuarios u ON u.id_usuario = t.id_usuario
             WHERE t.id_empresa=? AND t.id_turno=?`,
            [id_empresa, id_turno]
        );
        if (!rows.length) return res.status(404).json({ success:false, message:'Turno no encontrado' });
        const t = rows[0];
        const expected = await getTotalesSistema(id_empresa, t.fecha_apertura, t.fecha_cierre);
        const stats = await getConteoTickets(id_empresa, t.fecha_apertura, t.fecha_cierre);
        res.json({ success:true, data:{ turno: t, expected, stats } });
    }catch(err){
        res.status(500).json({ success:false, message:'Error obteniendo detalle de turno' });
    }
});

module.exports = router;


