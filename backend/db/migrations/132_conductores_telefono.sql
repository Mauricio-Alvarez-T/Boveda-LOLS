-- ─────────────────────────────────────────────────────────────────────
-- 132 — Teléfono del conductor (para avisarle por WhatsApp)
-- ─────────────────────────────────────────────────────────────────────
-- Pedido del dueño 2026-10-22: «cuando esté en producción, que el WhatsApp le
-- llegue a la persona que está a cargo de ese vehículo» (= el «Conductor
-- asignado» de la mig 076). Hasta ahora `conductores` solo tenía el nombre y
-- «Avisar a {conductor}» del Inicio abría WhatsApp SIN número (la persona
-- elegía el contacto a mano).
--
--   telefono → celular chileno normalizado '+569XXXXXXXX' (12 caracteres; el
--              backend acepta espacios, guiones y +56 y rechaza lo demás con
--              400, utils/telefono.js). NULL = sin teléfono → WhatsApp se abre
--              como antes, sin número.
--
-- Lo llenan Configuración → Conductores y el formulario del vehículo («Teléfono
-- del conductor», con vehiculos.crear / vehiculos.editar). Es un dato personal:
-- solo sale en respuestas a quien tiene vehiculos.ver, y el saneo de staging lo
-- deja en NULL (saneoStaging.limpiarRastros).
-- Reglas: docs/reglas/vehiculos.md § Teléfono del conductor.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (sintaxis MariaDB, mismo criterio que
-- migs 129/130). Sin esta columna el backend sigue andando: las consultas la
-- omiten (ER_BAD_FIELD_ERROR / existingCols) y el teléfono no se guarda.

ALTER TABLE conductores
  ADD COLUMN IF NOT EXISTS telefono VARCHAR(20) NULL AFTER nombre;
