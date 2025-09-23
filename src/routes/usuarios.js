const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { sanitizeIdParam } = require('../utils/sanitize');

// Todas estas rutas requieren autenticación y rol admin
router.use(verifyToken, requireAdmin);

// Listar usuarios por empresa
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_usuario, nombre, usuario_login, rol, activo, ultimo_acceso
             FROM usuarios
             WHERE id_empresa = ?
             ORDER BY id_usuario DESC`,
            [req.user.id_empresa]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error listando usuarios' });
    }
});

// Crear usuario
router.post('/', async (req, res) => {
    try {
        const { nombre, usuario_login, contraseña, rol, activo } = req.body;
        if (!nombre || !usuario_login || !contraseña || !rol) {
            return res.status(400).json({ success: false, message: 'Datos incompletos' });
        }
        // Validaciones de negocio
        const usernameRegex = /^[A-Za-z0-9]+$/; // Solo letras y números, sin espacios ni guiones
        if (!usernameRegex.test(usuario_login)) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario solo puede contener letras y números, sin espacios ni guiones.' });
        }
        if (typeof contraseña !== 'string' || contraseña.length < 6) {
            return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
        }
        if (!['admin','operador'].includes(rol)) {
            return res.status(400).json({ success: false, message: 'Rol inválido. Debe ser admin u operador.' });
        }
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(contraseña, 10);
        const [result] = await pool.query(
            `INSERT INTO usuarios (id_empresa, nombre, usuario_login, contraseña, rol, activo)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id_empresa, nombre, usuario_login, hash, rol, activo !== false]
        );
        res.json({ success: true, data: { id_usuario: result.insertId }, message: 'Usuario creado' });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Usuario ya existe para esta empresa' });
        }
        res.status(500).json({ success: false, message: 'Error creando usuario' });
    }
});

// Actualizar usuario
router.put('/:id', sanitizeIdParam('id'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, usuario_login, contraseña, rol, activo } = req.body;
        // Construir set dinámico
        const fields = [];
        const values = [];
        if (nombre != null) { fields.push('nombre = ?'); values.push(nombre); }
        if (usuario_login != null) {
            const usernameRegex = /^[A-Za-z0-9]+$/;
            if (!usernameRegex.test(usuario_login)) {
                return res.status(400).json({ success: false, message: 'El nombre de usuario solo puede contener letras y números, sin espacios ni guiones.' });
            }
            fields.push('usuario_login = ?'); values.push(usuario_login);
        }
        if (rol != null) {
            if (!['admin','operador'].includes(rol)) {
                return res.status(400).json({ success: false, message: 'Rol inválido. Debe ser admin u operador.' });
            }
            fields.push('rol = ?'); values.push(rol);
        }
        if (activo != null) { fields.push('activo = ?'); values.push(!!activo); }
        if (contraseña) {
            if (typeof contraseña !== 'string' || contraseña.length < 6) {
                return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
            }
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(contraseña, 10);
            fields.push('contraseña = ?');
            values.push(hash);
        }
        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'Nada para actualizar' });
        }
        values.push(req.user.id_empresa, id);
        const [r] = await pool.query(
            `UPDATE usuarios SET ${fields.join(', ')} WHERE id_empresa = ? AND id_usuario = ?`,
            values
        );
        if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        res.json({ success: true, message: 'Usuario actualizado' });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Usuario ya existe para esta empresa' });
        }
        res.status(500).json({ success: false, message: 'Error actualizando usuario' });
    }
});

// Eliminar/Desactivar usuario (seguro: set activo=false)
router.delete('/:id', sanitizeIdParam('id'), async (req, res) => {
    try {
        const { id } = req.params;
        // No permitir que un admin se desactive a sí mismo
        if (Number(id) === Number(req.user.id)) {
            return res.status(400).json({ success: false, message: 'No puedes desactivar tu propio usuario' });
        }
        const [r] = await pool.query(
            `UPDATE usuarios SET activo = false WHERE id_empresa = ? AND id_usuario = ?`,
            [req.user.id_empresa, id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        res.json({ success: true, message: 'Usuario desactivado' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error desactivando usuario' });
    }
});

module.exports = router;


