-- =============================================
-- Migración 138: fecha de término del contrato del trabajador
-- =============================================
-- Marcos 2026-10-26: «agrega fecha de término de contratos». Hasta hoy `trabajadores` guardaba la fecha de ingreso
-- (`fecha_ingreso`) y la de la baja real (`fecha_desvinculacion`, mig 108/112), pero ni la fecha en que vence el
-- contrato ni su tipo. El contrato que emite Bóveda es a plazo fijo con días editables (contrato.plantilla.js) y esa
-- duración queda solo en la metadata del documento emitido, no en el trabajador.
--
-- Columna NUEVA y opcional: `trabajadores.fecha_termino_contrato DATE NULL`.
--   · Con fecha  = contrato a plazo fijo que vence ese día.
--   · Vacía      = contrato indefinido (o aún sin el dato).
-- No se agrega `tipo_contrato`: la fecha basta para distinguir plazo fijo de indefinido y para el tema
-- «Contratos por vencer» del Inicio de gerencia (vencidos o que vencen en 30 días: inicioGerencia.service.js).
-- Se edita en Gestiones → ficha del trabajador → Editar (WorkerForm, CRUD de trabajadores en index.js).
--
-- Nada se calcula ni se rellena: todas las filas existentes quedan en NULL hasta que RRHH les ponga la fecha.
-- Idempotente: ADD COLUMN IF NOT EXISTS (MariaDB 10.6). Sin UPDATE, sin DELETE, sin índice (la tabla es chica).

ALTER TABLE trabajadores
    ADD COLUMN IF NOT EXISTS fecha_termino_contrato DATE NULL
        COMMENT 'Fin del contrato a plazo fijo. NULL = indefinido o sin dato (mig 138)';
