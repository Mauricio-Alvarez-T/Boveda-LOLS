import MockAdapter from 'axios-mock-adapter';
import type { AxiosInstance } from 'axios';
import { estadosDemo, trabajadoresDemo, horariosDemo } from './asistenciaMockData';

/**
 * Registra en la instancia `api` (axios) los endpoints de Asistencia con datos de
 * ejemplo; TODO lo demás pasa al backend real (`onNoMatch: 'passthrough'`).
 * Extraído de AsistenciaSandbox para ser testeable sin React ni `services/api`.
 *
 * Devuelve el `MockAdapter` → el caller DEBE llamar `.restore()` al desmontar para
 * no dejar el `api` global parcheado (evita "info cruzada" con la app real).
 */
export function installAsistenciaMock(api: AxiosInstance, onGuardado?: () => void): MockAdapter {
    const mock = new MockAdapter(api, { onNoMatch: 'passthrough', delayResponse: 150 });
    mock.onGet('/asistencias/estados').reply(200, { data: estadosDemo });
    mock.onGet(/\/trabajadores(\?|$)/).reply(200, { data: trabajadoresDemo });
    mock.onGet(/\/asistencias\/obra\//).reply(200, { data: { registros: [], feriado: null } });
    mock.onGet(/\/config-horarios\/obra\//).reply(200, { data: horariosDemo });
    mock.onGet(/\/asistencias\/periodos/).reply(200, { data: [] });
    mock.onGet(/\/asistencias\/alertas\//).reply(200, { data: [] });
    mock.onPost(/\/asistencias\/bulk\//).reply(() => {
        onGuardado?.();
        return [200, { data: { message: 'Asistencia guardada' } }];
    });
    return mock;
}
