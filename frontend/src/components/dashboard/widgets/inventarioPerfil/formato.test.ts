import {
    RUTA_PEDIR, TIPO, cantidad, cantidadCorta, diasEntre, enLista, esUnidad, fechaConDia, fechaCorta, fraseItems, itemConCantidad,
    itemPor, llegoDistinto, masAntiguasPrimero, nombreCortoDe, nombreDe, nombreLugar, numero, quienAprueba, rutaDiferencia,
    rutaLista, rutaSolicitud, textoDiferencia, textoDias, tonoDias, unidadDe,
} from './formato';
import type { ItemPerfil } from './tipos';

const item = (descripcion: string, unidad: string | null, pedida: number, enviada: number | null = null, recibida: number | null = null): ItemPerfil =>
    ({ clave: descripcion, personalizado: false, descripcion, unidad, pedida, enviada, recibida });

describe('fechas y días', () => {
    test('fechaCorta: «18 oct»; vacío sin fecha o con algo que no es fecha', () => {
        expect(fechaCorta('2026-10-18')).toBe('18 oct');
        expect(fechaCorta('2026-01-05 09:30:00')).toBe('5 ene');
        expect(fechaCorta(null)).toBe('');
        expect(fechaCorta('')).toBe('');
        expect(fechaCorta('ayer')).toBe('');
        expect(fechaCorta('2026-13-01')).toBe('');
    });

    test('fechaConDia: «jue 22 oct»', () => {
        expect(fechaConDia('2026-10-22')).toBe('jue 22 oct');
        expect(fechaConDia('2026-10-18')).toBe('dom 18 oct');
        expect(fechaConDia(undefined)).toBe('');
    });

    test('diasEntre cuenta días de calendario (también a través de meses)', () => {
        expect(diasEntre('2026-10-13', '2026-10-22')).toBe(9);
        expect(diasEntre('2026-09-27', '2026-10-22')).toBe(25);
        expect(diasEntre('2026-10-22', '2026-10-22')).toBe(0);
        expect(diasEntre(null, '2026-10-22')).toBeNull();
    });

    test('textoDias: «de hoy», «1 día», «9 días»', () => {
        expect(textoDias(0)).toBe('de hoy');
        expect(textoDias(1)).toBe('1 día');
        expect(textoDias(9)).toBe('9 días');
    });

    test('tonoDias: gris hasta 7, ámbar de 8 a 30, rojo más de 30', () => {
        expect(tonoDias(0)).toBe('neutro');
        expect(tonoDias(7)).toBe('neutro');
        expect(tonoDias(8)).toBe('ambar');
        expect(tonoDias(30)).toBe('ambar');
        expect(tonoDias(31)).toBe('rojo');
        expect(tonoDias(null)).toBe('neutro');
    });

    test('masAntiguasPrimero no toca la lista original y respeta el orden a igualdad', () => {
        const lista = [{ id: 1, dias: 2 }, { id: 2, dias: 9 }, { id: 3, dias: 2 }];
        expect(masAntiguasPrimero(lista).map(x => x.id)).toEqual([2, 1, 3]);
        expect(lista.map(x => x.id)).toEqual([1, 2, 3]);
    });
});

describe('cantidades y unidades', () => {
    test('numero: decimales con coma y miles con punto, sin ruido de los DECIMAL', () => {
        expect(numero(40)).toBe('40');
        expect(numero(2.5)).toBe('2,5');
        expect(numero(12000)).toBe('12.000');
        expect(numero(0.1 + 0.2)).toBe('0,3');
    });

    test('las formas de escribir «unidad» son unidad (y vacío o null también)', () => {
        for (const u of ['U', 'UN', 'un', 'Und.', 'UNIDAD', 'Unidades', '', null, undefined]) expect(esUnidad(u)).toBe(true);
        expect(esUnidad('SACO')).toBe(false);
    });

    test('cantidad (larga) y cantidadCorta, en singular y plural', () => {
        expect(cantidad(3, 'UN')).toBe('3 unidades');
        expect(cantidad(1, 'U')).toBe('1 unidad');
        expect(cantidad(2, 'SACO')).toBe('2 sacos');
        expect(cantidad(1, 'Saco')).toBe('1 saco');
        expect(cantidad(4, 'M3')).toBe('4 m³');
        expect(cantidad(2.5, 'm3')).toBe('2,5 m³');
        expect(cantidad(25, 'KG')).toBe('25 kg');
        expect(cantidad(2, 'PAR')).toBe('2 pares');
        expect(cantidad(3, 'MT')).toBe('3 metros');
        expect(cantidadCorta(15, 'UN')).toBe('15 un.');
        expect(cantidadCorta(40, 'SACO')).toBe('40 sacos');
        expect(cantidadCorta(3, 'MT')).toBe('3 m');
    });

    test('una unidad desconocida va tal cual, en minúscula y sin plural', () => {
        expect(unidadDe('Galonetas').larga).toEqual(['galonetas', 'galonetas']);
        expect(cantidad(2, 'TRIPODES')).toBe('2 tripodes');
    });
});

describe('ítems', () => {
    test('itemPor (lienzo A): la unidad no se nombra; lo demás, en palabras', () => {
        expect(itemPor(item('Arnés de seguridad', 'UN', 6))).toBe('Arnés de seguridad ×6');
        expect(itemPor(item('Cemento', 'SACO', 40))).toBe('Cemento ×40 sacos');
        expect(itemPor(item('Arena gruesa', 'M3', 3))).toBe('Arena gruesa ×3 m³');
        expect(itemPor(item('Cemento', 'SACO', 40), 1)).toBe('Cemento ×1 saco');
        expect(itemPor(item('  ', null, 2))).toBe('Ítem sin nombre ×2');
    });

    test('itemConCantidad (lienzo B): «Cemento (40 sacos)», «Andamio (12 un.)»', () => {
        expect(itemConCantidad(item('Cemento', 'SACO', 40))).toBe('Cemento (40 sacos)');
        expect(itemConCantidad(item('Andamio marco 1,5 m', 'UN', 12))).toBe('Andamio marco 1,5 m (12 un.)');
    });

    test('enLista y fraseItems: «A, B y 1 ítem más»', () => {
        expect(enLista([])).toBe('');
        expect(enLista(['A'])).toBe('A');
        expect(enLista(['A', 'B'])).toBe('A y B');
        expect(enLista(['A', 'B', 'C'])).toBe('A, B y C');
        const tres = [item('Arnés de seguridad', 'UN', 6), item('Casco con barbiquejo', 'UN', 10), item('Señalética', 'UN', 4)];
        expect(fraseItems(tres)).toBe('Arnés de seguridad ×6, Casco con barbiquejo ×10 y 1 ítem más');
        expect(fraseItems(tres, { max: 3 })).toBe('Arnés de seguridad ×6, Casco con barbiquejo ×10 y Señalética ×4');
        expect(fraseItems(tres.slice(0, 2), { formato: itemConCantidad })).toBe('Arnés de seguridad (6 un.) y Casco con barbiquejo (10 un.)');
        expect(fraseItems([...tres, item('Botiquín', 'UN', 1)])).toBe('Arnés de seguridad ×6, Casco con barbiquejo ×10 y 2 ítems más');
        expect(fraseItems([])).toBe('');
    });

    test('TIPO nombra materiales y herramientas', () => {
        expect(TIPO.materiales).toBe('Materiales');
        expect(TIPO.herramientas).toBe('Herramientas');
    });
});

describe('diferencias', () => {
    test('textoDiferencia: faltante, sobrante, pasado y minúscula', () => {
        expect(textoDiferencia(2, 'SACO')).toBe('Faltan 2 sacos');
        expect(textoDiferencia(1, 'UN')).toBe('Falta 1 unidad');
        expect(textoDiferencia(-1, 'UN')).toBe('Llegó 1 unidad de más');
        expect(textoDiferencia(-3, 'UN')).toBe('Llegaron 3 unidades de más');
        expect(textoDiferencia(2, 'SACO', { pasado: true })).toBe('Faltaron 2 sacos');
        expect(textoDiferencia(1, 'SACO', { pasado: true })).toBe('Faltó 1 saco');
        expect(textoDiferencia(3, 'UN', { minuscula: true })).toBe('faltan 3 unidades');
        expect(textoDiferencia(0, 'UN')).toBe('');
    });

    test('llegoDistinto: null si llegó todo o no hay recepción; un ítem en pasado; varios contados', () => {
        expect(llegoDistinto({ items: [item('Cemento', 'SACO', 50, 50, 50)] })).toBeNull();
        expect(llegoDistinto({ items: [item('Cemento', 'SACO', 50, 50, null)] })).toBeNull();
        expect(llegoDistinto({ items: [item('Cemento', 'SACO', 50, 50, 48), item('Fierro', 'BARRA', 40, 40, 40)] }))
            .toEqual({ items: 1, texto: 'Faltaron 2 sacos' });
        expect(llegoDistinto({ items: [item('Puntal', 'UN', 20, 20, 21)] })).toEqual({ items: 1, texto: 'Llegó 1 unidad de más' });
        expect(llegoDistinto({ items: [item('A', 'UN', 2, 2, 1), item('B', 'UN', 3, 3, 4)] })).toEqual({ items: 2, texto: '2 ítems con diferencia' });
        // Un 0 enviado es un 0 de verdad (el aprobador lo cortó): si llegó algo, es diferencia.
        expect(llegoDistinto({ items: [item('A', 'UN', 2, 0, 1)] })).toEqual({ items: 1, texto: 'Llegó 1 unidad de más' });
    });
});

describe('personas y lugares', () => {
    test('nombreDe y nombreCortoDe: null si la app no guardó el nombre', () => {
        expect(nombreDe({ id: 1, nombre: ' Leonardo López ' })).toBe('Leonardo López');
        expect(nombreDe({ id: 1, nombre: null })).toBeNull();
        expect(nombreDe(null)).toBeNull();
        expect(nombreCortoDe({ id: 1, nombre: 'Leonardo López' })).toBe('Leonardo');
        expect(nombreCortoDe(null)).toBeNull();
    });

    test('quienAprueba: uno, dos o nadie (con más de dos, sin nombre)', () => {
        expect(quienAprueba([{ id: 7, nombre: 'Leonardo López' }])).toBe('Leonardo');
        expect(quienAprueba([{ id: 7, nombre: 'Leonardo López' }, { id: 8, nombre: 'Ana Rojas' }])).toBe('Leonardo o Ana');
        expect(quienAprueba([{ id: 1, nombre: 'A B' }, { id: 2, nombre: 'C D' }, { id: 3, nombre: 'E F' }])).toBeNull();
        expect(quienAprueba([])).toBeNull();
        expect(quienAprueba(undefined)).toBeNull();
        expect(quienAprueba([{ id: 9, nombre: null }])).toBeNull();
    });

    test('nombreLugar: obra o bodega; con responsable solo si se pide', () => {
        expect(nombreLugar({ tipo: 'obra', id: 1, nombre: 'Domeyko', responsable: null })).toBe('Domeyko');
        const bodega = { tipo: 'bodega' as const, id: 2, nombre: 'Bodega Central', responsable: 'Juan Pérez' };
        expect(nombreLugar(bodega)).toBe('Bodega Central');
        expect(nombreLugar(bodega, { conResponsable: true })).toBe('Bodega Central (Juan Pérez)');
        expect(nombreLugar(null)).toBeNull();
        expect(nombreLugar({ tipo: 'obra', id: 3, nombre: '  ', responsable: null })).toBeNull();
    });
});

describe('enlaces a Inventario', () => {
    test('rutaSolicitud abre la solicitud en el filtro donde aparece', () => {
        expect(rutaSolicitud({ id: 41, estado: 'pendiente' })).toBe('/inventario?tab=transferencias&estado=pendiente&id=41');
        expect(rutaSolicitud({ id: 31, estado: 'aprobada' })).toBe('/inventario?tab=transferencias&estado=aprobada&id=31');
        expect(rutaSolicitud({ id: 33, estado: 'en_transito' })).toBe('/inventario?tab=transferencias&estado=todas&id=33');
        expect(rutaSolicitud({ id: 21, estado: 'recibida' })).toBe('/inventario?tab=transferencias&estado=recibida&id=21');
        expect(rutaSolicitud({ id: 24, estado: 'rechazada' })).toBe('/inventario?tab=transferencias&estado=todas&id=24');
    });

    test('rutaDiferencia, rutaLista y RUTA_PEDIR', () => {
        expect(rutaDiferencia(25)).toBe('/inventario?tab=transferencias&estado=discrepancias&id=25');
        expect(rutaLista()).toBe('/inventario?tab=transferencias&estado=todas');
        expect(rutaLista('pendiente')).toBe('/inventario?tab=transferencias&estado=pendiente');
        expect(RUTA_PEDIR).toBe('/inventario?tab=transferencias&nuevo=pedir');
    });
});
