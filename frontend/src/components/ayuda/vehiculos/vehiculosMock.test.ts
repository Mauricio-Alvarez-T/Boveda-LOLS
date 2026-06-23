import axios from 'axios';
import { installVehiculosMock } from './vehiculosMock';

/**
 * Guard anti "info cruzada": el sandbox de Vehículos parchea el axios `api`. Verifica
 * que (a) responde fixtures y dispara `onAccion` por cada flujo, y (b) es REMOVIBLE →
 * tras `restore()` el axios queda limpio (no contamina la app real al salir).
 */
describe('installVehiculosMock', () => {
    it('responde fixtures y dispara onAccion por flujo', async () => {
        const ax = axios.create();
        const acciones: string[] = [];
        const mock = installVehiculosMock(ax, { onAccion: (t) => acciones.push(t) });

        const lista = await ax.get('/vehiculos');
        expect(Array.isArray(lista.data.data)).toBe(true);
        expect(lista.data.data.length).toBeGreaterThan(0);

        const empresas = await ax.get('/empresas-vehiculos?activo=true&limit=1000');
        expect(empresas.data.data.length).toBeGreaterThan(0);

        const docs = await ax.get('/vehiculos/5001/documentos');
        expect(docs.data.data).toEqual([]);

        await ax.post('/vehiculos', { patente: 'ABCD12' });
        await ax.put('/vehiculos/5001', { color: 'Azul' });
        await ax.post('/vehiculos/5001/documentos', { categoria: 'permiso_circulacion' });
        await ax.post('/vehiculos/5001/revisiones', { tipo: 'tecnica' });
        await ax.post('/vehiculos/5001/mantenciones', { taller: 'Taller demo' });

        expect(acciones).toEqual(expect.arrayContaining(['crear', 'editar', 'doc-subir', 'revision', 'mantencion']));

        mock.restore();
    });

    it('tras restore() el axios queda limpio (no devuelve fixtures)', async () => {
        const ax = axios.create();
        const mock = installVehiculosMock(ax);
        mock.restore();
        await expect(ax.get('/vehiculos')).rejects.toBeDefined();
    });
});
