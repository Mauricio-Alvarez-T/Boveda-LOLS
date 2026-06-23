import MockAdapter from 'axios-mock-adapter';
import type { AxiosInstance } from 'axios';
import {
    vehiculosDemo, empresaDemo, conductoresDemo, vehiculoNuevoDemo, documentoNuevoDemo,
} from './vehiculosMockData';

export interface VehiculosMockOpts {
    /**
     * Se invoca cuando el usuario COMPLETA una acción dentro del demo. El `tipo`
     * identifica el flujo: 'crear' | 'editar' | 'doc-subir'. El runner decide qué
     * acción completa cada tutorial.
     */
    onAccion?: (tipo: string) => void;
}

/**
 * Registra en la instancia `api` (axios) los endpoints de Vehículos con datos de
 * ejemplo; TODO lo demás pasa al backend real (`onNoMatch: 'passthrough'`).
 * Cubre: listado/detalle de vehículos, empresas de flota, conductores, documentos
 * (subida multipart) y los endpoints de revisiones/mantenciones (no-op, por si el
 * usuario los toca). Devuelve el MockAdapter → el caller DEBE `.restore()` al
 * desmontar para no dejar el `api` global parcheado (evita "info cruzada").
 */
export function installVehiculosMock(api: AxiosInstance, opts: VehiculosMockOpts = {}): MockAdapter {
    const mock = new MockAdapter(api, { onNoMatch: 'passthrough', delayResponse: 150 });
    const accion = (t: string) => opts.onAccion?.(t);

    // ── Lecturas (más específicas primero) ──
    mock.onGet(/\/vehiculos\/\d+\/documentos\/\d+\/download/).reply(200, 'demo-doc');
    mock.onGet(/\/vehiculos\/\d+\/documentos/).reply(200, { data: [] });
    mock.onGet(/\/vehiculos\/\d+\/revisiones/).reply(200, { data: [] });
    mock.onGet(/\/vehiculos\/\d+\/mantenciones/).reply(200, { data: [] });
    mock.onGet(/\/vehiculos(\?|$)/).reply(200, { data: vehiculosDemo });
    mock.onGet(/\/empresas-vehiculos/).reply(200, { data: [empresaDemo] });
    mock.onGet(/\/conductores/).reply(200, { data: conductoresDemo });

    // ── Acciones que completan un tutorial ──
    mock.onPost(/\/vehiculos\/\d+\/documentos/).reply(() => {
        accion('doc-subir');
        return [201, { data: documentoNuevoDemo }];
    });
    mock.onPost(/\/vehiculos$/).reply(() => {
        accion('crear');
        return [201, { data: vehiculoNuevoDemo }];
    });
    mock.onPut(/\/vehiculos\/\d+$/).reply(() => {
        accion('editar');
        return [200, { data: { ...vehiculosDemo[0] } }];
    });

    // Revisión técnica/gases y mantención = tipos "data" del panel de documentos.
    mock.onPost(/\/vehiculos\/\d+\/revisiones/).reply(() => {
        accion('revision');
        return [201, { data: {} }];
    });
    mock.onPost(/\/vehiculos\/\d+\/mantenciones/).reply(() => {
        accion('mantencion');
        return [201, { data: {} }];
    });

    // ── No-op para no romper si el usuario toca otras acciones (passthrough evitado) ──
    mock.onPut(/\/vehiculos\/\d+\/revisiones\/\d+/).reply(200, { data: {} });
    mock.onPut(/\/vehiculos\/\d+\/mantenciones\/\d+/).reply(200, { data: {} });
    mock.onDelete(/\/vehiculos\/\d+\/documentos\/\d+/).reply(200, { data: {} });
    mock.onDelete(/\/vehiculos\/\d+\/(revisiones|mantenciones)\/\d+/).reply(200, { data: {} });
    mock.onDelete(/\/vehiculos\/\d+$/).reply(200, { data: {} });
    mock.onPost(/\/empresas-vehiculos$/).reply(201, { data: { id: 9199 } });
    mock.onPut(/\/empresas-vehiculos\/\d+/).reply(200, { data: {} });
    mock.onDelete(/\/empresas-vehiculos\/\d+/).reply(200, { data: {} });

    return mock;
}
