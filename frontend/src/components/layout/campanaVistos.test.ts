import { clavesAvisos, contarNuevos } from './campanaVistos';
import type { EnPreparacionData, SinListaData } from '../dashboard/widgets/resumenSinLista';

const sinLista = (dia: string): SinListaData => ({
    hoy: '2026-11-26', dias: [dia], obras: [{ obra_id: 7, obra: 'RIVAS VICUÑA', encargado: null, dotacion: 3, dias: [{ fecha: dia, motivo: 'solo_periodos', registros: 3 }], ultima: null }],
});
const prep: EnPreparacionData = { hoy: '2026-11-26', obras: [{ obra_id: 2, obra: 'BASCUÑAN 991', encargado: null, dotacion: 7 }] };

describe('campana del Super Administrador: el número no se queda (Marcos 2026-11-26)', () => {
    test('una clave por aviso: obra + su día más reciente; obra en preparación', () => {
        expect(clavesAvisos(sinLista('2026-11-25'), prep)).toEqual(['sl:7:2026-11-25', 'pr:2']);
        expect(clavesAvisos(null, null)).toEqual([]);
    });

    test('visto al abrir → 0 nuevos; otro día sin lista en la misma obra → vuelve a contar', () => {
        const vistos = clavesAvisos(sinLista('2026-11-25'), prep);
        expect(contarNuevos(clavesAvisos(sinLista('2026-11-25'), prep), vistos)).toBe(0);
        expect(contarNuevos(clavesAvisos(sinLista('2026-11-26'), prep), vistos)).toBe(1);
        expect(contarNuevos(clavesAvisos(sinLista('2026-11-25'), prep), [])).toBe(2);
    });
});
