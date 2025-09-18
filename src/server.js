const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

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
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});

app.get('/admin/vehiculos', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/vehiculos.html'));
});

app.get('/admin/usuarios', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/usuarios.html'));
});

app.get('/operador/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});

app.get('/operador/vehiculos', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/vehiculos.html'));
});

// Rutas espejo con sufijo .html para compatibilidad con enlaces relativos
app.get('/operador/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});
app.get('/operador/vehiculos.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/vehiculos.html'));
});
app.get('/operador/ingreso-salida.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/ingreso-salida.html'));
});
app.get('/operador/ingreso-salida', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/ingreso-salida.html'));
});

app.get('/admin/reportes', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/reportes.html'));
});
app.get('/admin/reportes.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/reportes.html'));
});

app.get('/admin/configuracion', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/configuracion.html'));
});
app.get('/admin/configuracion.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/configuracion.html'));
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});