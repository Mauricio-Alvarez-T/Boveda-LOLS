import {
    enumerar, fechaLarga, mensajeFaltasHoy, mensajeGrupoFaltas, mensajeLoteOficina, mensajeLoteTerreno, mensajeObrasSinGuardar,
    mensajePatronFinde, PIE_WHATSAPP as PIE,
} from './mensajesWhatsApp';

describe('piezas', () => {
    test('enumerar', () => {
        expect(enumerar([])).toBe('');
        expect(enumerar(['a'])).toBe('a');
        expect(enumerar(['a', 'b'])).toBe('a y b');
        expect(enumerar(['a', 'b', 'c'])).toBe('a, b y c');
    });

    test('fecha larga sin correrse por zona horaria', () => {
        expect(fechaLarga('2026-10-23')).toBe('viernes 23 de octubre');
        expect(fechaLarga('2026-11-01 08:00:00')).toBe('domingo 1 de noviembre');
    });
});

describe('ficha de faltas reiteradas', () => {
    const carla = {
        nombres: 'Carla', apellido_paterno: 'Simulado', obra_nombre: 'Obra Demo Sur', total_faltas: 2,
        fechas: ['2026-10-15', '2026-10-16'], alertas: [{ tipo: 'consecutivas' as const, mensaje: '' }],
    };

    test('nombre en negrita, obra, días con «hoy» y la regla', () => {
        expect(mensajeGrupoFaltas(carla, '2026-10-16')).toBe(
            'Hola, consulta por *Carla Simulado* (Obra Demo Sur): lleva 2 faltas sin justificar en octubre, '
            + 'el jueves 15 y hoy viernes 16 (2 días seguidos). ¿Alguien sabe qué pasó? '
            + `Si tuvo licencia o permiso, por favor envíen el respaldo para justificarlas.${PIE}`);
    });

    test('días pasados con «el» al comienzo y varias reglas en orden', () => {
        const t = {
            ...carla, total_faltas: 3, fechas: ['2026-10-05', '2026-10-12', '2026-10-13'],
            alertas: [{ tipo: 'acumuladas' as const, mensaje: '' }, { tipo: 'lunes' as const, mensaje: '' }, { tipo: 'consecutivas' as const, mensaje: '' }],
        };
        expect(mensajeGrupoFaltas(t, '2026-10-23')).toContain(
            'lleva 3 faltas sin justificar en octubre, el lunes 5, lunes 12 y martes 13 (2 días seguidos, 2 lunes y 3 o más días).');
    });

    test('sin obra ni fechas no deja huecos; una falta en singular', () => {
        const t = { ...carla, obra_nombre: null, total_faltas: 1, fechas: [], alertas: [] };
        expect(mensajeGrupoFaltas(t, '2026-10-23')).toBe(
            'Hola, consulta por *Carla Simulado*: lleva 1 falta sin justificar en octubre. ¿Alguien sabe qué pasó? '
            + `Si tuvo licencia o permiso, por favor envíen el respaldo para justificarla.${PIE}`);
    });
});

describe('asistencia de hoy', () => {
    test('obras sin guardar: todas, en negrita, con la fecha', () => {
        expect(mensajeObrasSinGuardar(['DOMEYKO', 'GORBEA', 'HAWKINS'], '2026-10-23')).toBe(
            'Hola, falta guardar la asistencia de hoy, viernes 23 de octubre, en *DOMEYKO*, *GORBEA* y *HAWKINS*. '
            + `¿Pueden marcarla en Bóveda? Gracias.${PIE}`);
    });

    test('faltas de hoy: una persona en singular, varias en plural, obra si la hay', () => {
        const ana = { nombres: 'Ana', apellido_paterno: 'Pérez', obra: 'DOMEYKO' };
        expect(mensajeFaltasHoy([ana], '2026-10-23')).toBe(
            'Hola, hoy viernes 23 de octubre faltó sin justificar *Ana Pérez* (DOMEYKO). ¿Alguien sabe qué pasó? '
            + `Si tiene licencia o permiso, por favor envíen el respaldo para justificarla.${PIE}`);
        expect(mensajeFaltasHoy([ana, { nombres: 'Luis', apellido_paterno: 'Soto', obra: null }], '2026-10-23')).toContain(
            'faltaron sin justificar *Ana Pérez* (DOMEYKO) y *Luis Soto*. ¿Alguien sabe qué pasó? Si tienen licencia');
    });

    test('patrón de fin de semana', () => {
        const t = { nombres: 'Luis', apellido_paterno: 'Soto', obra: 'GORBEA', n: 2, fechas: ['2026-09-04', '2026-10-05'] };
        expect(mensajePatronFinde(t, 60)).toBe(
            'Hola, consulta por *Luis Soto* (GORBEA): en los últimos 60 días faltó 2 veces junto al fin de semana '
            + `(vie 4 sep y lun 5 oct). ¿Alguien sabe si pasa algo? Sería bueno conversarlo.${PIE}`);
    });
});

describe('lotes de documentos físicos', () => {
    const lote = { id: 12, total: 5, en_terreno: 3, portador_nombre: 'Jhoan Vásquez', creado_en: '2026-10-19 08:00:00', retirado_en: '2026-10-21 16:26:00' };

    test('en oficina: saluda por el primer nombre y dice desde cuándo espera', () => {
        expect(mensajeLoteOficina(lote)).toBe(
            'Hola Jhoan, tienes el lote #12 con 5 documentos esperando en la oficina de RRHH desde el lun 19. '
            + `¿Cuándo pasas a retirarlo?${PIE}`);
        expect(mensajeLoteOficina({ ...lote, portador_nombre: null, total: 1 })).toMatch(/^Hola, tienes el lote #12 con 1 documento /);
    });

    test('en terreno: cuenta los que siguen afuera y el plazo según la tenencia', () => {
        const base = { ...lote, tenencia: { dia: 2, max: 4, vence_el: '2026-10-27', vence_hora: '16:26', atrasado: false, dias_atraso: 0 } };
        expect(mensajeLoteTerreno(base)).toBe(
            `Hola Jhoan, el lote #12 (3 documentos) vence el mar 27, 16:26. ¿Cuándo devuelves los documentos firmados a RRHH?${PIE}`);
        expect(mensajeLoteTerreno({ ...base, tenencia: { ...base.tenencia, dia: 4 } })).toContain('(3 documentos) vence hoy a las 16:26.');
        expect(mensajeLoteTerreno({ ...base, tenencia: { ...base.tenencia, dia: 6, atrasado: true, dias_atraso: 2 } }))
            .toContain('venció el mar 27, 16:26: el máximo en terreno es 4 días hábiles.');
        expect(mensajeLoteTerreno({ ...lote, tenencia: null })).toContain('(3 documentos) está en terreno desde el mié 21.');
    });
});
