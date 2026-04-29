# 🔧 Guía de Troubleshooting — Bóveda LOLS

Referencia rápida para diagnosticar y resolver los errores más comunes en **producción** y **staging**.

---

## Metodología de Diagnóstico Rápido (4 pasos)

Cuando algo no funcione, sigue este flujo para identificar la causa en menos de 60 segundos.

### Paso 1: ¿El Backend Responde?
Abre en tu navegador la URL base de la API:
- **Producción:** `https://boveda.lols.cl/api`
- **Staging:** `https://test.boveda.lols.cl/api`

| Resultado | Acción |
|---|---|
| ✅ `"It works! NodeJS 20.x"` | Backend vivo. Sigue al Paso 2 |
| ❌ Error 500 / Passenger error | Backend no arranca. Ve a [Error 500](#error-500---internal-server-error) |

### Paso 2: ¿La API Devuelve JSON o HTML?
1. Abre DevTools (`F12`) → pestaña **Network**.
2. Haz la acción que falla (ej: login, cargar trabajadores).
3. Busca la petición → pestaña **Response**.

| Resultado | Acción |
|---|---|
| ✅ JSON (`{"token":"eyJ..."}`) | Comunicación frontend↔backend OK. Sigue al Paso 3 |
| ❌ HTML (`<!DOCTYPE html>...`) | `.htaccess` intercepta la API. Ve a [API devuelve HTML](#error-api-devuelve-html-en-vez-de-json) |

### Paso 3: ¿Qué Dice la Respuesta?
| JSON | Diagnóstico |
|---|---|
| `{"error": "Credenciales incorrectas"}` | Usuario no existe en la BD del entorno. Ve a [Usuario no existe](#error-usuario-no-existe) |
| `{"error": "No autorizado"}` / código 403 | Problema de permisos/JWT. Ve a [Permisos 403](#error-403---permiso-denegado) |
| `{"error": "..."}` con código 500 | Error interno del backend. Revisa los logs |

### Paso 4: ¿Hay Datos en la Base de Datos?
Si todo carga pero está vacío, la base de datos no tiene datos. Ve a [Base de datos vacía](#error-base-de-datos-vacía).

---

## Errores Comunes y Soluciones

### Error 500 - "Internal Server Error"

**Síntoma:** Toda la app devuelve la página de Phusion Passenger con error 500.

**Diagnóstico rápido:**
1. Revisar logs: `/boveda/logs/app_YYYY-MM-DD.log` (producción) o `/test-boveda/logs/` (staging)
2. Si no existen: `/boveda/error_debug.log` o `/boveda/startup_debug.log`

**Causas comunes:**

| Causa | Solución |
|---|---|
| **Metadata Lock en MySQL** — un `ALTER TABLE` bloqueó el pool | Comentar auto-alteraciones en `index.js` |
| **Módulo faltante** — un `require()` a archivo inexistente | Verificar archivos en `src/` |
| **Error de sintaxis** | Ejecutar `node -c index.js` localmente |
| **Dependencias no instaladas** (staging) | cPanel → Setup Node.js App → Run NPM Install → Restart |
| **`server.js` no existe** (staging) | Verificar que existe en raíz de `test-boveda` con `require('./index.js')` |

---

### Error 403 - "Permiso Denegado"

**Síntoma:** El usuario puede iniciar sesión pero ciertas vistas devuelven 403.

**Diagnóstico rápido:**
1. Ir a `/api/debug/token` (requiere Super Admin).
2. Verificar que el array `permisos` contenga las claves esperadas (ej: `asistencia.ver`).
3. Si el array está vacío, la tabla `permisos_catalogo` podría estar vacía.

**Solución:**
```bash
# En cPanel > Setup Node.js App > Run Script
node migrate_granular_permissions.js
```

Si persiste después de migrar:
1. Cerrar sesión y volver a entrar (regenera el JWT con permisos actuales).
2. Verificar en phpMyAdmin que `permisos_rol_v2` tenga entradas para el rol del usuario.

---

### Error: API Devuelve HTML en Vez de JSON

**Síntoma:** El login dice "Bienvenido" pero no redirige. En Network, la respuesta es HTML.

**Causa:** El `.htaccess` del frontend redirige TODO (incluyendo `/api/`) a `index.html`.

**Solución:** Editar el `.htaccess` del entorno afectado:
- Producción: `/public_html/boveda.lols.cl/.htaccess`
- Staging: `/public_html/test.boveda.lols.cl/.htaccess`

Debe contener esta línea **ANTES** de las reglas de React:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # PRIMERO: Excluir /api del frontend
  RewriteRule ^api/ - [L]

  # DESPUÉS: Enrutamiento de React
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME} !-l
  RewriteRule . /index.html [L]
</IfModule>
```

> **💡 Pro Tip:** Si no sabes qué poner, copia el `.htaccess` de producción que ya funciona.

---

### Login en Bucle Infinito

**Síntoma:** El botón de login se queda cargando, o inicia sesión y vuelve al login.

**Diagnóstico:**
1. DevTools → Network → Filtrar por `api`
2. Si las peticiones a `/api/auth/login` no responden: el backend está caído (ver Error 500)
3. Si responden con 401 con `expired_by_version: true`: versión del rol fue incrementada.

**Solución nuclear:**
```javascript
localStorage.removeItem('sgdl_token');
localStorage.removeItem('sgdl_user');
location.reload();
```

---

### Dashboard Vacío (KPIs en 0)

**Síntoma:** El Dashboard carga pero todos los contadores están en 0.

**Causa:** El endpoint `/api/dashboard/summary` usa los permisos del JWT para decidir qué mostrar. Si el token no incluye permisos del módulo correcto, se saltea las consultas.

**Solución:** Cerrar sesión y volver a entrar para obtener un token fresco.

---

### Vista de Asistencia "Error al cargar datos"

**Posibles causas:**
1. El permiso `asistencia.ver` no está en el JWT del usuario.
2. El backend devuelve 500 por una consulta SQL mal formada.

**Diagnóstico:** Revisar logs buscando `[ERROR]` y la URL `/api/asistencias`.

---

### Error: Usuario No Existe

**Síntoma:** El backend responde JSON pero dice "Credenciales incorrectas".

**Causa:** La base de datos del entorno no tiene los usuarios correctos (frecuente en staging).

**Solución:**
1. cPanel → phpMyAdmin → seleccionar la BD del entorno
2. Exportar `usuarios`, `roles`, `permisos_catalogo`, `permisos_rol_v2` desde producción
3. Importar en la BD del entorno afectado
4. **Alternativa:** Ejecutar el seed/migration del backend si existe

---

### Error: Base de Datos Vacía

**Síntoma:** Todo carga pero no hay trabajadores, obras, ni cargos.

**Causa:** La base de datos no tiene datos semilla.

**Solución:** Exportar tablas maestras de producción (obras, cargos, empresas, trabajadores) e importar en el entorno afectado.

---

## Endpoints de Diagnóstico (Solo Super Admin)

| Endpoint | Descripción |
|---|---|
| `GET /api/health` | Health check básico (sin auth) |
| `GET /api/health/deep` | Verifica DB, permisos, JWT, memoria |
| `GET /api/debug/token` | Decodifica el JWT actual del usuario |
| `GET /api/debug/routes` | Lista todas las rutas registradas en Express |

---

## Referencia de Entornos

| Componente | Producción | Staging |
|---|---|---|
| Frontend | `/public_html/boveda.lols.cl/` | `/public_html/test.boveda.lols.cl/` |
| Backend | `/home/lolscl/boveda/` | `/home/lolscl/test-boveda/` |
| Base de datos | `lolscl_boveda` | `lolscl_boveda_test` |
| Node.js App URL | `boveda.lols.cl/api` | `test.boveda.lols.cl/api` |

---

## Logs

| Tipo | Ruta |
|---|---|
| Logs estructurados | `/boveda/logs/app_YYYY-MM-DD.log` (JSON por línea) |
| Errores legacy | `/boveda/error_debug.log` |
| Crash de arranque | `/boveda/startup_debug.log` |

Los logs se rotan automáticamente al superar 5 MB.

---

*Última actualización: Abril 2026*
