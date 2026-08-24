-- 101: Limpieza de asistencias duplicadas cross-obra (regla "fila vigente").
--
-- Contexto: la UK de asistencias es (trabajador_id, obra_id, fecha), así que un
-- trabajador puede tener 2+ filas el mismo día en obras distintas. Se generaban al
-- re-guardar asistencia tras cambiar la obra del trabajador o al crear períodos en
-- otra obra (caso detectado en prod: García Arancibia, 19-21 ago 2026 — A vieja en
-- una obra + F nueva en otra). Cada vista elegía una fila arbitraria (calendario A,
-- lista diaria F, Excel la última).
--
-- Regla (docs/reglas/asistencia.md): la fila VIGENTE es la de id MÁS ALTO (la última
-- registrada). El par del traslado (estado TO en origen + A en destino) es legítimo
-- y se PRESERVA en ambos lados.
--
-- Esta migración borra las filas duplicadas MÁS ANTIGUAS. Idempotente: una segunda
-- corrida no borra nada. El código nuevo (bulkCreate/crearPeriodo) previene
-- duplicados futuros.
--
-- Para dimensionar ANTES de correr (opcional, solo lectura):
--   SELECT COUNT(*) FROM asistencias a1
--   JOIN asistencias a2 ON a2.trabajador_id = a1.trabajador_id AND a2.fecha = a1.fecha
--     AND a2.obra_id <> a1.obra_id AND a2.id > a1.id
--   WHERE a1.estado_id <> (SELECT id FROM estados_asistencia WHERE codigo = 'TO')
--     AND a2.estado_id <> (SELECT id FROM estados_asistencia WHERE codigo = 'TO');

DELETE a1 FROM asistencias a1
JOIN asistencias a2
  ON a2.trabajador_id = a1.trabajador_id
 AND a2.fecha = a1.fecha
 AND a2.obra_id <> a1.obra_id
 AND a2.id > a1.id
WHERE a1.estado_id <> (SELECT id FROM estados_asistencia WHERE codigo = 'TO')
  AND a2.estado_id <> (SELECT id FROM estados_asistencia WHERE codigo = 'TO');
