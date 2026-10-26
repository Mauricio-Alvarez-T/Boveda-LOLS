import {
    PANTALLAS, CLAVES_MATRIZ, nivelDe, aplicarNivel, alternarClave, normalizarPuertas, rolesGemelos,
    ETIQUETA_A_MEDIDA, ETIQUETA_NADA, type Pantalla,
} from './permisosPantallas';

/**
 * Guarda anti-drift de la matriz de roles: lee el catálogo REAL del backend (fuente de verdad de qué
 * permisos existen). Si alguien agrega un permiso y no le da fila en `permisosPantallas.ts`, la matriz
 * no lo mostraría y este test lo atrapa.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MAESTRO: [string, ...unknown[]][] = require('../../../backend/src/config/permisos.config.js');
const CATALOGO = MAESTRO.map(p => p[0]);

const pantalla = (id: string) => PANTALLAS.find(p => p.id === id) as Pantalla;
const set = (xs: string[]) => new Set(xs);

describe('cobertura del catálogo', () => {
    test('cada permiso del catálogo está en la matriz exactamente una vez', () => {
        const veces = new Map<string, number>();
        for (const c of CLAVES_MATRIZ) veces.set(c, (veces.get(c) ?? 0) + 1);
        expect(CATALOGO.filter(c => !veces.has(c))).toEqual([]);
        expect([...veces].filter(([, n]) => n > 1).map(([c]) => c)).toEqual([]);
    });

    test('la matriz no inventa permisos', () => {
        expect(CLAVES_MATRIZ.filter(c => !CATALOGO.includes(c))).toEqual([]);
    });

    test('ningún nivel regala montos ni permisos delicados', () => {
        for (const p of PANTALLAS) {
            const marcadas = p.items.filter(it => it.marca).map(it => it.clave);
            for (const n of p.niveles) expect(n.claves.filter(c => marcadas.includes(c))).toEqual([]);
        }
    });
});

describe('nivelDe', () => {
    test('Bodeguero real (ve la pestaña y recibe) queda «A medida» en Solicitudes', () => {
        const bodeguero = set(['inventario.ver', 'inventario.tab.transferencias', 'inventario.transferencias.recibir']);
        expect(nivelDe(bodeguero, pantalla('solicitudes')).etiqueta).toBe(ETIQUETA_A_MEDIDA);
        expect(nivelDe(bodeguero, pantalla('maestro')).etiqueta).toBe(ETIQUETA_NADA);
    });

    test('ida y vuelta: aplicar cada nivel y leerlo da el mismo nivel', () => {
        for (const p of PANTALLAS) {
            p.niveles.forEach((n, idx) => {
                expect(nivelDe(set(aplicarNivel([], p, idx + 1)), p)).toMatchObject({ nivel: idx + 1, etiqueta: n.etiqueta });
            });
        }
    });

    test('marca $ y delicado sin cambiar el nivel', () => {
        const p = pantalla('solicitudes');
        const perms = set([...p.niveles[0].claves, 'inventario.transferencias.eliminar']);
        expect(nivelDe(perms, p)).toMatchObject({ nivel: 1, delicado: true, dinero: false });
    });
});

describe('aplicarNivel y alternarClave', () => {
    test('subir un nivel conserva montos, delicados y claves ajenas a la pantalla', () => {
        const p = pantalla('maestro');
        const antes = ['inventario.tab.maestro', 'inventario.costos.ver', 'clave.que.la.matriz.no.conoce', 'vehiculos.ver'];
        const despues = set(aplicarNivel(antes, p, 3));
        expect(despues.has('inventario.costos.ver')).toBe(true);
        expect(despues.has('clave.que.la.matriz.no.conoce')).toBe(true);
        expect(despues.has('vehiculos.ver')).toBe(true);
        expect(despues.has('inventario.eliminar')).toBe(true);
    });

    test('Nada apaga la pantalla entera, montos incluidos', () => {
        const p = pantalla('maestro');
        const despues = aplicarNivel(['inventario.ver', 'inventario.tab.maestro', 'inventario.costos.ver'], p, 0);
        expect(despues).toEqual([]);
    });

    test('inventario.ver se pone y se saca solo', () => {
        const p = pantalla('resumen');
        const con = aplicarNivel([], p, 1);
        expect(set(con).has('inventario.ver')).toBe(true);
        expect(aplicarNivel(con, p, 0)).toEqual([]);
    });

    test('subir una fila de Asistencia enciende la puerta; apagar la puerta apaga el módulo', () => {
        const con = aplicarNivel([], pantalla('periodos'), 2);
        expect(set(con).has('asistencia.ver')).toBe(true);
        expect(nivelDe(set(con), pantalla('asistencia')).etiqueta).toBe('Mira');
        expect(aplicarNivel(con, pantalla('asistencia'), 0)).toEqual([]);
    });

    test('filas libres no tocan la puerta', () => {
        const con = aplicarNivel([], pantalla('ingresos'), 1);
        expect(con).toEqual(['trabajadores.solicitud.crear']);
    });

    test('marcar una tarea agrega el «ver» de la pantalla; quitar el «ver» apaga la pantalla', () => {
        const p = pantalla('solicitudes');
        const con = alternarClave([], p, 'inventario.transferencias.recibir');
        expect(set(con)).toEqual(set(['inventario.transferencias.recibir', 'inventario.tab.transferencias', 'inventario.ver']));
        expect(alternarClave(con, p, 'inventario.tab.transferencias')).toEqual([]);
    });

    test('normalizarPuertas no inventa Inventario si no hay pantallas', () => {
        expect(normalizarPuertas(['inventario.ver'])).toEqual([]);
    });
});

describe('rolesGemelos', () => {
    test('agrupa roles con los mismos permisos, el grupo más grande primero', () => {
        const perms: Record<number, string[]> = { 2: ['a', 'b'], 3: ['b', 'a'], 4: ['a'], 5: ['a', 'b'], 6: ['a'] };
        const grupos = rolesGemelos([2, 3, 4, 5, 6].map(id => ({ id })), id => set(perms[id]));
        expect(grupos.map(g => g.map(r => r.id))).toEqual([[2, 3, 5], [4, 6]]);
    });
});
