# Reglas de la App — Índice

Catálogo de TODAS las reglas de negocio de Bóveda LOLS, separadas por categoría. Cada regla indica
**dónde vive en el código** para poder verificarla/modificarla. Si cambias una regla en el código,
**actualiza el archivo correspondiente aquí** (es parte del Definition of Done).

| Categoría | Archivo | Qué cubre |
|---|---|---|
| Asistencia | [asistencia.md](asistencia.md) | Estados (A/F/JI/TO/V/LM/NAC/DF/MT/PSG), períodos, feriados, listas de actividades sugeridas (semana), horas extra, Art. 160, traslados |
| Inventario y Transferencias | [inventario-transferencias.md](inventario-transferencias.md) | State machine, 6 flujos, SoD, stock/régimen, recepción parcial, discrepancias, descuentos, facturación |
| Obras y Bodegas | [obras-bodegas.md](obras-bodegas.md) | Flags (activa, es_prueba, finalizada, participa_*), cascadas, obras finalizadas |
| RRHH y Trabajadores | [rrhh-trabajadores.md](rrhh-trabajadores.md) | Documentos obligatorios, vencimientos, empresas (+ representante legal), fiscalización, reporte semanal, ficha de ingreso digital, sueldo por cargo, desvinculación con causal, **documentos laborales generados en Word (kit de ingreso, amonestación, solicitud)** |
| Seguridad y RBAC | [seguridad-rbac.md](seguridad-rbac.md) | Catálogo de permisos (+ pre-registro plan Gestiones), JWT/re-login, permisos financieros, gates exclusivos (documentos laborales, sueldos), overrides, sanitización backend (quick-view), errores enriquecidos `{error, code, details}`, **Soporte · usuarios: ficha + «Ver como esta persona» (solo rol 1, token 30 min solo lectura)** |
| Vehículos | [vehiculos.md](vehiculos.md) | Seguros, revisiones, mantenciones, permisos de circulación, alertas email |
| Bombas de Hormigón | [bombas.md](bombas.md) | Registro por obra, costos gateados |
| Infraestructura | [infraestructura.md](infraestructura.md) | Migraciones, deploy, cron, env, logs, worktrees, pre-deploy checks, **datos ficticios en staging (saneo)** |
| Ideas para Bóveda | [ideas.md](ideas.md) | Buzón de mejoras (mig 120): con nombre, "mejoras no mañas" (problema + frecuencia + alcance + beneficio), estados y motivos, `ideas.revisar` por usuario, crédito público de lo hecho |
| Presupuestos y costos | [costos.md](costos.md) | Costos de obra (mig 122, esqueleto para Rodrigo): presupuesto por partidas con GG/imprevistos/utilidad/IVA, import de Excel, original vs modificación, gastos con foto medidos en neto, por completar / por pagar, historial; cobros al mandante, flujo de caja semanal, cierre de obra (montos congelados) y comparación por m² (mig 123); `costos.gestionar` por usuario |
| Sitio web (lols.cl) | [sitio-web.md](sitio-web.md) | Obras del sitio público editadas en la Bóveda (mig 147): contrato del JSON de lols.cl (lista blanca, cero diferencias), faltantes, incluir/orden/concurrencia, fotos «nadie reconocible» con dos llaves atadas al hash, rutas dueñas y carpetas compartidas, `modoEfectivo` (staging nunca publica), token solo en `.env`; **publicar** (foto completa, un commit atómico síncrono con lock y conciliación, simulación con ZIP, «en línea» por build.txt), importar las obras del sitio, resincronizar, incidente; **pantalla** `/sitio-web` (menú «Sitio web» con número ámbar, lista por estado con orden, editor con faltantes en vivo, portada con revisión y aprobación, vista previa, publicar con previa y pasos) |
| Diseño (Design System) | [diseno.md](diseno.md) | Tokens tipográficos, colores, primitivas ui/, statusConfig, helpers de formato, reglas ESLint, migración F2; Inicio por módulos y **Inicio de gerencia** (§9.15: los seis temas, de dónde sale cada dato y el WhatsApp por tarjeta) |

> Documento creado en Fase 0 del plan v2 (ver `docs/ARQUITECTURA.md`). Fuente: auditoría de código
> de junio 2026; ubicaciones de código aproximadas (las líneas se mueven, los archivos no tanto).
