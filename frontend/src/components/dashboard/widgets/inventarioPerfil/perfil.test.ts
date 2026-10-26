import {
    DESCRIPCION_RESPALDO, DESCRIPCION_SUPER_ADMIN, PERMISOS_OBRA, PERMISOS_PEDIR, PERMISO_APROBAR, PERMISO_DIFERENCIAS_VER,
    PERMISO_RECIBIR, PERMISO_TAB_TRANSFERENCIAS, PERMISO_VER_TODAS, descripcionInventario, esSuperAdmin, vistaInventario,
} from './perfil';

const con = (...permisos: string[]) => (p: string) => permisos.includes(p);
const T = (k: string) => `inventario.transferencias.${k}`;
const TAB = 'inventario.tab.transferencias';

/** El rol «Administrador» (mig 126, sin `aprobar` desde la mig 131): ve todo, no pide ni recibe. */
const ADMINISTRADOR = ['inventario.ver', TAB, T('ver_todas'), T('orden_gerencia')];
/** Un rol de terreno (jefe de obra; «En Terreno» del RUNBOOK §16.5): la pestaña, pedir y recibir, sin ver todas. */
const TERRENO = ['inventario.ver', TAB, T('solicitar'), T('solicitud_materiales'), T('recibir'), T('devolucion'), T('intra_obra')];

describe('esSuperAdmin: el rol 1, como el servidor', () => {
    test('rol 1 (también si llega como texto) sí; cualquier otro rol o sin sesión, no', () => {
        expect(esSuperAdmin({ rol_id: 1 })).toBe(true);
        expect(esSuperAdmin({ rol_id: '1' })).toBe(true);
        expect(esSuperAdmin({ rol_id: 5 })).toBe(false);
        expect(esSuperAdmin({ rol_id: 0 })).toBe(false);
        expect(esSuperAdmin({ rol_id: null })).toBe(false);
        expect(esSuperAdmin({})).toBe(false);
        expect(esSuperAdmin(null)).toBe(false);
        expect(esSuperAdmin(undefined)).toBe(false);
    });
});

describe('los permisos que mira la regla (nombres de la BD: si cambian, la regla deja de calzar)', () => {
    test('pestaña, ver todas, aprobar, ver diferencias, pedir y recibir', () => {
        expect(PERMISO_TAB_TRANSFERENCIAS).toBe('inventario.tab.transferencias');
        expect(PERMISO_VER_TODAS).toBe(T('ver_todas'));
        expect(PERMISO_APROBAR).toBe(T('aprobar'));
        expect(PERMISO_DIFERENCIAS_VER).toBe(T('diferencias_ver'));
        expect(PERMISOS_PEDIR).toEqual([T('solicitar'), T('solicitud_materiales')]);
        expect(PERMISO_RECIBIR).toBe(T('recibir'));
        expect(PERMISOS_OBRA).toEqual([T('solicitar'), T('solicitud_materiales'), T('recibir')]);
    });
});

describe('vistaInventario: qué vista ve cada perfil', () => {
    test('0 · el Super Administrador (rol 1) ve la suya, antes que todo', () => {
        expect(vistaInventario(() => true, { rol_id: 1, bodega_id: null })).toBe('superadmin');
        // Es el rol el que decide, no los permisos: aunque el token no trajera ninguno (ni la pestaña).
        expect(vistaInventario(con(), { rol_id: 1 })).toBe('superadmin');
        expect(vistaInventario(con(T('solicitar')), { rol_id: '1', bodega_id: 2 })).toBe('superadmin');
    });

    test('1 · sin la pestaña «Solicitudes», lo de producción, tenga lo que tenga (los enlaces no abrirían nada)', () => {
        expect(vistaInventario(p => p !== TAB, { rol_id: 5 })).toBe('otro');
        expect(vistaInventario(con('inventario.ver', T('ver_todas'), T('aprobar')), {})).toBe('otro');
        expect(vistaInventario(con('inventario.ver', T('ver_todas'), T('diferencias_ver')), {})).toBe('otro');
        expect(vistaInventario(con('inventario.ver', T('solicitar'), T('recibir')), { bodega_id: null })).toBe('otro');
        expect(vistaInventario(con('inventario.ver', T('recibir')), {})).toBe('otro');
    });

    test('2 · ver todas + aprobar → la de Leonardo (con todos los permisos pero sin ser rol 1, también)', () => {
        expect(vistaInventario(con(...ADMINISTRADOR, T('aprobar'), T('cancelar')), {})).toBe('leonardo');
        expect(vistaInventario(() => true, { bodega_id: 3 })).toBe('leonardo');
        expect(vistaInventario(() => true, { rol_id: 5 })).toBe('leonardo');
        expect(vistaInventario(con(TAB, T('ver_todas'), T('aprobar'), T('diferencias_ver')), null)).toBe('leonardo');
        // Aunque además pida y reciba: con ver_todas no es «lo tuyo».
        expect(vistaInventario(con(TAB, T('ver_todas'), T('aprobar'), T('solicitar'), T('recibir')), {})).toBe('leonardo');
    });

    test('3 · ver todas + «Ver diferencias», sin aprobar → la de jefatura (Daphne)', () => {
        expect(vistaInventario(con(...ADMINISTRADOR, T('diferencias_ver'), T('cancelar')), {})).toBe('jefatura');
        // Aunque además pida materiales: lo de jefatura manda.
        expect(vistaInventario(con(TAB, T('ver_todas'), T('diferencias_ver'), T('solicitar')), {})).toBe('jefatura');
    });

    test('4 · sin ver todas ni bodega, con pedir o recibir → la de obra (jefes de obra y prevencionistas)', () => {
        expect(vistaInventario(con(...TERRENO), { bodega_id: null })).toBe('obra');
        expect(vistaInventario(con('inventario.ver', TAB, T('solicitud_materiales')), {})).toBe('obra');
        expect(vistaInventario(con(TAB, T('solicitar')), null)).toBe('obra');
        // Un prevencionista que solo recibe, también (la vista no le ofrece «Pedir materiales»).
        expect(vistaInventario(con('inventario.ver', TAB, T('recibir')), { bodega_id: null })).toBe('obra');
    });

    test('4 · un rol de obra hecho a mano con aprobar o ver diferencias (sin ver todas) igual ve la de obra', () => {
        // Sin ver_todas no tiene la bandeja de todas las obras: la vista de Leonardo le saldría a medias.
        expect(vistaInventario(con(...TERRENO, T('aprobar')), { bodega_id: null })).toBe('obra');
        expect(vistaInventario(con(...TERRENO, T('aprobar'), T('diferencias_ver'), T('sod_bypass')), {})).toBe('obra');
        expect(vistaInventario(con('inventario.ver', TAB, T('recibir'), T('diferencias_ver')), null)).toBe('obra');
    });

    test('5 · aprobar o ver diferencias sin ver todas, y sin pedir ni recibir (o con bodega) → lo de producción', () => {
        expect(vistaInventario(con('inventario.ver', TAB, T('aprobar')), {})).toBe('otro');
        expect(vistaInventario(con('inventario.ver', TAB, T('diferencias_ver')), {})).toBe('otro');
        expect(vistaInventario(con(...TERRENO, T('aprobar')), { bodega_id: 2 })).toBe('otro');
    });

    test('5 · el bodeguero (con bodega) ve lo de producción, aunque pueda pedir', () => {
        expect(vistaInventario(con('inventario.ver', TAB, T('recibir')), { bodega_id: 2 })).toBe('otro');
        expect(vistaInventario(con(...TERRENO), { bodega_id: 2 })).toBe('otro');
    });

    test('5 · con ver todas y pidiendo, sin aprobar ni ver diferencias → lo de producción (la de obra es «lo tuyo»)', () => {
        // Con ver_todas el servidor manda lo de todas las obras: VistaObra lo mostraría como si fuera suyo.
        expect(vistaInventario(con(...ADMINISTRADOR, T('solicitar'), T('recibir')), {})).toBe('otro');
        expect(vistaInventario(con(TAB, T('ver_todas'), T('recibir')), { bodega_id: null })).toBe('otro');
    });

    test('5 · los Administradores sin aprobar (Paula, Rodrigo, Matías, Luis) y el resto ven lo de producción', () => {
        expect(vistaInventario(con(...ADMINISTRADOR), {})).toBe('otro');
        expect(vistaInventario(con('inventario.ver', TAB), {})).toBe('otro');
        expect(vistaInventario(con('inventario.ver'), {})).toBe('otro');
        expect(vistaInventario(con(), null)).toBe('otro');
    });
});

describe('descripcionInventario: la línea bajo el título', () => {
    const LEO = [{ id: 7, nombre: 'Leonardo López' }];

    test('Super Administrador: el texto del lienzo (opción A)', () => {
        expect(descripcionInventario('superadmin')).toBe(DESCRIPCION_SUPER_ADMIN);
        expect(DESCRIPCION_SUPER_ADMIN).toBe('Todo lo que pasa: qué tiene pendiente cada persona y quién hizo cada paso de cada solicitud.');
    });

    test('textos del lienzo (A para Leonardo y obra, B para jefatura)', () => {
        expect(descripcionInventario('leonardo')).toBe('Lo que espera tu aprobación dentro del circuito completo, de la más antigua a la más nueva.');
        expect(descripcionInventario('obra', { obra: 'Domeyko' })).toBe('Pide materiales, recibe lo que llega a Domeyko y revisa tus aprobados.');
        expect(descripcionInventario('jefatura', { aprobadores: LEO }))
            .toBe('El camino completo de todas las obras: lo que espera a Leonardo y las diferencias por aclarar.');
    });

    test('sin obra conocida, un texto sin nombre; sin quien apruebe, «Leonardo» (Marcos 2026-10-26)', () => {
        expect(descripcionInventario('obra')).toBe('Pide materiales, recibe lo que llega a tu obra y revisa tus aprobados.');
        expect(descripcionInventario('obra', { obra: '  ' })).toBe('Pide materiales, recibe lo que llega a tu obra y revisa tus aprobados.');
        expect(descripcionInventario('jefatura', { aprobadores: [] }))
            .toBe('El camino completo de todas las obras: lo que espera a Leonardo y las diferencias por aclarar.');
    });

    test('obra sin permiso de pedir (un prevencionista que solo recibe): no lo invita a pedir', () => {
        expect(descripcionInventario('obra', { obra: 'Domeyko', puedePedir: false }))
            .toBe('Recibe lo que llega a Domeyko y revisa lo que ya llegó.');
        expect(descripcionInventario('obra', { puedePedir: false })).toBe('Recibe lo que llega a tu obra y revisa lo que ya llegó.');
        expect(descripcionInventario('obra', { obra: 'Domeyko', puedePedir: true }))
            .toBe('Pide materiales, recibe lo que llega a Domeyko y revisa tus aprobados.');
    });

    test('el resto, la de producción', () => {
        expect(descripcionInventario('otro')).toBe(DESCRIPCION_RESPALDO);
        expect(DESCRIPCION_RESPALDO).toBe('Solicitudes que te tocan y alertas de transferencias');
    });
});
