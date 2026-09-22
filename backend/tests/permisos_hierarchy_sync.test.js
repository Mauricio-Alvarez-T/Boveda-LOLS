/**
 * Guard anti-drift catálogo ↔ jerarquía visual (plan Gestiones B1, 2026-09-11).
 *
 * Toda clave de `MAESTRO_PERMISOS` (backend, fuente de verdad) debe tener entrada en
 * `frontend/src/config/permisosHierarchy.ts`; si falta, el modal de Roles la tira a
 * "Configuración → Otros" y `runHierarchyDevCheck` solo avisa en dev. El .ts usa
 * `import.meta.env` y no compila en ningún Jest, así que se lee como TEXTO (mismo
 * patrón que frontend/src/components/ayuda/tutorialLabels.test.ts).
 */
const fs = require('fs');
const path = require('path');
const MAESTRO = require('../src/config/permisos.config');

const HIERARCHY_PATH = path.join(__dirname, '../../frontend/src/config/permisosHierarchy.ts');
const src = fs.readFileSync(HIERARCHY_PATH, 'utf8');

describe('permisos.config.js ↔ permisosHierarchy.ts', () => {
    test('el archivo de jerarquía existe y exporta PERMISO_HIERARCHY', () => {
        expect(src).toMatch(/export const PERMISO_HIERARCHY/);
    });

    MAESTRO.forEach(([clave, modulo]) => {
        test(`${clave} (${modulo}) está mapeada`, () => {
            expect(src).toContain(`'${clave}':`);
        });
    });

    test('no hay claves duplicadas en el catálogo', () => {
        const claves = MAESTRO.map(p => p[0]);
        expect(new Set(claves).size).toBe(claves.length);
    });
});
