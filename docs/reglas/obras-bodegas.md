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
- **Escapes explícitos** a esa exclusión (la de `es_prueba=1` NO se levanta nunca):
  `GET /obras?incluir_finalizadas=true` y `GET /transferencias?incluir_finalizadas=true`
  (este último lo usa el modo Histórico de Inventario → Solicitudes).

## Flags de bodega (`bodegas`)

| Flag | Default | Efecto |
|---|---|---|
| `activa` | TRUE | FALSE = soft-delete (stock histórico se preserva) |
| `participa_inventario` (mig 075) | TRUE | FALSE = fuera del resumen/stock por ubicación |
| `participa_transferencias` (mig 075) | TRUE | FALSE = no seleccionable en transferencias |
| `es_virtual` (mig 099) | FALSE | TRUE = Bodega Virtual del sistema (ver sección abajo). Oculta por default en `GET /bodegas` (override `?incluir_virtual=true`); NO editable por PUT genérico (solo migración); DELETE bloqueado por guard (400) |

- `responsable_nombre` texto libre (mig 060; el FK `responsable_id` es legacy sin uso).
- Display: `formatBodegaConResponsable()` / `formatBodegaNombreResponsable()` (`utils/formatBodega`).

## Bodega Virtual (mig 099)

- **Qué es**: contenedor del sistema para ítems de factura que aún no pertenecen a una
  ubicación física. Fila sembrada "Bodega Virtual" (`es_virtual=1`), renombrable vía UI,
  NO eliminable (guard en `index.js` — destino permanente del módulo Facturas).
- **Modo de visibilidad POR USUARIO** (botón cíclico en Inventario, localStorage
  `sgdl_bodega_virtual_modo_<userId>`, hook `useBodegaVirtualModo`):
  1. **ocultar** (default): invisible en Ejecutivo/Resumen/Obra-Bod./Facturas y fuera de totales.
  2. **mostrar**: visible con todo su contenido, SIN sumar a ningún total (unidades ni patrimonio).
  3. **sumar**: visible Y sumando.
- **Backend**: `GET /inventario/resumen?bodega_virtual=<modo>` (lista + `total_cantidad`
  mode-aware) y `GET /inventario/dashboard-ejecutivo?bodega_virtual=<modo>` (query #14
  patrimonio excluye su stock salvo `sumar`). Whitelist en la ruta; default `ocultar`.
- **Facturas**: destino SIEMPRE disponible (`/bodegas?incluir_virtual=true`); el modo
  ajusta SOLO lo mostrado — `monto_virtual` por factura se resta del monto exhibido fuera
  de `sumar`; en `ocultar` los ítems virtuales se esconden del detalle. **El `monto_neto`
  almacenado y el form de edición NUNCA se alteran** (documento real; filtrar el form
  borraría ítems + stock, porque editar() reemplaza ítems).
- **Regularización**: participa en transferencias como cualquier bodega → mover
  virtual→obra/bodega real vía wizard (por eso `useNuevoMovimientoData` pasa
  `incluir_virtual=true`).
- **Bodeguero**: `UsuarioForm` NO la lista (nadie es bodeguero de la virtual); una
  transferencia HACIA la virtual la recepciona quien tenga `ver_todas`.
- Snapshots del dashboard (sparklines) son solo-obras → no reflejan el modo (aceptado).

## Otros

- `encargado_nombre` (mig 063): texto libre, quién solicita material en la obra.
- Selector global de obra (`ObraSelector`/`ObraContext`): `GET /obras?activo=true` — lista todas las
  activas no-prueba no-finalizadas; persiste selección en localStorage (`sgdl_obra_id`, 'ALL' =
  todas). Compartido por toda la app; SOLO se filtra por participación cuando la ruta es /asistencia.
