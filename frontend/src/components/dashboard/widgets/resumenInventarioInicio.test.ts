import { detalleAntiguedad, resumenInventarioInicio, type ResumenInventarioApi } from './resumenInventarioInicio';

const nada: ResumenInventarioApi = { por_aprobar: null, discrepancias: null, por_despachar: null, por_recibir: null, mis_solicitudes: null };

describe('resumenInventarioInicio', () => {
    test('aprobador: suma por aprobar + diferencias; rojo si hay diferencias; filas en orden', () => {
        const m = resumenInventarioInicio({
            ...nada,
            por_aprobar: { total: 3, dias: 6 },
            discrepancias: { total: 2, dias: 4 },
            mis_solicitudes: { total: 1, dias: 0 },
        });
        expect(m).toMatchObject({ tono: 'rojo', cifra: 5, etiqueta: 'por resolver' });
        expect(m.filas.map(f => [f.texto, f.total, f.tono, f.estado])).toEqual([
            ['Por aprobar', 3, 'ambar', 'pendiente'],
            ['Diferencias por resolver', 2, 'rojo', 'discrepancias'],
            ['Tus solicitudes en curso', 1, 'neutro', 'todas'],
        ]);
        expect(m.filas[0].detalle).toBe('La más antigua: hace 6 días');
    });

    test('bodeguero: despachar y recibir, sin diferencias → ámbar', () => {
        const m = resumenInventarioInicio({ ...nada, por_despachar: { total: 1, dias: 2 }, por_recibir: { total: 0, dias: null } });
        expect(m).toMatchObject({ tono: 'ambar', cifra: 1 });
        expect(m.filas[1]).toMatchObject({ texto: 'En tránsito, por recibir', total: 0, tono: 'neutro', detalle: '' });
    });

    test('todo en cero → verde', () => {
        expect(resumenInventarioInicio({ ...nada, por_aprobar: { total: 0, dias: null }, discrepancias: { total: 0, dias: null } }).tono).toBe('verde');
    });

    test('solo solicitante: la cifra son sus solicitudes en curso', () => {
        expect(resumenInventarioInicio({ ...nada, mis_solicitudes: { total: 2, dias: 3 } }))
            .toMatchObject({ tono: 'neutro', cifra: 2, etiqueta: 'solicitudes tuyas en curso' });
        expect(resumenInventarioInicio({ ...nada, mis_solicitudes: { total: 1, dias: 3 } }).etiqueta).toBe('solicitud tuya en curso');
    });

    test('cargando: cifra null', () => {
        expect(resumenInventarioInicio(null)).toEqual({ tono: 'neutro', cifra: null, etiqueta: 'por resolver', filas: [] });
    });

    test('antigüedad', () => {
        expect(detalleAntiguedad(null)).toBe('');
        expect(detalleAntiguedad(0)).toBe('La más antigua es de hoy');
        expect(detalleAntiguedad(1)).toBe('La más antigua: hace 1 día');
    });
});
