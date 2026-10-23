import * as fs from 'fs';
import * as path from 'path';
import {
    NOTA_PROPIA, RUTA_DIFERENCIAS, RUTA_POR_APROBAR, TEXTO_FUERA_DE_LISTA, TOPE_LEO, avisoDiferencias, bajadaPorAprobar, cargoDe,
    esPropiaBloqueada, etiquetaCircuito, etiquetaPaso, filaPorAprobar, marcaPedida, mesLargo, pasosCircuito, porAprobar,
    textoCifra, textoEspera, textoHasta, textoPie, textoVacio,
} from './leonardo.modelo';
import type { CircuitoPerfil, SolicitudPerfil } from './tipos';

const sol = (o: Partial<SolicitudPerfil> & { id: number }): SolicitudPerfil => ({
    codigo: `TRF-202610-00${o.id}`,
    estado: 'pendiente',
    etapa: 'pedida',
    tipo_flujo: 'solicitud',
    tipo: 'materiales',
    origen: null,
    destino: { tipo: 'obra', id: 2, nombre: 'Gorbea 3082', responsable: null },
    solicitante: { id: 21, nombre: 'Carla Soto', rol: 'Prevencionista' },
    propia: false,
    fecha_solicitud: '2026-10-13',
    aprobacion: null,
    despacho: null,
    recepcion: null,
    ultima_recepcion: null,
    rechazo: null,
    dias: 0,
    del_mes: false,
    puede_aprobar: true,
    bloqueo_aprobar: null,
    items: [],
    ...o,
});

const CIRCUITO: CircuitoPerfil = {
    pedida: { total: 6, dias: 9 },
    aprobada: { total: 2, dias: 4 },
    despachada: { total: 2, dias: 2 },
    recibida: { total: 5, ultima: '2026-10-21' },
    diferencias: { total: 3, dias: 12, items: 4 },
};

describe('porAprobar', () => {
    it('deja solo las pendientes, las que llevan más días primero', () => {
        const lista = [
            sol({ id: 1, dias: 2 }),
            sol({ id: 2, dias: 9 }),
            sol({ id: 3, estado: 'aprobada', etapa: 'aprobada', dias: 30 }),
            sol({ id: 4, dias: 0 }),
            sol({ id: 5, estado: 'recibida', etapa: 'recibida', dias: 40 }),
            sol({ id: 6, estado: 'rechazada', etapa: 'rechazada', dias: 50 }),
            sol({ id: 7, dias: 9 }),
        ];
        expect(porAprobar({ solicitudes: lista }).map(s => s.id)).toEqual([2, 7, 1, 4]);
        // No cambia la lista original.
        expect(lista.map(s => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('sin pendientes, vacía', () => {
        expect(porAprobar({ solicitudes: [] })).toEqual([]);
    });
});

describe('textos de la cabeza', () => {
    it('concuerda la frase con la cifra', () => {
        expect(textoCifra(6)).toBe('solicitudes esperan tu aprobación');
        expect(textoCifra(1)).toBe('solicitud espera tu aprobación');
        expect(textoCifra(0)).toBe('solicitudes esperan tu aprobación');
    });

    it('la bajada del lienzo con varias', () => {
        expect(bajadaPorAprobar(6, 9)).toBe('La más antigua lleva 9 días: empieza por arriba.');
        expect(bajadaPorAprobar(2, 1)).toBe('La más antigua lleva 1 día: empieza por arriba.');
        // Sin «lleva de hoy».
        expect(bajadaPorAprobar(3, 0)).toBe('La más antigua es de hoy: empieza por arriba.');
    });

    it('con una sola no dice «la más antigua»', () => {
        expect(bajadaPorAprobar(1, 4)).toBe('Lleva 4 días esperando.');
        expect(bajadaPorAprobar(1, 0)).toBe('Es de hoy.');
        expect(bajadaPorAprobar(1, null)).toBe('Es de hoy.');
    });

    it('sin pendientes no hay bajada (va el vacío)', () => {
        expect(bajadaPorAprobar(0, null)).toBeUndefined();
    });

    it('avisa de las que pidió él mismo (SoD)', () => {
        expect(bajadaPorAprobar(6, 9, 1)).toBe('La más antigua lleva 9 días: empieza por arriba. Una la pediste tú: la aprueba otra persona.');
        expect(bajadaPorAprobar(6, 9, 2)).toBe('La más antigua lleva 9 días: empieza por arriba. 2 las pediste tú: las aprueba otra persona.');
        expect(bajadaPorAprobar(1, 3, 1)).toBe('Lleva 3 días esperando. La pediste tú: la aprueba otra persona.');
    });

    it('sin pendientes: «todo al día» solo si tampoco quedan diferencias (las resuelve él)', () => {
        expect(textoVacio(0)).toBe('Nada por aprobar. Todo al día.');
        expect(textoVacio(4)).toBe('Nada por aprobar.');
    });
});

describe('pie y tope', () => {
    it('muestra 5 a la vista', () => {
        expect(TOPE_LEO).toBe(5);
    });

    it('el pie no promete una cifra (Inventario pagina de a 20, de la más nueva a la más antigua)', () => {
        expect(textoPie(6)).toBe('Ver todas en Inventario');
        expect(textoPie(37)).toBe('Ver todas en Inventario');
        expect(textoPie(5)).toBe('Ver en Inventario');
        expect(textoPie(1)).toBe('Ver en Inventario');
        expect(textoPie(37)).not.toMatch(/\d/);
    });

    it('lleva a Inventario → Solicitudes por aprobar', () => {
        expect(RUTA_POR_APROBAR).toBe('/inventario?tab=transferencias&estado=pendiente');
    });

    it('si hay pendientes pero ninguna vino en la lista, dice dónde están', () => {
        expect(TEXTO_FUERA_DE_LISTA).toContain('Inventario → Pendientes');
    });
});

describe('cargoDe (el rol solo si se lee como un cargo)', () => {
    it('muestra los roles que dicen qué hace la persona', () => {
        ['Prevencionista', 'Jefe de Obra', 'Jefe Obra', 'Jefa de bodega', 'Bodeguero', 'Supervisor de cuadrilla', 'Capataz',
            'Administrador de obra', 'Encargado de bodega', 'Experto en Prevención de Riesgos', 'Técnico en construcción']
            .forEach(rol => expect(cargoDe(rol)).toBe(rol));
        expect(cargoDe('  Jefe de Obra ')).toBe('Jefe de Obra');
    });

    it('no muestra roles de acceso genéricos', () => {
        ['En Terreno', 'Administrador', 'Super Administrador', 'Operaciones', 'Gerencia / PM', 'Jefatura', 'RRHH', 'Usuario']
            .forEach(rol => expect(cargoDe(rol)).toBeNull());
        expect(cargoDe(null)).toBeNull();
        expect(cargoDe(undefined)).toBeNull();
        expect(cargoDe('   ')).toBeNull();
    });
});

describe('filaPorAprobar', () => {
    const items = [
        { clave: 'p1', personalizado: true, descripcion: 'Arnés de seguridad', unidad: 'UN', pedida: 6, enviada: null, recibida: null },
        { clave: 'p2', personalizado: true, descripcion: 'Casco con barbiquejo', unidad: 'UN', pedida: 10, enviada: null, recibida: null },
        { clave: 'p3', personalizado: true, descripcion: 'Señalética «Peligro»', unidad: 'UN', pedida: 4, enviada: null, recibida: null },
    ];

    it('arma la fila del lienzo con los datos reales', () => {
        const f = filaPorAprobar(sol({ id: 41, dias: 9, items }), 0, 6);
        expect(f).toMatchObject({
            id: 41,
            codigo: 'TRF-202610-0041',
            lugar: 'Gorbea 3082',
            codigoAparte: true,
            solicitante: 'Carla Soto',
            iniciales: 'CS',
            quien: 'Carla Soto · Prevencionista',
            items: 'Arnés de seguridad ×6, Casco con barbiquejo ×10 y 1 ítem más',
            tipo: 'Materiales',
            tono: 'ambar',
            tonoCirculo: 'neutro',
            textoDias: '9 días',
            textoEspera: '9 días esperando',
            masAntigua: true,
            propia: false,
            ruta: '/inventario?tab=transferencias&estado=pendiente&id=41',
        });
    });

    it('«Aprobar o rechazar» abre esa solicitud en Inventario', () => {
        expect(filaPorAprobar(sol({ id: 7 }), 3, 6).ruta).toBe('/inventario?tab=transferencias&estado=pendiente&id=7');
    });

    it('la píldora «La más antigua» va solo en la primera y si hay más de una', () => {
        expect(filaPorAprobar(sol({ id: 1 }), 0, 3).masAntigua).toBe(true);
        expect(filaPorAprobar(sol({ id: 2 }), 1, 3).masAntigua).toBe(false);
        expect(filaPorAprobar(sol({ id: 3 }), 0, 1).masAntigua).toBe(false);
    });

    it('colores de los días: gris hasta 7, ámbar 8 a 30, rojo más de 30 (y el círculo rojo)', () => {
        expect(filaPorAprobar(sol({ id: 1, dias: 7 }), 0, 1)).toMatchObject({ tono: 'neutro', tonoCirculo: 'neutro' });
        expect(filaPorAprobar(sol({ id: 1, dias: 8 }), 0, 1)).toMatchObject({ tono: 'ambar', tonoCirculo: 'neutro' });
        expect(filaPorAprobar(sol({ id: 1, dias: 30 }), 0, 1)).toMatchObject({ tono: 'ambar', tonoCirculo: 'neutro' });
        expect(filaPorAprobar(sol({ id: 1, dias: 31 }), 0, 1)).toMatchObject({ tono: 'rojo', tonoCirculo: 'rojo' });
    });

    it('la de hoy dice «de hoy»', () => {
        expect(filaPorAprobar(sol({ id: 1, dias: 0 }), 0, 1)).toMatchObject({ textoDias: 'de hoy', textoEspera: 'de hoy' });
        expect(textoEspera(1)).toBe('1 día esperando');
    });

    it('herramientas', () => {
        expect(filaPorAprobar(sol({ id: 1, tipo: 'herramientas' }), 0, 1).tipo).toBe('Herramientas');
    });

    it('el rol de acceso no va como cargo: solo el nombre', () => {
        expect(filaPorAprobar(sol({ id: 1, solicitante: { id: 3, nombre: 'Ana Rojas', rol: 'En Terreno' } }), 0, 1).quien).toBe('Ana Rojas');
        expect(filaPorAprobar(sol({ id: 1, solicitante: { id: 3, nombre: 'Ana Rojas', rol: 'Administrador' } }), 0, 1).quien).toBe('Ana Rojas');
        expect(filaPorAprobar(sol({ id: 1, solicitante: { id: 3, nombre: 'Ana Rojas', rol: 'Jefe Obra' } }), 0, 1).quien).toBe('Ana Rojas · Jefe Obra');
    });

    it('una bodega de destino se ve como en el resto de la app: con su responsable', () => {
        const f = filaPorAprobar(sol({ id: 1, destino: { tipo: 'bodega', id: 4, nombre: 'Bodega Central', responsable: ' Juan Pérez ' } }), 0, 1);
        expect(f.lugar).toBe('Bodega Central (Juan Pérez)');
        expect(filaPorAprobar(sol({ id: 1, destino: { tipo: 'bodega', id: 4, nombre: 'Bodega Central', responsable: null } }), 0, 1).lugar)
            .toBe('Bodega Central');
    });

    it('sin datos de la app no inventa: sin rol, sin nombre, sin destino, sin ítems', () => {
        expect(filaPorAprobar(sol({ id: 1, solicitante: { id: 3, nombre: 'Ana Rojas', rol: null } }), 0, 1).quien).toBe('Ana Rojas');
        const sinNada = filaPorAprobar(sol({ id: 9, solicitante: null, destino: null, items: [] }), 0, 1);
        expect(sinNada).toMatchObject({
            solicitante: null, iniciales: '', quien: '', lugar: 'TRF-202610-009', items: 'Sin ítems registrados',
            // El código ya es el título: no se repite en la línea de las píldoras.
            codigoAparte: false,
        });
    });

    it('SoD: la que pidió él mismo lleva la nota en vez del botón', () => {
        const propia = sol({ id: 5, propia: true, puede_aprobar: false, bloqueo_aprobar: 'sod_solicitante' });
        expect(esPropiaBloqueada(propia)).toBe(true);
        expect(filaPorAprobar(propia, 0, 1).propia).toBe(true);
        expect(NOTA_PROPIA).toBe('La pediste tú: la aprueba otra persona');
        // Con sod_bypass el servidor manda puede_aprobar = true aunque sea propia.
        expect(esPropiaBloqueada(sol({ id: 6, propia: true, puede_aprobar: true }))).toBe(false);
        expect(esPropiaBloqueada(sol({ id: 7, puede_aprobar: null }))).toBe(false);
    });
});

describe('circuito', () => {
    it('tres etapas (sin «Despachada»: don Luis 2026-10-23); «Aprobada» suma las en tránsito y abre «Todas»', () => {
        expect(pasosCircuito(CIRCUITO, '2026-10-22')).toEqual([
            {
                key: 'pedida', texto: 'Pedida', bajada: 'por aprobar', total: 6, hasta: 9,
                ruta: '/inventario?tab=transferencias&estado=pendiente', abre: 'Abre «Pendientes» en Inventario',
            },
            {
                // 2 aprobadas + 2 en tránsito; los días, los de la más antigua de las dos.
                key: 'aprobada', texto: 'Aprobada', bajada: 'por recibir', total: 4, hasta: 4,
                ruta: '/inventario?tab=transferencias&estado=todas',
                abre: 'Abre «Todas» en Inventario: algunas por recibir no están en «Aprobadas»',
            },
            {
                key: 'recibida', texto: 'Recibida', bajada: 'en octubre', total: 5, hasta: null,
                ruta: '/inventario?tab=transferencias&estado=recibida', abre: 'Abre «Recibidas» en Inventario, de todos los meses',
            },
        ]);
    });

    it('sin ninguna en tránsito, «Aprobada» abre «Aprobadas»; días: el máximo de las dos', () => {
        const sinTransito: CircuitoPerfil = { ...CIRCUITO, despachada: { total: 0, dias: null } };
        expect(pasosCircuito(sinTransito, '2026-10-22')[1]).toMatchObject({
            total: 2, hasta: 4, ruta: '/inventario?tab=transferencias&estado=aprobada', abre: 'Abre «Aprobadas» en Inventario',
        });
        const transitoViejo: CircuitoPerfil = { ...CIRCUITO, despachada: { total: 1, dias: 11 } };
        expect(pasosCircuito(transitoViejo, '2026-10-22')[1]).toMatchObject({ total: 3, hasta: 11 });
        expect(pasosCircuito(CIRCUITO, '2026-10-22').map(p => p.texto)).toEqual(['Pedida', 'Aprobada', 'Recibida']);
    });

    it('«Aprobada» no afirma que no ha salido (la app no registra la salida): dice lo que sabe, «por recibir»', () => {
        const aprobada = pasosCircuito(CIRCUITO, '2026-10-22')[1];
        expect(aprobada.bajada).toBe('por recibir');
        expect(aprobada.bajada).not.toMatch(/salir/);
    });

    it('sin ninguna en la etapa no hay «hasta»', () => {
        const vacio: CircuitoPerfil = {
            ...CIRCUITO, pedida: { total: 0, dias: null }, aprobada: { total: 0, dias: 3 }, despachada: { total: 0, dias: 5 },
        };
        const pasos = pasosCircuito(vacio, '2026-01-05');
        expect(pasos[0].hasta).toBeNull();
        expect(pasos[1].hasta).toBeNull();
        expect(pasos[2].bajada).toBe('en enero');
    });

    it('el mes de «Recibida» sale de hoy del servidor', () => {
        expect(mesLargo('2026-10-22')).toBe('octubre');
        expect(mesLargo('2026-12-01')).toBe('diciembre');
        expect(mesLargo('')).toBe('');
        expect(pasosCircuito(CIRCUITO, '')[2].bajada).toBe('este mes');
    });

    it('«hasta N días» sin «hasta de hoy»', () => {
        expect(textoHasta(9)).toBe('hasta 9 días');
        expect(textoHasta(1)).toBe('hasta 1 día');
        expect(textoHasta(0)).toBe('de hoy');
    });

    it('Pedida marcada: ámbar con pendientes; gris «al día» sin ninguna', () => {
        expect(marcaPedida(6)).toEqual({ tono: 'ambar', bajada: 'estas son ↓', aria: 'por aprobar, son las de la lista' });
        expect(marcaPedida(1)).toEqual({ tono: 'ambar', bajada: 'esta es ↓', aria: 'por aprobar, es la de la lista' });
        expect(marcaPedida(0)).toEqual({ tono: 'neutro', bajada: 'al día', aria: 'al día' });
    });

    it('etiquetas para lectores de pantalla: la etapa completa y qué lista abre', () => {
        const [pedida, aprobada, recibida] = pasosCircuito(CIRCUITO, '2026-10-22');
        expect(etiquetaCircuito(true)).toBe('Circuito de la solicitud, todas las obras');
        expect(etiquetaCircuito(false)).toBe('Circuito de la solicitud, lo que puedes ver');
        expect(etiquetaPaso(pedida, marcaPedida(6))).toBe('Pedida: 6, por aprobar, son las de la lista. Abre «Pendientes» en Inventario');
        expect(etiquetaPaso({ ...pedida, total: 0 }, marcaPedida(0))).toBe('Pedida: 0, al día. Abre «Pendientes» en Inventario');
        expect(etiquetaPaso(aprobada)).toBe('Aprobada: 4, por recibir. Abre «Todas» en Inventario: algunas por recibir no están en «Aprobadas»');
        expect(etiquetaPaso(recibida)).toBe('Recibida: 5, en octubre. Abre «Recibidas» en Inventario, de todos los meses');
    });
});

describe('diferencias aparte (las resuelve él: la tarjeta de arriba las suma a lo por aprobar)', () => {
    it('la fila roja del lienzo con la cifra de la tarjeta (solicitudes, no ítems)', () => {
        expect(avisoDiferencias({ total: 4, items: 7, dias: 14, mas_antigua_id: 21 })).toEqual({
            total: 4,
            titulo: '4 diferencias sin aclarar',
            bajada: 'Lo que llegó no calza con lo enviado · la más antigua, hace 14 días',
            ruta: '/inventario?tab=transferencias&estado=discrepancias',
        });
        expect(RUTA_DIFERENCIAS).toBe('/inventario?tab=transferencias&estado=discrepancias');
    });

    it('con una sola no dice «la más antigua»; de hoy, sin «hace»', () => {
        expect(avisoDiferencias({ total: 1, items: 2, dias: 3 })).toMatchObject({
            titulo: '1 diferencia sin aclarar', bajada: 'Lo que llegó no calza con lo enviado · hace 3 días',
        });
        expect(avisoDiferencias({ total: 1, items: 1, dias: 0 })?.bajada).toBe('Lo que llegó no calza con lo enviado · es de hoy');
        expect(avisoDiferencias({ total: 2, items: 2, dias: 0 })?.bajada).toBe('Lo que llegó no calza con lo enviado · la más antigua es de hoy');
        expect(avisoDiferencias({ total: 2, items: 2, dias: null })?.bajada).toBe('Lo que llegó no calza con lo enviado');
    });

    it('sin diferencias no hay fila', () => {
        expect(avisoDiferencias({ total: 0, items: 0, dias: null, mas_antigua_id: null })).toBeNull();
    });
});

/**
 * La fila abre `&id=N`: sirve solo si Inventario lee `id` y lo pasa a TransferenciasPanel, que la abre por GET /:id.
 * Esa lectura llegó a develop con las fichas (1a232c02) y NO está en producción: si esta vista se promueve sin ella,
 * el panel abre la primera de la lista, que es la MÁS NUEVA (getAll ordena por fecha DESC). Este test falla si falta.
 */
describe('contrato con Inventario: el enlace de la fila abre ESA solicitud', () => {
    const fuente = (...partes: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', ...partes), 'utf8');

    it('Inventario lee `id` de la URL y lo pasa al panel', () => {
        const inventario = fuente('pages', 'Inventario.tsx');
        expect(inventario).toMatch(/searchParams\.get\('id'\)/);
        expect(inventario).toMatch(/initialSelectedId=\{trfNavIntent\.id/);
    });

    it('TransferenciasPanel abre la solicitud pedida por id al entrar', () => {
        expect(fuente('components', 'inventario', 'TransferenciasPanel.tsx')).toMatch(/fetchById\(initialSelectedId\)/);
    });
});
