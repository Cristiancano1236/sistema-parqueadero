## Sistema de Parqueadero (Multi-empresa)

Aplicación Node.js + Express para gestionar parqueaderos con múltiples empresas, usuarios y operaciones de ingreso/salida de vehículos, tarifas, pagos, reportes y turnos de caja. Incluye una interfaz estática en `public/` servida por el mismo servidor.

### Características
- Autenticación por JWT con control de intentos de login por IP/usuario.
- Multi-empresa: aislamiento por `id_empresa` en todas las operaciones.
- Gestión de vehículos, movimientos (ingresos/salidas), tarifas (minuto/hora/día/mixto).
- Pagos por movimiento con métodos: efectivo, tarjeta y QR.
- Reportes (KPIs, series por día, por método, exportación a Excel), dashboard con estadísticos.
- Turnos de caja: apertura/cierre, totales por método, diferencias, exportación.
- Subida y servido de logo de empresa como BLOB (sin depender de disco).

### Requisitos
- Node.js 18+ y npm
- MariaDB/MySQL 10.4+ (probado con MariaDB)

### Instalación
1. Clonar el repositorio
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Configurar variables de entorno creando un archivo `.env` en la raíz:
   ```env
   # Puerto del servidor
   PORT=3000

   # JWT
   JWT_SECRET=tu_secreto_jwt

   # Base de datos
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=parqueadero
   ```
4. Crear la base de datos y datos iniciales ejecutando el script SQL:
   - Abra su cliente de MariaDB/MySQL y ejecute el contenido de `schema.sql`.
   - Esto creará la BD `parqueadero`, tablas, vistas, procedimiento y datos de ejemplo:
     - Empresa: "Parqueadero Central" (id 1)
     - Usuario admin: usuario `admin` con contraseña `admin123` (hash ya incluido)
     - Tarifas base para carro/moto/bici

### Ejecución
- Desarrollo (con recarga si usa nodemon):
  ```bash
  npm run dev
  ```
- Producción:
  ```bash
  npm start
  ```
El servidor sirve la UI desde `public/` y expone la API bajo `/api/*`.

Página principal: `GET /` -> `public/index.html`

### Estructura del proyecto
```
src/
  server.js            # Configura Express, CORS, JSON y rutas, sirve /public
  config/db.js         # Pool MySQL/MariaDB usando mysql2/promise
  middleware/
    auth.js            # Verifica JWT en Authorization: Bearer <token>
    requireAdmin.js    # Exige rol admin
    validateLogin.js   # Valida payload de login
  routes/
    auth.js            # POST /api/auth/login
    vehiculos.js       # CRUD + historial, scoping por empresa
    movimientos.js     # Ingreso, salida (cálculo), factura/detalle
    tarifas.js         # Consulta y actualización de vigencias
    reportes.js        # KPIs, series, tablas, exportaciones a Excel
    dashboard.js       # Estadísticas del tablero
    turnos.js          # Apertura/cierre, resumen y detalle
    empresa.js         # Perfil y configuración de empresa, logo BLOB
public/
  index.html           # Landing/login
  admin/*.html         # Vistas de administración/operación
  js/*.js, css/*.css   # Recursos de UI
schema.sql             # Esquema, vistas, procedimiento y datos seed
```

### Autenticación
- Login: `POST /api/auth/login`
  - Body: `{ empresa: <NIT>, usuario: <string>, password: <string> }`
  - Valida intentos fallidos por ventana de 15 minutos y guarda auditoría en `login_attempts`.
  - Respuesta exitosa: `{ success, data: { token, ... }, message }`.
- Para acceder al resto de endpoints, incluya el header `Authorization: Bearer <token>`.

### Variables de entorno
- `PORT`: Puerto del servidor (default 3000)
- `JWT_SECRET`: Secreto para firmar/verificar JWT
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Conexión a la BD

### Endpoints principales (resumen)
- Vehículos `/api/vehiculos` (requiere token)
  - `GET /` listar por empresa
  - `GET /:id` obtener detalle
  - `GET /:id/historial` historial de movimientos + pagos
  - `POST /` crear
  - `PUT /:id` actualizar
  - `DELETE /:id` eliminar (si no tiene movimiento activo)
- Movimientos `/api/movimientos` (requiere token)
  - `POST /ingreso` registrar ingreso (auto-crea vehículo si no existe)
  - `POST /salida` registrar salida, calcula total y opcionalmente registra pago
  - `GET /detalle/:id` detalle
  - `GET /factura/:id` factura completa (para reimpresión)
- Tarifas `/api/tarifas` (requiere token; actualización típica para admin)
  - `GET /current` tarifas activas por tipo
  - `PUT /` crear nueva vigencia (desactiva la anterior del tipo)
- Reportes `/api/reportes` (requiere token)
  - `GET /kpis` KPIs del periodo
  - `GET /ingresos-por-dia` serie temporal total o por método
  - `GET /ingresos-por-metodo` distribución por método
  - `GET /movimientos` tabla paginada/filtrada
  - `GET /movimientos-ajustados` tabla con columnas por método prorrateadas
  - `GET /turnos` cierres de turno
  - `GET /turnos/export/xlsx` y `GET /export/xlsx` exportaciones a Excel
- Dashboard `/api/dashboard/stats` (requiere token)
- Turnos `/api/turnos` (requiere token)
  - `GET /actual` turno abierto
  - `GET /resumen` totales desde la apertura
  - `POST /abrir` abrir turno
  - `POST /cerrar` cerrar turno con totales del usuario
- Empresa `/api/empresa` (requiere token; admin para cambios)
  - `GET /me` datos de empresa
  - `GET /config` configuración operativa
  - `PUT /` actualizar datos básicos (admin)
  - `PUT /config` actualizar configuración (admin)
  - `GET /logo` devuelve logo (BLOB)
  - `POST /logo` subir logo (admin). Form field: `logo`

### Flujo típico de uso
1. Ejecutar `schema.sql` en MariaDB/MySQL.
2. Iniciar el servidor con `.env` configurado.
3. Ingresar con NIT de la empresa (seed) y usuario `admin`.
4. Ajustar tarifas según política (minuto/hora/día/mixto).
5. Registrar ingresos/salidas y pagos.
6. Consultar dashboard y reportes, exportar a Excel.
7. Abrir/cerrar turnos para control de caja.

### Scripts npm
- `npm start`: inicia servidor en `PORT`
- `npm run dev`: inicia con nodemon

### Notas
- `public/uploads/` (si existía en versiones previas) está ignorado; actualmente el logo se almacena como BLOB.
- Asegúrese de configurar `JWT_SECRET` en producción.

### Licencia
ISC © Ciscode


