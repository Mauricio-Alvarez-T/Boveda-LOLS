-- 085 — Progreso de tutoriales del Centro de ayuda (por usuario, cross-device).
-- Un registro por (usuario, tutorial) cuando el usuario completa el recorrido.
CREATE TABLE IF NOT EXISTS tutorial_progreso (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    tutorial_id VARCHAR(64) NOT NULL,
    completado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tutorial_progreso (usuario_id, tutorial_id),
    CONSTRAINT fk_tutorial_progreso_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
