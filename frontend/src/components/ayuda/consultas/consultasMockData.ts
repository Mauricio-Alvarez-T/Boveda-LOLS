import type { User } from '../../../types';

/**
 * Datos de EJEMPLO para el sandbox de Consultas del Centro de ayuda. Los bodies de
 * los endpoints simulados son objetos planos; solo `userDemo` se tipa (alimenta el
 * override de AuthContext: permisos all-true para que el demo funcione a cualquiera).
 */

export const userDemo: User = {
    id: 0,
    nombre: 'Usuario de ejemplo',
    email: 'demo@lols.cl',
    rol: 'Demostración',
    rol_id: 0,
    permisos: [],
};

/** GET /fiscalizacion/trabajadores-avanzado → { data: trabajadoresAvanzadoDemo } (grilla). */
export const trabajadoresAvanzadoDemo = [
    { id: 5101, rut: '11.111.111-1', nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto', empresa_id: 1, obra_id: 1, cargo_id: 1, empresa_nombre: 'LOLS', obra_nombre: 'Obra de ejemplo', cargo_nombre: 'Maestro', email: 'juan@lols.cl', telefono: '+56911111111', fecha_ingreso: '2025-01-01', categoria_reporte: 'obra', activo: true, es_prueba: false, docs_porcentaje: 100 },
    { id: 5102, rut: '22.222.222-2', nombres: 'Pedro', apellido_paterno: 'González', apellido_materno: 'Rojas', empresa_id: 1, obra_id: 1, cargo_id: 2, empresa_nombre: 'LOLS', obra_nombre: 'Obra de ejemplo', cargo_nombre: 'Jornal', email: null, telefono: null, fecha_ingreso: '2025-02-01', categoria_reporte: 'obra', activo: true, es_prueba: false, docs_porcentaje: 60 },
    { id: 5103, rut: '33.333.333-3', nombres: 'Luis', apellido_paterno: 'Muñoz', apellido_materno: 'Díaz', empresa_id: 1, obra_id: 1, cargo_id: 2, empresa_nombre: 'LOLS', obra_nombre: 'Obra de ejemplo', cargo_nombre: 'Jornal', email: null, telefono: null, fecha_ingreso: '2025-03-01', categoria_reporte: 'operaciones', activo: true, es_prueba: false, docs_porcentaje: 40 },
];

/** GET /trabajadores/:id → workerDetalleDemo (objeto directo; QuickView lee res.data.data || res.data). */
export const workerDetalleDemo = {
    id: 5101, rut: '11.111.111-1', nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto',
    empresa_id: 1, obra_id: 1, cargo_id: 1, empresa_nombre: 'LOLS', obra_nombre: 'Obra de ejemplo', cargo_nombre: 'Maestro',
    email: 'juan@lols.cl', telefono: '+56911111111', fecha_ingreso: '2025-01-01', categoria_reporte: 'obra', activo: true,
};

/** GET /documentos/trabajador/:id → documentosDemo (≥1 para el flujo "Ver documento"). */
export const documentosDemo = [
    { id: 7201, trabajador_id: 5101, tipo_nombre: 'Contrato de trabajo', nombre_archivo: 'contrato.pdf', fecha_vencimiento: null, activo: true },
    { id: 7202, trabajador_id: 5101, tipo_nombre: 'Certificado AFP', nombre_archivo: 'afp.pdf', fecha_vencimiento: '2026-12-31', activo: true },
];

/** GET /documentos/tipos → tiposDocDemo. */
export const tiposDocDemo = [
    { id: 1, nombre: 'Contrato de trabajo', obligatorio: true, activo: true },
    { id: 2, nombre: 'Certificado AFP', obligatorio: true, activo: true },
];

/** GET /asistencias/estados → estadosDemo (para el calendario del QuickView). */
export const estadosDemo = [
    { id: 1, nombre: 'Asiste', codigo: 'A', color: '#22c55e', es_presente: true, cuenta_dia_trabajado: true, activo: true },
    { id: 2, nombre: 'Falta', codigo: 'F', color: '#ef4444', es_presente: false, cuenta_dia_trabajado: false, activo: true },
    { id: 5, nombre: 'Vacaciones', codigo: 'V', color: '#8b5cf6', es_presente: false, cuenta_dia_trabajado: true, activo: true },
];

/** Catálogos para los selects del WorkerForm (lee res.data.data). */
export const empresasDemo = [{ id: 1, razon_social: 'LOLS', rut: '76.000.000-0', activo: true }];
export const obrasDemo = [{ id: 1, nombre: 'Obra de ejemplo', activo: true }];
export const cargosDemo = [
    { id: 1, nombre: 'Maestro', activo: true },
    { id: 2, nombre: 'Jornal', activo: true },
];
