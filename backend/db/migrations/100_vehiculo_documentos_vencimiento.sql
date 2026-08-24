-- =============================================
-- 100 — Vencimiento en los documentos del vehículo
-- =============================================
-- Los tipos "de archivo" (permiso de circulación, seguro contra terceros,
-- primera inscripción, póliza) solo guardaban el archivo: no había forma de
-- registrar desde cuándo rige ni cuándo vence, así que no aparecían en ningún
-- aviso. Se agregan fecha, vencimiento y observaciones.
--
-- TODAS NULL a propósito: subir el documento sigue siendo lo único obligatorio
-- (decisión usuario 2026-08-24). Hay documentos que no vencen — la primera
-- inscripción/padrón, por ejemplo — y los ya cargados no tienen estos datos.
--
-- NO se agregan columnas de alerta por email (dias_alerta/email_alerta): el
-- aviso de estos documentos es el contador in-app del menú, no un correo.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 081).

ALTER TABLE vehiculo_documentos
    ADD COLUMN IF NOT EXISTS fecha DATE NULL
        COMMENT 'Fecha de emisión / desde cuándo rige el documento',
    ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE NULL
        COMMENT 'Vencimiento del documento; alimenta el contador de vencimientos',
    ADD COLUMN IF NOT EXISTS observaciones TEXT NULL;

-- El contador del menú consulta por vencimiento en un rango de fechas.
CREATE INDEX IF NOT EXISTS idx_vehdoc_vencimiento
    ON vehiculo_documentos (fecha_vencimiento);
