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
- **Doble defensa**: la UI oculta columnas/cards Y el backend **sanitiza el JSON**
  (`backend/src/utils/sanitizeFinancialFields.js`) — sin permiso, los montos no llegan ni por
  DevTools. El backend es la fuente de verdad.

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
- `validateBody` actual NO stripea keys desconocidas — los servicios se defienden con
  `allowedFields` whitelist (crud.service). **Fase 1 del plan v2 lo reemplaza por zod con strip.**
- Gating en UI: `hasPermission()` del AuthContext (~250 usos inline; Fase 3 introduce
  `<RequirePermission>`).

## Reglas duras de seguridad (de sesiones)

- Credenciales NUNCA en código/commits — solo `.env` del servidor.
- La contraseña de `reportes@lols.cl` fue expuesta en chat → **DEBE rotarse** (pendiente).
