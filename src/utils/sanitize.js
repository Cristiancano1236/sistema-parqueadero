const allowedVehiculoTipos = new Set(['carro', 'moto', 'bici']);

// Valida y normaliza enteros seguros (por ejemplo, page, pageSize, limit, offsets)
function toSafeInt(value, { min = 0, max = 100000, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

// Normaliza texto para LIKE (escapa % y _), opcionalmente mayúsculas
function toSafeLike(value, { uppercase = true } = {}) {
  if (typeof value !== 'string') return null;
  const v = uppercase ? value.toUpperCase() : value;
  // Escapar comodines SQL
  const escaped = v.replace(/[%_]/g, ch => `\\${ch}`);
  return `%${escaped}%`;
}

// Valida tipo de vehículo contra lista blanca
function toSafeTipoVehiculo(value) {
  if (typeof value !== 'string') return null;
  const v = value.toLowerCase();
  return allowedVehiculoTipos.has(v) ? v : null;
}

// Middleware generador para filtros comunes de reportes
function sanitizeReportFilters(req, res, next) {
  try {
    const q = req.query || {};
    const desde = typeof q.desde === 'string' && q.desde.length >= 8 ? q.desde : new Date().toISOString().slice(0, 10);
    const hasta = typeof q.hasta === 'string' && q.hasta.length >= 8 ? q.hasta : new Date().toISOString().slice(0, 10);
    const estado = q.estado === 'activo' ? 'activo' : (q.estado === 'finalizado' ? 'finalizado' : null);
    const tipo = toSafeTipoVehiculo(q.tipo);
    const placaLike = q.placa ? toSafeLike(String(q.placa)) : null;
    const page = toSafeInt(q.page, { min: 0, max: 100000, fallback: 0 });
    const pageSize = toSafeInt(q.pageSize, { min: 1, max: 100, fallback: 20 });
    const limit = toSafeInt(q.limit, { min: 1, max: 5000, fallback: 1000 });

    req.sanitized = Object.assign({}, req.sanitized, {
      desde, hasta, estado, tipo, placaLike, page, pageSize, limit
    });
    next();
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Parámetros inválidos' });
  }
}

// Middleware para params numéricos :id
function sanitizeIdParam(paramName = 'id') {
  return function (req, res, next) {
    const raw = req.params && req.params[paramName];
    const id = toSafeInt(raw, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
    if (!id) return res.status(400).json({ success: false, message: `${paramName} inválido` });
    req.params[paramName] = id;
    next();
  };
}

module.exports = {
  toSafeInt,
  toSafeLike,
  toSafeTipoVehiculo,
  sanitizeReportFilters,
  sanitizeIdParam,
};


