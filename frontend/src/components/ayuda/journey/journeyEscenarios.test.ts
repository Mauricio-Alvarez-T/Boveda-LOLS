import { inferMovimiento, type WizardState, type PermisosMovimiento, type Origen, type Destino } from '../../../utils/inferMovimiento';

/**
 * Guarda el CONTRATO de inferencia del que dependen los journeys de "Mover": cada
 * ruta preseteada (origen→destino) debe seguir mapeando al tipo de flujo correcto.
 * Si `inferMovimiento` cambia, estos journeys cambiarían de flujo → test rojo.
 */
const TODOS: PermisosMovimiento = {
    solicitar: true, solicitudMateriales: true, pushDirecto: true,
    intraBodega: true, devolucion: true, intraObra: true, ordenGerencia: true,
};

const state = (origen: Origen, destino: Destino | null, ordenGerencia = false): WizardState => ({
    origen, destino, ordenGerencia,
    items: [{ item_id: 1, cantidad: 1 }], itemsCustom: [],
    motivo: ordenGerencia ? 'motivo demo' : '', observaciones: '',
    requierePionetas: false, cantidadPionetas: 0,
});

describe('escenarios de journeys de Mover → tipo de flujo', () => {
    it('central → obra = solicitud (Pedir del catálogo)', () => {
        expect(inferMovimiento(state({ tipo: 'central' }, { tipo: 'obra', id: 1 }), TODOS).tipoFlujo).toBe('solicitud');
    });
    it('bodega → obra = push_directo (Envío directo)', () => {
        expect(inferMovimiento(state({ tipo: 'bodega', id: 101 }, { tipo: 'obra', id: 1 }), TODOS).tipoFlujo).toBe('push_directo');
    });
    it('obra → bodega = devolucion', () => {
        expect(inferMovimiento(state({ tipo: 'obra', id: 1 }, { tipo: 'bodega', id: 101 }), TODOS).tipoFlujo).toBe('devolucion');
    });
    it('obra → obra = intra_obra (Traslado entre obras)', () => {
        expect(inferMovimiento(state({ tipo: 'obra', id: 1 }, { tipo: 'obra', id: 2 }), TODOS).tipoFlujo).toBe('intra_obra');
    });
    it('bodega → bodega = intra_bodega (Mover entre bodegas)', () => {
        expect(inferMovimiento(state({ tipo: 'bodega', id: 101 }, { tipo: 'bodega', id: 102 }), TODOS).tipoFlujo).toBe('intra_bodega');
    });
    it('bodega → obra + toggle = orden_gerencia', () => {
        expect(inferMovimiento(state({ tipo: 'bodega', id: 101 }, { tipo: 'obra', id: 1 }, true), TODOS).tipoFlujo).toBe('orden_gerencia');
    });
});
