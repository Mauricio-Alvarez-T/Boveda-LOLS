-- =============================================
-- 106 — Checkbox "Avisar 30 días antes" para el término del leasing
-- =============================================
-- Pedido del dueño (2026-08-31): el bloque de leasing del formulario era el
-- único con fecha de vencimiento SIN interruptor de aviso. Los demás ya lo
-- tienen: documentos/revisiones/mantenciones con avisar_30d (mig 105) y los
-- seguros con avisar_alerta_seguro (mig 103). El término del leasing entraba
-- al contador siempre, y la única forma de silenciarlo era marcar
-- "Término de leasing" — que significa otra cosa (el contrato YA finalizó) y
-- arrastra el traspaso, o sea silenciar el aviso obligaba a falsear el dato.
--
-- DEFAULT 1 = todos los leasing existentes siguen avisando igual que hoy. La
-- migración no silencia nada: solo habilita apagarlo caso a caso.
--
-- Ojo (regla vigente, docs/reglas/vehiculos.md): este flag controla el aviso
-- IN-APP (contador del menú + panel de vencimientos + bandeja del Inicio).
-- Los correos de alerta van por otra vía (email_alerta por registro) y no se
-- ven afectados por este checkbox.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que migs 103/105). El
-- código tolera esta migración pendiente: buildUpdate/update filtran columnas
-- existentes y la consulta del contador reintenta sin el filtro.

ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS avisar_leasing_30d TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'Si 0, el termino del leasing de este vehiculo no cuenta en el aviso de vencimientos';
