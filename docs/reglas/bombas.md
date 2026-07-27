# Reglas — Bombas de Hormigón

- Registro por obra (`registro_bombas_hormigon`, mig 020): `obra_id`, `fecha`, `tipo_bomba`,
  `es_externa` + `proveedor`, `costo`, observaciones. Campos adicionales del bombeo:
  `tipo_trabajo` (texto libre, ej. "Coronación tapa" — mig 096), `tipo_hormigon`, `cantidad_m3`,
  `hora_inicio`, `frecuencia`, `hidrofugo`, `permiso_calzada`, `vibradores_origen` +
  `vibradores_detalle`.
- **Mensaje de WhatsApp** (`utils/bombaHormigonWhatsApp.ts`, función pura testeada): título
  "*Programación de hormigón*"; orden fijo pedido por obra → **Obra → Fecha → Tipo de trabajo →
  Tipo de hormigón → Tipo de bomba → Origen → resto** (cantidad, hora, frecuencia, muestras,
  traslado, hidrófugo, permiso calzada, vibradores, observaciones) → **Solicitante** (nombre del
  usuario logueado, cierra el mensaje). Formato por línea: `*Etiqueta:* valor` — etiqueta en
  **negrita**, valor en **letra normal**. ⚠️ El valor NO va en monoespaciado (` ```valor``` `): se
  probó para que WhatsApp lo pintara gris y en obra reclamaron la tipografía de máquina de escribir
  (angosta, incómoda en el celular) → texto plano, igual que `transferenciaWhatsApp.ts`. El test
  incluye `expect(msg).not.toContain('```')` para que no vuelva. Cambiar el orden/wording exige
  actualizar `bombaHormigonWhatsApp.test.ts`.
- **Hormigonado SIN bomba** (decisión usuario 2026-07-27): `tipo_bomba = 'No solicitado'`
  (`BOMBA_NO_SOLICITADA` en `utils/bombaHormigonWhatsApp.ts`) es el ÚNICO dato que lo marca — **NO hay
  columna nueva**, se reusa `tipo_bomba` y `es_externa` queda en 0. "Tipo de bomba" y "Origen de la
  bomba" son el **mismo hecho**: los dos dropdown se sincronizan (elegir "No solicitado" en uno lo pone
  en el otro; volver a Empresa/Externa limpia el tipo para que se elija uno real) y en el mensaje de
  WhatsApp el **Origen se deriva** → ambas líneas dicen "No solicitado". En el listado: badge **neutro**
  "NO SOLICITADO" (sin bomba no es bueno ni malo), la fila de tipo omite el texto para no repetirlo, y
  esos registros **no cuentan** ni en "Empresa" ni en "Externas" (aparecen como "N sin bomba" en la fila
  del mes). Usar `esBombaNoSolicitada()`, no comparar strings a mano.
- **Solicitante = `registrado_por`** (usuario que creó la programación, NOT NULL desde mig 020). El
  `getAll` lo expone como `registrado_por_nombre` (LEFT JOIN `usuarios`) y la **tarjeta del listado lo
  muestra en el pie** ("Solicitante: Nombre"), con el MISMO nombre que cierra el mensaje de WhatsApp —
  tarjeta y mensaje enviado no deben contradecirse. `update` NO reescribe `registrado_por`: si otro
  usuario edita el registro, el solicitante sigue siendo quien lo pidió.
- Listado excluye obras `es_prueba=1` y `finalizada=1` (`bomba-hormigon.service.js`); los
  **registros históricos NO se filtran** por `participa_bombas` (solo el selector de obra al crear
  — mig 075, fetch `?participa_bombas=1`).
- **Costo gateado** por `inventario.bombas.ver_costos`: sin permiso, el backend sanitiza `costo`
  del JSON y la UI oculta el StatCard "Costo Total" y la columna.
- Permisos: `inventario.bombas.ver / crear / editar` (tab gateado por `inventario.tab.bombas`).
- UI: tab BOMBAS dentro de Inventario (`BombasHormigonTab.tsx`), filtro por obra + búsqueda.
