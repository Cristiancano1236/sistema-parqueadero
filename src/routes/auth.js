const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const validateLoginData = require('../middleware/validateLogin');

// Middleware para registrar intentos de inicio de sesión
const logLoginAttempt = async (id_empresa, usuario, exitoso, ip) => {
    try {
        const query = `
            INSERT INTO login_attempts (id_empresa, usuario_login, exitoso, ip_address, fecha_intento)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        await pool.query(query, [id_empresa, usuario, exitoso, ip]);
    } catch (error) {
        console.error('Error al registrar intento de login:', error);
    }
};

// Verificar intentos fallidos
const checkFailedAttempts = async (id_empresa, usuario, ip) => {
    try {
        const [attempts] = await pool.query(
            `SELECT COUNT(*) as count 
             FROM login_attempts 
             WHERE id_empresa = ?
             AND (usuario_login = ? OR ip_address = ?) 
             AND exitoso = false 
             AND fecha_intento > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
            [id_empresa, usuario, ip]
        );
        return attempts[0].count;
    } catch (error) {
        console.error('Error al verificar intentos fallidos:', error);
        return 0;
    }
};

router.post('/login', validateLoginData, async (req, res) => {
    const { empresa, usuario, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    try {
        // Buscar la empresa
        const [empresas] = await pool.query(
            'SELECT id_empresa FROM empresas WHERE nit = ? AND activa = true',
            [empresa]
        );

        if (empresas.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Empresa no encontrada o inactiva'
            });
        }

        const id_empresa = empresas[0].id_empresa;

        // Verificar intentos fallidos
        const failedAttempts = await checkFailedAttempts(id_empresa, usuario, ip);
        if (failedAttempts >= 5) {
            await logLoginAttempt(id_empresa, usuario, false, ip);
            return res.status(429).json({
                success: false,
                message: 'Demasiados intentos fallidos. Por favor, intente más tarde.'
            });
        }

        // Buscar usuario en la base de datos
        const [users] = await pool.query(
            'SELECT * FROM usuarios WHERE usuario_login = ? AND id_empresa = ? AND activo = true',
            [usuario, id_empresa]
        );

        if (users.length === 0) {
            await logLoginAttempt(id_empresa, usuario, false, ip);
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }

        const user = users[0];

        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.contraseña);
        if (!validPassword) {
            await logLoginAttempt(id_empresa, usuario, false, ip);
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }

        // Obtener configuración de la empresa
        const [config] = await pool.query(
            'SELECT * FROM configuracion_empresa WHERE id_empresa = ?',
            [id_empresa]
        );

        // Generar token JWT
        const token = jwt.sign(
            { 
                id: user.id_usuario,
                nombre: user.nombre,
                rol: user.rol,
                id_empresa: user.id_empresa,
                empresa: empresas[0]
            },
            process.env.JWT_SECRET || 'tu_secreto_jwt',
            { expiresIn: '8h' }
        );

        // Actualizar último acceso
        await pool.query(
            'UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id_usuario = ?',
            [user.id_usuario]
        );

        // Registrar inicio de sesión exitoso
        await logLoginAttempt(id_empresa, usuario, true, ip);

        // Enviar respuesta exitosa
        res.json({
            success: true,
            data: {
                id: user.id_usuario,
                nombre: user.nombre,
                rol: user.rol,
                id_empresa: user.id_empresa,
                empresa: empresas[0],
                config: config[0],
                token
            },
            message: 'Inicio de sesión exitoso'
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor'
        });
    }
});

module.exports = router;