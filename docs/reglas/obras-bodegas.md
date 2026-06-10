# Reglas — Obras y Bodegas

## Flags de obra (`obras`) y su efecto

| Flag | Default | Efecto | Cascada a trabajadores |
|---|---|---|---|
| `activa` | TRUE | FALSE = soft-delete: fuera de todos los listados por defecto | No |
| `es_prueba` (mig 066) | FALSE | TRUE = AISLADA de reportes, inventario, dashboard, KPIs, asistencia y selectores; visible solo en Settings (y Consultas con flag) para revertir | **SÍ** — `PUT /obras/:id` con es_prueba cascadea `trabajadores.es_prueba`; trabajador nuevo hereda de la obra |
| `finalizada` (mig 074) | FALSE | TRUE = obra CONCLUIDA: fuera de selectores/asistencia/consultas/inventario/dashboard; visible solo en sección "Obras Finalizadas"; reactivable | **NO** — el trabajador sigue real (normalmente ya trasladado) |
| `participa_inventario` (mig 026) | TRUE | FALSE = fuera de listados/selectores de inventario (stock, resumen, facturación) | No |
| `participa_asistencia` (mig 075) | TRUE | FALSE = fuera del selector de obra en Asistencia (selector global filtrado en /asistencia + guard) | No |
| `participa_transferencias` (mig 075) | TRUE | FALSE = no seleccionable como origen/destino de transferencias | No |
| `participa_bombas` (mig 075) | TRUE | FALSE = fuera del dropdown/filtro de Bombas de Hormigón (registros históricos se conservan) | No |

- Los `participa_*` **solo filtran selectores/listas para uso nuevo** — nunca borran ni cascadean
  registros existentes.
- UI: botones toggle por fila en Configuración → Obras (Inv/Asis/Transf/Bombas) y Bodegas
  (Inv/Transf) — `ParticipaToggle.tsx`; también checkboxes en ObraForm/BodegaForm.
- Permisos: toggles de obra requieren `obras.editar`; de bodega `inventario.editar`.

## Obras finalizadas (mig 074)

- Finalizar: Configuración → Obras → botón archivador → modal con `fecha_termino` (requerida,
  default hoy) y `fecha_inicio` (opcional — fallback: primera asistencia registrada).
- Endpoints: `PUT /obras/:id/finalizar` y `/reactivar`; permiso **`obras.finalizar`** ("acción de
  alto impacto").
- Sección "Obras Finalizadas" (sidebar, permiso `obras.ver`): histórico con duración, fechas,
  total de trabajadores y desglose por cargo; permite reactivar.
- Queries globales de asistencia/inventario/dashboard/transferencias/bombas/discrepancias/
  fiscalización excluyen `finalizada=1`.

## Flags de bodega (`bodegas`)

| Flag | Default | Efecto |
|---|---|---|
| `activa` | TRUE | FALSE = soft-delete (stock histórico se preserva) |
| `participa_inventario` (mig 075) | TRUE | FALSE = fuera del resumen/stock por ubicación |
| `participa_transferencias` (mig 075) | TRUE | FALSE = no seleccionable en transferencias |

- `responsable_nombre` texto libre (mig 060; el FK `responsable_id` es legacy sin uso).
- Display: `formatBodegaConResponsable()` / `formatBodegaNombreResponsable()` (`utils/formatBodega`).

## Otros

- `encargado_nombre` (mig 063): texto libre, quién solicita material en la obra.
- Selector global de obra (`ObraSelector`/`ObraContext`): `GET /obras?activo=true` — lista todas las
  activas no-prueba no-finalizadas; persiste selección en localStorage (`sgdl_obra_id`, 'ALL' =
  todas). Compartido por toda la app; SOLO se filtra por participación cuando la ruta es /asistencia.
