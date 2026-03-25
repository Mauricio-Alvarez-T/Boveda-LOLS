# 🧰 Guía de Troubleshooting - Entorno de Staging (test.boveda.lols.cl)

## Metodología de Diagnóstico Rápido

Cuando algo no funcione en staging (o producción), sigue este flujo de 4 pasos para identificar la causa en menos de 60 segundos.

### Paso 1: ¿El Backend Responde?
Abre en tu navegador: `https://test.boveda.lols.cl/api`
- ✅ **"It works! NodeJS 20.x"** → El backend está vivo. Sigue al Paso 2.
- ❌ **Error 500 / Passenger error** → El backend no arranca. Ve a la sección **[Error: Passenger no inicia](#error-passenger-no-inicia)**.

### Paso 2: ¿La API Devuelve JSON o HTML?
1. Abre DevTools (`F12`) → pestaña **Network**.
2. Haz la acción que falla (ej: login, cargar trabajadores).
3. Busca la petición en la lista (ej: `login`, `trabajadores`).
4. Haz clic en ella → pestaña **Response**.

- ✅ **Ves un JSON** como `{"token":"eyJ..."}` o `{"error":"Credenciales incorrectas"}` → La comunicación frontend↔backend funciona. Sigue al Paso 3.
- ❌ **Ves HTML** como `<!DOCTYPE html>...` → El `.htaccess` está interceptando las llamadas a la API. Ve a **[Error: API devuelve HTML](#error-api-devuelve-html-en-vez-de-json)**.

### Paso 3: ¿Qué Dice la Respuesta?
Lee el JSON de la respuesta:
- `{"error": "Credenciales incorrectas"}` → El usuario no existe en la DB de staging. Ve a **[Error: Usuario no existe](#error-usuario-no-existe-en-staging)**.
- `{"error": "No autorizado"}` o código **403** → Problema de permisos/JWT. Ve a **[Error: Permisos 403](#error-permisos-403)**.
- `{"error": "..."}` con código **500** → Error interno del backend. Revisa los logs de Passenger.

### Paso 4: ¿Hay Datos en la Base de Datos?
Si todo carga pero está vacío, la base de datos de staging no tiene datos. Ve a **[Error: Base de datos vacía](#error-base-de-datos-vacía)**.

---

## Errores Comunes y Soluciones

### Error: Passenger No Inicia
**Síntoma:** Error 500 con mensaje "Web application could not be started by Phusion Passenger"
**Causa:** Faltan las dependencias (`node_modules`) o el archivo de inicio no existe.
**Solución:**
1. Ve a cPanel → **Setup Node.js App**
2. Edita la app `test-boveda`
3. Haz clic en **"Run NPM Install"** y espera que termine
4. Haz clic en **"Restart"**
5. Verifica que `server.js` existe en la raíz de `test-boveda` y contiene `require('./index.js')`

---

### Error: API Devuelve HTML en Vez de JSON
**Síntoma:** El login dice "Bienvenido" pero no redirige. En Network, la respuesta es HTML.
**Causa:** El `.htaccess` del frontend redirige TODO (incluyendo `/api/`) a `index.html`.
**Solución:** Edita `/public_html/test.boveda.lols.cl/.htaccess` y asegúrate de que tenga esta línea **ANTES** de las reglas de React:

```apache
# Excluir la carpeta /api del enrutamiento frontend
RewriteRule ^api/ - [L]
```

El archivo completo debe verse así:
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

> **💡 Pro Tip:** Si no sabes qué poner, copia el `.htaccess` de producción (`/public_html/boveda.lols.cl/`) que ya funciona.

---

### Error: Usuario No Existe en Staging
**Síntoma:** El backend responde JSON pero dice "Credenciales incorrectas".
**Causa:** La base de datos de staging (`lolscl_boveda_test`) está vacía o no tiene los usuarios correctos.
**Solución:**
1. Ve a cPanel → **phpMyAdmin**
2. Selecciona la base `lolscl_boveda_test`
3. Exporta las tablas `usuarios`, `roles`, `permisos_catalogo` y `permisos_rol_v2` desde la base de producción (`lolscl_boveda`) e impórtalas en la de staging.
4. **Alternativa rápida:** Ejecutar el seed/migration del backend si existe.

---

### Error: Permisos 403
**Síntoma:** El usuario entra al dashboard pero al hacer clic en Asistencia u otro módulo da error.
**Causa:** El JWT del usuario no tiene los permisos granulares correctos, o la tabla `permisos_rol_v2` no está sincronizada.
**Solución:**
1. Cierra sesión y vuelve a entrar (esto regenera el JWT con los permisos actuales).
2. Si persiste, verifica en phpMyAdmin que la tabla `permisos_rol_v2` tenga entradas para el rol del usuario.

---

### Error: Base de Datos Vacía
**Síntoma:** Todo carga pero no hay trabajadores, obras, ni cargos.
**Causa:** La base de datos de staging no tiene datos semilla.
**Solución:** Exporta las tablas maestras de producción (obras, cargos, empresas, trabajadores) e impórtalas en staging.

---

## Regla de Oro para Copiar de Producción

Cuando la configuración de staging no funcione, **mira cómo está configurado `boveda.lols.cl`** (producción) y replica:

| Componente | Producción | Staging |
|---|---|---|
| Frontend | `/public_html/boveda.lols.cl/` | `/public_html/test.boveda.lols.cl/` |
| Backend | `/home/lolscl/boveda/` | `/home/lolscl/test-boveda/` |
| Base de datos | `lolscl_boveda` | `lolscl_boveda_test` |
| .htaccess frontend | Copiar de producción | Pegar aquí |
| Node.js App | `boveda.lols.cl/api` | `test.boveda.lols.cl/api` |

---

## Estado Actual del Staging (25-03-2026)

| Componente | Estado | Notas |
|---|---|---|
| ✅ Subdominio | Activo | `test.boveda.lols.cl` |
| ✅ Node.js App | Corriendo | Node 20.19.4, Passenger activo |
| ✅ `.env` | Configurado | DB, JWT, SMTP |
| ✅ `.htaccess` | Corregido | API excluida del enrutamiento React |
| ✅ NPM Install | Ejecutado | Dependencias instaladas |
| ⚠️ Base de datos | Vacía | Necesita importar usuarios y datos desde producción |
| ⚠️ Login | No funciona | Porque no hay usuarios en `lolscl_boveda_test` |
