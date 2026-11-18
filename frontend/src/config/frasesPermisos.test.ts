import { GRUPOS, PANTALLAS, aplicarNivel, alternarClave, type Pantalla } from './permisosPantallas';
import {
    cambiosEntre, comoSuRol, conY, cosasDistintas, cosasDistintasPersona, diferencia, difiere, efectivos, enLista, etiquetaFrase,
    etiquetaLarga, frasePantalla, moduloSinEntrada, overridesAlGuardar, puertasDistintas, respetarPuertas, type Override,
} from './frasesPermisos';

const pantalla = (id: string) => PANTALLAS.find(p => p.id === id) as Pantalla;
const set = (xs: string[]) => new Set(xs);
const claves = (f: { it: { clave: string } }[]) => f.map(x => x.it.clave);

describe('frasePantalla', () => {
    const asistencia = pantalla('asistencia');

    test('un rol: lo que puede y lo que no, sin nombrar montos que no tiene', () => {
        const f = frasePantalla(asistencia, set(['asistencia.ver', 'asistencia.exportar_excel']));
        expect(claves(f.puede)).toEqual(['asistencia.ver', 'asistencia.exportar_excel']);
        expect(claves(f.noPuede)).toEqual(['asistencia.guardar', 'asistencia.enviar_whatsapp', 'asistencia.feriado.gestionar', 'asistencia.tomar.global']);
        expect(f.puede.every(x => !x.marca)).toBe(true);
    });

    test('montos: se nombran si los tiene', () => {
        const f = frasePantalla(asistencia, set(['asistencia.ver', 'asistencia.horas_extra.ver']));
        expect(claves(f.puede)).toContain('asistencia.horas_extra.ver');
    });

    test('una persona: lo propio y lo quitado van marcados, aunque lo quitado sea de montos', () => {
        const rol = set(['asistencia.ver', 'asistencia.horas_extra.ver']);
        const persona = set(['asistencia.ver', 'asistencia.guardar']);
        const f = frasePantalla(asistencia, persona, rol);
        expect(f.puede.find(x => x.it.clave === 'asistencia.guardar')?.marca).toBe('propio');
        expect(f.puede.find(x => x.it.clave === 'asistencia.ver')?.marca).toBeUndefined();
        expect(f.noPuede.find(x => x.it.clave === 'asistencia.horas_extra.ver')?.marca).toBe('quitado');
        // Lo quitado va primero (la frase corta lo que no puede).
        expect(f.noPuede[0].it.clave).toBe('asistencia.horas_extra.ver');
    });

    test('no la ve: nada en «puede»', () => {
        expect(frasePantalla(asistencia, set([])).puede).toEqual([]);
    });
});

describe('diferencia y cosasDistintas', () => {
    test('cuenta acciones, no pantallas', () => {
        const rol = set(['vehiculos.ver']);
        const persona = set(['vehiculos.ver', 'vehiculos.crear', 'vehiculos.editar']);
        const d = diferencia(rol, persona, pantalla('vehiculos'));
        expect(d.propios.map(x => x.clave)).toEqual(['vehiculos.crear', 'vehiculos.editar']);
        expect(difiere(d)).toBe(true);
        expect(cosasDistintas(rol, persona)).toBe(2);
        expect(cosasDistintas(rol, rol)).toBe(0);
    });
});

describe('etiquetaLarga', () => {
    test('dice de qué pantalla es cuando la etiqueta sola no alcanza', () => {
        const sol = pantalla('solicitudes');
        expect(etiquetaLarga(sol.items[0], sol)).toBe('Ver la pestaña Solicitudes');
        const veh = pantalla('vehiculos');
        expect(etiquetaLarga(veh.items.find(i => i.clave === 'vehiculos.crear')!, veh)).toBe('Registrar vehículos');
        expect(etiquetaLarga(veh.items[0], veh)).toBe('Ver la flota y sus papeles');
    });
});

describe('comoSuRol', () => {
    test('solo esa pantalla vuelve a lo del rol, con las puertas en orden', () => {
        const rol = set(['vehiculos.ver']);
        const persona = ['vehiculos.ver', 'vehiculos.crear', 'inventario.ver', 'inventario.tab.maestro'];
        const r = comoSuRol(persona, rol, pantalla('maestro'));
        expect(r).toEqual(expect.arrayContaining(['vehiculos.ver', 'vehiculos.crear']));
        expect(r).not.toContain('inventario.tab.maestro');
        // Sin pantallas de Inventario, la puerta se va sola.
        expect(r).not.toContain('inventario.ver');
    });
});

describe('efectivos', () => {
    test('rol + grant − deny', () => {
        const ov: Override[] = [{ permiso_clave: 'b', tipo: 'grant' }, { permiso_clave: 'a', tipo: 'deny' }];
        expect(efectivos(['a', 'c'], ov).sort()).toEqual(['b', 'c']);
    });
});

describe('overridesAlGuardar', () => {
    const rol = set(['a', 'b']);

    test('lo que se dio y se quitó se vuelve grant y deny', () => {
        const antes = set(['a', 'b']);
        const ahora = set(['a', 'x']);
        expect(overridesAlGuardar({ antes, ahora, rol, actuales: [] })).toEqual([
            { permiso_clave: 'b', tipo: 'deny' },
            { permiso_clave: 'x', tipo: 'grant' },
        ]);
    });

    test('volver a lo del rol borra el override', () => {
        const actuales: Override[] = [{ permiso_clave: 'x', tipo: 'grant' }, { permiso_clave: 'b', tipo: 'deny' }];
        const antes = set(efectivos(['a', 'b'], actuales));
        const ahora = set(['a', 'b']);
        expect(overridesAlGuardar({ antes, ahora, rol, actuales })).toEqual([]);
    });

    test('lo que no se tocó queda tal cual, aunque sea redundante o no esté en la matriz', () => {
        const actuales: Override[] = [
            { permiso_clave: 'a', tipo: 'grant' }, // redundante: el rol ya lo trae
            { permiso_clave: 'clave.vieja', tipo: 'grant' }, // la matriz no la conoce
        ];
        const antes = set(efectivos(['a', 'b'], actuales));
        const ahora = new Set([...antes, 'y']);
        expect(overridesAlGuardar({ antes, ahora, rol, actuales })).toEqual([
            { permiso_clave: 'a', tipo: 'grant' },
            { permiso_clave: 'clave.vieja', tipo: 'grant' },
            { permiso_clave: 'y', tipo: 'grant' },
        ]);
    });

    test('desde cero: solo lo distinto al rol, sin redundantes', () => {
        const actuales: Override[] = [{ permiso_clave: 'a', tipo: 'grant' }, { permiso_clave: 'z', tipo: 'deny' }];
        expect(overridesAlGuardar({ antes: set(['a', 'b']), ahora: set(['a', 'b']), rol, actuales, desdeCero: true })).toEqual([]);
        expect(overridesAlGuardar({ antes: set(['a', 'b']), ahora: set(['b', 'q']), rol, actuales, desdeCero: true })).toEqual([
            { permiso_clave: 'a', tipo: 'deny' },
            { permiso_clave: 'q', tipo: 'grant' },
        ]);
    });

    test('con la matriz de verdad: subir a Paula a «Trabaja» en Vehículos da dos grant', () => {
        const rolRrhh = aplicarNivel([], pantalla('vehiculos'), 1);
        const ahora = aplicarNivel(rolRrhh, pantalla('vehiculos'), 2);
        expect(overridesAlGuardar({ antes: set(rolRrhh), ahora: set(ahora), rol: set(rolRrhh), actuales: [] })).toEqual([
            { permiso_clave: 'vehiculos.crear', tipo: 'grant' },
            { permiso_clave: 'vehiculos.editar', tipo: 'grant' },
        ]);
    });

    test('la puerta implícita de Inventario también se guarda', () => {
        const ahora = aplicarNivel([], pantalla('solicitudes'), 1);
        expect(overridesAlGuardar({ antes: set([]), ahora: set(ahora), rol: set([]), actuales: [] })).toEqual([
            { permiso_clave: 'inventario.tab.transferencias', tipo: 'grant' },
            { permiso_clave: 'inventario.ver', tipo: 'grant' },
        ]);
    });
});

describe('cambiosEntre y enLista', () => {
    test('cuenta en los dos sentidos', () => {
        expect(cambiosEntre(['a', 'b'], ['b', 'c', 'd'])).toBe(3);
        expect(cambiosEntre([], [])).toBe(0);
    });
    test('«A, B y C»', () => {
        expect(enLista(['A'])).toBe('A');
        expect(enLista(['A', 'B', 'C'])).toBe('A, B y C');
    });
});

describe('puertas en una persona (respetarPuertas)', () => {
    const veh = pantalla('vehiculos');
    const sol = pantalla('solicitudes');
    const rol = ['inventario.ver', 'inventario.tab.transferencias', 'inventario.transferencias.solicitar', 'vehiculos.ver'];

    test('un deny de la entrada a Inventario NO se pierde al tocar Vehículos', () => {
        const actuales: Override[] = [{ permiso_clave: 'inventario.ver', tipo: 'deny' }];
        const antes = efectivos(rol, actuales);
        const ahora = respetarPuertas(antes, aplicarNivel(antes, veh, 2), veh);
        expect(ahora).not.toContain('inventario.ver');
        expect(overridesAlGuardar({ antes: set(antes), ahora: set(ahora), rol: set(rol), actuales })).toEqual([
            { permiso_clave: 'inventario.ver', tipo: 'deny' },
            { permiso_clave: 'vehiculos.crear', tipo: 'grant' },
            { permiso_clave: 'vehiculos.editar', tipo: 'grant' },
        ]);
    });

    test('un rol desordenado no le inventa propios a la persona', () => {
        const rolRaro = ['asistencia.periodo.ver', 'vehiculos.ver']; // sin asistencia.ver
        const ahora = respetarPuertas(rolRaro, aplicarNivel(rolRaro, veh, 2), veh);
        expect(ahora).not.toContain('asistencia.ver');
        const rolSinPestanas = ['inventario.ver', 'vehiculos.ver'];
        expect(respetarPuertas(rolSinPestanas, aplicarNivel(rolSinPestanas, veh, 2), veh)).toContain('inventario.ver');
    });

    test('en su propio módulo: abrirlo pone la entrada y vaciarlo la saca', () => {
        const nada: string[] = ['vehiculos.ver'];
        const abierto = respetarPuertas(nada, aplicarNivel(nada, sol, 1), sol);
        expect(abierto).toContain('inventario.ver');
        const cerrado = respetarPuertas(abierto, aplicarNivel(abierto, sol, 0), sol);
        expect(cerrado).not.toContain('inventario.ver');
    });

    test('en su propio módulo, si sigue abierto, la entrada queda como estaba', () => {
        const sinEntrada = ['inventario.tab.transferencias', 'vehiculos.ver']; // deny de inventario.ver
        const ahora = respetarPuertas(sinEntrada, aplicarNivel(sinEntrada, pantalla('maestro'), 1), pantalla('maestro'));
        expect(ahora).not.toContain('inventario.ver');
    });

    test('la fila puerta sí cierra el módulo (como en la matriz)', () => {
        const asis = pantalla('asistencia');
        const antes = ['asistencia.ver', 'asistencia.periodo.ver'];
        const ahora = respetarPuertas(antes, alternarClave(antes, asis, 'asistencia.ver'), asis);
        expect(ahora).toEqual([]);
    });

    test('«Como su rol» no toca la entrada de otro módulo', () => {
        const persona = ['inventario.tab.transferencias', 'vehiculos.ver', 'vehiculos.crear']; // sin inventario.ver
        expect(comoSuRol(persona, set(rol), veh)).not.toContain('inventario.ver');
    });

    test('la entrada implícita distinta se ve y se cuenta', () => {
        const persona = set(efectivos(rol, [{ permiso_clave: 'inventario.ver', tipo: 'deny' }]));
        expect(puertasDistintas(set(rol), persona).map(x => [x.grupo.id, x.tipo])).toEqual([['inventario', 'quitado']]);
        expect(cosasDistintas(set(rol), persona)).toBe(0);
        expect(cosasDistintasPersona(set(rol), persona)).toBe(1);
        expect(moduloSinEntrada(persona, GRUPOS.find(g => g.id === 'inventario')!)).toBe(true);
        expect(moduloSinEntrada(set(rol), GRUPOS.find(g => g.id === 'inventario')!)).toBe(false);
    });
});

describe('frases en buen español', () => {
    test('toda acción dentro de una frase empieza con un verbo en infinitivo', () => {
        const sinVerbo = PANTALLAS.flatMap(p => p.items).map(etiquetaFrase).filter(t => !/^\p{L}+(ar|er|ir)(se)?(\s|$)/u.test(t));
        expect(sinVerbo).toEqual([]);
    });

    test('«e» antes de sonido /i/', () => {
        expect(conY('imprimir contratos')).toBe('e');
        expect(conY('Ignacio')).toBe('e');
        expect(conY('hielo')).toBe('y');
        expect(conY('descargar')).toBe('y');
        expect(conY('Hilda')).toBe('e');
        expect(conY('Hielo')).toBe('y');
        expect(enLista(['Matías', 'Ignacio'])).toBe('Matías e Ignacio');
    });
});

describe('puertas: casos finos', () => {
    const gestiones = pantalla('gestiones');
    const veh = pantalla('vehiculos');
    const sol = pantalla('solicitudes');

    test('fila puerta: apagar otra acción no revive un «quitado» de la entrada', () => {
        // Rol con Gestiones; la persona tiene deny de reportes.ver. Se apaga «Descargar reportes en Excel».
        const rol = ['reportes.ver', 'reportes.exportar', 'documentos.ver'];
        const antes = efectivos(rol, [{ permiso_clave: 'reportes.ver', tipo: 'deny' }]);
        const ahora = respetarPuertas(antes, alternarClave(antes, gestiones, 'reportes.exportar'), gestiones, { puerta: antes.includes('reportes.ver') });
        expect(ahora).not.toContain('reportes.ver');
        expect(ahora).not.toContain('reportes.exportar');
    });

    test('fila puerta: subir de nivel sí pone la entrada', () => {
        const ahora = respetarPuertas([], aplicarNivel([], gestiones, 1), gestiones, { puerta: true });
        expect(ahora).toContain('reportes.ver');
    });

    test('«Como su rol» con un rol desordenado no inventa la entrada como propio', () => {
        const rol = set(['asistencia.periodo.ver']); // sin asistencia.ver
        const persona: string[] = []; // deny de asistencia.periodo.ver
        const r = comoSuRol(persona, rol, pantalla('periodos'));
        expect(r).toEqual(['asistencia.periodo.ver']);
        expect(cosasDistintasPersona(rol, set(r))).toBe(0);
    });

    test('abrir y cerrar Inventario no borra una entrada guardada sin pestañas', () => {
        const guardado = set(['vehiculos.ver', 'inventario.ver']); // grant de inventario.ver sin pestañas
        const abierto = respetarPuertas([...guardado], aplicarNivel([...guardado], sol, 1), sol, { guardado });
        const cerrado = respetarPuertas(abierto, aplicarNivel(abierto, sol, 0), sol, { guardado });
        expect(cerrado.sort()).toEqual([...guardado].sort());
    });

    test('abrir y cerrar Inventario sin entrada guardada la saca (como en la matriz)', () => {
        const guardado = set(['vehiculos.ver']);
        const abierto = respetarPuertas([...guardado], aplicarNivel([...guardado], sol, 1), sol, { guardado });
        expect(abierto).toContain('inventario.ver');
        const cerrado = respetarPuertas(abierto, aplicarNivel(abierto, sol, 0), sol, { guardado });
        expect(cerrado).toEqual(['vehiculos.ver']);
    });

    test('tocar Vehículos con la entrada guardada sin pestañas no la toca', () => {
        const guardado = set(['vehiculos.ver', 'inventario.ver']);
        expect(respetarPuertas([...guardado], aplicarNivel([...guardado], veh, 2), veh, { guardado })).toContain('inventario.ver');
    });
});
