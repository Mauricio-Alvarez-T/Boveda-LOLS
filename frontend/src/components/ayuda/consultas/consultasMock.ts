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
    // Ficha-resumen (stats de contrato/asistencia) — datos de ejemplo.
    mock.onGet(/\/trabajadores\/\d+\/resumen/).reply(200, {
        data: {
            fecha_ingreso: '2025-01-01', fecha_desvinculacion: null, activo: true,
            dias_trabajados: 120, faltas: 3, dias_presente: 118, dias_vacaciones: 5, dias_licencia: 2, dias_registrados: 130,
        },
    });
    mock.onGet(/\/documentos\/download\/\d+/).reply(() => {
        accion('ver-doc');
        return [200, 'demo-doc'];
    });
    mock.onGet(/\/documentos\/trabajador\/\d+/).reply(200, documentosDemo);
    mock.onGet(/\/documentos\/tipos/).reply(200, tiposDocDemo);
    // Documentos laborales generados (plan Gestiones B2): catálogo fijo, lista vacía y emisiones no-op.
    mock.onGet(/\/documentos-laborales\/catalogo/).reply(200, {
        data: {
            kit: [
                { codigo: 'CONTRATO', titulo: 'Contrato de Trabajo', version: '1.0' }, { codigo: 'ODI_D40', titulo: 'ODI – Obligación de Informar (DS 44)', version: '1.0' },
                { codigo: 'DAS', titulo: 'Declaración Derecho a Saber', version: '1.0' }, { codigo: 'PTS_ALTURA', titulo: 'Procedimiento de Trabajo Seguro en Altura', version: '1.0' },
                { codigo: 'EPP_RECEPCION', titulo: 'Recepción de Implementos de Seguridad', version: '1.0' }, { codigo: 'RI_RECEPCION', titulo: 'Recepción Reglamento Interno', version: '1.0' },
            ],
            emitibles: [], epp_default: ['CASCO', 'GUANTES', 'ARNÉS', 'ZAPATOS DE SEGURIDAD', 'ANTIPARRAS'], amonestacion_motivos: ['Atraso reiterado en el ingreso', 'Inasistencia injustificada'],
        },
    });
    mock.onGet(/\/documentos-laborales\/trabajador\/\d+/).reply(200, { data: [] });
    mock.onPost(/\/documentos-laborales\/emitir\/\d+/).reply(201, { data: { documento_id: 7301, nombre_archivo: 'Amonestacion_demo.doc', tipo_codigo: 'AMONESTACION', estado: 'generado' } });
    mock.onPost(/\/documentos-laborales\/kit-ingreso\/\d+/).reply(201, { data: { trabajador_id: 5101, emitidos: [] } });
    mock.onGet(/\/documentos-laborales\/\d+\/(download|html)/).reply(200, { data: { html: '<!DOCTYPE html><html><body>demo</body></html>', titulo: 'Demo' } });
    mock.onGet(/\/solicitudes-ingreso\/\d+\/doc/).reply(200, 'demo-doc');
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
    // Desvinculación con causal (plan Gestiones B4): catálogo de ejemplo + no-ops (la demo no desvincula a nadie).
    mock.onGet(/\/trabajadores\/catalogos\/causales-desvinculacion/).reply(200, {
        data: [
            { codigo: 'RENUNCIA', articulo: '159', inciso: '2', articulo_texto: 'Artículo 159, N° 2 del Código del Trabajo', nombre: 'Renuncia voluntaria del trabajador', grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
            { codigo: 'VENCIMIENTO_PLAZO', articulo: '159', inciso: '4', articulo_texto: 'Artículo 159, N° 4 del Código del Trabajo', nombre: 'Vencimiento del plazo convenido en el contrato', grupo: 'Artículo 159', sugiere_no_recontratar: false, requiere_detalle: false },
        ],
    });
    mock.onGet(/\/trabajadores\/\d+\/desvinculaciones/).reply(200, { data: [] });
    mock.onPut(/\/trabajadores\/\d+\/(desvincular|reactivar)$/).reply(200, { data: { trabajador_id: 5199 } });
    mock.onGet(/\/asistencias\/exportar\/excel/).reply(200, 'demo-excel');
    mock.onGet(/\/usuarios\/me\/(plantillas|email-config)/).reply(200, { data: [] });
    mock.onPost(/\/fiscalizacion\/enviar-excel/).reply(200, { data: {} });
    mock.onPost(/\/asistencias\/periodos/).reply(201, { data: {} });
    mock.onDelete(/\/asistencias\/periodos\/\d+/).reply(200, { data: {} });

    return mock;
}
