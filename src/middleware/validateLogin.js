// Middleware para validar los datos del login
const validateLoginData = (req, res, next) => {
    const { usuario, password } = req.body;

    // Validar que se proporcionen todos los campos
    if (!usuario || !password) {
        return res.status(400).json({
            success: false,
            message: 'Todos los campos son obligatorios'
        });
    }

    // Validar longitud del usuario
    if (usuario.length < 3 || usuario.length > 50) {
        return res.status(400).json({
            success: false,
            message: 'El usuario debe tener entre 3 y 50 caracteres'
        });
    }

    // Validar longitud de la contraseña
    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'La contraseña debe tener al menos 6 caracteres'
        });
    }

    // Validar caracteres permitidos en el usuario
    const usuarioRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!usuarioRegex.test(usuario)) {
        return res.status(400).json({
            success: false,
            message: 'El usuario solo puede contener letras, números, guiones y puntos'
        });
    }

    next();
};

module.exports = validateLoginData;
