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

*Última actualización: Abril 2026 — Agregan: § 14 Historial de Actividad (refactor completo Sprints 1-4 + ENTIDAD_RESOLVERS + endpoints filtros y export CSV).*
