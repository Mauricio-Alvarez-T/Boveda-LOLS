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
| Base de datos | MySQL · misma instancia, DB `lolscl_testbov` |
| Branch que dispara deploy | `develop` |
| Workflow | `.github/workflows/deploy-cpanel-staging.yml` |

### Runtime
- **Node.js + Phusion Passenger** — cPanel arranca la app con `passenger_wsgi.py` / `app.js` (entry: `index.js`).
- **Reinicio de app:** escribir cualquier cosa en `tmp/restart.txt` dentro del directorio del backend. El deploy lo hace automáticamente via curl FTP.
- **Logs del servidor:** `/boveda/logs/app_YYYY-MM-DD.log` (JSON por línea, rotación a 5 MB).

---

## 2. Flujo de Deploy

### Rama → Entorno
```
develop  →  GitHub Actions  →  Staging  (test.boveda.lols.cl)
main     →  GitHub Actions  →  Producción  (boveda.lols.cl)
```

**Regla fundamental:** nunca hacer merge directo a `main` sin pasar por `develop` + staging primero.

### Qué hace el workflow (mismo patrón en ambos)
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 20)
3. `npm ci` en `/frontend/` → `npm run build` → genera `/frontend/dist/`
4. Instala `lftp` en el runner de Ubuntu
5. **Sincroniza frontend** con `lftp mirror -R --only-newer` hacia el directorio `public_html/` correspondiente
6. **Sincroniza backend** con `lftp mirror -R --only-newer` hacia `/boveda/` o `/test-boveda/`
   - Excluye: `.git*`, `node_modules/`, `tmp/`, `uploads/`, `.env*`
7. **Reinicia Passenger** subiendo un `restart.txt` vía `curl` FTP directo al `tmp/` del backend

### Por qué lftp (y no FTP-Deploy-Action)
`FTP-Deploy-Action` hace un diff completo del directorio remoto al conectar. Con `/boveda/` creciendo por logs/xlsx en runtime, el scan se excedía del timeout del control socket (~60s default). `lftp mirror --only-newer` compara solo timestamps, mucho más rápido. Configuración clave:
```bash
set net:timeout 30
set net:max-retries 3
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
| App da 500 al arrancar | Passenger crasheó al iniciar `index.js`. | Revisar `/boveda/logs/app_YYYY-MM-DD.log` o `/boveda/startup_debug.log`. |
| `env-validator: variable faltante` al arrancar | Falta alguna variable en el `.env` del servidor. | SSH/FTP al servidor, editar `/boveda/.env`, añadir la variable faltante, reiniciar. |
| JWT inválido / login loop | Token de versión de rol desactualizado. | El usuario debe cerrar sesión, borrar `localStorage` (`sgdl_token`, `sgdl_user`), y volver a entrar. |
| Deploy falla con `mirror: Fatal error: max-retries exceeded (Connection refused)` | Error transitorio de conexión FTP al servidor cPanel. El código está bien (Backend Tests CI pasó). | Re-ejecutar solo los jobs fallidos: `gh run rerun RUN_ID --failed`. NO re-commitear ni cambiar código. |
| Imágenes 404 en producción (pero OK en local) | URLs de imagen sin prefijo `/api/`. cPanel proxy solo routea `/api/*` al Node.js. | Asegurarse de servir imagen URL como `/api/uploads/inventario/...`, no `/uploads/...` |
| Sticky header no se pega al scroll | Contenedor intermedio con `overflow-x-hidden` crea un scroll context incorrecto. | El scroll container **real** debe tener `flex-1 min-h-0 overflow-y-auto`. Sticky es relativo a su contenedor scroll más cercano. |

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
└── docs/
    ├── RUNBOOK.md                 ← Este documento
    └── project-brief.md           ← Descripción del proyecto
```

---

*Última actualización: Abril 2026 — Agregan secciones: patrón de layout dinámico (sticky + flex), proxy /api en cPanel, worktrees, nuevos errores comunes.*
