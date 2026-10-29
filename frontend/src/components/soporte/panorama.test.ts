import { SECCIONES_MENU, menuVisible } from '../layout/menuLateral';
import { resumenFicha, type FichaSoporte } from './fichaUsuario';
import {
    TEXTO_TIPO_INICIO, armarPanorama, columnasPanorama, filaPanorama, inicioDe, textoPersonas, type UsuarioPanorama,
} from './panorama';

const persona = (id: number, nombre: string, rol_id: number, rol_nombre: string, efectivos: string[], extra: Partial<UsuarioPanorama> = {}): UsuarioPanorama => ({
    id, nombre, email: `${nombre.split(' ')[0].toLowerCase()}@lols.cl`, rol_id, rol_nombre,
    obra_id: null, obra_nombre: null, bodega_id: null, bodega_nombre: null, efectivos, ...extra,
});

const T = (k: string) => `inventario.transferencias.${k}`;
const ADMIN = ['inventario.ver', 'inventario.tab.resumen', 'inventario.tab.transferencias', T('ver_todas'), 'asistencia.ver',
    'trabajadores.ver', 'documentos.ver', 'vehiculos.ver', 'obras.ver', 'costos.gestionar'];
const OBRA = ['inventario.ver', 'inventario.tab.transferencias', T('solicitar'), T('recibir'), 'asistencia.ver', 'asistencia.guardar'];
const TODO = [...new Set([...ADMIN, ...OBRA, T('aprobar'), T('diferencias_ver'), 'ideas.revisar', 'usuarios.ver', 'inicio.gerencia'])];

const MARCOS = persona(1, 'Marcos Uribe', 1, 'Super Administrador', TODO);
const LEONARDO = persona(7, 'Leonardo López', 3, 'Administrador', [...ADMIN, T('aprobar')]);
const DAPHNE = persona(11, 'Daphne Lazcano', 3, 'Administrador', [...ADMIN, T('diferencias_ver'), 'usuarios.ver']);
const LUIS = persona(50, 'Luis Lazcano', 3, 'Administrador', [...ADMIN, 'inicio.gerencia']);
const PAULA = persona(10, 'Paula Martínez', 3, 'Administrador', ADMIN);
const TOMAS = persona(20, 'Tomás Vera', 4, 'Jefe de Obra', OBRA, { obra_id: 1, obra_nombre: 'Gorbea 3082' });
const HECTOR = persona(31, 'Héctor Gómez', 8, 'Bodeguero', ['inventario.ver', 'inventario.tab.transferencias', T('recibir')], { bodega_id: 2, bodega_nombre: 'Bodega Cerrillos' });
const SIN_NADA = persona(40, 'Ana Sin Permisos', 9, 'Visita', []);
const LISTA = [MARCOS, LEONARDO, DAPHNE, LUIS, PAULA, TOMAS, HECTOR, SIN_NADA];

/** La ficha de esa persona con los mismos efectivos (para comparar con lo que ya muestra la ficha). */
const fichaDe = (u: UsuarioPanorama): FichaSoporte => ({
    usuario: { ...u, activo: true },
    obra: null,
    efectivos: u.efectivos,
    permisos: [],
    sesion: { ultimo_ingreso: null, ultimo_cambio: null, ultimo_cambio_de: null },
});

describe('columnasPanorama: las secciones del menú lateral, en su orden, y «Comparte tu idea» al final', () => {
    test('todas, en el orden del menú', () => {
        const cols = columnasPanorama('Comparte tu idea');
        expect(cols.map(c => c.clave)).toEqual([...SECCIONES_MENU.map(s => s.clave), 'buzon_ideas']);
        expect(cols.map(c => c.clave)).toEqual([
            'inicio', 'asistencia', 'gestiones', 'inventario', 'vehiculos', 'obras_finalizadas', 'presupuestos', 'sitio_web', 'ayuda',
            'revisar_ideas', 'soporte', 'configuracion', 'buzon_ideas',
        ]);
        expect(cols.find(c => c.clave === 'obras_finalizadas')?.label).toBe('Obras Finalizadas');
        expect(cols[cols.length - 1].label).toBe('Comparte tu idea');
        expect(cols.every(c => c.descripcion.length > 0)).toBe(true);
    });

    test('SECCIONES_MENU = lo que ve alguien con todos los permisos siendo rol 1', () => {
        expect(SECCIONES_MENU.map(s => s.clave)).toEqual(menuVisible(() => true, { rol_id: 1 }).map(s => s.clave));
    });
});

describe('filaPanorama: las mismas reglas del menú (y de la ficha)', () => {
    test.each(LISTA.map(u => [u.nombre, u] as const))('%s: las marcas = menuVisible = el menú de su ficha', (_n, u) => {
        const f = filaPanorama(u);
        const marcadas = SECCIONES_MENU.map(s => s.clave).filter(c => f.ve[c]);
        const ef = new Set(u.efectivos);
        expect(marcadas).toEqual(menuVisible(p => ef.has(p), u).map(m => m.clave));
        const r = resumenFicha(fichaDe(u));
        expect(marcadas).toEqual(r.menus.map(m => m.clave));
        expect(f.ve.buzon_ideas).toBe(r.buzonIdeas);
    });

    test('Super Administrador: Soporte y Revisar ideas, sin «Comparte tu idea»; nadie más ve Soporte', () => {
        const f = filaPanorama(MARCOS);
        expect(f.ve.soporte).toBe(true);
        expect(f.ve.revisar_ideas).toBe(true);
        expect(f.ve.buzon_ideas).toBe(false);
        // Un Administrador con TODO el catálogo igual no ve Soporte (es el rol 1, no un permiso).
        expect(filaPanorama(persona(99, 'Admin Total', 3, 'Administrador', TODO)).ve.soporte).toBe(false);
    });

    test('sin ningún permiso: solo Inicio, Ayuda y «Comparte tu idea»', () => {
        const f = filaPanorama(SIN_NADA);
        const marcadas = columnasPanorama().map(c => c.clave).filter(c => f.ve[c]);
        expect(marcadas).toEqual(['inicio', 'ayuda', 'buzon_ideas']);
        expect(f.inicio.tipo).toBe('general');
    });

    test('jefe de obra: Asistencia e Inventario; ni Configuración ni Presupuestos', () => {
        const f = filaPanorama(TOMAS);
        expect(f.ve).toMatchObject({ asistencia: true, inventario: true, configuracion: false, presupuestos: false, gestiones: false });
    });
});

describe('inicioDe: qué Inicio le toca', () => {
    test.each([
        ['Marcos (rol 1, aunque tenga inicio.gerencia)', MARCOS, 'superadmin'],
        ['Leonardo (aprueba + todas las obras)', LEONARDO, 'leonardo'],
        ['Daphne (diferencias + todas las obras)', DAPHNE, 'jefatura'],
        ['don Luis (inicio.gerencia)', LUIS, 'gerencia'],
        ['Paula (Administradora sin aprobar)', PAULA, 'general'],
        ['Tomás (jefe de obra)', TOMAS, 'obra'],
        ['Héctor (bodeguero: recibe para su bodega)', HECTOR, 'general'],
        ['sin permisos', SIN_NADA, 'general'],
    ] as const)('%s → %s', (_n, u, tipo) => {
        const ef = new Set(u.efectivos);
        const i = inicioDe(p => ef.has(p), u);
        expect(i.tipo).toBe(tipo);
        expect(i.texto).toBe(TEXTO_TIPO_INICIO[tipo]);
    });

    test('el detalle usa los textos de la ficha: gerencia arriba + la tarjeta de Inventario', () => {
        const ef = new Set(LUIS.efectivos);
        const i = inicioDe(p => ef.has(p), LUIS);
        expect(i.detalle).toHaveLength(2);
        expect(i.detalle[0]).toMatch(/^Inicio de gerencia/);
        expect(i.detalle[1]).toBe(`Tarjeta de Inventario: ${resumenFicha(fichaDe(LUIS)).textoInicioInventario}`);
        const sin = inicioDe(() => false, SIN_NADA);
        expect(sin.detalle).toEqual([`Tarjeta de Inventario: ${resumenFicha(fichaDe(SIN_NADA)).textoInicioInventario}`]);
    });
});

describe('armarPanorama: grupos por rol, filtro y totales', () => {
    test('grupos por nombre de rol y, dentro, por nombre', () => {
        const p = armarPanorama([...LISTA].reverse(), '', null);
        expect(p.grupos.map(g => g.rol_nombre)).toEqual(['Administrador', 'Bodeguero', 'Jefe de Obra', 'Super Administrador', 'Visita']);
        expect(p.grupos[0].filas.map(f => f.usuario.nombre)).toEqual(['Daphne Lazcano', 'Leonardo López', 'Luis Lazcano', 'Paula Martínez']);
        expect(p.personas).toBe(LISTA.length);
    });

    test('totales por columna: cuántas de las mostradas la ven', () => {
        const p = armarPanorama(LISTA, '', null);
        expect(p.totales.inicio).toBe(LISTA.length);
        expect(p.totales.ayuda).toBe(LISTA.length);
        expect(p.totales.soporte).toBe(1);
        expect(p.totales.configuracion).toBe(2);             // Marcos y Daphne (usuarios.ver)
        expect(p.totales.presupuestos).toBe(5);              // los 4 Administradores + Marcos
        expect(p.totales.revisar_ideas).toBe(1);
        expect(p.totales.buzon_ideas).toBe(LISTA.length - 1); // todos menos quien revisa
    });

    test('el mismo buscador y filtro por rol de la lista (sin tildes)', () => {
        let p = armarPanorama(LISTA, 'lazcano', null);
        expect(p.grupos).toHaveLength(1);
        expect(p.grupos[0].filas.map(f => f.usuario.id)).toEqual([11, 50]);
        expect(p.totales.configuracion).toBe(1);
        p = armarPanorama(LISTA, 'tomas gorbea', null);
        expect(p.grupos.flatMap(g => g.filas.map(f => f.usuario.id))).toEqual([20]);
        p = armarPanorama(LISTA, '', 3);
        expect(p.grupos.map(g => g.rol_id)).toEqual([3]);
        expect(p.personas).toBe(4);
    });

    test('sin nadie: sin grupos y totales en cero', () => {
        const p = armarPanorama([], '', null);
        expect(p.grupos).toEqual([]);
        expect(p.personas).toBe(0);
        expect(Object.values(p.totales).every(n => n === 0)).toBe(true);
        expect(Object.keys(p.totales)).toHaveLength(columnasPanorama().length);
    });

    test('textoPersonas', () => {
        expect(textoPersonas(1)).toBe('1 persona');
        expect(textoPersonas(4)).toBe('4 personas');
    });
});
