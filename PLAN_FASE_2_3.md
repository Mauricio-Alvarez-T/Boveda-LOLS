# Plan de Refactorización: Desmembramiento Modular (Fase 2.3)

Este documento ha sido generado para conservar el contexto y estado actual del proyecto antes de realizar un cambio de máquina, asegurando la continuidad exacta de la auditoría de deuda técnica.

## Estado Actual (Contexto)
Tras finalizar exitosamente las fases de **Seguridad**, **Arquitectura de Scripts** y la **Erradicación de `any` (Tipado TypeScript)**, el compilador reporta 0 errores de tipado explícito. Sin embargo, el linter de react expuso un problema grave de rendimiento arquitectónico ("Deuda de React"): **Componentes creados dentro del render method**.

## El Problema: "Deuda Mono-Componente"
Actualmente tenemos "Monolitos" (archivos gigantes) que declaran componentes hijos *dentro* de la función madre principal. Esto fuerza a React a destruir y re-crear dichos sub-componentes desde cero en cada ciclo de render, quemando memoria e imposibilitando optimizaciones (virtual DOM diffing ineficiente). 

Focos principales de infección:
1. 📄 `frontend/src/pages/Consultas.tsx` (Más de 1,000 líneas)
    * `FilterPanel` (declarado en la línea 264, violando `react-hooks/static-components`)
    * `CreatePanel` (declarado en la línea 344)
2. 📄 `frontend/src/pages/Attendance.tsx` (Más de 1,700 líneas)
    * Formularios y paneles declarados asíncronamente en el cuerpo del render gigante.

## Hoja de Ruta Sugerida (Para Ejecutar en la Siguiente Sesión)

### 1. Refactor Quirúrgico de Consultas
- Crear carpeta `frontend/src/components/consultas/`
- Extraer `FilterPanel` hacia `FilterPanel.tsx`
  - *Desafío esperado*: `FilterPanel` usa estados locales de Consultas (ej: `activeFilterCount`). Deberán pasarse como *Props* o migrarse al Custom Hook `useConsultasFilters`.
- Extraer `CreatePanel` hacia `CreatePanel.tsx`

### 2. Refactor Masivo de Asistencias (Attendance.tsx)
- Analizar las líneas del archivo para aislar modales secundarios.
- Mover secciones estáticas a `frontend/src/components/attendance/`.

### 3. Verificación
- Correr `npx eslint src/ --ext .ts,.tsx` y verificar que el error `react-hooks/static-components` desaparezca por completo.
- Validar ruteo y estados de memoria al abrir la pestaña de "Consultas".

---
> **Nota de IA:** Al retomar el trabajo en la otra máquina, pide a la IA leer este archivo introduciendo el prompt: *"Revisa el archivo `PLAN_FASE_2_3.md` para recuperar nuestro contexto operativo y armar el Implementation Plan".*
