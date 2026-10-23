# Reglas — Seguridad y RBAC

## Catálogo de permisos

- **Fuente de verdad**: `backend/src/config/permisos.config.js` → `MAESTRO_PERMISOS`
  (~95+ permisos; formato `[clave, módulo, nombre, descripción, orden]`).
- Módulos: Asistencia, Trabajadores, Documentos, Reportes, Empresas, Obras, Cargos, Usuarios,
  Inventario (incl. 9 granulares de transferencias + 6 tabs), Financiero, Vehículos, Sistema.
- El catálogo se **sincroniza al correr `migrate`/`maintenance`** (`syncCatalogoEnArranque`; NO en el
  boot del backend): INSERT … ON DUPLICATE KEY UPDATE de nombre/descr/orden; nunca borra claves. Agregar
  un permiso = agregarlo al array + migrate (el auto-migrate del deploy lo hace). Renombrar una clave =
  migración con INSERT nuevas → UPDATE hijos → DELETE viejas → `roles.version + 1` (ver RUNBOOK § 6 y
  mig 116 `actividades_sugeridas`).

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
- `documentos.laborales.descargar` (mig 110, plan Gestiones B2) **implica ver la remuneración**: el
  contrato que descarga o imprime trae el sueldo base impreso en cifras y en letras. Tratarlo como
  permiso sensible aunque no esté en `PERMISOS_FINANCIEROS`. El snapshot `documentos.metadata` (que
  congela ese monto) nunca sale por rutas con `documentos.ver`: proyección explícita de columnas +
  `EXCLUDED_KEYS`. Ver rrhh-trabajadores.md § Documentos laborales generados por Bóveda.
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
- Caso vigente: `inventario.transferencias.diferencias_ver` (mig 131, «Ver diferencias») abre solo lo de
  **VER** diferencias con OR sobre `inventario.transferencias.aprobar`: `GET /transferencias/discrepancias`, el
  filtro «Diferencias» y su detalle en solo lectura (`TransferenciasPanel`), y el grupo `discrepancias` de
  `resumenInicio` (Inicio). Resolver, rehacer y subir foto siguen con `aprobar` solo (sin OR). Ver inventario-transferencias.md § Ver diferencias sin resolverlas.
- ⚠️ **Excepción deliberada**: `documentos.laborales.emitir` / `.descargar` y `cargos.sueldo.*` usan gate
  **EXCLUSIVO** (un solo permiso, sin OR con el genérico del módulo). Son "solo oficina": heredarlos desde
  `documentos.descargar` o `cargos.ver` daría acceso a contratos y remuneraciones a todo terreno.
- ⚠️ Al asignar por migración: insertar primero en `permisos_catalogo` (hay FK desde
  `permisos_rol_v2.permiso_clave`) y avisar **re-login** — el token trae la lista de permisos.

## SoD transferencias

- 9 permisos granulares: solicitar, aprobar, despachar, recibir, cancelar, push_directo,
  intra_bodega, orden_gerencia, **sod_bypass**. Detalle en inventario-transferencias.md.
- Más `diferencias_ver` (mig 131): mirar las diferencias sin resolverlas (no es un paso del flujo, no entra en
  la SoD).
  Con el mismo OR sobre `aprobar` abre la lista `diferencias` del Inicio por perfil (`GET /transferencias/inicio/perfil`,
  `inicioPerfil`); sin ninguno de los dos viene `null`. Ver inventario-transferencias.md § Inicio por perfil.

## Overrides por usuario

- `permisos_usuario_override`: grant/deny/default por usuario individual, con precedencia sobre el
  rol (UI: Settings → Usuarios → Permisos personalizados).

## Roles: Super Administrador vs Administrador (2026-10-21)

- **Super Administrador** = quienes programan y prueban (Marcos, Mauricio): todo el catálogo. Se reconoce por el
  **rol 1** (`rol_id`), no por un permiso (los tiene todos): así lo hace el servidor (`super_admin` de
  `inicioPerfil`, rehacer diferencias) y el frontend (`esSuperAdmin` de `inventarioPerfil/perfil.ts`,
  `TransferenciasPanel`). En el Inicio tiene su vista propia de Inventario y «Ver como» para mirar el formato de los
  demás con SUS datos (solo UX: no pide nada ni da permisos; inventario-transferencias.md § «Ver como»).
- **Administrador** (mig 126) = dueños y jefatura (Paula Martínez, Rodrigo Riquelme, Leonardo López,
  Matías Millanao, Luis Lazcano, Daphne Lazcano): **ven todo y toman decisiones de jefatura**, sin la
  operación diaria, sin configuración del sistema (usuarios, roles, permisos, correo, plantillas, catálogos
  de estados/tipos, avisos, historial, revisar ideas) y sin borrados ni flujos que saltan controles
  (depurar, eliminar transferencias, SoD bypass, push directo, intra-bodega). 38 permisos (39 hasta la mig 131):
  ver de Asistencia (con horas extra y todas las obras), Trabajadores (con financiero), Documentos (descargar
  incluido laborales), Gestiones (exportar/enviar), catálogos, Inventario completo con valores + orden de
  gerencia, Vehículos y Presupuestos (`costos.gestionar`, único permiso del módulo). **Aprobar solicitudes de
  inventario ya NO es del rol** (mig 131): solo Leonardo, como permiso propio (abajo).
- Lo que una persona necesite de más se agrega de a poco como **permiso propio** (override `grant`), no al
  rol — preguntar a Marcos antes. Mig 127: Paula y Matías (RRHH) → emitir documentos laborales, registrar
  entregas físicas, crear y editar trabajadores (editar: el contrato pide completar la ficha); Leonardo →
  crear y editar vehículos. Mig 128: Paula y Matías además → aprobar fichas de ingreso, subir documentos,
  finiquitar/reactivar, asignar y borrar períodos, feriados; Rodrigo, Luis y Daphne → crear, editar y
  finalizar obras. Esos cinco reciben también `usuarios.ver` (solo mirar), porque el menú **Configuración**
  aparece solo con ese permiso (`Sidebar.tsx`) y ahí viven obras y feriados. Se busca a la persona por correo (si no existe en ese entorno, no se agrega). Las personas se asignan en Configuración →
  Usuarios y deben re-loguear (los permisos viajan en el JWT).
- **Mig 131 (2026-10-22, «solo Leonardo aprueba»)**, decisión del dueño (Marcos avisa a Mauricio):
  - `inventario.transferencias.aprobar` sale del rol Administrador y queda como permiso propio de **Leonardo
    López**: es el único del rol que aprueba o rechaza solicitudes y resuelve diferencias. Paula, Rodrigo,
    Matías, Luis y Daphne dejan de aprobar (si alguno tenía `aprobar` como permiso propio, también se quita).
  - **Daphne Lazcano** recibe `inventario.transferencias.diferencias_ver` («Ver diferencias», permiso nuevo):
    ve la lista y el detalle de las diferencias en solo lectura y el Inicio se las cuenta y muestra, sin poder
    resolverlas. Por ahora es la única con ese permiso.
  - **Leonardo y Daphne** reciben `inventario.transferencias.cancelar` (cancelar solicitudes pendientes o
    aprobadas; las que van en tránsito siguen pidiendo «Cancelar en Tránsito», que no se dio).
  - Los permisos propios se graban con `ON DUPLICATE KEY UPDATE tipo = 'grant'` (pisa un `deny` previo). Re-login:
    `roles.version + 1` del rol Administrador y del rol de Leonardo/Daphne si en ese entorno es otro (nunca del
    rol 1). Ojo: `versionService` guarda las versiones en memoria → el cierre de sesiones corre recién cuando el
    backend se reinicia (el auto-migrate del deploy lo hace; corriendo migrate a mano, reiniciar).
  - Super Administrador no cambia (tiene todo el catálogo; `diferencias_ver` queda también en su rol).

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
- **Teléfono del conductor** (mig 132, `conductores.telefono`): dato personal que solo ve quien tiene
  **`vehiculos.ver`** (sirve para avisarle por WhatsApp de los papeles del vehículo). Las rutas de vehículos que lo
  leen ya piden ese permiso; `ocultarCamposSinPermiso(permiso, campos)` (`middleware/ocultarCampos.js`, envuelve
  `res.json` como `sanitizeItemsMaestroMiddleware`) lo quita de `/api/conductores` (que se abre con
  `conductores.*`) y de las respuestas de POST/PUT de `/api/vehiculos` (`vehiculos.crear/editar`). Se puede
  escribir desde el form del vehículo con `vehiculos.crear/editar` aunque no se tenga `conductores.editar`
  (decisión del dueño 2026-10-22). Staging lo deja en NULL (saneo). Detalle: vehiculos.md § Teléfono del conductor.
- **Pre-registro de permisos (B1)**: las 6 claves de los bloques B2-B7 del plan Gestiones
  (`documentos.laborales.emitir/.descargar`, `documentos.entrega.registrar`, `cargos.sueldo.ver/.editar`,
  `sistema.alertas_documentos.gestionar`) ya están en `permisos.config.js` + `permisosHierarchy.ts` con
  descripción "(Disponible próximamente)"; el catálogo las sincroniza al arrancar pero NINGÚN endpoint las
  exige aún. Cada bloque quita el rótulo y asigna a roles por migración (catálogo → rol 1 → por nombre).
  Guard: `backend/tests/permisos_hierarchy_sync.test.js` (toda clave del catálogo mapeada en la jerarquía).

## Reglas duras de seguridad (de sesiones)

- Credenciales NUNCA en código/commits — solo `.env` del servidor.
- La contraseña de `reportes@lols.cl` fue expuesta en chat → **DEBE rotarse** (pendiente).
