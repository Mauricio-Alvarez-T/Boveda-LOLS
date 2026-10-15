-- =============================================
-- 121 — Ideas para Bóveda: foto opcional, miniatura de ~5 KB
-- =============================================
-- Pedido de Marcos (2026-10-15, probando en staging): poder adjuntar una foto o
-- captura a la idea, comprimida al mínimo "por el tema de que tenemos poca memoria"
-- (meta: 4–5 KB). La mig 120 había dejado el módulo sin adjuntos por esa misma razón.
--
-- La miniatura se comprime EN EL TELÉFONO antes de subir (WEBP, o JPEG donde el
-- navegador no sabe hacer WEBP) y viaja dentro del mismo POST. Se guarda en la propia
-- fila (BLOB) y no en uploads/: con ~5 KB no vale la pena un archivo, va en el
-- respaldo de la BD junto a la idea y se borra con ella. 1.000 ideas con foto ≈ 5 MB.
-- El servidor rechaza todo lo que pase de 12 KB (red de seguridad si alguien sube
-- sin pasar por la compresión) y verifica que los bytes sean de verdad una imagen.
--
-- La foto NUNCA viaja en los listados: solo `tiene_foto`; se pide aparte por
-- GET /api/ideas/:id/foto (autor o revisor).
--
-- Idempotente (MariaDB): ADD COLUMN IF NOT EXISTS.

ALTER TABLE ideas
    ADD COLUMN IF NOT EXISTS foto BLOB NULL COMMENT 'Miniatura comprimida en el cliente (≤ 12 KB, meta ~5 KB)',
    ADD COLUMN IF NOT EXISTS foto_mime VARCHAR(20) NULL COMMENT 'image/webp | image/jpeg | image/png',
    ADD COLUMN IF NOT EXISTS foto_bytes INT UNSIGNED NULL;
