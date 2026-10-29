# Plan de implementación: «Sitio web» en la Bóveda (v2, revisado)

**Fecha:** 28-oct-2026. **Alcance:** Fase 0 (lols.cl) y Fase 1 (Bóveda, solo obras).

## 1. Contexto y decisiones

**Decisiones del dueño (28-oct):**
1. Quién edita y quién publica se asigna con permisos de la Bóveda, en Configuración › Roles (por pantalla y nivel, un rol a la vez) y en el ajuste fino por usuario. Ninguna persona queda escrita en el código.
2. Se parte solo por **obras**.
3. En las fotos publicadas **no puede aparecer nadie reconocible**: ni caras, ni nombres en cascos o chalecos, ni patentes.

**Lo que se verificó en el código (solo lectura):**
- La migración 146 la tomó otro trabajo (`146_permisos_cambiados_usuario.sql`, 29-oct); este módulo usa la **147**. Puede volver a chocar con otros trabajos en develop.
- No hay una variable de entorno que diga si el backend corre en staging o en producción, pero **sí hay una señal confiable: el nombre de la BD**. `saneoStaging.service.js:32` exporta `BD_PRODUCCION = 'lolscl_boveda'` y en `:66-71` exige `/test|staging|dev/`.
- El cron de lols.cl **se actualiza solo desde el repo**. En `docs/DEPLOY.md:41` hace `git checkout origin/deploy -- scripts/cpanel-deploy.sh` y después lo ejecuta. Además, `dist/` ya publica PHP (`public/api/contacto.php`) y `.htaccess`, y `cpanel-deploy.sh:57-62` sincroniza con rsync sin filtrar tipos de archivo. **Por lo tanto, quien puede escribir en main puede ejecutar código como `lolscl`, el mismo usuario unix que corre la Bóveda en producción y lee su `.env`.** Esto cambia cómo hay que tratar el PAT (ver 3.4).
- El loader `glob` de Astro usa `data.slug` como id (`glob.js:11-14`). Si dos archivos tienen el mismo id, solo **avisa** y reemplaza uno por otro.
- `errorHandler.js:69-79` solo deja pasar `code` cuando el status es menor que 500.

**Decisiones abiertas para el dueño:**

| # | Pregunta | Recomendación | Cuándo |
|---|---|---|---|
| D1 | Al pasar a lols.cl, un bloque sin obras reales ¿se oculta o bloquea la salida? | Ocultarlo | Al migrar el dominio |
| D2 | ¿Se mueve el contenido de la Bóveda a un repo público separado, con un PAT que solo alcance ese repo? | Sí, en Fase 2 (ver Apéndice) | CP3 |
| D3 | ¿Se publica la dirección exacta de una obra en curso? | **RESUELTO 28-oct: SÍ**, se publica la dirección (campo `direccion`) | — |
| D4 | ¿Una misma persona puede subir y aprobar una foto? | **RESUELTO 28-oct: SÍ**, una sola persona con `publicar` basta (sin regla de autoaprobación) | — |

## 2. Arquitectura

```
Bóveda prod (boveda.lols.cl, BD lolscl_boveda)            Repo PÚBLICO Mauricio-Alvarez-T/lols.cl
 sitio_obras / sitio_obra_fotos / sitio_publicaciones       src/content/obras/<slug>.json           (dueña: Bóveda)
 fotos privadas: backend/uploads/sitio-web/<id>/            public/proyectos/<slug>/portada.<h8>-<w>.webp (dueña: Bóveda)
        │ [Publicar] (sitio_web.publicar; guarda de entorno; rutas en lista blanca)
        └─ Git Data API: blobs → tree(base_tree) → commit → PATCH ref force:false  (1 commit atómico)
                                                      │ push a main
                                                      ▼
                     Actions deploy.yml: astro build (schema estricto) + verificar-obras-reales (bloqueante)
                     → dist/build.txt (SHA de main) → rama deploy
                     → cron cPanel (script FIJADO fuera del clon, filtro de ejecutables) → nuevo.lols.cl
                     ← la Bóveda lee build.txt y deploy-status.txt (validados) para mostrar «en línea»
Bóveda staging (test-boveda, BD *test*) ── siempre SIMULACIÓN contra el repo público (ZIP descargable)
```

Cada publicación es una **foto completa** del contenido: incluye todas las obras con `incluir=1`. Si una obra deja de estar incluida, sus archivos se borran en ese mismo commit.

---

## 3. FASE 0: lols.cl lee las obras desde datos validados y se endurece el deploy

**Objetivo:**
- Con `src/content/obras/` vacía, el sitio se ve idéntico al de hoy.
- Con un JSON válido, la obra real se dibuja **sin ningún marcador**.
- Con un JSON inválido, el build falla y el sitio anterior sigue arriba.
- Escribir en main deja de equivaler a ejecutar código en el servidor.

**Esfuerzo:** 2 días.

### 3.1 Archivos

| Archivo | Cambio |
|---|---|
| `src/content.config.ts` (nuevo) | `defineCollection({ loader: glob({ pattern: '*.json', base: './src/content/obras', generateId: ({ entry }) => entry.replace(/\.json$/, '') }), schema })`, con `z` de `astro/zod` y `z.strictObject`. Como el id es el nombre del archivo, dos entradas no pueden chocar. Se usa glob y no `file()`, porque `file()` se traga el JSON roto. |
| `astro.config.mjs` | `prerenderConflictBehavior: 'error'` como segunda red, si la versión instalada lo expone (`core/config/schemas/defaults.js:54`). |
| `src/content/obras/.gitkeep` (nuevo) | Mantiene el directorio en git. El patrón `*.json` no lo toma. |
| `src/data/proyectos.ts` | Ver 3.1.a. |
| `src/components/FichaObra.astro` | Regla «obra real = nunca Pendiente» (3.1.b). |
| `src/pages/proyectos/[slug].astro` | La portada real lleva `srcset`, `sizes`, `width`, `height` y `fetchpriority="high"`. **Una obra real sin foto** muestra un bloque neutro con `pictogramaDeTipo(tipo)` en lugar de `<Pendiente>` (líneas 31-37). `otros` (:25) filtra las obras reales sin `fotos[0]`. |
| `src/pages/servicios/[slug].astro` | `relacionados` (:22) excluye las obras reales sin `fotos[0]`, como ya hace `FichaServicio.astro:20-21`. |
| `src/components/TarjetaProyecto.astro`, `FichaServicio.astro` | `srcset`, `width` y `height` en las `<img>` reales. Con los filtros anteriores, ninguna obra real llega aquí sin foto. |
| `src/components/CarruselObras.astro` | La imagen real (:108) lleva `srcset`. Los ids de las muestras pasan de `obra-${seccion}-${i+1}` a **`muestra-${seccion}-${i+1}`** (:50), para que no choquen con slugs reales. Las obras reales llevan `data-obra-real="<slug>"` en el `<article>` y en su panel `[data-ficha]`. Hay que confirmar que `despliegue.ts:29-30,85` sigue funcionando. |
| `src/pages/proyectos/index.astro` | Se reemplaza `hayReales` (:22-27, :53, :72) por un `usaMuestra` y un conteo **por bloque** (en curso, contratados, terminados). Cada bloque usa sus propios valores para el carrusel, la tabla, la cuenta del índice (con `Pendiente` solo en los bloques que muestran ejemplos) y la nota «contratadas que aún no parten». Nunca se dibuja `CarruselObras` con `obras=[]`, porque `(n+0)%0` da NaN. En la fila real de contratados (:96-98) no se usa `Pendiente`: la superficie nula se muestra como «—». |
| `src/pages/index.astro` | Se confirma el respaldo por bloque que ya existe (:64). |
| `scripts/verificar-obras-reales.mjs` (nuevo, **obligatorio**) | Por cada slug real revisa solo el marcado de esa obra: `.portada` y `.ficha-obra` de `dist/proyectos/<slug>/index.html`, y los elementos con `data-obra-real="<slug>"` en `dist/proyectos/index.html` y `dist/index.html`. Los recorta con un escaneo de etiquetas balanceadas, sin dependencias nuevas, y falla si encuentra `data-pendiente`, `class="pendiente"`, `class="revisar"`, `class="ejemplo"` o `[REVISAR:`. **No** mira Pie ni BarraContacto (`Base.astro:52-53`): esos marcadores generales los vigila la guarda de producción. |
| `.github/workflows/deploy.yml` | Después de `npm run build`: (1) `node scripts/verificar-obras-reales.mjs` como paso **bloqueante**; (2) `echo "$GITHUB_SHA" > dist/build.txt`; (3) un paso «contar marcadores» con `continue-on-error: true` que cuenta en `dist/**/*.html` las apariciones de `data-pendiente`, `pendiente`, `revisar`, `ejemplo` y Referencial, e imprime los totales. No se usa un build con `SITE=lols.cl`, porque ese se cae en el primer marcador. No se tocan `paths-ignore` ni `concurrency`. |
| `scripts/cpanel-deploy.sh` | Filtro previo al rsync (ver 3.4). Es la **versión de referencia**: en el servidor corre una copia fijada. |
| `docs/contenido-obras.md` (nuevo) | Contrato de datos (3.2), dueño de cada ruta, regla «nadie reconocible» y que en el JSON nunca va nada interno. |
| `docs/DEPLOY.md` | `build.txt`, script fijado, lista de hashes permitidos y cómo actualizarla a mano. |

**3.1.a `src/data/proyectos.ts`**
- Se mantienen `Estado`, `estados`, `tiposObra`, `pictogramaDeTipo` y `plantilla`.
- El tipo foto pasa a `{ src, alt, srcset?, width?, height? }`. Se agregan `rol: string|null` y `esReal: boolean`.
- `export const proyectos = await cargar()`, con estos pasos:
  1. `getCollection('obras')`.
  2. Si `entry.data.slug !== entry.id`, **lanza** un error.
  3. Si algún `src` o alguna URL del `srcset` no existe en `public/` (`fs.existsSync`), **lanza**.
  4. Ordena por el orden de `estados`, después por `orden` y al final por `nombre` (desempate determinista; el orden del glob no significa nada).
- Sin archivos devuelve `[]`. Se elimina la revisión de duplicados sobre la salida de `getCollection`, porque nunca podría dispararse.

**3.1.b `FichaObra.astro`** (se aplica solo a obras reales; con `esEjemplo` todo queda igual)
- Un campo opcional en `null` **oculta su fila**: mandante, plazo, rol, cifra, desafío, solución, resultado y **superficie**.
- `titular` y `tipo` son obligatorios en el contrato, así que nunca caen en `Pendiente`. `.titulo-ficha` siempre existe, porque `despliegue.ts:85` le da el foco.
- La fila de ubicación muestra `comuna` y, si existe, `direccion` (D3 resuelto: se publica).
- El testimonio (:89-94) aparece solo en el ejemplo.
- Sin galería no se dibuja la sección de galería (:130).

### 3.2 Contrato de datos (lo que escribe la Bóveda)

`src/content/obras/<slug>.json`, validado con un objeto estricto:

| Campo | Regla |
|---|---|
| `slug` | `/^[a-z0-9]+(-[a-z0-9]+)*$/`, máx. 80, distinto de `ejemplo` y de `muestra-*`, igual al nombre del archivo |
| `orden` | int ≥ 0 |
| `estado` | `'en-curso' \| 'contratado' \| 'terminado'` |
| `nombre` | string trim 1..160 |
| `titular` | string trim 1..240, **obligatorio** |
| `tipo` | enum `tiposObra`, **obligatorio** |
| `mandante`, `rol`, `comuna`, `inicio`, `plazo`, `desafio`, `solucion`, `resultado` | string trim min 1 o `null`. **Nunca `''`.** |
| `direccion` | string trim 1..200 o null (D3: se publica) |
| `superficieM2` | number > 0 o null. Una transformación lo convierte en `superficie: '6.800 m²'` (es-CL). |
| `anio` | int 1995..2100 o null |
| `servicios` | enum de los slugs de `empresa.ts:104-110`, mínimo 1 |
| `cifra` | `{ valor, etiqueta }` o null |
| `fotos` | `[{ src, srcset, width, height, alt (min 5) }]`; `fotos[0]` es la portada |
| `video` | `null` (reservado) |

Reglas cruzadas (`superRefine`):
- `terminado` exige `anio`, `comuna` y portada.
- `en-curso` exige `inicio`, `comuna`, `superficieM2` y portada.
- `contratado` exige `inicio`, `comuna` y `superficieM2`. La foto es opcional: su ficha usa el pictograma y no aparece en tarjetas.
- Cada `src` empieza con `/proyectos/${slug}/`.

**Prohibido en el JSON**, porque el repo es público y su historial es permanente: `obra_id`, ids internos, usuarios, correos, quién aprobó, fechas de auditoría y costos.

Fotos: `public/proyectos/<slug>/portada.<hash8>-<800|1600>.webp`.

### 3.3 Convivencia de ejemplos y obras reales

- **Sin JSON:** el sitio queda igual que hoy.
- **Un bloque con obras reales:** ese bloque muestra solo lo real.
  - En construcción reemplaza a `obrasEnCurso`.
  - Terminados reemplaza a `obras2018`.
  - Contratados reemplaza a `ejemplosContratados`.

  Los demás bloques mantienen sus ejemplos, sus notas y sus cuentas con `Pendiente`. La portada y `servicios/[slug]` se comportan igual.
- **Guarda de producción** (`SITE=https://lols.cl`): sigue fallando mientras quede cualquier marcador. D1 se implementa recién al migrar el dominio.

### 3.4 Endurecimiento del deploy: el PAT es una credencial de nivel servidor

1. **Script fijado:** el cron ejecuta `~/bin/cpanel-deploy-lols.sh`, una copia que se actualiza a mano, y deja de hacer `git checkout ... -- scripts/cpanel-deploy.sh`. Claude prepara el archivo y la línea de cron exacta; el usuario los aplica en cPanel (paso humano 5.1).
2. **Filtro antes del rsync**, dentro del script fijado:
   - Si `dist/` contiene `*.php`, `*.phtml`, `*.phar`, `*.cgi`, `*.pl`, `*.py`, `*.sh`, `.htaccess` o `.user.ini` que **no estén en la lista blanca**, el deploy aborta.
   - Hoy la lista blanca tiene `api/contacto.php` y `.htaccess`, cada uno con su sha256 fijado en el script.
   - También aborta si encuentra cualquier **symlink**, porque un enlace a `~/boveda/.env` lo dejaría visible en la web.
   - Al abortar escribe `FALLO · filtro` en `deploy-status.txt` y no toca el docroot.
   - Si `.htaccess` o `contacto.php` cambian, alguien actualiza los hashes a mano (documentado en `DEPLOY.md`).
   - No se excluye `.htaccess` sin más, porque `public/.htaccess` es parte del sitio.
3. Con esto, quien tenga el PAT y **no** tenga permiso Workflows puede alterar lo que se ve en nuevo.lols.cl, pero no ejecutar código en el servidor. En la Bóveda se agrega además la lista blanca de rutas (4.4) y un vencimiento de 90 días. D2 reduciría todavía más el alcance.

### 3.5 Verificación de Fase 0 (antes del push a main)

1. `npm run build` sin JSON y diff del HTML de `dist/` contra un build hecho antes del cambio. Solo deben cambiar los ids `muestra-*` y los atributos nuevos.
2. Fixtures locales **sin commitear**, con texto ficticio e imagen sintética, uno por estado y solo con los campos mínimos:
   - cero marcadores dentro de `.ficha-obra`;
   - la ficha se abre en su lugar;
   - `/proyectos/<slug>/` existe;
   - `verificar-obras-reales.mjs` pasa;
   - el **contratado sin foto** muestra el pictograma y no aparece en «Otros proyectos» ni en `/servicios/*`.
3. Casos que deben **fallar el build**:
   - JSON roto;
   - campo desconocido;
   - `servicios: ['x']`;
   - `terminado` sin `anio`;
   - foto inexistente;
   - slug distinto del nombre de archivo;
   - dos archivos con el mismo `slug` interno;
   - `''` en lugar de null;
   - `titular` o `tipo` null;
   - un `<Pendiente>` inyectado en la ficha real, que debe hacer fallar a `verificar`.
4. Solo en construcción con obras reales: contratados y terminados siguen con ejemplos, cuentas con `Pendiente` y su nota; el JS del carrusel no falla.
5. Filtro del deploy, probado en local con un `dist` falso: un `x.php` extra, un `.htaccess` modificado y un symlink abortan; el `dist` real pasa.
6. Se borran los fixtures, se hace push a main y se revisa `nuevo.lols.cl`: sin cambios visibles, con `/build.txt` presente y `deploy-status.txt` en OK.

**CP1: el dueño revisa nuevo.lols.cl** (debe verse idéntico) y el usuario aplica el script fijado (5.1).

---

## 4. FASE 1: módulo «Sitio web» en la Bóveda

Se trabaja en el worktree `C:\Users\maatr\Desktop\B-Lols\Boveda-LOLS\.claude\worktrees\sitio-web` (rama `claude/sitio-web`, base `origin/develop`).

### 4.1 Migración `backend/db/migrations/147_sitio_web_obras.sql`

**Riesgo de colisión.** `migrate.js:219-225` aborta **todas** las migraciones si se repite un prefijo.
- Justo antes de cada push, y de nuevo después de cualquier rebase: `git fetch origin && git ls-tree --name-only origin/develop backend/db/migrations/ | sort | tail -3`.
- Si el número ya está tomado: `git mv` al siguiente libre y actualizar la cabecera, `sitio_web_147.test.js`, la mención en `index.js` y la de `docs/reglas/sitio-web.md`.
- Nuevo test de CI, `backend/tests/migraciones_sin_duplicados.test.js`: lee `backend/db/migrations` con el filtro `/^\d{3}_.+\.sql$/` (exportando `listMigrationFiles` o replicando el filtro) y espera `findUnexpectedDuplicates(files)` igual a `[]`.

La cabecera sigue el formato de la 122 y termina con «Idempotente (MariaDB)». Las columnas de valores cambiantes son VARCHAR validados en código, como en la mig 124.

```sql
CREATE TABLE IF NOT EXISTS sitio_obras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  obra_id INT NULL COMMENT 'Vínculo opcional a obras; NUNCA sale al JSON',
  slug VARCHAR(80) NOT NULL COMMENT 'Se congela tras la primera publicación',
  nombre VARCHAR(160) NOT NULL, titular VARCHAR(240) NULL COMMENT 'Obligatorio para publicar',
  tipo VARCHAR(40) NULL COMMENT 'Obligatorio para publicar; = tiposObra',
  mandante VARCHAR(160) NULL,
  mandante_autoriza BOOLEAN NOT NULL DEFAULT 0, mandante_autoriza_por INT NULL, mandante_autoriza_at DATETIME NULL,
  rol VARCHAR(80) NULL, comuna VARCHAR(80) NULL,
  superficie_m2 DECIMAL(10,2) NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'en_construccion' COMMENT 'en_construccion|contratado|terminado',
  anio SMALLINT NULL, inicio VARCHAR(40) NULL, plazo VARCHAR(40) NULL,
  servicios VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'CSV de slugs',
  desafio TEXT NULL, solucion TEXT NULL, resultado TEXT NULL,
  cifra_valor VARCHAR(40) NULL, cifra_etiqueta VARCHAR(80) NULL,
  orden INT NOT NULL DEFAULT 100,
  incluir BOOLEAN NOT NULL DEFAULT 0,
  publicado_hash CHAR(64) NULL COMMENT 'sha256 del JSON que entró al commit',
  publicado_json MEDIUMTEXT NULL COMMENT 'Último JSON publicado OK (respaldo si hay faltantes)',
  publicado_at DATETIME NULL,
  creado_por INT NULL, actualizado_por INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sitio_obras_slug (slug),
  UNIQUE KEY uk_sitio_obras_obra (obra_id),
  INDEX idx_sitio_obras_incluir (incluir, estado, orden),
  CONSTRAINT fk_sitio_obras_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sitio_obra_fotos (
  id INT AUTO_INCREMENT PRIMARY KEY, sitio_obra_id INT NOT NULL,
  rol VARCHAR(10) NOT NULL DEFAULT 'portada' COMMENT 'portada|galeria (galería en Fase 2)',
  orden INT NOT NULL DEFAULT 0, alt VARCHAR(200) NULL,
  ruta VARCHAR(255) NOT NULL COMMENT 'Relativa a uploads; nunca sale al JSON',
  hash CHAR(64) NOT NULL, ancho INT NOT NULL, alto INT NOT NULL, tamano_bytes INT NOT NULL,
  subido_por INT NULL,
  sin_personas_confirmado BOOLEAN NOT NULL DEFAULT 0, confirmado_por INT NULL, confirmado_at DATETIME NULL,
  aprobada_por INT NULL, aprobada_at DATETIME NULL, aprobada_hash CHAR(64) NULL COMMENT 'Bytes aprobados',
  rechazada_por INT NULL, rechazada_at DATETIME NULL COMMENT 'Bloqueo de emergencia',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sitio_fotos_obra (sitio_obra_id, rol, orden),
  CONSTRAINT fk_sitio_fotos_obra FOREIGN KEY (sitio_obra_id) REFERENCES sitio_obras(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sitio_publicaciones (
  id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL,
  modo VARCHAR(12) NOT NULL COMMENT 'publicar|simulacion', repo VARCHAR(120) NOT NULL, rama VARCHAR(100) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'en_curso' COMMENT 'en_curso|ok|sin_cambios|simulada|error|interrumpida',
  commit_sha CHAR(40) NULL COMMENT 'Se guarda ANTES del PATCH', parent_sha CHAR(40) NULL,
  manifiesto_previsto MEDIUMTEXT NULL, manifiesto MEDIUMTEXT NULL COMMENT '{ruta: blobSha} confirmado',
  obras_json MEDIUMTEXT NULL COMMENT '{sitio_obra_id: sha256} de lo enviado',
  obras_incluidas INT NOT NULL DEFAULT 0, resumen VARCHAR(500) NULL,
  error_codigo VARCHAR(60) NULL, error_mensaje VARCHAR(500) NULL COMMENT 'Seguro: sin token ni headers',
  build_estado VARCHAR(20) NULL, build_url VARCHAR(255) NULL, en_linea_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finalizado_at DATETIME NULL,
  INDEX idx_sitio_pub_estado (estado, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sitio_web_historial (
  id INT AUTO_INCREMENT PRIMARY KEY, sitio_obra_id INT NULL,
  entidad VARCHAR(20) NOT NULL, entidad_id INT NULL, accion VARCHAR(24) NOT NULL,
  resumen VARCHAR(500) NOT NULL, detalle TEXT NULL, usuario_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sitio_hist_obra (sitio_obra_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
 ('sitio_web.ver','Sitio web','Ver sitio web','Ver obras del sitio y estado de publicación',1),
 ('sitio_web.editar','Sitio web','Editar obras del sitio','Borradores y fotos',2),
 ('sitio_web.publicar','Sitio web','Publicar en lols.cl','Aprobar fotos y publicar en el sitio público',3);
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
 (1,'sitio_web.ver'),(1,'sitio_web.editar'),(1,'sitio_web.publicar');
```

MariaDB admite varios NULL bajo `uk_sitio_obras_obra`. El `ER_DUP_ENTRY` ya se traduce a 409. La migración no da permisos a otros roles.

### 4.2 Permisos

| Clave | Para qué | Nivel en Roles |
|---|---|---|
| `sitio_web.ver` | Lista, vista previa y estado | Nivel «Mira» |
| `sitio_web.editar` | Borradores, fotos, confirmación «sin personas» | Nivel «Edita» |
| `sitio_web.publicar` | Aprobar y rechazar fotos, Publicar, Resincronizar | `x()` delicada: ningún nivel la da; se asigna a mano |

Archivos, todos en el mismo commit (los tests del frontend hacen `require` del catálogo del backend):
- `backend/src/config/permisos.config.js`: 3 filas, módulo `'Sitio web'`.
- `frontend/src/config/permisosHierarchy.ts`: `ver` y `editar` con `seccion: 'configuracion', subseccion: 'Sitio web'`. Para publicar: `'sitio_web.publicar': { seccion: 'configuracion', subseccion: 'Sitio web', verbo: 'aprobar', sensible: 'critico' }`.
- `frontend/src/config/permisosPantallas.ts`: fila explícita, **sin `dinero` y sin `libre`**:
  `{ id: 'sitio_web', nombre: 'Sitio web', grupo: 'configuracion', etiquetas: ['Mira', 'Edita'], items: [i('sitio_web.ver',…,1), i('sitio_web.editar',…,2), x('sitio_web.publicar',…)] }`.
- `frontend/src/components/soporte/accesosPerfil.ts`: `MENU_DE_MODULO['Sitio web']` y `MODULO_DE_PREFIJO['sitio_web']`.
- Por verificar: que el panel de overrides agrupe un módulo nuevo. Si no lo hace, se usa `'Sistema'` con orden 12 a 14 y `MENU_DE_CLAVE`.

Gates (`checkPermission` es OR):

```js
const ver = [auth, checkPermission('sitio_web.ver','sitio_web.editar','sitio_web.publicar')];
const editar = [auth, checkPermission('sitio_web.editar','sitio_web.publicar')];
const publicar = [auth, checkPermission('sitio_web.publicar')];
// /obras/disponibles y /obras/sugerencias: editar + en el handler exigir también obras.ver (403 si falta)
```

«Ver como» ya bloquea las escrituras (`auth.js:61-63`).

### 4.3 Entorno y guarda staging/producción

`backend/.env.example` (todo comentado):

```
# --- Sitio web (lols.cl). Valores reales SOLO en el .env de cPanel PROD. Sin token => simulación.
# GITHUB_TOKEN_SITIO=
# GITHUB_REPO_SITIO=Mauricio-Alvarez-T/lols.cl
# GITHUB_BRANCH_SITIO=main
# SITIO_WEB_MODO=simulacion              # publicar | simulacion
# SITIO_WEB_PERMITIR_REPO_PUBLICO=       # =1 SOLO en el .env de producción
# GITHUB_TOKEN_SITIO_VENCE=2027-01-26    # aviso 30 días antes
# GITHUB_AUTOR_EMAIL_SITIO=              # correo público del autor «Bóveda LOLS»
# SITIO_WEB_URL=https://nuevo.lols.cl
```

- **No** van en el REQUIRED de `env-validator.js`.
- La función pura `modoEfectivo({ env, dbName, dirname })`, en `sitioWebGuarda.js`, devuelve `'publicar'` **solo si se cumplen todas** estas condiciones:
  - `SITIO_WEB_MODO==='publicar'`, hay token y `GITHUB_BRANCH_SITIO` está declarada;
  - si el repo es `Mauricio-Alvarez-T/lols.cl`, además:
    - `dbName === BD_PRODUCCION`, importado de `saneoStaging.service.js`;
    - `dbName` no coincide con `/test|staging|dev/i`;
    - `dirname` no contiene `test-boveda`;
    - `SITIO_WEB_PERMITIR_REPO_PUBLICO==='1'`.
- En cualquier otro caso devuelve `'simulacion'`. Así, copiar las líneas del `.env` de producción a staging **no** publica.
- Un repo privado de prueba desde staging sí se permite.
- El token se lee de forma perezosa y nunca se registra, se devuelve ni va dentro de un error.
- **Saneo:** agregar `sitio_obras`, `sitio_obra_fotos`, `sitio_publicaciones`, `sitio_web_historial` y `uploads/sitio-web/` a la purga de `saneoStaging.service.js` (verificar la forma exacta de la lista), para que un import desde producción no deje borradores reales en un staging accesible desde internet.

### 4.4 Archivos del backend

| Archivo | Contenido |
|---|---|
| `src/config/sitioWeb.config.js` | `ESTADOS` con el mapa al sitio (`en_construccion`→`en-curso`), `TIPOS` y `SERVICIOS` (**espejo de lols.cl**; el build del sitio es la segunda red), `ANCHOS=[800,1600]`, `MAX_MAESTRA=2400`, `RUTAS_DUENAS`, `SLUG_RESERVADOS`. Expresiones regulares de rutas permitidas: `^src/content/obras/[a-z0-9-]+\.json$` y `^public/proyectos/[a-z0-9-]+/portada\.[0-9a-f]{8}-(800\|1600)\.webp$`. |
| `src/services/sitioWebGuarda.js` | `modoEfectivo` (4.3) y `rutaPermitida(path)`. |
| `src/schemas/sitioWeb.schema.js` | Esquemas de validateBody, no zod. `crearObra`: nombre requerido, `slug` con pattern, `estado`/`tipo` con `in`, `maxLength` 160/240/1200, `superficie_m2` ≥ 0.01, `anio` 1995-2100, `obra_id` ≥ 1, `servicios` array, `mandante_autoriza` boolean. `editarObra`: lo mismo sin required, más `updated_at` requerido. `incluir` boolean. `orden`: `ids` array de enteros. `editarFoto`: `alt` 5-200, `sin_personas_confirmado` boolean. `publicar`: `confirmo_revision` boolean. `resincronizar`: `confirmo` boolean. |
| `src/services/sitioWeb.service.js` | CRUD con `err()`, `registrar()` y `diferencias()`, como en Costos. Captura `ER_NO_SUCH_TABLE` y responde 409 `SITIO_WEB_SIN_MIGRAR`. `slugDesde`; slug congelado → 409. Concurrencia: PUT compara `updated_at` y responde 409 `SITIO_WEB_EDITADA_POR_OTRO`. `obrasDisponibles()`: `es_prueba=0 AND (activa=1 OR finalizada=1)` y no vinculadas. `sugerencias()`: superficie solo con `costos.gestionar`. PUT `incluir=true` → 409 si hay `faltantes` y la obra nunca se publicó; pasar a `false` **nunca** se bloquea. Funciones puras: `serializarObra` con lista blanca (`mandante` null salvo `mandante_autoriza=1`), `faltantes` y `estadoDerivado`. |
| `src/services/sitioWebFotos.service.js` | Ver 4.6. |
| `src/services/sitioWebGithub.service.js` | `gh()` con `fetchImpl` inyectable (patrón de `feriados.service.js`), headers `Bearer`, `application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28` (nota para revisarla) y `User-Agent: BovedaLOLS-SitioWeb/1.0`, timeout de 30 s, manejo de `retry-after`. Errores: 401 → **424** `SITIO_WEB_TOKEN_INVALIDO`; 403/404 → **424** `SITIO_WEB_SIN_ACCESO`; timeout → 504 (solo mensaje). Nunca incluye token, headers ni la respuesta cruda. También `gitBlobSha`, `leerArbol` (falla si viene `truncated`), `crearCommit`, `moverRef(force:false)`, `estadoBuild(sha)` y `contiene(base, head)` vía `compare` (`identical\|ahead`). **Cada ruta de `files` y `deletes` pasa por `rutaPermitida`; si alguna no pasa, lanza un error antes de cualquier llamada.** |
| `src/services/sitioWebEnLinea.js` | Lee `SITIO_WEB_URL/build.txt` con `redirect:'error'`, timeout de 10 s, tope de 1 KB y **sin token**. Valida `/^[0-9a-f]{40}$/`; si no cumple, el estado es «desconocido». Caché de 15 s. |
| `src/services/sitioWebPublicar.service.js` | Flujo 4.7, conciliación, `resincronizar`, `pendientes()`. |
| `src/middleware/upload-sitio-web.js` | Guarda en `uploads/sitio-web/tmp/<uuid>.bin` (nombre fijo, sin la extensión del cliente). JPG, PNG o WEBP por mimetype, **10 MB** (como los demás uploads y el mensaje de `errorHandler.js:36-38`). |
| `src/routes/sitio-web.routes.js` | Endpoints de 4.5; las rutas fijas antes de `/:id`. |
| `backend/index.js` | `safeRoute('/api/sitio-web', './src/routes/sitio-web.routes', 'Sitio web (mig 147)')` cerca de costos (~:527). |
| `src/middleware/logger.js` | Salida temprana para `/^\/api\/sitio-web(\/\|$)/`. `logManualActivity` al crear, borrar, incluir, aprobar, rechazar y publicar. |

Errores para la UI: los estados en los que la UI tiene que decidir algo se devuelven como **4xx con `code`**: `SIN_MIGRAR`, `TOKEN_INVALIDO`, `SIN_ACCESO`, `REPO_MODIFICADO`, `PUBLICACION_EN_CURSO`, `EDITADA_POR_OTRO`. Los 5xx solo traen `error`. Los códigos de una publicación también quedan en `sitio_publicaciones.error_codigo` y se devuelven en un 200 `{data}`.

### 4.5 Endpoints (envoltorio `{ data }`; solo GET, POST, PUT y DELETE)

| Método y ruta | Gate | Qué hace |
|---|---|---|
| GET `/config` | ver | `{ modo, repo, rama, urlSitio, tokenVenceEnDias, catalogos }`, nunca el token |
| GET `/obras` | ver | Lista con `estadoDerivado`, `tiene_portada`, `faltantes` |
| GET `/pendientes` | publicar | `{ fotosPorAprobar, obrasConCambios, ultimaConError }` para el badge |
| GET `/obras/disponibles`, `/obras/sugerencias/:obraId` | editar **+ obras.ver** | Vincular y prellenar |
| GET `/obras/:id` | ver | Detalle, fotos (sin `ruta`) y JSON serializado |
| POST `/obras` · PUT `/obras/:id` | editar | `validateBody(…,{strip:true})`; PUT con `updated_at` |
| PUT `/obras/:id/incluir` | editar | Ver regla en 4.4 |
| PUT `/obras/orden` | editar | `{ estado, ids[] }`: reescribe `orden` 10, 20, … |
| DELETE `/obras/:id` | editar | Solo si `incluir=0` y no figura en el último manifiesto OK; si no, 409 `SITIO_WEB_OBRA_EN_LINEA` |
| POST `/obras/:id/fotos` | editar | Sube la portada (siempre crea una **fila nueva**) |
| PUT `/fotos/:fotoId` | editar | `alt`, confirmación; un cambio en la confirmación **anula la aprobación** |
| POST `/fotos/:fotoId/aprobar` · `/rechazar` | publicar | Ver 4.6 |
| DELETE `/fotos/:fotoId` | editar | Fila y archivos; los blobs ya publicados se conservan vía `publicado_json` |
| GET `/fotos/:fotoId/archivo?ancho=` | ver | `ancho` ∈ {800, 1600, maestra}, si no 400; ruta tomada de la BD; `res.sendFile(rel, { root: UPLOADS_DIR })` |
| GET `/publicacion/previa` | publicar | Diferencias locales contra el último manifiesto: obras nuevas, cambiadas, retiradas y «se mantiene la versión publicada»; archivos; lo que bloquea. Sin GitHub. |
| POST `/publicar` | publicar | **Síncrono** (4.7). Responde 200 con el resultado; 409 si está en curso |
| GET `/publicaciones` · `/publicaciones/:id` | ver | Últimas 20; pasos y build (actualiza `build_estado` y `en_linea_at`) |
| GET `/publicaciones/:id/paquete` | publicar | Solo simulación: ZIP (archiver) |
| POST `/publicaciones/resincronizar` | publicar | Ver 7.2 |

### 4.6 Fotos: «nadie reconocible» con dos llaves atadas a los bytes

1. `sharp` se carga de forma perezosa (patrón `cargarDeps`).
2. Antes del pipeline: `metadata().format` ∈ {jpeg, png, webp}; si no, 400. Se usa `limitInputPixels: 50e6`.
3. `sharp(buf,{failOn:'error',limitInputPixels}).autoOrient().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:90})` genera la maestra sin metadatos. El `.bin` original se borra (`finally`).
4. De la maestra salen las derivadas `webp({quality:78})` de 800 y 1600. Se verifica que `exif`, `xmp` e `iptc` sean `undefined` en las tres salidas; si no, se rechaza.
5. Se guarda en `uploads/sitio-web/<sitioObraId>/<hash>-{maestra.jpg,800.webp,1600.webp}`.
6. En cada subida, y al arrancar, se limpian los archivos de `tmp/` con más de 1 hora.
7. La subida exige `sin_personas='true'` y `alt`; si faltan, 400 `SITIO_WEB_FOTO_SIN_CONFIRMAR`. Una subida nueva **siempre crea otra fila** con la aprobación en null; la portada anterior se borra cuando la nueva queda aprobada.
8. `aprobar` exige que haya confirmación (D4 resuelto: puede aprobar la misma persona que subió). Guarda `aprobada_hash = hash`.
9. Al publicar se exige `hash === aprobada_hash`, `rechazada_at IS NULL` y que la confirmación no haya cambiado después de aprobar.
10. `rechazar` (emergencia): deja `rechazada_*`, anula la aprobación y la foto nunca vuelve a salir.
11. La detección automática de caras queda fuera de alcance.

### 4.7 Flujo de publicación (síncrono, en la misma request)

Fase 1 es solo portada: son unas 10 a 40 llamadas en serie, sin `setImmediate` ni trabajo en segundo plano (regla Passenger, `infraestructura.md:40`). La llamada del frontend usa un timeout de 120 s.

1. **Lock.** Conexión dedicada y `GET_LOCK('sitio_web_publicar',0)`; si da 0, 409. El lock se libera solo si el proceso muere.
2. **Conciliar huérfanas.** Toda fila `en_curso` se considera huérfana.
   - Si tiene `commit_sha` y `contiene(commit_sha, head main)` → pasa a `ok`, adopta `manifiesto_previsto` y actualiza `publicado_*` desde `obras_json`.
   - Si no → `interrumpida` (sin efecto).
3. Se inserta la fila `en_curso` con `modo = modoEfectivo()`.
4. **Armar la foto completa** con las obras `incluir=1`.
   - Sin faltantes: se serializa.
   - **Con faltantes y `publicado_json`:** se reusa la última versión publicada con sus rutas de foto, y se avisa. Así una edición a medias de una obra ajena nunca bloquea la publicación ni un retiro de emergencia.
   - Con faltantes y nunca publicada: se excluye y se avisa (no debería pasar, por la regla de `incluir`).
   - Las fotos cumplen 4.6.9.
   - JSON con 2 espacios y `\n` final. Todas las rutas pasan por `rutaPermitida`.
5. **Simulación.** Se guarda el manifiesto en estado `simulada` y se arma el ZIP. Sin token no se hace ninguna llamada a GitHub; los borrados se calculan contra el último manifiesto simulado.
6. **Publicar.** Bucle de hasta 3 intentos; **en cada uno**:
   - leer ref y árbol;
   - comparar las `RUTAS_DUENAS` remotas con el último manifiesto OK (en la primera publicación solo debe haber `.gitkeep`); si difieren, aborta con `SITIO_WEB_REPO_MODIFICADO` sin sobrescribir;
   - calcular los borrados contra ese árbol, sin tocar nunca `.gitkeep`;
   - subir los blobs que falten (300 ms entre cada uno);
   - crear el tree con `base_tree` y el commit, con el mensaje `sitio: publicar obras (pub #<id>)`, sin nombres ni `[skip ci]`, y autor `Bóveda LOLS <GITHUB_AUTOR_EMAIL_SITIO>`;
   - **guardar `commit_sha`, `manifiesto_previsto` y `obras_json` en la fila**;
   - `PATCH` con `force:false`; un 422 pasa al intento siguiente.

   Si no hay cambios: `sin_cambios`.
7. **OK.** `estado='ok'` y `manifiesto`. Por cada obra: `publicado_hash` = sha256 **del JSON enviado** (nunca de la fila releída), `publicado_json` y `publicado_at`. Se escriben historial y `logManualActivity`.
8. **Error.** `estado='error'`, `error_codigo` y un mensaje seguro. `finally`: `RELEASE_LOCK` y `release()`.
9. **Después del commit**, calculado en GET: compilando o en cola → compilación OK o falló (con `html_url`) → «reemplazada» (cancelada por una publicación posterior; no es error) → **en línea** cuando `build.txt` contiene el commit.

**`estadoDerivado` de la obra:** borrador · listo para publicar · **publicando** (commit hecho, build no OK o todavía no en línea) · **publicada** (hash igual, build OK y en línea) · **no llegó al sitio** (build falló; texto: «El sitio sigue mostrando la versión anterior. Avisa a Mauricio.») · cambios sin publicar · retiro pendiente.

### 4.8 Frontend (skill `diseno-lols`, plantilla `Costos.tsx`)

| Archivo | Cambio |
|---|---|
| `src/pages/SitioWeb.tsx` | `useStandardHeader({ title:'Sitio web', icon: Globe })`; `EmptyState` si no hay acceso. `?obra=ID&tab=datos\|fotos\|vista` y `?vista=publicaciones`. `PestanasElasticas` en `BarraPaginada`. Grilla `grid gap-3 sm:grid-cols-2 xl:grid-cols-3` agrupada por estado, con miniatura, nombre, comuna, `StatusBadge` y Chip ámbar «Faltan N». **Flechas subir/bajar** (`IconButton`) por estado → PUT `/obras/orden`. `Aviso` ámbar si `tokenVenceEnDias ≤ 30`, o si es null en modo publicar. `Aviso` rojo con texto de acción si la última publicación terminó en error o no llegó al sitio. `SearchBar` con más de 6 obras. |
| `src/components/sitio-web/sitioWebConfig.ts` | Textos, catálogos, `CAMPO`/`ETIQUETA` y `mensajeError` (usa `code` en 4xx y `error` en 5xx). |
| `src/components/sitio-web/reglas.ts` + `reglas.test.ts` | `slugDesde`, `faltantes` y `estadoDerivado`, con las mismas reglas que el backend y que 3.2. |
| `src/components/sitio-web/EditorObra.tsx` | Inputs `text-base`. Vínculo con una obra interna (`SearchableSelect`, como `AgregarObraModal`) **solo con `obras.ver`**. `Opciones` para estado y servicios. Casilla «El mandante autorizó publicar su nombre». Campo dirección (opcional). `useFormDirtyProtection`; faltantes en un `Aviso`; candado en el slug congelado; un 409 `EDITADA_POR_OTRO` muestra un `Aviso` con «Recargar». |
| `src/components/sitio-web/FotoPortada.tsx` | Bloque de `GastoModal.tsx:202-256` más la zona de arrastre de `ProponerMejoraModal`. `Aviso` fijo «Nadie reconocible: ni caras, ni nombres en cascos o chalecos, ni patentes». Casilla obligatoria «Confirmo que en la foto no se reconoce a ninguna persona». Quien tiene `publicar` ve «Aprobar foto» y «Rechazar», que antes abren `VisorAdjunto` con zoom; si es su propia foto, el botón aparece deshabilitado con el motivo. `compressImage` solo baja el peso. |
| `src/components/sitio-web/VistaPreviaFicha.tsx` | Vista aproximada que oculta los mismos campos que 3.1.b. Dice «la final se ve en nuevo.lols.cl». |
| `src/components/sitio-web/PublicarModal.tsx` | `Modal`, nunca `window.confirm`. Muestra `/publicacion/previa`: obras nuevas, cambiadas, retiradas y las que mantienen su versión publicada, archivos y bloqueos. Casilla «Revisé los textos y las fotos». Botón con `isLoading` («Publicando…, puede tardar un minuto»). En simulación dice «Simulación: no se publica nada» y ofrece «Descargar paquete». Oculto con `verComo`. |
| `src/components/sitio-web/EstadoPublicacion.tsx` + `useEstadoPublicacion.ts` | `useSyncExternalStore` con sondeo cada 10 s solo mientras está montado y no terminó (patrón `useErroresSoporte`). Texto «el sitio se actualiza en unos 5 a 10 minutos». |
| `src/utils/statusConfig.ts` | Dominio `sitioWeb`, con clases literales: verde publicada; neutro borrador; ámbar listo o cambios sin publicar; azul publicando; rojo error o no llegó. |
| `paginas.ts`, `App.tsx:73`, `layout/menuLateral.ts` | Ruta `sitio-web`. `ClaveMenu` más `'sitio_web'` después de `presupuestos`, visible con cualquiera de las 3 claves. |
| `Sidebar.tsx` extras | **Badge ámbar** con `fotosPorAprobar + obrasConCambios`, solo con `publicar`, que lleva a la lista filtrada (regla «acción en el lugar»). |
| `soporte/accesosPerfil.ts` `DESCRIPCION_MENU`, `soporte/iconosMenu.ts` | Ícono `Globe`. |
| `MainLayout.tsx:22` | `'/sitio-web'` en `SIN_OBRA_EN_CELULAR`. |
| Tests | `menuLateral.test.ts`, `panorama.test.ts`, `accesosPerfil.test.ts`, `permisosPantallas.test.ts` (niveles «Mira» y «Edita»). |

Antes de cerrar se revisa contra `review-rubric.md`: 360 px, contraste AA en claro y oscuro, verde solo para acciones.

### 4.9 Documentación

- `docs/reglas/sitio-web.md` (nuevo): permisos, campos, «nadie reconocible» (confirmación + aprobación ligadas al hash), foto completa y rutas dueñas, `modoEfectivo`, token solo en `.env`, estados, **procedimiento de incidente** (7.3) y rollback.
- `docs/reglas/INDEX.md`: fila nueva.
- `docs/reglas/seguridad-rbac.md`: claves nuevas, niveles Mira/Edita, `publicar` crítica.
- `docs/reglas/infraestructura.md:48`: agregar a Opcionales `GITHUB_*_SITIO` y `SITIO_WEB_*` («sin token ⇒ simulación; solo en el .env de cPanel»). Corregir las líneas obsoletas `:23` y `:35`.
- `backend/.env.example`.

### 4.10 Staging y simulación

- `/home/lolscl/test-boveda/.env` no lleva variables del sitio, y aunque las lleve, `modoEfectivo` fuerza simulación contra el repo público.
- Prueba real opcional: repo **privado** `Mauricio-Alvarez-T/lols-cl-prueba` con su propio PAT. **Nunca** una rama de prueba en el repo público.
- **Prueba de punta a punta del contrato:** se descarga el ZIP de staging, se copia en un lols.cl **local**, se corren `npm run build` y `verificar-obras-reales.mjs` (los dos deben pasar) y después se borra la copia.

### 4.11 Importación inicial de las obras de Marcos (agregado 28-oct)

Entre el 08 y el 20 de octubre, Marcos Uribe cargó ~27 obras reales del currículum 2026 directamente en el código de lols.cl. Las fotos quedaron en `public/proyectos/<slug>/1.jpg` y algunas obras tienen imágenes referenciales. El dueño decidió que esas obras **pasan a la Bóveda**. La Fase 0 v2 las convierte a `src/content/obras/<slug>.json`, conservando el orden (`orden`) y el campo `referencia` para los renders referenciales.

En la Fase 1 se agrega:

- **Acción «Importar obras del sitio»** (`sitio_web.publicar`, una sola vez, idempotente por slug):
  - lee el árbol de main por la API (o el ZIP en staging);
  - crea las filas en `sitio_obras` con `incluir=1`;
  - copia cada foto existente como portada **ya aprobada**, porque ya está publicada; queda en el historial «importada del sitio, revisar que nadie sea reconocible»;
  - guarda `publicado_json` y `publicado_hash` iguales al JSON del repo;
  - registra un manifiesto base en `sitio_publicaciones` (modo `importacion`).
- **Primera publicación:** se compara contra ese manifiesto base, no contra «solo .gitkeep».
- **Rutas dueñas y foto nueva:** las rutas dueñas aceptan también `public/proyectos/<slug>/1.jpg` heredadas. Cuando se sube una portada nueva, la heredada se borra en el mismo commit.
- **Campo `referencia`:** se conserva tal cual mientras la obra no tenga portada propia y se pone en null al aprobarse una.
- **Contrato:** el serializador acepta los mismos nulos que hoy tienen las obras reales (`tipo`/`titular` null en las de 2018, superficie null en Portal Edwards). Las reglas de `faltantes` (4.4) se alinean con el esquema real de `src/content.config.ts` (ver `docs/contenido-obras.md` de lols.cl).
- **Carpetas compartidas:** cuatro carpetas también las usa «Han confiado en nosotros» (`obrasConfianza`, que sigue en TS): `abate-molina-211`, `abate-molina-221`, `bascunan-guerrero-818` y `enfermera-lucia-vidal-arias-6679`. En ellas la Bóveda **nunca** borra ni reemplaza `1.jpg`, ni al aprobar una portada nueva ni al retirar la obra. El build de lols.cl falla si falta alguna.
- **Contrato real de la Fase 0 v2 (edab831), que manda sobre 3.2:**
  - `titular`, `tipo` y `superficieM2` pueden ser null; `comuna` es obligatoria.
  - `superficieM2` es un entero ≥ 1.
  - `referencia` puede ser una clave, null u omitirse, y solo va cuando `fotos` está vacío.
  - En-curso y terminado exigen `fotos[0]` o `referencia`; `anio` solo se permite en terminado.
  - **Ya no se aceptan** `rol`, `plazo`, `cifra` ni `video`: la Bóveda no los escribe en la Fase 1.
  - El slug no puede chocar con los ids de muestra del carrusel (`obra-<sección>-<n>`).
- **Aviso a Marcos:** desde la Fase 1, las obras se editan solo en la Bóveda. Un cambio a mano en `src/content/obras/` o `public/proyectos/<slug>/` hace que la siguiente publicación aborte con `SITIO_WEB_REPO_MODIFICADO`. Hay que resincronizar (7.2).

---

## 5. Pasos humanos del usuario (Claude nunca maneja credenciales)

1. **Después del CP1:**
   - copiar `scripts/cpanel-deploy.sh` a `~/bin/cpanel-deploy-lols.sh`;
   - cambiar el cron por la línea sin el `git checkout … -- scripts/cpanel-deploy.sh` (Claude entrega la línea exacta);
   - confirmar que `nuevo.lols.cl/deploy-status.txt` sigue en OK.
2. **Crear el PAT fine-grained:**
   - solo el repo `Mauricio-Alvarez-T/lols.cl`;
   - permisos **Contents: Read and write** y **Actions: Read**, **sin Workflows**;
   - **vencimiento de 90 días**.
3. **`.env` de producción** (`/home/lolscl/boveda/.env`): `GITHUB_TOKEN_SITIO`, `GITHUB_REPO_SITIO`, `GITHUB_BRANCH_SITIO=main`, `SITIO_WEB_MODO=publicar`, `SITIO_WEB_PERMITIR_REPO_PUBLICO=1`, `GITHUB_TOKEN_SITIO_VENCE`, `GITHUB_AUTOR_EMAIL_SITIO` (un correo dedicado, que será público) y `SITIO_WEB_URL`. Después, `touch tmp/restart.txt`.
4. **Staging:** no hacer nada. Si se quiere la prueba real, crear el repo privado de prueba y un PAT aparte.
5. **Migración:** corre sola. Revisar `migrate-status.txt` en staging y después en producción. Si dice FALLO, avisar.
6. **Volver a iniciar sesión** y **asignar permisos**: en Configuración › Roles, nivel Mira o Edita; en el ajuste fino, `sitio_web.publicar`.
7. Confirmar que main de lols.cl no tiene una protección de rama que bloquee el push con el PAT.
8. Renovar el token cada 90 días. La Bóveda avisa 30 días antes.
9. Responder D1 y D2 (D3 y D4 resueltos el 28-oct).

## 6. Verificación

**Backend:** jest + supertest con la BD simulada, como `costos.test.js`.

- **`backend/tests/sitio_web.test.js`:**
  - `serializarObra`: la lista blanca deja fuera `obra_id`, ids, usuarios y fechas; **`mandante` null sin autorización**; `''` pasa a null; `en_construccion` pasa a `en-curso`; las rutas quedan bajo `/proyectos/<slug>/`.
  - `faltantes`: uno por cada regla, incluidos `titular` y `tipo`.
  - Slug reservado o congelado → 409.
  - Gates por ruta; `disponibles` sin `obras.ver` → 403.
  - `incluir=true` con faltantes → 409; `incluir=false` siempre pasa.
  - `updated_at` viejo → 409.
  - `ER_NO_SUCH_TABLE` → 409 `SIN_MIGRAR`.
  - Los 5xx se verifican por `body.error`.
  - `archivo?ancho=../x` → 400.
- **`sitio_web_fotos.test.js`:**
  - con sharp real (o mock si no carga en CI), una imagen sintética con EXIF y GPS sale sin `exif`, `xmp` ni `iptc` y con la orientación aplicada;
  - SVG, TIFF o PDF → 400;
  - sin confirmación → 400 y el `.bin` se borra;
  - aprobar sin confirmación → 409; la misma persona que subió puede aprobar;
  - cambiar la confirmación anula la aprobación;
  - una foto con `hash ≠ aprobada_hash` o rechazada no se publica.
- **`sitio_web_guarda.test.js`** (`modoEfectivo`):
  - una BD `*test*` con todas las variables apunta al repo público → simulación;
  - `dirname` con `test-boveda` → simulación;
  - falta `PERMITIR_REPO_PUBLICO` → simulación;
  - repo privado de prueba → publicar;
  - `rutaPermitida` rechaza `scripts/x.sh`, `public/a.php` y `../`.
- **`sitio_web_github.test.js`** (`fetchImpl` simulado):
  - orden de las llamadas;
  - `base_tree` y `force:false`;
  - no sube blobs sin cambios;
  - nunca borra `.gitkeep`;
  - 401 → 424 sin el token en el mensaje ni en el log;
  - `truncated` aborta;
  - sin `[skip ci]`;
  - `gitBlobSha` correcto;
  - `build.txt` con un valor que no es SHA → «desconocido», sin llamar a `compare`.
- **`sitio_web_publicar.test.js`:**
  - lock ocupado → 409;
  - simulación sin token: cero llamadas a `fetch`;
  - manifiesto distinto → `REPO_MODIFICADO`;
  - **un 422 seguido de un head nuevo con una ruta dueña modificada aborta, no sobrescribe**;
  - **interrupción después del PATCH**: con el commit contenido en main la fila se concilia como `ok`, y si no está queda `interrumpida`;
  - una obra publicada con faltantes reusa `publicado_json`;
  - `publicado_hash` sale del JSON enviado aunque la fila se edite durante la publicación.
- **`sitio_web_147.test.js`:** solo `CREATE TABLE IF NOT EXISTS` e `INSERT IGNORE`, solo `rol_id 1`, sin `GRANT`, claves iguales a `permisos.config.js`.
- **`migraciones_sin_duplicados.test.js`.**

**Frontend:** `reglas.test.ts`, los tests de menú y permisos, y `npx tsc --noEmit && npm run build`.

**Antes del push:** `cd frontend && npx tsc --noEmit && npm run build`; `cd backend && npm test`; revisar el número de migración; `git push origin claude/sitio-web:develop`, nunca `--force`.

**Staging (test.boveda.lols.cl):**
1. `migrate-status.txt` en OK y volver a iniciar sesión.
2. Asignar las claves a dos usuarios de prueba.
3. Crear 3 obras ficticias, una por estado.
4. Comprobar que la portada se rechaza sin la casilla y que aprobar exige la confirmación.
5. Aprobar con el segundo usuario, simular y descargar el ZIP.
6. Hacer la prueba local de 4.10.
7. Verificar el badge y los avisos.
8. Comprobar a 360 px.

**Producción (CP4):** la primera publicación la hace el dueño con una obra real. Se verifican los pasos de la UI, `build.txt`, la ficha en nuevo.lols.cl y que `deploy-status.txt` pase el filtro.

## 7. Riesgos y rollback

### 7.1 Riesgos

| Riesgo | Mitigación |
|---|---|
| Una foto con una persona reconocible o con GPS queda para siempre en el historial público | Dos llaves de personas distintas atadas al hash, metadatos borrados y verificados en el servidor, original descartado, procedimiento 7.3 |
| El PAT se filtra y con él se obtiene ejecución de código en el servidor (mismo usuario que la Bóveda de producción y su `.env`) | Script fijado, filtro de ejecutables y symlinks (3.4), rutas en lista blanca en la Bóveda, sin Workflows, 90 días, D2. **Nota:** el código de staging corre con el mismo usuario unix y puede leer el `.env` de producción; es un riesgo aceptado y documentado en `infraestructura.md`. |
| Staging publica en el repo público | `modoEfectivo` (BD, ruta y variable exclusiva de producción) con su test |
| Datos reales en staging | Purga de las tablas `sitio_*` y de `uploads/sitio-web` en el saneo |
| Dirección o mandante expuestos (Ley 21.719, vigente desde el 1-dic-2026) | Dirección: el dueño decidió publicarla (28-oct), es dato de la obra y no de una persona; mandante solo con autorización registrada |
| Choque de la migración 147 | `ls-tree` antes del push y después de cada rebase, más el test de CI |
| Una edición a medias bloquea las publicaciones | Se reusa `publicado_json`; el retiro nunca se bloquea |
| El proceso muere a mitad de la publicación | Lock por conexión, `commit_sha` guardado antes del PATCH y conciliación automática |
| El build falla y el personal cree que está publicado | Estado «no llegó al sitio», aviso rojo y badge |
| Las listas espejo se desalinean | El build del sitio es la segunda red; la UI muestra «compilación falló» |
| El sitio crece en peso | 800 y 1600 px WebP q78, nombres por hash, re-publicar sin cambios no agrega nada |

### 7.2 Rollback

- **Retirar una obra:** «Quitar del sitio» y Publicar. Sus archivos se borran en un commit nuevo.
- **Emergencia sin la Bóveda:** `git revert <sha>` en main de lols.cl, sin `--force`. Después, en la Bóveda, **Resincronizar**:
  - toma el repo como manifiesto base;
  - **las obras con `incluir=1` cuyo JSON ya no existe en el repo pasan a `incluir=0`**, con `publicado_hash` y `publicado_json` en null, historial y un aviso en pantalla;
  - las fotos involucradas se marcan con «Rechazar».
- **Código de la Bóveda:** `git revert` del merge; las tablas quedan, porque la migración es aditiva.
- **Fase 0:** `git revert` en lols.cl, y el sitio vuelve a `proyectos: []`. El script fijado no cambia.
- Revertir **no** borra las fotos del historial.

### 7.3 Incidente «persona reconocible» (va en `docs/reglas/sitio-web.md`)

1. Quien lo detecte avisa a quien tiene `publicar` y a Mauricio.
2. Quien tiene `publicar`: «Rechazar» la foto → «Quitar del sitio» la obra, o subir otra portada → Publicar. El sitio queda limpio en 5 a 10 minutos (rsync).
3. Si la Bóveda no responde, Mauricio hace el `git revert` en lols.cl y después Resincronizar.
4. Mauricio evalúa con el dueño reescribir el historial de lols.cl (requiere su autorización explícita) y pedir a GitHub Support que purgue la caché y los commits colgantes. Se deja registro de que los clones o forks existentes pueden conservar la foto.
5. Se anota en el historial con fecha y responsable.

## 8. Tareas en orden

| # | Tarea | Esfuerzo |
|---|---|---|
| 1 | Fase 0: colección con `generateId`, `proyectos.ts`, FichaObra, `[slug]`, otros y relacionados, respaldo por bloque, `muestra-*`, `srcset` | 1 d |
| 2 | Fase 0: `verificar-obras-reales.mjs` bloqueante, `build.txt`, conteo de marcadores, filtro en `cpanel-deploy.sh`, docs y verificación 3.5; push a main | 1 d |
| **CP1** | **El dueño revisa nuevo.lols.cl (idéntico). El usuario fija el script y el cron (5.1).** | |
| 3 | Bóveda: migración 147 con su test, test de duplicados, permisos (backend más espejos con `sensible`), config, guarda y schema | 0,5 d |
| 4 | Servicios de CRUD, orden, concurrencia y fotos (sharp, dos llaves, hash), historial y tests | 2 d |
| 5 | GitHub, publicación síncrona con lock, conciliación, manifiesto por intento, reuso de `publicado_json`, en línea, resincronizar y tests | 2 d |
| 6 | Saneo de staging (tablas `sitio_*` y uploads) | 0,25 d |
| 7 | Frontend: página, lista con orden, editor, portada, vista previa, modal, estado, badge, avisos y menú | 3,5 d |
| 8 | Docs (`sitio-web.md` con incidente, INDEX, rbac, `infraestructura.md`, `.env.example`), tsc, build, npm test, número de migración; push a develop | 0,5 d |
| **CP2** | **El dueño revisa en test.boveda.lols.cl (simulación) ** | |
| 9 | ZIP de staging contra un build local de lols.cl; opcional, repo privado de prueba | 0,5 d |
| **CP3** | **El dueño aprueba el release a main de la Bóveda y decide D2** | |
| 10 | Release a producción. Usuario: PAT, `.env`, volver a iniciar sesión, permisos (5.2 a 5.7) | humano |
| **CP4** | **Primera publicación real con una obra elegida por el dueño; se verifican los pasos, `build.txt`, la ficha y el filtro** | |

**Total:** unos 11 días de trabajo, más las revisiones del dueño.

## 9. Fuera de alcance (Fase 2 y 3)

- **Galería:** la tabla ya acepta `rol='galeria'` y el sitio ya usa `fotos.slice(1)`. Falta subida múltiple, orden y aprobación por foto. Sin migración nueva.
- Repo de contenido separado (D2).
- Publicación por obra, con `json_aprobado` por obra, y ramas separadas de vista previa y producción.
- Tarjeta en Inicio (vencimiento del token y pendientes) y avisos por correo o WhatsApp.
- Detección automática de caras y patentes.
- Otras secciones del sitio: servicios, equipo, seguridad, empresa. Migración del dominio a lols.cl (D1).

---

## Apéndice: Descartado en revisión

- **Repo de contenido separado como requisito de Fase 1** (issue 1, punto c): **no se adopta en Fase 1; queda como D2.** Para disparar el build de lols.cl desde otro repo hace falta `repository_dispatch`, con una segunda credencial guardada en GitHub, o un sondeo periódico de Actions, que es poco fiable. Con el script fijado, el filtro de ejecutables y symlinks, y la lista blanca de rutas, el camino a ejecución de código queda cerrado; lo que resta es alterar lo visible en nuevo.lols.cl. Los puntos a, b, d y e del mismo issue sí se adoptan.
- **Excluir `.htaccess` sin más** (issue 1, punto b): **se cambia por una lista blanca con hash**, porque `public/.htaccess` es parte del sitio y excluirlo cambiaría su comportamiento.
- **Publicación asíncrona con recuperación:** no se descarta el problema. Entre las dos salidas que proponía la revisión se eligió la **síncrona**, y además se guarda `commit_sha` antes del PATCH para cubrir la muerte del proceso.
- **Opción 2 del bloqueo «todo o nada»** (409 al vaciar campos de una obra incluida): se eligió la opción 1 (reusar `publicado_json`), porque no impide editar y deja que los retiros pasen siempre.
- **Exigir portada a los contratados:** se eligió la vía (b). Una obra contratada todavía no tiene fotos reales, así que se muestra el pictograma y se excluye de tarjetas y relacionados. Exigirle foto empujaría a usar imágenes que no son de la obra.