# Reglas — Sitio web (obras de lols.cl)

Módulo creado el 2026-10-29 (mig `147_sitio_web_obras.sql`, plan `docs/plans/2026-10-28-sitio-web-obras.md`). El
dueño decidió (28-10) que las obras del portafolio de lols.cl (en construcción, en proyecto y terminadas) dejan de
escribirse en el código del sitio: se cargan en la Bóveda y **Publicar** hace un commit en el repo **público**
`Mauricio-Alvarez-T/lols.cl`. Fase 1 = solo obras y solo la portada.

> Estado: backend completo (parte 1: tablas, permisos, CRUD, orden, incluir, fotos con dos llaves, guardas, saneo;
> parte 2: cliente de GitHub, publicación síncrona con conciliación, «en línea», importación de las obras del sitio,
> resincronizar, previa, pendientes y ZIP de simulación) y **pantalla** (plan 4.8: menú «Sitio web», `/sitio-web`;
> ver § La pantalla).

## Quién hace qué

| Clave | Para qué | Nivel en Configuración › Roles |
|---|---|---|
| `sitio_web.ver` | Lista, detalle, fotos, configuración | Nivel «Mira» |
| `sitio_web.editar` | Crear y editar obras, ordenar, incluir/quitar, subir y confirmar fotos, borrar borradores | Nivel «Edita» |
| `sitio_web.publicar` | Aprobar y rechazar fotos, previa, publicar, importar, resincronizar, pendientes, ZIP | Delicada: ningún nivel la da, se marca a mano |

- Ninguna persona va en el código: todo por permisos (niveles por pantalla en Roles y ajuste por persona). La mig 147
  se los da solo al rol 1. Como todo permiso, vive en el JWT: **volver a entrar** después de asignarlo.
- Gates (`sitio-web.routes.js`, `checkPermission` = basta uno): ver = las tres; editar = editar o publicar;
  publicar = solo publicar. `GET /obras/disponibles` y `/obras/sugerencias/:obraId` piden editar **y** `obras.ver`
  (403 con `required: ['obras.ver']`). Vincular una obra de la Bóveda (`obra_id`) también pide `obras.ver`; la
  superficie sugerida sale del presupuesto (Costos) y solo con `costos.gestionar`.
- «Ver como» no escribe (auth.js corta todo POST/PUT/DELETE).

## Contrato del JSON (manda lols.cl)

La fuente es `src/content.config.ts` y `docs/contenido-obras.md` **del repo lols.cl** (no la tabla 3.2 del plan).
`backend/src/config/sitioWeb.config.js` es su espejo (tipos, servicios, claves de `referencia`, carpetas compartidas):
si allá cambia, se cambia aquí; el build del sitio es la segunda red.

- `serializarObra` (`sitioWeb.service.js`) es una **lista blanca** con el orden de claves de los archivos del sitio:
  `slug, orden, estado, nombre, titular, tipo, mandante, comuna, direccion, superficieM2, anio, inicio, servicios,
  desafio, solucion, resultado, fotos[, referencia]`. Nunca sale `obra_id`, ids, usuarios, fechas de auditoría ni nada
  interno. **No existen** `rol`, `plazo`, `cifra` ni `video` (el sitio no los acepta).
- `estado`: `en_construccion` → `en-curso`, `contratado`, `terminado`. `anio` solo sale en terminadas.
- `mandante` sale **solo con su autorización registrada** (`mandante_autoriza`, quién y cuándo). Cambiar el nombre del
  mandante anula la autorización.
- `direccion` **se publica** (D3, 28-10).
- Textos recortados; `''` → `null`. Superficie entera ≥ 1 o null. Desafío, solución y resultado guardan sus saltos
  de línea, pero el sitio (`FichaObra.astro`, `<p>{texto}</p>` sin `pre-line`) muestra cada uno como **un solo
  párrafo**: un salto se ve como un espacio. La vista previa hace lo mismo (no promete párrafos que el sitio no
  muestra).
- `referencia` (imagen referencial del sitio) solo sin foto propia; se conserva la importada y pasa a null al aprobarse
  una portada. Si es null, la clave no se escribe (así están los archivos de hoy).
- Formato: `JSON.stringify(obj, null, 2) + '\n'` (`textoJson`). **Cero diferencias**: las 27 obras actuales del sitio
  (`backend/tests/fixtures/sitio-web/obras/`, blobs de main en edab831) importadas y vueltas a serializar dan el mismo
  archivo byte a byte (`sitio_web.test.js`).
- `faltantes` = las reglas del esquema real: nombre, slug válido y no reservado, estado, **comuna**, al menos un
  servicio del catálogo, tipo del catálogo (o null), año en terminadas, y **portada** (foto aprobada o `referencia`) en
  obras en construcción y terminadas. Una contratada puede ir sin foto. `titular`, `tipo` y la superficie son
  opcionales.
- Slug: sale del nombre (`slugDesde`: sin tildes ni eñes, minúsculas y guiones, máx. 80). Reservados: `ejemplo`,
  `muestra-*` y los ids de las muestras de un carrusel (`terminados-1`, `en-construccion-2`…). Se **congela** tras la
  primera publicación (409 `SITIO_WEB_SLUG_CONGELADO`); reservado u ocupado → 409.

## Obras: incluir, orden, edición y borrado

- Una obra nueva queda **fuera del sitio** (`incluir = 0`) y al final de su estado (`orden` = máx + 10).
- **Incluir** una obra que nunca se publicó exige que no le falte nada: 409 `SITIO_WEB_FALTAN_DATOS` con la lista.
  **Quitar del sitio nunca se bloquea** (retiro de emergencia).
- **Orden**: `PUT /obras/orden { estado, ids }` reescribe 10, 20, 30…; las del estado que no vinieron quedan al final.
  Una obra de otro estado → 409 `SITIO_WEB_ORDEN_DESACTUALIZADO`.
- `estado: null` en el PUT (validateBody deja pasar null en un campo opcional) = no se cambia; al crear, el de siempre
  (`en_construccion`). Un valor que no es un estado → 400 `SITIO_WEB_ESTADO` (nunca un 500 de la columna NOT NULL).
- **Concurrencia**: `PUT /obras/:id` exige el `updated_at` que se editó (`DATETIME(3)`); si otra persona guardó antes
  → 409 `SITIO_WEB_EDITADA_POR_OTRO` (también si guarda justo entremedio: el UPDATE vuelve a comparar). Lo que no es
  una edición del contenido (incluir, orden, aprobar una portada, publicar) escribe `updated_at = updated_at` para no
  invalidar el formulario abierto de otra persona.
- **Borrar** solo un borrador que no está en el sitio: incluida, con `publicado_hash` o en el último manifiesto OK →
  409 `SITIO_WEB_OBRA_EN_LINEA` (primero se quita y se publica). Se borra su carpeta `uploads/sitio-web/<id>`.
- Historial propio en `sitio_web_historial` (antes → después) y, en el historial general, crear, borrar,
  incluir/quitar y aprobar/rechazar fotos (`logManualActivity`, módulo `sitio_web`; el log genérico de
  `/api/sitio-web` está apagado en `logger.js`).

## Estados de una obra (`estadoDerivado`)

borrador · listo para publicar · publicando · publicada · no llegó al sitio · cambios sin publicar · **publicada ·
faltan datos** (`incompleta`) · retiro pendiente. «Publicada» = el hash del JSON actual es el publicado y el sitio ya
lo muestra; «no llegó» = el build falló y el sitio no la muestra («El sitio sigue mostrando la versión anterior.
Avisa a Mauricio.»). **«En línea» manda sobre «falló»**: una corrida repetida («Re-run») o un push posterior que la
lleva al sitio la deja «publicada» y quita el aviso rojo. `incompleta` = publicada y ahora le faltan datos: el sitio
mantiene la versión publicada y publicar no la cambia, así que **no cuenta como pendiente** (ni en el número del menú
ni en «Por publicar»; sale en «Les faltan datos»); si además su portada publicada fue rechazada, es «retiro pendiente»
(la próxima publicación la saca). Cuando una publicación retira una obra, sus `publicado_*` vuelven a null.

## Fotos: «nadie reconocible»

**En las fotos publicadas no puede aparecer nadie reconocible: ni caras, ni nombres en cascos o chalecos, ni patentes**
(dueño, 28-10). Dos llaves atadas a los **bytes**:

1. Quien sube marca «Confirmo que en la foto no se reconoce a ninguna persona» y escribe la descripción (5–200). Sin
   eso la subida no entra (400 `SITIO_WEB_FOTO_SIN_CONFIRMAR`).
2. Quien tiene `sitio_web.publicar` **aprueba ese hash**. **Puede ser la misma persona que subió** (D4, 28-10); la
   confirmación se exige igual (409 sin ella).

- Cambiar la confirmación (quitarla o volver a darla) **anula la aprobación**. Cambiar solo la descripción, no.
- **Rechazar** = bloqueo de emergencia: anula la aprobación y esa foto nunca vuelve a salir. Para que eso se cumpla:
  - la fila rechazada **no se borra** (409 `SITIO_WEB_FOTO_RECHAZADA_QUEDA`): la publicación la necesita para saber
    que tiene que sacar del sitio la versión que la muestra;
  - el rechazo es de la **imagen**, no de la fila: sharp es determinista, así que la misma foto subida de nuevo da el
    mismo hash, y **subirla o aprobarla otra vez** (en cualquier obra) → 409 `SITIO_WEB_FOTO_RECHAZADA`. (Una foto
    heredada del sitio rechazada que alguien sube por la cámara sale con otro hash: eso no se detecta.)
- **Borrar** una foto: no la rechazada (arriba) ni **la que el sitio muestra hoy** (la nombra `publicado_json`; 409
  `SITIO_WEB_FOTO_PUBLICADA`): borrarla no la sacaría del sitio (la obra mantendría la versión publicada con ella).
  Para sacarla: quien publica la rechaza y publica, o aprueba otra portada que la reemplace. La pantalla no muestra
  «Borrar» en esos casos y explica qué hacer.
- Se publica solo si `hash === aprobada_hash`, sin rechazo, confirmada y con la confirmación anterior a la aprobación
  (`fotoPublicable`). La portada vigente es la publicable aprobada más recientemente.
- Aprobar verifica que la maestra del disco siga teniendo ese hash (409 `SITIO_WEB_FOTO_ALTERADA`), pone `referencia`
  en null y borra la portada anterior (fila y archivos; lo ya publicado sigue en el repo hasta la próxima publicación).
- Una subida **siempre** crea una fila nueva, sin aprobar.
- Proceso (`sitioWebFotos.service.js`, sharp cargado al primer uso): firma de bytes JPG/PNG/WEBP (un SVG, TIFF o PDF
  nunca llega a sharp) + `metadata().format`, `limitInputPixels` 50 MP, 10 MB. Maestra JPG ≤ 2400 px con la
  orientación aplicada y la transparencia sobre blanco; derivadas WebP q78 de 800 y 1600 px (las que se publican como
  `portada.<hash8>-<800|1600>.webp`). Se **verifica** que `exif`, `xmp` e `iptc` no existan en las tres salidas.
  Menos de 800 px de ancho → 400 `SITIO_WEB_FOTO_CHICA`. El archivo del teléfono se borra siempre; `tmp/` se limpia de
  lo que tenga más de 1 hora en cada subida y al arrancar.
- Archivos: `uploads/sitio-web/<sitio_obra_id>/<hash>-{maestra.jpg,800.webp,1600.webp}`; la BD guarda el prefijo
  (`ruta`, nunca sale al JSON ni a la pantalla). `GET /fotos/:id/archivo?ancho=800|1600|maestra` sirve SOLO desde esa
  ruta (forma revisada); otro `ancho` → 400.
- La detección automática de caras queda fuera (Fase 2+).

## Rutas del repo y entorno

- **Lista blanca** (`sitioWebGuarda.rutaPermitida`), revisada antes de cualquier llamada a GitHub:
  `src/content/obras/<slug>.json` y `public/proyectos/<slug>/portada.<hash8>-<800|1600>.webp` (escribir y borrar), y
  el `1.jpg` heredado de una obra importada (**solo borrar**, cuando se aprueba una portada nueva o se retira la obra).
  Nada más: ni `.gitkeep`, ni código, ni `.htaccess`, ni workflows.
- **Carpetas compartidas** = las **12** de «Han confiado en nosotros» (`obrasConfianza` en lols.cl
  `src/data/proyectos.ts`): `enfermera-lucia-vidal-arias-6679`, `claudio-gay-2970`, `av-providencia-1132`,
  `abate-molina-221`, `bascunan-guerrero-818`, `grajales-2751`, `bascunan-guerrero-239`, `gorbea-2635`,
  `tucapel-jimenez-84`, `conferencia-442`, `san-alfonso-580`, `abate-molina-211`. Hoy 4 son también una obra, pero la
  regla vale para una obra futura (o agregada a mano) con el slug de cualquiera de las 12. Su `1.jpg` es del repo: la
  Bóveda **nunca** lo borra ni lo reemplaza (si falta, el build de lols.cl falla). Espejo en `sitioWeb.config.js`: si
  cambia `obrasConfianza`, cambia ahí.
- **`modoEfectivo`** (`sitioWebGuarda.js`): publica solo con `SITIO_WEB_MODO=publicar`, token y rama; y si el destino es
  el repo público, además `DB_NAME === 'lolscl_boveda'` (sin test/staging/dev), la carpeta de la app sin
  `test-boveda` y `SITIO_WEB_PERMITIR_REPO_PUBLICO=1`. Si no, **simulación**. Copiar el `.env` de producción a staging
  no publica. Un repo privado de prueba desde staging sí.
- **Token** (`GITHUB_TOKEN_SITIO`): solo en el `.env` de cPanel de producción; se lee al usarlo, nunca se registra, se
  devuelve ni va en un error. **Riesgo aceptado (D2)**: `modoEfectivo` impide que el código de staging publique, pero
  staging corre con el mismo usuario de cPanel y podría leer `~/boveda/.env`; por eso el token es fine-grained, solo
  de lols.cl, 90 días, Contents rw + Actions read (`infraestructura.md` § Variables de entorno). `GET /config` devuelve el modo, el motivo, repo, rama, URL del sitio, días para que venza
  y los catálogos. Variables en `backend/.env.example`.
- **Staging**: `sanear_staging.js` borra obras, publicaciones e historial del sitio con más de 48 h (lo de un QA
  reciente queda), las carpetas `uploads/sitio-web/` de obras que ya no están, `tmp/` y los ZIP de simulación de
  publicaciones borradas. En el cron `--auto` también cuando no hay trabajadores foráneos
  (`saneoStaging.pendienteSitioWeb`).

## Publicar (plan 4.7)

`POST /publicar { confirmo_revision: true }` (`sitioWebPublicar.service.js`). **Síncrono**, en la misma request
(Passenger: nada en segundo plano); la pantalla espera hasta 120 s. Responde **200 con el resultado aunque falle**
(`estado: 'error'` + `error_codigo` + `error_mensaje`, también guardados en la fila); 409
`SITIO_WEB_PUBLICACION_EN_CURSO` si hay otra; 400 `SITIO_WEB_SIN_REVISION` sin la casilla.

1. **Lock** `GET_LOCK(CONCAT(DATABASE(), ':sitio_web_publicar'), 0)` en una conexión propia (publicar, importar y
   resincronizar comparten el lock; se suelta solo si el proceso muere). El nombre lleva la base: GET_LOCK es de todo
   el servidor MySQL y staging comparte instancia con producción (sin eso, una importación de staging frenaría una
   publicación real).
2. **Conciliar** las filas que quedaron `en_curso` (el proceso murió): sin commit o simulación → `interrumpida`; con
   `commit_sha` y main lo contiene (`compare`) → `ok`, adopta su manifiesto y deja las obras al día (los textos que
   faltan se leen del repo y se reconocen por su sha256); si no → `interrumpida`. En simulación (sin GitHub) una con
   commit queda para la próxima publicación real. Una huérfana MÁS VIEJA que la última importación o resincronización
   (que ya leyó el repo con ese commit adentro) se marca `ok` **sin** aplicarla contra esa base (aplicarla borraría
   como «retirado» lo que solo esa base conoce).
3. **Foto completa** de las obras con `incluir = 1`:
   - sin faltantes → su JSON actual;
   - con faltantes y ya publicada → **se mantiene `publicado_json`** tal cual (una edición a medias nunca bloquea la
     publicación ni un retiro), **salvo** que esa versión muestre una foto **rechazada**: entonces la obra **sale del
     sitio** (JSON y fotos) hasta tener otra portada;
   - con faltantes y nunca publicada → queda fuera, con aviso;
   - la portada, además de `fotoPublicable`, tiene que estar completa en disco con la maestra del hash aprobado; si
     no, aviso y se toma la siguiente (o se mantiene lo publicado). Una heredada propia solo si su `1.jpg` sigue en el
     manifiesto. Quitar la confirmación no saca una foto ya publicada: para eso, **Rechazar**.
   - Lo inconsistente (una versión publicada que nombra un archivo que ya no está en ningún lado) **bloquea**
     (`SITIO_WEB_BLOQUEADA`) antes de tocar GitHub.
4. **Simulación** (staging, o sin token: `modoEfectivo`): cero llamadas a GitHub. Diferencias contra el **último
   manifiesto OK** (lo que el repo tiene: la importación o la última publicación real), porque simular no cambia
   `publicado_*`. Con cambios → `simulada` y un ZIP en `uploads/sitio-web/paquetes/<id>.zip` (los JSON y portadas de
   la Bóveda con sus rutas del repo, `BORRAR.txt`, `manifiesto.json`, `LEEME.txt`; se guardan los últimos 10). Sin
   cambios → `sin_cambios`.
5. **Publicar**: hasta **3 intentos**. En cada uno: leer la rama y su árbol (`truncated` aborta); las rutas de la
   Bóveda en el repo tienen que ser **exactamente** las del último manifiesto OK (si no →
   `SITIO_WEB_REPO_MODIFICADO`, no se pisa nada; sin manifiesto, el repo no puede tener obras: «Importar» primero);
   las fotos que se nombran y son del repo (carpetas compartidas) tienen que estar; subir solo los blobs que faltan
   (300 ms entre cada uno, y a lo más **70 llamadas que crean contenido —blobs, árbol, commit, PATCH— en cualquier
   ventana de 60 s**: el límite secundario de GitHub es ~80/min; una publicación grande espera dentro de la request);
   tree con `base_tree`; commit `sitio: publicar obras (pub #<id>)` (sin nombres ni `[skip ci]`; autor
   `Bóveda LOLS <GITHUB_AUTOR_EMAIL_SITIO>`, o el dueño del token si no hay correo); **guardar `commit_sha`,
   `manifiesto_previsto` y `obras_json` ANTES del PATCH**; PATCH con `force:false`. Un 422 se mira releyendo la rama:
   si main avanzó → otro intento desde la lectura (tres seguidos → `SITIO_WEB_REPO_OCUPADO`); si main sigue igual, lo
   rechazó una regla o protección de la rama → `SITIO_WEB_GITHUB_RECHAZO` sin reintentar («Avisa a Mauricio»). Si el
   PATCH se corta, se relee la rama: si ya apunta al commit, entró; si no se puede saber, la fila queda `en_curso`
   para la conciliación.
6. **OK** (en una transacción): `estado='ok'` + manifiesto; por obra, `publicado_hash` = sha256 del **JSON enviado**
   (nunca de la fila releída), `publicado_json` y `publicado_at`; las que salieron → `publicado_*` en null. Una foto
   heredada cuyo `1.jpg` se borró (la Bóveda no vuelve a escribir un `1.jpg`): si la **reemplazó una portada nueva**,
   su fila y su maestra se van; si la **obra se retiró** (retirar se deshace), la foto NO se pierde: después del
   commit se vuelve a codificar como portada de la Bóveda (`portada.<hash8>`, sin aprobar, con el ancho que tenga) y
   se aprueba de nuevo si la obra vuelve (si no se puede —dañada o sin archivo—, se va como en el otro caso; una
   rechazada queda como está). Historial por obra y por publicación; `logManualActivity`. Si esto falla, el commit ya
   está: la fila queda `en_curso` y la próxima publicación la confirma.
7. Sin cambios contra el repo → `sin_cambios` (y las filas que hubieran quedado atrás se ponen al día).

**Foto completa y rutas dueñas.** Cada publicación lleva todas las obras incluidas; lo que estaba en el último
manifiesto OK y no viene se borra en el mismo commit. Se compara y se borra solo lo que es de la Bóveda: los JSON, las
portadas `portada.<hash8>-<800|1600>.webp` y el `1.jpg` heredado **que está en el manifiesto** (nunca el de una carpeta
compartida, ni el de una carpeta que la Bóveda no importó, ni `.gitkeep`). Portada nueva aprobada en una carpeta
propia → su `1.jpg` se borra en ese commit; en una compartida, el `1.jpg` queda (el JSON deja de nombrarlo).

**Después del commit** (`GET /publicaciones/:id`, la pantalla consulta cada 10 s mientras no termina): la
compilación sale de Actions (`en_cola · compilando · ok · fallo · reemplazada`, esta última = cancelada por una
publicación posterior, no es error) y el «en línea» de `SITIO_WEB_URL/build.txt` (`sitioWebEnLinea.js`: sin token,
sin redirecciones, 10 s, 1 KB, 15 s de caché; solo un SHA de 40 hex vale, si no «desconocido» y no se pregunta nada
más). En línea = `build.txt` es el commit o uno posterior que lo contiene. Se guarda en `build_estado`, `build_url` y
`en_linea_at`, que alimentan el estado de cada obra (publicando → publicada, o «no llegó al sitio»).
- **Sin abrir el detalle**: `GET /obras`, `/publicaciones` y `/pendientes` ponen al día la última publicación real
  que todavía no terminó (`refrescarCompilacion`, a lo más cada 20 s por proceso; nunca hacen fallar la lectura; en
  simulación no hacen nada). Así una compilación fallida se ve en la lista, el aviso rojo y el número del menú aunque
  nadie haya dejado abierta la publicación.
- Mientras el sitio no la muestre, la compilación se vuelve a preguntar **aunque haya fallado** (un «Re-run» puede
  salir bien). «Reemplazada» (otro push a main canceló su corrida) se resuelve con la compilación del head actual, que
  la contiene: si esa falló → «fallo» (no llegó); si sigue andando, se espera. La pantalla deja de consultar en línea
  o con la falla confirmada.

## Importar las obras del sitio (plan 4.11)

`POST /publicaciones/importar` (`publicar`), una vez e **idempotente por slug**. Con el sitio real lee el árbol de
main por la API; en simulación, un ZIP del repo lols.cl (campo `paquete`, hasta 40 MB; el de GitHub «Code → Download
ZIP»).

- **El ZIP** se lee ANTES de tomar el lock (uno pesado no frena las publicaciones) y contra uno armado para colgar el
  servidor: el índice sin descomprimir nada (sin `checkCRC32`, que descomprime todo de entrada); se descomprimen
  **solo** los `src/content/obras/*.json`, las fotos que esos JSON nombran y las portadas de la Bóveda, cada una
  revisando su tamaño declarado y con un tope (64 KB un JSON, 10 MB una foto, 200 MB en total) que corta **en el
  camino** aunque el ZIP mienta; el CRC se verifica al terminar (dañado → 400). Un JSON con CRLF (un clon de Windows
  con `core.autocrlf=true`) pasa a LF, que es lo que git guarda en el repo (`* text=auto`): así su hash y el
  manifiesto son los del repo y publicar sin tocar nada no reescribe las 27.
- **Antes que nada concilia** una publicación real que quedó `en_curso` (si su commit entró, esa es la base y
  entonces ya no se importa: 409 `SITIO_WEB_YA_PUBLICADO`). Con una real `en_curso` que no se puede confirmar (en
  simulación no hay GitHub) → 409, no se importa nada.

- Lee y valida **todos** los JSON antes de escribir: uno roto → 409 `SITIO_WEB_IMPORTACION_INVALIDA` y no se importa
  nada.
- Cada obra nueva: fila con `incluir = 1`, `publicado_json`/`publicado_hash` = el archivo del repo **tal cual**; el
  mandante que ya estaba publicado queda autorizado (por quien importa, con nota). La foto existente pasa a portada
  **ya aprobada y confirmada** (`heredada_src`, la maestra guarda los bytes del `1.jpg`), con la nota **«importada del
  sitio, revisar que nadie sea reconocible»** en el historial. La heredada se ve en la Bóveda por su maestra.
- Manifiesto base en `sitio_publicaciones` (`modo = 'importacion'`, `estado = 'ok'`): los JSON y portadas del repo y
  los `1.jpg` que un JSON nombra, sin los de carpetas compartidas.
- **Una segunda importación** (trae obras nuevas) no reemplaza la base: solo le **suma** las rutas de las nuevas. Lo
  de las obras que ya estaban tiene que seguir igual a la base; si alguien lo cambió a mano: por la API → 409
  `SITIO_WEB_REPO_MODIFICADO` (camino: Resincronizar); desde un ZIP (simulación) → se mantiene lo importado antes y se
  avisa. Reemplazar la base taparía el cambio a mano y la próxima publicación lo pisaría.
- Cero diferencias: las 27 obras de hoy vuelven byte a byte y **publicar enseguida da `sin_cambios`** sin un solo blob.
- Una obra con el mismo slug creada a mano en la Bóveda no se importa (aviso: la próxima publicación reemplaza o
  retira el archivo del sitio). Después de la primera publicación real → 409 `SITIO_WEB_YA_PUBLICADO`: el camino es
  Resincronizar.

## Resincronizar (plan 7.2)

`POST /publicaciones/resincronizar { confirmo: true }` (`publicar`, solo con el sitio real; en simulación 409
`SITIO_WEB_SOLO_PUBLICAR`). Para después de un cambio a mano en el repo (un `git revert` de emergencia), que hace que
la próxima publicación aborte con `SITIO_WEB_REPO_MODIFICADO`:

- el repo pasa a ser el manifiesto base (fila `modo = 'importacion'`);
- cada obra con su JSON en el repo: `publicado_*` = ese JSON (si difiere de la Bóveda, queda «cambios sin publicar»);
- una obra que está en el repo y la Bóveda **no tiene** (agregada a mano): se **importa** como en «Importar» (con
  aviso «revísala»). Una publicación de la Bóveda nunca retira una obra que la Bóveda no tuvo (ni su `1.jpg`);
- una obra publicada cuyo JSON ya no está: `incluir = 0` y `publicado_*` en null, con historial y aviso;
- las fotos que estaban publicadas y ya no están en el repo quedan **rechazadas** (no vuelven a salir solas).

## Endpoints de la publicación

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| GET `/pendientes` | publicar | `{ fotosPorAprobar, obrasConCambios, ultimaConError }` para el badge |
| GET `/publicacion/previa` | publicar | Lo que haría Publicar, sin GitHub: obras nuevas, cambiadas, retiradas, que mantienen lo publicado y fuera; archivos; bloqueos; avisos |
| POST `/publicar` | publicar | Ver arriba |
| GET `/publicaciones` · `/publicaciones/:id` | ver | Últimas 20 · detalle con pasos, cambios y compilación (se actualiza al pedirlo) |
| GET `/publicaciones/:id/paquete` | publicar | ZIP de una simulación |
| POST `/publicaciones/importar` | publicar | Ver arriba |
| POST `/publicaciones/resincronizar` | publicar | Ver arriba |

## Errores para la pantalla

4xx con `code` cuando la pantalla tiene que decidir algo: `SITIO_WEB_SIN_MIGRAR` (409, falta la mig 147),
`SITIO_WEB_EDITADA_POR_OTRO`, `SITIO_WEB_FALTAN_DATOS` (+ `faltantes`), `SITIO_WEB_SLUG_RESERVADO|OCUPADO|CONGELADO`,
`SITIO_WEB_OBRA_EN_LINEA`, `SITIO_WEB_OBRA_YA_VINCULADA`, `SITIO_WEB_ORDEN_DESACTUALIZADO`,
`SITIO_WEB_FOTO_SIN_CONFIRMAR|ALT|FORMATO|CHICA|RECHAZADA|RECHAZADA_QUEDA|PUBLICADA|ALTERADA`, `SITIO_WEB_ANCHO`,
`SITIO_WEB_ESTADO`,
`SITIO_WEB_PUBLICACION_EN_CURSO`, `SITIO_WEB_SIN_REVISION`, `SITIO_WEB_SIN_CONFIRMAR`, `SITIO_WEB_TOKEN_INVALIDO` (424),
`SITIO_WEB_SIN_ACCESO` (424), `SITIO_WEB_REPO_MODIFICADO` (+ `rutas`), `SITIO_WEB_YA_PUBLICADO`,
`SITIO_WEB_IMPORTACION_INVALIDA` (+ `problemas`), `SITIO_WEB_SIN_PAQUETE`, `SITIO_WEB_PAQUETE_INVALIDO|NO_VA`,
`SITIO_WEB_SOLO_PUBLICAR`. Los 5xx solo traen `error`. En una publicación los códigos (también `SITIO_WEB_BLOQUEADA`,
`SITIO_WEB_REPO_OCUPADO`, `SITIO_WEB_GITHUB_TIMEOUT|LIMITE|ERROR|RECHAZO`, `SITIO_WEB_ARBOL_TRUNCADO`,
`SITIO_WEB_RUTA_NO_PERMITIDA`, `SITIO_WEB_CONCILIACION`) quedan en `sitio_publicaciones.error_codigo` y vuelven en el
200 `{ data }`. Ningún mensaje lleva el token, headers ni la respuesta cruda de GitHub (`sitioWebGithub.service.js`).

## La pantalla (plan 4.8)

Menú lateral **«Sitio web»** (`/sitio-web`, ícono `Globe`, después de Presupuestos) con cualquiera de las tres claves
(`PERMISOS_MENU_SITIO_WEB` en `menuLateral.ts`: editar y publicar no traen `ver`). Quien publica ve en el menú un
**número ámbar** = fotos por aprobar + obras que la próxima publicación cambia (`GET /pendientes`,
`hooks/useSitioWebPendientes.ts`, cada 5 min y después de cada acción); el número lleva a la lista filtrada
(`?filtro=pendientes`). Sin obra arriba en el celular (`SIN_OBRA_EN_CELULAR`).

- **Portada** (`pages/SitioWeb.tsx`): pestañas Obras / Publicaciones; avisos arriba — simulación (gris, con el motivo
  de `modoEfectivo`), vencimiento del permiso de GitHub (ámbar desde 30 días, rojo vencido; solo a quien publica) y la
  última publicación que falló o «no llegó al sitio» (rojo, con qué hacer). «Nueva obra» y «Publicar» / «Simular
  publicación» (este último oculto en «ver como», igual que importar y resincronizar).
- **Lista** (`ListaObrasSitio.tsx`): agrupada como el sitio (En construcción, En proyecto, Terminado), con miniatura
  de la portada (o «Referencial» / «Render por recibir»), comuna, estado (`StatusBadge` dominio `sitioWeb`), «Faltan N»
  y «N fotos por aprobar» en ámbar. Filtros de un toque (Todas · Por publicar · Les faltan datos · Fuera del sitio) y
  buscador desde 7 obras (sin tildes, todas las palabras). **Flechas subir/bajar** dentro de su grupo
  (`PUT /obras/orden`), solo con la lista completa a la vista (con filtro o búsqueda, «subir» no diría respecto de qué).
  Una obra con fotos por aprobar se abre **en su pestaña Portada**, y el filtro (y la pestaña Obras/Publicaciones)
  viaja con la obra abierta: «Obras» vuelve a la misma lista filtrada.
- **Cargas que fallan** (config, obras, publicaciones, previa) muestran su error con **«Reintentar»**: nunca una lista
  vacía con «Importar» ni esconden el aviso rojo. Sin la mig 147, `GET /config` (lo primero que se pide) y `/obras`
  responden 409 `SITIO_WEB_SIN_MIGRAR` → «El módulo todavía no está instalado».
- **Una obra** (`ObraSitio.tsx`, `?obra=ID&tab=datos|fotos|vista|historial`, `?obra=nueva`): su estado y qué
  significa, «Incluir en el sitio» (409 `FALTAN_DATOS` → la lista de lo que falta), «Quitar del sitio» (confirma; nunca
  se bloquea), «Borrar» solo un borrador nunca publicado y «Ver en el sitio». El formulario vive en la obra, no en la
  pestaña: cambiar de pestaña no pierde lo escrito y la vista previa lo muestra.
- **Datos** (`EditorObra.tsx`): todos los campos del contrato, dirección incluida; lo que falta para salir al sitio se
  recalcula **mientras se escribe** (`reglas.ts`, espejo de `faltantes` del backend) y no impide guardar. Vincular con
  una obra de la Bóveda solo con `obras.ver` («Traer sus datos» llena solo lo vacío). Dirección web con candado una vez
  publicada. La casilla del mandante se apaga sola si cambia el nombre de un mandante autorizado (hay que guardar el
  nombre nuevo y volver a marcarla, como exige el backend). El PUT manda **solo lo que cambió** (`soloCambios`: reenviar
  un texto importado tal cual podría cambiar el JSON publicado al limpiarlo el servidor) con la versión cargada; 409
  `EDITADA_POR_OTRO` → aviso con «Recargar»; un error de un campo (dirección web ocupada, reservada…) va en ese campo,
  y si no se puede guardar, el primer campo malo se lleva a la vista y se enfoca. **Cambios sin guardar**: el
  navegador pregunta antes de recargar o cerrar (en cualquier pestaña de la obra); «Obras», los enlaces del menú
  lateral y su número preguntan «Salir sin guardar» (`utils/salidaProtegida.ts`: `BrowserRouter` no tiene
  `useBlocker`); lo que no se puede frenar (Atrás, el gesto de volver del teléfono) deja lo escrito en
  `sessionStorage` (`borradorObra.ts`), avisa al tiro con «Volver a la obra» y, al volver, ofrece **«Recuperar lo que
  escribiste»** (con nota si otra persona guardó entremedio). La barra «Guardar» fija abajo aparece solo con cambios.
- **Portada** (`FotoPortada.tsx`): la regla «nadie reconocible» fija arriba; subir (cámara, archivo o arrastrar;
  `compressImage` solo achica hasta 2.400 px, nunca bajo 1.600; menos de 800 px de ancho se avisa antes de subir; el
  nombre del archivo del teléfono no viaja) con descripción y la casilla **obligatoria** «Confirmo que en la foto no se
  reconoce a ninguna persona». Quien publica abre **«Revisar y aprobar»**: el visor con zoom (`VisorAdjunto`, la maestra
  de hasta 2.400 px) y en su pie Aprobar / Rechazar; puede ser quien la subió (D4). «Aprobar» queda apagado sin la
  confirmación o mientras la foto no se ve. «Rechazar» confirma y explica que la foto no vuelve a salir. Quitar la
  confirmación avisa que anula la aprobación y que lo ya publicado sigue en el sitio hasta rechazarla. Sin «Borrar» en
  una rechazada (queda registrada) ni en la que el sitio muestra (a quien no publica: «avisa a quien publica para que
  la rechace y publique»). En el teléfono, todo botón de acción mide 44 px (`h-11 md:h-9`). Los botones de confirmar
  dicen su color: verde constructivo, **ámbar** quitar del sitio o quitar la confirmación (se deshace), rojo borrar,
  rechazar o salir sin guardar (`ConfirmarModal tono`).
- **Vista previa** (`VistaPreviaFicha.tsx`): la ficha como `FichaObra.astro` (misma pirámide, mismos campos ocultos:
  mandante solo autorizado, año en terminadas, inicio en las demás; desafío, solución y resultado en un párrafo, como
  el sitio), con lo escrito aunque no esté guardado; dice que la final se ve en el sitio y muestra el JSON que se
  publica (lo guardado).
- **Publicar** (`PublicarModal.tsx`): primero la previa (nuevas, con cambios, se retiran, mantienen lo publicado,
  quedan fuera, archivos, bloqueos, avisos; sin nada nuevo y con obras que mantienen lo publicado, lo dice: «complétalas
  para que sus cambios salgan»); casilla «Revisé los textos y las fotos»; una petición de hasta 120 s
  («Publicando… puede tardar un minuto»). Resultado con su marca (MarcaEstado): en simulación «Descargar paquete»;
  publicado → los pasos (`EstadoPublicacion.tsx`: entró al repositorio → el sitio se compila → se ve en el sitio),
  consultados cada 10 s **solo mientras están en pantalla y no terminó** (`useEstadoPublicacion.ts`, un store por
  publicación).
- **Publicaciones** (`PublicacionesSitio.tsx`): las últimas 20 (la importación se ve como «Base del sitio»), cada una
  abre su detalle con pasos, lo que cambió y el ZIP si es una simulación. Herramientas de quien publica: **Importar
  obras del sitio** (`ImportarObrasModal.tsx`; en simulación pide el ZIP del repositorio; también en la lista vacía) y
  **Resincronizar** (solo con el sitio real; casilla de confirmación).
- Textos y códigos de error en `sitioWebConfig.ts` (`mensajeError`: el `error` de un 4xx o el texto de su `code`; 5xx
  genérico; tiempo agotado → «revisa en un minuto si se hizo»). Estados con color en `utils/statusConfig.ts`
  (`sitioWeb`, `sitioWebFoto`, `sitioWebPublicacion`): verde publicada, ámbar lista / cambios / retiro / por aprobar,
  azul publicando o simulada, rojo no llegó / falló / rechazada, gris borrador.
- `ui/VisorAdjunto` acepta `pie` (botones propios en vez de «Abrir aparte» / «Descargar»).

## Incidente «persona reconocible» (plan 7.3)

1. Quien lo detecte avisa a quien tiene `sitio_web.publicar` y a Mauricio.
2. Quien tiene `publicar`: **Rechazar** la foto → **Quitar del sitio** la obra, o subir otra portada → Publicar. El
   sitio queda limpio en 5 a 10 minutos. (Si a la obra le faltan datos, rechazar basta: la versión publicada con esa
   foto no se reusa y la obra sale.) **Ojo**: si la foto es el `1.jpg` de una carpeta compartida, también la muestra
   «Han confiado en nosotros», que es código del sitio: la publicación lo avisa y Mauricio la saca del repo.
3. Si la Bóveda no responde, Mauricio hace `git revert` en lols.cl (sin `--force`) y después Resincronizar.
4. Mauricio evalúa con el dueño reescribir el historial de lols.cl (autorización explícita) y pedir a GitHub Support que
   purgue la caché. Los clones o forks existentes pueden conservar la foto.
5. Queda en el historial con fecha y responsable.

## Dónde vive

`backend/db/migrations/147_sitio_web_obras.sql` · `src/config/sitioWeb.config.js` · `src/services/sitioWebGuarda.js` ·
`src/services/sitioWeb.service.js` · `src/services/sitioWebFotos.service.js` · `src/services/sitioWebGithub.service.js`
(Git Data API, `fetch` inyectable) · `src/services/sitioWebEnLinea.js` (build.txt) ·
`src/services/sitioWebPublicar.service.js` (publicar, conciliar, simulación + ZIP, importar, resincronizar, previa,
pendientes, publicaciones) · `src/middleware/upload-sitio-web.js` · `src/schemas/sitioWeb.schema.js` ·
`src/routes/sitio-web.routes.js` (`/api/sitio-web`) · tests `sitio_web*.test.js` (los de publicación con una BD y un repo
de GitHub en memoria, `tests/helpers/sitioWebFalsos.js`), `migraciones_sin_duplicados.test.js`.

Frontend: `pages/SitioWeb.tsx` · `components/sitio-web/` (`tipos.ts`, `reglas.ts` + `reglas.test.ts` —espejo del
backend: compara los catálogos con `sitioWeb.config.js`—, `sitioWebConfig.ts`, `piezas.tsx`, `ListaObrasSitio.tsx`,
`ObraSitio.tsx`, `EditorObra.tsx`, `FotoPortada.tsx`, `VistaPreviaFicha.tsx`, `PublicarModal.tsx`,
`EstadoPublicacion.tsx`, `useEstadoPublicacion.ts`, `useFotoUrl.ts`, `ImportarObrasModal.tsx`,
`PublicacionesSitio.tsx`, `borradorObra.ts` + test) · `types/sitioWeb.ts` (estados con badge, los usa
`utils/statusConfig.ts`) · `utils/salidaProtegida.ts` + test · `hooks/useSitioWebPendientes.ts` · menú en
`layout/menuLateral.ts` + `Sidebar.tsx`.
