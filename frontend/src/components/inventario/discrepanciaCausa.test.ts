import {
    AVISO_REGIMEN_ANTERIOR, CAUSA_LABEL, causaBloqueada, causaCalzaConSigno, causasPara,
    efectoCausa, esRegimenAnterior, fmtAjuste, leerCausa, normalizarAjustes, parseAjusteStock,
    resumenAjustes, signoDiscrepancia,
} from './discrepanciaCausa';

describe('signoDiscrepancia (sale de las cantidades, NUNCA de la columna diferencia)', () => {
    it('recibida > enviada → sobrante por la diferencia', () => {
        expect(signoDiscrepancia(100, 180)).toEqual({ signo: 'sobrante', n: 80 });
    });

    it('recibida < enviada → faltante por la diferencia', () => {
        expect(signoDiscrepancia(5, 3)).toEqual({ signo: 'faltante', n: 2 });
    });

    it('sin diferencia → null (no se ofrece ninguna causa)', () => {
        expect(signoDiscrepancia(4, 4)).toBeNull();
    });

    it('acepta DECIMAL como string (mysql2) y redondea el ruido de coma flotante', () => {
        expect(signoDiscrepancia('1.1', '0.3')).toEqual({ signo: 'faltante', n: 0.8 });
        expect(signoDiscrepancia('2.5000', '2.5')).toBeNull();
    });
});

describe('causasPara', () => {
    it('sobrante → solo las 2 de sobrante', () => {
        expect(causasPara('sobrante')).toEqual(['origen_envio_de_mas', 'error_conteo_recepcion']);
    });

    it('faltante → solo las 3 de faltante', () => {
        expect(causasPara('faltante')).toEqual(['perdida_en_transito', 'nunca_salio', 'llego_despues']);
    });

    it('causaCalzaConSigno rechaza la causa del signo contrario', () => {
        expect(causaCalzaConSigno('perdida_en_transito', 'faltante')).toBe(true);
        expect(causaCalzaConSigno('perdida_en_transito', 'sobrante')).toBe(false);
        expect(causaCalzaConSigno('error_conteo_recepcion', 'faltante')).toBe(false);
    });

    it('cada causa tiene su rótulo', () => {
        expect(CAUSA_LABEL.origen_envio_de_mas).toBe('El origen mandó de más');
        expect(CAUSA_LABEL.error_conteo_recepcion).toBe('Se contó mal al recibir');
        expect(CAUSA_LABEL.perdida_en_transito).toBe('Se perdió o dañó en el camino');
        expect(CAUSA_LABEL.nunca_salio).toBe('Nunca salió del origen');
        expect(CAUSA_LABEL.llego_despues).toBe('Llegó después');
    });
});

describe('régimen anterior (stock_reconciliado = FALSE)', () => {
    it('false / 0 / "0" → anterior; true / 1 / ausente → nuevo', () => {
        expect(esRegimenAnterior(false)).toBe(true);
        expect(esRegimenAnterior(0)).toBe(true);
        expect(esRegimenAnterior('0')).toBe(true);
        expect(esRegimenAnterior(true)).toBe(false);
        expect(esRegimenAnterior(1)).toBe(false);
        expect(esRegimenAnterior(undefined)).toBe(false);
        expect(esRegimenAnterior(null)).toBe(false);
    });

    it('bloquea solo las causas que mueven stock', () => {
        expect(causaBloqueada('error_conteo_recepcion', true)).toBe(true);
        expect(causaBloqueada('perdida_en_transito', true)).toBe(true);
        expect(causaBloqueada('llego_despues', true)).toBe(true);
        expect(causaBloqueada('origen_envio_de_mas', true)).toBe(false);
        expect(causaBloqueada('nunca_salio', true)).toBe(false);
        expect(causaBloqueada('llego_despues', false)).toBe(false);
    });

    it('el aviso calza con el 409 del backend', () => {
        expect(AVISO_REGIMEN_ANTERIOR).toBe('Solicitud anterior al cambio de stock: ajusta a mano');
    });
});

describe('efectoCausa (nombres reales + cantidad)', () => {
    const ctx = { n: 80, recibida: 180, unidad: 'un', origen: 'Conferencia 622', destino: 'Bascuñan 661' };

    it('se contó mal al recibir: resta al destino y devuelve al origen lo descontado de más', () => {
        expect(efectoCausa('error_conteo_recepcion', ctx))
            .toBe('Bascuñan 661 −80 un · si al recibir se le descontaron de más a Conferencia 622, se le devuelven');
    });

    it('el origen mandó de más: no mueve stock, el destino se queda con lo que llegó', () => {
        expect(efectoCausa('origen_envio_de_mas', ctx))
            .toBe('No se mueve stock: Bascuñan 661 se queda con las 180 un que llegaron');
    });

    const falt = { n: 2, recibida: 3, unidad: 'un', origen: 'Conferencia 622', destino: 'Bascuñan 661' };

    it('pérdida en el camino: descuenta del origen', () => {
        expect(efectoCausa('perdida_en_transito', falt))
            .toBe('Se descuentan 2 un de Conferencia 622 como pérdida · Bascuñan 661 no cambia');
    });

    it('nunca salió: no mueve stock', () => {
        expect(efectoCausa('nunca_salio', falt)).toBe('No se mueve stock: las 2 un siguen en Conferencia 622');
    });

    it('llegó después: resta al origen y suma al destino', () => {
        expect(efectoCausa('llego_despues', falt)).toBe('Conferencia 622 −2 un · Bascuñan 661 +2 un');
    });

    it('sin unidad no deja un espacio colgando; decimales en es-CL', () => {
        expect(efectoCausa('nunca_salio', { ...falt, n: 2.5, unidad: '' }))
            .toBe('No se mueve stock: las 2,5 siguen en Conferencia 622');
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
});

describe('fmtAjuste / resumenAjustes', () => {
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
});

describe('leerCausa', () => {
    it('causa conocida → la causa; otra cosa → null', () => {
        expect(leerCausa('nunca_salio')).toBe('nunca_salio');
        expect(leerCausa('toString')).toBeNull();
        expect(leerCausa('otra')).toBeNull();
        expect(leerCausa(null)).toBeNull();
        expect(leerCausa(undefined)).toBeNull();
    });
});
