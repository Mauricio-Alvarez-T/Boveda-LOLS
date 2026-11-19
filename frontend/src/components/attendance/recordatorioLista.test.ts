import { PERMISO_DIAS_DEL_MES, PERMISO_DIAS_PASADOS } from '../../utils/fechaChile';
import type { ObraSinLista } from '../dashboard/widgets/resumenSinLista';
import { etiquetaDia, recordatorioLista, textoCerradas, tituloRecordatorio } from './recordatorioLista';

// Jueves 19 de noviembre de 2026.
const HOY = '2026-11-19';
const con = (...claves: string[]) => (k: string) => claves.includes(k);
const jefe = con('asistencia.guardar', PERMISO_DIAS_DEL_MES);
const obra = (...fechas: string[]): ObraSinLista => ({
    obra_id: 7, obra: 'Obra Demo Centro', encargado: null, dotacion: 10,
    dias: fechas.map(fecha => ({ fecha, motivo: 'nadie' as const, registros: 0 })), guardadas: [], ultima: null,
});

describe('recordatorio de listas olvidadas (Marcos 2026-11-19)', () => {
    test('el jefe de obra: los del mes en curso por pasar, los de octubre cerrados', () => {
        const r = recordatorioLista(obra('2026-11-18', '2026-11-16', '2026-10-30', '2026-10-29'), HOY, jefe);
        expect(r).toEqual({ pendientes: ['2026-11-18', '2026-11-16'], cerradas: ['2026-10-30', '2026-10-29'] });
    });

    test('sin días que pueda pasar no hay cartel (aunque haya días cerrados)', () => {
        expect(recordatorioLista(obra('2026-10-30'), HOY, jefe)).toBeNull();
        expect(recordatorioLista(obra('2026-11-18'), HOY, con('asistencia.guardar'))).toBeNull();
        expect(recordatorioLista(undefined, HOY, jefe)).toBeNull();
    });

    test('títulos: ayer, un día de la semana, varios días', () => {
        expect(tituloRecordatorio(['2026-11-18'], HOY)).toBe('Se le olvidó pasar la lista de ayer');
        expect(tituloRecordatorio(['2026-11-17'], HOY)).toBe('Se le olvidó pasar la lista de anteayer');
        expect(tituloRecordatorio(['2026-11-16'], HOY)).toBe('Se le olvidó pasar la lista del lunes 16');
        expect(tituloRecordatorio(['2026-11-18', '2026-11-16'], HOY)).toBe('Se le olvidó pasar la lista en 2 días de este mes');
    });

    test('botones de cada día', () => {
        expect(etiquetaDia('2026-11-18', HOY)).toBe('Ayer');
        expect(etiquetaDia('2026-11-02', HOY)).toBe('Lunes 2');
    });

    test('días cerrados: a quién pedírselos', () => {
        expect(textoCerradas([])).toBe('');
        expect(textoCerradas(['2026-10-30'])).toBe('El viernes 30 de octubre ya cerró: ese día lo pasa RR.HH.');
        expect(textoCerradas(['2026-10-30', '2026-10-29'])).toBe('Los 2 días de octubre ya cerraron: esos los pasa RR.HH.');
    });

    test('RR.HH. (puede cualquier día): todo queda por pasar', () => {
        const r = recordatorioLista(obra('2026-11-18', '2026-10-30'), HOY, con(PERMISO_DIAS_PASADOS));
        expect(r?.cerradas).toEqual([]);
    });
});
