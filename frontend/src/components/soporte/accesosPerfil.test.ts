import {
    MENU_DE_MODULO, MODULO_DE_PREFIJO, TEXTO_INICIO_GERENCIA, TEXTO_SIN_INVENTARIO, accesosPerfil, fichaParaVerComo,
    limpiarNombre, menuDePermiso, nombreSinFicha, type AccesosPerfil, type EntradaAccesos, type JerarquiaPermiso,
    type TarjetaAcceso,
} from './accesosPerfil';
import { TEXTO_VISTA_INVENTARIO, type FichaSoporte } from './fichaUsuario';
import type { FichaVerComo, PermisoVerComo } from '../../context/verComoSesion';

/** El catálogo REAL de permisos (backend): los nombres que trae la ficha y los módulos que hay que ubicar en el menú. */
type FilaCatalogo = [clave: string, modulo: string, nombre: string, descripcion: string, orden: number];
// eslint-disable-next-line @typescript-eslint/no-require-imports -- el catálogo del backend es CommonJS (fuente de verdad)
const CATALOGO = require('../../../../backend/src/config/permisos.config.js') as FilaCatalogo[] & { PERMISOS_FINANCIEROS: string[] };
const META = new Map(CATALOGO.map(([clave, modulo, nombre, descripcion, orden]) => [clave, { clave, modulo, nombre, descripcion, orden }]));

const T = (k: string) => `inventario.transferencias.${k}`;

/** La ficha guardada al entrar (como la arma Soporte), con los nombres del catálogo. */
function fichaDe(usuarioId: number, efectivos: string[], { propios = [], quitados = [] }: { propios?: string[]; quitados?: string[] } = {}): FichaVerComo {
    const p = (clave: string, origen: PermisoVerComo['origen']): PermisoVerComo => {
        const m = META.get(clave);
        if (!m) throw new Error(`${clave} no está en el catálogo`);
        return { ...m, origen };
    };
    return {
        usuarioId,
        nombre: 'Persona de prueba',
        rol: 'Rol de prueba',
        permisos: [...efectivos.map(k => p(k, propios.includes(k) ? 'propio' : 'rol')), ...quitados.map(k => p(k, 'quitado'))],
    };
}

/** Un PERMISO_HIERARCHY mínimo: los $ de Inventario (los demás $ llevan «$» en el nombre del catálogo). */
const jerarquia = (clave: string): JerarquiaPermiso | undefined =>
    CATALOGO.PERMISOS_FINANCIEROS.includes(clave) ? { subseccion: 'Datos Sensibles', sensible: 'financiero' } : undefined;

const tarjeta = (r: AccesosPerfil, clave: TarjetaAcceso['clave']): TarjetaAcceso => {
    const t = r.tarjetas.find(x => x.clave === clave);
    if (!t) throw new Error(`no hay tarjeta ${clave}`);
    return t;
};
const textos = (t: TarjetaAcceso) => t.permisos.map(p => p.texto);
const fila = (t: TarjetaAcceso, rotulo: string) => t.filas.find(f => f.rotulo === rotulo)?.items.map(i => i.texto);

// «En Terreno» / jefe de obra (RUNBOOK §16.5: solicitar + recibir), con asistencia y fichas de ingreso.
const TERRENO = [
    'asistencia.ver', 'trabajadores.solicitud.crear',
    'inventario.ver', 'inventario.tab.transferencias', 'inventario.tab.por_ubicacion',
    T('solicitar'), T('solicitud_materiales'), T('recibir'), T('devolucion'), T('intra_obra'),
];
const terreno = (extra: Partial<EntradaAccesos> = {}): EntradaAccesos => ({
    permisos: TERRENO,
    usuario: { nombre: 'Cristian Mancilla', rol: 'En Terreno', rol_id: 6, bodega_id: null },
    ficha: fichaDe(20, TERRENO, { quitados: ['asistencia.exportar_excel'] }),
    jerarquia,
    ...extra,
});

// Rol Administrador (mig 126, sin aprobar desde la 131).
const ADMINISTRADOR = [
    'asistencia.ver', 'asistencia.exportar_excel', 'asistencia.horas_extra.ver',
    'trabajadores.ver', 'trabajadores.financiero.ver', 'documentos.ver', 'documentos.descargar', 'reportes.ver', 'reportes.exportar',
    'empresas.ver', 'obras.ver', 'cargos.ver', 'cargos.sueldo.ver', 'conductores.ver',
    'inventario.ver', 'inventario.tab.resumen_ejecutivo', 'inventario.tab.resumen', 'inventario.tab.por_ubicacion',
    'inventario.tab.transferencias', 'inventario.tab.maestro', 'inventario.tab.bombas', 'inventario.movimientos.ver',
    T('ver_todas'), T('orden_gerencia'), 'inventario.costos.ver', 'inventario.facturas.ver', 'inventario.resumen.ver_valores',
    'vehiculos.ver', 'costos.gestionar',
];
const PROPIOS_LEONARDO = [T('aprobar'), T('cancelar'), 'vehiculos.crear', 'vehiculos.editar'];
const LEONARDO = [...ADMINISTRADOR, ...PROPIOS_LEONARDO];
const leonardo = (): EntradaAccesos => ({
    permisos: LEONARDO,
    usuario: { nombre: 'Leonardo López', rol: 'Administrador', rol_id: 5, bodega_id: null },
    ficha: fichaDe(10, LEONARDO, { propios: PROPIOS_LEONARDO }),
    jerarquia,
});

describe('accesosPerfil: su menú y lo que puede hacer en cada parte', () => {
    test('En Terreno: las mismas secciones de su menú, en orden, y «Comparte tu idea» al final', () => {
        const r = accesosPerfil(terreno());
        expect(r.tarjetas.map(t => t.clave)).toEqual(['inicio', 'asistencia', 'gestiones', 'inventario', 'ayuda', 'buzon_ideas']);
        expect(r.tarjetas.map(t => t.titulo)).toEqual(['Inicio', 'Asistencia', 'Gestiones', 'Inventario', 'Ayuda', 'Comparte tu idea']);
        expect(tarjeta(r, 'inventario').ruta).toBe('/inventario');
        expect(tarjeta(r, 'gestiones').ruta).toBe('/consultas?tab=inicio');
        expect(tarjeta(r, 'inicio').ruta).toBeNull();
        expect(tarjeta(r, 'buzon_ideas').ruta).toBeNull();
        expect(r).toMatchObject({ nombre: 'Persona de prueba', rol: 'Rol de prueba', conFicha: true, cuenta: { efectivos: 10, propios: 0, quitados: 1 } });
    });

    test('En Terreno: Inventario con sus pestañas y sus acciones (las pestañas no se repiten en la lista)', () => {
        const inv = tarjeta(accesosPerfil(terreno()), 'inventario');
        expect(fila(inv, 'Pestañas')).toEqual(['Por Obra/Bodega', 'Solicitudes']);
        expect(textos(inv)).toEqual([
            'Ver Inventario', 'Solicitar Transferencia', 'Solicitud de Materiales', 'Recibir Transferencia',
            'Devolución (obra→bodega)', 'Traslado entre obras',
        ]);
        expect(inv.total).toBe(8);
    });

    test('En Terreno: Inicio, Gestiones y Asistencia (con el permiso quitado, marcado)', () => {
        const r = accesosPerfil(terreno());
        const inicio = tarjeta(r, 'inicio');
        expect(fila(inicio, 'Tarjeta de Inventario')).toEqual([TEXTO_VISTA_INVENTARIO.obra]);
        expect(fila(inicio, 'Arriba')).toBeUndefined();
        const gestiones = tarjeta(r, 'gestiones');
        expect(fila(gestiones, 'Secciones')).toEqual(['Solicitudes de ingreso']);
        expect(textos(gestiones)).toEqual(['Solicitar Ingreso de Trabajador']);
        const asistencia = tarjeta(r, 'asistencia');
        expect(asistencia.permisos.map(p => [p.texto, p.origen])).toEqual([['Ver Asistencia', 'rol'], ['Exportar Excel', 'quitado']]);
        expect(asistencia.total).toBe(1);
        expect(r.tarjetas.some(t => t.clave === 'otros')).toBe(false);
    });

    test('Leonardo: sus propios marcados, los $ marcados y lo de Configuración (que no ve) en «Otros permisos»', () => {
        const r = accesosPerfil(leonardo());
        expect(r.tarjetas.map(t => t.clave)).toEqual([
            'inicio', 'asistencia', 'gestiones', 'inventario', 'vehiculos', 'obras_finalizadas', 'presupuestos', 'ayuda', 'buzon_ideas', 'otros',
        ]);
        expect(fila(tarjeta(r, 'inicio'), 'Tarjeta de Inventario')).toEqual([TEXTO_VISTA_INVENTARIO.leonardo]);

        const inv = tarjeta(r, 'inventario');
        expect(fila(inv, 'Pestañas')).toEqual(['Resumen Ejecutivo', 'Resumen', 'Por Obra/Bodega', 'Solicitudes', 'Maestro', 'Hormigón', 'Facturas', 'Movimientos']);
        expect(inv.filas[0].items.find(i => i.texto === 'Facturas')).toMatchObject({ financiero: true, origen: 'rol' });
        const aprobar = inv.permisos.find(p => p.clave === T('aprobar'));
        expect(aprobar).toMatchObject({ texto: 'Aprobar Transferencia', origen: 'propio', financiero: false });
        expect(inv.permisos.find(p => p.clave === 'inventario.costos.ver')).toMatchObject({ texto: 'Ver Costos de Inventario', financiero: true });
        expect(inv.permisos.some(p => p.clave.startsWith('inventario.tab.'))).toBe(false);

        // «$ Ver Horas Extra»: el $ sale del nombre y queda como marca.
        expect(tarjeta(r, 'asistencia').permisos.find(p => p.clave === 'asistencia.horas_extra.ver')).toMatchObject({ texto: 'Ver Horas Extra', financiero: true });
        // La lista de conductores llena el formulario de Vehículos.
        expect(textos(tarjeta(r, 'vehiculos'))).toEqual(['Ver Vehículos', 'Crear Vehículo', 'Editar Vehículo', 'Ver Conductores']);
        expect(tarjeta(r, 'presupuestos').permisos).toEqual([expect.objectContaining({ clave: 'costos.gestionar', texto: 'Costos de obra', financiero: true })]);
        expect(tarjeta(r, 'obras_finalizadas').permisos.map(p => p.clave)).toEqual(['obras.ver']);
        // Gestiones: trabajadores primero, luego documentos y reportes; las listas de empresas y cargos (filtros y fichas).
        expect(tarjeta(r, 'gestiones').permisos.map(p => p.clave)).toEqual([
            'trabajadores.ver', 'trabajadores.financiero.ver', 'documentos.ver', 'documentos.descargar', 'reportes.ver', 'reportes.exportar',
            'empresas.ver', 'cargos.ver',
        ]);
        // Los sueldos por cargo solo se ven en Configuración, que no le aparece.
        expect(tarjeta(r, 'otros').permisos.map(p => [p.modulo, p.clave, p.texto])).toEqual([['Cargos', 'cargos.sueldo.ver', 'Ver Parámetros de Sueldo']]);
        expect(r.cuenta).toEqual({ efectivos: LEONARDO.length, propios: 4, quitados: 0 });
    });

    test('ningún permiso se pierde ni se cuenta dos veces', () => {
        for (const e of [terreno(), leonardo()]) {
            const r = accesosPerfil(e);
            expect(r.tarjetas.reduce((n, t) => n + t.total, 0)).toBe(e.permisos.length);
        }
        // Con TODO el catálogo (sin ser rol 1), igual.
        const todo = CATALOGO.map(([clave]) => clave);
        const r = accesosPerfil({ permisos: todo, usuario: { rol_id: 5 }, jerarquia });
        expect(r.tarjetas.reduce((n, t) => n + t.total, 0)).toBe(todo.length);
        expect(r.tarjetas.some(t => t.clave === 'otros')).toBe(false);
        // revisar_ideas: quien revisa no ve «Comparte tu idea».
        expect(r.tarjetas.map(t => t.clave)).toEqual([
            'inicio', 'asistencia', 'gestiones', 'inventario', 'vehiculos', 'obras_finalizadas', 'presupuestos', 'ayuda', 'revisar_ideas', 'configuracion',
        ]);
    });

    test('Inicio de gerencia: va en la fila «Arriba» con su origen, no en la lista', () => {
        const permisos = [...ADMINISTRADOR, 'usuarios.ver', 'obras.crear', 'inicio.gerencia'];
        const r = accesosPerfil({
            permisos,
            usuario: { nombre: 'Luis Lazcano', rol: 'Administrador', rol_id: 5 },
            ficha: fichaDe(50, permisos, { propios: ['usuarios.ver', 'obras.crear', 'inicio.gerencia'] }),
            jerarquia,
        });
        const inicio = tarjeta(r, 'inicio');
        expect(inicio.filas[0]).toMatchObject({ rotulo: 'Arriba', items: [{ texto: TEXTO_INICIO_GERENCIA, origen: 'propio' }] });
        expect(inicio.permisos).toEqual([]);
        expect(inicio.total).toBe(1);
        // Con «Ver Usuarios» le aparece Configuración: ahí van empresas, obras y cargos.
        const conf = tarjeta(r, 'configuracion');
        expect(conf.permisos.map(p => p.clave)).toEqual([
            'empresas.ver', 'obras.crear', 'cargos.ver', 'cargos.sueldo.ver', 'usuarios.ver', 'conductores.ver',
        ]);
        expect(conf.permisos.find(p => p.clave === 'usuarios.ver')?.origen).toBe('propio');
        expect(r.tarjetas.some(t => t.clave === 'otros')).toBe(false);
    });

    test('una pestaña quitada se muestra tachada en su lugar (y no cuenta)', () => {
        const r = accesosPerfil(terreno({ ficha: fichaDe(20, TERRENO, { quitados: ['inventario.movimientos.ver'] }) }));
        const inv = tarjeta(r, 'inventario');
        expect(inv.filas[0].items.map(i => [i.texto, i.origen])).toEqual([['Por Obra/Bodega', 'rol'], ['Solicitudes', 'rol'], ['Movimientos', 'quitado']]);
        expect(inv.total).toBe(8);
    });

    test('sin «Ver inventario»: el Inicio lo dice y los permisos de Inventario van a «Otros permisos»', () => {
        const permisos = ['asistencia.ver', T('recibir')];
        const r = accesosPerfil({ permisos, usuario: { rol_id: 9 }, ficha: fichaDe(3, permisos), jerarquia });
        expect(fila(tarjeta(r, 'inicio'), 'Tarjeta de Inventario')).toEqual([TEXTO_SIN_INVENTARIO]);
        expect(tarjeta(r, 'otros').permisos.map(p => [p.modulo, p.texto])).toEqual([['Inventario', 'Recibir Transferencia']]);
    });

    test('sin ficha: nombres con la subsección, sin origen y sin quitados; no se rompe', () => {
        const sub = (clave: string): JerarquiaPermiso | undefined => {
            if (clave === T('recibir') || clave === T('solicitar')) return { subseccion: 'Transferencias' };
            if (clave === 'asistencia.ver') return { subseccion: 'Lectura Base' };
            return undefined;
        };
        const r = accesosPerfil(terreno({ ficha: null, jerarquia: sub }));
        expect(r.conFicha).toBe(false);
        expect(r).toMatchObject({ nombre: 'Cristian Mancilla', rol: 'En Terreno', cuenta: { efectivos: 10, propios: 0, quitados: 0 } });
        const inv = tarjeta(r, 'inventario');
        expect(textos(inv)).toEqual(['Ver', 'Transferencias: solicitar', 'Transferencias solicitud materiales', 'Transferencias: recibir', 'Transferencias devolucion', 'Transferencias intra obra']);
        expect(inv.permisos.every(p => p.origen === null)).toBe(true);
        expect(textos(tarjeta(r, 'asistencia'))).toEqual(['Lectura Base: ver']);
        expect(r.tarjetas.reduce((n, t) => n + t.total, 0)).toBe(TERRENO.length);
    });

    test('un permiso que la ficha daba por quitado pero el token trae: cuenta, sin origen', () => {
        const ficha = fichaDe(20, TERRENO.filter(k => k !== 'asistencia.ver'), { quitados: ['asistencia.ver'] });
        const asistencia = tarjeta(accesosPerfil(terreno({ ficha })), 'asistencia');
        expect(asistencia.permisos).toEqual([expect.objectContaining({ clave: 'asistencia.ver', origen: null })]);
        expect(asistencia.total).toBe(1);
    });
});

describe('dónde se usa cada permiso del catálogo', () => {
    test('todo módulo del catálogo tiene una sección del menú', () => {
        const modulos = [...new Set(CATALOGO.map(([, modulo]) => modulo))];
        expect(modulos.length).toBeGreaterThan(10);
        expect(modulos.filter(m => !MENU_DE_MODULO[m]?.length)).toEqual([]);
    });

    test('sin ficha (solo la clave) cada permiso va al mismo lugar que con su módulo del catálogo', () => {
        expect(CATALOGO.filter(([clave, modulo]) => JSON.stringify(menuDePermiso(clave)) !== JSON.stringify(menuDePermiso(clave, modulo))).map(f => f[0])).toEqual([]);
        expect(Object.keys(MODULO_DE_PREFIJO)).toEqual(expect.arrayContaining([...new Set(CATALOGO.map(([clave]) => clave.split('.')[0]))]));
    });

    test('excepciones: «Ver Obras» abre Obras Finalizadas; revisar ideas y presupuestos son su propia sección', () => {
        expect(menuDePermiso('obras.ver', 'Obras')).toEqual(['obras_finalizadas', 'configuracion']);
        expect(menuDePermiso('obras.crear', 'Obras')).toEqual(['configuracion', 'obras_finalizadas']);
        expect(menuDePermiso('ideas.revisar', 'Sistema')).toEqual(['revisar_ideas']);
        expect(menuDePermiso('costos.gestionar', 'Sistema')).toEqual(['presupuestos']);
        expect(menuDePermiso('cargos.ver', 'Cargos')).toEqual(['configuracion', 'gestiones']);
        expect(menuDePermiso('cargos.crear', 'Cargos')).toEqual(['configuracion']);
        expect(menuDePermiso('conductores.ver', 'Conductores')).toEqual(['configuracion', 'vehiculos']);
        expect(menuDePermiso('inventario.costos.ver', 'Financiero')).toEqual(['inventario']);
        expect(menuDePermiso('algo.nuevo')).toEqual([]);
    });
});

describe('textos', () => {
    test('limpiarNombre quita las marcas del catálogo', () => {
        expect(limpiarNombre('$ Ver Horas Extra')).toBe('Ver Horas Extra');
        expect(limpiarNombre(META.get(T('cancelar_en_transito'))!.nombre)).toBe('Cancelar en Tránsito');
        expect(limpiarNombre('Ver Asistencia')).toBe('Ver Asistencia');
        expect(limpiarNombre('$')).toBe('$');
    });

    test('nombreSinFicha', () => {
        expect(nombreSinFicha(T('aprobar'), { subseccion: 'Transferencias' })).toBe('Transferencias: aprobar');
        expect(nombreSinFicha('asistencia.guardar', { subseccion: 'Lectura Base' })).toBe('Lectura Base: guardar');
        expect(nombreSinFicha('vehiculos.crear', { subseccion: 'Vehículos' })).toBe('Vehículos: crear');
        expect(nombreSinFicha('asistencia.horas_extra.ver')).toBe('Horas extra ver');
        expect(nombreSinFicha('raro')).toBe('Raro');
    });
});

describe('fichaParaVerComo', () => {
    test('guarda quién es y sus permisos con nombre, módulo y origen', () => {
        const f: FichaSoporte = {
            usuario: { id: 20, nombre: 'Tomás Vera', email: 't@lols.cl', rol_id: 7, rol_nombre: 'Jefe de Obra', obra_id: 1, obra_nombre: 'Domeyko', bodega_id: null, bodega_nombre: null, activo: true },
            obra: null,
            efectivos: ['asistencia.ver'],
            permisos: [{ clave: 'asistencia.ver', modulo: 'Asistencia', nombre: 'Ver Asistencia', descripcion: 'Ver el registro', orden: 1, origen: 'rol' }],
            sesion: { ultimo_ingreso: null, ultimo_cambio: null, ultimo_cambio_de: null },
        };
        expect(fichaParaVerComo(f)).toEqual({
            usuarioId: 20, nombre: 'Tomás Vera', rol: 'Jefe de Obra',
            permisos: [{ clave: 'asistencia.ver', modulo: 'Asistencia', nombre: 'Ver Asistencia', descripcion: 'Ver el registro', orden: 1, origen: 'rol' }],
        });
    });
});
