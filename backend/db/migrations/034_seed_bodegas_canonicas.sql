-- =============================================
-- Migración 034: NO-OP (revertida)
--
-- Originalmente sembraba Cerrillos/Paraguay/Rivas Vicuña como
-- bodegas "permanentes" de Dedalius. Decisión revertida: bodegas
-- son cualquier registro del apartado; no hay hardcoded. El
-- usuario crea/desactiva vía UI. Ver 035 para DROP de flags.
--
-- Archivo se deja como no-op para conservar orden de migración
-- (runner registra por filename).
-- =============================================

SELECT '034: no-op (seed hardcoded revertido, ver 035)' AS msg;
