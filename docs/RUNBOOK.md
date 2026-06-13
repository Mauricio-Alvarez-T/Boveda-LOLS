# RUNBOOK — Operaciones de Bóveda LOLS

> **Propósito:** Guía operacional para cambios de base de datos, deploys y diagnóstico de producción.
> Antes de tocar migraciones o workflows, leer este documento completo.
> Actualizar cuando cambie cualquier procedimiento de infra.

---

## 1. Arquitectura del Entorno

### Producción
| Componente | Valor |
|---|---|
| Dominio frontend | `boveda.lols.cl` |
| Directorio en servidor | `/public_html/boveda.lols.cl/` (frontend static) |
| Directorio backend | `/boveda/` (Node.js via Passenger) |
| Base de datos | MySQL · usuario `lolscl_boveda` · DB `lolscl_boveda` |
| Branch que dispara deploy | `main` |
| Workflow | `.github/workflows/deploy-cpanel.yml` |

### Staging
| Componente | Valor |
|---|---|
| Dominio frontend | `test.boveda.lols.cl` |
| Directorio en servidor | `/public_html/test.boveda.lols.cl/` (frontend static) |
| Directorio backend | `/test-boveda/` (Node.js via Passenger) |
| Base de datos | MySQL · misma instancia, DB `lolscl_boveda_test` (⚠️ confirmar el nombre real en el `.env` del servidor; ver §1 setup) |
| Branch que dispara deploy | `develop` |
| Workflow | `.github/workflows/deploy-cpanel-staging.yml` |

### Runtime
- **Node.js + Phusion Passenger** — cPanel arranca la app con `passenger_wsgi.py` / `app.js` (entry: `index.js`).
- **Reinicio de app:** escribir cualquier cosa en `tmp/restart.txt` dentro del directorio del backend. En **prod (FTP)** lo hace el workflow vía curl-FTP; en **staging (pull-side)** lo hace el propio script de deploy (`scripts/cpanel-deploy-staging.sh`) tocando `tmp/restart.txt` localmente en el servidor.
- **Logs del servidor:** `/boveda/logs/app_YYYY-MM-DD.log` (JSON por línea, rotación a 5 MB).

### Configuración Inicial de Staging (si se necesita recrear)

Si alguna vez necesitas recrear el entorno de staging desde cero:

1. **Crear subdominio** en cPanel: `test.boveda.lols.cl` → apunta a `/public_html/test.boveda.lols.cl`
2. **Crear BD**: `lolscl_boveda_test` con un usuario dedicado (ej: `lolscl_dev`) con todos los privilegios.
3. **Crear App Node.js** en cPanel → Setup Node.js App → Create Application:
   - Node.js version: `20.x.x`
   - Application mode: `Production`
   - Application root: `test-boveda`
   - Application URL: `test.boveda.lols.cl` + `api`
   - Application startup file: `server.js`
4. **Crear `.env`** en `/home/lolscl/test-boveda/.env` con las variables requeridas (ver sección 5).
5. **Run NPM Install** desde la interfaz de cPanel y luego **Restart**.
6. **Importar datos** de producción (usuarios, roles, permisos) si la BD está vacía.

> ⚠️ Las credenciales de BD y JWT_SECRET de staging no se almacenan en el repositorio. Consultar con el administrador del servidor.

---

## 2. Flujo de Deploy

### Rama → Entorno
```
develop  →  GitHub Actions  →  Staging  (test.boveda.lols.cl)
main     →  GitHub Actions  →  Producción  (boveda.lols.cl)
```

**Regla fundamental:** nunca hacer merge directo a `main` sin pasar por `develop` + staging primero.

### Métodos de deploy (cambió 2026-06-12)
| Entorno | Método | Por qué |
|---|---|---|
| **Staging** (`develop`) | **Pull-side**: Actions compila y publica la rama `deploy-staging`; el servidor hace `git pull` (cron) y se auto-despliega | El FTP de cPanel empezó a **rechazar la IP entrante** del runner (`Connection refused`, baneo cPHulk/firewall de IPs cloud). El servidor saliendo a GitHub NO está bloqueado. |
| **Producción** (`main`) | FTP `lftp` (reintentos suaves) | Sigue por FTP hasta probar pull-side en staging; luego se migra igual (rama `deploy-main` + cron). |

### Pull-side (staging) — cómo funciona
1. **GitHub Actions** (`deploy-cpanel-staging.yml`): `checkout` (historial completo) → `npm ci` + `npm run build` (frontend) → `git add -f frontend/dist` + commit → **`git push -f origin HEAD:deploy-staging`**. NO toca el host. La rama `deploy-staging` no dispara workflows (solo `develop`/`main`).
2. **Servidor cPanel** (setup una vez):
   - **Git™ Version Control** → clonar el repo, rama `deploy-staging`, en `~/deploy-staging`. **El repo es PÚBLICO → usar la URL HTTPS SIN token** (`https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git`). Guía paso a paso: `docs/PLAYBOOK_PULL_SIDE_CPANEL.md`.
   - **Cron Jobs** → `*/5 * * * * bash ~/deploy-staging/scripts/cpanel-deploy-staging.sh >> ~/deploy-staging.log 2>&1`.
   - El script (`scripts/cpanel-deploy-staging.sh`) hace `git fetch && reset --hard origin/deploy-staging`, copia `frontend/dist`→docroot y `backend/`→`/test-boveda/` (excluye node_modules/tmp/uploads/.env) y toca `tmp/restart.txt`. Idempotente.
   - Verificar: `tail ~/deploy-staging.log`.

### FTP prod — por qué lftp (y no FTP-Deploy-Action)
`FTP-Deploy-Action` hace un diff completo del directorio remoto al conectar; con `/boveda/` creciendo por logs/xlsx en runtime, el scan se excedía del timeout del control socket (~60s). `lftp mirror --only-newer` compara solo timestamps. Config (reintentos suaves; NO endurecer con loops agresivos: hammerear el FTP dispara el baneo cPHulk):
```bash
set net:timeout 30
set net:max-retries 2
set net:reconnect-interval-base 5
set mirror:parallel-transfer-count 4
```

### Secrets requeridos en GitHub
| Secret | Descripción |
|---|---|
| `CPANEL_FTP_PASSWORD` | Contraseña FTP del usuario `lolscl` en `ftp.lols.cl` |

---

## 3. Cómo Hacer un Cambio de Base de Datos

### 3.1 Crear una migración nueva

**Directorio:** `backend/db/migrations/`

**Nomenclatura:** `NNN_descripcion_corta.sql` donde `NNN` es el siguiente número en secuencia (ver el archivo más alto actual, sumar 1). Ejemplos: `026_nueva_tabla.sql`, `027_agregar_columna.sql`.

**⚠️ Regla de oro: las migraciones deben ser idempotentes.** Si fallan a mitad camino, deben poder re-ejecutarse sin romper nada.

```sql
-- ✅ Bien
CREATE TABLE IF NOT EXISTS mi_tabla (...);
ALTER TABLE mi_tabla ADD COLUMN IF NOT EXISTS campo VARCHAR(100) NULL;
INSERT IGNORE INTO catalogo (clave, nombre) VALUES ('mi.permiso', 'Mi Permiso');

-- ❌ Mal
CREATE TABLE mi_tabla (...);        -- falla si ya existe → errno 1050
ALTER TABLE mi_tabla ADD COLUMN campo VARCHAR(100);  -- falla si ya existe
DELETE FROM catalogo WHERE ...;    -- destruye datos, no idempotente
```

### 3.2 Ejecutar la migración

**Localmente:**
```bash
cd backend
npm run migrate
```

**En producción (cPanel):**
1. Asegurarse de que el código ya llegó al servidor (deploy completado).
2. cPanel → Setup Node.js App → tu app → **Run JS script** → seleccionar `migrate` → Run.

**Lo que hace `npm run migrate` (`scripts/migrate.js`):**
1. Crea la tabla `schema_migrations` si no existe.
2. Detecta si es primera vez en una BD existente → **bootstrap** (ver sección 3.3).
3. Aplica solo las migraciones que no están en `schema_migrations`.
4. Ejecuta tareas de mantenimiento idempotentes.

### 3.3 ⚠️ El Problema del Bootstrap

**Qué es:** Al correr `migrate` por primera vez en una BD que ya tiene datos (tablas `usuarios`, etc.), el runner no ejecuta las migraciones históricas — solo las marca como aplicadas en `schema_migrations`. Esto evita recrear tablas que ya existen.

**Constante relevante en `scripts/migrate.js`:**
```js
const BOOTSTRAP_CUTOFF = '023'; // migraciones ≤ esta se marcan sin ejecutar
```

**El problema concreto (ocurrió en producción, Abril 2026):**
- Producción tenía la BD original sin módulo de inventario.
- Al correr `migrate`, las migraciones `017`–`023` (tablas de inventario) fueron marcadas como aplicadas **sin ejecutarse**.
- Las migraciones `024`–`025` sí corrieron, pero dependían de tablas que no existían → **errno 150 (FK constraint)**.

**Síntoma:**
```
Error: Cannot add foreign key constraint (errno 150)
```

**Solución cuando pasa esto:**

Usar el script `scripts/fix_prod_migrations.js` que ejecuta forzadamente las migraciones que el bootstrap saltó:
```bash
# En cPanel → Run JS script → migrate:fix-prod
npm run migrate:fix-prod
```

Este script:
- Lista explícitamente las migraciones a recuperar.
- Tolera `errno 1050` (tabla ya existe) y `errno 1061` (índice duplicado).
- Actualiza `schema_migrations` con el tiempo real de ejecución.

**Si en el futuro el bootstrap vuelve a saltar migraciones nuevas:**
1. Actualizar `BOOTSTRAP_CUTOFF` en `scripts/migrate.js` al número de la última migración que debe bootstrapearse.
2. Crear un nuevo script similar a `fix_prod_migrations.js` listando solo las migraciones afectadas.
3. Agregar alias en `package.json` para exponerlo en cPanel.

### 3.4 Dependencias entre migraciones (FKs)

Si tu migración crea una FK a otra tabla, esa tabla **debe existir antes** de correr tu migración. Asegúrate de que la migración que crea la tabla referenciada tenga número menor.

```sql
-- 026_pedidos.sql
-- REQUIERE que la tabla clientes exista (creada en 015_clientes.sql)
CREATE TABLE IF NOT EXISTS pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB;
```

---

## 4. Exponer un Script en cPanel

cPanel solo muestra en su dropdown "Run JS script" los scripts definidos en el `package.json`. Para exponer cualquier script node:

```json
// backend/package.json → "scripts"
"mi-script": "node scripts/mi_script.js"
```

Después del próximo deploy, aparece en el dropdown de cPanel.

---

## 4.1 Tareas Programadas (Cron Jobs)

Para scripts que deben correr **automáticamente en un horario** (no a mano), se usa
**cPanel → Cron Jobs**, NO un scheduler dentro de Node.

⚠️ **No usar `node-cron` / `setInterval` dentro del backend.** Passenger
duerme/reinicia el proceso Node cuando no hay tráfico, así que un cron in-process
no dispara confiable. El cron de cPanel corre a nivel sistema operativo,
independiente del estado de la app.

### Patrón general

1. Exponer el script en `package.json` (ver § 4) y asegurarse que corre standalone
   (`node scripts/foo.js`), abriendo y cerrando su propia conexión a DB.
2. **cPanel → Cron Jobs → Add New Cron Job**:
   - Definir el horario con los 5 campos (min hora día mes díaSemana).
   - En "Command": `cd ~/<APP_DIR> && <RUTA_NODE> scripts/foo.js >> ~/foo.log 2>&1`
3. La **ruta del binario node** se obtiene en **cPanel → Setup Node.js App** (cada
   app tiene su virtualenv, ej. `/home/lolscl/nodevenv/test-boveda/20/bin/node`).
4. Configurar **una entrada por entorno** (staging usa `~/test-boveda`, producción
   `~/boveda`) — los cron jobs NO se deployan con el código, viven en cPanel.
5. Verificar al día siguiente revisando el `>> ~/foo.log` y/o la tabla que escribe.

### Caso concreto: snapshot diario del dashboard (00:05)

El Resumen Ejecutivo muestra sparklines (tendencia 7 días) y comparativa "% vs mes
anterior". Esos datos salen de la tabla `dashboard_kpi_snapshots`, que se llena con
**un snapshot diario** de los 5 KPIs. El script es idempotente
(`INSERT ... ON DUPLICATE KEY UPDATE`).

- **Script:** `backend/scripts/snapshot_dashboard.js` · alias `npm run snapshot-dashboard`
- **Horario:** `5 0 * * *` (todos los días a las 00:05)
- **Command staging:**
  ```
  cd ~/test-boveda && /home/lolscl/nodevenv/test-boveda/20/bin/node scripts/snapshot_dashboard.js >> ~/snapshot.log 2>&1
  ```
- **Command producción:** igual pero con `~/boveda` y su ruta de node correspondiente.

Sin este cron, los sparklines y la comparativa quedan vacíos/planos (no es un bug:
es que no hay histórico que graficar). Se puede sembrar un punto corriendo el script
a mano desde cPanel → Run JS script → `snapshot-dashboard`.

### Caso concreto: Reporte Semanal RRHH (lunes 08:00)

Correo HTML con KPIs de la semana anterior (contrataciones, desvinculaciones,
faltas injustificadas código `A`, aniversarios de 10 meses) + tendencias mensuales.
Gráficos en HTML puro (compatibles con Gmail/Outlook/móvil), logo LOLS embebido por CID.

- **Script:** `backend/scripts/reporte_semanal.js` · alias `npm run reporte-semanal`
- **Horario:** `0 8 * * 1` (lunes 08:00)
- **Command staging:**
  ```
  cd ~/test-boveda && /home/lolscl/nodevenv/test-boveda/20/bin/node scripts/reporte_semanal.js >> ~/reporte-test.log 2>&1
  ```
- **Command producción:** igual con `~/boveda` y su ruta de node.
- **Flags útiles (para probar a mano vía Terminal):**
  - `--dry` → arma el HTML y lo escribe en `tmp/reporte_preview.html`, **no envía**.
  - `--to a@b.cl,c@d.cl` → fuerza destinatarios (prioridad máxima), ignora `REPORTE_TO`.
  - `--fecha YYYY-MM-DD` → usa esa fecha como "hoy" (la ventana = su semana previa).
- **Destinatarios** (orden de prioridad): flag `--to` → tabla `reportes_suscriptores`
  (activos; aún no existe → Slice B pendiente) → env `REPORTE_TO` (lista CSV). Fallback
  graceful si la tabla no existe (`errno 1146`).
- **Variables `.env` requeridas:** `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`,
  `MAIL_PASS`, `REPORTE_TO`. La contraseña SMTP va **solo** en el `.env` del servidor,
  nunca en el repo ni en el chat.
- **Probar el cron sin esperar al lunes:** crear un cron temporal "+2 min" con el mismo
  command, verificar `~/reporte-test.log` (debe mostrar `✅ Enviado ... messageId=...`),
  y luego **borrar** el temporal dejando solo el definitivo.

> ⚠️ **Este script depende de la migración `066_es_prueba_isolation.sql`** (columna
> `es_prueba`). El servicio filtra obras/trabajadores de prueba. Si se despliega el
> código a un entorno donde la migración no corrió, falla con
> `Unknown column 't.es_prueba'`. Ver § 6 — "deploy de código acoplado a migración".

### Caso concreto: Alertas de Vehículos (todos los días 08:00)

Avisa por **email** (y deja el texto de WhatsApp en el log) cuando a un seguro,
revisión técnica o mantención le faltan **exactamente** los días configurados
(`dias_alerta`, típicamente 30) para su fecha. El correo es HTML responsive con el
header verde de Bóveda y el número de días en grande.

- **Script:** `backend/scripts/alertas_vehiculos.js` · alias `npm run alertas-vehiculos`
- **Horario:** `0 8 * * *` (todos los días a las 08:00)
- **Command staging:**
  ```
  cd ~/test-boveda && /home/lolscl/nodevenv/test-boveda/20/bin/node scripts/alertas_vehiculos.js >> ~/alertas-vehiculos.log 2>&1
  ```
- **Command producción:** igual con `~/boveda` y su ruta de node correspondiente.
- **Modo normal (sin flags) = el que va en el cron.** Solo envía cuando
  `DATEDIFF(fecha, CURDATE()) = dias_alerta` → **un solo aviso por evento**, no
  molesta a diario. Por eso es seguro correrlo cada mañana.
- **Flags útiles (para probar a mano):**
  - `--forzar` (alias `alertas-vehiculos-forzar`) → envía TODO lo que tenga
    `email_alerta`, ignorando la fecha. Para demos/pruebas.
  - `--test` (alias `alertas-vehiculos-test`) → no envía, solo imprime qué enviaría.
  - `--dias N` → cambia la ventana (default 30).
- **Qué fecha cuenta:** seguros usan `fecha_vencimiento`; revisiones y mantenciones
  usan `fecha` (la "Fecha por realizar" / cita), NO `fecha_vencimiento`.
- **Solo email:** el módulo NO usa WhatsApp (se quitó por no contar con un número para
  envío automático). La columna `tel_alerta` queda en la DB pero sin uso. Si en el
  futuro se integra WhatsApp Business API, se puede reactivar.
- **Variables `.env` requeridas:** `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS` (puerto 465 SSL
  por defecto). Sin ellas el envío lanza error.
- **Depende de las migraciones 069–073** (módulo vehículos + alertas + periodicidad).
- **Probar el cron sin esperar:** crear un cron temporal "+2 min" con el mismo command
  pero agregando `--forzar`, verificar `~/alertas-vehiculos.log` (debe mostrar
  `✅ Email enviado`), y luego **borrarlo** dejando solo el definitivo sin `--forzar`.

---

## 5. Variables de Entorno

### Servidor (archivo `.env` en `/boveda/` y `/test-boveda/`)
El deploy excluye `.env*` para no sobreescribir. Estos archivos deben existir manualmente en el servidor.

Variables requeridas por `src/middleware/env-validator.js`:
```
DB_HOST
DB_USER
DB_PASSWORD
DB_NAME
DB_PORT          (default: 3306)
JWT_SECRET
NODE_ENV         (production / staging)
PORT             (default: 3001)
```

Variables opcionales:
```
MAIL_HOST / MAIL_USER / MAIL_PASS  — para nodemailer
```

### Tests (CI)
`backend/tests/setupEnv.js` carga `.env.test` y tiene fallbacks:
```js
if (!process.env.JWT_SECRET)  process.env.JWT_SECRET  = 'test-secret-key';
if (!process.env.DB_HOST)     process.env.DB_HOST     = 'localhost';
if (!process.env.DB_USER)     process.env.DB_USER     = 'test';
if (!process.env.DB_NAME)     process.env.DB_NAME     = 'test_db';
if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = '';
```
Estos fallbacks evitan que `env-validator.js` lance excepción al importar el app en tests.

---

## 6. Tabla de Errores Comunes

| Error | Causa | Solución |
|---|---|---|
| `errno 150 — Cannot add foreign key constraint` | Tabla referenciada no existe. Bootstrap saltó su migración. | Correr `npm run migrate:fix-prod` o equivalente. |
| `errno 1050 — Table already exists` | Migración no idempotente / se re-ejecutó. | Usar `CREATE TABLE IF NOT EXISTS`. Si es error del fix script: tolerado automáticamente. |
| `errno 1061 — Duplicate key name` | Índice ya creado previamente. | Usar `CREATE INDEX IF NOT EXISTS` o tolerar en fix script. |
| `Timeout (control socket)` en deploy | FTP-Deploy-Action escaneó directorio grande (logs/tmp/uploads). | Solución ya aplicada: usar `lftp mirror --only-newer` con excludes. Si reaparece: verificar que `tmp/` y `uploads/` sigan en la lista de exclusión del workflow. |
| Tests fallan con `row.fecha.toISOString is not a function` | Mock de DB no incluye `obra_id` o `fecha`, lookup key del batch pre-fetch no matchea. | Agregar `obra_id` y `fecha` al objeto del mock para que la key `"workerId_obraId_fecha"` funcione. |
| `Backend Tests CI` rojo en commits que **no tocan backend**, después de agregar un caso a un feature existente | `toThrow(/...literal.../)` en algún test quedó acoplado al mensaje exacto. Cuando se suma un 2.º caso al feature (ej: nuevo `tipo_flujo` válido), el mensaje pluraliza ("flujo" → "flujos") y el regex literal ya no matchea. El CI corre `npm test` completo en **cada** push a `develop`/`main` sin importar qué se tocó → frontends quedan en rojo por culpa ajena. | Hacer regex tolerante a las variaciones razonables del mensaje: `flujos?` (opcional `s`), `[^.]*` para frases descriptivas, anclar solo en el sustantivo único. Ejemplo real (`3f90a39`): `/solo permitidos en flujo de solicitud/` → `/solo permitidos en flujos? de solicitud/`. Regla: al escribir `toThrow(...)`, asumir que el mensaje **va a cambiar** y matchear solo lo distintivo. |
| `npm run migrate` reporta **"No hay migraciones pendientes"** pero la API tira `Unknown column 'X' in 'SET'` justo en la columna que la última migración debía agregar | El runner confía en `schema_migrations`. Si esa tabla quedó con la migración nueva pre-registrada (snapshot de DB, import desde otra env, fix-prod corrido en exceso, o ejecución parcial anterior), el SQL nunca se ejecuta pero el archivo se considera "aplicado". Es una variante moderna del bootstrap-skip ya documentado en § 3.3 — la diferencia es que aquí afecta una migración nueva, no las históricas. | Crear un fix script idempotente para esa migración (patrón: `scripts/fix_<scope>.js`), que (a) ejecute el SQL tolerando `errno 1060 — Duplicate column name` o `errno 1050 — Table exists`, (b) verifique vía `information_schema` que el cambio quedó aplicado, (c) actualice `schema_migrations` con el `duration_ms` real. Exponerlo en `package.json` como `migrate:fix-<scope>`. Ejemplo real: `migrate:fix-bodega-responsable` (mig 060). |
| App da 500 al arrancar | Passenger crasheó al iniciar `index.js`. | Revisar `/boveda/logs/app_YYYY-MM-DD.log` o `/boveda/startup_debug.log`. |
| `env-validator: variable faltante` al arrancar | Falta alguna variable en el `.env` del servidor. | SSH/FTP al servidor, editar `/boveda/.env`, añadir la variable faltante, reiniciar. |
| JWT inválido / login loop | Token de versión de rol desactualizado. | El usuario debe cerrar sesión, borrar `localStorage` (`sgdl_token`, `sgdl_user`), y volver a entrar. |
| Deploy FTP falla con `mirror: Fatal error: max-retries exceeded (Connection refused)` | El FTP de cPanel rechaza la **IP entrante** del runner de GitHub (baneo cPHulk anti-fuerza-bruta / firewall de IPs cloud). NO se arregla con reintentos — hammerear lo **empeora**. El código está bien (Backend Tests CI pasó). | **Staging ya migró a pull-side** (servidor hace `git pull`, inmune al baneo) — ver "Pull-side (staging)" arriba. **Prod** (aún FTP): si falla, re-ejecutar 1 vez (UI → "Re-run failed jobs"); si persiste, dejar pasar el baneo (cPHulk suele expirar en 15min–24h) o desbanear en cPanel → Security → cPHulk/IP Blocker. Para arreglar de raíz: migrar prod a pull-side. Stopgap inmediato: subir por **cPanel File Manager** (HTTPS, no afectado por el baneo FTP). |
| Imágenes 404 en producción (pero OK en local) | URLs de imagen sin prefijo `/api/`. cPanel proxy solo routea `/api/*` al Node.js. | Asegurarse de servir imagen URL como `/api/uploads/inventario/...`, no `/uploads/...` |
| Sticky header no se pega al scroll | Contenedor intermedio con `overflow-x-hidden` crea un scroll context incorrecto. | El scroll container **real** debe tener `flex-1 min-h-0 overflow-y-auto`. Sticky es relativo a su contenedor scroll más cercano. |
| `main` aparece **adelante** de `develop` tras un release (`git rev-list develop..main` > 0), o un merge develop→main parece "perder" un fix de producción | Hotfix aplicado **directo a `main`** (urgencia de prod, ej: `fix_prod_migrations.js` — commits `e77b263` / `aaed9a5`). El fix vive solo en `main`; `develop` nunca lo vio. Al mergear develop→main para el próximo release, el árbol de develop no contiene ese cambio, pero el merge **conserva** la versión de main (no la pierde). Lo que queda mal es `develop`, que sigue sin el hotfix. | **Re-sincronizar main→develop después de todo hotfix directo.** Verificar el alcance real (ignorando merges): `git rev-list --no-merges main ^develop` lista los commits que solo están en main. Antes de mergear, dry-run de conflictos: `git merge-tree --write-tree origin/develop origin/main` (exit 0 y sin la palabra `conflict` = limpio). Luego `git checkout develop && git merge origin/main`, push. Confirmación final: `git diff origin/main..develop` **vacío** = ambas ramas alineadas. Regla CLAUDE.md: nunca mergear a main sin pasar por develop+staging; el hotfix directo es la excepción de emergencia que **obliga** a este paso de re-sync. |
| `Unknown column 'X' in 'WHERE'` (u otro `Unknown column`) en runtime, justo después de un deploy — pero **local funciona** y el SQL "se ve bien" | **Deploy de código acoplado a una migración que no corrió en ese entorno.** Un commit agrega una columna (vía migración `NNN_*.sql`) y a la vez modifica servicios para filtrar/leer esa columna. El deploy sincroniza el **código** (lftp), pero **NO ejecuta migraciones** — son pasos separados. El entorno destino (staging o prod) queda con código nuevo contra esquema viejo. Caso real: `066_es_prueba_isolation.sql` añade `es_prueba`; varios servicios ya filtran por ella → `Unknown column 't.es_prueba'` hasta correr `migrate`. | **Orden obligatorio al desplegar código que trae migración: (1) deploy → (2) `migrate` → (3) verificar.** Correr `migrate` en el entorno afectado: cPanel → Setup Node.js App → Run JS script → `migrate`. La salida debe listar la migración pendiente y aplicarla. Si dice "no hay migraciones pendientes" pero la columna sigue sin existir → es el bootstrap-skip (§ 3.3 / fila de abajo): usar un fix-script idempotente. Regla: **toda migración debe correrse en CADA entorno por separado** (no se propaga sola con el merge ni con el deploy). |
| Aparece un **`0` suelto** en la UI (junto a un nombre, RUT, badge, contador…) que no corresponde a ningún dato | Render condicional JSX `{valor && <Componente/>}` donde `valor` es el **número `0`**. React renderiza `false`/`null`/`undefined` como nada, pero imprime `0` (y `NaN`) como texto literal. Pasa típico con flags `BOOLEAN`/`TINYINT` de MySQL, que llegan como `0`/`1` (número), aunque el tipo TS diga `boolean`. Caso real: badge `{worker.es_prueba && <Badge/>}` con `es_prueba = 0` pintaba un `0` al lado del RUT en cada fila de Consultas y en la tabla de Obras. | Coercer a booleano real antes del `&&`: `{!!valor && <X/>}` o ternario `{valor ? <X/> : null}`. Regla general: **nunca uses un número crudo a la izquierda de `&&` en JSX.** Aplica a cualquier conteo (`{lista.length && ...}` → `{lista.length > 0 && ...}`) o flag numérico. |
| Un `<CrudTable>` lista bien pero **Eliminar/Editar dan `404`** (DevTools: `DELETE /api/.../<base>/<id>` apunta a una ruta inexistente, ej. `/usuarios/roles/list/3`) | `CrudTable` (`components/ui/CrudTable.tsx`) usa **un único prop `endpoint`** para todo: GET lista (`${endpoint}?...`) **y** mutaciones (`${endpoint}/${id}` en delete, `${endpoint}/export`). Si a `endpoint` le pasas un path que **no es el recurso REST base** —p.ej. un alias de solo-lista como `/usuarios/roles/list`— el GET funciona pero el DELETE arma `/usuarios/roles/list/3`, que no existe → 404. Caso real: tab Roles en Settings. | El `endpoint` del `CrudTable` debe ser **siempre el recurso REST base** (`/usuarios/roles`), no un alias de listado. El backend ya expone ahí `GET` (lista paginada), `POST`, `PUT/:id` y `DELETE/:id` vía `createCrudRoutes`. Los alias tipo `/roles/list` son solo para dropdowns. **Bonus soft-delete:** si el borrado es soft (`activo=0`), el `crudService` necesita `useSoftDelete: true` para que el listado filtre activos por defecto; sin eso el registro "borrado" sigue apareciendo y parece que no se eliminó. |

---

## 7. Patrón de Layout Dinámico (Flex Chain)

Para que las páginas llenen el viewport y permitan sticky headers/footers sin alturas hardcodeadas:

```tsx
// MainLayout.tsx
<main className="h-screen flex flex-col">
  <header className="shrink-0">...</header>
  <motion.div className="flex-1 min-h-0 overflow-y-auto">
    {/* Pages go here */}
  </motion.div>
</main>

// Inventario.tsx (or any page)
<div className="flex flex-col flex-1 min-h-0 gap-4">
  <div className="sticky top-0 z-30 shrink-0">
    {/* Tab bar or toolbar */}
  </div>
  <motion.div className="flex-1 min-h-0 flex flex-col">
    {/* Content — fill remaining space */}
  </motion.div>
</div>

// Tables inside content
<div className="overflow-auto flex-1 min-h-0">
  <table>
    <thead className="sticky top-0 z-20">...</thead>
    <tbody>...</tbody>
    <tfoot className="sticky bottom-0 z-10">...</tfoot>
  </table>
</div>
```

**Clave:** Cada contenedor en la cadena tiene `flex flex-col` + `flex-1 min-h-0` (excepto shrink-0). Esto propaga altura dinámica desde viewport → página → tabla. Sin esto, sticky no funciona correctamente.

---

## 7.1 Estándar de Mensajes de Error (FieldError / FormError)

Para que el rojo de validación se vea **igual en toda la app**, hay dos componentes
estándar en `frontend/src/components/ui/`:

- **`<FieldError message={...} />`** — error de **campo inline** (texto rojo bajo el input).
  Estilo canónico: `text-xs text-destructive font-medium ml-0.5`. No renderiza nada si el
  mensaje es vacío. Acepta `icon` (variante carrito/fila) y `className` (ej. `pl-8`, `mt-1`).
  Lo consumen internamente `Input`, `Select`, `CurrencyInput`, `SearchableSelect` y
  `TimeStepperInput` → **cualquier form que use el prop `error` de esos componentes ya hereda
  el estándar** sin tocarlo.
- **`<FormError message={...} />`** — **banner** de error de acción/formulario persistente en
  página (no transitorio). Usa el token semántico `destructive`. Para errores de API
  transitorios usar `showApiError(err, fallback)` (toast), NO un banner.

**Regla de oro contra tooltips nativos del navegador:** los atributos HTML `min`/`max`/
`required`/`pattern` en `<input>`/`<select>` dentro de un `<form onSubmit>` disparan el globo
nativo (ej. *"El valor debe ser superior o igual a 0"*), que **no** queremos. Para evitarlo:

1. Agregar `noValidate` al `<form>` (desactiva TODA la validación nativa del navegador), y
2. Mover la regla a la validación de la app (reglas de `register()` en react-hook-form, o un
   handler en forms controlados) mostrando el mensaje con `<FieldError>`.
3. Se conservan `step="0.5"`/`step="any"` (UX de decimales/medias horas) y `maxLength` (topes benignos).

**Color:** usar siempre el token `destructive` (`text-destructive`, `border-destructive`,
`var(--destructive)` en estilos inline de react-select) — nunca hex sueltos (`#FF3B30`) ni
utilidades `red-*`, para respetar el tema claro/oscuro.

> Origen: auditoría de manejo de errores del frontend (46 hallazgos). Pendientes de menor
> prioridad (backlog): edición inline con `min`/`max` sin `<form>` (StockUbicacionTable,
> ResumenMensualTable, TransferenciaDetail, MovimientoForm) — no disparan tooltip, es solo
> limpieza de consistencia; y unificar todos los `catch` al helper `showApiError`.

---

## 8. Worktrees de Claude Code

Las sesiones usan worktrees en `.claude/worktrees/NOMBRE/`. Cada uno tiene una rama local que trackea `origin/develop`:

```bash
# Ver estado
git worktree list

# Dentro del worktree, push correcto:
git push origin claude/BRANCH:develop

# Para limpiar después (desde repo principal):
git worktree remove .claude/worktrees/NOMBRE
```

---

## 9. Proxy `/api` en cPanel

cPanel router solo routea rutas con prefijo `/api/` al Node.js. Todo lo demás va a carpetas static en `public_html/`.

**Implicación para uploads/archivos:**
- Ruta de upload: `/boveda/uploads/inventario/file.jpg`
- URL servida: `/api/uploads/inventario/file.jpg` (con prefijo `/api`)
- En el código: `imagen_url: '/api/uploads/inventario/...'`

Si se olvida el prefijo, la imagen retorna 404 en producción (aunque funciona en local con Node.js directo).

---

## 10. Checklist Pre-Deploy (Actualizado)

---

## 10.1. Deploy Especial — Ola 2 Fase 1 (Stock diferido al recibir)

**Cuándo aplica:** primer deploy que incluye la migración `036_stock_reconciliado_flag.sql` (cambio semántico: stock ahora se mueve al `recibir()`, no al `aprobar()`).

**Problema:** antes de este deploy, las transferencias en estado `aprobada` o `en_transito` ya descontaron stock del origen. El código nuevo asume lo contrario (régimen nuevo) y al recibirlas descontaría por segunda vez.

**Solución:** script idempotente `scripts/fix_stock_transferencias_aprobadas.js`. Corre UNA VEZ post-migrate en staging y producción.

### Orden de ejecución (staging y prod, por separado)

1. Esperar deploy completo (código nuevo en servidor + Passenger reiniciado).
2. cPanel → Setup Node.js App → Run JS script → `migrate` → Run. Aplica la migración 036; marca las transferencias `aprobada|en_transito` existentes con `stock_reconciliado=FALSE` (régimen viejo).
3. cPanel → Run JS script → `fix-stock-reconciliar` → Run. El script:
   - Busca transferencias con `stock_reconciliado=FALSE` y estado `aprobada|en_transito`.
   - Re-incrementa el stock del origen usando los splits de `transferencia_item_origenes` (fallback a `transferencia_items` si no hay splits).
   - Marca `stock_reconciliado=TRUE` al terminar.
4. A partir de ahora, al recibir esas transferencias el código nuevo descuenta origen correctamente → stock neto = correcto.

**Idempotencia:** correr el script dos veces es seguro. La segunda vez no encuentra filas (`stock_reconciliado` ya es TRUE en todas).

**Si se olvida correr el script antes del primer `recibir` post-deploy:** el stock origen quedará 0/clamped en esas filas. Revisar con `SELECT * FROM transferencias WHERE stock_reconciliado=FALSE` y ajustar manualmente.

---

## 11. Comandos de Emergencia

### Reiniciar la app manualmente
```bash
# Vía FTP (desde terminal local, reemplazar PASSWORD)
curl --ftp-create-dirs \
  -T /dev/null \
  -u "lolscl:PASSWORD" \
  "ftp://ftp.lols.cl/boveda/tmp/restart.txt"
```

### Ver logs en tiempo real (SSH si está disponible)
```bash
tail -f /boveda/logs/app_$(date +%Y-%m-%d).log
```

### Ver estado de migraciones aplicadas
Conectar a la DB y ejecutar:
```sql
SELECT name, applied_at, duration_ms FROM schema_migrations ORDER BY name;
```

### Rollback de un deploy fallido
Si el último commit rompe producción y no se puede arreglar rápido:
1. En GitHub → Actions → Deploy más reciente → re-run workflow del commit anterior. **O:**
2. Localmente: `git revert HEAD` → push a `main` → el workflow hace un nuevo deploy con el revert.

> **No hacer `git reset --hard` en `main`** — pierde historial y puede dejar el servidor en estado inconsistente si el deploy ya subió.

---

## 12. Checklist Pre-Deploy

Antes de hacer merge a `main`:

- [ ] La migración (si hay) es idempotente (`IF NOT EXISTS`, `INSERT IGNORE`)
- [ ] La migración tiene número correcto (N+1 del último archivo en `db/migrations/`)
- [ ] Si la migración tiene FKs, las tablas referenciadas ya existen en producción
- [ ] El branch `develop` fue mergeado y staging funciona
- [ ] Los tests pasan localmente: `cd backend && npm test`
- [ ] Si hay un script nuevo de infra: se agregó alias en `package.json`

---

## 12.1. Modelo de Borrado del Módulo Inventario (soft vs. hard delete)

Esta tabla resume **cómo se elimina cada entidad del módulo Inventario** y por qué. Documentado tras Auditoría Sprint 3 (Item 3.8) para evitar confusión entre devs nuevos.

| Tabla | Modo | Justificación |
|---|---|---|
| `items_inventario` | **Soft-delete** (`activo = 0`) | Un ítem que se desactiva puede tener historial de transferencias y discrepancias. Borrarlo duro rompe FKs y elimina trazabilidad. Las queries de listado filtran `WHERE activo = 1`. |
| `bodegas` | **Soft-delete** (`activa = 0`) | Igual que items: hay stock histórico y transferencias que las referencian como origen/destino. |
| `obras` | **Soft-delete** (`activa = 0`) | Las obras concentran descuentos, transferencias y stock activo. Borrado duro rompería pagos, despachos y reportes históricos. |
| `descuentos_obra` | **Hard-delete** (CASCADE FK) | El descuento es una propiedad relacional 1:1 con la obra. No tiene valor sin la obra → CASCADE en `obras` lo elimina. |
| `ubicaciones_stock` | **Hard-delete** (CASCADE FK) | El stock es un estado **vivo**, no histórico. Si una obra se borra (cosa que NO debería pasar — usamos soft-delete), el stock asociado tampoco tiene sentido. La trazabilidad de movimientos vive en `transferencias` y `transferencia_items`, no en este snapshot. |
| `transferencias` | **Soft-delete** (`activo = 1`) + estados `cancelada`/`rechazada` | Audit trail crítico (quién aprobó, quién recibió, qué se movió). Nunca se borran físicamente. |
| `transferencia_discrepancias` | **Hard-delete** (CASCADE FK) | Vinculadas estrictamente a la transferencia. Si la transferencia se desactivara, la discrepancia es inútil sin contexto. |

**Regla operativa:**
- Lo que tiene **valor histórico independiente** (ítems, bodegas, obras, transferencias) → soft-delete con flag `activo`/`activa`.
- Lo que es **estado momentáneo dependiente** (stock, descuentos, discrepancias) → hard-delete con CASCADE FK al padre.

**Implicancia para queries:**
- Toda lectura de listados de items, bodegas u obras debe filtrar `activo = 1` (o `activa = 1`).
- `ubicaciones_stock` y `descuentos_obra` no tienen esa columna porque siempre están vivos por construcción.

---

## 12.2. Sábados Extra (Trabajo Extraordinario)

**Qué es:** registro de citaciones de personal para trabajos en sábado fuera de la jornada regular. Aislado del flujo de asistencia diaria — no toca la tabla `asistencias` ni los reportes lun-vie estándar (excepto la columna agregada de horas, ver más abajo).

**Tablas (migración 038 + 040):**
- `sabados_extra`: cabecera. 1 fila por `(obra_id, fecha)`. Estados `citada` / `realizada` / `cancelada`. Audit con `creado_por` y `actualizado_por`.
- `sabados_extra_trabajadores`: detalle. N filas por sábado. Columna `estado` ∈ {`citado`, `asistio`, `no_asistio`, `cancelado`} agregada en migración 040 para soft delete que preserva auditoría.

**Permisos** (`permisos.config.js`, módulo Asistencia, órdenes 12-17):
- `asistencia.sabados_extra.ver`, `crear`, `editar`, `cancelar`, `registrar`, `enviar_whatsapp` (granular). La migración 040 hace backfill: roles que tenían `crear` reciben `editar` y `cancelar` automáticamente.

**Restricciones operativas:**
- 1 citación por `(obra, fecha)` (UNIQUE constraint + `SELECT FOR UPDATE` en backend).
- Solo sábados (`Date.getDay() === 6`).
- No fechas pasadas. No fechas más de 1 año adelante.
- Si la fecha cae en feriado activo → backend responde 409 con mensaje de feriado. La UI debe pedir confirmación y reintentar con `acepta_feriado: true`.
- Trabajadores deben estar activos y no finiquitados (`fecha_desvinculacion IS NULL`).
- Obra debe estar activa.
- Mínimo 1 trabajador, máximo 500 por citación.

**Cancelación (soft delete):**
- `UPDATE sabados_extra SET estado = 'cancelada'` + `UPDATE sabados_extra_trabajadores SET estado = 'cancelado'` (no DELETE). La auditoría completa (quién creó, quién canceló, lista original de citados) queda preservada para reportes históricos.

**Concurrencia:**
- Las 4 transiciones de estado (`crearCitacion`, `editarCitacion`, `registrarAsistencia`, `cancelar`) usan `SELECT ... FOR UPDATE` dentro de transacción para prevenir condiciones de carrera (dos super-admins creando/cancelando simultáneamente).

**Reporte mensual Excel (asistencia.service.js → `generarExcel`):**
- Columna nueva **"SÁB EXTRA (h)"** entre `HORAS EXT` y `OBSERVACIONES`. Suma `SUM(horas_trabajadas)` de los trabajadores con `estado='asistio'` en citaciones `!= 'cancelada'` dentro del rango. NO se agrega a `HORAS ORD` ni `HORAS EXT` — RRHH la procesa aparte como concepto distinto.
- Si `obra_id` aplica al export, también filtra sábados extra por esa obra.

**Migraciones relevantes:**
- `038_trabajo_extraordinario_sabado.sql` — tablas iniciales.
- `040_sabados_extra_audit_y_estado.sql` — columna `estado` en detalle, `actualizado_por`, backfill desde `asistio`, permisos granulares.

**Errores comunes:**
- _"errno 150"_ al aplicar 040: revisa que las FKs sean `INT` signed (no UNSIGNED) — `usuarios.id` usa INT signed.
- _"hooks order violation #310"_: nunca poner `useEffect`/`useMemo` después de `if (loading) return …` en componentes de sábados extra. Movido y verificado en commit `bf14d72`.
- _409 sin razón obvia_: revisa si el sábado coincide con feriado o si ya hay citación activa para esa `(obra,fecha)`.

---

## 13. Dónde Está Qué

```
Boveda-LOLS/
├── .github/workflows/
│   ├── deploy-cpanel.yml          ← Deploy a producción (push a main)
│   └── deploy-cpanel-staging.yml  ← Deploy a staging (push a develop)
│
├── backend/
│   ├── db/migrations/             ← Archivos SQL numerados (001...NNN)
│   ├── scripts/
│   │   ├── migrate.js             ← Runner principal (npm run migrate)
│   │   ├── fix_prod_migrations.js ← Fix bootstrap incorrecto (npm run migrate:fix-prod)
│   │   └── maintenance.js         ← Tareas de mantenimiento legacy
│   ├── src/middleware/
│   │   └── env-validator.js       ← Valida vars de entorno al arrancar
│   ├── tests/
│   │   └── setupEnv.js            ← Setup de vars de entorno para Jest
│   └── package.json               ← Scripts npm (migrate, migrate:fix-prod, etc.)
│
├── docs/
│   ├── RUNBOOK.md                 ← Este documento (operaciones)
│   ├── TROUBLESHOOTING.md         ← Diagnóstico y resolución de errores
│   ├── DEUDA_TECNICA.md           ← Estado de deuda técnica y seguridad
│   ├── TESTING_OLA2_OLA3.md       ← Guía de testing del módulo inventario
│   ├── SESION_HANDOFF.md          ← Handoff entre sesiones
│   └── project-brief.md           ← Descripción del proyecto
│
├── CLAUDE.md                      ← Instrucciones para IAs
└── README.md                      ← Presentación del proyecto
```

---

## 14. Historial de Actividad (logs_actividad)

> Subsistema de auditoría automática. Refactorizado en abril 2026 (Sprints 1-4 — ver `ROADMAP_HISTORIAL_AUDITORIA.md`).

### 14.1 Qué es

Cada operación que **modifica datos** (POST, PUT, DELETE) y cada login generan una fila en `logs_actividad`. El panel `Configuración → Sistema & Correo → Historial` permite filtrarlos, ver el resumen inline y exportar CSV.

Permiso requerido para ver/exportar: `sistema.logs.ver`.

### 14.2 Cómo funciona el middleware

**Archivo:** `backend/src/middleware/logger.js`

Montado globalmente en `index.js` antes de las rutas. Para cada request:

1. Extrae `accion` del método HTTP (POST→CREATE, PUT→UPDATE, DELETE→DELETE).
2. Si es UPDATE: lee la fila ANTES en su tabla maestra (sólo módulos de la whitelist `validModulos`) para poder calcular el diff.
3. En `res.on('finish')` con status 2xx:
   - Calcula `detalle` JSON: para UPDATE compara antes vs nuevo y arma `{cambios, resumen}`. Para CREATE arma `{datos, resumen}`. Para DELETE arma `{resumen}`.
   - Llama `resolveEntidad(modulo, item_id, body)` → arma `{tipo, label}` legible.
   - INSERT a `logs_actividad` con todas las columnas.

**Idempotencia:** flag `res._activityLogged` previene doble logueo cuando hay streams o multer.

**Rutas excluidas:** `/health`, `/logs`, `/auth`, `/asistencias/bulk`, y cualquier URL que matchee `/(kpi|exportar|enviar|download)/i` (suelen ser POSTs de solo-lectura).

### 14.3 Tabla `logs_actividad`

```sql
id            INT AUTO_INCREMENT PRIMARY KEY
usuario_id    INT NULL                       -- FK a usuarios.id ON DELETE SET NULL
modulo        VARCHAR(50) NOT NULL           -- slug del módulo (trabajadores, obras, ...)
accion        ENUM('CREATE','UPDATE','DELETE','LOGIN','UPLOAD','EMAIL')
item_id       VARCHAR(50) NULL               -- id del recurso afectado
entidad_tipo  VARCHAR(40) NULL               -- ej: 'trabajador', 'obra' (migración 041)
entidad_label VARCHAR(160) NULL              -- ej: 'Juan Pérez', 'TRF-2026-001' (migración 041)
detalle       TEXT NULL                      -- JSON: {resumen, cambios?, datos?, type?}
ip            VARCHAR(45) NULL
user_agent    TEXT NULL
created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP

-- Índices:
idx_logs_created_at        (created_at)
idx_logs_modulo            (modulo)
idx_logs_usuario           (usuario_id)
idx_logs_modulo_created    (modulo, created_at)        -- migración 041
idx_logs_usuario_created   (usuario_id, created_at)    -- migración 041
idx_logs_accion            (accion)                    -- migración 041
idx_logs_entidad           (entidad_tipo, entidad_label) -- migración 041
```

### 14.4 ENTIDAD_RESOLVERS — agregar un módulo nuevo

**Archivo:** `backend/src/config/log-config.js`

Cuando creas un módulo nuevo (ej. `licencias-medicas`), agregar entrada para que sus logs muestren un label humano:

```js
ENTIDAD_RESOLVERS = {
  // ... módulos existentes
  'licencias-medicas': {
    tipo:      'licencia',                 // texto que va a entidad_tipo
    tabla:     'licencias_medicas',        // tabla maestra
    labelExpr: "CONCAT('Lic. ', folio)",   // expresión SQL para el label
    bodyKeys:  ['folio'],                  // campos del body para CREATE
  },
};
```

`labelExpr` es SQL embebido en `SELECT ${labelExpr} AS label FROM tabla WHERE id = ?`. Aceptan funciones como `CONCAT()`, `DATE_FORMAT()`, etc.

`bodyKeys` puede ser:
- string: nombre de campo a leer del body si es string no vacío.
- function: `(body) => string | null` para combinar campos (ej. `nombres + apellido_paterno`).

Si la resolución falla (módulo desconocido, error de DB, body vacío), el log se guarda con `entidad_label = NULL` y la UI muestra `item_id` como fallback. **El log nunca falla el request.**

### 14.5 Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/logs` | GET | Listado paginado con filtros (ver § 14.6) |
| `/api/logs/filtros` | GET | Datos para los dropdowns del panel |
| `/api/logs/export` | GET | Descarga CSV con los mismos filtros |

Todos requieren `sistema.logs.ver`.

### 14.6 Filtros del endpoint `/api/logs`

| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `q` | string | — | Texto libre en `entidad_label OR detalle OR usuario.nombre` |
| `usuario_id` | int | — | Filtro exacto |
| `modulo` | string | — | Filtro exacto |
| `accion` | CSV | — | `CREATE,UPDATE,DELETE` → `IN(...)` |
| `entidad_tipo` | string | — | Filtro exacto |
| `desde` / `hasta` | YYYY-MM-DD | — | Rango (inclusive en ambos extremos) |
| `incluir_logins` | bool | `false` | Si `false`, excluye `accion='LOGIN'` |
| `page` | int | `1` | Página actual |
| `limit` | int | `20` | Tope hard 200 |

Response:
```json
{ "data": [...], "total": 1234, "page": 1, "limit": 20, "total_pages": 62 }
```

### 14.7 Por qué los logins están ocultos por default

Decisión del audit (Phase 3). Cada login = 1 fila. Con 100 usuarios × 10 logins/día, los LOGIN ahogan los UPDATEs/DELETEs reales. El default es ocultarlos; el toggle "Incluir accesos" en el panel los muestra cuando se necesita auditar accesos.

Implementado en backend via `NOISY_ACCIONES` (en `log-config.js`) — la query agrega `AND l.accion NOT IN ('LOGIN')` cuando `incluir_logins != 'true'`.

### 14.8 Export CSV

`GET /api/logs/export?{mismos filtros}`:
- Stream row-por-row → no carga todo en memoria.
- BOM UTF-8 al inicio para que Excel ES detecte encoding.
- Tope hard **50.000 filas** para evitar dump accidental.
- Header: Fecha · Usuario · Módulo · Acción · Tipo entidad · Entidad · Resumen · IP · Item ID.
- Helper `csvCell()` escapa comillas (`"` → `""`) y envuelve si hay coma, `;` o newline.

Nombre del archivo: `historial_YYYY-MM-DD.csv`.

### 14.9 Resumen inline vs modal (frontend)

`frontend/src/components/settings/ActivityLogsPanel.tsx`:

- Cada fila muestra **resumen inline** (`inlineResumen()`) — extraído del campo `resumen` del JSON, o construido a partir de los primeros 3 campos cambiados.
- El modal de detalle se abre **sólo cuando** `needsModal()` retorna true:
  - `bulk_asistencia` → siempre (lista de trabajadores).
  - `diff` o `compact` con > 3 cambios.
- IP y user-agent: ocultos en la fila, accesibles via tooltip al hover sobre el avatar de usuario.

### 14.10 Errores comunes

| Síntoma | Causa | Fix |
|---|---|---|
| Logs duplicados para una sola acción | Otro middleware o el route handler también llamó `logManualActivity` | Verificar `res._activityLogged` flag o quitar el log manual redundante |
| `entidad_label` siempre NULL para un módulo X | Módulo no está en `ENTIDAD_RESOLVERS` | Agregar entrada en `log-config.js` (ver § 14.4) |
| Bulk asistencia no aparece en el panel | Está bien — usa `modulo='asistencias'` y `item_id='obra_X'`, formato JSON `{type:'bulk_asistencia', ...}` | El resolver `BulkAsistenciaViewer` del panel lo renderiza al abrir el modal |
| Export CSV con tildes rotas en Excel | Excel ES no detectó UTF-8 sin BOM | El backend ya emite BOM (`﻿`); si reaparece, verificar que `Content-Type` incluya `charset=utf-8` |
| Filtro por fecha no encuentra logs del mismo día | El backend agrega `00:00:00` a `desde` y `23:59:59` a `hasta`, pero si la zona horaria del cliente difiere de la del server, los rangos pueden quedar corridos | Pasar fechas en zona horaria del server (Chile) o aumentar el rango ±1 día |

### 14.11 Cómo agregar un nuevo `accion` ENUM

Si necesitas un tipo de acción nuevo (ej. `EXPORT`, `APPROVAL`):

1. Crear migración nueva (`042_*.sql`) con `ALTER TABLE logs_actividad MODIFY COLUMN accion ENUM('CREATE','UPDATE','DELETE','LOGIN','UPLOAD','EMAIL','EXPORT','APPROVAL') NOT NULL`.
2. Llamar `logManualActivity(userId, modulo, 'EXPORT', itemId, detalle, req)` desde el código que dispara la acción.
3. Agregar el badge color en `frontend/src/components/settings/ActivityLogsPanel.tsx → getActionDisplay()`.
4. Si querés que sea visible por default sin toggle, NO añadirla a `NOISY_ACCIONES` en `log-config.js`.

---

## 15. Permisos Financieros ($)

> Decisión jefatura mayo-26: sólo personal autorizado debe ver información
> relacionada con dinero. Implementado en migración 043 + módulo `Financiero`
> del catálogo de permisos. Política **deny-by-default**: sólo Super Admin
> recibe estos permisos automáticamente; admin asigna manualmente al resto
> vía `PermisosRolPanel` o `PermisosUsuarioPanel` (Overrides).

### 15.1 Lista de permisos $

| Clave | Qué gatea |
|---|---|
| `inventario.costos.ver` | Columnas `valor_compra`, `valor_arriendo`, `valor_arriendo_override` en items y ubicaciones |
| `inventario.costos.editar` | Edición de los campos $ anteriores (PUT bulk + form) |
| `inventario.facturas.ver` | Endpoint `GET /api/facturas-inventario` y la pestaña Facturas en UI |
| `inventario.facturas.gestionar` | Crear y anular facturas con precios |
| `inventario.bombas.ver_costos` | Campo `costo` de `RegistroBombaHormigon` + StatCard "Costo Total" |
| `inventario.descuentos.gestionar` | Endpoint `PUT /api/inventario/descuento/obra/:obraId` |
| `inventario.resumen.ver_valores` | `valor_bruto`, `valor_neto`, `subtotal_bruto`, KPI "Valor obras", ranking "Top Obras" |
| `asistencia.horas_extra.ver` | Inputs HE en daily tab + columnas HE en export Excel (quedan vacías sin permiso) |
| `trabajadores.financiero.ver` | (Preventivo) Sueldo base, anticipo, descuento, bono, gratificación, valor hora |
| `trabajadores.financiero.editar` | (Preventivo) Edición de los campos $ del trabajador |

### 15.2 Guía operacional rápida — quién necesita qué

| Permiso | Rol/usuario sugerido |
|---|---|
| `inventario.costos.ver/editar` | Compras, Operaciones senior, Finanzas |
| `inventario.facturas.ver/gestionar` | Finanzas, Tesorería |
| `inventario.bombas.ver_costos` | Operaciones, Compras |
| `inventario.descuentos.gestionar` | Operaciones senior, Finanzas |
| `inventario.resumen.ver_valores` | Gerencia, Operaciones senior |
| `asistencia.horas_extra.ver` | RRHH, Finanzas |
| `trabajadores.financiero.*` | RRHH (cuando se agreguen los campos) |

### 15.3 Cómo asignar a un rol o usuario

**Rol entero** (todos los usuarios con ese rol heredan):
1. Configuración → Usuarios y Roles → editar rol → checkboxes en sección "Datos Financieros".
2. `POST /api/usuarios/roles/:id/permisos` actualiza `permisos_rol_v2`.

**Usuario individual** (override sobre el rol):
1. Configuración → Usuarios → ⋯ → "Permisos Personalizados".
2. Para cada permiso $ elegir Conceder (override grant), Defecto (hereda del rol) o Denegar (override deny).
3. `POST /api/usuarios/user-overrides/:id` actualiza `permisos_usuario_override`.

Tras guardar, el usuario destino verá sus permisos nuevos en su siguiente login (bump automático de `roles.version`).

### 15.4 Defensa en profundidad

| Capa | Implementación |
|---|---|
| Backend | `backend/src/utils/sanitizeFinancialFields.js` — omite campos $ del JSON. Routes usan `sanitizeItemsCosto`, `sanitizeResumenInventario`, `sanitizeRegistroBomba`. PUT/POST gatean con `guardEditCostos` o `checkPermission('inventario.costos.editar')`. |
| Frontend | `useAuth().hasPermission('inventario.costos.ver')` esconde columnas/secciones. Layout responde (grids de 3→1 col cuando se ocultan ambos $). |

Aun si un atacante interceptara el JSON crudo desde DevTools, **no vería los valores monetarios** — el backend nunca los emite.

### 15.5 Agregar un permiso $ nuevo a futuro

1. Añadir entrada en `backend/src/config/permisos.config.js` con `'Financiero'` como módulo (5to argumento = orden visual).
2. Agregar la clave también al array `PERMISOS_FINANCIEROS` del mismo archivo.
3. Crear migración `NNN_permiso_X.sql` con dos `INSERT IGNORE`: uno en `permisos_catalogo`, otro en `permisos_rol_v2` (rol_id=1). Bump `roles.version`.
4. Backend: agregar wrapper en `sanitizeFinancialFields.js` que omita el campo nuevo. Usar en el route correspondiente.
5. Frontend: import `useAuth`, gate el componente con `hasPermission('nuevo.permiso')`.
6. Documentar aquí (15.1 y 15.2).

### 15.6 Migración 043 — operación en producción

Cuando hagas merge a `main` por primera vez con este sprint:

1. cPanel → Setup Node.js App → Run JS script → `migrate`.
2. La migración 043 es idempotente — segura para re-ejecutar.
3. Resultado esperado: las 10 claves en `permisos_catalogo`, las 10 asignaciones en `permisos_rol_v2` para rol_id=1, y `roles.version` incrementado (Super Admin se desloguea automáticamente en próximo request — debe re-loguear).

---

## § 16. Permisos Granulares de Transferencias + SoD

**Contexto:** hasta mayo 2026 el flujo de transferencias (solicitar → aprobar → despachar → recibir) corría bajo 3 permisos genéricos (`inventario.crear`, `inventario.aprobar`, `inventario.editar`). Esto permitía que un mismo usuario solicite y apruebe la misma transferencia (sin Segregation of Duties). Migración 046 introduce 9 permisos atómicos + SoD enforcement en backend.

### 16.1 Los 9 permisos nuevos

| Clave | Qué gatea | Sensible |
|---|---|---|
| `inventario.transferencias.solicitar` | POST `/transferencias`, `/devolucion`, `/intra-obra`, `/:id/crear-faltante` | — |
| `inventario.transferencias.aprobar` | PUT `/:id/aprobar`, `/:id/rechazar`, GET `/pendientes`, GET/PUT `/discrepancias*` | — |
| `inventario.transferencias.despachar` | PUT `/:id/despachar` | — |
| `inventario.transferencias.recibir` | PUT `/:id/recibir`, `/:id/rechazar-recepcion` | — |
| `inventario.transferencias.cancelar` | PUT `/:id/cancelar` (terceros). Solicitante puede cancelar propia sin permiso. | — |
| `inventario.transferencias.push_directo` | POST `/push-directo` (bodega → obra sin aprobación, consolida 3 roles) | ⚠️ Crítico |
| `inventario.transferencias.intra_bodega` | POST `/intra-bodega` (bodega → bodega instantáneo, consolida 4 roles) | ⚠️ Crítico |
| `inventario.transferencias.orden_gerencia` | POST `/orden-gerencia` (PM bypasa aprobación, consolida 3 roles) | ⚠️ Crítico |
| `inventario.transferencias.sod_bypass` | Permite acciones consecutivas en flujo normal (obras unipersonales / emergencias) | ⚠️ Crítico |

### 16.2 Política SoD (Segregation of Duties)

Backend rechaza con **403** si la misma identidad intenta dos roles consecutivos sobre la misma transferencia:

- `aprobar()` rechaza si `solicitante_id === aprobadorId`
- `despachar()` rechaza si `aprobador_id === transportistaId`
- `recibir()` rechaza si `transportista_id === receptorId` (o `aprobador_id === receptorId` si se salta despacho)

Override: el permiso `inventario.transferencias.sod_bypass` desactiva las validaciones SoD para ese usuario. **Auditoría obligatoria:** cada uso queda en `logs_actividad` con actor + timestamp.

### 16.3 Flujos especiales (sin SoD aplicado)

`push_directo`, `intra_bodega`, `orden_gerencia` están diseñados para consolidar roles en una sola persona. Su permiso individual ya implica la autoridad — no se aplica SoD adicional. Mantener restringidos a roles con responsabilidad operacional.

### 16.4 Migración 046 — operación en producción

```
cPanel → Setup Node.js App → Run JS script → `migrate`
```

La migración asigna los 9 permisos sólo al **Super Admin (rol_id=1)**. Idempotente — segura para re-ejecutar.

### 16.5 Reasignación manual post-deploy

Por decisión de jefatura, los roles existentes NO heredan automáticamente los nuevos permisos. Admin debe ir a **Configuración → Roles** y reasignar según esta matriz sugerida:

| Rol legacy | Permisos nuevos recomendados |
|---|---|
| En Terreno | `transferencias.solicitar`, `transferencias.recibir` |
| Bodeguero | `transferencias.despachar`, `transferencias.recibir`, `transferencias.cancelar`, `transferencias.intra_bodega` |
| Jefe Obra | `transferencias.solicitar`, `transferencias.aprobar`, `transferencias.cancelar` |
| Gerencia / PM | `transferencias.aprobar`, `transferencias.orden_gerencia`, `transferencias.sod_bypass` (sólo si crítico) |
| Operaciones | todos los `transferencias.*` salvo `sod_bypass` |

Mientras no se reasignen, **los usuarios de esos roles no podrán ejecutar acciones de transferencias** (default deny). Hacerlo inmediatamente después del deploy minimiza la ventana de impacto operacional.

### 16.6 Audit log de SoD bypass

Toda acción ejecutada con `sod_bypass` queda en `logs_actividad`. Revisar periódicamente:

```sql
SELECT la.fecha, u.nombre, la.accion, la.detalle
FROM logs_actividad la
JOIN usuarios u ON la.usuario_id = u.id
WHERE la.detalle LIKE '%transferencias%' AND la.detalle LIKE '%sod_bypass%'
ORDER BY la.fecha DESC LIMIT 50;
```

### 16.7 Frontend: identity gates + banner SoD

`TransferenciaDetail.tsx` esconde los botones de acción cuando el usuario tiene rol previo en la TRF (solicitante intentando aprobar, etc.). Un banner amber explica al usuario por qué no aparece el botón ("tú creaste esta solicitud — otro usuario debe aprobarla"). El backend es la fuente de verdad — la UI sólo evita confusión.

`NewMovimientoModal.tsx` filtra los flujos visibles por permiso individual. Si el user no tiene ninguno, muestra mensaje "No tienes permisos para crear movimientos".

`TransferenciasList.tsx` oculta el chip "Discrepancias" si el user no es aprobador.

---

## 17. Recepción Parcial de Transferencias (migración 048)

**Caso de uso:** una transferencia aprobada requiere varios viajes para entregar todos los ítems (capacidad del camión, distancia entre obras). El receptor elige al confirmar la llegada de un cargamento:
- **Recepción Parcial** → registra lo que llegó en este viaje, deja la TRF en estado `recepcion_parcial`, espera próximos viajes. Sin discrepancia.
- **Recepción Total** → cierra la TRF (estado `recibida`). Cualquier gap entre `cantidad_enviada` y `cantidad_recibida` acumulada se registra como discrepancia (merma o sobrante).

### 17.1 Modelo de datos

Migración 048 introduce:
- `transferencias.estado` ENUM agrega `'recepcion_parcial'` entre `en_transito` y `recibida`.
- `transferencia_recepciones` — header por evento de recepción (`receptor_id`, `fecha_recepcion`, `tipo`, `observacion`).
- `transferencia_recepcion_items` — qué llegó en cada evento (`recepcion_id`, `transferencia_item_id`, `cantidad_recibida`).
- `transferencia_item_origenes.cantidad_decrementada` — tracking FIFO para parciales sucesivos en multi-origen.

### 17.2 Reglas de stock

- **Régimen nuevo** (`stock_reconciliado = TRUE`): cada parcial decrementa origen + incrementa destino SOLO por la cantidad de ese viaje. Origen consume splits en orden FIFO (id ASC) via `cantidad_decrementada` por split.
- **Régimen legacy** (`stock_reconciliado = FALSE`): origen ya se descontó al aprobar (FULL). Cada parcial solo incrementa destino. Discrepancia se calcula igual en recepción total.

### 17.3 Estado machine

| Desde | Acción | Destino |
|---|---|---|
| `en_transito` o `aprobada` | `recibir(..., 'parcial')` | `recepcion_parcial` |
| `en_transito` o `aprobada` | `recibir(..., 'total')` | `recibida` |
| `recepcion_parcial` | `recibir(..., 'parcial')` | `recepcion_parcial` |
| `recepcion_parcial` | `recibir(..., 'total')` | `recibida` |

### 17.4 Validaciones

- **Over-receive en parcial**: `cantidad_recibida_acumulada + este_viaje > cantidad_enviada` → 400. El receptor debe usar "Recepción Total" si quiere recibir excedente (que se loguea como sobrante).
- **SoD**: validado en CADA evento de recepción (receptor ≠ transportista; si aprobada directa también ≠ aprobador). Bypass via `inventario.transferencias.sod_bypass`.
- **Rechazar Recepción** solo permitido en `en_transito` (no en `recepcion_parcial`). Si el receptor ya movió stock parcial y quiere "abortar", debe cerrar con "Recepción Total" con cantidad=0 en los pendientes — eso genera discrepancia por lo no llegado.

### 17.5 Header `receptor_id` / `recibido_por` / `fecha_recepcion`

Solo se setea en la recepción TOTAL (el cierre). En parciales sucesivos cada evento se audita en `transferencia_recepciones` con su propio receptor — útil cuando bodegueros distintos reciben viajes distintos.

### 17.6 UI Frontend

`TransferenciaDetail.tsx`:
- Estado `recepcion_parcial` muestra badge "Recibiendo Parcial" (color púrpura, icono `PackageOpen`).
- Botón principal: "Registrar Recepción" (o "Registrar Nuevo Viaje" si ya hay parciales).
- Form de recepción muestra por ítem 3 columnas: Enviada / Recibida previa / Pendiente. Input "este viaje" defaults al pendiente. Quick-fill "todo" setea al pendiente. Validación visual si excede pendiente.
- Dos botones de confirmación: "Recepción Parcial" (púrpura, deshabilitado si over-receive) + "Recepción Total" (verde, siempre habilitado).
- Sección desplegable "Historial de recepciones" — se renderiza si hay eventos. Lista cada uno con fecha, receptor, items + cantidades.

`useTransferencias.ts`: firma `recibir(id, items, tipo)` con `tipo: 'parcial' | 'total'` (default `'total'` por back-compat). Nuevo método `fetchRecepciones(id)`.

### 17.7 Tests

`backend/tests/transferencia_recepcion_parcial.test.js` cubre 9 casos: parcial→parcial→total, stock por evento, FIFO multi-split, over-receive bloqueado, sin discrepancia en parcial, discrepancia en total con merma, SoD en parcial, transiciones desde recepcion_parcial, tipo inválido, y getRecepciones.

### 17.8 Smoke test producción

1. Crear TRF Obra A → Obra B con 3 items (10/10/10 unidades).
2. Aprobar (user distinto al solicitante). Despachar (user distinto al aprobador).
3. **Recepción 1 (parcial):** receptor (≠ transportista) marca 5/5/0. Click "Recepción Parcial".
4. Verificar: estado `recepcion_parcial`, stock A=-5/-5/0, stock B=+5/+5/0, `transferencia_items.cantidad_recibida`=5/5/0, 1 fila en `transferencia_recepciones`, 0 discrepancias.
5. **Recepción 2 (parcial):** receptor marca 5/0/5. Verificar acumulado=10/5/5, sigue en `recepcion_parcial`.
6. **Intentar over-receive en parcial:** intentar recibir 5 del item 1 (ya tiene 10/10). Backend retorna 400.
7. **Recepción 3 (total):** receptor marca 0/5/5 (cierra pendientes). Verificar estado `recibida`, sin discrepancia.
8. **Caso merma:** crear otra TRF, parcial 8/10, luego total 0/0. Verificar discrepancia tipo merma para item 1 (cantidad_enviada=10, cantidad_recibida=8).

---

## 18. Aislamiento de Datos de Prueba (`es_prueba`) — migración 066

**Qué es:** una bandera booleana `es_prueba` en `obras` y `trabajadores` para marcar
datos creados con fines de prueba/depuración. Cuando `es_prueba = TRUE`, la entidad
queda **excluida de todo lo operativo**: reportes (diario + Excel mensual + reporte
semanal RRHH), inventario (stock, transferencias, discrepancias, movimientos, resumen
ejecutivo, bombas), dashboard/KPIs, asistencia y todos los selectores/dropdowns. Solo
permanece visible en superficies de **administración** para poder revertir el aislamiento.

**Default `FALSE`** → los datos existentes no cambian de comportamiento.

### 18.1 Cómo se usa (UI)
- **Obras:** Configuración → Organización → Obras → editar → checkbox "🧪 Obra de prueba".
  Aislar una obra **arrastra en cascada** a todos sus trabajadores (`es_prueba=1`);
  des-aislarla los revierte.
- **Trabajadores:** formulario de trabajador (módulo Asistencia / Consultas) → checkbox
  "🧪 Trabajador de prueba". También se pueden aislar individualmente.

### 18.2 Arquitectura del filtro
- **Default-exclude + opt-in:** el CRUD genérico (`crud.service.js`) recibe la opción
  `testFlagColumn: 'es_prueba'` (solo en rutas obras y trabajadores). `getAll` excluye
  por defecto; las superficies de gestión pasan `?incluir_prueba=true` para verlos
  (tabla Obras en Settings, búsqueda de Consultas, selector de obra en WorkerForm).
- **Queries raw:** ~60 sitios en services llevan el filtro **co-locado junto al
  `activa=1`/`activo=1` existente**. Regla: INNER JOIN/FROM → `AND alias.es_prueba = 0`;
  LEFT JOIN con FK nullable (obra puede ser bodega) → forma **NULL-safe**
  `AND (alias.es_prueba = 0 OR alias.id IS NULL)` o el predicado en el `ON`. Lookups
  por id / batches `IN(...)` post-selección **NO** se filtran (para poder abrir una
  entidad de prueba y revertirla).
- **Transferencias:** se excluyen las que tocan una obra de prueba en origen O destino
  vía subconsulta NULL-safe sobre las columnas base (`origen_obra_id`/`destino_obra_id`),
  para que funcione también en los `COUNT` que no hacen JOIN a obras. Ver constantes
  `EXCLUIR_OBRAS_PRUEBA` (transferencia.service.js) y `_exclTransfPrueba()`
  (inventario.service.js).
- **Cascada obra→trabajadores:** PUT `/obras/:id` tiene un router custom montado **antes**
  del CRUD genérico en `index.js` que, si el body trae `es_prueba`, hace
  `UPDATE trabajadores SET es_prueba=? WHERE obra_id=?`. Herencia al crear trabajador via
  hook `beforeCreate`.

### 18.3 Operación en producción (al mergear a `main`)
1. cPanel → Setup Node.js App → Run JS script → `migrate`. La migración 066 es
   idempotente (`ADD COLUMN IF NOT EXISTS`). Segura de re-ejecutar.
2. No requiere reasignar permisos ni backfill — todo arranca en `FALSE`.

### 18.4 Gotcha al agregar queries nuevas
Cualquier query **nueva** que liste/agregue obras o trabajadores debe recordar el filtro
`es_prueba`. Auditar con: `grep -rn "activa = 1\|activo = 1" backend/src/services` y
confirmar que cada LIST/AGGREGATE tenga el `es_prueba` co-locado. Omitirlo = fuga de
datos de prueba a un reporte.

---

*Última actualización: Junio 2026 — § 6: fila nueva "CrudTable: Eliminar/Editar dan 404" (el prop `endpoint` debe ser el recurso REST base, no un alias `/list`; + `useSoftDelete` para que el borrado se note). Previas: "deploy acoplado a migración", "`0` suelto en la UI", caso § 4.1 "Reporte Semanal RRHH".*
