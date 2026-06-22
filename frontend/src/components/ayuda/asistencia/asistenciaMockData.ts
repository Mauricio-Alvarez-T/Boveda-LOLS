import type { Obra } from '../../../types/entities';
import type { User } from '../../../types';

/**
 * Datos de EJEMPLO para el sandbox de Asistencia del Centro de ayuda. Los bodies
 * de los endpoints simulados son objetos planos (axios reply = any); solo se tipan
 * el `obraDemo`/`userDemo` porque alimentan los Provider de override (Auth/Obra).
 */

const OBRA_ID = 9001;

export const obraDemo: Obra = {
    id: OBRA_ID,
    nombre: 'Obra de ejemplo',
    direccion: 'Av. Demostración 123',
    empresa_id: 1,
    empresa_nombre: 'LOLS',
    activa: true,
    participa_asistencia: true,
    participa_inventario: true,
    participa_transferencias: true,
};

export const userDemo: User = {
    id: 0,
    nombre: 'Usuario de ejemplo',
    email: 'demo@lols.cl',
    rol: 'Demostración',
    rol_id: 0,
    permisos: [],
};

/** GET /asistencias/estados → { data: estadosDemo } */
export const estadosDemo = [
    { id: 1, nombre: 'Asiste', codigo: 'A', color: '#22c55e', es_presente: true, cuenta_dia_trabajado: true, activo: true },
    { id: 2, nombre: 'Falta', codigo: 'F', color: '#ef4444', es_presente: false, cuenta_dia_trabajado: false, activo: true },
    { id: 3, nombre: 'Jornada Incompleta', codigo: 'JI', color: '#f59e0b', es_presente: true, cuenta_dia_trabajado: true, activo: true },
    { id: 4, nombre: 'Licencia Médica', codigo: 'LM', color: '#3b82f6', es_presente: false, cuenta_dia_trabajado: false, activo: true },
    { id: 5, nombre: 'Vacaciones', codigo: 'V', color: '#8b5cf6', es_presente: false, cuenta_dia_trabajado: true, activo: true },
    { id: 6, nombre: 'Traslado de Obra', codigo: 'TO', color: '#06b6d4', es_presente: true, cuenta_dia_trabajado: true, activo: true },
    { id: 7, nombre: 'Permiso Sin Goce', codigo: 'PSG', color: '#94a3b8', es_presente: false, cuenta_dia_trabajado: false, activo: true },
];

/** GET /trabajadores?... → { data: trabajadoresDemo } */
export const trabajadoresDemo = [
    { id: 1, rut: '11.111.111-1', nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto', empresa_id: 1, empresa_nombre: 'LOLS', obra_id: OBRA_ID, cargo_id: 1, cargo_nombre: 'Maestro', fecha_ingreso: '2025-01-01', fecha_desvinculacion: null, activo: true },
    { id: 2, rut: '22.222.222-2', nombres: 'Pedro', apellido_paterno: 'González', apellido_materno: 'Rojas', empresa_id: 1, empresa_nombre: 'LOLS', obra_id: OBRA_ID, cargo_id: 2, cargo_nombre: 'Jornal', fecha_ingreso: '2025-02-01', fecha_desvinculacion: null, activo: true },
    { id: 3, rut: '33.333.333-3', nombres: 'Luis', apellido_paterno: 'Muñoz', apellido_materno: 'Díaz', empresa_id: 1, empresa_nombre: 'LOLS', obra_id: OBRA_ID, cargo_id: 2, cargo_nombre: 'Jornal', fecha_ingreso: '2025-03-01', fecha_desvinculacion: null, activo: true },
    { id: 4, rut: '44.444.444-4', nombres: 'Carlos', apellido_paterno: 'Rivera', apellido_materno: 'Vega', empresa_id: 1, empresa_nombre: 'LOLS', obra_id: OBRA_ID, cargo_id: 3, cargo_nombre: 'Capataz', fecha_ingreso: '2024-12-01', fecha_desvinculacion: null, activo: true },
];

/** GET /config-horarios/obra/:id → { data: horariosDemo } (lun-vie 08-18) */
export const horariosDemo = ['lun', 'mar', 'mie', 'jue', 'vie'].map((dia, i) => ({
    id: i + 1, obra_id: OBRA_ID, dia_semana: dia,
    hora_entrada: '08:00:00', hora_salida: '18:00:00',
    hora_colacion_inicio: '13:00:00', hora_colacion_fin: '14:00:00', activo: true,
}));
