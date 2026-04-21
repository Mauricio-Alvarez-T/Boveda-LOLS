-- =============================================
-- Migración 034: Seed bodegas canónicas Dedalius
--
-- Cerrillos, Paraguay, Rivas Vicuña son las 3 bodegas permanentes
-- reales del negocio. Propiedad de Dedalius. Hogar del stock.
--
-- Idempotente: INSERT ... SELECT ... WHERE NOT EXISTS por nombre
-- (nombre tiene UNIQUE en items 017). Compatible MySQL 5.7+.
-- Depende de 033 (es_permanente + empresa_propietaria ya agregadas).
-- =============================================

INSERT INTO bodegas (nombre, direccion, activa, es_permanente, empresa_propietaria)
SELECT 'Cerrillos', NULL, TRUE, TRUE, 'dedalius'
WHERE NOT EXISTS (SELECT 1 FROM bodegas WHERE nombre = 'Cerrillos');

INSERT INTO bodegas (nombre, direccion, activa, es_permanente, empresa_propietaria)
SELECT 'Paraguay', NULL, TRUE, TRUE, 'dedalius'
WHERE NOT EXISTS (SELECT 1 FROM bodegas WHERE nombre = 'Paraguay');

INSERT INTO bodegas (nombre, direccion, activa, es_permanente, empresa_propietaria)
SELECT 'Rivas Vicuña', NULL, TRUE, TRUE, 'dedalius'
WHERE NOT EXISTS (SELECT 1 FROM bodegas WHERE nombre = 'Rivas Vicuña');
