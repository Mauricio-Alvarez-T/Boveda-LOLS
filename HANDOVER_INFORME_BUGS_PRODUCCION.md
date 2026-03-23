# INFORME TÉCNICO DE HANDOVER - BÓVEDA LOLS (RESOLUCIÓN DE ERRORES EN PRODUCCIÓN)

Este documento ha sido generado para servir de contexto y bitácora exacta a cualquier ingeniero o Asistente de IA que asuma la depuración del proyecto **Bóveda LOLS**. Detalla cronológicamente la cacería de un Error 500 persistente en el servidor cPanel de producción (Phusion Passenger + Node.js) y la cascada de fallos de encadenamiento descubiertos a raíz de un "refactor a medias" del sistema de permisos.

---

## 📅 Estado Final Documentado
- **Fecha de Corte:** 23 de Marzo, 2026.
- **Síntoma Inicial:** La aplicación web arrojaba un "Error 500 Internal Server Error" instantáneo que impedía procesar cualquier petición (incluyendo cargar la página o iniciar sesión).
- **Estado Actual:** El servidor Node.js carga correctamente, el Frontend en React se muestra sin Loading Infinitos y permite iniciar sesión. Sin embargo, hay **vistas (Ej: Asistencia, Consultas)** que aparentemente siguen sin mostrar datos o retornando "Error al cargar datos" por problemas residuales de la migración de permisos.

---

## 🔍 RESUMEN DE HALLAZGOS Y FIXES APLICADOS (CRONOLOGÍA)

### 1. Bloqueo de Base de Datos (Metadata Lock)
- **Problema:** En `index.js`, había un bloque de código autoejecutable (IIFE) dedicado a realizar alteraciones estructurales (`ALTER TABLE trabajadores`) en el arranque. Esto ocasionó un "Metadata Lock" en MySQL de producción, colapsando el pool de conexiones y dejando la base de datos inaccesible por tiempo de espera (Timeout).
- **Solución:** Se comentó el script `ALTER TABLE` del `index.js` para permitir la libre conexión al pool.

### 2. Visibilidad Nula de Errores (El Puente `debug.php`)
- **Problema:** Debido a que el entorno `nodevenv` de cPanel con Phusion Passenger enmascaraba los errores asíncronos bajo un genérico "500", no se podía leer qué línea de código detenía NodeJS.
- **Acción:** Desarrollé un script llamado `debug.php` en la carpeta public que forzaba la lectura de los logs nativos del sistema en `stderr.log` y `startup_app.log`. Esto nos devolvió la visión de los `stack traces` reales en la consola.

### 3. Falla Fatal: Firma Rota en Rutas CRUD
- **Problema:** El log reveló `Error: Route.get() requires a callback function but got a [object Undefined]`.
- **Causa:** En un commit reciente enfocado en permisos granulares, alguien reescribió `crud.routes.js` para recibir "Controladores Instanciados" `(controller, permisos = {})`. Sin embargo, olvidó actualizar el archivo principal `index.js`, el cual continuaba inyectando texto plano `('empresas', 'empresas')`. Esto causaba que Expres intentara ejecutar métodos de string inexistentes, matando instantáneamente la app.
- **Solución:** Modifiqué `crud.routes.js` a su versión híbrida: si detecta strings legacy desde `index.js`, inyecta y crea los controladores dinámicamente de sus respectivos servicios.

### 4. Falla Fatal: Dependencia Fantasma (`usuarios.service`)
- **Problema:** Tras curar el CRUD general, el servidor volvió a reventar. Log: `Error: Cannot find module '../services/usuarios.service'`.
- **Causa:** El archivo `usuarios.routes.js` fue reconfigurado masivamente pero exigía (`require`) el archivo `usuarios.service.js`, el cual **nunca fue creado ni subido al repositorio**.
- **Solución:** En lugar de crear un archivo inútil con un envoltorio genérico, construí el `crud.service('usuarios')` dinámicamente dentro de la declaración del `usuarios.routes.js`, eliminando la dependencia rota y arreglando el comando de eliminado obsoleto (softDelete vs delete).

### 5. API Enjaulada: Error 403 Generalizado y el Catálogo Vacío
- **Acontecimiento Clave:** El servidor encendió. El Login en React funcionó, y cargó el Dashboard. Pero las vistas "Asistencias", "Consultas" y "Configuración" devolvían Error 403 (Permiso Denegado).
- **Causa 1 (Base de Datos Vacía):** El nuevo sistema granular leía desde una tabla maestra `permisos_catalogo` en MySQL. Esta tabla nunca fue poblada en producción porque nadie corrió el script de migración, otorgando exactamente 0 permisos al rol Super Administrador.
- **Fix Aplicado:** Inyecté el comando `"migrate": "node migrate_granular_permissions.js"` al `package.json` para que el usuario pudiera ejecutarlo desde un solo clic desde la interfaz de cPanel Node.js App.

### 6. Error Cautivo: Hardcoded Legacy Strings en Asistencias y Fiscalización
- **Causa 2 (Nombres desactualizados):** Aún con la DB poblada, la página de Asistencias regresaba "403 Forbidden". Al analizar los controladores, me percaté que las rutas manuales (`asistencias.routes.js` y `fiscalizacion.routes.js`) aún exigían el validador antiguo: `checkPermission('asistencia', 'puede_ver')`. El nuevo catálogo migrado en DB usa el formato atómico `asistencia.ver`. El validador jamas hacía match.
- **Fix Aplicado:** Aplicamos una sustitución multi-bloque transformando docenas de firmas obsoletas al estándar moderno (ej: a `checkPermission('asistencia.ver')`, `'documentos.ver'`, etc.)

### 7. Colisión de Rutas Categórica (El 500 en GET /api/usuarios)
- **Problema:** Consultas intentaba cargar y devolvía un Error 500 Internal Server Error porque un endpoint se reventaba buscando una función inexistente (`emailService.getConfig is not a function`).
- **Causa:** En `index.js`, el nuevo y desprolijo enrutador de correos fue montado explícita y erróneamente sobre `/api/usuarios`. Esto interceptaba y secuestraba todas las llamadas normales al listado de trabajadores o perfiles.
- **Fix Aplicado:** Corregí el `app.use` moviendo la ruta usurpadora a `/api/usuarios/me/email-config` y liberando la ruta original de usuarios. Adicionalmente, creé un puente (Alias) para `/roles/list` que estaba dando Error 404 a otra tabla de consultas React.

---

## 🛠 CONSEJOS E INSTRUCCIONES PARA LA PRÓXIMA IA (YOUR NEXT STEPS)

Hola colega IA! Si estás leyendo esto, lograste traer el servidor Node.js desde la muerte hasta el punto en el que acepta conexiones TCP y carga el Frontend React en producción.

El usuario experimentó que **"No funcionó, la vista de asistencias sigue sin cargar datos"** luego del gran parche final. 
A pesar de que todas las variables del backend fueron saneadas con los catálogos nuevos, existen altas probabilidades de que algo de la capa de Auth o la Base de Datos todavía no reaccione. 

**Aquí tienes mi Check-List mental para que empieces:**

1. **Revisa el Backend Migration Success:** El usuario indicó que presionó "migrate" por la UI de cPanel. Asegúrate de que los permisos efectivamente se guardaron. Si puedes, haz que el usuario extraiga por PHP qué roles y llaves están registradas para `rol_id = 1` en la tabla `permisos_rol_v2`.
2. **Revisa el JWT de Sesión:** Cuando el usuario hace el POST a `/api/auth/login`, el backend construye los permisos combinando los roles en el servicio `permisos.service.js`. Verifica si el array `user.permisos` devuelto al frontend o encriptado dentro del payload JWT incluye las cadenas verdaderas `'asistencia.ver'`. Si los permisos llegan vacíos al token, el middleware RBAC siempre tirará 403 no importando si las rutas ya tienen el formato arreglado.
3. **Persistencia Frontend y Caché:** Pide al usuario que verifique en el Application local storage de Google Chrome (`sgdl_token`). El backend no propaga retroactivamente nuevos JWT si no se hace "logout". Si el cliente react no destruyó el viejo loggueo, sigue usando credenciales sin permisos de migración. (A veces un forzado de Hard Reload salva vidas).
4. **Verifica API URL en React (`api.ts`):** Las rutas no nativas podrían haber sido modificadas en el Frontend. Investiga en los Developer Tools del usuario a qué rutas exactas intentan acceder (falla `404 Not Found` recurrente en `/config-horarios/obra/17`). 

*Buena suerte y que las arquitecturas escalables estén contigo.* 🚀
