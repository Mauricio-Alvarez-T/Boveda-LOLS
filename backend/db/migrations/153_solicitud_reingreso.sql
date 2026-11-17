-- ============================================================================
-- 153_solicitud_reingreso.sql — Solicitud de REINGRESO desde terreno
-- Fecha: 2026-11-17 (Gestiones — reingreso y períodos laborales, 2ª etapa)
--
-- Hasta hoy un RUT finiquitado bloqueaba la solicitud de ingreso («contacta a administración por
-- WhatsApp») y el reingreso lo hacía la oficina directo, sin el circuito de aprobación. Decisión del
-- dueño (2026-11-17): terreno también puede pedirlo; la oficina lo aprueba como cualquier ingreso y,
-- en vez de crear un trabajador, se REINGRESA la ficha existente (período laboral nuevo, mig 152).
--
-- CAMBIO: `solicitudes_ingreso.tipo` ('ingreso' | 'reingreso'). Las existentes quedan 'ingreso'.
-- En un reingreso, `trabajador_id` se llena al CREAR la solicitud (la ficha ya existe).
-- Idempotente: ADD COLUMN IF NOT EXISTS (MariaDB 10.6). Sin permisos nuevos (aprobar = solicitud.aprobar).
-- ============================================================================

ALTER TABLE solicitudes_ingreso
  ADD COLUMN IF NOT EXISTS tipo ENUM('ingreso', 'reingreso') NOT NULL DEFAULT 'ingreso'
    COMMENT 'reingreso = RUT de un trabajador finiquitado; aprobar reingresa la ficha existente (mig 153)';
