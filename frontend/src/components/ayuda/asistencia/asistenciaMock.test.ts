import axios from 'axios';
import { installAsistenciaMock } from './asistenciaMock';

/**
 * Guard anti "info cruzada": el sandbox de Asistencia parchea el axios `api`. Estos
 * tests verifican que el parche (a) responde con datos de ejemplo y dispara `onAccion`
 * por cada flujo, (b) el feriado tiene estado (crear → el día lo refleja → quitar), y
 * (c) es REMOVIBLE → tras `restore()` el axios queda limpio (no devuelve fixtures),
 * así no contamina la app real al salir del tutorial.
 */
const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('installAsistenciaMock', () => {
    it('responde fixtures y dispara onAccion por cada flujo', async () => {
        const ax = axios.create();
        const acciones: string[] = [];
        const mock = installAsistenciaMock(ax, { onAccion: (t) => acciones.push(t) });

        const estados = await ax.get('/asistencias/estados');
        expect(Array.isArray(estados.data.data)).toBe(true);
        expect(estados.data.data.length).toBeGreaterThan(0);

        // HOY arranca vacío; una fecha PREVIA trae registros (para "Repetir día anterior").
        const dhoy = await ax.get(`/asistencias/obra/9001?fecha=${hoy()}`);
        expect(dhoy.data.data.registros).toEqual([]);
        const dprev = await ax.get('/asistencias/obra/9001?fecha=2020-01-06');
        expect(dprev.data.data.registros.length).toBeGreaterThan(0);

        await ax.post('/asistencias/bulk/9001', { registros: [] });
        const traslado = await ax.post('/asistencias/traslado-obra', { trabajador_id: 1, obra_destino_id: 9002 });
        expect(traslado.data.data.obra_destino_nombre).toBeTruthy();

        const periodo = await ax.post('/asistencias/periodos', { trabajador_id: 1 });
        expect(periodo.data.data.dias_afectados).toBeGreaterThan(0);

        await ax.get('/sabados-extra?mes=1&anio=2026');
        const det = await ax.get('/sabados-extra/7001');
        expect(det.data.data.trabajadores.length).toBeGreaterThan(0);
        await ax.post('/sabados-extra', { obra_id: 9001 });

        expect(acciones).toEqual(
            expect.arrayContaining(['guardar', 'traslado', 'periodo-crear', 'sabado-crear']),
        );

        mock.restore();
    });

    it('feriado con estado: crear lo activa en el día y quitar lo limpia', async () => {
        const ax = axios.create();
        const acciones: string[] = [];
        const mock = installAsistenciaMock(ax, { onAccion: (t) => acciones.push(t) });

        await ax.post('/feriados', { nombre: 'Día de prueba', fecha: hoy() });
        expect(acciones).toContain('feriado-crear');
        const conFeriado = await ax.get(`/asistencias/obra/9001?fecha=${hoy()}`);
        expect(conFeriado.data.data.feriado).toBeTruthy();

        await ax.delete('/feriados/8001');
        expect(acciones).toContain('feriado-quitar');
        const sinFeriado = await ax.get(`/asistencias/obra/9001?fecha=${hoy()}`);
        expect(sinFeriado.data.data.feriado).toBeNull();

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
