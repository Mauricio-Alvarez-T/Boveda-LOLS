/**
 * Tests de los mensajes WhatsApp de la "Lista de trabajadores en actividades sugeridas".
 *
 * - Jefatura 2026-09-21: sin referencia a un día (ni a sábado); cabecera con la SEMANA.
 * - Jefatura 2026-08-17: sin horas; actividad de cada rubro debajo de su grupo;
 *   observación global al final.
 */
import { buildListaMessage, buildAsistenciaMessage, TITULO_LISTA } from './actividadesWhatsApp';
import type { ActividadSugeridaDetalle, ActividadSugeridaTrabajador } from '../../../types/actividadesSugeridas';

const trabajador = (over: Partial<ActividadSugeridaTrabajador>): ActividadSugeridaTrabajador => ({
    id: 1,
    actividad_id: 1,
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

const detalle = (over: Partial<ActividadSugeridaDetalle>): ActividadSugeridaDetalle => ({
    id: 1,
    obra_id: 22,
    obra_nombre: 'DOMEYKO',
    semana: '2026-09-21', // lunes
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

describe('buildListaMessage', () => {
    test('cabecera: título de la lista + semana lun–vie + obra; sin sábado ni fecha puntual', () => {
        const lines = buildListaMessage(base()).split('\n');
        expect(lines[0]).toBe('Buenos días');
        expect(lines[1]).toBe(`*${TITULO_LISTA}*`);
        expect(lines[2]).toBe('Semana lun 21/09 – vie 25/09 — Obra DOMEYKO');
        expect(lines.join('\n')).not.toMatch(/s[aá]bado/i);
        expect(lines.join('\n')).not.toMatch(/\d{2}-\d{2}-\d{4}/);
        expect(lines.join('\n')).not.toMatch(/citaci[oó]n/i);
    });

    test('una semana histórica guardada en sábado se muestra como su semana', () => {
        const msg = buildListaMessage(detalle({ semana: '2026-08-15T03:00:00.000Z', trabajadores: [trabajador({})] }));
        expect(msg).toContain('Semana lun 10/08 – vie 14/08 — Obra DOMEYKO');
    });

    test('la actividad del rubro va debajo de su header con el conteo', () => {
        const lines = buildListaMessage(base()).split('\n');
        const idx = lines.indexOf('*CERAMISTA* (1)');
        expect(idx).toBeGreaterThan(-1);
        expect(lines[idx + 1]).toBe('_Actividad: enchape en fachada poniente_');
        expect(lines[idx + 2]).toBe('- MORALES TASAYCO VICTOR RAUL');
    });

    test('rubro sin actividad no muestra la línea; observación global al final; footer', () => {
        const msg = buildListaMessage(detalle({
            observaciones_globales: 'traer EPP completo',
            trabajadores: [trabajador({ cargo_id: 7, cargo_nombre: 'JORNAL' })],
        }));
        expect(msg).not.toContain('_Actividad:');
        expect(msg).toContain('traer EPP completo');
        expect(msg.trim().endsWith('_Generado con Bóveda LOLS_')).toBe(true);
    });
});

describe('buildAsistenciaMessage', () => {
    test('cabecera con obra y semana; no menciona horas ni sábado', () => {
        const msg = buildAsistenciaMessage(base());
        expect(msg.split('\n')[0]).toBe('*Asistencia a actividades sugeridas*');
        expect(msg.split('\n')[1]).toBe('Obra DOMEYKO — Semana lun 21/09 – vie 25/09');
        expect(msg).not.toMatch(/\(\d+(\.\d+)?h\)/);
        expect(msg).not.toMatch(/horas/i);
        expect(msg).not.toMatch(/s[aá]bado/i);
    });

    test('la actividad del rubro va debajo de su header, antes de los nombres', () => {
        const lines = buildAsistenciaMessage(base()).split('\n');
        const idx = lines.indexOf('*CERAMISTA*');
        expect(idx).toBeGreaterThan(-1);
        expect(lines[idx + 1]).toBe('_Actividad: enchape en fachada poniente_');
        expect(lines[idx + 2]).toBe('- MORALES TASAYCO VICTOR RAUL');
    });

    test('la sección No asistieron se mantiene y la observación por trabajador va en cursiva', () => {
        const msg = buildAsistenciaMessage(detalle({
            trabajadores: [
                trabajador({ observacion: 'llegó tarde' }),
                trabajador({ id: 2, trabajador_id: 2, asistio: 0, estado: 'no_asistio', nombres: 'JOSE', apellido_paterno: 'SULLON', apellido_materno: null }),
            ],
        }));
        expect(msg).toContain('- MORALES TASAYCO VICTOR RAUL _llegó tarde_');
        expect(msg).toContain('*No asistieron:* 1');
        expect(msg).toContain('- SULLON JOSE');
        expect(msg).toContain('Asistieron: 1/2');
    });
});
