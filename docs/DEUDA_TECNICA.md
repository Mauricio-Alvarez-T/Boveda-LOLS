# 📉 Estado de Deuda Técnica y Seguridad - Bóveda LOLS

Este documento registra los puntos críticos de deuda técnica, las vulnerabilidades de seguridad detectadas y el progreso de las correcciones realizadas. Es la hoja de ruta para el mantenimiento del sistema.

---

## ✅ Fase 1: Correcciones de Seguridad (COMPLETADO — Marzo 2026)

Se resolvieron los siguientes puntos críticos:

### 1. Eliminación de Secretos Hardcodeados 🔐
*   **Problema**: Secreto JWT fallback hardcodeado en `asistencia.service.js`.
*   **Solución**: Eliminado. El sistema falla intencionalmente si no hay `JWT_SECRET`.

### 2. Validador de Entorno (`env-validator.js`) 🚦
*   **Problema**: El servidor iniciaba con configuraciones críticas faltantes.
*   **Solución**: Middleware de arranque que valida `JWT_SECRET`, `DB_HOST`, `DB_USER` y `DB_NAME`.

### 3. Prevención de Inyecciones SQL (Whitelisting) 🛡️
*   **Problema**: Los métodos `update` y `create` permitían cualquier clave JSON del cliente.
*   **Solución**: Sistema de whitelist en `asistencia.service.js` y `crud.service.js`.

### 4. Middleware de Seguridad (Helmet + Rate Limit) 🛰️
*   **Problema**: Falta de cabeceras seguras y exposición a fuerza bruta.
*   **Solución**: `helmet` para headers HTTP y `express-rate-limit` (100 req/15min/IP).

---

## ✅ Fase 2: Arquitectura y Limpieza (COMPLETADO — Abril 2026)

### 1. Extracción de Migraciones Inline 🏗️ ✅
*   Las migraciones se movieron a `scripts/migrate.js` con runner independiente.

### 2. Refactorización de Componentes Gigantes 🏛️ ✅
*   `Attendance.tsx` fue descompuesto en sub-componentes y hooks personalizados.
*   `Consultas.tsx` fue modularizado: `FilterPanel` y `CreatePanel` extraídos.
*   `Resumen` de inventario fue modularizado: `ResumenTableDesktop`, `ResumenMobileList` extraídos.

---

## 🔠 Deuda de Tipado (En progreso)
*   **Análisis Real**: Se encontraron ~51 instancias de `any` en el frontend.
*   **Prioridad**: Definir interfaces formales para `Trabajador`, `Obra`, `Empresa`, `Asistencia` y `Estado` en `types/index.ts` para eliminar el uso de `any`.

---

## 🧪 Deuda de Testing
*   **Estado**: Suite de tests Jest funcional en `backend/tests/` (~130+ tests).
*   **Meta**: Expandir cobertura al frontend y automatizar ejecución en CI/CD.

---

*Última actualización: Abril 2026*
