import {
    DESCRIPCION_RESPALDO, DESCRIPCION_SUPER_ADMIN, descripcionInventario, esSuperAdmin, vistaInventario,
} from './perfil';

const con = (...permisos: string[]) => (p: string) => permisos.includes(p);
const T = (k: string) => `inventario.transferencias.${k}`;

/** El rol «Administrador» (mig 126, sin `aprobar` desde la mig 131): ve todo, no pide ni recibe. */
const ADMINISTRADOR = ['inventario.ver', 'inventario.tab.transferencias', T('ver_todas'), T('orden_gerencia')];

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

describe('vistaInventario: qué vista ve cada perfil', () => {
    test('el Super Administrador (rol 1) ve la suya, antes que la de quien aprueba', () => {
        expect(vistaInventario(() => true, { rol_id: 1, bodega_id: null })).toBe('superadmin');
        // Es el rol el que decide, no los permisos: aunque el token no trajera ninguno.
        expect(vistaInventario(con(), { rol_id: 1 })).toBe('superadmin');
        expect(vistaInventario(con(T('solicitar')), { rol_id: '1', bodega_id: 2 })).toBe('superadmin');
    });

    test('quien aprueba ve la de Leonardo (con todos los permisos pero sin ser rol 1, también)', () => {
        expect(vistaInventario(con(...ADMINISTRADOR, T('aprobar'), T('cancelar')), {})).toBe('leonardo');
        expect(vistaInventario(() => true, { bodega_id: 3 })).toBe('leonardo');
        expect(vistaInventario(() => true, { rol_id: 5 })).toBe('leonardo');
        expect(vistaInventario(con(T('aprobar'), T('diferencias_ver')), null)).toBe('leonardo');
    });

    test('«Ver diferencias» sin aprobar ve la de jefatura (Daphne)', () => {
        expect(vistaInventario(con(...ADMINISTRADOR, T('diferencias_ver'), T('cancelar')), {})).toBe('jefatura');
        // Aunque además pida materiales: lo de jefatura manda.
        expect(vistaInventario(con(T('diferencias_ver'), T('solicitar')), {})).toBe('jefatura');
    });

    test('quien pide materiales sin bodega asignada ve la de obra (jefes de obra y prevencionistas)', () => {
        expect(vistaInventario(con('inventario.ver', T('solicitar'), T('recibir')), { bodega_id: null })).toBe('obra');
        expect(vistaInventario(con('inventario.ver', T('solicitud_materiales')), {})).toBe('obra');
        expect(vistaInventario(con(T('solicitar')), null)).toBe('obra');
    });

    test('el bodeguero (con bodega) ve lo de producción, aunque pueda pedir', () => {
        expect(vistaInventario(con('inventario.ver', T('recibir')), { bodega_id: 2 })).toBe('otro');
        expect(vistaInventario(con('inventario.ver', T('solicitar'), T('recibir')), { bodega_id: 2 })).toBe('otro');
    });

    test('los Administradores sin aprobar (Paula, Rodrigo, Matías, Luis) y el resto ven lo de producción', () => {
        expect(vistaInventario(con(...ADMINISTRADOR), {})).toBe('otro');
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

    test('sin obra conocida o sin quien apruebe, un texto sin nombre', () => {
        expect(descripcionInventario('obra')).toBe('Pide materiales, recibe lo que llega a tu obra y revisa tus aprobados.');
        expect(descripcionInventario('obra', { obra: '  ' })).toBe('Pide materiales, recibe lo que llega a tu obra y revisa tus aprobados.');
        expect(descripcionInventario('jefatura', { aprobadores: [] }))
            .toBe('El camino completo de todas las obras: lo que espera aprobación y las diferencias por aclarar.');
    });

    test('el resto, la de producción', () => {
        expect(descripcionInventario('otro')).toBe(DESCRIPCION_RESPALDO);
        expect(DESCRIPCION_RESPALDO).toBe('Solicitudes que te tocan y alertas de transferencias');
    });
});
