# Reglas — Bombas de Hormigón

- Registro por obra (`registro_bombas_hormigon`, mig 020): `obra_id`, `fecha`, `tipo_bomba`,
  `es_externa` + `proveedor`, `costo`, observaciones.
- Listado excluye obras `es_prueba=1` y `finalizada=1` (`bomba-hormigon.service.js`); los
  **registros históricos NO se filtran** por `participa_bombas` (solo el selector de obra al crear
  — mig 075, fetch `?participa_bombas=1`).
- **Costo gateado** por `inventario.bombas.ver_costos`: sin permiso, el backend sanitiza `costo`
  del JSON y la UI oculta el StatCard "Costo Total" y la columna.
- Permisos: `inventario.bombas.ver / crear / editar` (tab gateado por `inventario.tab.bombas`).
- UI: tab BOMBAS dentro de Inventario (`BombasHormigonTab.tsx`), filtro por obra + búsqueda.
