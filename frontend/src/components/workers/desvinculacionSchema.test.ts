import {
    desvincularSchema, fechaMaxDesvinculacion, hoyYmd, requiereDetalle, opcionesCausales,
    validarDesvinculacion, buildDesvincularPayload, avisoDesvinculacion, detalleDesvinculacion, bajaDesdeResultado,
    type CausalDesvinculacion,
} from './desvinculacionSchema';

const CAT: CausalDesvinculacion[] = [
    { codigo: 'RENUNCIA', articulo: '159', inciso: '2', articulo_texto: 'Artículo 159, N° 2 del Código del Trabajo', nombre: 'Renuncia voluntaria del trabajador', grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
    { codigo: 'INASISTENCIA', articulo: '160', inciso: '3', articulo_texto: 'Artículo 160, N° 3 del Código del Trabajo', nombre: 'Inasistencias injustificadas', grupo: 'Artículo 160', sugiere_no_recontratar: true, requiere_detalle: true },
    { codigo: 'OTRO', articulo: null, inciso: null, articulo_texto: null, nombre: 'Otro motivo (detallar)', grupo: 'Operativas LOLS', sugiere_no_recontratar: false, requiere_detalle: true },
];
const HOY = new Date(2026, 8, 11); // 11-sep-2026

describe('desvincularSchema', () => {
    it('acepta un formulario válido y rechaza fecha/causal vacías', () => {
        expect(desvincularSchema.safeParse({ fecha_desvinculacion: '2026-09-11', causal_codigo: 'RENUNCIA', no_recontratar: false }).success).toBe(true);
        expect(desvincularSchema.safeParse({ fecha_desvinculacion: '', causal_codigo: 'RENUNCIA', no_recontratar: false }).success).toBe(false);
        expect(desvincularSchema.safeParse({ fecha_desvinculacion: '2026-09-11', causal_codigo: '', no_recontratar: false }).success).toBe(false);
    });
});

describe('fechas', () => {
    it('hoyYmd y fechaMaxDesvinculacion (+30 días, hora local)', () => {
        expect(hoyYmd(HOY)).toBe('2026-09-11');
        expect(fechaMaxDesvinculacion(HOY)).toBe('2026-10-11');
    });
});

describe('causales', () => {
    it('requiereDetalle según catálogo', () => {
        expect(requiereDetalle(CAT, 'RENUNCIA')).toBe(false);
        expect(requiereDetalle(CAT, 'INASISTENCIA')).toBe(true);
        expect(requiereDetalle(CAT, 'NO_EXISTE')).toBe(false);
    });
    it('opcionesCausales arma etiquetas con artículo o grupo', () => {
        const ops = opcionesCausales(CAT);
        expect(ops[0]).toEqual({ value: 'RENUNCIA', label: 'Renuncia voluntaria del trabajador — Art. 159 N°2' });
        expect(ops[2].label).toBe('Otro motivo (detallar) — Operativas LOLS');
    });
});

describe('validarDesvinculacion', () => {
    const base = { fecha_desvinculacion: '2026-09-11', causal_codigo: 'RENUNCIA', no_recontratar: false };
    it('ok cuando todo cuadra', () => {
        expect(validarDesvinculacion(base, CAT, '2026-01-15', HOY)).toBeNull();
    });
    it('rechaza fecha anterior al ingreso, fecha > 30 días y art. 160 sin detalle', () => {
        expect(validarDesvinculacion({ ...base, fecha_desvinculacion: '2026-01-01' }, CAT, '2026-01-15', HOY)).toMatch(/anterior al ingreso/);
        expect(validarDesvinculacion({ ...base, fecha_desvinculacion: '2026-10-12' }, CAT, null, HOY)).toMatch(/30 días/);
        expect(validarDesvinculacion({ ...base, causal_codigo: 'INASISTENCIA', detalle: '  ' }, CAT, null, HOY)).toMatch(/detallar/);
        expect(validarDesvinculacion({ ...base, causal_codigo: 'INASISTENCIA', detalle: 'faltó' }, CAT, null, HOY)).toBeNull();
    });
});

describe('buildDesvincularPayload / avisoDesvinculacion', () => {
    it('recorta detalle y omite vacío', () => {
        expect(buildDesvincularPayload({ fecha_desvinculacion: '2026-09-11', causal_codigo: 'RENUNCIA', detalle: '  ', no_recontratar: false }))
            .toEqual({ fecha_desvinculacion: '2026-09-11', causal_codigo: 'RENUNCIA', detalle: undefined, no_recontratar: false });
        expect(buildDesvincularPayload({ fecha_desvinculacion: '2026-09-11', causal_codigo: 'OTRO', detalle: ' x ', no_recontratar: true }).detalle).toBe('x');
    });
    it('aviso con fecha dd-mm-aaaa, causal y marca', () => {
        expect(avisoDesvinculacion({ fecha: '2026-06-30', articulo: '160', no_recontratar: true, causal_nombre: 'Inasistencias injustificadas' }))
            .toBe('desvinculado el 30-06-2026 · Inasistencias injustificadas · marcado NO recontratar');
        expect(avisoDesvinculacion({ fecha: '2026-06-30', articulo: '159', no_recontratar: false })).toBe('desvinculado el 30-06-2026 · Art. 159');
        expect(avisoDesvinculacion(null)).toBeNull();
        expect(avisoDesvinculacion({ fecha: '2026-06-30', articulo: '160', no_recontratar: true, trabajador_depurado: true, nombre: 'Pérez Soto Juan' }))
            .toBe('ficha depurada (Pérez Soto Juan): desvinculado el 30-06-2026 · Art. 160 · marcado NO recontratar');
    });
    it('detalleDesvinculacion: solo si viene y no está vacío', () => {
        expect(detalleDesvinculacion({ fecha: null, articulo: null, no_recontratar: false, detalle: '  Faltó 3 lunes  ' })).toBe('Faltó 3 lunes');
        expect(detalleDesvinculacion({ fecha: null, articulo: null, no_recontratar: false, detalle: '   ' })).toBeNull();
        expect(detalleDesvinculacion({ fecha: null, articulo: null, no_recontratar: false })).toBeNull();
        expect(detalleDesvinculacion(null)).toBeNull();
    });
});

describe('bajaDesdeResultado (puente Desvincular → Finiquito, B5)', () => {
    const r = {
        trabajador_id: 5, desvinculacion_id: 77, fecha_desvinculacion: '2026-09-10',
        causal: { codigo: 'VENCIMIENTO_PLAZO', nombre: 'Vencimiento del plazo convenido en el contrato', articulo_texto: 'Artículo 159, N° 4 del Código del Trabajo' },
        no_recontratar: false, asistencias_posteriores: 0,
    };
    it('arma la UltimaDesvinculacion con artículo extraído, fecha de ingreso recortada y sin finiquito', () => {
        expect(bajaDesdeResultado(r, '2026-08-31T03:00:00.000Z')).toEqual({
            id: 77, fecha: '2026-09-10', articulo: '159', no_recontratar: false,
            causal_codigo: 'VENCIMIENTO_PLAZO', causal_nombre: r.causal.nombre, articulo_texto: r.causal.articulo_texto,
            fecha_ingreso_periodo: '2026-08-31', finiquito_documento_id: null,
        });
    });
    it('causal operativa (sin artículo) y sin fecha de ingreso', () => {
        const b = bajaDesdeResultado({ ...r, causal: { codigo: 'OTRO', nombre: 'Otro motivo (detallar)', articulo_texto: null }, no_recontratar: true }, undefined);
        expect(b.articulo).toBeNull();
        expect(b.articulo_texto).toBeNull();
        expect(b.fecha_ingreso_periodo).toBeNull();
        expect(b.no_recontratar).toBe(true);
    });
});
