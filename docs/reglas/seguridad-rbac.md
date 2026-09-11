# Reglas — Seguridad y RBAC

## Catálogo de permisos

- **Fuente de verdad**: `backend/src/config/permisos.config.js` → `MAESTRO_PERMISOS`
  (~95+ permisos; formato `[clave, módulo, nombre, descripción, orden]`).
- Módulos: Asistencia, Trabajadores, Documentos, Reportes, Empresas, Obras, Cargos, Usuarios,
  Inventario (incl. 9 granulares de transferencias + 6 tabs), Financiero, Vehículos, Sistema.
- El catálogo se **sincroniza en cada arranque/migrate** (`syncCatalogoEnArranque`): INSERT IGNORE
  de claves nuevas. Agregar un permiso = agregarlo al array + correr migrate (o reiniciar).

## JWT y sesión

- Login acuña JWT con `{ id, email, rol_id, obra_id, p: [permisos], rv: rolVersion }`; expira 8h
  (`JWT_EXPIRES_IN`). **No hay refresh token** → re-login tras expirar.
- **Los permisos viven en el token**: cambiar permisos de un rol NO afecta sesiones vivas hasta
  re-login. Por eso `roles.version` (mig 047): al cambiar permisos se bumpea → tokens con `rv`
  viejo se rechazan → fuerza re-login. **Regla operativa: tras correr migrate con permisos nuevos,
  re-login.**
- No existe password-reset por email; solo cambio en-app con contraseña actual.

## Permisos financieros (deny-by-default)

- ~10 claves: `inventario.costos.ver/editar`, `inventario.facturas.ver/gestionar`,
  `inventario.bombas.ver_costos`, `inventario.descuentos.gestionar`,
  `inventario.resumen.ver_valores`, `asistencia.horas_extra.ver`,
  `trabajadores.financiero.ver/editar`.
- Política: solo Super Admin (rol 1) los recibe automáticamente; al resto se asignan a mano.
- `cargos.sueldo.ver/.editar` (mig 111, plan Gestiones B3) son $ pero viven en el módulo **Cargos** y
  NO en `PERMISOS_FINANCIEROS` (lista exclusiva de inventario); gates exclusivos sin patrón OR; los montos
  jamás entran a `logs_actividad` (exclusión en `logger.js` + `EXCLUDED_KEYS`). Ver rrhh-trabajadores.md.
- **Doble defensa**: la UI oculta columnas/cards Y el backend **sanitiza el JSON**
  (`backend/src/utils/sanitizeFinancialFields.js`) — sin permiso, los montos no llegan ni por
  DevTools. El backend es la fuente de verdad.

## Permisos granulares sobre gates genéricos (patrón OR)

- Cuando un rol necesita UNA acción de un módulo sin heredar todo el módulo, se agrega una clave
  específica y el gate se vuelve **OR**: `checkPermission('inventario.bombas.crear',
  'inventario.crear')` (el middleware ya es OR) + el mismo `||` en el componente. Así el rol nuevo
  queda scopeado y **ningún rol existente pierde acceso** — no hace falta backfillear la clave nueva
  a los roles que ya tenían el genérico.
- Caso vigente: `inventario.bombas.crear` / `inventario.bombas.editar` (mig 098) para que "En
  Terreno" programe hormigón sin poder editar stock/ítems. Ver reglas/bombas.md.
- ⚠️ Al asignar por migración: insertar primero en `permisos_catalogo` (hay FK desde
  `permisos_rol_v2.permiso_clave`) y avisar **re-login** — el token trae la lista de permisos.

## SoD transferencias

- 9 permisos granulares: solicitar, aprobar, despachar, recibir, cancelar, push_directo,
  intra_bodega, orden_gerencia, **sod_bypass**. Detalle en inventario-transferencias.md.

## Overrides por usuario

- `permisos_usuario_override`: grant/deny/default por usuario individual, con precedencia sobre el
  rol (UI: Settings → Usuarios → Permisos personalizados).

## Middleware y endurecimiento

- `checkPermission(...claves)` (`src/middleware/rbac.js`): OR lógico sobre `req.user.p`.
- Rate limiting (`src/middleware/rateLimiter.js`): general 1000 req/15min por usuario; login 10
  intentos/15min por IP. Helmet activo; CORS restringible por env.
- `validateBody(schema, { strip: true })` (`middleware/validateBody.js`, mini-DSL propio SIN zod — decisión
  F1.3) descarta las claves no declaradas; los CRUD genéricos se defienden además con `allowedFields`
  (crud.service). Schemas en `backend/src/schemas/`.
- Gating en UI: `hasPermission()` del AuthContext (~250 usos inline; Fase 3 introduce
  `<RequirePermission>`).
- **Errores enriquecidos (2026-09-11, plan Gestiones B1)**: `errorHandler` responde `{ error, code?, ...details }`
  para 4xx cuando el service lanza `Object.assign(new Error(msg), { statusCode, code, details })`
  (`code` = string propio, nunca `ER_*`; `details` nunca pisa `error`). Los 5xx solo exponen `{ error }`.
  `ER_ROW_IS_REFERENCED_2` (FK RESTRICT) → 409 legible con `code`.
- **Quick-view del trabajador** (`GET /trabajadores/:id/quick-view`): gate `trabajadores.ver` OR
  `asistencia.ver`; sin `trabajadores.ver` la respuesta se recorta a la allow-list
  `CAMPOS_TRABAJADOR_OPERATIVOS` (`utils/sanitizeFinancialFields.js`): nada de dirección, AFP, salud,
  teléfono ni datos bancarios. Deny-by-default: una columna nueva de `trabajadores` no se filtra sola.
- **Pre-registro de permisos (B1)**: las 6 claves de los bloques B2-B7 del plan Gestiones
  (`documentos.laborales.emitir/.descargar`, `documentos.entrega.registrar`, `cargos.sueldo.ver/.editar`,
  `sistema.alertas_documentos.gestionar`) ya están en `permisos.config.js` + `permisosHierarchy.ts` con
  descripción "(Disponible próximamente)"; el catálogo las sincroniza al arrancar pero NINGÚN endpoint las
  exige aún. Cada bloque quita el rótulo y asigna a roles por migración (catálogo → rol 1 → por nombre).
  Guard: `backend/tests/permisos_hierarchy_sync.test.js` (toda clave del catálogo mapeada en la jerarquía).

## Reglas duras de seguridad (de sesiones)

- Credenciales NUNCA en código/commits — solo `.env` del servidor.
- La contraseña de `reportes@lols.cl` fue expuesta en chat → **DEBE rotarse** (pendiente).
