/**
 * Tipos de la "Lista de trabajadores en actividades sugeridas".
 * Backend: backend/src/services/actividadesSugeridas.service.js
 * Tablas: actividades_sugeridas, actividades_sugeridas_trabajadores (mig 038/040, renombradas en 116).
 *
 * Decisión de jefatura (2026-09-21): la lista NO fija un día; se asigna a una
 * SEMANA (lunes a viernes) identificada por su lunes en `semana` (YYYY-MM-DD).
 * Los valores del ENUM se conservan; en la UI: citada = "Creada".
 */

export type ActividadEstado = 'citada' | 'realizada' | 'cancelada';

/**
 * Estado del trabajador dentro de la lista. Migración 040.
 * - citado: sigue en la lista, sin asistencia registrada.
 * - asistio: marcado presente.
 * - no_asistio: marcado ausente.
 * - cancelado: la lista completa fue cancelada (preserva auditoría).
 */
export type ActividadTrabajadorEstado = 'citado' | 'asistio' | 'no_asistio' | 'cancelado';

/** Resumen de una lista para el listado mensual. */
export interface ActividadSugeridaResumen {
    id: number;
    obra_id: number;
    obra_nombre: string;
    semana: string;                   // YYYY-MM-DD (lunes de la semana)
    estado: ActividadEstado;
    observaciones_globales: string | null;
    creado_por: number;
    creado_por_nombre: string | null;
    created_at: string;
    total_citados: number;
    total_asistio: number;
}

/** Trabajador dentro de una lista, con datos joineados de cargos/obras. */
export interface ActividadSugeridaTrabajador {
    id: number;
    actividad_id: number;
    trabajador_id: number;
    obra_origen_id: number | null;
    obra_origen_nombre: string | null;
    citado: 0 | 1;
    asistio: 0 | 1 | null;            // null = aún no marcado
    estado?: ActividadTrabajadorEstado;
    observacion: string | null;
    // Joins
    rut: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    cargo_id: number | null;
    cargo_nombre: string | null;
}

/** Detalle completo: cabecera + trabajadores. GET /api/actividades-sugeridas/:id. */
export interface ActividadSugeridaDetalle {
    id: number;
    obra_id: number;
    obra_nombre: string;
    semana: string;
    estado: ActividadEstado;
    observaciones_globales: string | null;
    observaciones_por_cargo: Record<string, string> | null;  // {cargo_id: "texto"}
    creado_por: number;
    creado_por_nombre: string | null;
    actualizado_por: number | null;
    created_at: string;
    updated_at: string;
    trabajadores: ActividadSugeridaTrabajador[];
}

/** Payload del POST: crear lista. `semana` = lunes (YYYY-MM-DD). */
export interface CrearListaPayload {
    obra_id: number;
    semana: string;
    observaciones_globales?: string | null;
    observaciones_por_cargo?: Record<string, string> | null;
    trabajadores: Array<{ trabajador_id: number; obra_origen_id?: number | null }>;
}

/** Payload del PUT /:id/lista (editar mientras está "citada"). */
export interface EditarListaPayload {
    observaciones_globales?: string | null;
    observaciones_por_cargo?: Record<string, string> | null;
    trabajadores: Array<{ trabajador_id: number; obra_origen_id?: number | null }>;
}

/**
 * GET /actividades-sugeridas/resumen-semana — informe de una semana (pedido 2026-09-21).
 * `semana` es el lunes; `semanas_disponibles` son las semanas con asistencia registrada,
 * de la más nueva a la más vieja. Sin datos: `semana` = null y los conteos en 0.
 */
export interface ResumenSemanaActividades {
    semana: string | null;
    semana_label: string | null;
    semanas_disponibles: string[];
    listas: number;
    obras: number;
    total_asistieron: number;
    por_cargo: Array<{ cargo_nombre: string; asistieron: number }>;
}

/**
 * Payload del PUT /:id/asistencia.
 * Sin horas (jefatura 2026-08-17): solo asistió / no asistió.
 */
export interface RegistrarAsistenciaPayload {
    observaciones_globales?: string | null;
    trabajadores: Array<{
        trabajador_id: number;
        obra_origen_id?: number | null;
        asistio: boolean;
        observacion?: string | null;
    }>;
}
