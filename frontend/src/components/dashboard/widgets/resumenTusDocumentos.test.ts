import { resumenTusDocumentos } from './resumenTusDocumentos';
import type { LoteConDocumentos, MisLotesRespuesta } from '../../documentos-fisicos/documentosFisicos';

const lote = (id: number, extra: Partial<LoteConDocumentos>): LoteConDocumentos => ({
    id, portador_id: 7, portador_nombre: 'Jhoan', creado_por: 3, creado_por_nombre: 'Matías', estado: 'en_terreno', observacion: null,
    creado_en: '2026-10-19 08:00:00', retirado_en: '2026-10-19 09:00:00', cerrado_en: null, total: 2, pendientes: 0, en_terreno: 2,
    firmados: 0, sin_firma: 0, no_entregados: 0, tenencia: null, documentos: [], ...extra,
});
const ten = (dia: number) => ({ dia, max: 4, vence_el: '2026-10-22', atrasado: dia > 4, dias_atraso: Math.max(0, dia - 4) });

describe('resumenTusDocumentos', () => {
    it('sin nada: verde y 0 por entregar', () => {
        const r = resumenTusDocumentos({ en_oficina: [], en_mano: [], devueltos_semana: 0 });
        expect(r).toMatchObject({ porEntregar: 0, atrasados: 0, tono: 'verde' });
        expect(r.filas.map(f => f.sub)).toEqual(['Nada por retirar', 'Nada en terreno', 'Aún nada esta semana']);
    });

    it('un lote atrasado manda: rojo, y suma oficina + manos', () => {
        const m: MisLotesRespuesta = {
            en_oficina: [lote(9, { estado: 'pendiente_retiro', pendientes: 3, en_terreno: 0 })],
            en_mano: [lote(5, { en_terreno: 4, tenencia: ten(6) }), lote(7, { en_terreno: 2, tenencia: ten(2) })],
            devueltos_semana: 4,
        };
        const r = resumenTusDocumentos(m);
        expect(r).toMatchObject({ porEntregar: 9, atrasados: 1, tono: 'rojo' });
        expect(r.filas[0]).toMatchObject({ n: 3, tono: 'ambar', sub: '1 lote · retíralo y confirma en Bóveda' });
        expect(r.filas[1]).toMatchObject({ n: 6, tono: 'rojo', sub: '1 lote fuera de plazo: devuélvelos a RRHH' });
        expect(r.filas[2]).toMatchObject({ n: 4, tono: 'verde' });
    });

    it('en plazo: azul y dice en qué día va el más antiguo', () => {
        const r = resumenTusDocumentos({ en_oficina: [], en_mano: [lote(7, { tenencia: ten(2) })], devueltos_semana: 0 });
        expect(r.tono).toBe('azul');
        expect(r.filas[1].sub).toBe('1 lote · el más antiguo va en el día 2 de 4');
    });

    it('último día: ámbar', () => {
        expect(resumenTusDocumentos({ en_oficina: [], en_mano: [lote(7, { tenencia: ten(4) })], devueltos_semana: 0 }).tono).toBe('ambar');
    });
});
