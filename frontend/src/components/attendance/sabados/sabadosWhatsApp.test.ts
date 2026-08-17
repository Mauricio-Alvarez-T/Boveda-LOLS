/**
 * Tests de los builders de mensajes WhatsApp de Sábados Extra.
 *
 * Reglas fijadas por jefatura (2026-08-17):
 * - SIN horas: el sábado solo registra asistió/no asistió.
 * - La tarea de cada rubro va DEBAJO de su grupo (no en bloque global al final).
 * - La observación global se mantiene al final del mensaje si existe.
 */
import { buildCitacionMessage, buildAsistenciaMessage } from './sabadosWhatsApp';
import type { SabadoExtraDetalle, SabadoExtraTrabajador } from '../../../types/sabadosExtra';

const trabajador = (over: Partial<SabadoExtraTrabajador>): SabadoExtraTrabajador => ({
    id: 1,
    sabado_id: 1,
    trabajador_id: 1,
    obra_origen_id: null,
    obra_origen_nombre: null,
    citado: 1,
    asistio: 1,
    estado: 'asistio',
    observacion: null,
    rut: '1-1',
    nombres: 'VICTOR RAUL',
    apellido_paterno: 'MORALES',
    apellido_materno: 'TASAYCO',
    cargo_id: 3,
    cargo_nombre: 'CERAMISTA',
    ...over,
});

const detalle = (over: Partial<SabadoExtraDetalle>): SabadoExtraDetalle => ({
    id: 1,
    obra_id: 22,
    obra_nombre: 'DOMEYKO',
    fecha: '2026-08-15',
    estado: 'realizada',
    observaciones_globales: null,
    observaciones_por_cargo: null,
    creado_por: 1,
    creado_por_nombre: null,
    actualizado_por: null,
    created_at: '',
    updated_at: '',
    trabajadores: [],
    ...over,
});

const base = () => detalle({
    observaciones_por_cargo: { '3': 'enchape en fachada poniente' },
    trabajadores: [
        trabajador({ id: 1, trabajador_id: 1 }),
        trabajador({
            id: 2, trabajador_id: 2, nombres: 'LUIS HUMBERTO', apellido_paterno: 'RUIZ',
            apellido_materno: 'OVALLE', cargo_id: 7, cargo_nombre: 'JORNAL',
        }),
    ],
});

describe('buildAsistenciaMessage (sin horas + tareas por rubro)', () => {
    test('no menciona horas en ninguna línea', () => {
        const msg = buildAsistenciaMessage(base());
        expect(msg).not.toMatch(/\(\d+(\.\d+)?h\)/);
        expect(msg).not.toMatch(/horas/i);
    });

    test('la tarea del rubro va debajo de su header, antes de los nombres', () => {
        const lines = buildAsistenciaMessage(base()).split('\n');
        const idx = lines.indexOf('*CERAMISTA*');
        expect(idx).toBeGreaterThan(-1);
        expect(lines[idx + 1]).toBe('_Tarea: enchape en fachada poniente_');
        expect(lines[idx + 2]).toBe('- MORALES TASAYCO VICTOR RAUL');
    });

    test('rubro sin tarea no muestra línea Tarea', () => {
        const lines = buildAsistenciaMessage(base()).split('\n');
        const idx = lines.indexOf('*JORNAL*');
        expect(idx).toBeGreaterThan(-1);
        expect(lines[idx + 1]).toBe('- RUIZ OVALLE LUIS HUMBERTO');
    });

    test('observación global sola aparece al final (fallback)', () => {
        const msg = buildAsistenciaMessage(detalle({
            observaciones_globales: 'coordinar con bodega',
            trabajadores: [trabajador({})],
        }));
        expect(msg).toContain('coordinar con bodega');
        expect(msg).not.toContain('_Tarea:');
    });

    test('la sección No asistieron se mantiene', () => {
        const msg = buildAsistenciaMessage(detalle({
            trabajadores: [
                trabajador({}),
                trabajador({ id: 2, trabajador_id: 2, asistio: 0, estado: 'no_asistio', nombres: 'JOSE', apellido_paterno: 'SULLON', apellido_materno: null }),
            ],
        }));
        expect(msg).toContain('*No asistieron:* 1');
        expect(msg).toContain('- SULLON JOSE');
        expect(msg).toContain('Asistieron: 1/2');
    });
});

describe('buildCitacionMessage (tareas por rubro)', () => {
    test('ya no existe el bloque global "Trabajos a realizar:"', () => {
        const msg = buildCitacionMessage(base());
        expect(msg).not.toContain('*Trabajos a realizar:*');
    });

    test('la tarea del rubro va debajo de su header con el conteo', () => {
        const lines = buildCitacionMessage(base()).split('\n');
        const idx = lines.indexOf('*CERAMISTA* (1)');
        expect(idx).toBeGreaterThan(-1);
        expect(lines[idx + 1]).toBe('_Tarea: enchape en fachada poniente_');
        expect(lines[idx + 2]).toBe('- MORALES TASAYCO VICTOR RAUL');
    });

    test('observación global se conserva al final si existe', () => {
        const msg = buildCitacionMessage(detalle({
            observaciones_globales: 'traer EPP completo',
            trabajadores: [trabajador({})],
        }));
        expect(msg).toContain('traer EPP completo');
        expect(msg).toContain('_Generado con Bóveda LOLS_');
    });
});
