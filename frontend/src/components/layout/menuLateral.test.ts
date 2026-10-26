import { PERMISOS_MENU_GESTIONES, menuVisible, veBuzonIdeas } from './menuLateral';

const con = (...permisos: string[]) => (p: string) => permisos.includes(p);
const claves = (permisos: string[], user?: { rol_id?: number | string | null } | null) => menuVisible(con(...permisos), user).map(s => s.clave);

describe('menuVisible (la regla del Sidebar)', () => {
    test('sin permisos: Inicio y Ayuda', () => {
        expect(claves([])).toEqual(['inicio', 'ayuda']);
    });

    test('cada sección con su permiso, en el orden del menú', () => {
        expect(claves(['usuarios.ver', 'asistencia.ver', 'inventario.ver', 'vehiculos.ver', 'obras.ver', 'costos.gestionar', 'ideas.revisar', 'trabajadores.ver']))
            .toEqual(['inicio', 'asistencia', 'gestiones', 'inventario', 'vehiculos', 'obras_finalizadas', 'presupuestos', 'ayuda', 'revisar_ideas', 'configuracion']);
    });

    test.each(PERMISOS_MENU_GESTIONES)('Gestiones se abre con %s', (p) => {
        expect(claves([p])).toContain('gestiones');
    });

    test('Soporte: solo el rol 1 (no un permiso)', () => {
        expect(claves(['usuarios.ver', 'usuarios.permisos.gestionar'], { rol_id: 3 })).not.toContain('soporte');
        expect(claves([], { rol_id: 1 })).toContain('soporte');
        expect(claves([], { rol_id: '1' })).toContain('soporte');
        expect(claves([], null)).not.toContain('soporte');
    });

    test('rutas', () => {
        const m = menuVisible(con('trabajadores.ver'), { rol_id: 1 });
        expect(m.find(s => s.clave === 'gestiones')?.path).toBe('/consultas?tab=inicio');
        expect(m.find(s => s.clave === 'soporte')?.path).toBe('/soporte');
    });

    test('«Comparte tu idea»: todos menos quien revisa ideas', () => {
        expect(veBuzonIdeas(con())).toBe(true);
        expect(veBuzonIdeas(con('ideas.revisar'))).toBe(false);
    });
});
