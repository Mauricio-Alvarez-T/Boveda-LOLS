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
- **Git™ Version Control** (sección *Files*) → necesario para el **Camino B** (clone por UI).
- **Cron Jobs** (sección *Advanced*) → **obligatorio** en ambos caminos.
- **File Manager** → para leer logs si no hay Terminal.

Si NO hay ni Terminal ni Git Version Control, el pull-side no se puede armar por panel → escalar al
hosting para habilitar uno de los dos (o pedir acceso SSH).

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

## 4. El CRON (ambos caminos)

### 4.1 Comando exacto
cPanel → **Cron Jobs** → **Add New Cron Job**:
- **Common Settings:** "Every 5 Minutes" (o campos: `*/5 * * * *`).
- **Command** (en cPanel se escribe SOLO la parte del comando; los 5 campos de tiempo van en los selectores):
```
/bin/bash ~/deploy-staging/scripts/cpanel-deploy-staging.sh >> ~/deploy-staging.log 2>&1
```

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

> **Clave sobre el cron y la rama:** el script NO hace `checkout`; hace
> `git fetch origin deploy-staging` + `git reset --hard origin/deploy-staging`. **El clone DEBE estar
> en la rama `deploy-staging`** para que funcione correctamente.

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

## 7. Producción (contexto — hoy sigue por FTP)

Prod (`main` → `boveda.lols.cl`) usa todavía FTP `lftp`. El plan es replicar este playbook con la rama
`deploy-main`, clone en `~/deploy-main`, docroot `~/public_html/boveda.lols.cl`, backend `~/boveda` y un
script gemelo `scripts/cpanel-deploy-prod.sh` (se crea en la Fase 2, una vez staging quede validado).
Mientras tanto, si el FTP de prod da `Connection refused`: cPanel → **Security → cPHulk Brute Force
Protection** → revisar/desbloquear las IPs baneadas del runner (o esperar a que el ban expire), o
subir por **File Manager** (HTTPS, no afectado por el ban FTP) como stopgap.
