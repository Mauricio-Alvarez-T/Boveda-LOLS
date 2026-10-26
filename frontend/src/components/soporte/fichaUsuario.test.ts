import {
    avisosFicha, cambioDespuesDeIngresar, filtrarUsuarios, gruposPermisos, lugarUsuario, resumenFicha, rolesDeLista,
    type FichaSoporte, type PermisoFicha, type UsuarioSoporte,
} from './fichaUsuario';

const usuario = (u: Partial<UsuarioSoporte> = {}): FichaSoporte['usuario'] => ({
    id: 7, nombre: 'Leonardo López', email: 'leonardo@lols.cl', rol_id: 3, rol_nombre: 'Administrador',
    obra_id: null, obra_nombre: null, bodega_id: null, bodega_nombre: null, activo: true, ...u,
});

const permiso = (clave: string, origen: PermisoFicha['origen'] = 'rol', modulo = clave.split('.')[0]): PermisoFicha =>
    ({ clave, modulo, nombre: clave, descripcion: null, orden: 1, origen });

/** Una ficha con estos permisos efectivos (todos «del rol» salvo los que se digan). */
function ficha(efectivos: string[], extra: Partial<FichaSoporte> = {}, propios: string[] = [], quitados: string[] = []): FichaSoporte {
    return {
        usuario: usuario(),
        obra: null,
        efectivos,
        permisos: [
            ...efectivos.map(k => permiso(k, propios.includes(k) ? 'propio' : 'rol')),
            ...quitados.map(k => permiso(k, 'quitado')),
        ],
        sesion: { ultimo_ingreso: '2026-10-22T12:00:00.000Z', ultimo_cambio: null, ultimo_cambio_de: null },
        ...extra,
    };
}

const textos = (f: FichaSoporte) => avisosFicha(f).map(a => a.texto);

const ADMIN = ['inventario.ver', 'inventario.tab.resumen_ejecutivo', 'inventario.tab.resumen', 'inventario.tab.transferencias',
    'inventario.transferencias.ver_todas', 'asistencia.ver', 'trabajadores.ver', 'documentos.ver', 'vehiculos.ver', 'obras.ver', 'costos.gestionar'];
const OBRA = ['inventario.ver', 'inventario.tab.transferencias', 'inventario.transferencias.solicitar', 'inventario.transferencias.recibir', 'asistencia.ver', 'asistencia.guardar'];

describe('resumenFicha: qué ve cada perfil (con las funciones de la app)', () => {
    test('Leonardo (Administrador + aprobar propio) → vista de quien aprueba', () => {
        const r = resumenFicha(ficha([...ADMIN, 'inventario.transferencias.aprobar'], {}, ['inventario.transferencias.aprobar']));
        expect(r.vistaInventario).toBe('leonardo');
        expect(r.textoInicioInventario).toMatch(/^Quien aprueba/);
        expect(r.inicioGerencia).toBe(false);
        expect(r.menus.map(m => m.label)).toEqual(['Inicio', 'Asistencia', 'Gestiones', 'Inventario', 'Vehículos', 'Obras Finalizadas', 'Presupuestos', 'Ayuda']);
        expect(r.pestanasInventario?.map(p => p.label)).toEqual(['Resumen Ejecutivo', 'Resumen', 'Solicitudes']);
        expect(r.seccionesGestiones).toEqual([{ clave: 'trabajadores', label: 'Trabajadores' }]);
        expect(r.cuenta).toEqual({ efectivos: 12, propios: 1, quitados: 0 });
        expect(r.buzonIdeas).toBe(true);
        expect(r.esSuperAdmin).toBe(false);
    });

    test('Daphne (ver diferencias) → jefatura; Luis (inicio.gerencia) → Inicio de gerencia y la general', () => {
        expect(resumenFicha(ficha([...ADMIN, 'inventario.transferencias.diferencias_ver'])).vistaInventario).toBe('jefatura');
        const luis = resumenFicha(ficha([...ADMIN, 'inicio.gerencia']));
        expect(luis.inicioGerencia).toBe(true);
        expect(luis.vistaInventario).toBe('otro');
    });

    test('jefe de obra → vista de obra; bodeguero (con bodega) → la general', () => {
        expect(resumenFicha(ficha(OBRA, { usuario: usuario({ obra_id: 4, obra_nombre: 'Gorbea 3082' }) })).vistaInventario).toBe('obra');
        const bodeguero = resumenFicha(ficha(['inventario.ver', 'inventario.tab.transferencias', 'inventario.transferencias.recibir'],
            { usuario: usuario({ bodega_id: 2, bodega_nombre: 'Bodega Cerrillos' }) }));
        expect(bodeguero.vistaInventario).toBe('otro');
        expect(bodeguero.avisos.map(a => a.texto)).toContain('Tiene bodega asignada (Bodega Cerrillos): recibe solo lo que llega a esa bodega.');
    });

    test('sin «Ver inventario»: no entra a Inventario ni tiene su tarjeta', () => {
        const r = resumenFicha(ficha(['asistencia.ver']));
        expect(r.pestanasInventario).toBeNull();
        expect(r.textoInicioInventario).toMatch(/Sin tarjeta de Inventario/);
        expect(r.seccionesGestiones).toBeNull();
    });

    test('Gestiones con dos secciones (portada) y Super Administrador', () => {
        const r = resumenFicha(ficha(['trabajadores.ver', 'trabajadores.solicitud.aprobar']));
        expect(r.seccionesGestiones?.map(s => s.clave)).toEqual(['trabajadores', 'solicitudes']);
        const sa = resumenFicha(ficha(['usuarios.ver'], { usuario: usuario({ rol_id: 1, rol_nombre: 'Super Administrador' }) }));
        expect(sa.esSuperAdmin).toBe(true);
        expect(sa.vistaInventario).toBe('superadmin');
        expect(sa.menus.map(m => m.clave)).toContain('soporte');
    });
});

describe('avisosFicha', () => {
    test('pide o recibe sin la pestaña «Solicitudes»', () => {
        expect(textos(ficha(['inventario.ver', 'inventario.tab.resumen', 'inventario.transferencias.solicitar']))).toContain(
            'Puede pedir materiales, pero no tiene la pestaña «Solicitudes» de Inventario: no tiene dónde hacerlo.');
        expect(textos(ficha(['inventario.ver', 'inventario.tab.resumen', 'inventario.transferencias.solicitud_materiales', 'inventario.transferencias.recibir']))
            .some(t => t.startsWith('Puede pedir y recibir materiales'))).toBe(true);
        expect(textos(ficha(OBRA)).some(t => t.includes('pestaña «Solicitudes»'))).toBe(false);
    });

    test('aprobar sin ver todas las obras', () => {
        expect(textos(ficha([...OBRA, 'inventario.transferencias.aprobar'])).some(t => t.startsWith('Tiene «Aprobar» sin «Ver todas las obras»'))).toBe(true);
        expect(textos(ficha([...ADMIN, 'inventario.transferencias.aprobar'])).some(t => t.startsWith('Tiene «Aprobar»'))).toBe(false);
    });

    test('ningún permiso de Inventario / sin «Ver inventario» / sin pestañas', () => {
        expect(textos(ficha(['asistencia.ver']))).toContain('No tiene ningún permiso de Inventario.');
        expect(textos(ficha(['inventario.tab.resumen']))).toContain('Tiene permisos de Inventario pero no «Ver inventario»: el menú Inventario no le aparece.');
        expect(textos(ficha(['inventario.ver']))).toContain('Entra a Inventario pero no tiene ninguna pestaña: lo ve vacío.');
    });

    test('sin ningún permiso: un solo aviso de permisos', () => {
        const t = textos(ficha([]));
        expect(t).toContain('No tiene ningún permiso: solo ve el Inicio y Ayuda.');
        expect(t).not.toContain('No tiene ningún permiso de Inventario.');
    });

    test('módulos sin su puerta de entrada', () => {
        expect(textos(ficha(['asistencia.guardar']))).toContain('Tiene permisos de Asistencia pero no «Ver asistencia»: el menú Asistencia no le aparece.');
        expect(textos(ficha(['documentos.ver']))).toContain('Tiene permisos de Documentos pero no ve Gestiones (le falta «Ver trabajadores»).');
        expect(textos(ficha(['documentos.ver', 'trabajadores.ver'])).some(t => t.includes('no ve Gestiones'))).toBe(false);
    });

    test('obra finalizada, inactiva, quitados y Super Admin', () => {
        expect(textos(ficha(OBRA, { obra: { id: 4, nombre: 'Gorbea 3082', activa: true, finalizada: true } }))).toContain('Su obra asignada (Gorbea 3082) está finalizada.');
        expect(textos(ficha(OBRA, { usuario: usuario({ activo: false } as Partial<UsuarioSoporte>) }))[0]).toBe('Está inactiva: no puede iniciar sesión.');
        expect(textos(ficha(OBRA, {}, [], ['asistencia.exportar_excel'])).some(t => t.startsWith('Su rol trae 1 permiso que a esta persona se le quitó'))).toBe(true);
        expect(textos(ficha(['usuarios.ver'], { usuario: usuario({ rol_id: 1 }) }))[0]).toMatch(/^Es Super Administrador/);
    });

    test('permisos cambiados después del último ingreso → debe volver a iniciar sesión', () => {
        const f = ficha(OBRA, { sesion: { ultimo_ingreso: '2026-10-20T12:00:00.000Z', ultimo_cambio: '2026-10-22T09:30:00.000Z', ultimo_cambio_de: 'propios' } });
        const t = textos(f).find(x => x.startsWith('Cambiaron'));
        expect(t).toMatch(/^Cambiaron sus permisos propios el .+, después de su último ingreso \(.+\): debe volver a iniciar sesión/);
        expect(cambioDespuesDeIngresar(f.sesion)).toBe(true);
        expect(cambioDespuesDeIngresar({ ultimo_ingreso: '2026-10-23T08:00:00.000Z', ultimo_cambio: '2026-10-22T09:30:00.000Z', ultimo_cambio_de: 'rol' })).toBe(false);
        expect(cambioDespuesDeIngresar({ ultimo_ingreso: null, ultimo_cambio: '2026-10-22T09:30:00.000Z', ultimo_cambio_de: 'datos' })).toBe(true);
        expect(cambioDespuesDeIngresar({ ultimo_ingreso: null, ultimo_cambio: null, ultimo_cambio_de: null })).toBe(false);
        expect(cambioDespuesDeIngresar(null)).toBe(false);
    });
});

describe('grupos, lista y buscador', () => {
    test('agrupa por módulo en orden y cuenta propios y quitados', () => {
        const g = gruposPermisos([
            permiso('inventario.ver', 'rol', 'Inventario'),
            permiso('inventario.costos.ver', 'propio', 'Inventario'),
            permiso('asistencia.ver', 'quitado', 'Asistencia'),
        ]);
        expect(g.map(x => [x.modulo, x.permisos.length, x.propios, x.quitados])).toEqual([['Inventario', 2, 1, 0], ['Asistencia', 1, 0, 1]]);
    });

    const LISTA: UsuarioSoporte[] = [
        { id: 7, nombre: 'Leonardo López', email: 'leonardo@lols.cl', rol_id: 3, rol_nombre: 'Administrador', obra_id: null, obra_nombre: null, bodega_id: null, bodega_nombre: null },
        { id: 12, nombre: 'Tomás Vera', email: 'tomas@lols.cl', rol_id: 5, rol_nombre: 'Jefe de Obra', obra_id: 4, obra_nombre: 'Domeyko', bodega_id: null, bodega_nombre: null },
        { id: 15, nombre: 'Jorge Muñoz', email: 'bodega@lols.cl', rol_id: 6, rol_nombre: 'Bodeguero', obra_id: null, obra_nombre: null, bodega_id: 2, bodega_nombre: 'Bodega Cerrillos' },
        { id: 9, nombre: 'Daphne Lazcano', email: 'daphne@lols.cl', rol_id: 3, rol_nombre: 'Administrador', obra_id: null, obra_nombre: null, bodega_id: null, bodega_nombre: null },
    ];

    test('busca sin tildes por nombre, correo, rol, obra o bodega; filtra por rol', () => {
        expect(filtrarUsuarios(LISTA, 'lopez', null).map(u => u.id)).toEqual([7]);
        expect(filtrarUsuarios(LISTA, 'domeyko', null).map(u => u.id)).toEqual([12]);
        expect(filtrarUsuarios(LISTA, 'CERRILLOS munoz', null).map(u => u.id)).toEqual([15]);
        expect(filtrarUsuarios(LISTA, '', 3).map(u => u.id)).toEqual([7, 9]);
        expect(filtrarUsuarios(LISTA, 'daphne', 5)).toEqual([]);
    });

    test('roles de la lista, por nombre, con su cantidad', () => {
        expect(rolesDeLista(LISTA)).toEqual([
            { id: 3, nombre: 'Administrador', n: 2 },
            { id: 6, nombre: 'Bodeguero', n: 1 },
            { id: 5, nombre: 'Jefe de Obra', n: 1 },
        ]);
    });

    test('lugar: obra y bodega', () => {
        expect(lugarUsuario(LISTA[1])).toBe('Obra Domeyko');
        expect(lugarUsuario(LISTA[2])).toBe('Bodega Cerrillos');
        expect(lugarUsuario({ obra_nombre: 'Gorbea 3082', bodega_nombre: 'Central' })).toBe('Obra Gorbea 3082 · Bodega Central');
        expect(lugarUsuario(LISTA[0])).toBe('');
    });
});
