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
- Excepción: el token de «ver como» de Soporte (30 min, con `imp` + `ro`, solo lectura; § Ver como usuario).

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
- `aprobar` es solo de Leonardo López (permiso propio) y del Super Administrador desde la mig 133 (abajo, § Roles).
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
  inventario ya NO es del rol** (mig 131) **ni de ningún otro rol salvo Super Administrador** (mig 133): solo
  Leonardo, como permiso propio (abajo).
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
    aprobadas; las que van en tránsito piden «Cancelar en Tránsito», que se les dio en la mig 137).
  - Los permisos propios se graban con `ON DUPLICATE KEY UPDATE tipo = 'grant'` (pisa un `deny` previo). Re-login:
    `roles.version + 1` del rol Administrador y del rol de Leonardo/Daphne si en ese entorno es otro (nunca del
    rol 1). Ojo: `versionService` guarda las versiones en memoria → el cierre de sesiones corre recién cuando el
    backend se reinicia (el auto-migrate del deploy lo hace; corriendo migrate a mano, reiniciar).
  - Super Administrador no cambia (tiene todo el catálogo; `diferencias_ver` queda también en su rol).
- **Mig 133 (2026-10-23, «solo Leonardo aprueba, en TODOS los roles»)**, decisión del dueño («Sí, a todos»): la 131
  lo había quitado solo del rol Administrador y los roles de terreno que lo traían (p. ej. «Supervisor de Obra» en
  test) seguían aprobando. **Desde la 133 aprueban (y resuelven diferencias) solo Leonardo López, como permiso
  propio, y el Super Administrador (rol 1).** Regla: no volver a dar `inventario.transferencias.aprobar` a un rol ni
  a otra persona sin preguntar a Marcos.
  - Quita `aprobar` de `permisos_rol_v2` de **todos** los roles salvo el 1, y el `aprobar` propio (`grant`) de todas
    las personas salvo Leonardo (por correo). Los `deny` quedan. Leonardo queda con `aprobar` propio
    (`ON DUPLICATE KEY UPDATE tipo = 'grant'`; si no existe en ese entorno, nada). En test, Leonardo está en
    «Supervisor de Obra»: ese rol lo pierde y él lo conserva como propio.
  - **Quién debe volver a iniciar sesión** (`roles.version + 1`, que va PRIMERO, porque después del borrado ya no se
    sabe quién lo tenía): todos los de un rol (salvo el 1) que traía `aprobar`, y todos los del mismo rol que una
    persona (que no sea Leonardo) con `aprobar` propio, activa o no (el token no se revisa contra `usuarios.activo`).
    Si Leonardo está en uno de esos roles (en test), también re-loguea y vuelve con `aprobar` propio. El rol
    Administrador **no** re-loguea (ya no lo tenía y solo Leonardo lo tiene propio), salvo que alguien se lo haya
    devuelto a mano; el rol 1 nunca. Igual que en la 131, las sesiones se cierran cuando el backend se reinicia.
  - Idempotente (la segunda pasada no sube versiones ni borra nada) y sin subconsultas sobre `roles` en el UPDATE
    (MySQL 1093). Probada dos veces sobre MySQL 5.7 con sql_mode estricto y de MariaDB 10.6. Test:
    `backend/tests/transferencias_aprobar_solo_leonardo.test.js`.
- **Mig 137 (2026-10-26)**, dos decisiones del dueño:
  - `cargos.sueldo.ver` («Ver Parámetros de Sueldo») **sale del rol Administrador**: solo se usa en Configuración →
    Cargos, y Configuración aparece solo con `usuarios.ver`. Quien está en el rol y SÍ ve Configuración (`usuarios.ver`
    propio o del rol, sin «deny»: Paula, Matías, Rodrigo, Luis, Daphne por la mig 128) lo **conserva como permiso
    propio** (`INSERT IGNORE`, antes de borrarlo del rol); Leonardo y quien no ve Configuración lo pierden.
  - `inventario.transferencias.cancelar_en_transito` («Cancelar en Tránsito») como permiso propio de **Leonardo López**
    y **Daphne Lazcano** (por correo): ya cancelaban pendientes y aprobadas (mig 131); ahora también lo que va en
    camino (envío directo, orden de gerencia).
  - Re-login: `roles.version + 1` del rol Administrador y del rol de Leonardo/Daphne si es otro (nunca el rol 1).
- **Mig 134 (2026-10-23, «Inicio de gerencia»)**, decisión del dueño (lienzo de gerencia, opción B): permiso NUEVO
  `inicio.gerencia` (módulo «Inicio», sección Dashboard del modal de permisos) que abre el tablero «N temas esperan una
  decisión» arriba del Inicio y su `GET /api/dashboard/gerencia` (diseno.md §9.15). Por ahora solo **Luis Lazcano**,
  como permiso propio (`grant`, por correo; si no existe en ese entorno, nada); el rol 1 también lo tiene en su rol.
  Re-login: `roles.version + 1` del rol de Luis (nunca del rol 1). Idempotente (catálogo e insert del rol con
  `INSERT IGNORE`, el propio con `ON DUPLICATE KEY UPDATE tipo = 'grant'`; repetirla solo vuelve a subir la versión).
  El permiso **no amplía nada por sí solo**: cada tema del tablero pide además el permiso de su módulo
  (`asistencia.ver`, `vehiculos.ver`, `documentos.ver`, `inventario.ver` + `inventario.transferencias.ver_todas`) y los
  pesos de las pérdidas en Inventario, `inventario.costos.ver` o `inventario.resumen.ver_valores` (sin ellos el backend
  no manda ningún campo de $: doble defensa). Ojo, decisión a conocer: el tema «Pérdidas» muestra las diferencias
  pendientes con faltante a quien tenga `inicio.gerencia` + Inventario con `ver_todas`, **aunque no tenga**
  `diferencias_ver` (Luis no lo tiene); al tocar una, Inventario abre «Diferencias» si puede verlas y, si no, la
  solicitud misma (`TransferenciasPanel`). Probada dos veces sobre MySQL 5.7 (sql_mode estricto y de MariaDB 10.6).
  Test: `backend/tests/inicio_gerencia.test.js`.

## Ver como usuario (soporte)

Pedido del dueño (2026-10-23): «Soporte · usuarios» (`/soporte`, menú lateral «Soporte») para los dos Super
Administradores (Marcos y Mauricio): cuando alguien pregunta «¿por qué no veo X?», se busca a la persona, se ve su
**ficha** y, si hace falta, **«Ver como esta persona»** abre la app tal cual la ve ella, en **solo lectura**, sin
entrar y salir de su cuenta. Código: `backend/src/routes/soporte.routes.js`, `services/soporte.service.js`,
`middleware/superAdmin.js`, `middleware/auth.js`; frontend `pages/Soporte.tsx`, `components/soporte/`,
`context/verComoSesion.ts`, `context/AuthContext.tsx`, `services/api.ts`, `components/layout/FranjaVerComo.tsx`.
Test: `backend/tests/soporte_ver_como.test.js` (+ `fichaUsuario`, `verComoSesion`, `menuLateral` en el frontend).

**Quién: solo el rol 1** (`rol_id === 1`, mismo criterio que `super_admin` de `inicioPerfil` y `esSuperAdmin` de
`perfil.ts`). **No es un permiso del catálogo** (un permiso se puede regalar desde Configuración; el rol 1 no). Cada
endpoint de `/api/soporte` pasa por `auth` + `soloSuperAdmin`, que exige: (1) que el token NO sea de «ver como» (`imp`
/ `ro`) → 403 `VER_COMO_NO_ENCADENA`; (2) rol 1 en el token; (3) rol 1 **y activo en la BD** (el token puede tener 8 h)
→ si no, 403 `SOLO_SUPER_ADMIN`. Un Administrador con todos los permisos de usuarios recibe 403.

**Endpoints:**
- `GET /api/soporte/usuarios` — usuarios activos: nombre, correo, rol, obra, bodega (columnas explícitas, nunca
  `usuarios.*`: `password_hash` no sale).
- `GET /api/soporte/usuarios/:id` — la ficha: datos, obra (activa/finalizada), `efectivos` (exactamente lo que llevaría
  su token) y `permisos` con el **origen** de cada uno: `rol`, `propio` (override grant que el rol no trae) o `quitado`
  (deny sobre uno del rol; no está en `efectivos`). Sale de `permisosService.detallePermisos`, **el mismo cálculo del
  login** (`getPermisosEfectivos` = `detallePermisos().efectivos`; no hay un segundo cálculo). Más `sesion`: último
  ingreso y último cambio de sus permisos según `logs_actividad` (permisos de su rol, sus propios, su rol/obra/bodega
  desde la app; lo que cambia una migración no deja log).
- `GET /api/soporte/panorama` — los mismos usuarios activos (mismas columnas que la lista) + `efectivos` de cada uno,
  **en lote** con un número fijo de consultas (usuarios, permisos de los roles presentes, overrides de todos y el
  catálogo solo si hay rol 1), con la MISMA regla que el login: `permisosService.componerPermisos` (rol + grant − deny;
  rol 1 = todo el catálogo menos sus deny, salvo `SAFE_KEYS_SUPER_ADMIN`), que es la que usa `detallePermisos`. Test:
  `backend/tests/soporte_panorama.test.js`.
- `POST /api/soporte/usuarios/:id/ver-como` — el token prestado. Responde `Cache-Control: no-store` (todo `/api/soporte`).

**El token de «ver como»:** lo arma `authService.firmarSesion` (el mismo armado del login): `typ: 'session'`, `id`,
`email`, `rol_id`, `obra_id`, `bodega_id`, `p` (sus permisos efectivos), `rv` (versión de SU rol) **más `imp`** (id del
Super Administrador que mira) **y `ro: true`**, con **30 min** de vida. No se emite: para otro rol 1 (403
`VER_COMO_SUPER_ADMIN`), para un usuario inactivo (409 `USUARIO_INACTIVO`), para uno que no existe (404) ni para la
propia cuenta (400). Si al rol de esa persona le suben la versión mientras dura, el token muere igual que su sesión
(401) y la app vuelve a la cuenta propia.

**Solo lectura (`middleware/auth.js`):** con `ro: true` **o cualquier `imp`** (aunque faltara `ro`), todo lo que no sea
`GET`/`HEAD`/`OPTIONS` se rechaza **antes de la ruta** con `403 { error: 'Modo «ver como»: solo lectura', code:
'VER_COMO_SOLO_LECTURA' }`. Excepción, lista exacta `POST_SOLO_LECTURA`: `POST /api/inventario/stock-por-items` (solo
lee; manda una lista de ids que no cabe en la URL; sin él el Maestro y el detalle de una solicitud no muestran stock).
**Agregar una ruta ahí = revisar antes que su handler no escriba NADA.** Los montos siguen la regla de siempre: el
token trae SUS permisos, así que `sanitizeFinancialFields` y compañía recortan igual que para él.

**Historial:** el «ver como» queda en `logs_actividad` a nombre del Super Administrador: `modulo = 'soporte'`,
`accion = 'LOGIN'` (la columna es un ENUM cerrado; para no migrar), `item_id` = el mirado, resumen «<Super Admin> vio
como <usuario> (<rol>), solo lectura, 30 min». El Historial lo muestra siempre (el filtro que esconde los LOGIN deja
pasar `soporte`) con la etiqueta «VER COMO». El log genérico excluye `/api/soporte` (no duplica). Lo que se registre
durante la sesión prestada (p. ej. abrir un documento laboral, que es un GET con log) **nunca** queda a nombre del
mirado: `logManualActivity` lo pasa al `imp` y le agrega «(viendo como usuario #N)» (`atribuirVerComo`); el
`activityLogger` usa `imp` si existiera; el log de peticiones del servidor agrega `verComoPor`. Abrir un documento
laboral con «ver como» **no lo marca como descargado** (`documentosLaborales.service.abrir`). Las peticiones cuentan
contra el cupo del rate limit de quien mira, no del mirado.

**Frontend:** la cuenta propia sigue intacta en localStorage; la prestada va en **sessionStorage** (`sgdl_ver_como`:
solo esa pestaña, sobrevive un F5, se borra al cerrar la pestaña) y **nunca en la URL**. `api.ts` manda el token
prestado mientras exista (aunque haya vencido: el 401 devuelve a la propia en vez de mezclar cuentas). Entrar y salir
**recargan la app** (ningún dato en memoria de una cuenta queda bajo el menú de la otra). Franja ámbar fija arriba de
toda la app (`FranjaVerComo`, en `MainLayout`): «Viendo como <Nombre> (<rol>) · solo lectura · vence en N min · Volver a
mi cuenta». Se vuelve a la cuenta propia (a la ficha de esa persona, `/soporte?u=ID`) con el botón, con «Cerrar sesión»
del menú, al vencer (reloj de la franja) o con cualquier 401 del token prestado; si se cierra la sesión propia en otra
pestaña, también se cierra la prestada (al login). El 403 de solo lectura muestra un aviso claro («Estás viendo como
otra persona: solo lectura · No se guardó nada»).

**La ficha** calcula qué ve la persona con las MISMAS funciones de la app (nada duplicado): menú = `menuVisible`
(`components/layout/menuLateral.ts`, la regla que ahora usa el Sidebar), pestañas de Inventario =
`pestanasInventarioVisibles` (`components/inventario/pestanasInventario.ts`, la lista de `Inventario.tsx`), secciones de
Gestiones = `permisosGestiones` + `seccionesDisponibles` (`gestionesNav.ts`, las de `Consultas.tsx`), Inicio = Inicio
de gerencia (`inicio.gerencia`) + `vistaInventario` (`perfil.ts`). Más avisos puros (`components/soporte/fichaUsuario.ts`):
pide/recibe sin la pestaña Solicitudes, aprueba o ve diferencias sin «Ver todas las obras», sin ningún permiso de
Inventario, permisos de un módulo sin su «Ver …», obra finalizada/inactiva, bodega asignada, permisos quitados y
«cambiaron sus permisos después de su último ingreso: debe volver a iniciar sesión».

**Panorama (Marcos 2026-10-26):** selector «Personas | Panorama» arriba de Soporte (`?vista=panorama`). Tabla con una fila
por persona activa, agrupadas por rol, y una columna por cada sección del menú lateral en su orden (`SECCIONES_MENU`
de `menuLateral.ts`, con su ícono) más «Comparte tu idea»: ✓ donde la ve, según `menuVisible` / `veBuzonIdeas` con sus
`efectivos` (las mismas reglas de la ficha). La columna Inicio dice qué Inicio le toca (Super Admin / Gerencia / Aprueba
/ Jefatura / Obra / General: `inicio.gerencia` y `vistaInventario`). Arriba, cuántas de las mostradas ven cada sección;
mismo buscador y filtro por rol de la lista. Tocar a una persona abre su ficha (con historia: «atrás» vuelve al
Panorama). Lógica pura y test: `components/soporte/panorama.ts`; tabla: `PanoramaPermisos.tsx`.

**«Lo que puede usar <Nombre> (<rol>)» (Marcos 2026-10-26):** recuadro del Inicio **solo con «ver como» activo**: una
tarjeta por sección de su menú (`menuVisible`, mismo orden) con lo que puede hacer ahí (pestañas, secciones, vista de
Inventario del Inicio, permisos con «propio»/«quitado»/«$»; los de una sección que no ve van a «Otros permisos»). La ficha
la guarda Soporte al entrar dentro de la sesión prestada (`sgdl_ver_como.ficha`, misma vida); sin ella, permisos del
token + `PERMISO_HIERARCHY`. Lógica pura y test: `components/soporte/accesosPerfil.ts` (`menuDePermiso`).

Limitaciones conocidas: la obra elegida arriba (selector) es la que el Super Administrador tiene guardada en su
navegador, no la del teléfono de esa persona (y cambiarla ahí cambia la propia); las preferencias locales por persona
(última sección de Gestiones, «Ver como» del Inicio, etc.) se leen del navegador de quien mira. El token de descarga
pública de asistencia (`GET /asistencias/public-report-token`, 24 h, solo el reporte) se puede emitir también desde
«ver como»: es una lectura que el Super Administrador ya puede hacer con su cuenta.

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
