# Reglas — RRHH y Trabajadores

## Documentos

- `tipos_documento` define el catálogo (nombre, **obligatorio**, activo).
- Completitud por trabajador = docs subidos activos / tipos obligatorios activos
  (`fiscalizacion.service.js`).
- `documentos.fecha_vencimiento`: dashboard alerta vencidos hoy, por vencer 7 días y timeline 14
  días (`dashboard.service.js`); alerta crítica si hay vencidos.
- Los PDF se normalizan y se pueden exportar en ZIP por trabajador (caso de uso fundacional:
  fiscalizaciones — `docs/project-brief.md`).

## Empresas

- `empresas.razon_social`; badges UI por empresa: LOLS / MAUA / PROV / DED
  (`utils/empresaTag.ts`, badge en asistencia diaria y consultas).

## Fiscalización / Consultas

- Búsqueda avanzada (`fiscalizacion.service.js`): por obra, empresa, cargo, categoría de reporte,
  completitud (100% / con faltantes), ausentes, y **aniversarios de 10 meses**
  (`fecha_ingreso + 10m` cae en el mes objetivo; query sargable).
- Excluye `es_prueba=1` por defecto (`?incluir_prueba=true` lo anula) y obras finalizadas.
- Exportación Excel con fichas y documentos por trabajador.

## Constancias

- Plantilla real LOLS: **Carta de Amonestación** (Word, sin IA); botón por fila en Consultas
  (solo-icono con tooltip, fondo blanco glass). El Acta de Consentimiento fue eliminada.

## Reporte semanal RRHH por email

- Script standalone `backend/scripts/reporte_semanal.js` (abre/cierra su propia conexión).
- Contenido: 4 KPIs semanales (contrataciones, desvinculaciones, faltas F, aniversarios 10m) + 3
  tendencias mensuales; **HTML puro compatible Gmail/Outlook** (tablas, sin JS).
- Aniversarios solo el **primer lunes del mes**.
- Destinatarios (precedencia): flag `--to` > tabla `reportes_suscriptores` (Slice B, UI en
  Settings) > env `REPORTE_TO` (CSV). Degrada con gracia si la tabla no existe.
- Cron: `0 8 * * 1` en **cPanel Cron Jobs** (NUNCA node-cron — Passenger duerme el proceso).
- Flags: `--dry` (preview HTML en tmp/), `--fecha YYYY-MM-DD`.
- Excluye trabajadores `es_prueba=1`.
- Permiso de gestión de suscriptores: `sistema.reportes.gestionar` (mig 067).

## Trabajadores

- `es_prueba` heredado de la obra (ver obras-bodegas.md).
- `categoria_reporte` ∈ {obra, operaciones, rotativo} (mig 008).
- Datos financieros del trabajador gateados por `trabajadores.financiero.ver/editar`.
- WorkerQuickView (ficha rápida): panel lateral desktop / bottom-sheet móvil.
