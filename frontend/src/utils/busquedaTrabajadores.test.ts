/**
 * Qué significa que un texto «coincida» con un trabajador.
 *
 * Los casos no son inventados: cada uno corresponde a una forma real en que la gente de obra teclea.
 * El RUT se dicta de memoria sin puntos y se copia del carnet con puntos; los apellidos se escriben sin
 * tilde aunque estén guardados con ella; y el nombre se busca en el orden que salga.
 *
 * El caso del alias de empresa es una REGRESIÓN: cuando la razón social es un nombre de persona
 * («MIGUEL ANGEL URRUTIA AGUILERA»), meter sus palabras sueltas como término buscable hacía que teclear
 * «miguel» trajera a toda la empresa. Por eso la empresa se busca por alias y no por substring.
 */

import {
    normalizar, colapsarRut, aliasEmpresa, variantesRut,
    indexar, tokenizar, coincide, ranking,
    type TrabajadorBuscable,
} from './busquedaTrabajadores';

const trabajador = (p: Partial<TrabajadorBuscable> = {}): TrabajadorBuscable => ({
    nombres: 'Juan Carlos',
    apellido_paterno: 'Pérez',
    apellido_materno: 'Muñoz',
    rut: '19.742.932-1',
    cargo_nombre: 'Maestro Mayor',
    empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA',
    obra_nombre: 'Obra Demo Norte',
    ...p,
});

/** Atajo: ¿este trabajador sale al teclear este texto? (sin obra en el corpus, que es el default) */
const busca = (texto: string, w: TrabajadorBuscable = trabajador()) =>
    coincide(indexar(w), tokenizar(texto));

/** Igual, pero como lo usa Gestiones: con el nombre de la obra dentro del corpus. */
const buscaConObra = (texto: string, w: TrabajadorBuscable = trabajador()) =>
    coincide(indexar(w, { incluirObra: true }), tokenizar(texto));

describe('normalizar', () => {
    test('baja a minúsculas y quita tildes', () => {
        expect(normalizar('PÉREZ')).toBe('perez');
        expect(normalizar('José Muñoz')).toBe('jose munoz');
    });

    test('la ñ precompuesta y la descompuesta colapsan en lo mismo (el motivo de usar NFD)', () => {
        // Anotados como `string` a propósito: con los literales, TS ve dos textos distintos y rechaza la
        // comparación — justo la confusión que el test documenta.
        const precompuesta: string = 'Muñoz';        // 'ñ' en un solo code point
        const descompuesta: string = 'Muñoz';       // 'n' + tilde combinante
        expect(precompuesta === descompuesta).toBe(false);        // así llegan: distintos
        expect(normalizar(precompuesta)).toBe(normalizar(descompuesta));
    });

    test('tolera null, undefined y vacío', () => {
        expect(normalizar(null)).toBe('');
        expect(normalizar(undefined)).toBe('');
        expect(normalizar('   ')).toBe('');
    });
});

describe('variantesRut / colapsarRut', () => {
    test('el RUT queda buscable en sus tres escrituras', () => {
        const v = variantesRut('19.742.932-1');
        expect(v).toContain('19.742.932-1');   // como se ve en pantalla
        expect(v).toContain('197429321');      // tecleado de corrido
        expect(v).toContain('19742932');       // dictado de memoria, sin dígito verificador
    });

    test('colapsar quita puntos, guiones y espacios', () => {
        expect(colapsarRut('19.742.932-1')).toBe('197429321');
        expect(colapsarRut('19 742 932-1')).toBe('197429321');
    });

    test('sin RUT no inventa nada', () => {
        expect(variantesRut(null)).toBe('');
        expect(variantesRut('')).toBe('');
    });
});

describe('aliasEmpresa', () => {
    test('una sola palabra distintiva tras las stopwords', () => {
        expect(aliasEmpresa('LOLS EMPRESAS DE INGENIERIA LTDA')).toEqual(['lols']);
        expect(aliasEmpresa('TRANSPORTES DEDALIUS LIMITADA')).toEqual(['dedalius']);
        expect(aliasEmpresa('Provisorio')).toEqual(['provisorio']);
    });

    test('razón social con nombre de persona → solo el acrónimo, nunca las palabras sueltas', () => {
        // Si devolviera ['miguel','angel',…], teclear «miguel» traería a toda la empresa.
        expect(aliasEmpresa('MIGUEL ANGEL URRUTIA AGUILERA')).toEqual(['maua']);
    });

    test('las iniciales sueltas no forman el alias', () => {
        expect(aliasEmpresa('Algo S.A.')).toEqual(['algo']);
    });

    test('sin nombre no hay alias', () => {
        expect(aliasEmpresa(null)).toEqual([]);
        expect(aliasEmpresa('  ')).toEqual([]);
    });
});

describe('coincide — lo que la gente teclea de verdad', () => {
    test('apellido sin tilde encuentra al que está guardado con tilde', () => {
        expect(busca('perez')).toBe(true);
        expect(busca('muñoz')).toBe(true);
        expect(busca('munoz')).toBe(true);
    });

    test('el RUT en sus cuatro escrituras encuentra a la misma persona', () => {
        expect(busca('19742932')).toBe(true);        // de memoria, sin DV
        expect(busca('197429321')).toBe(true);       // de corrido
        expect(busca('19.742.932')).toBe(true);      // copiado a medias
        expect(busca('19.742.932-1')).toBe(true);    // copiado entero
    });

    test('multi-token con AND, en cualquier orden', () => {
        expect(busca('perez juan')).toBe(true);
        expect(busca('juan perez')).toBe(true);
        expect(busca('perez maestro')).toBe(true);   // apellido + cargo
        expect(busca('perez soto')).toBe(false);     // un token que no encaja tumba todo
    });

    test('encuentra por cargo', () => {
        expect(busca('maestro')).toBe(true);
    });

    test('la obra solo entra al corpus si el consumidor la pide', () => {
        // REGRESIÓN: cuando la pantalla ya está acotada a una obra (Asistencia pide ?obra_id=…), TODOS
        // comparten `obra_nombre`. Si entrara siempre, teclear «jose» con la obra «PLANTA SAN JOSE»
        // coincidiría con la lista completa y el buscador dejaría de filtrar.
        expect(busca('demo norte')).toBe(false);
        expect(buscaConObra('demo norte')).toBe(true);

        const enPlantaSanJose = trabajador({ nombres: 'Pedro', apellido_paterno: 'Soto', apellido_materno: 'Rojas', obra_nombre: 'PLANTA SAN JOSE' });
        expect(busca('jose', enPlantaSanJose)).toBe(false);
    });

    test('la empresa se busca por alias, con prefijo', () => {
        expect(busca('lols')).toBe(true);
        expect(busca('lol')).toBe(true);             // prefijo del alias
        expect(busca('ingenieria')).toBe(false);     // stopword: no es alias de nadie
    });

    test('REGRESIÓN: el nombre-persona de una razón social no arrastra a sus trabajadores', () => {
        const w = trabajador({
            nombres: 'Pedro', apellido_paterno: 'Soto', apellido_materno: 'Rojas',
            empresa_nombre: 'MIGUEL ANGEL URRUTIA AGUILERA',
        });
        expect(busca('miguel', w)).toBe(false);      // el bug que se está evitando
        expect(busca('urrutia', w)).toBe(false);
        expect(busca('maua', w)).toBe(true);         // el acrónimo sí
    });

    test('un token corto NO dispara match por RUT (o cualquier número traería media lista)', () => {
        // '19' aparece dentro del RUT, pero con menos de 3 caracteres no se consulta el RUT colapsado…
        const w = trabajador({ cargo_nombre: 'Jornal', obra_nombre: 'Sur', nombres: 'Ana', apellido_paterno: 'Diaz', apellido_materno: 'Lay' });
        expect(busca('19', w)).toBe(true);           // …pero el blob trae el RUT formateado, que sí lo contiene
        expect(busca('742', w)).toBe(true);          // 3 caracteres: ya vale por RUT colapsado
    });

    test('texto vacío no filtra a nadie', () => {
        expect(tokenizar('')).toEqual([]);
        expect(tokenizar('   ')).toEqual([]);
        expect(coincide(indexar(trabajador()), [])).toBe(true);
    });

    test('campos faltantes no rompen el índice', () => {
        const w: TrabajadorBuscable = { nombres: 'Solo', apellido_paterno: null, rut: null, empresa_nombre: null };
        expect(busca('solo', w)).toBe(true);
        expect(busca('perez', w)).toBe(false);
    });
});

describe('ranking — filtra por substring, ordena por prefijo', () => {
    const exacto = indexar(trabajador({ apellido_paterno: 'Perez', apellido_materno: '', nombres: '' }));
    const porApellido = indexar(trabajador({ apellido_paterno: 'Perez', apellido_materno: 'Soto', nombres: 'Ana' }));
    const porCargo = indexar(trabajador({ apellido_paterno: 'Zapata', apellido_materno: '', nombres: 'Luis', cargo_nombre: 'Perito' }));

    test('el match exacto va primero y el accidental último', () => {
        expect(ranking(exacto, 'perez')).toBeLessThan(ranking(porApellido, 'perez'));
        expect(ranking(porApellido, 'per')).toBeLessThan(ranking(porCargo, 'per'));
    });

    test('quien empieza con lo tecleado gana a quien solo lo contiene', () => {
        const empieza = indexar(trabajador({ apellido_paterno: 'Soto', apellido_materno: '', nombres: 'Ana' }));
        const contiene = indexar(trabajador({ apellido_paterno: 'Barsotti', apellido_materno: '', nombres: 'Luis' }));
        expect(ranking(empieza, 'soto')).toBeLessThan(ranking(contiene, 'soto'));
    });

    test('sin texto, todos empatan (no altera el orden alfabético de base)', () => {
        expect(ranking(exacto, '')).toBe(0);
        expect(ranking(porCargo, '')).toBe(0);
    });
});
