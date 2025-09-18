const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const bearerHeader = req.headers['authorization'];

    if (!bearerHeader) {
        return res.status(401).json({
            success: false,
            message: 'No se proporcionó token de acceso'
        });
    }

    try {
        const bearer = bearerHeader.split(' ');
        const token = bearer[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_jwt');
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Token inválido o expirado'
        });
    }
};

module.exports = verifyToken;
