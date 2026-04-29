/**
 * Tipos para feature "Sábados Extra" — trabajo extraordinario en sábado.
 * Backend: backend/src/services/sabadosExtra.service.js
 * Tablas: sabados_extra, sabados_extra_trabajadores (migración 038)
 */

export type SabadoEstado = 'citada' | 'realizada' | 'cancelada';

/**
 * Estado del trabajador dentro de la citación. Migración 040.
 * - citado: sigue invitado, no se ha registrado asistencia.
 * - asistio: marcado presente el día.
 * - no_asistio: marcado ausente.
 * - cancelado: la citación completa fue cancelada (preserva auditoría).
 */
export type SabadoTrabajadorEstado = 'citado' | 'asistio' | 'no_asistio' | 'cancelado';

/**
 * Resumen de citación para listado mensual.
 */
export interface SabadoExtraResumen {
    id: number;
    obra_id: number;
    obra_nombre: string;
    fecha: string;                    // YYYY-MM-DD
    estado: SabadoEstado;
    horas_default: number | null;
    observaciones_globales: string | null;
    creado_por: number;
    creado_por_nombre: string | null;
    created_at: string;
    total_citados: number;
    total_asistio: number;
}

/**
 * Trabajador dentro de una citación, con datos joineados de cargos/obras.
 */
export interface SabadoExtraTrabajador {
    id: number;
    sabado_id: number;
    trabajador_id: number;
    obra_origen_id: number | null;
    obra_origen_nombre: string | null;
    citado: 0 | 1;
    asistio: 0 | 1 | null;            // null = aún no marcado
    estado?: SabadoTrabajadorEstado;  // migración 040 — opcional para retrocompat
    horas_trabajadas: number | null;  // null = usar horas_default
    observacion: string | null;
    // Joins
    rut: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    cargo_id: number | null;
    cargo_nombre: string | null;
}

/**
 * Detalle completo: cabecera + lista de trabajadores.
 * Lo retorna GET /api/sabados-extra/:id.
 */
export interface SabadoExtraDetalle {
    id: number;
    obra_id: number;
    obra_nombre: string;
    fecha: string;
    estado: SabadoEstado;
    horas_default: number | null;
    observaciones_globales: string | null;
    observaciones_por_cargo: Record<string, string> | null;  // {cargo_id: "texto"}
    creado_por: number;
    creado_por_nombre: string | null;
    actualizado_por: number | null;
    created_at: string;
    updated_at: string;
    trabajadores: SabadoExtraTrabajador[];
}

/**
 * Payload del POST: crear citación.
 *
 * `acepta_feriado` (opcional): el backend rechaza con 409 si la fecha
 * coincide con feriado activo. La UI puede reintentar con este flag tras
 * confirmación explícita del usuario.
 */
export interface CrearCitacionPayload {
    obra_id: number;
    fecha: string;                                          // YYYY-MM-DD, debe ser sábado
    observaciones_globales?: string | null;
    observaciones_por_cargo?: Record<string, string> | null;
    horas_default?: number | null;
    trabajadores: Array<{ trabajador_id: number; obra_origen_id?: number | null }>;
    acepta_feriado?: boolean;
}

/**
 * Payload del PUT /:id/citacion (editar antes del día).
 */
export interface EditarCitacionPayload {
    observaciones_globales?: string | null;
    observaciones_por_cargo?: Record<string, string> | null;
    horas_default?: number | null;
    trabajadores: Array<{ trabajador_id: number; obra_origen_id?: number | null }>;
    acepta_feriado?: boolean;
}

/**
 * Payload del PUT /:id/asistencia (marcar el día).
 */
export interface RegistrarAsistenciaPayload {
    horas_default?: number | null;
    observaciones_globales?: string | null;
    trabajadores: Array<{
        trabajador_id: number;
        obra_origen_id?: number | null;
        asistio: boolean;
        horas_trabajadas?: number | null;
        observacion?: string | null;
    }>;
}
