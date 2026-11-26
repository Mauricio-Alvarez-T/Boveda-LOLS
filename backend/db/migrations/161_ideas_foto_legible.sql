-- =============================================
-- 161 — Ideas: la foto se puede LEER (no solo una miniatura de ~5 KB)
-- =============================================
-- Marcos 2026-11-26: Matías mandó en una idea la foto de una carta y «no se entiende nada… mejora la vista previa
-- y al abrir el archivo». La mig 121 guardaba una miniatura de ~5 KB («tenemos poca memoria»): alcanza para ver qué
-- pantalla es, no para leer un documento. Ahora el teléfono la comprime como los documentos (lado largo hasta
-- 1600 px, meta ~250 KB) y el servidor acepta hasta 400 KB. BLOB tiene tope de 64 KB → MEDIUMBLOB (16 MB).
-- 100 ideas con foto ≈ 25 MB de BD (antes ≈ 0,5 MB). Las fotos ya guardadas quedan como estaban (no se recuperan).
--
-- Idempotente: MODIFY deja la columna igual si se repite.

ALTER TABLE ideas
    MODIFY COLUMN foto MEDIUMBLOB NULL COMMENT 'Foto comprimida en el cliente para que se lea (≤ 400 KB, meta ~250 KB; mig 161)';
