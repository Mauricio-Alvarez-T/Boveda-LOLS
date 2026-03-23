# 🔧 Guía de Troubleshooting — Bóveda LOLS

Referencia rápida para diagnosticar y resolver los errores más comunes en producción.

---

## Error 500 - "Internal Server Error" (Pantalla de Passenger)

**Síntoma:** Toda la app devuelve la página de Phusion Passenger con error 500.

**Diagnóstico rápido:**
1. Ir a cPanel → Administrador de Archivos → `/boveda/error_debug.log`
2. Si no existe ese archivo, revisar `/boveda/logs/app_YYYY-MM-DD.log`
3. Si tampoco existe, ir a `/boveda/startup_debug.log`

**Causas comunes:**
- **Metadata Lock en MySQL:** Un `ALTER TABLE` en el arranque bloqueó el pool. Solución: comentar el bloque de auto-alteración en `index.js`.
- **Módulo faltante:** Un `require()` a un archivo que no existe. Solución: verificar que todos los archivos referenciados estén presentes en el directorio `/boveda/src/`.
- **Error de sintaxis JS:** Ejecutar `node -c index.js` localmente antes de subir.

---

## Error 403 - "Permiso Denegado"

**Síntoma:** El usuario puede iniciar sesión pero ciertas vistas devuelven 403.

**Diagnóstico rápido:**
1. Ir a `boveda.lols.cl/api/debug/token` (requiere Super Admin).
2. Verificar que el array `permisos` contenga las claves esperadas (ej: `asistencia.ver`).
3. Si el array está vacío, la tabla `permisos_catalogo` en MySQL podría estar vacía.

**Solución:**
```bash
# En cPanel > Setup Node.js App > Run Script
node migrate_granular_permissions.js
```

---

## Login en Bucle Infinito

**Síntoma:** El botón de iniciar sesión se queda cargando, o inicia sesión y vuelve al login.

**Diagnóstico:**
1. Abrir DevTools del navegador → Network → Filtrar por `api`
2. Si las peticiones a `/api/auth/login` no responden: el backend está caído (ver Error 500 arriba)
3. Si responden con 401 con `expired_by_version: true`: la versión del rol fue incrementada. **Solución:** cerrar sesión, borrar localStorage, y volver a entrar.

**Solución nuclear:**
```
localStorage.removeItem('sgdl_token');  
localStorage.removeItem('sgdl_user');  
location.reload();
```

---

## Dashboard Vacío (KPIs en 0)

**Síntoma:** El Dashboard carga pero todos los contadores están en 0.

**Causa:** El endpoint `/api/dashboard/summary` usa los permisos del JWT para decidir qué mostrar. Si el token del usuario no incluye permisos del módulo correcto, se saltea las consultas.

**Solución:** Cerrar sesión y volver a entrar para obtener un token fresco.

---

## Vista de Asistencia "Error al cargar datos"

**Posibles causas:**
1. El permiso `asistencia.ver` no está en el JWT del usuario.
2. El backend devuelve 500 por una consulta SQL mal formada.

**Diagnóstico:** Revisar `/boveda/logs/app_YYYY-MM-DD.log` buscando `[ERROR]` y la URL `/api/asistencias`.

---

## Endpoints de Diagnóstico (Solo Super Admin)

| Endpoint | Descripción |
|---|---|
| `GET /api/health` | Health check básico (sin auth) |
| `GET /api/health/deep` | Verifica DB, permisos, JWT, memoria |
| `GET /api/debug/token` | Decodifica el JWT actual del usuario |
| `GET /api/debug/routes` | Lista todas las rutas registradas en Express |

---

## Logs

Los logs del sistema se encuentran en:
- **Logs estructurados:** `/boveda/logs/app_YYYY-MM-DD.log` (JSON por línea)
- **Errores legacy:** `/boveda/error_debug.log`
- **Crash de arranque:** `/boveda/startup_debug.log`

Los logs se rotan automáticamente al superar 5 MB.
