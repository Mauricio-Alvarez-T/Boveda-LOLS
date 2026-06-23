import type { Vehiculo, EmpresaVehiculo, Conductor } from '../../../types/entities';
import type { User } from '../../../types';

/**
 * Datos de EJEMPLO para el sandbox de Vehículos del Centro de ayuda. Los bodies de
 * los endpoints simulados son objetos planos; solo `userDemo` se tipa porque alimenta
 * el override de AuthContext (permisos all-true para que el demo funcione a cualquiera).
 */

const EMPRESA_ID = 9101;

export const userDemo: User = {
    id: 0,
    nombre: 'Usuario de ejemplo',
    email: 'demo@lols.cl',
    rol: 'Demostración',
    rol_id: 0,
    permisos: [],
};

/** GET /empresas-vehiculos → { data: [empresaDemo] } */
export const empresaDemo: EmpresaVehiculo = {
    id: EMPRESA_ID,
    nombre: 'Flota de ejemplo',
    color: '#029E4D',
    activo: true,
    vehiculos_count: 2,
};

/** GET /conductores?activo=true → { data: conductoresDemo } */
export const conductoresDemo: Conductor[] = [
    { id: 1, nombre: 'Juan Pérez', activo: true },
    { id: 2, nombre: 'Pedro González', activo: true },
];

/** GET /vehiculos → { data: vehiculosDemo } (2 vehículos completos y válidos) */
export const vehiculosDemo: Vehiculo[] = [
    {
        id: 5001, patente: 'ABCD12', marca: 'Toyota', modelo: 'Hilux', anio: 2022,
        tipo: 'camioneta', empresa_id: EMPRESA_ID, empresa_nombre: 'Flota de ejemplo', empresa_color: '#029E4D',
        conductor_id: 1, conductor_nombre: 'Juan Pérez', kilometraje_actual: 45000, color: 'Blanco',
        valor: 18000000, observaciones: null, activo: true,
    },
    {
        id: 5002, patente: 'EFGH34', marca: 'Ford', modelo: 'Ranger', anio: 2021,
        tipo: 'camioneta', empresa_id: EMPRESA_ID, empresa_nombre: 'Flota de ejemplo', empresa_color: '#029E4D',
        conductor_id: 2, conductor_nombre: 'Pedro González', kilometraje_actual: 62000, color: 'Gris',
        valor: 16000000, observaciones: null, activo: true,
    },
];

/** Vehículo de respuesta al crear (POST /vehiculos). */
export const vehiculoNuevoDemo: Vehiculo = {
    id: 5003, patente: 'IJKL56', marca: 'Nissan', modelo: 'Navara', anio: 2023,
    tipo: 'camioneta', empresa_id: EMPRESA_ID, kilometraje_actual: 0, color: 'Rojo', activo: true,
};

/** Documento de respuesta al subir (POST /vehiculos/:id/documentos). */
export const documentoNuevoDemo = {
    id: 7101, vehiculo_id: 5001, categoria: 'permiso_circulacion' as const,
    nombre_archivo: 'permiso-circulacion.pdf', created_at: '2026-01-05T12:00:00.000Z',
};
