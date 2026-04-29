# Roadmap — Refactor "Historial de Actividad"

> **Estado actual:** Plan aprobado. Sprints 1-4 PENDIENTES de ejecución.
> **Rama de trabajo:** `develop`
> **Plan original:** `C:\Users\maatr\.claude\plans\regalon-necesito-contruir-una-sorted-diffie.md`

---

## 📊 Contexto

El usuario reporta que el Historial de Actividad (`Configuración → Sistema & Correo → Historial`) "casi no se usa porque es tedioso y mal estructurado".

Audit (1 Explore agent profundo) identificó 5 patologías principales:

| # | Patología | Razón en el código |
|---|-----------|-------------------|
| 1 | **Spam de logins ahoga la señal** | Cada login = 1 fila ("Inicio de sesión exitoso: x@y"). Pasar 4 páginas para ver un UPDATE. |
| 2 | **Sin filtros contextuales** | Buscador único hace `LIKE` sobre `modulo|detalle`. Sin dropdown usuario, rango fechas, ni filtro acción. |
| 3 | **Detalles ocultos tras modal** | Diff sólo aparece al click "Ver detalles". 4 formatos JSON distintos en `detalle` (legacy, compact, summary, bulk). |
| 4 | **IP + UA = ruido visual** | Para no-técnicos, `127.0.0.1` y `Mozilla/5.0` truncado son inútiles. |
| 5 | **Sin contexto de entidad** | "Editó trabajador ID 42" → nadie recuerda quién es 42. Solo hay `item_id` numérico. |

**Performance riesgo:** sin índice compuesto `(usuario_id, modulo, created_at)`. Con 6 meses × 100 users × 10 logs/día ≈ 180k filas, `LIKE` escanea full table.

### Mapa actual del feature

**Backend:**
- Tabla DB: `logs_actividad` ([backend/db/migrations/011_log_actividad.sql](backend/db/migrations/011_log_actividad.sql)) — 8 columnas, 3 índices simples, FK a `usuarios` ON DELETE SET NULL.
- Middleware: [backend/src/middleware/logger.js](backend/src/middleware/logger.js) — auto-loguea POST/PUT/DELETE; excluye `/asistencias/bulk`, `/health`, `/logs`, `/auth`, `/kpi`, `/exportar`, `/enviar`, `/download`.
- Logging manual: `logManualActivity()` (línea 244) — usado por `auth.controller.js:14` (login), `asistencia.service.js` (bulk).
- Endpoint: [backend/src/routes/logs.routes.js](backend/src/routes/logs.routes.js) — `GET /logs?q=&page=&limit=20`.

**Frontend:**
- Componente: [frontend/src/components/settings/ActivityLogsPanel.tsx](frontend/src/components/settings/ActivityLogsPanel.tsx) — cards uniformes, buscador único, paginación Anterior/Siguiente.
- Normalizador: [frontend/src/utils/logNormalizer.ts](frontend/src/utils/logNormalizer.ts) — parsea 4 formatos JSON distintos (legacy `{antes,nuevo}`, compact `{type,cambios}`, summary `{type,resumen,datos}`, bulk_asistencia).

---

## ✅ Decisiones del usuario (Phase 3)

| Decisión | Elección | Implicación |
|----------|----------|-------------|
| **Logins** | Ocultos por default + toggle "Ver accesos" | Filtro por defecto excluye `accion='LOGIN'`. Checkbox los suma. |
| **Entidad** | Columnas `entidad_tipo` + `entidad_label` | Migración 041 agrega ambas. Middleware las popula resolviendo desde tabla maestra o body. |
| **Retención** | Sin política | Logs permanentes. Reevaluar al pasar 1M filas. |
| **Extras** | Sólo Export CSV con filtros | Severidad tipada, drill-down de entidad, anonimización IP quedan **fuera de alcance**. |

---

## 🔴 Sprint 1 — Backend schema + middleware enriquecido

**Objetivo:** persistir entidad humana-legible en cada log y agregar índices compuestos para los filtros del Sprint 2.

### 1.1 Migración 041 — `historial_entidad_y_indices.sql` ⏳

**Archivo nuevo:** `backend/db/migrations/041_historial_entidad_y_indices.sql`

Patrón idempotente (`information_schema + PREPARE/EXECUTE` heredado de migraciones 037-040). Tipos consistentes con `usuarios.id` (INT signed).

```sql
-- A. Columna entidad_tipo (ej: 'trabajador', 'transferencia', 'sabado_extra')
ALTER TABLE logs_actividad
  ADD COLUMN entidad_tipo VARCHAR(40) NULL AFTER item_id;

-- B. Columna entidad_label (nombre humano: 'Juan Pérez', 'TRF-2026-001')
ALTER TABLE logs_actividad
  ADD COLUMN entidad_label VARCHAR(160) NULL AFTER entidad_tipo;

-- C. Índices compuestos para filtros frecuentes
ADD INDEX idx_logs_modulo_created (modulo, created_at DESC);
ADD INDEX idx_logs_usuario_created (usuario_id, created_at DESC);
ADD INDEX idx_logs_accion (accion);
ADD INDEX idx_logs_entidad (entidad_tipo, entidad_label);
```

**Sin backfill de logs viejos** — quedan con `entidad_*` NULL. Frontend tolera ambos casos: usa `item_id` como fallback cuando `entidad_label` no existe.

### 1.2 Resolver entidad en middleware ⏳

**Archivo:** `backend/src/middleware/logger.js`

Helper nuevo `resolveEntidad(modulo, item_id, body)`:

```js
const ENTIDAD_RESOLVERS = {
  trabajadores:   { tipo: 'trabajador',    tabla: 'trabajadores',     label: "CONCAT(nombres, ' ', apellido_paterno)" },
  obras:          { tipo: 'obra',          tabla: 'obras',            label: 'nombre' },
  empresas:       { tipo: 'empresa',       tabla: 'empresas',         label: 'razon_social' },
  cargos:         { tipo: 'cargo',         tabla: 'cargos',           label: 'nombre' },
  usuarios:       { tipo: 'usuario',       tabla: 'usuarios',         label: 'nombre' },
  transferencias: { tipo: 'transferencia', tabla: 'transferencias',   label: 'codigo' },
  inventario:     { tipo: 'item',          tabla: 'items_inventario', label: 'descripcion' },
  'sabados-extra': { tipo: 'sabado_extra', tabla: 'sabados_extra',    label: "CONCAT('Sábado ', fecha)" },
  documentos:     { tipo: 'documento',     tabla: 'documentos',       label: 'nombre_archivo' },
  // Agregar más según necesidad — en RUNBOOK § 14 hay guía paso a paso.
};

async function resolveEntidad(modulo, item_id, body) {
  const cfg = ENTIDAD_RESOLVERS[modulo];
  if (!cfg) return { tipo: null, label: null };

  // Caso 1: tenemos item_id → query directa a tabla maestra
  if (item_id) {
    try {
      const [rows] = await db.query(
        `SELECT ${cfg.label} AS label FROM ${cfg.tabla} WHERE id = ?`,
        [item_id]
      );
      if (rows.length > 0) return { tipo: cfg.tipo, label: rows[0].label };
    } catch { /* fallback siguiente */ }
  }

  // Caso 2: CREATE sin item_id aún — extraer label del body
  if (body?.codigo)        return { tipo: cfg.tipo, label: body.codigo };
  if (body?.razon_social)  return { tipo: cfg.tipo, label: body.razon_social };
  if (body?.nombre)        return { tipo: cfg.tipo, label: body.nombre };
  if (body?.nombres && body?.apellido_paterno) {
    return { tipo: cfg.tipo, label: `${body.nombres} ${body.apellido_paterno}` };
  }

  return { tipo: cfg.tipo, label: null };
}
```

INSERT del middleware ahora incluye `entidad_tipo, entidad_label`:
```js
const entidad = await resolveEntidad(modulo, item_id, req.body);
await db.query(
  `INSERT INTO logs_actividad
    (usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle, ip, user_agent)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [usuario_id, modulo, accion, item_id, entidad.tipo, entidad.label, detalle, ip, ua]
);
```

`logManualActivity()` extiende firma con params opcionales `entidad_tipo, entidad_label` (default null para retrocompat).

### 1.3 Tests Sprint 1 ⏳

**Archivo nuevo:** `backend/tests/logger_entidad.test.js`

Cobertura:
- Resolver entidad por tabla maestra (mock de `db.query`).
- Resolver desde body en CREATE (sin item_id aún).
- Sin resolver si modulo desconocido → `{ tipo: null, label: null }`.
- INSERT del middleware incluye las columnas nuevas.
- `logManualActivity()` tolera params nuevos como undefined.

**Total esperado:** +6 tests aprox.

---

## 🟠 Sprint 2 — Backend filtros + export CSV

**Objetivo:** API que permite filtrar por todas las dimensiones útiles y exportar el resultado a CSV.

### 2.1 Refactor `GET /api/logs` con filtros completos ⏳

**Archivo:** `backend/src/routes/logs.routes.js`

Query params soportados:
| Param | Tipo | Descripción |
|-------|------|-------------|
| `q` | string | Búsqueda libre en `entidad_label OR detalle OR usuario.nombre` |
| `usuario_id` | int | Filtro exacto |
| `modulo` | string | Filtro exacto |
| `accion` | CSV string | Multi-select: `CREATE,UPDATE,DELETE` |
| `entidad_tipo` | string | Filtro exacto |
| `desde` / `hasta` | YYYY-MM-DD | Rango fechas (inclusive) |
| `incluir_logins` | bool | Default `false` — excluye `accion='LOGIN'` |
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 200 |

Response:
```json
{
  "data": [...],
  "total": 1234,
  "page": 1,
  "limit": 20,
  "total_pages": 62
}
```

Implementación con WHERE dinámico + COUNT(*) para `total`. Permiso sin cambio: `sistema.logs.ver`.

### 2.2 Endpoint `/api/logs/filtros` ⏳

Devuelve datos para llenar los selects del frontend (1 sola llamada al montar el panel):

```json
{
  "usuarios": [{ "id": 1, "nombre": "Mauricio Álvarez" }, ...],
  "modulos": ["trabajadores", "obras", "asistencias", ...],
  "entidad_tipos": ["trabajador", "obra", "transferencia", ...]
}
```

Queries simples con `SELECT DISTINCT` sobre la tabla logs (no sobre tabla maestra — sólo lo que efectivamente aparece en logs).

### 2.3 Endpoint `/api/logs/export` (CSV) ⏳

Mismos filtros que `/api/logs`, sin paginación, máximo 50.000 filas (tope hard de seguridad).

```js
res.setHeader('Content-Type', 'text/csv; charset=utf-8');
res.setHeader('Content-Disposition', `attachment; filename="historial_${fecha}.csv"`);
res.write('﻿'); // BOM UTF-8 para Excel

res.write('Fecha,Usuario,Módulo,Acción,Entidad,Resumen,IP\n');
for (const r of rows) {
  const resumen = parseDetailToResumen(r.detalle);
  res.write(csvLine([
    r.created_at, r.usuario_nombre || 'Sistema', r.modulo, r.accion,
    r.entidad_label || r.item_id || '', resumen, r.ip || ''
  ]));
}
res.end();
```

Helper `csvLine`: escapa comillas dobles + envuelve en comillas si hay coma/quote/newline. `parseDetailToResumen`: extrae `resumen` del JSON o devuelve string flat si legacy.

### 2.4 Tests Sprint 2 ⏳

**Archivo nuevo:** `backend/tests/logs_filtros.test.js`

Cobertura:
- Filtro por `usuario_id`.
- Filtro por `accion` múltiple (CSV → IN clause).
- Filtro por rango fechas (`desde`/`hasta`).
- `incluir_logins=false` excluye LOGIN.
- Paginación: `total_pages = Math.ceil(total / limit)`.
- `/filtros` devuelve usuarios distintos (no duplicados).
- `/export` retorna CSV con BOM, header correcto, content-disposition attachment.
- Tope 50.000 filas en export.

**Total esperado:** +8 tests aprox.

---

## 🟡 Sprint 3 — Frontend UX (panel filtros + resumen inline + export)

**Objetivo:** convertir la lista plana actual en una herramienta de auditoría real.

### 3.1 Refactor `ActivityLogsPanel.tsx` ⏳

**Archivo:** `frontend/src/components/settings/ActivityLogsPanel.tsx`

Layout nuevo:
```
┌────────────────────────────────────────────────────┐
│ Filtros (collapsible bar)                          │
│ [Usuario ▼] [Módulo ▼] [Acción ▼] [Desde] [Hasta]  │
│ [Buscar...]  [☐ Incluir accesos]  [⇩ Export CSV]   │
├────────────────────────────────────────────────────┤
│ • Lista de logs (filas más densas, 1 línea)        │
│   ↳ Cada fila: usuario · acción · entidad · resumen inline · timestamp
│   ↳ "Ver más" abre modal SOLO si diff > 3 campos o bulk
├────────────────────────────────────────────────────┤
│ ← Anterior  Página 1 de 62  Siguiente →            │
└────────────────────────────────────────────────────┘
```

Nuevo state:
```tsx
const [filters, setFilters] = useState({
  q: '',
  usuario_id: '',
  modulo: '',
  accion: [] as string[],
  desde: '',
  hasta: '',
  incluir_logins: false,
});
const [filterOptions, setFilterOptions] = useState({
  usuarios: [], modulos: [], entidad_tipos: []
});
const [totalPages, setTotalPages] = useState(1);
```

`useEffect` carga `/api/logs/filtros` una vez al montar. `fetchLogs(page)` envía todos los filtros como query params (URLSearchParams). Debounce 300ms en `q`.

### 3.2 Resumen inline (sin modal en mayoría de casos) ⏳

Reemplazar `<LogDetails>` con render que muestra el resumen del JSON directo cuando es corto (≤120 chars). Modal sólo cuando hay diff con > 3 campos o `bulk_asistencia`.

Render de fila:
```tsx
<div className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
  <Badge color={accionColor}>{accionLabel}</Badge>
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2 text-sm">
      <span className="font-bold">{usuario_nombre}</span>
      <span className="text-muted">{moduloLabel}</span>
      {entidad_label && <span className="font-medium">→ {entidad_label}</span>}
    </div>
    <div className="text-xs text-muted truncate">{resumenInline}</div>
  </div>
  <span className="text-xs text-muted shrink-0">{fecha}</span>
  {hasComplexDiff && <button onClick={() => setOpenDetail(log)}>...</button>}
</div>
```

IP y UA se ocultan en la fila — accesibles vía tooltip al hover sobre el avatar (o sólo visibles dentro del modal de detalle).

### 3.3 Botón Export CSV ⏳

```tsx
<Button onClick={() => {
  const params = new URLSearchParams(serializeFilters(filters));
  window.open(`/api/logs/export?${params}`, '_blank');
}}>
  Export CSV
</Button>
```

Reusa el mismo state de filtros — el archivo refleja exactamente lo que está en pantalla.

### 3.4 Toggle "Incluir accesos" ⏳

Checkbox simple junto al buscador. Al togglear refresca página 1.

### 3.5 Paginación real ⏳

Usar `total_pages` del backend. Mostrar "Página X de Y". Botones Anterior/Siguiente disabled correctamente. Considerar input numérico para saltar a página.

---

## 🔵 Sprint 4 — Docs + cleanup

### 4.1 Documentación RUNBOOK § 14 ⏳

**Archivo:** `docs/RUNBOOK.md`

Sección nueva con:
- **Qué es:** auditoría automática de cambios en el sistema.
- **Cómo funciona el middleware:** auto-loguea POST/PUT/DELETE excepto rutas excluidas (lista en `logger.js:184-190`).
- **Tabla `logs_actividad`:** columnas, índices, FKs.
- **Lista de módulos en `ENTIDAD_RESOLVERS`** y guía paso-a-paso para agregar uno nuevo.
- **Filtros disponibles** en `/api/logs` y export CSV.
- **Permisos:** `sistema.logs.ver` (sin cambio).
- **Por qué los logins están ocultos por default** (decisión del audit).
- **Errores comunes:** logs duplicados (idempotency flag), bulk_asistencia se loguea aparte.

### 4.2 Centralizar constantes ⏳

**Archivo nuevo:** `backend/src/config/log-config.js`

Mover desde `middleware/logger.js`:
- `EXCLUDED_KEYS` (campos sensibles a no loguear)
- `LABEL_MAP` (nombres técnicos → legibles)
- `ENTIDAD_RESOLVERS` (mapa por módulo)
- `ACCIONES_VISIBLES = ['CREATE','UPDATE','DELETE','UPLOAD','EMAIL']` (excluye LOGIN)

Razón: el endpoint `/export` necesita acceso a `LABEL_MAP` y la función `parseDetailToResumen`. Centralizar evita duplicación.

### 4.3 Actualizar este ROADMAP ⏳

Marcar cada item como completado al cerrar su sprint. Igual que `ROADMAP_INVENTARIO_AUDITORIA.md` y `ROADMAP_SABADOS_EXTRA_AUDITORIA.md`.

---

## 🧪 Verificación end-to-end

Por cada sprint:
- `cd backend && npm test` — todos los tests pasan.
- `cd frontend && npx tsc --noEmit` — sin errores.
- Push a `develop` → deploy automático staging.

### Smoke tests por sprint (manual en staging)

**Sprint 1:**
- Crear/editar/eliminar un trabajador → log incluye `entidad_tipo='trabajador'` y `entidad_label='Juan Pérez'` (no NULL).
- Crear una transferencia → `entidad_label = 'TRF-2026-001'`.
- DELETE → `entidad_label` queda como estaba antes del DELETE (resuelto desde item_id en pre-lectura).

**Sprint 2:**
- `GET /api/logs?modulo=trabajadores&accion=DELETE&desde=2026-04-01` retorna sólo deletes de abril en módulo trabajadores.
- `total_pages` correcto (calcular manual con SQL `COUNT(*)`).
- `GET /api/logs/export?modulo=transferencias` descarga CSV legible en Excel sin caracteres rotos.
- Tope 50.000 filas: con un export sin filtros, debe truncarse y advertir.

**Sprint 3:**
- Filtros operan en cliente sin recargar página completa.
- Toggle "incluir accesos" agrega filas LOGIN a la lista.
- Botón Export descarga CSV con los filtros activos exactos.
- Página X de Y mostrada correctamente; saltar a página 5 funciona.
- IP/UA ocultos en lista, visibles al hover/click en detalle.

**Sprint 4:**
- RUNBOOK § 14 actualizado y revisado.
- Este ROADMAP con todos los items en ✅.
- `backend/src/config/log-config.js` importado desde middleware y endpoint export.

### Acción manual en staging

Tras deploy del Sprint 1: **aplicar migración 041** vía cPanel:
- cPanel → Setup Node.js App → Run JS script → `migrate`
- Verificar log: "✅ 041_historial_entidad_y_indices.sql aplicada"
- Validar columnas con: `DESCRIBE logs_actividad;`

---

## 📂 Critical files

### Backend nuevos/modificados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `backend/db/migrations/041_historial_entidad_y_indices.sql` | NUEVO | Columnas entidad_tipo + entidad_label + 4 índices compuestos |
| `backend/src/middleware/logger.js` | REFACTOR | Helper `resolveEntidad`, INSERT con columnas nuevas |
| `backend/src/routes/logs.routes.js` | REFACTOR | Filtros completos + endpoints /filtros y /export |
| `backend/src/config/log-config.js` | NUEVO | Constantes compartidas (EXCLUDED_KEYS, LABEL_MAP, ENTIDAD_RESOLVERS) |
| `backend/tests/logger_entidad.test.js` | NUEVO | Tests del helper de resolución de entidad |
| `backend/tests/logs_filtros.test.js` | NUEVO | Tests de filtros y export CSV |

### Frontend modificados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `frontend/src/components/settings/ActivityLogsPanel.tsx` | REFACTOR mayor | Panel filtros + paginación real + export + resumen inline |
| `frontend/src/utils/logNormalizer.ts` | EXTENDER | Soportar nuevo schema con entidad_label |

### Docs

| Archivo | Tipo |
|---------|------|
| `ROADMAP_HISTORIAL_AUDITORIA.md` | Este doc — checklist progresivo |
| `docs/RUNBOOK.md` | Sección § 14 nueva |

### No modifica (reusa)

- `frontend/src/utils/whatsappShare.ts`, `toastUtils.tsx`, `fechas.ts`
- `backend/src/middleware/validateBody.js`
- Sistema de permisos (`sistema.logs.ver` ya existe)

---

## 📌 Notas para futuras sesiones

- **Migración 041 es idempotente** (patrón heredado de 037-040). Re-correrla en producción es seguro.
- **Logs viejos** quedan con `entidad_tipo = NULL` y `entidad_label = NULL`. Frontend los maneja con fallback a `item_id`.
- **No modifica el comportamiento de los logs nuevos del feature Sábados Extra** — ya pasan por el mismo middleware con `modulo='sabados-extra'`. Solo se enriquecen automáticamente al agregar `'sabados-extra'` al `ENTIDAD_RESOLVERS`.
- **El permiso `sistema.logs.ver`** ya está definido — sin cambios en `permisos.config.js`.
- **Si en el futuro se necesita severidad tipada** (INFO/WARNING/ERROR): agregar columna `severidad ENUM(...) DEFAULT 'INFO'` con backfill basado en `accion` (DELETE → ERROR, UPDATE → WARNING, resto → INFO). No incluido en este alcance.
- **Si en el futuro se necesita drill-down de entidad** ("ver todo lo que pasó con trabajador X"): el índice `idx_logs_entidad (entidad_tipo, entidad_label)` ya soporta esa query eficientemente.
- **Si la tabla supera 1M filas:** considerar partición por `YEAR(created_at)` o archivo a tabla `logs_actividad_archivo`. No incluido en este alcance.

---

## 📈 Resumen de progreso

| Sprint | Estado | Items |
|--------|--------|-------|
| 1 — Backend schema + middleware | ⏳ Pendiente | Migración 041, resolveEntidad, INSERT enriquecido, 6 tests |
| 2 — Backend filtros + export | ⏳ Pendiente | Filtros completos en /logs, /filtros, /export CSV, 8 tests |
| 3 — Frontend UX | ⏳ Pendiente | Panel filtros, resumen inline, export, paginación real |
| 4 — Docs + cleanup | ⏳ Pendiente | RUNBOOK § 14, log-config.js, marcar items en este doc |

**Tests del proyecto antes de empezar:** 205 / 205. Esperado al cierre: ~219 / 219 (+14).

---

> **Próximo paso recomendado al retomar:** arrancar Sprint 1.1 con la migración 041 (es la base para todo lo demás). El middleware (1.2) y los tests (1.3) van en el mismo commit. Luego Sprint 2 → tsc → Sprint 3 → tsc → Sprint 4 → commit final con merge a develop.
