# PLAYBOOK — Deploy "pull-side" en cPanel (Staging)

> **Para quién:** cualquier persona del equipo que necesite que el deploy a `test.boveda.lols.cl`
> funcione, o entender por qué a veces "el push se ve verde en GitHub pero el sitio no cambia".
>
> **Qué resuelve:** el FTP de cPanel **banea de forma persistente las IPs del runner de GitHub
> Actions** (firewall **cPHulk**) → el deploy por FTP falla con
> `mirror: Fatal error: max-retries exceeded (Connection refused)`. La solución es **invertir la
> dirección**: GitHub Actions solo compila y publica la rama `deploy-staging`; el **servidor cPanel
> hace `git pull` saliente** (no bloqueado) vía un cron cada 5 min y se auto-despliega.
>
> **Lo importante:** el lado GitHub **YA FUNCIONA** (la rama `deploy-staging` se actualiza sola en cada
> push a `develop`). Lo que este playbook configura es **únicamente el lado servidor** (el *clone* + el
> *cron*) — la pieza que en el pasado quedó sin completar/verificar y por eso "el sitio no se
> actualizaba aunque el workflow saliera verde".

---

## 0. Mapa rápido (rutas y nombres canónicos)

| Cosa | Valor |
|---|---|
| Usuario cPanel | `lolscl` (HOME = `/home/lolscl`) |
| Repo (PÚBLICO) | `https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git` |
| Rama de build | `deploy-staging` |
| Clone en servidor | `~/deploy-staging` (= `/home/lolscl/deploy-staging`) |
| Docroot frontend | `~/public_html/test.boveda.lols.cl` |
| Backend (Passenger) | `~/test-boveda` |
| Script de deploy | `~/deploy-staging/scripts/cpanel-deploy-staging.sh` |
| Log del cron | `~/deploy-staging.log` |
| URL a verificar | https://test.boveda.lols.cl |

> El repo es **PÚBLICO** → el *clone* **NO necesita token/PAT**. Usar la URL HTTPS tal cual.

---

## 1. Antes de empezar: ¿qué interfaces tiene este cPanel?

En el dashboard de cPanel, caja **"Search Tools"** (arriba), busca y anota cuáles existen:

- **Terminal** (sección *Advanced*) → si existe, usa el **Camino A** (más rápido y verificable).
- **Git™ Version Control** (sección *Files*) → si existe (y no hay Terminal), usa el **Camino B**.
- **Cron Jobs** (sección *Advanced*) → **obligatorio** en TODOS los caminos.
- **File Manager** → para leer/editar logs y archivos sin Terminal.

> **El hosting actual de Bóveda LOLS NO tiene Terminal ni Git Version Control** (verificado 2026-06-13).
> Solo Cron Jobs, Setup Node.js App y File Manager. → **Usar el Camino C.** Como `git` SÍ está
> disponible en el entorno de cron, todo el setup se hace con Cron Jobs (bootstrap del clone incluido).

---

## 2. CAMINO A — Terminal de cPanel (preferido)

### A.1 Clonar el repo (solo si `~/deploy-staging` no existe aún)
```bash
cd ~
git clone --branch deploy-staging \
  https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git \
  ~/deploy-staging
```
Verificar rama y commits:
```bash
cd ~/deploy-staging
git rev-parse --abbrev-ref HEAD       # debe imprimir: deploy-staging
git fetch origin deploy-staging
git rev-parse HEAD                     # commit local
git rev-parse origin/deploy-staging    # commit remoto (debe coincidir tras el deploy)
```
> **Si el clone ya existía pero en otra rama:**
> `cd ~/deploy-staging && git fetch origin && git checkout deploy-staging && git reset --hard origin/deploy-staging`

### A.2 Verificar line-endings LF (NO CRLF)
Un `.sh` con CRLF rompe el shebang → `bad interpreter: /bin/bash^M`. El `.gitattributes` del repo
fuerza LF, **pero solo si el clone se hizo después de ese commit**.
```bash
file ~/deploy-staging/scripts/cpanel-deploy-staging.sh
#   OK  → "... ASCII text"
#   MAL → "... with CRLF line terminators"
grep -c $'\r' ~/deploy-staging/scripts/cpanel-deploy-staging.sh   # 0 = OK · >0 = CRLF
```
Si tiene CRLF, normalizar en el sitio (no toca el repo):
```bash
sed -i 's/\r$//' ~/deploy-staging/scripts/cpanel-deploy-staging.sh
```

### A.3 Probar el script a mano (antes de automatizarlo)
```bash
bash ~/deploy-staging/scripts/cpanel-deploy-staging.sh ; echo "exit=$?"
```
Salida esperada (una de dos):
- `… · sin cambios (<sha>) — nada que desplegar` (ya estaba al día), **o**
- `… · desplegando <sha> …` seguido de `… · deploy OK → <sha>`.

Si falla, ver **§5 Gotchas**.

### A.4 Confirmar binarios disponibles (para el cron)
```bash
which git;  git --version
which rsync; rsync --version | head -n 1   # si vacío, el script usa fallback cp — funciona igual
```
Anota las rutas absolutas (se usan en §4 si el cron no los encuentra).

### A.5 Configurar el cron → ir a **§4**.

---

## 3. CAMINO B — Solo interfaz web (sin Terminal)

### B.1 Clonar con "Git™ Version Control"
1. cPanel → **Git™ Version Control** → **Create**.
2. **Clone URL:** `https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git` (público → **dejar vacío usuario/token**).
3. **Repository Path:** `deploy-staging` (queda como `/home/lolscl/deploy-staging`).
4. **Repository Name:** `deploy-staging` (cosmético).
5. **Create** y esperar a que termine.
6. Abrir el repo → **Manage** → en **"Checked-Out Branch"** seleccionar **`deploy-staging`** → **Update**.
   (cPanel suele clonar la rama por defecto; **HAY que cambiarla a `deploy-staging`**.)

> La UI de Git Version Control **no corre el script ni hace deploy** por sí sola (el `.cpanel.yml` no
> aplica a este flujo). El deploy lo hace el cron del paso B.2.

### B.2 Configurar el cron → ir a **§4**.

> **Limitación del Camino B:** sin Terminal no puedes probar el script a mano ni verificar LF/CRLF
> directamente. Mitigación: pon el cron en intervalo corto temporal (`*/1 * * * *`), espera 1–2 min y
> lee `~/deploy-staging.log` por **File Manager**. Si muestra `bad interpreter ^M`, el clone trajo
> CRLF → pide a alguien con Terminal que corra el `sed` de §A.2 (o re-clona tras confirmar que
> `.gitattributes` está en la rama). Luego vuelve a `*/5 * * * *`.

---

## 3bis. CAMINO C — Solo Cron Jobs (sin Terminal ni Git VC) ← hosting actual

Cuando NO hay Terminal ni Git™ Version Control, se usa Cron Jobs como "shell". `git` está disponible en
el entorno de cron (los crons previos ya lo ejecutaban). Orden:

### C.0 (recomendado) Limpiar mecanismos rotos previos
Si en **Cron Jobs → Current Cron Jobs** hay filas que hacen `git pull origin develop` dentro de
`~/test-boveda` (modelo viejo, que falla porque `~/test-boveda` no es un repo git), **bórralas**
(conserva snapshot/reporte/alertas). Si `~/deploy_log.txt` quedó enorme por esos errores, vacíalo en
File Manager (Edit → borrar → Save) o renómbralo.

### C.1 Bootstrap del clone (cron one-shot idempotente)
**Cron Jobs → Add New Cron Job →** "Every Minute" (`* * * * *`) → **Command:**
```
GIT_TERMINAL_PROMPT=0 sh -c 'test -d /home/lolscl/deploy-staging/.git || git clone --branch deploy-staging https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git /home/lolscl/deploy-staging' >> /home/lolscl/deploy-bootstrap.log 2>&1
```
- Es **idempotente** (el `test -d … ||` solo clona si falta). `GIT_TERMINAL_PROMPT=0` evita que se
  cuelgue pidiendo credenciales.
- Espera 1–2 min y verifica en **File Manager** que existen `/home/lolscl/deploy-staging/.git` y
  `/home/lolscl/deploy-staging/frontend/dist/index.html`. Lee `/home/lolscl/deploy-bootstrap.log`.
- **Cuando el clone exista, BORRA este cron one-shot** (ya cumplió su función).

### C.2 Confirmar el docroot ANTES del primer deploy
El deploy hace `rsync --delete` sobre el docroot del frontend → confirma cuál es:
**cPanel → Domains** (o Subdomains) → `test.boveda.lols.cl` → **Document Root**. Si NO es
`~/public_html/test.boveda.lols.cl`, avísalo: hay que ajustar `FRONT_DEST` en el script (en el repo) y
volver a publicar `deploy-staging`.

### C.3 Activar el deploy → ir a **§4** (cron cada 5 min).

---

## 4. El CRON de deploy (todos los caminos)

### 4.1 Comando exacto (versión self-healing — RECOMENDADA)
cPanel → **Cron Jobs** → **Add New Cron Job**:
- **Common Settings:** "Every 5 Minutes" (o campos: `*/5 * * * *`).
- **Command** (en cPanel se escribe SOLO la parte del comando; los 5 campos de tiempo van en los selectores):
```
cd /home/lolscl/deploy-staging && git fetch -q origin deploy-staging && git checkout -q -f origin/deploy-staging -- scripts/cpanel-deploy-staging.sh 2>/dev/null; HOME=/home/lolscl GIT_TERMINAL_PROMPT=0 /bin/bash /home/lolscl/deploy-staging/scripts/cpanel-deploy-staging.sh >> /home/lolscl/deploy-staging.log 2>&1
```
**Por qué este preámbulo** (`git fetch … && git checkout -f origin/deploy-staging -- scripts/…`): evita
la **condición de carrera del script auto-modificándose**. El script hace `git reset --hard` a mitad de
su ejecución; si su contenido cambió respecto al que había en disco, bash seguiría corriendo la versión
vieja (ya bufferizada) durante ESE deploy. Pre-cargar el `.sh` más reciente ANTES de invocar bash
garantiza que siempre corre la versión actual. `HOME=…` asegura que `$HOME` resuelva en el entorno
mínimo del cron.

> Versión simple (sin blindaje), si se prefiere — funciona, pero el **primer deploy tras editar el
> `.sh` correrá la versión anterior** (ver gotcha en §5):
> `HOME=/home/lolscl GIT_TERMINAL_PROMPT=0 /bin/bash /home/lolscl/deploy-staging/scripts/cpanel-deploy-staging.sh >> /home/lolscl/deploy-staging.log 2>&1`

### 4.2 Variante a-prueba-de-PATH (usar SOLO si el log muestra `command not found`)
El cron corre con un PATH mínimo. Si aparece `git: command not found` o `rsync: command not found`,
prefija un PATH (ajusta con las rutas de `which` de §A.4):
```
PATH=/usr/local/bin:/usr/bin:/bin:$PATH /bin/bash ~/deploy-staging/scripts/cpanel-deploy-staging.sh >> ~/deploy-staging.log 2>&1
```

### 4.3 Verificar
```bash
tail -n 40 ~/deploy-staging.log
```
(Sin Terminal: File Manager → `/home/lolscl/deploy-staging.log` → **View**.)

Éxito = la última línea es `… · deploy OK → <sha>` o `… · sin cambios (<sha>)`.

---

## 5. Gotchas (qué mirar cuando algo falla)

| Síntoma en el log | Causa | Fix |
|---|---|---|
| `bad interpreter: /bin/bash^M` | El `.sh` tiene CRLF (clone viejo) | `sed -i 's/\r$//' <script>` y/o re-clonar. Llamar al script con `/bin/bash <script>` (como en el cron) reduce la dependencia del shebang. |
| `git: command not found` / `rsync: command not found` | PATH mínimo del cron | Variante §4.2 con `PATH=…` o rutas absolutas (`/usr/bin/git`). |
| `not a git repository` | Clone nunca se hizo / ruta equivocada | Rehacer §A.1 o §B.1. Confirmar que existe `~/deploy-staging/.git`. |
| Log dice `sin cambios` pero el sitio no cambia | El clone está en la rama equivocada (no `deploy-staging`) | `cd ~/deploy-staging && git checkout deploy-staging && git reset --hard origin/deploy-staging`. |
| Sitio carga viejo pese a `deploy OK` | Caché del navegador, o assets stale | Hard-refresh (Ctrl+Shift+R). Comparar hash del bundle (§6). |
| `Permission denied` al escribir docroot | Permisos del docroot | Confirmar que `~/public_html/test.boveda.lols.cl` pertenece a `lolscl`. |
| Cron no corre nunca (log vacío/inexistente) | Cron no guardado | Confirmar que el job aparece en "Current Cron Jobs". |
| **El login falla / `POST /api/...` da 404 HTML tras un deploy** | La carpeta **`api/` del docroot** (mount de Passenger del backend) **fue borrada** por el `rsync --delete` | Recrear `…/test.boveda.lols.cl/api/.htaccess` con el bloque Passenger (ver §7bis) y reiniciar. Asegurar que el `.sh` excluye `api/` (ya lo hace) y usar el cron self-healing de §4.1. |
| **El primer deploy tras editar el `.sh` se comporta como la versión vieja** | **Carrera de auto-modificación:** el script se `git reset` a sí mismo a mitad de ejecución; bash ya tenía bufferizada la versión anterior | Usar el cron **self-healing** de §4.1 (pre-carga el `.sh` antes de ejecutarlo). Si usas la versión simple: tras editar el `.sh`, corre el deploy DOS veces (el 2º ya usa la versión nueva) y restaura manualmente cualquier daño del 1º. |

> **Clave sobre el cron y la rama:** el script NO hace `checkout` de rama; hace
> `git fetch origin deploy-staging` + `git reset --hard origin/deploy-staging`. **El clone DEBE estar
> en la rama `deploy-staging`** para que funcione correctamente.

> **Clave sobre `api/` (staging):** el docroot de staging contiene una carpeta `api/` con un `.htaccess`
> de Passenger que enruta `test.boveda.lols.cl/api` → el backend Node. El deploy la **excluye** del
> `rsync --delete` (igual que `.htaccess` y `.well-known/`). **Nunca debe borrarse.**

---

## 7bis. Restaurar `api/.htaccess` de staging (si se borró)

Si el login da 404 porque `…/test.boveda.lols.cl/api/` desapareció: File Manager → crear la carpeta
`api/` dentro del docroot → crear dentro un archivo `.htaccess` con EXACTAMENTE este contenido, y luego
reiniciar (Setup Node.js App → test-boveda → Restart, o tocar `~/test-boveda/tmp/restart.txt`):
```
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN
PassengerAppRoot "/home/lolscl/test-boveda"
PassengerBaseURI "/"
PassengerNodejs "/home/lolscl/nodevenv/test-boveda/20/bin/node"
PassengerAppType node
PassengerStartupFile index.js
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END
# DO NOT REMOVE OR MODIFY. CLOUDLINUX ENV VARS CONFIGURATION BEGIN
<IfModule Litespeed>
</IfModule>
# DO NOT REMOVE OR MODIFY. CLOUDLINUX ENV VARS CONFIGURATION END
```

---

## 6. Criterio de "funciona" (definición de éxito)

Tras un push a `develop`:
1. El workflow `deploy-cpanel-staging.yml` queda **verde** (rama `deploy-staging` actualizada).
2. En **≤ 5 min** (1 ciclo de cron), `~/deploy-staging.log` muestra `… · deploy OK → <sha>` con el
   `<sha>` del build.
3. El **hash del bundle JS** servido en https://test.boveda.lols.cl coincide con el de
   `~/deploy-staging/frontend/dist/index.html`:
   ```bash
   grep -oE '/assets/[A-Za-z0-9_.-]+\.js' ~/deploy-staging/frontend/dist/index.html   # rama
   curl -s https://test.boveda.lols.cl/ | grep -oE '/assets/[A-Za-z0-9_.-]+\.js'      # sitio
   ```

---

## 7. Producción — PULL-SIDE (2026-06-16)

Prod (`main` → `boveda.lols.cl`) ya NO usa FTP (el ban cPHulk también lo tumba). Usa el mismo
mecanismo que staging, con estos valores canónicos:

| Cosa | Valor (PROD) |
|---|---|
| Rama de build | `deploy-prod` |
| Clone en servidor | `~/deploy-prod` (= `/home/lolscl/deploy-prod`) |
| Docroot frontend | `~/public_html/boveda.lols.cl` |
| Backend (Passenger) | `~/boveda` |
| Script de deploy | `~/deploy-prod/scripts/cpanel-deploy-prod.sh` |
| Log del cron | `~/deploy-prod.log` |
| URL a verificar | https://boveda.lols.cl |

GitHub ya publica la rama `deploy-prod` en cada push a `main` (workflow `deploy-cpanel.yml`). Falta
**solo el lado servidor** (idéntico a §3bis/§4, cambiando `staging`→`prod`):

### 7.1 Bootstrap del clone (cron one-shot idempotente, "Every Minute" `* * * * *`)
```
GIT_TERMINAL_PROMPT=0 sh -c 'test -d /home/lolscl/deploy-prod/.git || git clone --branch deploy-prod https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git /home/lolscl/deploy-prod' >> /home/lolscl/deploy-prod-bootstrap.log 2>&1
```
Esperar 1–2 min, verificar en File Manager que existen `/home/lolscl/deploy-prod/.git` y
`/home/lolscl/deploy-prod/frontend/dist/index.html`, y **borrar este cron one-shot**.

### 7.2 Confirmar docroot
cPanel → **Domains** → `boveda.lols.cl` → Document Root debe ser `~/public_html/boveda.lols.cl`. Si no,
ajustar `FRONT_DEST` en `scripts/cpanel-deploy-prod.sh` y republicar.

### 7.3 Cron de deploy cada 5 min (`*/5 * * * *`, self-healing)
```
cd /home/lolscl/deploy-prod && git fetch -q origin deploy-prod && git checkout -q -f origin/deploy-prod -- scripts/cpanel-deploy-prod.sh 2>/dev/null; HOME=/home/lolscl GIT_TERMINAL_PROMPT=0 /bin/bash /home/lolscl/deploy-prod/scripts/cpanel-deploy-prod.sh >> /home/lolscl/deploy-prod.log 2>&1
```
Éxito = `~/deploy-prod.log` muestra `… · deploy OK → <sha>` y el hash del bundle en
https://boveda.lols.cl coincide con `~/deploy-prod/frontend/dist/index.html`.

> Gotchas, `api/` y restauración de Passenger: idénticos a §5/§7bis (cambiar rutas a las de prod:
> docroot `boveda.lols.cl`, backend `~/boveda`).
