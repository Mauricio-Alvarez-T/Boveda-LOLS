import MockAdapter from 'axios-mock-adapter';
import type { AxiosInstance } from 'axios';
import {
    trabajadoresAvanzadoDemo, workerDetalleDemo, documentosDemo, tiposDocDemo,
    estadosDemo, empresasDemo, obrasDemo, cargosDemo,
} from './consultasMockData';

export interface ConsultasMockOpts {
    /**
     * Se invoca cuando el usuario COMPLETA una acción dentro del demo. `tipo`:
     * 'ver-trabajador' | 'ver-doc' | 'crear' | 'editar'. (Los 2 primeros son
     * read-only → se disparan en un GET.) El runner decide qué completa cada tutorial.
     */
    onAccion?: (tipo: string) => void;
}

/**
 * Registra en la instancia `api` (axios) los endpoints de Consultas con datos de
 * ejemplo; TODO lo demás pasa al backend real (`onNoMatch: 'passthrough'`). Cubre:
 * grilla/búsqueda de trabajadores, ficha (WorkerQuickView), documentos, catálogos del
 * form, y crear/editar trabajador. Devuelve el MockAdapter → el caller DEBE
 * `.restore()` al desmontar (evita "info cruzada" con la app real).
 */
export function installConsultasMock(api: AxiosInstance, opts: ConsultasMockOpts = {}): MockAdapter {
    const mock = new MockAdapter(api, { onNoMatch: 'passthrough', delayResponse: 150 });
    const accion = (t: string) => opts.onAccion?.(t);

    // ── Grilla / búsqueda ──
    mock.onGet(/\/fiscalizacion\/trabajadores-avanzado/).reply(200, { data: trabajadoresAvanzadoDemo });

    // ── Ficha del trabajador (WorkerQuickView) ──
    // Abrir la ficha = criterio de aceptación del tutorial "consultar".
    mock.onGet(/\/trabajadores\/check-rut\//).reply(200, { exists: false, trabajador: null });
    mock.onGet(/\/trabajadores\/\d+$/).reply(() => {
        accion('ver-trabajador');
        return [200, workerDetalleDemo];
    });
    mock.onGet(/\/documentos\/download\/\d+/).reply(() => {
        accion('ver-doc');
        return [200, 'demo-doc'];
    });
    mock.onGet(/\/documentos\/trabajador\/\d+/).reply(200, documentosDemo);
    mock.onGet(/\/documentos\/tipos/).reply(200, tiposDocDemo);
    mock.onGet(/\/asistencias\/estados/).reply(200, estadosDemo);
    mock.onGet(/\/asistencias\/(periodos|reporte)/).reply(200, { data: [] });

    // ── Catálogos (filtros + selects del form) ──
    mock.onGet(/\/empresas(\?|$)/).reply(200, { data: empresasDemo });
    mock.onGet(/\/obras(\?|$)/).reply(200, { data: obrasDemo });
    mock.onGet(/\/cargos(\?|$)/).reply(200, { data: cargosDemo });

    // ── Crear / editar trabajador (CRUD) ──
    mock.onPost(/\/trabajadores$/).reply(() => {
        accion('crear');
        return [201, { data: { id: 5199 } }];
    });
    mock.onPut(/\/trabajadores\/\d+$/).reply(() => {
        accion('editar');
        return [200, { data: { ...workerDetalleDemo } }];
    });

    // ── No-op (evita passthrough si el usuario toca otras acciones) ──
    mock.onDelete(/\/trabajadores\/\d+\/depurar/).reply(200, { data: {} });
    mock.onGet(/\/asistencias\/exportar\/excel/).reply(200, 'demo-excel');
    mock.onGet(/\/usuarios\/me\/(plantillas|email-config)/).reply(200, { data: [] });
    mock.onPost(/\/fiscalizacion\/enviar-excel/).reply(200, { data: {} });
    mock.onPost(/\/asistencias\/periodos/).reply(201, { data: {} });
    mock.onDelete(/\/asistencias\/periodos\/\d+/).reply(200, { data: {} });

    return mock;
}
