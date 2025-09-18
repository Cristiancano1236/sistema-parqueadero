// Middleware: valida que el usuario tenga rol administrador
// Relación: usado por rutas protegidas como usuarios, tarifas de administración, reportes
module.exports = function requireAdmin(req, res, next) {
    try {
        const role = req.user && req.user.rol;
        if (role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Requiere rol administrador' });
        }
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
};


