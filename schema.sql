-- Esquema de Base de Datos para Sistema de Parqueadero Multi-Empresa
-- Gestor: MariaDB

-- Eliminar base de datos si existe y crearla nuevamente
DROP DATABASE IF EXISTS parqueadero;
CREATE DATABASE parqueadero CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE parqueadero;

-- Tabla de Empresas
CREATE TABLE empresas (
    id_empresa INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    nit VARCHAR(20) NOT NULL UNIQUE,
    direccion VARCHAR(200),
    telefono VARCHAR(20),
    email VARCHAR(100),
    logo_url LONGBLOB,
    activa BOOLEAN DEFAULT TRUE,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento DATETIME,
    plan ENUM('basico', 'premium', 'enterprise') NOT NULL,
    CONSTRAINT chk_plan CHECK (plan IN ('basico', 'premium', 'enterprise'))
) ENGINE=InnoDB;

-- Tabla de Usuarios del Sistema
CREATE TABLE usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    usuario_login VARCHAR(50) NOT NULL,
    contraseña VARCHAR(255) NOT NULL,
    rol ENUM('admin', 'operador') NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso DATETIME,
    FOREIGN KEY (id_empresa) REFERENCES empresas(id_empresa),
    CONSTRAINT chk_rol CHECK (rol IN ('admin', 'operador')),
    CONSTRAINT uq_usuario_empresa UNIQUE (usuario_login, id_empresa)
) ENGINE=InnoDB;

-- Tabla para registrar intentos de inicio de sesión
CREATE TABLE login_attempts (
    id_intento INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    usuario_login VARCHAR(50) NOT NULL,
    exitoso BOOLEAN NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    fecha_intento DATETIME NOT NULL,
    FOREIGN KEY (id_empresa) REFERENCES empresas(id_empresa),
    INDEX idx_usuario_login (usuario_login),
    INDEX idx_ip_address (ip_address),
    INDEX idx_fecha_intento (fecha_intento)
) ENGINE=InnoDB;

-- Tabla de Configuración por Empresa
CREATE TABLE configuracion_empresa (
    id_configuracion INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    capacidad_total_carros INT NOT NULL DEFAULT 50,
    capacidad_total_motos INT NOT NULL DEFAULT 30,
    capacidad_total_bicicletas INT NOT NULL DEFAULT 20,
    horario_apertura TIME DEFAULT '06:00:00',
    horario_cierre TIME DEFAULT '22:00:00',
    iva_porcentaje DECIMAL(5,2) DEFAULT 19.00,
    moneda VARCHAR(10) DEFAULT 'COP',
    zona_horaria VARCHAR(50) DEFAULT 'America/Bogota',
    operacion_24h BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (id_empresa) REFERENCES empresas(id_empresa)
) ENGINE=InnoDB;

-- Tabla de Vehículos
CREATE TABLE vehiculos (
    id_vehiculo INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    placa VARCHAR(10) NOT NULL,
    tipo ENUM('carro', 'moto', 'bici') NOT NULL,
    color VARCHAR(30) NOT NULL,
    modelo VARCHAR(50),
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_empresa) REFERENCES empresas(id_empresa),
    CONSTRAINT chk_tipo_vehiculo CHECK (tipo IN ('carro', 'moto', 'bici')),
    CONSTRAINT uq_placa_empresa UNIQUE (placa, id_empresa)
) ENGINE=InnoDB;

-- Tabla de Tarifas
CREATE TABLE tarifas (
    id_tarifa INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    tipo_vehiculo ENUM('carro', 'moto', 'bici') NOT NULL,
    valor_hora DECIMAL(10,2) NOT NULL,
    valor_minuto DECIMAL(10,2) NOT NULL,
    valor_dia_completo DECIMAL(10,2) NOT NULL,
    fecha_vigencia_desde DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_vigencia_hasta DATETIME,
    activa BOOLEAN DEFAULT TRUE,
    -- Configuración de cobro
    modo_cobro ENUM('minuto','hora','dia','mixto') NOT NULL DEFAULT 'mixto',
    paso_minutos_a_horas INT NOT NULL DEFAULT 0, -- 0 = sin paso
    paso_horas_a_dias INT NOT NULL DEFAULT 0,   -- 0 = sin paso
    redondeo_horas ENUM('arriba','exacto') NOT NULL DEFAULT 'arriba',
    redondeo_dias ENUM('arriba','exacto') NOT NULL DEFAULT 'arriba',
    FOREIGN KEY (id_empresa) REFERENCES empresas(id_empresa),
    CONSTRAINT chk_tipo_vehiculo_tarifa CHECK (tipo_vehiculo IN ('carro', 'moto', 'bici')),
    CONSTRAINT chk_valores_no_negativos CHECK (
        valor_hora >= 0 AND 
        valor_minuto >= 0 AND 
        valor_dia_completo >= 0
    )
) ENGINE=InnoDB;

-- Tabla de Entradas/Salidas (Movimientos)
CREATE TABLE movimientos (
    id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    id_vehiculo INT NOT NULL,
    fecha_entrada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_salida DATETIME,
    id_tarifa INT NOT NULL,
    total_a_pagar DECIMAL(10,2),
    id_usuario_entrada INT NOT NULL,
    id_usuario_salida INT,
    estado ENUM('activo', 'finalizado') DEFAULT 'activo',
    FOREIGN KEY (id_empresa) REFERENCES empresas(id_empresa),
    FOREIGN KEY (id_vehiculo) REFERENCES vehiculos(id_vehiculo),
    FOREIGN KEY (id_tarifa) REFERENCES tarifas(id_tarifa),
    FOREIGN KEY (id_usuario_entrada) REFERENCES usuarios(id_usuario),
    FOREIGN KEY (id_usuario_salida) REFERENCES usuarios(id_usuario),
    CONSTRAINT chk_fechas CHECK (fecha_salida IS NULL OR fecha_salida >= fecha_entrada)
) ENGINE=InnoDB;

-- Tabla de Pagos
CREATE TABLE pagos (
    id_pago INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    id_movimiento INT NOT NULL,
    metodo_pago ENUM('efectivo', 'tarjeta', 'QR') NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    fecha_pago DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    referencia_pago VARCHAR(100),
    id_usuario INT NOT NULL,
    FOREIGN KEY (id_empresa) REFERENCES empresas(id_empresa),
    FOREIGN KEY (id_movimiento) REFERENCES movimientos(id_movimiento),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    CONSTRAINT chk_metodo_pago CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'QR')),
    CONSTRAINT chk_monto_positivo CHECK (monto > 0)
) ENGINE=InnoDB;

-- Índices para optimización de consultas
CREATE INDEX idx_empresa_vehiculo ON vehiculos(id_empresa, placa);
CREATE INDEX idx_empresa_movimientos ON movimientos(id_empresa, fecha_entrada);
CREATE INDEX idx_empresa_pagos ON pagos(id_empresa, fecha_pago);

-- Vista de movimientos activos por empresa
CREATE VIEW v_movimientos_activos AS
SELECT 
    m.id_movimiento,
    m.id_empresa,
    v.placa,
    v.tipo,
    m.fecha_entrada,
    TIMEDIFF(CURRENT_TIMESTAMP, m.fecha_entrada) as tiempo_transcurrido,
    u.nombre as registrado_por
FROM movimientos m
JOIN vehiculos v ON m.id_vehiculo = v.id_vehiculo
JOIN usuarios u ON m.id_usuario_entrada = u.id_usuario
WHERE m.fecha_salida IS NULL;

-- Vista de ingresos por día por empresa
CREATE VIEW v_ingresos_diarios AS
SELECT 
    p.id_empresa,
    DATE(p.fecha_pago) as fecha,
    p.metodo_pago,
    COUNT(*) as cantidad_pagos,
    SUM(p.monto) as total_ingresos
FROM pagos p
GROUP BY p.id_empresa, DATE(p.fecha_pago), p.metodo_pago;

-- Procedimiento almacenado para calcular el total a pagar
DELIMITER //
CREATE PROCEDURE calcular_total_pagar(
    IN p_id_movimiento INT,
    IN p_id_empresa INT,
    OUT p_total DECIMAL(10,2)
)
BEGIN
    DECLARE v_fecha_entrada DATETIME;
    DECLARE v_fecha_salida DATETIME;
    DECLARE v_valor_hora DECIMAL(10,2);
    DECLARE v_valor_minuto DECIMAL(10,2);
    DECLARE v_valor_dia DECIMAL(10,2);
    DECLARE v_minutos INT;
    DECLARE v_dias INT;
    DECLARE v_horas INT;
    DECLARE v_minutos_restantes INT;
    
    -- Obtener datos necesarios
    SELECT 
        m.fecha_entrada,
        IFNULL(m.fecha_salida, CURRENT_TIMESTAMP),
        t.valor_hora,
        t.valor_minuto,
        t.valor_dia_completo
    INTO 
        v_fecha_entrada,
        v_fecha_salida,
        v_valor_hora,
        v_valor_minuto,
        v_valor_dia
    FROM movimientos m
    JOIN tarifas t ON m.id_tarifa = t.id_tarifa
    WHERE m.id_movimiento = p_id_movimiento 
    AND m.id_empresa = p_id_empresa;
    
    -- Calcular diferencia en minutos
    SET v_minutos = TIMESTAMPDIFF(MINUTE, v_fecha_entrada, v_fecha_salida);
    
    -- Calcular días, horas y minutos
    SET v_dias = FLOOR(v_minutos / (24 * 60));
    SET v_minutos_restantes = v_minutos % (24 * 60);
    SET v_horas = FLOOR(v_minutos_restantes / 60);
    SET v_minutos_restantes = v_minutos_restantes % 60;
    
    -- Calcular total
    SET p_total = (v_dias * v_valor_dia) + 
                  (v_horas * v_valor_hora) + 
                  (v_minutos_restantes * v_valor_minuto);
END //
DELIMITER ;

-- Tabla de Turnos de Caja por usuario
CREATE TABLE turnos (
    id_turno INT AUTO_INCREMENT PRIMARY KEY,
    id_empresa INT NOT NULL,
    id_usuario INT NOT NULL,
    fecha_apertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    base_inicial DECIMAL(12,2) NOT NULL,
    observacion_apertura VARCHAR(255),
    fecha_cierre DATETIME,
    total_efectivo DECIMAL(12,2),
    total_tarjeta DECIMAL(12,2),
    total_qr DECIMAL(12,2),
    total_general DECIMAL(12,2),
    diferencia DECIMAL(12,2),
    observacion_cierre VARCHAR(255),
    estado ENUM('abierto','cerrado') NOT NULL DEFAULT 'abierto',
    FOREIGN KEY (id_empresa) REFERENCES empresas(id_empresa),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    INDEX idx_turno_activo (id_empresa, id_usuario, estado)
) ENGINE=InnoDB;


-- Insertar empresa de ejemplo
INSERT INTO empresas (nombre, nit, direccion, telefono, email, plan)
VALUES ('Parqueadero Central', '900123456-7', 'Calle Principal #123', '3001234567', 'info@parqueaderocentral.com', 'premium');

-- Insertar configuración de la empresa
INSERT INTO configuracion_empresa (id_empresa, capacidad_total_carros, capacidad_total_motos, capacidad_total_bicicletas)
VALUES (1, 100, 50, 30);

-- Insertar usuario administrador por defecto
INSERT INTO usuarios (id_empresa, nombre, usuario_login, contraseña, rol)
VALUES (1, 'Administrador', 'admin', '$2a$10$8GB5OFGTizEbMiuu1TSDWeAls/TRzA0l8EjWyahpk6Y6wXDYmTai6', 'admin');
 
-- Tarifas de ejemplo por empresa 1
INSERT INTO tarifas (id_empresa, tipo_vehiculo, valor_hora, valor_minuto, valor_dia_completo, activa)
VALUES
(1, 'carro', 6000.00, 120.00, 30000.00, TRUE),
(1, 'moto', 3000.00, 60.00, 15000.00, TRUE),
(1, 'bici', 1500.00, 30.00, 8000.00, TRUE);