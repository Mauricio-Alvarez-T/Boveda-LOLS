-- =============================================
-- 102 — Archivo adjunto en revisiones y mantenciones
-- =============================================
-- Revisión técnica, revisión de gases y mantención guardaban solo datos: el
-- certificado o la boleta había que subirlos aparte como "documento" suelto,
-- sin quedar ligados al registro. Ahora cada registro puede llevar su archivo
-- (PDF o imagen, comprimida en el navegador antes de subir).
--
-- Ambas columnas NULL: el archivo es OPCIONAL, igual que en vehiculo_documentos
-- (mig 100). Los registros que ya existen quedan sin archivo y siguen válidos.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que migs 081/100).

ALTER TABLE vehiculo_revisiones
    ADD COLUMN IF NOT EXISTS nombre_archivo VARCHAR(255) NULL
        COMMENT 'Nombre original del archivo adjunto (certificado de la revisión)',
    ADD COLUMN IF NOT EXISTS ruta_archivo VARCHAR(500) NULL
        COMMENT 'Ruta relativa a backend/uploads/';

ALTER TABLE vehiculo_mantenciones
    ADD COLUMN IF NOT EXISTS nombre_archivo VARCHAR(255) NULL
        COMMENT 'Nombre original del archivo adjunto (boleta/informe del taller)',
    ADD COLUMN IF NOT EXISTS ruta_archivo VARCHAR(500) NULL
        COMMENT 'Ruta relativa a backend/uploads/';
