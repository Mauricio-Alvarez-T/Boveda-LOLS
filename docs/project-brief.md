# Project Brief: Sistema de Gestión de Documentación Laboral (SGDL)

## Problem Statement
**Who**: Jefes de Prevención de Riesgos, Supervisores de Obra e Inspectores del Trabajo.
**What**: Necesidad de centralizar, normalizar y exportar rápidamente documentación crítica de trabajadores ante fiscalizaciones.
**Where**: Obras de construcción o servicios con alta movilidad de personal y múltiples razones sociales (empresas).
**When**: Durante inspecciones de rutina o procesos de traslado de personal.
**Why**: Evitar multas por documentación faltante o ilegible, reducir el tiempo de respuesta ante fiscalizadores y asegurar que la carpeta del trabajador esté siempre al día independientemente de su ubicación física.
**Current State**: Gestión probablemente manual o dispersa, documentos en múltiples formatos (imágenes, PDFs pesados), dificultad para agrupar archivos por obra/empresa rápidamente.

## Constraints

### Technical
- **Normalización**: Conversión obligatoria de todo archivo a PDF.
- **Nomenclatura Automática**: `RUT_Trabajador-RUT_Empresa-Fecha.pdf`.
- **Exportación**: Generación de archivos comprimidos (ZIP) y envío vía Email desde el cliente del supervisor.
- **Rendimiento**: Carga rápida de documentos y visualización fluida en Desktop/Móvil.
- **Adaptabilidad**: Interfaz responsiva (Mobile-first o adaptativa).

### Resources
- **Volumen Inicial**: ~200 trabajadores, ~2,000 documentos totales.
- **Conectividad**: Siempre online (asegurada en obra).
- **Proceso de Firma**: Fuera de línea (digitalización post-firma).

### Success Criteria
- [ ] Tiempo de respuesta ante fiscalización (selección -> envío) menor a 2 minutos.
- [ ] 100% de los documentos almacenados en formato PDF estandarizado.
- [ ] Sistema de alertas (KPIs) funcional para documentos vencidos o faltantes.
- [ ] Gestión dinámica de roles y vistas por el administrador.

## Security & Access Control
- **RBAC Dinámico**: El administrador debe poder crear roles y asignar vistas/permisos específicos para cada uno de forma modular.
