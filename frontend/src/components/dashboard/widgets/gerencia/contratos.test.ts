/**
 * 7.º tema del «Inicio de gerencia»: «Contratos por vencer» (Marcos 2026-10-26, mig 138). Lógica pura de
 * gerencia.modelo.ts (tema, filas, franja, ancho de la última tarjeta) y el WhatsApp de mensajes.ts.
 */
import { columnasUltima, temasGerencia, temasPendientes, textoTerminoContrato, tituloFranja, type GerenciaApi } from './gerencia.modelo';
import { MAX_LINEAS, lineaContrato, mensajeContratos, venceContrato } from './mensajes';
import type { ContratoPorVencerApi, ContratosGerenciaApi } from './tipos';

const HOY = '2026-10-26';
const C = (id: number, nombre: string, obra: string | null, dias: number, fecha: string, extra: Partial<ContratoPorVencerApi> = {}): ContratoPorVencerApi => ({
    trabajador_id: id, rut: `${id}.111.111-1`, nombre, obra, cargo: 'Jornal', ingreso: '2026-09-01', fecha, dias, ...extra,
});
const LISTA = [
    C(1, 'Iván Saavedra Lagos', 'Gorbea 3082', -6, '2026-10-20', { cargo: 'Maestro', ingreso: '2025-11-03' }),
    C(2, 'Raúl Espinoza Mella', 'Domeyko', 0, '2026-10-26', { cargo: null }),
    C(3, 'Marcelo Aguilera Paz', null, 9, '2026-11-04', { rut: null, ingreso: null }),
];
const contratos = (extra: Partial<ContratosGerenciaApi> = {}): ContratosGerenciaApi => ({ dias: 30, vencidos: 1, por_vencer: 2, lista: LISTA, ...extra });
const api = (c: ContratosGerenciaApi | null | undefined): GerenciaApi => ({
    hoy: HOY, faltas: null, vehiculos: null, perdidas: null, documentos: null, papeles: null, solicitudes: null, aprobadores: [],
    ...(c === undefined ? {} : { contratos: c }),
});
const tema = (c: ContratosGerenciaApi) => temasGerencia(api(c)).find(t => t.key === 'contratos')!;

describe('tema «Contratos por vencer»', () => {
    test('sin el bloque (sin trabajadores.ver o backend anterior) no se dibuja', () => {
        expect(temasGerencia(api(null))).toEqual([]);
        expect(temasGerencia(api(undefined))).toEqual([]);
    });

    test('con vencidos: rojo, la cifra son los vencidos y la bajada suma los por vencer', () => {
        const t = tema(contratos());
        expect(t).toMatchObject({
            titulo: 'Contratos por vencer', tono: 'rojo', cifra: '1', etiqueta: 'contrato vencido',
            resumen: 'y 2 vencen en los próximos 30 días', decision: 'Renovar, pasar a indefinido o terminar', total: 3,
            enlace: { texto: 'Ver en Gestiones', ruta: '/consultas?tab=trabajadores' },
            franja: { cifra: '1', texto: 'contrato vencido' },
        });
    });

    test('solo por vencer: ámbar; nada: verde y sin WhatsApp', () => {
        const ambar = tema(contratos({ vencidos: 0, por_vencer: 2, lista: LISTA.slice(1) }));
        expect(ambar).toMatchObject({ tono: 'ambar', cifra: '2', etiqueta: 'contratos por vencer', resumen: 'en los próximos 30 días; ninguno vencido' });
        expect(ambar.franja).toEqual({ cifra: '2', texto: 'contratos por vencer' });
        const nada = tema(contratos({ vencidos: 0, por_vencer: 0, lista: [] }));
        expect(nada).toMatchObject({ tono: 'verde', total: 0, whatsapp: null, resumen: 'Ningún contrato a plazo fijo vence en los próximos 30 días' });
        expect(temasPendientes([nada])).toEqual([]);
        const soloVencidos = tema(contratos({ vencidos: 2, por_vencer: 0 }));
        expect(soloVencidos.resumen).toBe('ninguno más vence en los próximos 30 días');
    });

    test('filas: nombre, obra · cargo · «vence el …» / «venció hace N días»; rojo antes que ámbar; a la ficha por RUT', () => {
        const t = tema(contratos());
        expect(t.filas.map(f => [f.titulo, f.bajada, f.cifra, f.nota, f.tono])).toEqual([
            ['Iván Saavedra Lagos', 'Gorbea 3082 · Maestro · venció hace 6 días', '6', 'días vencido', 'rojo'],
            ['Raúl Espinoza Mella', 'Domeyko · vence hoy', 'Hoy', 'vence hoy', 'ambar'],
            ['Marcelo Aguilera Paz', 'Jornal · vence el 4 nov', '9', 'días para vencer', 'ambar'],
        ]);
        expect(t.filas[0].ruta).toBe('/consultas?q=1.111.111-1');
        expect(t.filas[2].ruta).toBe('/consultas?tab=trabajadores');
        expect(t.filas[0].detalle).toBe('Su contrato a plazo fijo venció el 20 oct (hace 6 días). Ingresó el 3 nov 2025. RUT 1.111.111-1.');
        expect(t.filas[2].detalle).toBe('Su contrato a plazo fijo vence el 4 nov (en 9 días).');
        expect(t.filas.every(f => !/undefined|null/.test(f.bajada + f.detalle))).toBe(true);
    });

    test('textoTerminoContrato', () => {
        expect(textoTerminoContrato({ fecha: '2026-11-04', dias: 9 })).toBe('vence el 4 nov');
        expect(textoTerminoContrato({ fecha: '2026-10-26', dias: 0 })).toBe('vence hoy');
        expect(textoTerminoContrato({ fecha: '2026-10-25', dias: -1 })).toBe('venció hace 1 día');
    });

    test('va al final y la franja lo cuenta', () => {
        const todo = { ...api(contratos()), solicitudes: { dias_limite: 10, total: 1, lista: [{ id: 1, codigo: 'TRF-1', solicitante_id: null, solicitante: 'Ana', cargo: null, destino: 'Domeyko', origen: null, fecha: '2026-10-10', dias: 16, items: [] }] } };
        const temas = temasGerencia(todo);
        expect(temas.map(t => t.key)).toEqual(['solicitudes', 'contratos']);
        expect(tituloFranja(temas)).toBe('2 temas esperan una decisión');
    });
});

describe('WhatsApp de contratos', () => {
    test('el borrador del dueño, con una línea por contrato', () => {
        expect(mensajeContratos(LISTA)).toBe([
            'Hola, estos contratos vencen pronto o ya vencieron:',
            '• Iván Saavedra Lagos (Gorbea 3082): venció el 20 oct (hace 6 días)',
            '• Raúl Espinoza Mella (Domeyko): vence hoy',
            '• Marcelo Aguilera Paz: vence el 4 nov',
            '¿Qué hacemos con cada uno: renovar, pasar a indefinido o terminar? Me cuentan.',
        ].join('\n'));
        expect(tema(contratos()).whatsapp).toEqual({ texto: 'Consultar por WhatsApp', mensaje: mensajeContratos(LISTA, 3) });
    });

    test('uno solo, o todos del mismo lado: el encabezado sin el «o»', () => {
        expect(mensajeContratos([LISTA[0]])).toMatch(/^Hola, este contrato ya venció:\n• Iván/);
        expect(mensajeContratos([LISTA[2]])).toMatch(/^Hola, este contrato vence pronto:\n/);
        expect(mensajeContratos([LISTA[2]])).toMatch(/\n¿Qué hacemos: renovar, pasar a indefinido o terminar\? Me cuentan\.$/);
        expect(mensajeContratos(LISTA.slice(1))).toMatch(/^Hola, estos contratos vencen pronto:\n/);
        expect(mensajeContratos([LISTA[0], { ...LISTA[0], trabajador_id: 9, dias: -40 }])).toMatch(/^Hola, estos contratos ya vencieron:\n/);
        // Lista cortada por el servidor: no se sabe qué hay en el resto → el encabezado de siempre.
        expect(mensajeContratos([LISTA[0]], 8)).toMatch(/^Hola, estos contratos vencen pronto o ya vencieron:\n/);
    });

    test(`tope de ${MAX_LINEAS} líneas y «y N más»`, () => {
        const muchos = Array.from({ length: 25 }, (_, i) => C(i + 1, `T${i}`, null, 3, '2026-10-29'));
        const m = mensajeContratos(muchos, 31).split('\n');
        expect(m.filter(l => l.startsWith('• '))).toHaveLength(MAX_LINEAS + 1);
        expect(m).toContain('• y 11 más');
    });

    test('venceContrato y lineaContrato: sin obra, sin paréntesis vacíos', () => {
        expect(venceContrato({ fecha: '2026-10-20', dias: -6 })).toBe('venció el 20 oct (hace 6 días)');
        expect(lineaContrato({ ...LISTA[2], nombre: '  ' })).toBe('Trabajador sin nombre: vence el 4 nov');
    });
});

describe('columnasUltima: la última tarjeta no queda sola en una esquina', () => {
    test.each([
        [7, { md: 2, xl: 3 }], [6, { md: 1, xl: 1 }], [5, { md: 2, xl: 1 }], [4, { md: 1, xl: 3 }],
        [3, { md: 2, xl: 1 }], [1, { md: 2, xl: 3 }],
    ])('%i temas → %o', (n, esperado) => {
        expect(columnasUltima(n)).toEqual(esperado);
    });
});
