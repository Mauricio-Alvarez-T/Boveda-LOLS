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
  usuario logueado, cierra el mensaje). Formato por línea: `*Etiqueta:* ```valor```` — etiqueta en
  **negrita**, valor en monoespaciado (WhatsApp lo pinta gris; no hay colores custom). Cambiar el
  orden/wording exige actualizar `bombaHormigonWhatsApp.test.ts`.
- Listado excluye obras `es_prueba=1` y `finalizada=1` (`bomba-hormigon.service.js`); los
  **registros históricos NO se filtran** por `participa_bombas` (solo el selector de obra al crear
  — mig 075, fetch `?participa_bombas=1`).
- **Costo gateado** por `inventario.bombas.ver_costos`: sin permiso, el backend sanitiza `costo`
  del JSON y la UI oculta el StatCard "Costo Total" y la columna.
- Permisos: `inventario.bombas.ver / crear / editar` (tab gateado por `inventario.tab.bombas`).
- UI: tab BOMBAS dentro de Inventario (`BombasHormigonTab.tsx`), filtro por obra + búsqueda.
