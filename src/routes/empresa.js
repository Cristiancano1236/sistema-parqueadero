const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Configuración de subida en memoria para almacenar BLOB en BD
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Obtener info de la empresa del usuario autenticado
router.get('/me', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id_empresa, nombre, nit, direccion, telefono, email, logo_url, plan FROM empresas WHERE id_empresa = ? AND activa = TRUE',
            [req.user.id_empresa]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error empresa/me:', error);
        res.status(500).json({ success: false, message: 'Error al obtener la empresa' });
    }
});

// Obtener configuración de empresa (capacidades, horarios, IVA, moneda, tz)
// Relacionado con: public/admin/configuracion.html y public/js/configuracion.js
router.get('/config', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_configuracion, id_empresa, capacidad_total_carros, capacidad_total_motos, capacidad_total_bicicletas,
                    horario_apertura, horario_cierre, iva_porcentaje, moneda, zona_horaria, operacion_24h
             FROM configuracion_empresa
             WHERE id_empresa = ?`,
            [req.user.id_empresa]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Configuración no encontrada' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error empresa/config:', error);
        res.status(500).json({ success: false, message: 'Error al obtener la configuración' });
    }
});

// Actualizar datos básicos de la empresa (solo admin)
router.put('/', verifyToken, requireAdmin, async (req, res) => {
    try {
        const { nombre, nit, direccion, telefono, email, logo_url } = req.body;
        const fields = [];
        const values = [];
        if (nombre != null) { fields.push('nombre = ?'); values.push(nombre); }
        if (nit != null) { fields.push('nit = ?'); values.push(nit); }
        if (direccion != null) { fields.push('direccion = ?'); values.push(direccion); }
        if (telefono != null) { fields.push('telefono = ?'); values.push(telefono); }
        if (email != null) { fields.push('email = ?'); values.push(email); }
        if (logo_url != null) { fields.push('logo_url = ?'); values.push(logo_url); }
        if (fields.length === 0) return res.status(400).json({ success:false, message:'Nada para actualizar' });
        values.push(req.user.id_empresa);
        const [r] = await pool.query(
            `UPDATE empresas SET ${fields.join(', ')} WHERE id_empresa = ?`,
            values
        );
        if (r.affectedRows === 0) return res.status(404).json({ success:false, message:'Empresa no encontrada' });
        res.json({ success:true, message:'Empresa actualizada' });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success:false, message:'El NIT ya está registrado' });
        }
        console.error('Error actualizando empresa:', error);
        res.status(500).json({ success:false, message:'Error al actualizar empresa' });
    }
});

// Actualizar configuración de la empresa (solo admin)
router.put('/config', verifyToken, requireAdmin, async (req, res) => {
    try {
        const {
            capacidad_total_carros,
            capacidad_total_motos,
            capacidad_total_bicicletas,
            horario_apertura,
            horario_cierre,
            iva_porcentaje,
            moneda,
            zona_horaria,
            operacion_24h
        } = req.body;
        const fields = [];
        const values = [];
        if (capacidad_total_carros != null) { fields.push('capacidad_total_carros = ?'); values.push(Number(capacidad_total_carros)); }
        if (capacidad_total_motos != null) { fields.push('capacidad_total_motos = ?'); values.push(Number(capacidad_total_motos)); }
        if (capacidad_total_bicicletas != null) { fields.push('capacidad_total_bicicletas = ?'); values.push(Number(capacidad_total_bicicletas)); }
        if (horario_apertura != null) { fields.push('horario_apertura = ?'); values.push(horario_apertura); }
        if (horario_cierre != null) { fields.push('horario_cierre = ?'); values.push(horario_cierre); }
        if (iva_porcentaje != null) { fields.push('iva_porcentaje = ?'); values.push(Number(iva_porcentaje)); }
        if (moneda != null) { fields.push('moneda = ?'); values.push(moneda); }
        if (zona_horaria != null) { fields.push('zona_horaria = ?'); values.push(zona_horaria); }
        if (operacion_24h != null) { fields.push('operacion_24h = ?'); values.push(!!operacion_24h); }
        if (fields.length === 0) return res.status(400).json({ success:false, message:'Nada para actualizar' });
        values.push(req.user.id_empresa);
        const [r] = await pool.query(
            `UPDATE configuracion_empresa SET ${fields.join(', ')} WHERE id_empresa = ?`,
            values
        );
        if (r.affectedRows === 0) return res.status(404).json({ success:false, message:'Configuración no encontrada' });
        res.json({ success:true, message:'Configuración actualizada' });
    } catch (error) {
        console.error('Error actualizando configuración:', error);
        res.status(500).json({ success:false, message:'Error al actualizar configuración' });
    }
});

// Endpoint para obtener el logo como imagen desde BLOB (almacenado en empresas.logo_url)
router.get('/logo', verifyToken, async (req, res) => {
    try {
        // Leer desde empresas.logo_url (LONGBLOB)
        const [rows] = await pool.query('SELECT logo_url FROM empresas WHERE id_empresa = ?', [req.user.id_empresa]);
        if (!rows.length || rows[0].logo_url == null) return res.status(404).json({ success:false, message:'Logo no configurado' });
        const buf = rows[0].logo_url; // Buffer
        // Detección simple de tipo
        let mime = 'image/png';
        if (Buffer.isBuffer(buf)) {
            const b0 = buf[0], b1 = buf[1], b2 = buf[2], b3 = buf[3];
            if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) mime = 'image/jpeg';
            else if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) mime = 'image/png';
            else if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46 && b3 === 0x38) mime = 'image/gif';
        }
        res.set('Content-Type', mime);
        res.send(buf);
    } catch (error) {
        console.error('Error leyendo logo:', error);
        res.status(500).json({ success:false, message:'Error al obtener logo' });
    }
});

// Subir logo de empresa (solo admin). Guarda como BLOB y elimina archivo anterior si existía en disco
router.post('/logo', verifyToken, requireAdmin, upload.single('logo'), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) return res.status(400).json({ success:false, message:'Archivo no recibido' });
        // Validación de tipo (PNG/JPG/JPEG/GIF)
        const mimeAllowed = ['image/png','image/jpeg','image/jpg','image/gif'];
        if (!mimeAllowed.includes(req.file.mimetype)) {
            return res.status(400).json({ success:false, message:'Tipo de archivo no permitido. Usa PNG o JPG.' });
        }
        // Migración: asegurar tipo BLOB en empresas.logo_url
        try {
            await pool.query('ALTER TABLE empresas MODIFY COLUMN logo_url LONGBLOB NULL');
        } catch (e) { /* ignorar si ya es BLOB */ }
        // Leer valor previo para borrar archivo local si era ruta
        const [prev] = await pool.query('SELECT logo_url FROM empresas WHERE id_empresa = ?', [req.user.id_empresa]);
        const oldVal = prev && prev[0] && prev[0].logo_url;
        if (oldVal && typeof oldVal === 'string' && oldVal.startsWith('/uploads/logos/')) {
            const oldPath = path.join(__dirname, '../../public', oldVal);
            try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch(e) { console.warn('No se pudo eliminar logo previo:', e.message); }
        }
        // Guardar BLOB en empresas.logo_url
        await pool.query('UPDATE empresas SET logo_url = ? WHERE id_empresa = ?', [req.file.buffer, req.user.id_empresa]);
        res.json({ success:true, url: `/api/empresa/logo?ts=${Date.now()}`, message:'Logo subido y guardado' });
    } catch (error) {
        if (error && error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success:false, message:'El archivo excede 2MB' });
        }
        console.error('Error subiendo logo:', error);
        res.status(500).json({ success:false, message:'Error al subir logo' });
    }
});

module.exports = router;


