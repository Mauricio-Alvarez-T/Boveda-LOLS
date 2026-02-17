-- =============================================
-- SGDL - Script maestro de migración
-- Ejecutar este archivo para crear toda la BD
-- =============================================
-- Uso: mysql -u root -p < run_all.sql
-- =============================================

CREATE DATABASE IF NOT EXISTS sgdl
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE sgdl;

SOURCE 001_organizacion.sql;
SOURCE 002_trabajadores_documentos.sql;
SOURCE 003_acceso.sql;
SOURCE 004_asistencia.sql;

SELECT '✅ Base de datos SGDL creada exitosamente' AS resultado;
