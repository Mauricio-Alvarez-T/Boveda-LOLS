import axios from 'axios';
import { installAsistenciaMock } from './asistenciaMock';

/**
 * Guard anti "info cruzada": el sandbox de Asistencia parchea el axios `api`. Estos
 * tests verifican que el parche (a) responde con datos de ejemplo y dispara el
 * callback de guardado, y (b) es REMOVIBLE → tras `restore()` el axios queda limpio
 * (no devuelve fixtures), así no contamina la app real al salir del tutorial.
 */
describe('installAsistenciaMock', () => {
    it('mockea los endpoints de asistencia y dispara onGuardado al guardar', async () => {
        const ax = axios.create();
        let guardado = false;
        const mock = installAsistenciaMock(ax, () => { guardado = true; });

        const estados = await ax.get('/asistencias/estados');
        expect(Array.isArray(estados.data.data)).toBe(true);
        expect(estados.data.data.length).toBeGreaterThan(0);

        const dia = await ax.get('/asistencias/obra/9001?fecha=2026-06-22');
        expect(dia.data.data).toEqual({ registros: [], feriado: null });

        await ax.post('/asistencias/bulk/9001', { registros: [] });
        expect(guardado).toBe(true);

        mock.restore();
    });

    it('tras restore() el axios queda limpio (no devuelve fixtures)', async () => {
        const ax = axios.create();
        const mock = installAsistenciaMock(ax);
        mock.restore();
        // Sin mock y sin baseURL, una ruta relativa no resuelve → rechaza
        // (lo importante: ya NO devuelve la fixture mockeada).
        await expect(ax.get('/asistencias/estados')).rejects.toBeDefined();
    });
});
