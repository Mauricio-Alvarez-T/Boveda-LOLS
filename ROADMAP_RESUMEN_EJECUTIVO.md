# Roadmap — Mejoras al Resumen Ejecutivo del Inventario

> **Estado actual:** Fase 1 COMPLETADA (04/24/2026 ~17:45 UTC-4)
> **Rama de trabajo:** `develop` — último commit `bf9bcd1`
> **Archivos clave:** `frontend/src/components/inventario/ResumenEjecutivoPanel.tsx` (430 líneas) + `frontend/src/hooks/inventario/useDashboardEjecutivo.ts` (62 líneas)

---

## 📊 Contexto

El Resumen Ejecutivo actual ya es sólido: 1 endpoint, 7 queries paralelas, 4 KPIs clickeables, ranking top 5 obras y alertas priorizadas. Esta roadmap documenta las oportunidades detectadas tras una auditoría del módulo y sirve como guía para iterar.

### KPIs actuales
1. **Por aprobar** — transferencias con `estado='pendiente'`
2. **Discrepancias** — transferencias afectadas + unidades con diferencia
3. **En tránsito** — transferencias con `estado='en_transito'`
4. **Valor obras** — arriendo mensual neto (aplicando descuentos)

### Datos que el backend ya envía pero el frontend descarta
- `alertas[].solicitante_nombre` — ignorado en `AlertaItem`
- `observaciones_rechazo` — no se muestra en ninguna vista
- `descuento_porcentaje` — solo como micro-texto bajo la barra del ranking
- Transferencias canceladas — no aparecen en ninguna métrica

---

## 🔥 Fase 1 — Quick Wins (solo frontend, ~4h total)

Bajo esfuerzo, alto impacto visible. Commit por feature.

| # | Mejora | Archivo | Estado |
|---|---|---|---|
| 1.1 | Tooltips en los 4 KPI cards (consistencia con Maestro) | `ResumenEjecutivoPanel.tsx` L261-298 | ✅ DONE |
| 1.2 | "Actualizado hace X min" con color amarillo si >5 min | Header del panel | ✅ DONE |
| 1.3 | Mostrar solicitante en `AlertaItem` (dato ya existe) | `AlertaItem` componente | ✅ DONE |
| 1.4 | Tooltip en barras del ranking con desglose bruto/descuento/neto | `ObraRankingItem` | ✅ DONE |

**Criterios de aceptación Fase 1:**
- [x] `npx tsc --noEmit` limpio
- [x] Visual verificado en `/inventario` tab "Resumen Ejecutivo"
- [x] No rompe responsive móvil
- [x] Commit `bf9bcd1` pusheado a `develop`

---

## 🎯 Fase 2 — Alto valor / Esfuerzo medio (backend + frontend)

| # | Mejora | Archivos | Esfuerzo |
|---|---|---|---|
| 2.1 | **5to KPI: "Estancados >7 días"** — separar del KPI "En tránsito" los que llevan más de 7 días sin recibirse | `inventario.service.js` (query nuevo) + `ResumenEjecutivoPanel.tsx` (nuevo card rojo crítico) | ✅ DONE (51f58d6) |
| 2.2 | **Card "Rechazos recientes"** — lista últimos 7 días con `observaciones_rechazo` | Endpoint + nueva sección en panel | ✅ DONE (51f58d6) |
| 2.3 | **Comparativa vs mes anterior** — "Valor obras: $4.8M (↑ 12%)" | Migración `037_dashboard_kpi_snapshots` + script snapshot diario + service | ✅ DONE (Sprint 3) |
| 2.4 | **Sparklines** en KPI cards — tendencia últimos 7 días | SVG inline sin recharts + endpoint histórico | ✅ DONE (Sprint 3) |

**Criterios de aceptación Fase 2:**
- [ ] Backend tests pasan (`npm test`)
- [ ] Nuevos endpoints respetan permisos (`inventario.ver`)
- [ ] Snapshot mensual o query eficiente (<200ms)

---

## 💡 Fase 3 — Nuevas secciones (alto esfuerzo, valor estratégico)

| # | Mejora | Razón de negocio | Esfuerzo |
|---|---|---|---|
| 3.1 | **Donut "Valor por categoría"** (ANDAMIOS/ALZAPRIMAS/MOLDAJES/MAQUINARIA) ✅ DONE | Gerencia entiende concentración de capital de arriendo | 3h |
| 3.2 | **Card "Próximas recepciones hoy"** — tránsitos con ETA hoy | Supervisor obra planifica recepción de camiones | 3h |
| 3.3 | **Filtro global por obra** en todo el Resumen | Jefe de obra ve KPIs de su obra aislada | 6h |
| 3.4 | **Mini-card Bombas Hormigón** — eventos mes + obras + costo externo ✅ DONE | Visibilidad ejecutiva de uso del mes | 2h |

---

## 🧹 Fase 4 — Limpieza (oportunista)

- Extraer `KpiCard`, `ObraRankingItem`, `AlertaItem` a `frontend/src/components/inventario/resumen-ejecutivo/` — hoy todo vive monolítico en 372 líneas
- Mover `fmtCLP`, `fmtCLPFull` a `utils/format.ts` si se usan en otros panels
- Agregar tests Jest al método `getDashboardEjecutivo()` del backend

---

## 🚦 Plan de ejecución sugerido

### Sprint 1 (hoy) — ✅ COMPLETADO
- Fase 1 completa (4 quick wins) → commit `bf9bcd1` → desplegado a staging
- Verificado: type check limpio, tooltips funcionales, solicitante visible, actualización timestamp OK

### Sprint 2 — ✅ COMPLETADO (51f58d6)
- 2.1: 5to KPI "Estancados +7d" — rojo, Timer icon, xl:grid-cols-5
- 2.2: Sección "Rechazos recientes" — solo visible si hay datos, motivo entre comillas

### Sprint 3 — ✅ COMPLETADO (2f5d0b2)
- 2.3: Comparativa mes anterior — chip ↑/↓ % en KPI cards
- 2.4: Sparklines — SVG inline últimos 7 días por KPI
- Infra: tabla `dashboard_kpi_snapshots` (migración 037) + script `snapshot_dashboard.js` + cron diario 00:05
- **Deployado staging**: migrate corrido ✅ + cron cPanel activo ✅
- **Pendiente prod**: repetir migrate + cron en `/boveda/` al mergear `main`

### Sprint 4 — En progreso
Fase 3 — orden por valor/esfuerzo:
1. ✅ **3.1** Donut "Valor por categoría" (3h) — DONE
2. ✅ **3.4** Mini-card Bombas Hormigón (2h) — DONE
3. **3.3** Filtro global por obra (6h) — siguiente, refactor unifica todo
4. **3.2** Próximas recepciones hoy (5h+) — requiere decisión sobre agregar ETA a transferencias

### Fase 4
- Fase 4 en cualquier momento como cleanup

---

## 📌 Notas

- Mantener compatibilidad con el permiso `inventario.ver` para todo lo nuevo
- Cualquier cambio en `inventario.service.js:getDashboardEjecutivo()` debe preservar el contrato actual del hook `useDashboardEjecutivo` para no romper cache
- El ranking de obras hoy muestra top 5 — validar con usuarios finales si conviene top 10 configurable
- Para sparklines: evaluar si snapshot diario en tabla nueva (`dashboard_snapshots`) conviene vs query on-the-fly
