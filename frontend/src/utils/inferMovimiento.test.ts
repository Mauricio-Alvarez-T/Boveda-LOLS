import { inferMovimiento, type WizardState, type PermisosMovimiento } from './inferMovimiento';

const TODOS: PermisosMovimiento = {
    solicitar: true, solicitudMateriales: true, pushDirecto: true, intraBodega: true, ordenGerencia: true,
};
const SOLO_SOLICITAR: PermisosMovimiento = {
    solicitar: true, solicitudMateriales: false, pushDirecto: false, intraBodega: false, ordenGerencia: false,
};

function base(overrides: Partial<WizardState> = {}): WizardState {
    return {
        origen: null, destino: null, ordenGerencia: false,
        items: [], itemsCustom: [], motivo: '', observaciones: '', requierePionetas: false, cantidadPionetas: 0,
        ...overrides,
    };
}
const ITEM = { item_id: 1, cantidad: 2 };
const CUSTOM = { descripcion: 'Tornillos', cantidad: 10 };

describe('inferMovimiento — inferencia por ruta', () => {
    test('sin origen o destino → tipoFlujo null, sin errores', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'central' } }), TODOS);
        expect(r.tipoFlujo).toBeNull();
        expect(r.resuelto).toBeNull();
    });

    test('central → obra con ítems = solicitud (sin origen en payload)', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'central' }, destino: { tipo: 'obra', id: 5 }, items: [ITEM] }), TODOS);
        expect(r.tipoFlujo).toBe('solicitud');
        expect(r.errores).toEqual([]);
        expect(r.resuelto).toEqual({ kind: 'crear', data: expect.objectContaining({ destino_obra_id: 5, items: [ITEM], tipo_flujo: 'solicitud' }) });
        expect((r.resuelto as any).data.origen_bodega_id).toBeUndefined();
    });

    test('central → obra SOLO custom = solicitud_materiales', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'central' }, destino: { tipo: 'obra', id: 5 }, itemsCustom: [CUSTOM] }), TODOS);
        expect(r.tipoFlujo).toBe('solicitud_materiales');
        expect(r.resuelto).toEqual({ kind: 'solicitudMateriales', data: expect.objectContaining({ destino_obra_id: 5, items_custom: [CUSTOM] }) });
    });

    test('central → bodega = error (sin origen solo a obra)', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'central' }, destino: { tipo: 'bodega', id: 3 }, items: [ITEM] }), TODOS);
        expect(r.errores.length).toBeGreaterThan(0);
        expect(r.resuelto).toBeNull();
    });

    test('bodega → obra (modo Mover) = push_directo con permiso', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'bodega', id: 2 }, destino: { tipo: 'obra', id: 5 }, items: [ITEM] }), TODOS);
        expect(r.tipoFlujo).toBe('push_directo');
        expect(r.resuelto).toEqual({ kind: 'pushDirecto', data: expect.objectContaining({ origen_bodega_id: 2, destino_obra_id: 5 }) });
    });

    test('bodega → obra sin permiso push = error de permiso (rutaOk false)', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'bodega', id: 2 }, destino: { tipo: 'obra', id: 5 }, items: [ITEM] }), SOLO_SOLICITAR);
        expect(r.tipoFlujo).toBe('push_directo');
        expect(r.rutaOk).toBe(false);
        expect(r.errores).toContain('No tenés permiso para este tipo de movimiento.');
    });

    test('obra → bodega = devolución', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'obra', id: 7 }, destino: { tipo: 'bodega', id: 3 }, items: [ITEM] }), TODOS);
        expect(r.tipoFlujo).toBe('devolucion');
        expect(r.resuelto).toEqual({ kind: 'devolucion', data: expect.objectContaining({ origen_obra_id: 7, destino_bodega_id: 3 }) });
    });

    test('obra → obra distintas = intra_obra', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'obra', id: 7 }, destino: { tipo: 'obra', id: 8 }, items: [ITEM] }), TODOS);
        expect(r.tipoFlujo).toBe('intra_obra');
        expect(r.resuelto).toEqual({ kind: 'intraObra', data: expect.objectContaining({ origen_obra_id: 7, destino_obra_id: 8 }) });
    });

    test('obra → misma obra = error', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'obra', id: 7 }, destino: { tipo: 'obra', id: 7 }, items: [ITEM] }), TODOS);
        expect(r.errores).toContain('El origen y el destino no pueden ser el mismo.');
        expect(r.resuelto).toBeNull();
    });

    test('bodega → bodega distintas = intra_bodega', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'bodega', id: 2 }, destino: { tipo: 'bodega', id: 3 }, items: [ITEM] }), TODOS);
        expect(r.tipoFlujo).toBe('intra_bodega');
    });
});

describe('inferMovimiento — toggles, permisos y validaciones', () => {
    test('orden de gerencia (toggle + permiso) override sobre la ruta', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'bodega', id: 2 }, destino: { tipo: 'obra', id: 5 }, items: [ITEM], ordenGerencia: true, motivo: 'urgente' }), TODOS);
        expect(r.tipoFlujo).toBe('orden_gerencia');
        expect(r.resuelto).toEqual({ kind: 'ordenGerencia', data: expect.objectContaining({ origen_bodega_id: 2, destino_obra_id: 5, motivo: 'urgente' }) });
    });

    test('orden de gerencia sin motivo = error', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'bodega', id: 2 }, destino: { tipo: 'obra', id: 5 }, items: [ITEM], ordenGerencia: true }), TODOS);
        expect(r.errores).toContain('La orden de gerencia requiere un motivo.');
        expect(r.resuelto).toBeNull();
    });

    test('toggle orden de gerencia NO disponible sin permiso', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'bodega', id: 2 }, destino: { tipo: 'bodega', id: 3 }, items: [ITEM], ordenGerencia: true }), SOLO_SOLICITAR);
        expect(r.togglesDisponibles.ordenGerencia).toBe(false);
        expect(r.tipoFlujo).toBe('intra_bodega'); // se ignora el toggle
        expect(r.errores).toContain('No tenés permiso para este tipo de movimiento.'); // intra_bodega sin permiso
    });

    test('sin ítems = error', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'obra', id: 7 }, destino: { tipo: 'bodega', id: 3 } }), TODOS);
        expect(r.errores).toContain('Agregá al menos un ítem.');
    });

    test('rutaOk: true con ruta válida aunque falten ítems; resuelto null', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'obra', id: 7 }, destino: { tipo: 'bodega', id: 3 } }), TODOS);
        expect(r.rutaOk).toBe(true);
        expect(r.resuelto).toBeNull();
        expect(r.errores).toContain('Agregá al menos un ítem.');
    });

    test('rutaOk: false si origen=destino o sin permiso', () => {
        const igual = inferMovimiento(base({ origen: { tipo: 'obra', id: 7 }, destino: { tipo: 'obra', id: 7 }, items: [ITEM] }), TODOS);
        expect(igual.rutaOk).toBe(false);
        const sinPermiso = inferMovimiento(base({ origen: { tipo: 'bodega', id: 2 }, destino: { tipo: 'bodega', id: 3 }, items: [ITEM] }), SOLO_SOLICITAR);
        expect(sinPermiso.rutaOk).toBe(false);
    });

    test('pionetas se propagan en devolución', () => {
        const r = inferMovimiento(base({ origen: { tipo: 'obra', id: 7 }, destino: { tipo: 'bodega', id: 3 }, items: [ITEM], requierePionetas: true, cantidadPionetas: 2 }), TODOS);
        expect((r.resuelto as any).data.requiere_pionetas).toBe(true);
        expect((r.resuelto as any).data.cantidad_pionetas).toBe(2);
    });
});
