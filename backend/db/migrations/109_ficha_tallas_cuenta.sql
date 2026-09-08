-- =============================================
-- 109 — Ficha de ingreso completa: tallas de ropa + cuenta bancaria
-- =============================================
-- La ficha digital (mig 108) debe calzar 1:1 con la de papel "LISTADO DE NUEVOS
-- TRABAJADORES" (pedido de oficina, 2026-09-08). Se agregan a la solicitud Y al
-- trabajador (viven en ambas: al aprobar se copian) los campos que quedaron fuera:
--   - Tallas: calzado (35-47), pantalón (38-50), polera (S/M/L/XL/XXL).
--   - Pago de remuneraciones: ¿cuenta RUT? (sí/no). Con SÍ el service fija
--     banco = BancoEstado, tipo = vista y número = RUT sin DV. Con NO: banco,
--     tipo de cuenta (vista | corriente) y número los llena terreno/oficina.
-- Todo opcional (NULL). Sin ENUM para banco/tipo (coherente con comuna/afp/salud:
-- el catálogo vive en el frontend y un valor legado nunca rompe la edición).
-- `cuenta_rut` es TINYINT(1) → el typeCast de db.js lo entrega como boolean.
-- Idempotente (ADD COLUMN IF NOT EXISTS). La aplica el auto-migrate del cron.

ALTER TABLE trabajadores
    ADD COLUMN IF NOT EXISTS talla_calzado TINYINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS talla_pantalon TINYINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS talla_polera VARCHAR(5) NULL,
    ADD COLUMN IF NOT EXISTS cuenta_rut TINYINT(1) NULL,
    ADD COLUMN IF NOT EXISTS banco VARCHAR(60) NULL,
    ADD COLUMN IF NOT EXISTS tipo_cuenta VARCHAR(15) NULL,
    ADD COLUMN IF NOT EXISTS numero_cuenta VARCHAR(30) NULL;

ALTER TABLE solicitudes_ingreso
    ADD COLUMN IF NOT EXISTS talla_calzado TINYINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS talla_pantalon TINYINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS talla_polera VARCHAR(5) NULL,
    ADD COLUMN IF NOT EXISTS cuenta_rut TINYINT(1) NULL,
    ADD COLUMN IF NOT EXISTS banco VARCHAR(60) NULL,
    ADD COLUMN IF NOT EXISTS tipo_cuenta VARCHAR(15) NULL,
    ADD COLUMN IF NOT EXISTS numero_cuenta VARCHAR(30) NULL;
