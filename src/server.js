const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Determina ruta base según entorno (desarrollo vs ejecutable pkg)
// Cuando se empaqueta con pkg, process.pkg existe y el ejecutable vive en process.execPath
// Esto permite servir la carpeta "public" que se copiará junto al .exe en dist/public
const isPackaged = !!process.pkg;
const basePath = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
const publicDir = path.join(basePath, 'public');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

// Rutas API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehiculos', require('./routes/vehiculos'));
app.use('/api/movimientos', require('./routes/movimientos'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/empresa', require('./routes/empresa'));
app.use('/api/tarifas', require('./routes/tarifas'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/turnos', require('./routes/turnos'));

// Rutas de vistas
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/dashboard.html'));
});

app.get('/admin/vehiculos', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/vehiculos.html'));
});

app.get('/admin/usuarios', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/usuarios.html'));
});

app.get('/operador/dashboard', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/dashboard.html'));
});

app.get('/operador/vehiculos', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/vehiculos.html'));
});

// Rutas espejo con sufijo .html para compatibilidad con enlaces relativos
app.get('/operador/dashboard.html', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/dashboard.html'));
});
app.get('/operador/vehiculos.html', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/vehiculos.html'));
});
app.get('/operador/ingreso-salida.html', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/ingreso-salida.html'));
});
app.get('/operador/ingreso-salida', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/ingreso-salida.html'));
});

app.get('/admin/reportes', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/reportes.html'));
});
app.get('/admin/reportes.html', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/reportes.html'));
});

app.get('/admin/configuracion', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/configuracion.html'));
});
app.get('/admin/configuracion.html', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin/configuracion.html'));
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).sendFile(path.join(publicDir, '404.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});