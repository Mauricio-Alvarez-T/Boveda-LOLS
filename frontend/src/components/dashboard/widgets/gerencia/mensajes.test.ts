import {
    MAX_LINEAS, armarMensaje, diaCorto, fechaCorta, haceDias, limpiar, lineaDocumento, lineaFalta, lineaPapel, lineaPerdida, lineaSolicitud,
    lineaVehiculo, mensajeDocumentos, mensajeFaltas, mensajePapeles, mensajePerdidas, mensajeSolicitudes, mensajeVehiculos,
} from './mensajes';
import type { PapelLaboralApi, PerdidaApi, SolicitudTrabadaApi } from './tipos';

/** Ningún mensaje deja ver un dato que falta. */
const sinRestos = (t: string) => {
    expect(t).not.toMatch(/undefined|null|NaN|\(\s*\)| {2,}| ,| \.|: ;/);
    t.split('\n').forEach(l => expect(l).toBe(l.trim()));
};

describe('ayudas de texto', () => {
    test('fechas cortas sin zonas horarias', () => {
        expect(diaCorto('2026-10-05')).toBe('lun 5');
        expect(diaCorto('2026-10-23')).toBe('vie 23');
        expect(fechaCorta('2026-09-01')).toBe('1 sep');
        expect(haceDias('2026-10-23', 52)).toBe('2026-09-01');
        expect(haceDias('2026-10-23', -9)).toBe('2026-11-01');
    });
    test('limpiar: espacios de más y antes de la puntuación', () => {
        expect(limpiar('Hola  ,  mundo .')).toBe('Hola, mundo.');
    });
});

describe('armarMensaje: tope y «y N más»', () => {
    test(`hasta ${MAX_LINEAS} líneas; lo demás, «y N más» (también si la lista vino cortada del servidor)`, () => {
        const lineas = Array.from({ length: 30 }, (_, i) => `L${i}`);
        const m = armarMensaje('Hola:', lineas, 'Chao.', 42).split('\n');
        expect(m[0]).toBe('Hola:');
        expect(m.filter(l => l.startsWith('• L'))).toHaveLength(MAX_LINEAS);
        expect(m[m.length - 2]).toBe('• y 22 más');
        expect(m[m.length - 1]).toBe('Chao.');
    });
    test('sin tope alcanzado no hay «y N más»', () => {
        expect(armarMensaje('Hola:', ['A', 'B'], 'Chao.')).toBe('Hola:\n• A\n• B\nChao.');
    });
});

describe('faltas', () => {
    const jorge = { trabajador_id: 1, rut: '1-9', nombre: 'Jorge Contreras', obra: 'Domeyko', fechas: ['2026-10-05', '2026-10-12', '2026-10-13', '2026-10-19'], causales: ['seguidos' as const, 'lunes' as const, 'tres' as const] };
    const cristian = { trabajador_id: 2, rut: null, nombre: 'Cristián Muñoz', obra: null, fechas: ['2026-10-14', '2026-10-15'], causales: ['seguidos' as const] };
    test('el borrador del dueño: Art. 160 N°3, una línea por trabajador y la carta', () => {
        const m = mensajeFaltas([jorge, cristian]);
        expect(m).toBe([
            'Hola, estos trabajadores cumplen una causal del Art. 160 N°3 este mes:',
            '• Jorge Contreras (Domeyko): faltó el lun 5, lun 12, mar 13 y lun 19 (4 faltas; 2 días seguidos, 2 lunes, 3 o más)',
            '• Cristián Muñoz: faltó el mié 14 y jue 15 (2 faltas; 2 días seguidos)',
            '¿Qué pasó? ¿Se conversó con ellos o se va a preparar la carta? Me cuentan, por favor.',
        ].join('\n'));
        sinRestos(m);
    });
    test('uno solo, en singular', () => {
        const m = mensajeFaltas([jorge]);
        expect(m.startsWith('Hola, este trabajador cumple una causal')).toBe(true);
        expect(m).toContain('¿Se conversó con él o');
    });
    test('sin fechas ni causales la línea no queda rota', () => {
        expect(lineaFalta({ ...jorge, nombre: '', obra: null, fechas: [], causales: [] })).toBe('Trabajador sin nombre: faltó (0 faltas)');
    });
});

describe('vehículos', () => {
    const v = { patente: 'fzrc-35', marca: 'Hyundai', modelo: 'Porter', conductor_nombre: 'Marcelo Aguilera' };
    const hilux = { patente: 'GXBT-18', marca: 'Toyota', modelo: 'Hilux', conductor_nombre: null };
    test('vencidos y por vencer, concordando con el papel', () => {
        const m = mensajeVehiculos([
            { v, u: { nombre: 'Permiso de circulación', conArticulo: 'el permiso de circulación', dias: -52 } },
            { v: hilux, u: { nombre: 'Póliza de seguro', conArticulo: 'la póliza de seguro', dias: -6 } },
            { v, u: { nombre: 'Revisión técnica', conArticulo: 'la revisión técnica', dias: 9 } },
        ]);
        expect(m).toBe([
            'Hola, estos vehículos tienen papeles vencidos o por vencer:',
            '• FZRC-35 (Hyundai Porter, lo maneja Marcelo Aguilera): permiso de circulación vencido hace 52 días',
            '• GXBT-18 (Toyota Hilux): póliza de seguro vencida hace 6 días',
            '• FZRC-35 (Hyundai Porter, lo maneja Marcelo Aguilera): revisión técnica por vencer en 9 días',
            '¿Qué pasó? Necesito que se renueven esta semana. Me avisan cuando estén listos.',
        ].join('\n'));
        sinRestos(m);
    });
    test('uno solo; sin marca ni conductor, sin paréntesis', () => {
        const m = mensajeVehiculos([{ v: { patente: 'KRPD-77', marca: '', modelo: null, conductor_nombre: null }, u: { nombre: 'Mantención', conArticulo: 'la mantención', dias: 0 } }]);
        expect(m).toBe('Hola, este vehículo tiene un papel por vencer:\n• KRPD-77: mantención por vencer hoy\n¿Qué pasó? Necesito que se renueve esta semana. Me avisan cuando esté listo.');
        sinRestos(m);
        expect(lineaVehiculo(hilux, { nombre: 'Revisión técnica', conArticulo: 'la revisión técnica', dias: -1 })).toBe('GXBT-18 (Toyota Hilux): revisión técnica vencida hace 1 día');
    });
});

describe('pérdidas', () => {
    const placa: PerdidaApi = {
        id: 1, transferencia_id: 27, codigo: 'TRF-202610-0027', descripcion: 'Placa terciado moldaje 18 mm', unidad: 'UN', faltan: 12,
        origen: 'Bodega Cerrillos', destino: 'Gorbea 3082', recibio: 'Carla Soto', fecha: '2026-10-16', dias: 7, del_mes: true,
        valor_unitario: 33990, valor: 407880,
    };
    const cemento: PerdidaApi = { ...placa, id: 2, codigo: 'TRF-202610-0021', descripcion: 'Cemento 25 kg', unidad: 'SACO', faltan: 1, origen: null, destino: 'Domeyko', recibio: null, dias: 0, valor: null, valor_unitario: null };
    test('con valores ($ por línea y total) y a quien aprueba', () => {
        const m = mensajePerdidas([placa, cemento], { quien: 'Leonardo', conValores: true, totalPesos: 407880 });
        expect(m).toBe([
            'Hola, estas solicitudes llegaron con menos de lo que salió y siguen sin aclararse, unos $407.880 en total:',
            '• TRF-202610-0027 (Bodega Cerrillos → Gorbea 3082): llegaron 12 unidades de Placa terciado moldaje 18 mm menos de lo que salió, unos $407.880; lo recibió Carla Soto hace 7 días',
            '• TRF-202610-0021 (Domeyko): llegó 1 saco de Cemento 25 kg menos de lo que salió; se recibió hoy',
            '¿Qué pasó? Leonardo, ¿las puedes revisar y resolver?',
        ].join('\n'));
        sinRestos(m);
    });
    test('SIN permiso de valores: ni un $ aunque los datos lo traigan', () => {
        const m = mensajePerdidas([placa], { conValores: false, totalPesos: 407880 });
        expect(m).not.toContain('$');
        expect(m.startsWith('Hola, esta solicitud llegó con menos de lo que salió y sigue sin aclararse:')).toBe(true);
        expect(m.endsWith('¿Qué pasó? ¿Quién la puede revisar y resolver?')).toBe(true);
        expect(lineaPerdida(placa)).not.toContain('$');
        sinRestos(m);
    });
});

describe('documentos de trabajadores', () => {
    const ivan = { documento_id: 5, tipo: 'Examen preocupacional', trabajador_id: 3, rut: '1-9', nombre: 'Iván Saavedra Lagos', obra: 'Gorbea 3082', fecha: '2026-09-12', dias: -41 };
    test('vencidos y por vencer, con la multa', () => {
        const m = mensajeDocumentos([ivan, { ...ivan, documento_id: 6, nombre: 'Nelson Gallardo', obra: null, tipo: null, dias: 4 }]);
        expect(m).toBe([
            'Hola, estos documentos de trabajadores están vencidos o por vencer:',
            '• Iván Saavedra Lagos (Gorbea 3082): Examen preocupacional, venció hace 41 días',
            '• Nelson Gallardo: un documento, vence en 4 días',
            'Si llega una fiscalización es multa. ¿Qué pasó? ¿Cuándo se renuevan?',
        ].join('\n'));
        sinRestos(m);
    });
    test('uno solo, vencido', () => {
        expect(mensajeDocumentos([ivan])).toMatch(/^Hola, este documento de un trabajador está vencido:\n/);
        expect(lineaDocumento({ ...ivan, dias: 0 })).toBe('Iván Saavedra Lagos (Gorbea 3082): Examen preocupacional, vence hoy');
    });
});

describe('papeles laborales', () => {
    const p: PapelLaboralApi = {
        documento_id: 41, tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato de Trabajo (Bóveda)', etapa: 'por_retirar', dias: 15, critical: true,
        dias_aviso: 5, dias_critico: 10, trabajador: { id: 9, nombre: 'Diego Morales Vega', rut: '2-7' }, obra_nombre: 'Gorbea 3082', portador_nombre: null,
    };
    test('cada etapa en palabras; en terreno, días hábiles', () => {
        const m = mensajePapeles([p, { ...p, documento_id: 42, tipo_nombre: 'Finiquito (Bóveda)', etapa: 'en_terreno', dias: 5, obra_nombre: null }]);
        expect(m).toBe([
            'Hola, estos papeles laborales siguen atrasados:',
            '• Contrato de Trabajo de Diego Morales Vega (Gorbea 3082): impreso y sin portador hace 15 días',
            '• Finiquito de Diego Morales Vega: en terreno sin volver firmado hace 5 días hábiles',
            '¿Qué pasó? ¿Quién los puede resolver esta semana?',
        ].join('\n'));
        sinRestos(m);
        expect(lineaPapel({ ...p, etapa: 'sin_imprimir', dias: 1 })).toBe('Contrato de Trabajo de Diego Morales Vega (Gorbea 3082): sin imprimir hace 1 día');
    });
});

describe('solicitudes trabadas', () => {
    const s: SolicitudTrabadaApi = {
        id: 12, codigo: 'TRF-202610-0012', solicitante_id: 21, solicitante: 'Carla Soto', cargo: 'Prevencionista', destino: 'Gorbea 3082', origen: null,
        fecha: '2026-10-07', dias: 16,
        items: [{ descripcion: 'Arnés de seguridad', unidad: 'UN', pedida: 6 }, { descripcion: 'Línea de vida', unidad: 'UN', pedida: 2 }],
    };
    test('dirigido a quien aprueba, con lo que se pidió', () => {
        const m = mensajeSolicitudes([s, { ...s, id: 14, codigo: 'TRF-202610-0014', solicitante: null, destino: 'Domeyko', items: [], dias: 11 }], { quien: 'Leonardo' });
        expect(m).toBe([
            'Hola Leonardo, estas solicitudes de materiales llevan más de 10 días esperando aprobación:',
            '• Carla Soto para Gorbea 3082 (Arnés de seguridad ×6 y Línea de vida ×2): 16 días esperando · TRF-202610-0012',
            '• Para Domeyko: 11 días esperando · TRF-202610-0014',
            '¿Qué pasó? ¿Las puedes aprobar o rechazar hoy?',
        ].join('\n'));
        sinRestos(m);
    });
    test('sin quien aprueba, una sola y sin solicitante ni obra', () => {
        const m = mensajeSolicitudes([{ ...s, solicitante: null, destino: null, items: [] }]);
        expect(m).toBe('Hola, esta solicitud de materiales lleva más de 10 días esperando aprobación:\n• Solicitud: 16 días esperando · TRF-202610-0012\n¿Qué pasó? ¿Quién la puede aprobar o rechazar hoy?');
        sinRestos(m);
        expect(lineaSolicitud(s)).toBe('Carla Soto para Gorbea 3082 (Arnés de seguridad ×6 y Línea de vida ×2): 16 días esperando · TRF-202610-0012');
    });
});
