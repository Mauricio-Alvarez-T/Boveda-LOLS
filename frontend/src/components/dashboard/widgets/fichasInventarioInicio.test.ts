import {
    ariaCamino, bajadaFicha, cantidadDiferencia, cantidadItem, ETAPAS_FICHA, filtrarYOrdenar, fraseFicha, opcionesFiltro,
    pasosCamino, pildorasFicha, rutaFicha, rutaLista, textoAccion, textoDesplegar, tituloFicha, tonoEdad,
    type DiferenciaFichaApi, type FichaInventarioApi, type ItemFichaApi,
} from './fichasInventarioInicio';
import { resumenInventarioInicio, type ResumenInventarioApi } from './resumenInventarioInicio';

const nada: ResumenInventarioApi = { por_aprobar: null, discrepancias: null, por_despachar: null, por_recibir: null, mis_solicitudes: null };

const item = (id: number, nombre: string, cantidad: number, extra: Partial<ItemFichaApi> = {}): ItemFichaApi =>
    ({ id, nombre, unidad: null, cantidad, recibida: null, ...extra });

const dif = (id: number, nombre: string, enviada: number, recibida: number): DiferenciaFichaApi =>
    ({ id, nombre, unidad: null, enviada, recibida, diferencia: enviada - recibida });

const ficha = (id: number, extra: Partial<FichaInventarioApi> = {}): FichaInventarioApi => ({
    id, codigo: `TRF-202610-${String(id).padStart(4, '0')}`, estado: 'pendiente', tipo_flujo: 'solicitud', etapa: 'por_aprobar',
    origen_nombre: 'Bodega Cerrillos', destino_nombre: 'Bascuñán 661', solicitante_id: 14, solicitante_nombre: 'Ana Rojas',
    dias: 3, estancada: false, accion: 'aprobar', bloqueo: null,
    items: [item(1, 'Andamio', 4)], diferencias: [], faltan: 0, sobran: 0,
    ...extra,
});

describe('ETAPAS_FICHA', () => {
    test('dice lo mismo que las filas de la tarjeta del Inicio', () => {
        const todas = { total: 1, dias: 1 };
        const filas = resumenInventarioInicio({ ...nada, por_aprobar: todas, discrepancias: todas, por_despachar: todas, por_recibir: todas }).filas;
        for (const f of filas) {
            const etapa = f.clave as keyof typeof ETAPAS_FICHA;
            expect(ETAPAS_FICHA[etapa].texto).toBe(f.texto);
        }
        expect(Object.values(ETAPAS_FICHA).map(e => e.tono)).toEqual(['ambar', 'ambar', 'azul', 'rojo']);
    });
});

describe('tonoEdad', () => {
    test('hasta 7 neutro, de 8 a 30 ámbar, más de 30 rojo', () => {
        expect([0, 7, 8, 30, 31].map(tonoEdad)).toEqual(['neutro', 'neutro', 'ambar', 'ambar', 'rojo']);
    });
});

describe('fraseFicha', () => {
    test('dos ítems y el resto contado', () => {
        const f = ficha(1, { items: [item(1, 'Andamio', 4), item(2, 'Carretilla', 7), item(3, 'Pala', 2), item(4, 'Nivel', 1)] });
        expect(fraseFicha(f)).toBe('Ana pidió Andamio ×4, Carretilla ×7 y 2 ítems más.');
        expect(fraseFicha({ ...f, items: f.items.slice(0, 3) })).toBe('Ana pidió Andamio ×4, Carretilla ×7 y 1 ítem más.');
    });

    test('uno o dos ítems: sin «más»; dos van con «y»', () => {
        expect(fraseFicha(ficha(1))).toBe('Ana pidió Andamio ×4.');
        expect(fraseFicha(ficha(1, { items: [item(1, 'Andamio', 4), item(2, 'Carretilla', 2.5)] })))
            .toBe('Ana pidió Andamio ×4 y Carretilla ×2,5.');
    });

    test('push directo «envió»; sin solicitante no queda vacío; recepción parcial lo dice', () => {
        expect(fraseFicha(ficha(1, { tipo_flujo: 'push_directo', etapa: 'por_recibir' }))).toBe('Ana envió Andamio ×4.');
        expect(fraseFicha(ficha(1, { solicitante_nombre: null }))).toBe('Pedido: Andamio ×4.');
        expect(fraseFicha(ficha(1, { etapa: 'por_recibir', estado: 'recepcion_parcial' }))).toBe('Ana pidió Andamio ×4. Ya llegó una parte.');
    });

    test('sin ítems nunca deja «.»', () => {
        expect(fraseFicha(ficha(1, { items: [] }))).toBe('Solicitud de Ana, sin ítems.');
        expect(fraseFicha(ficha(1, { items: [], solicitante_nombre: '  ' }))).toBe('Solicitud sin ítems.');
    });

    test('diferencias: faltante, sobrante y el resto contado', () => {
        const base = { etapa: 'discrepancias' as const, estado: 'recibida' };
        expect(fraseFicha(ficha(1, { ...base, diferencias: [dif(9, 'Taladro', 3, 1)] }))).toBe('De Taladro llegó 1 de 3.');
        expect(fraseFicha(ficha(1, { ...base, diferencias: [dif(9, 'Taladro', 3, 0), dif(10, 'Nivel', 5, 6)] })))
            .toBe('De Taladro llegaron 0 de 3. De Nivel llegaron 6 y se enviaron 5.');
        expect(fraseFicha(ficha(1, { ...base, diferencias: [dif(9, 'A', 3, 1), dif(10, 'B', 2, 1), dif(11, 'C', 1, 0)] })))
            .toBe('De A llegó 1 de 3. De B llegó 1 de 2. Y 1 diferencia más.');
        expect(fraseFicha(ficha(1, { ...base, diferencias: [] }))).toBe('Llegó con diferencias por revisar.');
    });
});

describe('cabeza de la ficha', () => {
    test('destino por definir y bajada sin origen', () => {
        expect(tituloFicha(ficha(1))).toBe('Bascuñán 661');
        expect(tituloFicha(ficha(1, { destino_nombre: null }))).toBe('Destino por definir');
        expect(bajadaFicha(ficha(7))).toBe('desde Bodega Cerrillos · TRF-202610-0007');
        expect(bajadaFicha(ficha(7, { origen_nombre: null }))).toBe('TRF-202610-0007');
    });
});

describe('textoAccion y píldoras', () => {
    test('acción o «Ver solicitud»', () => {
        expect(textoAccion(ficha(1))).toBe('Aprobar');
        expect(textoAccion(ficha(1, { accion: 'recibir' }))).toBe('Recibir');
        expect(textoAccion(ficha(1, { accion: 'resolver' }))).toBe('Resolver');
        expect(textoAccion(ficha(1, { accion: null, bloqueo: 'sod_solicitante' }))).toBe('Ver solicitud');
    });

    test('etapa, estancada, faltan, sobran y por qué no puede actuar', () => {
        expect(pildorasFicha(ficha(1))).toEqual([{ texto: 'Por aprobar', tono: 'ambar' }]);
        expect(pildorasFicha(ficha(1, { estancada: true, accion: null, bloqueo: 'sod_solicitante' }))).toEqual([
            { texto: 'Por aprobar', tono: 'ambar' }, { texto: 'Estancada', tono: 'rojo' }, { texto: 'Pedida por ti', tono: 'neutro' },
        ]);
        expect(pildorasFicha(ficha(1, { etapa: 'discrepancias', accion: 'resolver', faltan: 2, sobran: 1.5 }))).toEqual([
            { texto: 'Diferencias por resolver', tono: 'rojo' }, { texto: 'Faltan 2 u.', tono: 'rojo' }, { texto: 'Sobran 1,5 u.', tono: 'ambar' },
        ]);
        expect(pildorasFicha(ficha(1, { etapa: 'por_recibir', accion: null, bloqueo: 'otra_bodega' })).map(p => p.texto))
            .toEqual(['En tránsito, por recibir', 'Va a otra bodega']);
    });

    test('faltantes y sobrantes: singular, unidad compartida o, si se mezclan, cuántos ítems', () => {
        const conUnidad = (id: number, unidad: string | null, enviada: number, recibida: number) => ({ ...dif(id, `Ítem ${id}`, enviada, recibida), unidad });
        const textos = (extra: Partial<FichaInventarioApi>) => pildorasFicha(ficha(1, { etapa: 'discrepancias', accion: 'resolver', ...extra })).map(p => p.texto).slice(1);
        expect(textos({ diferencias: [conUnidad(1, 'UN', 3, 2)], faltan: 1 })).toEqual(['Falta 1 u.']);
        expect(textos({ diferencias: [conUnidad(1, 'SACO', 5, 3)], faltan: 2 })).toEqual(['Faltan 2 SACO']);
        expect(textos({ diferencias: [conUnidad(1, null, 4, 5)], sobran: 1 })).toEqual(['Sobra 1 u.']);
        expect(textos({ diferencias: [conUnidad(1, 'SACO', 4, 2), conUnidad(2, 'M3', 1, 0.5)], faltan: 2.5 })).toEqual(['2 ítems con faltante']);
    });
});

describe('lista desplegable', () => {
    test('ítems o diferencias; nada si está vacía', () => {
        const f = ficha(1, { items: [item(1, 'A', 1), item(2, 'B', 1), item(3, 'C', 1)] });
        expect(textoDesplegar(f, false)).toBe('Ver 3 ítems');
        expect(textoDesplegar(f, true)).toBe('Ocultar ítems');
        expect(textoDesplegar(ficha(1), false)).toBe('Ver 1 ítem');
        expect(textoDesplegar(ficha(1, { items: [] }), false)).toBeNull();
        const d = ficha(1, { etapa: 'discrepancias', diferencias: [dif(9, 'Taladro', 3, 1)] });
        expect(textoDesplegar(d, false)).toBe('Ver 1 diferencia');
        expect(textoDesplegar(d, true)).toBe('Ocultar diferencias');
    });

    test('cantidades con unidad y lo ya recibido', () => {
        expect(cantidadItem(item(1, 'A', 4))).toBe('×4');
        expect(cantidadItem(item(1, 'A', 4, { unidad: 'UN' }))).toBe('4 UN');
        expect(cantidadItem(item(1, 'A', 4, { unidad: 'UN', recibida: 2 }))).toBe('2 de 4 UN');
        expect(cantidadItem(item(1, 'A', 1000))).toBe('×1.000');
        expect(cantidadDiferencia({ ...dif(9, 'Taladro', 3, 1), unidad: 'UN' })).toBe('1 de 3 UN');
    });
});

describe('rutas', () => {
    test('la solicitud abierta en su lista; tránsito va en «todas»', () => {
        expect(rutaFicha(ficha(812))).toBe('/inventario?tab=transferencias&estado=pendiente&id=812');
        expect(rutaFicha(ficha(812, { etapa: 'por_despachar' }))).toBe('/inventario?tab=transferencias&estado=aprobada&id=812');
        expect(rutaFicha(ficha(812, { etapa: 'por_recibir' }))).toBe('/inventario?tab=transferencias&estado=todas&id=812');
        expect(rutaFicha(ficha(812, { etapa: 'discrepancias' }))).toBe('/inventario?tab=transferencias&estado=discrepancias&id=812');
        expect(rutaLista('todas')).toBe('/inventario?tab=transferencias&estado=todas');
        expect(rutaLista('por_aprobar')).toBe('/inventario?tab=transferencias&estado=pendiente');
    });
});

describe('opcionesFiltro', () => {
    test('«Todas» + solo los grupos que no vienen en null, en orden del flujo; sin «Tus solicitudes»', () => {
        const o = opcionesFiltro({
            ...nada,
            por_aprobar: { total: 3, dias: 6 },
            discrepancias: { total: 2, dias: 4 },
            mis_solicitudes: { total: 5, dias: 1 },
        });
        expect(o.map(x => [x.key, x.texto, x.n])).toEqual([
            ['todas', 'Todas', 5],
            ['por_aprobar', 'Por aprobar', 3],
            ['discrepancias', 'Diferencias por resolver', 2],
        ]);
    });

    test('grupo en cero se muestra; cargando o sin grupos: solo «Todas» con 0', () => {
        expect(opcionesFiltro({ ...nada, por_despachar: { total: 0, dias: null } }).map(x => [x.key, x.n]))
            .toEqual([['todas', 0], ['por_despachar', 0]]);
        expect(opcionesFiltro(null)).toEqual([{ key: 'todas', texto: 'Todas', n: 0 }]);
        expect(opcionesFiltro(nada)).toEqual([{ key: 'todas', texto: 'Todas', n: 0 }]);
    });
});

describe('filtrarYOrdenar', () => {
    const lista = [
        ficha(1, { dias: 2 }),
        ficha(2, { dias: 40, etapa: 'discrepancias' }),
        ficha(3, { dias: 9, etapa: 'por_recibir' }),
        ficha(4, { dias: 9 }),
    ];

    test('todas: por días de mayor a menor y, a igualdad, por id', () => {
        expect(filtrarYOrdenar(lista, 'todas').map(f => f.id)).toEqual([2, 3, 4, 1]);
    });

    test('una etapa; no cambia el arreglo de entrada', () => {
        expect(filtrarYOrdenar(lista, 'por_aprobar').map(f => f.id)).toEqual([4, 1]);
        expect(filtrarYOrdenar(lista, 'por_despachar')).toEqual([]);
        expect(lista.map(f => f.id)).toEqual([1, 2, 3, 4]);
    });
});

describe('pasosCamino', () => {
    test('cada etapa marca lo hecho, el paso en curso y lo que falta', () => {
        expect(pasosCamino('por_aprobar', 'solicitud')).toEqual(['hecho', 'en_curso', 'falta', 'falta']);
        expect(pasosCamino('por_despachar', 'solicitud')).toEqual(['hecho', 'hecho', 'en_curso', 'falta']);
        expect(pasosCamino('por_recibir', null)).toEqual(['hecho', 'hecho', 'hecho', 'en_curso']);
        expect(pasosCamino('discrepancias', 'solicitud')).toEqual(['hecho', 'hecho', 'hecho', 'con_diferencias']);
    });

    test('push directo y orden de gerencia: P y A cuentan hechos', () => {
        expect(pasosCamino('por_recibir', 'push_directo')).toEqual(['hecho', 'hecho', 'hecho', 'en_curso']);
        expect(pasosCamino('por_despachar', 'orden_gerencia')).toEqual(['hecho', 'hecho', 'en_curso', 'falta']);
    });

    test('texto para lectores de pantalla', () => {
        expect(ariaCamino(pasosCamino('discrepancias', 'solicitud')))
            .toBe('Camino de la solicitud. Pedida: hecho, Aprobada: hecho, Despachada: hecho, Recibida: con diferencias.');
    });
});
