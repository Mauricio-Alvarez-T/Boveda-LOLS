# 📉 Estado de Deuda Técnica y Seguridad - Bóveda LOLS

Este documento registra los puntos críticos de deuda técnica, las vulnerabilidades de seguridad detectadas y el progreso de las correcciones realizadas. Es la hoja de ruta para el mantenimiento del sistema.

---

## 🌩️ Reporte de Handover (Última Sincronización: 2026-04-06)
- **Sincronización Git**: Local al día con `origin/develop` y `origin/main`.
- **Nuevas Dependencias**: Se requiere `npm install` en la carpeta `backend` en entornos nuevos (instaladas: `helmet`, `express-rate-limit`).

---

## ✅ Fase 1: Correcciones de Seguridad (COMPLETADO)

Se han resuelto los siguientes puntos críticos que ponían en riesgo la integridad del sistema:

### 1. Eliminación de Secretos Hardcodeados 🔐
*   **Problema**: El servicio de asistencia tenía un secreto JWT fallback ('super_secret_key_12345') en caso de falta de variable de entorno. Peligro de forja de tokens.
*   **Solución**: Se eliminó el fallback. Ahora el sistema falla intencionalmente si no hay `JWT_SECRET` configurado.
*   **Archivo**: `backend/src/services/asistencia.service.js`

### 2. Validador de Entorno (`env-validator.js`) 🚦
*   **Problema**: El servidor iniciaba incluso con configuraciones críticas faltantes.
*   **Solución**: Nuevo middleware de arranque que valida `JWT_SECRET`, `DB_HOST`, `DB_USER` y `DB_NAME`.
*   **Archivo**: `backend/src/config/env-validator.js` (Inyectado en `index.js`).

### 3. Prevención de Inyecciones SQL (Whitelisting de Campos) 🛡️
*   **Problema**: Los métodos `update` y `create` permitían cualquier clave JSON enviada por el cliente, lo que podía usarse para inyectar sentencias SQL en los nombres de columna.
*   **Solución**: Se implementó un sistema de whitelist en `asistencia.service.js` y `crud.service.js`. Ahora solo se procesan columnas legítimas de la base de datos.
*   **Archivo**: `backend/src/services/crud.service.js` y `index.js` (Configuración de whitelists).

### 4. Middleware de Seguridad (Helmet + Rate Limit) 🛰️
*   **Problema**: Falta de cabeceras seguras y exposición a ataques de fuerza bruta.
*   **Solución**: Integración de `helmet` para headers HTTP y `express-rate-limit` para limitar peticiones (100 cada 15 min por IP).
*   **Archivo**: `backend/index.js`

---

## 🛠️ Fase 2: Arquitectura y Limpieza (FUTURO)

### 1. Extracción de Migraciones Inline 🏗️
*   **Problema**: `index.js` realiza cambios de esquema (`ALTER TABLE`, `UPDATE`) en cada arranque.
*   **Impacto**: Mezcla de responsabilidades y falta de control de versiones de BD.
*   **Solución**: Mover las migraciones a un script independiente `scripts/maintenance.js` que se ejecute opcionalmente (`npm run migrate`).

### 2. Saneamiento de Raíz de Backend 🧹
*   **Problema**: Proliferación de 19+ scripts de prueba y temporales sueltos en la raíz de `/backend/`.
*   **Solución**: Mover a `scripts/debug/` o eliminar los obsoletos para reducir ruido.

### 3. Refactorización de Componentes Gigantes 🏛️
*   **Problema**: `Attendance.tsx` (1,697 líneas) y `asistencia.service.js` (1,595 líneas) centralizan demasiada lógica.
*   **Solución**: Descomponer en sub-componentes y hooks personalizados en el frontend, y en servicios especializados en el backend.

---

## 🔠 Deuda de Tipado (En progreso)
*   **Análisis Real**: Se encontraron ~51 instancias de `any` en el frontend, no 160+.
*   **Prioridad**: Definir interfaces formales para `Trabajador`, `Obra`, `Empresa`, `Asistencia` y `Estado` en `types/index.ts` para eliminar el uso de `any` en props y estados.

---

## 🧪 Deuda de Testing
*   **Estado**: Existen 5 tests Jest funcionales en `backend/tests/`.
*   **Meta**: Expandir la suite para cubrir los endpoints de seguridad recién agregados y automatizar la ejecución mediante CI/CD.

---

## 🚀 Cómo continuar en otra computadora
1. Clonar el repositorio.
2. `cd backend && npm install`
3. Asegurarse de que el `.env` tenga:
    *   `JWT_SECRET` (Misma clave si quieres validar tokens viejos).
    *   `FRONTEND_URL` (Para CORS).
    *   Configuración correcta de MySQL Local.
4. `npm run dev`
