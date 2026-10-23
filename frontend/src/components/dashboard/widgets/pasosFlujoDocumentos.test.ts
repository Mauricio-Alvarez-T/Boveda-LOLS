import { diasTexto, estadoPaso, pasoInicial, pasosFlujo, type FlujoRespuesta } from './pasosFlujoDocumentos';
import type { AlertasDocumentos } from '../../documentos-fisicos/documentosAlertas';

const doc = (id: number, dias: number) => ({ documento_id: id, tipo_nombre: 'Contrato', trabajador_id: 1, trabajador_nombre: 'Pérez Ana', rut: '1-9', obra_nombre: 'Sur', dias });
const lote = (id: number, estado: 'pendiente_retiro' | 'en_terreno', extra = {}) => ({
    id, portador_id: 7, portador_nombre: 'Jhoan', creado_por: 3, creado_por_nombre: 'Matías', estado, observacion: null,
    creado_en: '2026-10-21 08:00:00', retirado_en: '2026-10-21 09:00:00', cerrado_en: null, total: 2, pendientes: 0, en_terreno: 2,
    firmados: 0, sin_firma: 0, no_entregados: 0, tenencia: null, ...extra,
});
const base: FlujoRespuesta = {
    hoy: '2026-10-23', desde_firmados: '2026-10-19',
    sin_imprimir: { n: 2, items: [doc(1, 9), doc(2, 1)] },
    impresos: { n: 0, items: [] },
    en_oficina: [lote(9, 'pendiente_retiro')],
    en_terreno: [lote(5, 'en_terreno', { tenencia: { dia: 5, max: 4, vence_el: '2026-10-22', atrasado: true, dias_atraso: 1 } })],
    firmados: { n: 1, items: [{ ...doc(3, 0), firmado_el: '2026-10-20' }] },
};

describe('pasosFlujo', () => {
    it('marca fuera de plazo con las alertas B7 y la tenencia', () => {
        const alertas = { items: [{ documento_id: 1, critical: true }], lotes: { sin_confirmar: { items: [] }, en_terreno: { items: [] } } } as unknown as AlertasDocumentos;
        const p = pasosFlujo(base, alertas, new Date(2026, 9, 23, 12));
        expect(p.map(x => x.key)).toEqual(['sin_imprimir', 'impresos', 'en_oficina', 'en_terreno', 'firmados']);
        expect(p[0]).toMatchObject({ n: 2, fuera: 1 });
        expect(p[0].filas[0]).toMatchObject({ dias: '9 días', tono: 'critico', sub: 'Pérez Ana · Sur' });
        expect(p[3]).toMatchObject({ n: 1, fuera: 1 });
        expect(p[3].filas[0]).toMatchObject({ dias: '1 día de atraso', tono: 'critico', quien: 'Con Jhoan', loteId: 5 });
        expect(p[3].filas[0].aviso).toMatch(/^Hola Jhoan, el lote #5 \(2 documentos\) venció el jue 22: /);
        expect(p[2].filas[0]).toMatchObject({ loteId: 9 });
        expect(p[2].filas[0].aviso).toMatch(/^Hola Jhoan, tienes el lote #9 con 2 documentos esperando/);
        expect(p[0].filas[0]).toMatchObject({ documentoId: 1 });
        expect(p[4].filas[0]).toMatchObject({ dias: 'mar 20', tono: 'listo' });
        expect(pasoInicial(p)).toBe(0);
        expect(estadoPaso(p[0])).toBe('1 fuera de plazo');
        expect(estadoPaso(p[1])).toBe('nada pendiente');
        expect(estadoPaso(p[4])).toBe('cerrados');
    });

    it('lote sin portador (usuario eliminado): sin mensaje de WhatsApp', () => {
        const p = pasosFlujo({ ...base, en_oficina: [lote(9, 'pendiente_retiro', { portador_id: null, portador_nombre: null })] }, null);
        expect(p[2].filas[0].aviso).toBeNull();
    });

    it('sin nada fuera de plazo abre el primer paso con algo pendiente', () => {
        const p = pasosFlujo({ ...base, sin_imprimir: { n: 0, items: [] }, en_terreno: [] }, null);
        expect(pasoInicial(p)).toBe(2);
    });

    it('diasTexto', () => {
        expect(diasTexto(0)).toBe('hoy');
        expect(diasTexto(1)).toBe('1 día');
        expect(diasTexto(4)).toBe('4 días');
    });
});
