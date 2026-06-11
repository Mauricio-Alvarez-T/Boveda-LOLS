# Reglas de la App — Índice

Catálogo de TODAS las reglas de negocio de Bóveda LOLS, separadas por categoría. Cada regla indica
**dónde vive en el código** para poder verificarla/modificarla. Si cambias una regla en el código,
**actualiza el archivo correspondiente aquí** (es parte del Definition of Done).

| Categoría | Archivo | Qué cubre |
|---|---|---|
| Asistencia | [asistencia.md](asistencia.md) | Estados (A/F/JI/TO/V/LM/NAC/DF/MT/PSG), períodos, feriados, sábados extra, horas extra, Art. 160, traslados |
| Inventario y Transferencias | [inventario-transferencias.md](inventario-transferencias.md) | State machine, 6 flujos, SoD, stock/régimen, recepción parcial, discrepancias, descuentos, facturación |
| Obras y Bodegas | [obras-bodegas.md](obras-bodegas.md) | Flags (activa, es_prueba, finalizada, participa_*), cascadas, obras finalizadas |
| RRHH y Trabajadores | [rrhh-trabajadores.md](rrhh-trabajadores.md) | Documentos obligatorios, vencimientos, empresas, fiscalización, constancias, reporte semanal |
| Seguridad y RBAC | [seguridad-rbac.md](seguridad-rbac.md) | Catálogo de permisos, JWT/re-login, permisos financieros, overrides, sanitización backend |
| Vehículos | [vehiculos.md](vehiculos.md) | Seguros, revisiones, mantenciones, permisos de circulación, alertas email |
| Bombas de Hormigón | [bombas.md](bombas.md) | Registro por obra, costos gateados |
| Infraestructura | [infraestructura.md](infraestructura.md) | Migraciones, deploy, cron, env, logs, worktrees, pre-deploy checks |
| Diseño (Design System) | [diseno.md](diseno.md) | Tokens tipográficos, colores, primitivas ui/, statusConfig, helpers de formato, reglas ESLint, migración F2 |

> Documento creado en Fase 0 del plan v2 (ver `docs/ARQUITECTURA.md`). Fuente: auditoría de código
> de junio 2026; ubicaciones de código aproximadas (las líneas se mueven, los archivos no tanto).
