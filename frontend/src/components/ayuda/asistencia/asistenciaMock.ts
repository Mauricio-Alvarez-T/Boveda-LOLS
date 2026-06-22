import MockAdapter from 'axios-mock-adapter';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
    estadosDemo, trabajadoresDemo, horariosDemo,
    obraDemo2, registrosDiaPrevioDemo, periodosDemo, sabadosDemo, sabadoDetalleDemo,
} from './asistenciaMockData';

export interface AsistenciaMockOpts {
    /**
     * Se invoca cuando el usuario COMPLETA una acción dentro del demo. El `tipo`
     * identifica el flujo: 'guardar' | 'traslado' | 'feriado-crear' | 'feriado-quitar'
     * | 'periodo-crear' | 'periodo-quitar' | 'sabado-crear' | 'sabado-asistencia'.
     * El runner decide qué acción completa cada tutorial.
     */
    onAccion?: (tipo: string) => void;
}

/** Fecha local de HOY (YYYY-MM-DD) — coincide con la que usa la pantalla diaria. */
function hoyLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Extrae el query `fecha=YYYY-MM-DD` de la url o de config.params. */
function fechaDe(config: AxiosRequestConfig): string | null {
    const m = (config.url || '').match(/fecha=(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const p = (config.params as { fecha?: unknown } | undefined)?.fecha;
    return typeof p === 'string' ? p.slice(0, 10) : null;
}

/**
 * Registra en la instancia `api` (axios) los endpoints de Asistencia con datos de
 * ejemplo; TODO lo demás pasa al backend real (`onNoMatch: 'passthrough'`).
 * Cubre los flujos: diaria, traslado de obra, feriado (con estado), repetir día,
 * exportar Excel/WhatsApp, justificar período y sábado extra.
 * Extraído de AsistenciaSandbox para ser testeable sin React ni `services/api`.
 *
 * Devuelve el `MockAdapter` → el caller DEBE llamar `.restore()` al desmontar para
 * no dejar el `api` global parcheado (evita "info cruzada" con la app real).
 */
export function installAsistenciaMock(api: AxiosInstance, opts: AsistenciaMockOpts = {}): MockAdapter {
    const mock = new MockAdapter(api, { onNoMatch: 'passthrough', delayResponse: 150 });
    const accion = (t: string) => opts.onAccion?.(t);

    // Estado interno del sandbox (se reinicia al reinstalar el mock).
    let feriadoActivo: { id: number; nombre: string; fecha: string } | null = null;

    // ── Lecturas base ──
    mock.onGet('/asistencias/estados').reply(200, { data: estadosDemo });
    mock.onGet(/\/trabajadores(\?|$)/).reply(200, { data: trabajadoresDemo });
    mock.onGet(/\/config-horarios\/obra\//).reply(200, { data: horariosDemo });
    mock.onGet(/\/asistencias\/periodos/).reply(200, { data: periodosDemo });
    mock.onGet(/\/asistencias\/alertas\//).reply(200, { data: [] });
    mock.onGet(/\/asistencias\/reporte/).reply(200, { data: [] });

    // Día: HOY arranca vacío (refleja el feriado si está activo); una fecha PREVIA
    // trae registros (para que "Repetir día anterior" siempre encuentre un día).
    mock.onGet(/\/asistencias\/obra\//).reply((config) => {
        const fecha = fechaDe(config);
        const esHoy = !fecha || fecha === hoyLocal();
        return [200, {
            data: {
                registros: esHoy ? [] : registrosDiaPrevioDemo,
                feriado: esHoy ? feriadoActivo : null,
            },
        }];
    });

    // ── Acciones de la pantalla diaria ──
    mock.onPost(/\/asistencias\/bulk\//).reply(() => {
        accion('guardar');
        return [200, { data: { message: 'Asistencia guardada' } }];
    });
    mock.onPost(/\/asistencias\/traslado-obra$/).reply(() => {
        accion('traslado');
        return [200, { data: { obra_destino_nombre: obraDemo2.nombre } }];
    });

    // Feriado (con estado): crear lo activa, quitar lo limpia; el GET del día lo refleja.
    mock.onPost(/\/feriados$/).reply((config) => {
        let nombre = 'Feriado de ejemplo';
        try { const b = JSON.parse(config.data || '{}'); if (b.nombre) nombre = b.nombre; } catch { /* body no-JSON */ }
        feriadoActivo = { id: 8001, nombre, fecha: hoyLocal() };
        accion('feriado-crear');
        return [201, { data: feriadoActivo }];
    });
    mock.onDelete(/\/feriados\/\d+/).reply(() => {
        feriadoActivo = null;
        accion('feriado-quitar');
        return [200, { data: { message: 'Feriado eliminado' } }];
    });

    // ── Justificar período (modal de calendario) ──
    mock.onPost(/\/asistencias\/periodos$/).reply(() => {
        accion('periodo-crear');
        return [200, { data: { dias_afectados: 5 } }];
    });
    mock.onDelete(/\/asistencias\/periodos\/\d+/).reply(() => {
        accion('periodo-quitar');
        return [200, { data: { message: 'Período eliminado' } }];
    });

    // ── Sábado extra ──
    mock.onGet(/\/sabados-extra\/\d+$/).reply(200, { data: sabadoDetalleDemo });
    mock.onGet(/\/sabados-extra(\?|$)/).reply(200, { data: sabadosDemo });
    mock.onPost(/\/sabados-extra$/).reply(() => {
        accion('sabado-crear');
        return [201, { data: { id: sabadoDetalleDemo.id } }];
    });
    mock.onPut(/\/sabados-extra\/\d+\/citacion$/).reply(200, { data: { message: 'ok' } });
    mock.onPut(/\/sabados-extra\/\d+\/asistencia$/).reply(() => {
        accion('sabado-asistencia');
        return [200, { data: { message: 'ok' } }];
    });
    mock.onDelete(/\/sabados-extra\/\d+$/).reply(200, { data: { message: 'ok' } });

    // ── Exportar / compartir (devuelven algo válido; la descarga/copia es client-side) ──
    mock.onGet(/\/asistencias\/exportar\/excel/).reply(() => {
        accion('export-excel');
        return [200, 'demo-excel'];
    });
    mock.onGet(/\/asistencias\/public-report-token/).reply(() => {
        accion('whatsapp');
        return [200, { data: { token: 'demo' } }];
    });

    return mock;
}
