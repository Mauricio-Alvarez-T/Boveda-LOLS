-- =============================================
-- 118 — Estado "Falta justificada" (FJ) + justificativo adjunto en períodos
-- =============================================
-- Pedido de RRHH / jefatura (2026-10-06): en el calendario del trabajador falta
-- distinguir la falta que el trabajador justificó (certificado, comprobante,
-- aviso con respaldo) de la falta injustificada. Hoy ambas se marcan F, y F es
-- lo que alimenta las alertas de faltas reiteradas (Art. 160 N°3) y el conteo
-- de "faltas" de la ficha del trabajador.
--
-- FJ:
--   · es_presente = 0            → no estuvo en obra (ausente para dashboard/fiscalización)
--   · cuenta_dia_trabajado = 0   → NO paga el día (igual que F). Si jefatura decide
--                                  pagar las justificadas, se cambia este flag y nada más:
--                                  el Excel de nómina suma por este flag (mig 049).
--   · NO entra a las alertas Art. 160 ni al conteo de faltas: esos filtran por
--     codigo = 'F' y FJ es otro código a propósito.
--
-- Justificativo: una foto o archivo (PDF/JPG/PNG/WEBP, ≤10 MB) adjunto al PERÍODO
-- de ausencia, guardado en uploads/justificativos/<periodo_id>/ y servido por
-- descarga autenticada (no es estático público: son papeles del trabajador).
-- Un archivo por período; al reemplazarlo se borra el anterior del disco.
--
-- Idempotente: INSERT ... ON DUPLICATE KEY (codigo es UNIQUE) + ADD COLUMN IF NOT EXISTS.

INSERT INTO estados_asistencia (nombre, codigo, color, es_presente, cuenta_dia_trabajado, activo)
VALUES ('Falta justificada', 'FJ', '#F97316', 0, 0, 1)
ON DUPLICATE KEY UPDATE
    nombre = 'Falta justificada',
    es_presente = 0,
    activo = 1;

ALTER TABLE periodos_ausencia
    ADD COLUMN IF NOT EXISTS justificativo_nombre VARCHAR(255) NULL
        COMMENT 'Nombre original del archivo adjunto (lo ve el usuario)',
    ADD COLUMN IF NOT EXISTS justificativo_ruta VARCHAR(500) NULL
        COMMENT 'Ruta relativa a backend/uploads; nunca sale al JSON',
    ADD COLUMN IF NOT EXISTS justificativo_mime VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS justificativo_tamano INT UNSIGNED NULL
        COMMENT 'Bytes',
    ADD COLUMN IF NOT EXISTS justificativo_subido_por INT NULL
        COMMENT 'usuarios.id de quien adjuntó',
    ADD COLUMN IF NOT EXISTS justificativo_subido_en DATETIME NULL;

-- Verificación esperada (manual post-migración):
--   SELECT codigo, es_presente, cuenta_dia_trabajado, activo FROM estados_asistencia WHERE codigo IN ('F','FJ');
--   Esperado: F 0,0,1 · FJ 0,0,1
--   SHOW COLUMNS FROM periodos_ausencia LIKE 'justificativo%';  → 6 columnas
