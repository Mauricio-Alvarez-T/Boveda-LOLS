import { resumenSync, type ResultadoSync } from './feriadosSync';

const base: ResultadoSync = { year: 2027, fuente: 'boostr', fuenteNombre: 'boostr.cl', parcial: false, count: 17, nuevos: 0, actualizados: 0, respetados: 0 };

describe('resumenSync (mensaje del botón Sincronizar feriados)', () => {
    it('todo nuevo: cuántos se agregaron y de qué fuente', () => {
        expect(resumenSync({ ...base, nuevos: 17 })).toEqual({
            tono: 'ok',
            titulo: '2027: 17 feriados agregados',
            detalle: '17 feriados nacionales según boostr.cl.',
        });
    });

    it('nada cambió: lo dice, sin números confusos', () => {
        expect(resumenSync(base).titulo).toBe('Los feriados de 2027 ya estaban al día');
    });

    it('singulares y mezcla de agregados/actualizados; avisa los feriados de obra respetados', () => {
        const r = resumenSync({ ...base, nuevos: 1, actualizados: 2, respetados: 1 });
        expect(r.titulo).toBe('2027: 1 feriado agregado · 2 actualizados');
        expect(r.detalle).toContain('1 fecha ya tenía un feriado de obra: se dejó como estaba.');
    });

    it('fuente parcial (Nager): tono de aviso y pide revisar los feriados adicionales por ley', () => {
        const r = resumenSync({ ...base, fuente: 'nager', fuenteNombre: 'Nager.Date', parcial: true, nuevos: 16, count: 16 });
        expect(r.tono).toBe('aviso');
        expect(r.detalle).toMatch(/17 de septiembre/);
        expect(r.detalle).toContain('según Nager.Date');
    });
});
