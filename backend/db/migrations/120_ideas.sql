-- =============================================
-- 120 — Ideas para Bóveda (buzón de mejoras)
-- =============================================
-- Pedido de Marcos y Mauricio (2026-10-14): que cualquier usuario proponga una
-- mejora del sistema desde cualquier pantalla, y que les llegue a ellos dos con
-- nombre y contexto para revisarlas una a una y aceptarlas o desecharlas.
--
-- Reglas de producto (ver docs/reglas/ideas.md):
--   · Con nombre, nunca anónimas.
--   · Mejoras del sistema, no mañas: la idea exige el PROBLEMA de hoy, cada cuánto
--     pasa, a quién afecta y qué se ganaría. "Algo no funciona" pide qué hacía,
--     qué pasó y qué esperaba.
--   · Sin adjuntos (decisión 14-10: no ocupar espacio). Solo texto: ~1–2 KB por idea.
--   · Sin plazos: se revisan cuando hay tiempo. El autor ve el estado en "Mis ideas".
--
-- Campos genéricos con significado por tipo:
--   tipo idea/cuesta → resumen = qué cambiar · detalle = el problema hoy
--   tipo falla       → resumen = qué estaba haciendo · detalle = qué pasó · esperado = qué esperaba
--
-- Permiso nuevo `ideas.revisar` (bandeja). Proponer no requiere permiso: basta estar
-- logueado. El Super Administrador (rol 1) recibe todas las claves; si otro admin no
-- debe ver la bandeja, se le pone un "denegar" en Permisos personalizados.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.

CREATE TABLE IF NOT EXISTS ideas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    tipo ENUM('idea','cuesta','falla') NOT NULL,
    resumen VARCHAR(200) NOT NULL,
    detalle TEXT NOT NULL,
    esperado TEXT NULL COMMENT 'Solo falla: qué esperaba que pasara',
    frecuencia ENUM('diaria','semanal','ocasional') NULL,
    alcance ENUM('solo_yo','equipo','obra','todos') NULL,
    beneficio ENUM('tiempo','errores','informacion','otro') NULL,

    -- Contexto capturado solo por la app (el usuario no lo escribe)
    pantalla VARCHAR(255) NULL COMMENT 'Ruta desde donde se propuso (path + query)',
    pantalla_nombre VARCHAR(120) NULL COMMENT 'Nombre legible: Asistencia, Vehículos…',
    obra_id INT NULL COMMENT 'Obra seleccionada en ese momento',
    dispositivo ENUM('movil','escritorio') NULL,
    navegador VARCHAR(255) NULL,

    -- Revisión (Marcos y Mauricio)
    estado ENUM('pendiente','aceptada','desechada','hecha') NOT NULL DEFAULT 'pendiente',
    motivo ENUM('preferencia','ya_existe','regla_negocio','no_compensa','duplicada') NULL
        COMMENT 'Obligatorio al desechar',
    respuesta VARCHAR(1000) NULL COMMENT 'Mensaje para el autor (lo ve en Mis ideas)',
    nota_interna VARCHAR(1000) NULL COMMENT 'Solo revisores: nunca sale a Mis ideas',
    revisado_por INT NULL,
    revisado_en DATETIME NULL,
    hecha_en DATETIME NULL,
    visto_por_autor TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '0 = hubo un cambio de estado que el autor aún no ve',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_ideas_estado_fecha (estado, created_at),
    INDEX idx_ideas_usuario (usuario_id, visto_por_autor),
    CONSTRAINT fk_ideas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ideas_revisor FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_ideas_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo primero y luego el rol (FK permisos_rol_v2.permiso_clave → permisos_catalogo.clave).
-- Sin `roles.version`: agregar una clave no invalida tokens; quien la reciba vuelve a iniciar sesión.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('ideas.revisar', 'Sistema', 'Revisar Ideas para Bóveda',
     'Bandeja de ideas: ver todas las propuestas de mejora con su autor y aceptarlas, desecharlas o marcarlas como hechas', 10);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES (1, 'ideas.revisar');
