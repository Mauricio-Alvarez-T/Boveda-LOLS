import axios from 'axios';
import { installConsultasMock } from './consultasMock';

/**
 * Guard anti "info cruzada": el sandbox de Consultas parchea el axios `api`. Verifica
 * que (a) responde fixtures y dispara `onAccion` por flujo (read-only en GET, CRUD en
 * POST/PUT), y (b) es REMOVIBLE → tras `restore()` el axios queda limpio.
 */
describe('installConsultasMock', () => {
    it('responde fixtures y dispara onAccion por flujo', async () => {
        const ax = axios.create();
        const acciones: string[] = [];
        const mock = installConsultasMock(ax, { onAccion: (t) => acciones.push(t) });

        const grid = await ax.get('/fiscalizacion/trabajadores-avanzado?q=');
        expect(Array.isArray(grid.data.data)).toBe(true);
        expect(grid.data.data.length).toBeGreaterThan(0);

        // check-rut NO debe confundirse con el detalle por id.
        const chk = await ax.get('/trabajadores/check-rut/11.111.111-1');
        expect(chk.data.exists).toBe(false);

        const ficha = await ax.get('/trabajadores/5101');
        expect(ficha.data.id).toBeTruthy();

        await ax.get('/documentos/download/7201');
        await ax.post('/trabajadores', { rut: '9.999.999-9' });
        await ax.put('/trabajadores/5101', { nombres: 'Juan Carlos' });

        expect(acciones).toEqual(
            expect.arrayContaining(['ver-trabajador', 'ver-doc', 'crear', 'editar']),
        );

        mock.restore();
    });

    it('tras restore() el axios queda limpio (no devuelve fixtures)', async () => {
        const ax = axios.create();
        const mock = installConsultasMock(ax);
        mock.restore();
        await expect(ax.get('/fiscalizacion/trabajadores-avanzado')).rejects.toBeDefined();
    });
});
