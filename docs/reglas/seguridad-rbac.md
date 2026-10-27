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

## Matriz de roles (Configuración › Roles, 2026-10-26)

- Los permisos de los roles se editan en una **matriz**: filas = pantallas de Bóveda agrupadas por
  módulo, columnas = roles activos (con «N personas» = `usuarios_count`, subquery de `GET /usuarios/roles`),
  celda = nivel **Nada · Mira · Trabaja · Todo**. Reemplazó la tabla de roles + el modal de casillas
  (`PermisosRolPanel`, borrado). Los overrides por persona siguen en Usuarios.
- **Los niveles son solo UI** (`frontend/src/config/permisosPantallas.ts`): cada nivel = un conjunto
  exacto de claves; el backend sigue guardando la lista plana (`POST /usuarios/roles/:id/permisos`, que
  sube `roles.version` → quien tenga el rol vuelve a entrar). Una mezcla que no calza = **«A medida»**,
  editable en el ajuste fino de la celda.
- **`$` y delicados nunca los da un nivel**: se marcan a mano en el ajuste fino. Delicados = borrar para
  siempre, saltarse aprobaciones (push directo, intra-bodega, orden de gerencia, bypass SoD, cancelar en
  tránsito), tocar usuarios/roles/permisos, correo del sistema, estados de asistencia, imprimir contratos.
- Reglas automáticas: `inventario.ver` se pone/saca solo según las pantallas de Inventario; en
  Asistencia y Gestiones la fila puerta (`asistencia.ver`, `reportes.ver`) se enciende al subir otra fila
  del módulo y apagarla apaga el módulo (salvo filas libres: Ingresos de trabajadores, Documentos
  físicos, Sistema); quitar el «ver» de una pantalla la apaga entera. Claves que la matriz no conoce se
  conservan al guardar.
- **Permiso nuevo ⇒ además de catálogo + `permisosHierarchy.ts` (panel de overrides), darle fila o
  marca en `permisosPantallas.ts`.** `permisosPantallas.test.ts` lee el catálogo del backend y falla si
  una clave no está en la matriz exactamente una vez.
- Super Administrador (rol 1) se muestra bloqueado en «Todo». Sin `usuarios.permisos.gestionar` la
  matriz es de solo lectura.

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
- **Un rol por cargo (mig 139, 2026-10-26).** La app no guarda el cargo de los usuarios: el nombre del rol es lo que se
  ve junto al nombre (Inventario, Soporte → Panorama). Desde la 139: **Administrador** = Leonardo López; **RR.HH** =
  Paula Martínez, Matías Millanao, Daphne Lazcano; **Supervisor** = Rodrigo Riquelme; **Gerente** = Luis Lazcano;
  **Supervisor de Obra** = Alfonso Castilla, Franco Gutiérrez, Felipe Escobar, Cristian Mancilla, Héctor Herrera;
  **Prevencionista** = Cristoffer Bolados, Héctor Gómez, Jhoan Vásquez. RR.HH, Supervisor y Gerente nacen como
  **copia del Administrador** (Gerente, más `inicio.gerencia`); Supervisor de Obra y Prevencionista, como copia de
  **«En Terreno»** (queda sin gente). **Mig 140:** el rol «Administrador» se renombró **«Coordinador de Obra»** (mismo
  id y permisos; Leonardo hace las compras y aprueba las solicitudes). **Ojo:** un cambio de permisos «de oficina» que
  antes tocaba solo el rol Administrador ahora debe tocar los cuatro (Coordinador de Obra, RR.HH, Supervisor,
  Gerente), y uno «de terreno», los dos. Las migraciones viejas que dicen `r.nombre = 'Administrador'` ya corrieron:
  una nueva debe usar «Coordinador de Obra».
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
- **Mig 139 (2026-10-26, «un rol por cargo»)**: en producción 8 personas seguían en el rol 1 (lo que la mig 126 pedía
  hacer a mano en Configuración → Usuarios no había quedado) y las de terreno en «En Terreno». Con el rol 1 veían todo
  el catálogo, Soporte y «ver como»; y como `aprobadores` excluye al rol 1, el Inicio decía «Quien aprueba» en vez de
  «Leonardo». La 139 crea los cinco roles (arriba), les deja **exactamente** los permisos de su rol de origen (si ya
  existían, se borra lo que sobra), y mueve a cada persona: oficina por **correo** (de cualquier rol); terreno solo si
  hoy está en «En Terreno», por correo o, para tres sin correo a mano, por apellido (Escobar, Mancilla/Mansilla,
  Bolados). Quien pasa a un rol de oficina y ve Configuración conserva `cargos.sueldo.ver` como permiso propio (lo de
  la 137 que dependía del rol; un «deny» puesto a mano se respeta). Los permisos propios de
  las migs 127-137 no se tocan.
  - **Re-login:** `roles.version + 1` del rol que cada persona **deja** (como hace `PUT /api/usuarios/:id` al cambiar
    un rol) y de los cinco roles. En producción eso incluye el **rol 1**: Marcos y Mauricio también vuelven a entrar;
    sin eso, quien deja el rol 1 seguiría hasta 8 h con un token de Super Administrador (la versión es por rol, no por
    persona). Como siempre, corre al reiniciarse el backend (el auto-migrate lo hace).
  - Una tabla temporal (`_mig139_destino`, solo ids) es la única lista de quién va a dónde, para el re-login y el
    cambio. Idempotente: la segunda pasada no mueve a nadie (solo vuelve a subir la versión de los cinco roles).
    Probada dos veces sobre MySQL 5.7 con sql_mode estricto, de MariaDB 10.6 y vacío (68 verificaciones: roles,
    permisos por rol, persona por persona, versiones, permisos propios y efectivos). Test:
    `backend/tests/roles_por_cargo_139.test.js`.
- **Mig 140 (2026-10-26, «Coordinador de Obra»)**: Marcos pidió que el rol de Leonardo se llame así, con los mismos
  permisos. Se **renombra** el rol «Administrador» (mismo id: permisos y gente iguales; RR.HH, Supervisor y Gerente no
  cambian). Si en ese entorno ya hubiera un «Coordinador de Obra» (nombre UNIQUE), `UPDATE IGNORE` salta el renombre y
  ese rol queda con exactamente los permisos del Administrador y Leonardo (por correo, solo si está en
  «Administrador») pasa a él. Re-login: `roles.version + 1` del Coordinador de Obra (el menú lateral muestra el nombre
  del rol que viajó en el inicio de sesión) y, en el respaldo, del Administrador que deja; nunca el rol 1. «Coordinador»
  se lee como cargo junto al nombre (`cargoDe` de `leonardo.modelo.ts`). Probada dos veces, normal y respaldo, sobre
  MySQL 5.7 con los tres sql_mode. Test: `backend/tests/rol_coordinador_de_obra_140.test.js`.
- **Mig 142 (2026-10-26, «vuelta por los perfiles»)**, decisiones de Marcos sobre permisos heredados al separar roles:
  **Supervisor de Obra y Prevencionista** pierden `usuarios.ver` (venía de «En Terreno»: veían Configuración y la lista
  de usuarios con correos); **Presupuestos** (`costos.gestionar`) queda solo para **Supervisor (Rodrigo) y Gerente (don
  Luis)**: sale de RR.HH y de Coordinador de Obra; el **Coordinador de Obra** pierde `trabajadores.financiero.ver`
  (sueldos). Del rol y del permiso propio «grant» de quien hoy está en ese rol (los «deny» y lo de otras personas, como
  el arquitecto, no se tocan). Re-login de los cuatro roles. Ojo: el rol «En Terreno» (sin gente) conserva `usuarios.ver`;
  si se vuelve a usar, quitárselo. Probada dos veces sobre MySQL 5.7 (tres sql_mode). Test:
  `backend/tests/ajustes_permisos_por_cargo_142.test.js`.

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

**Último ingreso (Marcos 2026-10-26):** la lista de Personas («Entró hoy 14:32») y el Panorama (columna después de
«Persona», y arriba «N hoy») muestran cuándo inició sesión cada uno por última vez. Es el mismo dato de la ficha: el
`LOGIN` de `modulo = 'acceso'` más reciente de `logs_actividad` (lo escribe `auth.controller` al iniciar sesión), en una
sola consulta agrupada (`ingresosPorUsuario` de `soporte.service.js`); el «ver como» se anota con `modulo = 'soporte'` a
nombre del Super Administrador y **no cuenta**. Solo la fecha: no se guarda qué hizo la persona. Si el historial falla,
la lista sigue y dice «Sin ingresos». Formato: `textoIngreso` (`fichaUsuario.ts`): «hoy 14:32», «ayer 09:10», «12 oct»,
«30 dic 2025».

## Errores (Soporte, mig 141)

Marcos 2026-10-26: «que sepas discernir un problema real y no me mandes 100 pantallazos». Cuando a una persona le sale
un error, su app le avisa a Soporte; si es una falla real, con una foto de su pantalla. **No hay nada corriendo todo el
tiempo** (ni cron): se actúa solo cuando sale un error, en el teléfono o computador de esa persona.

**Qué es cada error: por el CÓDIGO de la respuesta, no por el cartel rojo** (`frontend/src/services/clasificarError.ts`,
con test). Lo llaman `api.ts` (cada respuesta del servidor) y el `ErrorBoundary` (pantalla rota):

| Categoría | Cuándo | Qué se hace |
|---|---|---|
| `falla` | 500 y otros 5xx salvo 502/503/504, en cualquier petición | aviso + foto; le avisa a la persona |
| `app` | la pantalla se rompió (ErrorBoundary), salvo «no cargó una parte» (chunk viejo tras deploy, señal) | aviso + foto; le avisa |
| `permiso` | 403 con `required` (rbac.js dice qué permiso falta), solo al guardar/hacer algo (no en lecturas) | aviso sin foto, con el nombre del permiso; le avisa |
| `lento` | sin respuesta con internet, >15 s esperando (aunque llegue), 408, 429, 502/503/504 (reinicio del deploy) | solo se cuenta |
| `sin_senal` | sin respuesta y `navigator.onLine === false` | solo se cuenta |
| `dato` | 400/404/409/413/422 y 403 sin `required` (regla de la app), solo al guardar/hacer algo | solo se cuenta |
| (nada) | 401, cancelados, «ver como» (403 SOLO_LECTURA), 4xx en lecturas (GET), los propios avisos y `/auth/` | — |

**El envío** (`services/reporteErrores.ts`): nada con «ver como» ni sin sesión propia; el mismo aviso en la misma
pantalla a lo más una vez por minuto. Solo si el servidor la pide: ~0,7 s después del error (para que se vea el cartel)
saca la foto de lo visible con `modern-screenshot` (respeta el desplazamiento de la pantalla; sin campos de contraseña
ni lo marcado `data-sin-foto`; sin fuentes web), la achica a 1000 px y la comprime a ≤ 150 KB (WebP, si no JPEG); si
tarda más de 6 s o falla, el aviso queda sin foto. A la persona (`components/soporte/AvisoSoporte.tsx`, en MainLayout):
«Le avisamos a soporte con una foto de esta pantalla» (o sin foto, o «…que te falta un permiso») con «Contar qué pasó»:
ver la foto, **Quitar** (la borra), escribir o dictar, Enviar. Lento, sin señal y datos no le muestran nada.

**El servidor** (`soporteErrores.service.js`, rutas `/api/soporte/errores`, montadas antes de `/api/soporte`):
- Mandar aviso / foto / «qué pasó» / quitar foto: cualquier persona con sesión, solo sobre SUS avisos. Un token de «ver
  como» no llega (auth frena todo lo que no es GET).
- Repetidos: misma persona + misma `firma` (sha1 de categoría|mensaje|acción|pantalla sin la consulta) en 10 min →
  `veces + 1` en la misma fila, sin foto nueva.
- **Topes de foto** (solo `falla`/`app`, una por fila, se acepta una sola vez y dentro de la hora): 5 por persona al
  día, 40 al día en total, 40 MB guardados en total; ≤ 200 KB cada una, y que los bytes sean de verdad la imagen.
  Además, más de 40 avisos de una persona en 10 minutos se ignoran sin tocar la BD (pantalla en bucle).
- **Limpieza sin cron**: a lo más una vez por hora, al llegar un aviso o al abrir la bandeja: fotos de más de 30 días
  se borran (`foto_borrada_en`); filas de lento/sin señal/dato de más de 30 días y revisadas de más de 180 se eliminan.
- La foto vive en la fila (MEDIUMBLOB, como las de Ideas): entra al respaldo de la BD, acotada por los topes.
- **Nada de esto entra al historial** (`logs_actividad`): `logger.js` excluye `/api/soporte/errores` (la foto viaja en
  el body).
- Bandeja (lista, resumen, foto, revisar): solo `soloSuperAdmin`. `GET /api/soporte/errores?vista=revisar|senal|datos|
  revisados|todos` (sin el blob; los permisos con su nombre del catálogo); `GET /resumen` → `{ pendientes, lentos }`
  (por revisar = falla/app/permiso pendientes; lentos = personas distintas con «lento» en la última hora).

**La bandeja** (`components/soporte/ErroresSoporte.tsx`): tercera pestaña de Soporte («Errores», `?vista=errores`) con el
número por revisar, también en el menú (Soporte, ámbar; `hooks/useErroresSoporte.ts`, cada 5 min, solo rol 1). Como
«Personas»: lista y detalle. Cada aviso: qué es (y qué hacer), el mensaje, el permiso que faltó, la foto (o por qué no
hay), lo que escribió, pantalla, cuándo (primera y última vez), veces, celular o computador; «Detalle técnico» con la
acción, el código, la espera y el error. Nota + «Marcar revisado» / «Volver a sin revisar», «Ver su ficha». Si en la
última hora 3 o más personas tuvieron respuestas lentas, una franja lo dice (suele ser el servidor o un deploy).
Probado: backend `tests/soporte_errores.test.js`; frontend `clasificarError.test.ts`, `reporteErrores.test.ts`,
`components/soporte/errores.test.ts`; migración y service sobre MySQL 5.7 (tres sql_mode).

## Avisos al celular (mig 143, prueba piloto)

Marcos 2026-10-27: que suene el celular cuando pasa algo, sin SMS ni WhatsApp (gratis, sin cuentas nuevas). Son las
**notificaciones del navegador** (Web Push, estándar VAPID, librería `web-push` en el backend). **Piloto: solo el
Super Administrador** (todas las rutas con `soloSuperAdmin`), con dos avisos: el de prueba y **«Nueva falla en
Soporte»** (una `falla`/`app` NUEVA en Errores, no un repetido; a todos los rol 1 activos con avisos activados).

- **Cómo se activa:** Soporte → Errores → «Avisos en este celular» → «Activar avisos» → el teléfono pregunta «¿Permitir
  notificaciones?». El navegador da una dirección para avisarle (`avisos_celular_suscripciones`, una fila por celular
  por sha1 del endpoint; **no se guarda el número de teléfono**). «Desactivar» la borra; un celular que ya no existe
  (el servicio responde 404/410) se borra solo; otro error queda en `ultimo_error`.
- **iPhone:** solo si Bóveda está agregada a la pantalla de inicio (requisito de Apple); la tarjeta lo explica. Android
  (Chrome) funciona con la app cerrada.
- **`public/sw-avisos.js`:** recibe el aviso y al tocarlo abre la pantalla (`url` solo rutas internas). **No guarda
  caché ni intercepta pedidos** (sin `fetch`): no puede dejar una versión vieja de la app. Se registra recién al tocar
  «Activar avisos».
- **Claves VAPID:** del entorno (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) o, si no hay, el backend las crea la primera
  vez y las guarda en `avisos_celular_claves` (id = 1). Si se cambian, los celulares deben activar de nuevo.
- **Contenido:** título ≤ 80 y texto ≤ 180 caracteres, sin datos delicados (se ve en la pantalla bloqueada): «A Tomás
  Vera le falló Inventario. Toca para verla.». Vida del aviso 6 h si el celular está apagado.
- **Dependencia nueva:** `web-push` se carga recién al mandar (si el servidor aún no la instaló —`heal-deps` del cron
  de deploy—, el backend arranca igual y el aviso no sale). No entra al historial (`logger.js` excluye
  `/api/avisos-celular`). Abrir a todos = sacar `soloSuperAdmin` de las rutas y sumar avisos (p. ej. solicitud por
  aprobar para Leonardo). Test: `backend/tests/avisos_celular.test.js`, `frontend/src/services/avisosCelular.test.ts`.

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
