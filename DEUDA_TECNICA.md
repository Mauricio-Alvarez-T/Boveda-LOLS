# 📉 Backlog de Deuda Técnica - Bóveda LOLS

Este documento fue generado para registrar los puntos críticos de deuda técnica identificados en el código y servir como hoja de ruta cuando se decida asignar tiempo a refactorizar. 

## 1. Componentes Frontend Gigantes (Deuda de Arquitectura) 🏛
*   **Problema:** Archivos como `Attendance.tsx` (>1,800 líneas) y `Consultas.tsx` (~1,000 líneas) concentran demasiadas responsabilidades (estado, llamadas API, lógica de UI, múltiples Modales y grillas complejas). Esto rompe el "Principio de Responsabilidad Única" (SRP).
*   **Impacto:** Riesgo alto de crear conflictos durante fusiones (*merges*), dificultad de lectura para el mantenimiento y mayor probabilidad de *bugs* silenciosos.
*   **Solución Propuesta:** Extraer las sub-secciones (modales, grillas, paneles laterales de filtros) hacia pequeños componentes independientes que consuman propiedades (`props`) de un archivo padre más liviano.

## 2. Abuso del Tipo `any` en TypeScript (Deuda de Tipado) 🔠
*   **Problema:** El linter ha detectado más de **160 instancias** donde se usa explícita o implícitamente el tipo `any` (visible fuertemente en `Settings.tsx` y `logNormalizer.ts`). 
*   **Impacto:** Al declarar `any`, TypeScript apaga sus alertas de error, anulando por completo la ventaja de usar este lenguaje. La IA asume estructuras incorrectas y el desarrollador no se da cuenta hasta que la App truena en el navegador.
*   **Solución Propuesta:** Realizar un "barrido" de tipos cambiando los parámetros genéricos a instancias reales (ej. usar la interface `Trabajador`, o firmar bien qué requiere un componente).

## 3. Pruebas Manuales vs Automatizadas (Deuda de Testing) 🧪
*   **Problema:** El backend contiene archivos como `test-api.js` o `test_db.js`, que requieren que un humano los ejecute e interprete en crudo.
*   **Impacto:** Un cambio en el motor de permisos podría romper la visualización de asistencias de forma colateral sin que nadie se entere hasta recibir una queja en Producción.
*   **Solución Propuesta:** Incorporar *Jest* (que ya tiene un archivo estático de configuración presente) para hacer una pequeña "Suite de Pruebas". Es decir, código que pruebe nuestro código de forma predictiva con comandos como `npm test`.

## 4. Consultas SQL *Raw* Dispersas 💾
*   **Problema:** Los Controladores de Node.js tienen las secuencias `SELECT / UPDATE / INSERT` integradas directamente dentro de la lógica.
*   **Impacto:** Larga curva de adaptación, riesgo de SQL Injections si falla la sanitización, y mucha lentitud para editar tablas si cambian las columnas en un futuro.
*   **Solución Propuesta:** (A mediano plazo) Adaptar esos bloques de código hacia un estándar modular o aplicar la integración sistemática de un ORM.
