import {
    CODIGO_APLICADA_SIN_SIMULAR, CODIGO_REINTENTAR, ROTULO_SIMULACION, TEXTO_CALCULANDO_STOCK, TEXTO_REINTENTAR,
    TOAST_CERRADA_REGLA_ANTERIOR, cerradaPorReglaAnterior, esReintentar, esVerdadero, mensajeResultadoResolver,
    desglosarAjustesManuales, interpretarSimulacion, separarAjustesManuales, TEXTO_CON_AJUSTES, TEXTO_NOTA_VACIA, TEXTO_REGLA_ANTERIOR_APROBAR,
    TEXTO_REGLA_ANTERIOR_DESCARTAR, avisoYaCerrada, avisosDelPlan, debeCerrarModal, esReglaAnterior, fmtAjuste,
    fmtTransicion, leerRehecha, lineaAjusteSimulado, lineaDiferenciaRecepcion, mensajeAprobar, mensajeRechazar,
    motivoNoEliminar, normalizarAjustes, normalizarPlanRehacer, normalizarSimulacion, numeroONull, parseAjusteStock,
    resolucionPorDefecto, resueltaConAjustes, resumenAjustes, rotuloEstado, rotuloRegimen, separarObservacion,
    signoDiscrepancia, simulacionFueAplicada, tieneAjustesGuardados,
} from './mensajeDiferencia';

describe('signoDiscrepancia (sale de las cantidades, NUNCA de la columna diferencia)', () => {
    it('recibida > enviada → sobrante por la diferencia', () => {
        expect(signoDiscrepancia(100, 180)).toEqual({ signo: 'sobrante', n: 80 });
    });

    it('recibida < enviada → faltante por la diferencia', () => {
        expect(signoDiscrepancia(5, 3)).toEqual({ signo: 'faltante', n: 2 });
    });

    it('sin diferencia → null', () => {
        expect(signoDiscrepancia(4, 4)).toBeNull();
    });

    it('acepta DECIMAL como string (mysql2) y redondea el ruido de coma flotante', () => {
        expect(signoDiscrepancia('1.1', '0.3')).toEqual({ signo: 'faltante', n: 0.8 });
        expect(signoDiscrepancia('2.5000', '2.5')).toBeNull();
    });
});

describe('regla anterior (diferencia_aplicada) y rótulos', () => {
    it('1 / true / "1" → regla anterior; 0 / false / ausente → regla nueva (el servidor decide)', () => {
        expect(esReglaAnterior(1)).toBe(true);
        expect(esReglaAnterior(true)).toBe(true);
        expect(esReglaAnterior('1')).toBe(true);
        expect(esReglaAnterior(0)).toBe(false);
        expect(esReglaAnterior(false)).toBe(false);
        expect(esReglaAnterior('0')).toBe(false);
        expect(esReglaAnterior(null)).toBe(false);
        expect(esReglaAnterior(undefined)).toBe(false);
    });

    it('regla nueva: Aprobada / Rechazada; regla anterior: Resuelta / Descartada', () => {
        expect(rotuloEstado('resuelta', false)).toBe('Aprobada');
        expect(rotuloEstado('descartada', false)).toBe('Rechazada');
        expect(rotuloEstado('resuelta', true)).toBe('Resuelta');
        expect(rotuloEstado('descartada', true)).toBe('Descartada');
        expect(rotuloEstado('pendiente', false)).toBe('Pendiente');
    });

    it('numeroONull: DECIMAL string → número; ausente o basura → null', () => {
        expect(numeroONull('12.500')).toBe(12.5);
        expect(numeroONull(0)).toBe(0);
        expect(numeroONull('')).toBeNull();
        expect(numeroONull(null)).toBeNull();
        expect(numeroONull(undefined)).toBeNull();
        expect(numeroONull('abc')).toBeNull();
    });
});

describe('mensajeAprobar (Resolver = aprobar lo declarado)', () => {
    const base = {
        unidad: 'un', origen: 'Conferencia 622', destino: 'Bascuñan 661', receptor: 'Juan Pérez',
    };

    it('sobrante: se sumarían al destino y se descontarían del origen (frase fija, en condicional)', () => {
        const m = mensajeAprobar({ ...base, enviada: 5, recibida: 7 })!;
        expect(m.signo).toBe('sobrante');
        expect(m.n).toBe(2);
        expect(m.declaro).toBe('Juan Pérez declaró 7 de 5 un enviados: 2 un de más.');
        expect(m.efecto).toBe('Al aprobar se sumarían 2 un a Bascuñan 661 y se descontarían de Conferencia 622, según el stock real.');
    });

    it('faltante: se restarían del destino y volverían al origen (frase fija, en condicional)', () => {
        const m = mensajeAprobar({ ...base, enviada: 5, recibida: 3 })!;
        expect(m.signo).toBe('faltante');
        expect(m.declaro).toBe('Juan Pérez declaró 3 de 5 un enviados: 2 un de menos.');
        expect(m.efecto).toBe('Al aprobar se restarían 2 un de Bascuñan 661 y volverían a Conferencia 622, según el stock real.');
    });

    it('no usa el stock en caché: las cifras exactas salen de la simulación del servidor', () => {
        const m = mensajeAprobar({ ...base, enviada: 5, recibida: 3 })!;
        expect(Object.keys(m).sort()).toEqual(['declaro', 'efecto', 'n', 'signo']);
    });

    it('sin receptor ni unidad; DECIMAL como string', () => {
        const m = mensajeAprobar({ enviada: '2.5', recibida: '1.5', origen: 'A', destino: 'B' })!;
        expect(m.declaro).toBe('Quien recibió declaró 1,5 de 2,5 enviados: 1 de menos.');
        expect(m.efecto).toBe('Al aprobar se restarían 1 de B y volverían a A, según el stock real.');
    });

    it('sin diferencia → null', () => {
        expect(mensajeAprobar({ ...base, enviada: 4, recibida: 4 })).toBeNull();
    });
});

describe('mensajeRechazar (Descartar = rechazar lo declarado)', () => {
    it('no mueve stock: queda lo enviado', () => {
        const m = mensajeRechazar({ enviada: 5, recibida: 7, unidad: 'un', origen: 'A', destino: 'B', receptor: 'Ana' });
        expect(m.declaro).toBe('Ana declaró 7 de 5 un enviados: 2 un de más.');
        expect(m.efecto).toBe('Rechazas lo declarado: queda lo enviado (5 un). Úsalo si quien recibió se equivocó al digitar o contar.');
    });
});

describe('resolucionPorDefecto (solo el tutorial; la pantalla real no promete el texto)', () => {
    it('aprobada / rechazada', () => {
        expect(resolucionPorDefecto('resuelta', 5, 3)).toBe('Aprobada: llegaron 3 de 5 enviados');
        expect(resolucionPorDefecto('descartada', '1234', 3)).toBe('Rechazada: queda lo enviado (1.234)');
    });
});

describe('lineaDiferenciaRecepcion (pantalla de recepción)', () => {
    it('una diferencia: con su signo y unidad', () => {
        expect(lineaDiferenciaRecepcion([{ cantidad: -2, unidad: 'un' }]))
            .toBe('La diferencia (−2 un) queda pendiente: Inventario la revisa; el stock se mueve por lo enviado.');
        expect(lineaDiferenciaRecepcion([{ cantidad: 1.5, unidad: 'kg' }, { cantidad: 0 }]))
            .toBe('La diferencia (+1,5 kg) queda pendiente: Inventario la revisa; el stock se mueve por lo enviado.');
    });

    it('varias: en plural; ninguna → null', () => {
        expect(lineaDiferenciaRecepcion([{ cantidad: -2 }, { cantidad: 3 }]))
            .toBe('Las diferencias quedan pendientes: Inventario las revisa; el stock se mueve por lo enviado.');
        expect(lineaDiferenciaRecepcion([])).toBeNull();
        expect(lineaDiferenciaRecepcion([{ cantidad: 0 }])).toBeNull();
    });
});

describe('separarObservacion (la decisión anterior que guarda REHACER no es «Nota al recibir»)', () => {
    it('sin prefijo → todo es la nota', () => {
        expect(separarObservacion('Venían 2 cajas rotas')).toEqual({ nota: 'Venían 2 cajas rotas', anterior: null });
    });

    it('nota + decisión anterior concatenadas', () => {
        expect(separarObservacion('Venían rotas · Resolución anterior (regla antigua): resuelta · Se repuso'))
            .toEqual({ nota: 'Venían rotas', anterior: 'resuelta · Se repuso' });
        expect(separarObservacion('Venían rotas\nResolución anterior (regla antigua): descartada · ok'))
            .toEqual({ nota: 'Venían rotas', anterior: 'descartada · ok' });
    });

    it('solo la decisión anterior; vacía → nada', () => {
        expect(separarObservacion('Resolución anterior (regla antigua): resuelta · x')).toEqual({ nota: null, anterior: 'resuelta · x' });
        expect(separarObservacion('  ')).toEqual({ nota: null, anterior: null });
        expect(separarObservacion(null)).toEqual({ nota: null, anterior: null });
    });
});

describe('parseAjusteStock / normalizarAjustes', () => {
    const json = {
        ajustes: [
            { obra_id: 7, bodega_id: null, ubicacion_nombre: 'Bascuñan 661', cantidad: -80 },
            { obra_id: null, bodega_id: '3', ubicacion_nombre: 'Conferencia 622', cantidad: '5' },
        ],
        aviso: '3 un sin respaldo en el origen',
    };

    it('acepta el objeto ya parseado', () => {
        expect(parseAjusteStock(json)).toEqual({
            ajustes: [
                { obra_id: 7, bodega_id: null, ubicacion_nombre: 'Bascuñan 661', cantidad: -80 },
                { obra_id: null, bodega_id: 3, ubicacion_nombre: 'Conferencia 622', cantidad: 5 },
            ],
            aviso: '3 un sin respaldo en el origen',
        });
    });

    it('acepta el string JSON de la columna TEXT', () => {
        expect(parseAjusteStock(JSON.stringify(json))?.ajustes).toHaveLength(2);
    });

    it('JSON roto, vacío o ausente → null (nunca lanza)', () => {
        expect(parseAjusteStock('{roto')).toBeNull();
        expect(parseAjusteStock('')).toBeNull();
        expect(parseAjusteStock(null)).toBeNull();
        expect(parseAjusteStock(undefined)).toBeNull();
        expect(parseAjusteStock('[1,2]')).toBeNull();
    });

    it('descarta ajustes de cantidad 0 o no numérica; aviso vacío → null', () => {
        expect(normalizarAjustes([{ ubicacion_nombre: 'X', cantidad: 0 }, { ubicacion_nombre: 'Y', cantidad: 'abc' }])).toEqual([]);
        expect(parseAjusteStock({ ajustes: [], aviso: '  ' })).toEqual({ ajustes: [], aviso: null });
        expect(normalizarAjustes('no-array')).toEqual([]);
    });

    it('conserva antes / después del plan de rehacer', () => {
        expect(normalizarAjustes([{ ubicacion_nombre: 'B', cantidad: -2, antes: '7.000', despues: 5 }]))
            .toEqual([{ obra_id: null, bodega_id: null, ubicacion_nombre: 'B', cantidad: -2, antes: 7, despues: 5 }]);
    });
});

describe('leerRehecha (registro de REHACER dentro de ajuste_stock)', () => {
    it('lee fecha, ajustes y aviso; tolera string JSON', () => {
        const raw = {
            ajustes: [], aviso: null,
            rehecha: { fecha: '2026-10-21T18:00:00.000Z', regimen: 'nuevo', ajustes: [{ ubicacion_nombre: 'B', cantidad: -2 }], aviso: '' },
        };
        expect(leerRehecha(raw)).toEqual({
            fecha: '2026-10-21T18:00:00.000Z',
            ajustes: [{ obra_id: null, bodega_id: null, ubicacion_nombre: 'B', cantidad: -2 }],
            aviso: null,
        });
        expect(leerRehecha(JSON.stringify(raw))?.ajustes).toHaveLength(1);
    });

    it('sin rehecha, vacío o roto → null', () => {
        expect(leerRehecha({ ajustes: [], aviso: null })).toBeNull();
        expect(leerRehecha('{roto')).toBeNull();
        expect(leerRehecha(null)).toBeNull();
        expect(leerRehecha({ rehecha: [1] })).toBeNull();
    });
});

describe('fmtAjuste / resumenAjustes / antes-después', () => {
    it('signo tipográfico y unidad', () => {
        expect(fmtAjuste({ obra_id: 1, bodega_id: null, ubicacion_nombre: 'Bascuñan 661', cantidad: -80 }, 'un'))
            .toBe('Bascuñan 661 −80 un');
        expect(fmtAjuste({ obra_id: null, bodega_id: 2, ubicacion_nombre: 'Conferencia 622', cantidad: 5 }, 'un'))
            .toBe('Conferencia 622 +5 un');
    });

    it('resumen en una línea separada por «·»', () => {
        expect(resumenAjustes([
            { obra_id: 1, bodega_id: null, ubicacion_nombre: 'A', cantidad: -2 },
            { obra_id: 2, bodega_id: null, ubicacion_nombre: 'B', cantidad: 2 },
        ], 'un')).toBe('A −2 un · B +2 un');
        expect(resumenAjustes([])).toBe('');
    });

    it('transición del plan de rehacer', () => {
        expect(fmtTransicion(1234, 1230.5)).toBe('1.234 → 1.230,5');
        expect(fmtTransicion(1, null)).toBeNull();
    });

    it('línea de la simulación: «<ubicación>: hoy A → quedará B (±N)»', () => {
        expect(lineaAjusteSimulado({ obra_id: 1, bodega_id: null, ubicacion_nombre: 'Bascuñan 661', cantidad: 2, antes: 5, despues: 7 }, 'un'))
            .toBe('Bascuñan 661: hoy 5 → quedará 7 (+2 un)');
        expect(lineaAjusteSimulado({ obra_id: null, bodega_id: 2, ubicacion_nombre: 'Conferencia 622', cantidad: -1.5, antes: 1234, despues: 1232.5 }, 'kg'))
            .toBe('Conferencia 622: hoy 1.234 → quedará 1.232,5 (−1,5 kg)');
    });

    it('línea de la simulación sin antes/después: solo el delta', () => {
        expect(lineaAjusteSimulado({ obra_id: 1, bodega_id: null, ubicacion_nombre: 'B', cantidad: -2 }, 'un')).toBe('B: −2 un');
        expect(lineaAjusteSimulado({ obra_id: 1, bodega_id: null, ubicacion_nombre: 'B', cantidad: 3, antes: 1 })).toBe('B: +3');
    });
});

describe('normalizarPlanRehacer', () => {
    it('lee el contrato completo', () => {
        const plan = normalizarPlanRehacer({
            id: 9, transferencia_codigo: 'TRF-0012', item: 'Cemento', enviada: '5', recibida: '7', dif: 2,
            regimen: 'nuevo', estado_anterior: 'resuelta', aviso: '',
            ajustes: [{ ubicacion_nombre: 'B', obra_id: 3, bodega_id: null, antes: 9, despues: 7, cantidad: -2 }],
        }, { id: 9 });
        expect(plan).toEqual({
            id: 9, transferencia_codigo: 'TRF-0012', item: 'Cemento', enviada: 5, recibida: 7, dif: 2,
            regimen: 'nuevo', estado_anterior: 'resuelta', aviso: null, avisos: [],
            ajustes: [{ ubicacion_nombre: 'B', obra_id: 3, bodega_id: null, antes: 9, despues: 7, cantidad: -2 }],
        });
    });

    it('completa con la fila de la pantalla lo que no venga (y calcula dif = recibida − enviada)', () => {
        const plan = normalizarPlanRehacer({ item: { descripcion: 'Arena' } }, { id: 4, enviada: 5, recibida: 3 });
        expect(plan).toMatchObject({ id: 4, item: 'Arena', enviada: 5, recibida: 3, dif: -2, ajustes: [], regimen: null, avisos: [] });
        expect(normalizarPlanRehacer(null, { id: 1, item: 'X' }).item).toBe('X');
    });

    it('régimen en palabras', () => {
        expect(rotuloRegimen('nuevo')).toMatch(/descontó al recibir/);
        expect(rotuloRegimen('anterior')).toMatch(/al aprobar/);
        expect(rotuloRegimen('legacy')).toMatch(/al aprobar/);
        expect(rotuloRegimen(null)).toBeNull();
    });
});

describe('avisos del plan de rehacer (ajustes manuales posteriores)', () => {
    it('lee «avisos» (texto u objeto con mensaje) sin repetir lo que ya dice «aviso»', () => {
        const plan = normalizarPlanRehacer({
            aviso: 'Bascuñan 661 no tenía stock suficiente.',
            avisos: [
                'Hay un ajuste manual posterior en Bascuñan 661: revisa que no se duplique.',
                { mensaje: 'Conferencia 622 tuvo un ajuste manual el 22-oct.' },
                'Bascuñan 661 no tenía stock suficiente.',
                'Hay un ajuste manual posterior en Bascuñan 661: revisa que no se duplique.',
                '  ',
            ],
        }, { id: 1 });
        expect(plan.aviso).toBe('Bascuñan 661 no tenía stock suficiente.');
        expect(plan.avisos).toEqual([
            'Hay un ajuste manual posterior en Bascuñan 661: revisa que no se duplique.',
            'Conferencia 622 tuvo un ajuste manual el 22-oct.',
        ]);
    });

    it('describe en una línea los ajustes manuales que vengan como datos', () => {
        expect(avisosDelPlan({
            ajustes_manuales: [
                { ubicacion_nombre: 'Bascuñan 661', cantidad_anterior: 12, cantidad_nueva: 10, motivo: 'Conteo físico' },
                { ubicacion_nombre: 'Conferencia 622', cantidad: -3 },
                { nada: true },
            ],
        }, null)).toEqual([
            'Ajuste manual posterior en Bascuñan 661: 12 → 10 · Conteo físico',
            'Ajuste manual posterior en Conferencia 622: −3',
        ]);
    });

    it('sin avisos → lista vacía (no rompe con basura)', () => {
        expect(avisosDelPlan({}, null)).toEqual([]);
        expect(avisosDelPlan({ avisos: 'no-array', ajustes_posteriores: [null, 3] }, null)).toEqual([]);
    });
});

describe('normalizarSimulacion (PUT …/resolver?simular=1)', () => {
    it('lee ajustes con antes/después, aviso y bloqueo { code, message }', () => {
        expect(normalizarSimulacion({
            ajustes: [{ ubicacion_nombre: 'Bascuñan 661', obra_id: 7, bodega_id: null, antes: '5.000', despues: 3, cantidad: -2 }],
            aviso: '',
            bloqueo: { code: 'DESTINO_SIN_STOCK', message: 'Bascuñan 661 ya no tiene esas 2 unidades (hoy tiene 1): ajústalo a mano' },
        })).toEqual({
            ajustes: [{ ubicacion_nombre: 'Bascuñan 661', obra_id: 7, bodega_id: null, antes: 5, despues: 3, cantidad: -2 }],
            aviso: null,
            bloqueo: { code: 'DESTINO_SIN_STOCK', message: 'Bascuñan 661 ya no tiene esas 2 unidades (hoy tiene 1): ajústalo a mano' },
        });
    });

    it('bloqueo null / ausente / vacío → null; como texto suelto → sin código', () => {
        expect(normalizarSimulacion({ ajustes: [], aviso: 'x', bloqueo: null })).toEqual({ ajustes: [], aviso: 'x', bloqueo: null });
        expect(normalizarSimulacion({}).bloqueo).toBeNull();
        expect(normalizarSimulacion({ bloqueo: {} }).bloqueo).toBeNull();
        expect(normalizarSimulacion({ bloqueo: 'No alcanza' }).bloqueo).toEqual({ code: null, message: 'No alcanza' });
        expect(normalizarSimulacion({ bloqueo: { code: 'REGLA_ANTIGUA' } }).bloqueo)
            .toEqual({ code: 'REGLA_ANTIGUA', message: 'El servidor no permite aplicar esta decisión.' });
        expect(normalizarSimulacion(null)).toEqual({ ajustes: [], aviso: null, bloqueo: null });
    });

    it('detecta un backend sin simulación que RESOLVIÓ de verdad', () => {
        expect(simulacionFueAplicada({ id: 3, estado: 'resuelta', resolucion: 'Aprobada: …', ajustes: [], aviso: null })).toBe(true);
        expect(simulacionFueAplicada({ ajustes: [], aviso: null, bloqueo: null })).toBe(false);
        expect(simulacionFueAplicada({ estado: 'resuelta', resolucion: 'x', bloqueo: null })).toBe(false);
        expect(simulacionFueAplicada({ estado: 'resuelta', resolucion: 'x', simulado: true })).toBe(false);
        expect(simulacionFueAplicada(null)).toBe(false);
    });
});

describe('avisoYaCerrada / debeCerrarModal (otra persona se adelantó)', () => {
    it('409 NO_PENDIENTE: toast informativo con el mensaje del servidor', () => {
        expect(avisoYaCerrada({ status: 409, code: 'NO_PENDIENTE', message: 'La discrepancia ya está resuelta: no se puede volver a resolver' }))
            .toEqual({
                titulo: 'Otra persona ya la resolvió: no se aplicó tu decisión',
                detalle: 'La discrepancia ya está resuelta: no se puede volver a resolver',
            });
    });

    it('404: ya no está', () => {
        expect(avisoYaCerrada({ status: 404, message: 'Discrepancia no encontrada' })?.titulo)
            .toBe('Esta diferencia ya no está: no se aplicó tu decisión');
    });

    it('YA_REGLA_NUEVA solo cuenta al rehacer', () => {
        const e = { status: 409, code: 'YA_REGLA_NUEVA', message: 'Esta diferencia ya está con la regla nueva' };
        expect(avisoYaCerrada(e, 'rehacer')?.titulo).toBe('Otra persona ya la rehízo: no se aplicó tu decisión');
        expect(avisoYaCerrada(e, 'resolver')).toBeNull();
        expect(debeCerrarModal(e, 'rehacer')).toBe(true);
        expect(debeCerrarModal(e, 'resolver')).toBe(false);
    });

    it('otros errores se quedan en la ventana', () => {
        expect(avisoYaCerrada({ status: 409, code: 'DESTINO_SIN_STOCK', message: 'x' })).toBeNull();
        expect(avisoYaCerrada({ status: 409, code: 'REGLA_ANTIGUA', message: 'x' })).toBeNull();
        expect(avisoYaCerrada({ status: 500, message: 'x' })).toBeNull();
        expect(avisoYaCerrada(null)).toBeNull();
        expect(debeCerrarModal({ status: 409, code: 'DESTINO_SIN_STOCK', message: 'x' })).toBe(false);
    });

    it('la simulación que terminó aplicando la decisión también cierra', () => {
        expect(debeCerrarModal({ code: CODIGO_APLICADA_SIN_SIMULAR, message: 'x' })).toBe(true);
    });

    it('sin mensaje del servidor: solo el título', () => {
        expect(avisoYaCerrada({ status: 409, code: 'NO_PENDIENTE', message: '' }))
            .toEqual({ titulo: 'Otra persona ya la resolvió: no se aplicó tu decisión', detalle: null });
    });

    it('al SIMULAR (abrir la ventana) no dice «no se aplicó tu decisión»: todavía no había decisión', () => {
        const noPendiente = { status: 409, code: 'NO_PENDIENTE', message: 'La discrepancia ya está resuelta' };
        expect(avisoYaCerrada(noPendiente, 'resolver', 'simular'))
            .toEqual({ titulo: 'Otra persona ya la resolvió', detalle: 'La discrepancia ya está resuelta' });
        expect(avisoYaCerrada(noPendiente, 'resolver', 'confirmar')?.titulo)
            .toBe('Otra persona ya la resolvió: no se aplicó tu decisión');
        expect(avisoYaCerrada({ status: 404, message: '' }, 'resolver', 'simular')?.titulo).toBe('Esta diferencia ya no está');
        expect(avisoYaCerrada({ status: 409, code: 'YA_REGLA_NUEVA', message: '' }, 'rehacer', 'simular')?.titulo)
            .toBe('Otra persona ya la rehízo');
        // El mensaje del servidor igual al título no se repite como detalle.
        expect(avisoYaCerrada({ status: 409, code: 'NO_PENDIENTE', message: 'Otra persona ya la resolvió' }, 'resolver', 'simular'))
            .toEqual({ titulo: 'Otra persona ya la resolvió', detalle: null });
    });
});

describe('409 REINTENTAR (el stock estaba ocupado: la ventana queda abierta)', () => {
    it('esReintentar: código REINTENTAR con 409 (o sin status)', () => {
        expect(CODIGO_REINTENTAR).toBe('REINTENTAR');
        expect(esReintentar({ status: 409, code: 'REINTENTAR' })).toBe(true);
        expect(esReintentar({ code: 'REINTENTAR' })).toBe(true);
        expect(esReintentar({ status: 500, code: 'REINTENTAR' })).toBe(false);
        expect(esReintentar({ status: 409, code: 'DESTINO_SIN_STOCK' })).toBe(false);
        expect(esReintentar(null)).toBe(false);
    });

    it('no cierra la ventana (no es «ya cerrada») y su toast avisa que sigue abierta', () => {
        const e = { status: 409, code: 'REINTENTAR', message: 'Otra operación estaba usando este stock: vuelve a intentar' };
        expect(avisoYaCerrada(e)).toBeNull();
        expect(debeCerrarModal(e)).toBe(false);
        expect(TEXTO_REINTENTAR).toMatch(/sigue abierta/);
    });

    it('REINTENTAR como bloqueo de la simulación no bloquea la decisión: «reintentar»', () => {
        expect(interpretarSimulacion({ simulado: true, ajustes: [], aviso: null, bloqueo: { code: 'REINTENTAR', message: 'Vuelve a intentar' } }))
            .toEqual({ tipo: 'reintentar', error: { status: 409, code: 'REINTENTAR', message: 'Vuelve a intentar' } });
    });
});

describe('cierre con la regla anterior (aprobar no mueve stock)', () => {
    const aviso = 'Regla anterior: la diferencia ya estaba aplicada; se cierra sin mover stock';

    it('cerradaPorReglaAnterior: flag del servidor, o resuelta de la regla anterior sin ajustes', () => {
        expect(cerradaPorReglaAnterior({ estado: 'resuelta', diferencia_aplicada: false, ajuste_stock: { ajustes: [], aviso, cerrada_regla_anterior: true } })).toBe(true);
        expect(cerradaPorReglaAnterior({ estado: 'resuelta', diferencia_aplicada: true, ajuste_stock: { ajustes: [], aviso } })).toBe(true);
        expect(cerradaPorReglaAnterior({ estado: 'resuelta', diferencia_aplicada: 1, ajuste_stock: JSON.stringify({ ajustes: [], aviso }) })).toBe(true);
        // Modelo de causas que sí ajustó stock: su aviso es una advertencia de verdad.
        expect(cerradaPorReglaAnterior({ estado: 'resuelta', diferencia_aplicada: true, ajuste_stock: { ajustes: [{ ubicacion_nombre: 'B', cantidad: -2 }], aviso: 'x' } })).toBe(false);
        expect(cerradaPorReglaAnterior({ estado: 'resuelta', diferencia_aplicada: false, ajuste_stock: { ajustes: [], aviso: 'x' } })).toBe(false);
        expect(cerradaPorReglaAnterior({ estado: 'descartada', diferencia_aplicada: true, ajuste_stock: { ajustes: [], aviso } })).toBe(false);
        expect(cerradaPorReglaAnterior({ estado: 'pendiente', diferencia_aplicada: true })).toBe(false);
    });

    it('normalizarSimulacion marca cerrada_regla_anterior solo si el servidor la manda', () => {
        expect(normalizarSimulacion({ ajustes: [], aviso, bloqueo: null, cerrada_regla_anterior: true }))
            .toEqual({ ajustes: [], aviso, bloqueo: null, cerrada_regla_anterior: true });
        expect('cerrada_regla_anterior' in normalizarSimulacion({ ajustes: [], aviso: null, bloqueo: null, cerrada_regla_anterior: false })).toBe(false);
    });
});

describe('mensajeResultadoResolver (toast tras confirmar)', () => {
    const ajustes = [
        { obra_id: 1, bodega_id: null, ubicacion_nombre: 'Bascuñan 661', cantidad: -2 },
        { obra_id: null, bodega_id: 4, ubicacion_nombre: 'Conferencia 622', cantidad: 2 },
    ];

    it('cerrada con la regla anterior: «Diferencia cerrada (regla anterior): no se movió stock», sin ámbar', () => {
        expect(mensajeResultadoResolver({ estado: 'resuelta', ajustes: [], aviso: 'Regla anterior: …', cerrada_regla_anterior: true }))
            .toEqual({ tipo: 'success', titulo: 'Diferencia cerrada (regla anterior): no se movió stock', descripcion: null, duracion: null });
        expect(TOAST_CERRADA_REGLA_ANTERIOR).toBe('Diferencia cerrada (regla anterior): no se movió stock');
    });

    it('aprobada: resumen de ajustes; con aviso → ámbar y más largo', () => {
        expect(mensajeResultadoResolver({ estado: 'resuelta', ajustes, aviso: null }, 'un'))
            .toEqual({ tipo: 'success', titulo: 'Diferencia aprobada', descripcion: 'Bascuñan 661 −2 un · Conferencia 622 +2 un', duracion: null });
        expect(mensajeResultadoResolver({ estado: 'resuelta', ajustes, aviso: 'Al origen vuelven solo 1.', cerrada_regla_anterior: false }, 'un'))
            .toEqual({
                tipo: 'warning', titulo: 'Diferencia aprobada',
                descripcion: 'Bascuñan 661 −2 un · Conferencia 622 +2 un. Al origen vuelven solo 1.', duracion: 12000,
            });
        expect(mensajeResultadoResolver({ estado: 'resuelta', ajustes: [], aviso: null }).descripcion).toBe('Sin cambios de stock');
    });

    it('rechazada: no movió stock', () => {
        expect(mensajeResultadoResolver({ estado: 'descartada', ajustes: [], aviso: null }))
            .toEqual({ tipo: 'success', titulo: 'Diferencia rechazada', descripcion: 'Queda lo enviado: no se movió stock.', duracion: null });
    });
});

describe('textos de la ventana con simulación', () => {
    it('rótulo de las líneas y texto mientras carga', () => {
        expect(ROTULO_SIMULACION).toBe('Así queda el stock:');
        expect(TEXTO_CALCULANDO_STOCK).toBe('Calculando cómo queda el stock…');
    });

    it('esVerdadero: true / 1 / "1"; lo demás no', () => {
        expect([true, 1, '1'].map(esVerdadero)).toEqual([true, true, true]);
        expect([false, 0, '0', null, undefined, 'true'].map(esVerdadero)).toEqual([false, false, false, false, false, false]);
    });
});

describe('qué acciones se ofrecen (mismo criterio que el servidor)', () => {
    const ajusto = { ajustes: [{ ubicacion_nombre: 'B', cantidad: -2 }], aviso: null };

    it('tieneAjustesGuardados: ajustes o rehecha.ajustes no vacíos; tolera string JSON y basura', () => {
        expect(tieneAjustesGuardados(ajusto)).toBe(true);
        expect(tieneAjustesGuardados(JSON.stringify(ajusto))).toBe(true);
        expect(tieneAjustesGuardados({ ajustes: [], aviso: null, rehecha: { ajustes: [{ cantidad: 1 }] } })).toBe(true);
        expect(tieneAjustesGuardados({ ajustes: [], aviso: 'x' })).toBe(false);
        expect(tieneAjustesGuardados({ ajustes: [], rehecha: { ajustes: [] } })).toBe(false);
        expect(tieneAjustesGuardados('{roto')).toBe(false);
        expect(tieneAjustesGuardados(null)).toBe(false);
    });

    it('motivoNoEliminar: ajustó stock (CON_AJUSTE) o pendiente de la regla anterior (REGLA_ANTIGUA)', () => {
        expect(motivoNoEliminar({ estado: 'resuelta', ajuste_stock: ajusto, diferencia_aplicada: false }))
            .toMatch(/ajustó el stock/);
        expect(motivoNoEliminar({ estado: 'pendiente', ajuste_stock: null, diferencia_aplicada: true }))
            .toMatch(/regla anterior/);
        // Regla anterior ya cerrada sin mover stock, regla nueva pendiente o sin la migración: se puede.
        expect(motivoNoEliminar({ estado: 'resuelta', ajuste_stock: { ajustes: [], aviso: 'x' }, diferencia_aplicada: true })).toBeNull();
        expect(motivoNoEliminar({ estado: 'pendiente', ajuste_stock: null, diferencia_aplicada: false })).toBeNull();
        expect(motivoNoEliminar({ estado: 'pendiente', diferencia_aplicada: null })).toBeNull();
        expect(motivoNoEliminar({ estado: 'descartada', ajuste_stock: { ajustes: [], aviso: null } })).toBeNull();
    });

    it('resueltaConAjustes: causa del modelo anterior o ajustes guardados → se corrige a mano', () => {
        expect(resueltaConAjustes({ estado: 'resuelta', causa: 'nunca_salio' })).toBe(true);
        expect(resueltaConAjustes({ estado: 'resuelta', ajuste_stock: ajusto })).toBe(true);
        expect(resueltaConAjustes({ estado: 'resuelta', causa: null, ajuste_stock: { ajustes: [], aviso: null } })).toBe(false);
        expect(resueltaConAjustes({ estado: 'pendiente', causa: '  ' })).toBe(false);
    });

    it('textos del dueño', () => {
        expect(TEXTO_REGLA_ANTERIOR_APROBAR).toBe('Regla anterior: la diferencia ya está en el stock; aprobar la cierra sin mover nada');
        expect(TEXTO_REGLA_ANTERIOR_DESCARTAR).toBe('primero hay que rehacerla (Super Administrador)');
        expect(TEXTO_CON_AJUSTES).toBe('Se resolvió con ajustes: se corrige a mano');
        expect(TEXTO_NOTA_VACIA).toBe('Si la dejas vacía se guarda un texto automático.');
    });
});

describe('ajustes manuales posteriores (el servidor los pega al final de «aviso» del plan)', () => {
    const manual = 'Hubo ajustes manuales después: 22-10-2026 14:05 Bodega Av. Matta 12→10 (Ana); 23-10-2026 09:00 Bascuñan 661 3→5. '
        + 'Puede que ya esté corregido: revísalo antes de rehacer.';

    it('separarAjustesManuales: deja el resto en «aviso» y la parte manual aparte', () => {
        expect(separarAjustesManuales(`Recepción anterior al kardex: se asumió que el origen descontó todo lo recibido. ${manual}`))
            .toEqual({ aviso: 'Recepción anterior al kardex: se asumió que el origen descontó todo lo recibido.', manuales: manual });
        expect(separarAjustesManuales(manual)).toEqual({ aviso: null, manuales: manual });
        expect(separarAjustesManuales('Otro aviso')).toEqual({ aviso: 'Otro aviso', manuales: null });
        expect(separarAjustesManuales(null)).toEqual({ aviso: null, manuales: null });
    });

    it('desglosarAjustesManuales: una entrada por ajuste y el cierre (sin cortar en «Av.»)', () => {
        expect(desglosarAjustesManuales(manual)).toEqual({
            entradas: ['22-10-2026 14:05 Bodega Av. Matta 12→10 (Ana)', '23-10-2026 09:00 Bascuñan 661 3→5'],
            cierre: 'Puede que ya esté corregido: revísalo antes de rehacer.',
        });
        expect(desglosarAjustesManuales('Hubo ajustes manuales después: 22-10-2026 14:05 B 1→2 y 3 más.'))
            .toEqual({ entradas: ['22-10-2026 14:05 B 1→2 y 3 más'], cierre: null });
        expect(desglosarAjustesManuales('Otro aviso')).toBeNull();
    });

    it('normalizarPlanRehacer: la parte manual sale de «aviso» y va primera en «avisos»', () => {
        const plan = normalizarPlanRehacer({ aviso: `B no tenía stock suficiente. ${manual}` }, { id: 1 });
        expect(plan.aviso).toBe('B no tenía stock suficiente.');
        expect(plan.avisos).toEqual([manual]);
    });
});

describe('interpretarSimulacion (respuesta 200 de ?simular=1)', () => {
    it('simulación normal → ok con ajustes, aviso y bloqueo', () => {
        const raw = {
            id: 3, estado: 'resuelta', resolucion: 'Aprobada: llegaron 3 de 5 enviados', simulado: true, bloqueo: null,
            ajustes: [{ ubicacion_nombre: 'B', obra_id: 1, bodega_id: null, antes: 5, despues: 3, cantidad: -2 }], aviso: null,
        };
        expect(interpretarSimulacion(raw)).toEqual({
            tipo: 'ok',
            sim: { ajustes: [{ ubicacion_nombre: 'B', obra_id: 1, bodega_id: null, antes: 5, despues: 3, cantidad: -2 }], aviso: null, bloqueo: null },
        });
    });

    it('409 del servidor devuelto como bloqueo: DESTINO_SIN_STOCK / REGLA_ANTIGUA se muestran (ok)', () => {
        const r = interpretarSimulacion({ simulado: true, resolucion: null, ajustes: [], aviso: null, bloqueo: { code: 'DESTINO_SIN_STOCK', message: 'B ya no tiene esas 2 unidades' } });
        expect(r).toEqual({ tipo: 'ok', sim: { ajustes: [], aviso: null, bloqueo: { code: 'DESTINO_SIN_STOCK', message: 'B ya no tiene esas 2 unidades' } } });
    });

    it('NO_PENDIENTE como bloqueo → ya_cerrada (toast informativo + cerrar), no un bloqueo', () => {
        expect(interpretarSimulacion({ simulado: true, bloqueo: { code: 'NO_PENDIENTE', message: 'La discrepancia ya está resuelta' } }))
            .toEqual({ tipo: 'ya_cerrada', error: { status: 409, code: 'NO_PENDIENTE', message: 'La discrepancia ya está resuelta' } });
    });

    it('backend sin simulación que resolvió de verdad → aplicada', () => {
        expect(interpretarSimulacion({ id: 3, estado: 'descartada', resolucion: 'Rechazada: queda lo enviado (5)', ajustes: [], aviso: null }))
            .toEqual({ tipo: 'aplicada' });
    });
});
