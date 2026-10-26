import {
    TOPE_URGENTE, cifraPapel, quienAprueba, temasGerencia, temasPendientes, textoDesplegar, textoMasEnModulo, tituloFranja,
    type GerenciaApi, type TemaGerencia,
} from './gerencia.modelo';
import type { PapelesFlotaApi } from '../fichasVehiculosInicio';

const P = (clave: string, estado: string, extra: object = {}) => ({
    clave, estado, categoria: null, subtipo: null, registro_id: null, fecha_vencimiento: null, dias_restantes: null, avisa: false, ...extra,
});

/** Parecido al lienzo (datos.ts de boveda-diseno): viernes 23 de octubre de 2026. */
const vehiculos = {
    dias: 30, total_vehiculos: 6,
    vehiculos: [
        { vehiculo_id: 1, patente: 'FZRC-35', marca: 'Hyundai', modelo: 'Porter', tipo: null, empresa_id: 1, empresa_nombre: null,
            conductor_id: 3, conductor_nombre: 'Marcelo Aguilera',
            papeles: [P('permiso', 'vencido', { dias_restantes: -52, avisa: true }), P('poliza', 'vigente'), P('tecnica', 'por_vencer', { dias_restantes: 9, avisa: true }),
                P('gases', 'sin_registro'), P('mantencion', 'sin_registro')],
            otros: [], requiere_accion: 2, vencidos: 1, peor_dias: -52 },
        { vehiculo_id: 2, patente: 'GXBT-18', marca: 'Toyota', modelo: 'Hilux', tipo: null, empresa_id: 1, empresa_nombre: null,
            conductor_id: null, conductor_nombre: null,
            papeles: [P('permiso', 'vigente'), P('poliza', 'vencido', { dias_restantes: -6, avisa: true }), P('tecnica', 'vigente'),
                P('gases', 'vencido', { dias_restantes: -3, avisa: false }), P('mantencion', 'sin_registro')],
            otros: [], requiere_accion: 1, vencidos: 1, peor_dias: -6 },
    ],
} as unknown as PapelesFlotaApi;

const API: GerenciaApi = {
    hoy: '2026-10-23',
    faltas: {
        anio: 2026, mes: 10, total: 2, tres_causales: 1,
        lista: [
            { trabajador_id: 2, rut: '15.482.903-K', nombre: 'Jorge Contreras Pávez', obra: 'Domeyko', fechas: ['2026-10-05', '2026-10-12', '2026-10-13', '2026-10-19'], causales: ['seguidos', 'lunes', 'tres'] },
            { trabajador_id: 4, rut: '17.209.554-3', nombre: 'Cristián Muñoz Rojas', obra: 'Gorbea 3082', fechas: ['2026-10-14', '2026-10-15'], causales: ['seguidos'] },
        ],
    },
    vehiculos,
    perdidas: {
        con_valores: true, n: 2, envios: 2, n_mes: 2, total: 597870, total_mes: 597870, sin_valor: 0,
        lista: [
            { id: 1, transferencia_id: 27, codigo: 'TRF-202610-0027', descripcion: 'Placa terciado moldaje 18 mm', unidad: 'UN', faltan: 12, origen: 'Bodega Cerrillos', destino: 'Gorbea 3082', recibio: 'Carla Soto', fecha: '2026-10-16', dias: 7, del_mes: true, valor_unitario: 33990, valor: 407880 },
            { id: 3, transferencia_id: 24, codigo: 'TRF-202610-0024', descripcion: 'Rotomartillo SDS Plus', unidad: 'UN', faltan: 1, origen: 'Bodega Paraguay', destino: 'Abate 80', recibio: 'Luis Fuentes', fecha: '2026-10-14', dias: 9, del_mes: true, valor_unitario: 189990, valor: 189990 },
        ],
    },
    documentos: {
        dias: 7, vencidos: 1, por_vencer: 1,
        lista: [
            { documento_id: 6, tipo: 'Examen de altura física', trabajador_id: 11, rut: '11.873.096-4', nombre: 'Nelson Gallardo Fuentes', obra: 'Bascuñán 661', fecha: '2026-10-27', dias: 4 },
            { documento_id: 5, tipo: 'Examen preocupacional', trabajador_id: 10, rut: '14.120.877-5', nombre: 'Iván Saavedra Lagos', obra: 'Gorbea 3082', fecha: '2026-09-12', dias: -41 },
        ],
    },
    papeles: {
        total: 2, criticos: 1,
        lista: [
            { documento_id: 41, tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato de Trabajo (Bóveda)', etapa: 'por_retirar', dias: 15, critical: true, dias_aviso: 5, dias_critico: 10,
                trabajador: { id: 9, nombre: 'Diego Morales Vega', rut: '2-7' }, obra_nombre: 'Gorbea 3082', portador_nombre: null },
            { documento_id: 42, tipo_codigo: 'FINIQUITO', tipo_nombre: 'Finiquito (Bóveda)', etapa: 'en_terreno', dias: 4, critical: false, dias_aviso: 4, dias_critico: 5,
                trabajador: { id: 8, nombre: 'Juan Carrasco Núñez', rut: '3-5' }, obra_nombre: 'Abate 80', portador_nombre: 'Luis Fuentes' },
        ],
    },
    solicitudes: {
        dias_limite: 10, total: 2,
        lista: [
            { id: 12, codigo: 'TRF-202610-0012', solicitante_id: 21, solicitante: 'Carla Soto', cargo: 'Prevencionista', destino: 'Gorbea 3082', origen: null, fecha: '2026-10-07', dias: 16,
                items: [{ descripcion: 'Arnés de seguridad', unidad: 'UN', pedida: 6 }] },
            { id: 14, codigo: 'TRF-202610-0014', solicitante_id: 10, solicitante: 'Leonardo López', cargo: 'Administrador', destino: 'Domeyko', origen: null, fecha: '2026-10-10', dias: 13,
                items: [{ descripcion: 'Cemento', unidad: 'SACO', pedida: 40 }] },
        ],
    },
    aprobadores: [{ id: 10, nombre: 'Leonardo López' }],
};

const tema = (temas: TemaGerencia[], key: TemaGerencia['key']) => {
    const t = temas.find(x => x.key === key);
    if (!t) throw new Error(`falta el tema ${key}`);
    return t;
};

describe('temasGerencia', () => {
    const temas = temasGerencia(API);

    test('los seis temas, en el orden del lienzo; sin respuesta, ninguno', () => {
        expect(temas.map(t => t.key)).toEqual(['faltas', 'vehiculos', 'perdidas', 'documentos', 'papeles', 'solicitudes']);
        expect(temasGerencia(null)).toEqual([]);
    });

    test('un bloque null (sin permiso o con error) no se dibuja', () => {
        const solo = temasGerencia({ ...API, perdidas: null, vehiculos: null });
        expect(solo.map(t => t.key)).toEqual(['faltas', 'documentos', 'papeles', 'solicitudes']);
    });

    test('franja: «6 temas esperan una decisión» y una cifra por tema', () => {
        expect(tituloFranja(temas)).toBe('6 temas esperan una decisión');
        expect(temas.map(t => `${t.franja.cifra} ${t.franja.texto}`)).toEqual([
            '2 trabajadores con causal',
            '2 papeles de vehículos vencidos',
            '$597.870 perdidos en Inventario',
            '1 documento de trabajador vencido',
            '2 papeles laborales atrasados',
            '2 solicitudes trabadas',
        ]);
    });

    test('vacío: «Nada espera una decisión»', () => {
        const vacio = temasGerencia({
            ...API,
            faltas: { ...API.faltas!, total: 0, tres_causales: 0, lista: [] },
            vehiculos: { ...vehiculos, vehiculos: [] },
            perdidas: { con_valores: true, n: 0, envios: 0, n_mes: 0, total: 0, total_mes: 0, sin_valor: 0, lista: [] },
            documentos: { dias: 7, vencidos: 0, por_vencer: 0, lista: [] },
            papeles: { total: 0, criticos: 0, lista: [] },
            solicitudes: { dias_limite: 10, total: 0, lista: [] },
        });
        expect(temasPendientes(vacio)).toEqual([]);
        expect(tituloFranja(vacio)).toBe('Nada espera una decisión');
        expect(vacio.every(t => t.tono === 'verde' && t.whatsapp === null)).toBe(true);
    });

    test('faltas: rojo, pildoras de causal, fila a Asistencia ?q=RUT, detalle y WhatsApp', () => {
        const t = tema(temas, 'faltas');
        expect(t).toMatchObject({ tono: 'rojo', cifra: '2', etiqueta: 'trabajadores con causal' });
        expect(t.resumen).toBe('1 cumple las tres causales del Art. 160 N°3 este mes');
        expect(t.filas[0]).toMatchObject({
            titulo: 'Jorge Contreras Pávez', bajada: 'Domeyko · lun 5, lun 12, mar 13 y lun 19', cifra: '4', nota: 'desde el lun 5',
            pildoras: [{ tono: 'rojo', texto: 'Las 3 causales' }], ruta: '/asistencia?q=15.482.903-K',
        });
        expect(t.filas[1].pildoras).toEqual([{ tono: 'rojo', texto: '2 días seguidos' }]);
        expect(t.filas[0].detalle).toBe('Faltó el lun 5, lun 12, mar 13 y lun 19 sin justificación. 2 días seguidos, 2 lunes en el mes y 3 o más faltas.');
        expect(t.enlace).toEqual({ texto: 'Ver en Asistencia', ruta: '/asistencia' });
        expect(t.whatsapp?.texto).toBe('Apurar por WhatsApp');
        expect(t.whatsapp?.mensaje).toMatch(/^Hola, estos trabajadores cumplen una causal del Art\. 160 N°3 este mes:\n• Jorge Contreras Pávez \(Domeyko\)/);
    });

    test('vehículos: una fila por papel que avisa, del más vencido; el que no avisa no va', () => {
        const t = tema(temas, 'vehiculos');
        expect(t).toMatchObject({ tono: 'rojo', cifra: '2', etiqueta: 'papeles vencidos', resumen: 'y 1 por vencer en 30 días' });
        expect(t.filas.map(f => [f.titulo, f.cifra, f.nota, f.tono])).toEqual([
            ['FZRC-35 · Permiso de circulación', '52', 'días vencido', 'rojo'],
            ['GXBT-18 · Póliza de seguro', '6', 'días vencido', 'rojo'],
            ['FZRC-35 · Revisión técnica', '9', 'días para vencer', 'ambar'],
        ]);
        expect(t.filas[0]).toMatchObject({ bajada: 'Hyundai Porter · Marcelo Aguilera', ruta: '/vehiculos?vehiculo=1&papel=permiso' });
        expect(t.filas[0].detalle).toBe('Permiso de circulación: venció el 1 sep (hace 52 días). Lo maneja Marcelo Aguilera.');
        expect(t.filas[1].bajada).toBe('Toyota Hilux · sin conductor asignado');
        expect(t.whatsapp?.mensaje).toContain('• GXBT-18 (Toyota Hilux): póliza de seguro vencida hace 6 días');
        expect(t.whatsapp?.mensaje.split('\n').filter(l => l.startsWith('• '))).toHaveLength(3);
    });

    test('pérdidas con valores: monto grande, filas en $, a «Diferencias», WhatsApp a quien aprueba', () => {
        const t = tema(temas, 'perdidas');
        expect(t).toMatchObject({ cifra: '$597.870', esMonto: true, etiqueta: 'sin resolver en octubre', tono: 'rojo' });
        expect(t.resumen).toBe('2 envíos llegaron con menos de lo que salió de bodega');
        expect(t.decision).toBe('Las resuelve Leonardo López; tú decides si apurarlo');
        expect(t.filas[0]).toMatchObject({ titulo: 'Placa terciado moldaje 18 mm', bajada: 'Faltan 12 unidades · Gorbea 3082', cifra: '$407.880', nota: 'hace 7 días',
            ruta: '/inventario?tab=transferencias&estado=discrepancias&id=27' });
        expect(t.filas[0].detalle).toBe('Faltan 12 unidades ($33.990 cada uno) en la solicitud TRF-202610-0027 (Bodega Cerrillos → Gorbea 3082). Lo recibió Carla Soto el 16 oct (hace 7 días).');
        expect(t.whatsapp?.texto).toBe('Pedir a Leonardo');
        expect(t.whatsapp?.mensaje).toContain('siguen sin aclararse, unos $597.870 en total:');
        expect(t.whatsapp?.mensaje).toContain('Leonardo, ¿las puedes revisar y resolver?');
        expect(t.enlace.ruta).toBe('/inventario?tab=transferencias&estado=discrepancias');
    });

    test('pérdidas SIN valores: cantidades, nunca un $', () => {
        const sin = temasGerencia({ ...API, perdidas: { con_valores: false, n: 2, envios: 2, n_mes: 1, lista: API.perdidas!.lista.map(x => ({ ...x, valor: undefined, valor_unitario: undefined })) } });
        const t = tema(sin, 'perdidas');
        expect(t).toMatchObject({ cifra: '2', esMonto: false, etiqueta: 'faltantes sin resolver' });
        expect(t.franja).toEqual({ cifra: '2', texto: 'faltantes en Inventario' });
        expect(t.filas[0].cifra).toBe('12 unidades');
        expect(JSON.stringify(t)).not.toContain('$');
    });

    test('documentos: vencidos primero (rojo), luego por vencer; fila a la ficha', () => {
        const t = tema(temas, 'documentos');
        expect(t).toMatchObject({ cifra: '1', etiqueta: 'documento vencido', tono: 'rojo', resumen: 'y 1 vence esta semana · riesgo ante una fiscalización' });
        expect(t.filas.map(f => f.titulo)).toEqual(['Iván Saavedra Lagos', 'Nelson Gallardo Fuentes']);
        expect(t.filas[0]).toMatchObject({ cifra: '41', nota: 'días vencido', ruta: '/consultas?q=14.120.877-5' });
        expect(t.filas[0].detalle).toBe('Examen preocupacional: venció el 12 sep (hace 41 días). RUT 14.120.877-5.');
        expect(t.enlace.ruta).toBe('/consultas?tab=trabajadores&doc_vigencia=vencido');
    });

    test('papeles laborales: etapa en palabras; quien no registra entregas va a la ficha', () => {
        const t = tema(temas, 'papeles');
        expect(t).toMatchObject({ tono: 'rojo', cifra: '2', etiqueta: 'fuera de plazo' });
        expect(t.filas[0]).toMatchObject({ titulo: 'Contrato de Trabajo · Diego Morales Vega', bajada: 'Impreso, sin portador · Gorbea 3082', cifra: '15', ruta: '/consultas?q=2-7' });
        expect(t.filas[0].detalle).toBe('Se generó el 8 oct; ya está impreso y nadie lo ha llevado a terreno.');
        expect(t.filas[1]).toMatchObject({ bajada: 'Lo tiene Luis Fuentes · Abate 80', cifra: '4', nota: 'último día en terreno', tono: 'ambar' });
        expect(t.enlace.ruta).toBe('/consultas?tab=inicio');
        const rrhh = tema(temasGerencia(API, { registraEntregas: true }), 'papeles');
        expect(rrhh.filas[0].ruta).toBe('/consultas?tab=fisicos');
        expect(rrhh.enlace.ruta).toBe('/consultas?tab=fisicos');
    });

    test('cifraPapel: en terreno pasado del plazo cuenta días hábiles de atraso', () => {
        const base = API.papeles!.lista[1];
        expect(cifraPapel({ ...base, dias: 6, critical: true })).toEqual({ cifra: '2', nota: 'días hábiles de atraso' });
        expect(cifraPapel({ ...base, dias: 5, critical: true })).toEqual({ cifra: '1', nota: 'día hábil de atraso' });
    });

    test('solicitudes: ámbar, cada fila a su solicitud; el WhatsApp va a quien aprueba', () => {
        const t = tema(temas, 'solicitudes');
        expect(t).toMatchObject({ tono: 'ambar', cifra: '2', etiqueta: 'solicitudes sin aprobar', decision: 'Apurar a Leonardo' });
        expect(t.resumen).toBe('más de 10 días esperando a Leonardo López; la más antigua, 16 días');
        expect(t.filas[0]).toMatchObject({ titulo: 'Gorbea 3082 · Carla Soto', bajada: 'Arnés de seguridad ×6', cifra: '16', nota: 'días esperando',
            ruta: '/inventario?tab=transferencias&estado=pendiente&id=12' });
        expect(t.whatsapp?.texto).toBe('Apurar a Leonardo');
        expect(t.whatsapp?.mensaje).toMatch(/^Hola Leonardo, estas solicitudes de materiales llevan más de 10 días esperando aprobación:/);
    });

    test('quienAprueba: uno, dos o ninguno (sin nadie, «Leonardo»: Marcos 2026-10-26)', () => {
        expect(quienAprueba([{ id: 1, nombre: 'Leonardo López' }])).toBe('Leonardo');
        expect(quienAprueba([{ id: 1, nombre: 'Leonardo López' }, { id: 2, nombre: 'Ana Rojas' }])).toBe('Leonardo o Ana');
        expect(quienAprueba([])).toBe('Leonardo');
    });

    test('desplegar: «Ver los N» con más de 3; «Ver el detalle» con 3 o menos; aviso si el servidor cortó la lista', () => {
        const t = tema(temas, 'faltas');
        expect(textoDesplegar(t)).toBe('Ver el detalle');
        const muchas = { ...t, filas: Array.from({ length: TOPE_URGENTE + 2 }, () => t.filas[0]) };
        expect(textoDesplegar(muchas)).toBe('Ver los 5');
        expect(textoDesplegar({ ...muchas, key: 'solicitudes' })).toBe('Ver las 5');
        expect(textoMasEnModulo(t)).toBeNull();
        expect(textoMasEnModulo({ ...muchas, total: 60 })).toBe('y 55 más: velos en Asistencia');
    });

    test('ningún texto deja ver un dato que falta', () => {
        const flaco = temasGerencia({
            ...API,
            faltas: { ...API.faltas!, lista: [{ trabajador_id: 1, rut: null, nombre: '', obra: null, fechas: [], causales: [] }] },
            documentos: { ...API.documentos!, lista: [{ documento_id: 1, tipo: null, trabajador_id: 1, rut: null, nombre: 'X', obra: null, fecha: '2026-10-23', dias: 0 }] },
        });
        const todo = JSON.stringify(flaco.map(t => ({ ...t, filas: t.filas.map(f => [f.titulo, f.bajada, f.detalle, f.cifra, f.nota]) })));
        expect(todo).not.toMatch(/undefined|null,|"null"|NaN|\(\)/);
    });
});
