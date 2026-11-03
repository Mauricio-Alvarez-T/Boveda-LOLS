import { apartadoDeVista, estadoArreglo, pendientesSueltos, pestanasErrores } from './errores';
import { RE_VERSION, VERSION_APP, versionLegible } from '../../services/versionApp';

/** Errores que se vigilan solos y apartados propios (mig 150, Marcos 2026-11-03). */

describe('la versión de Bóveda', () => {
    it('se lee en hora de Chile: 19:50 UTC del 3-nov = 16:50 (verano, UTC−3)', () => {
        expect(versionLegible('20261103-1950')).toBe('3-nov 16:50');
    });
    it('el cambio de día también es el de Chile: 02:10 UTC del 4-nov = 23:10 del 3-nov', () => {
        expect(versionLegible('20261104-0210')).toBe('3-nov 23:10');
    });
    it('lo que no es una versión queda como está; vacío → vacío', () => {
        expect(versionLegible('dev')).toBe('dev');
        expect(versionLegible(null)).toBe('');
        expect(RE_VERSION.test('20261103-1950')).toBe(true);
        expect(RE_VERSION.test('2026-11-03')).toBe(false);
    });
    it('fuera de un build de Vite (estas pruebas) la app no tiene versión', () => {
        expect(VERSION_APP).toBeNull();
    });
});

describe('las pestañas con apartados propios', () => {
    const apartados = [{ id: 3, nombre: 'Fotos que no suben', pendientes: 2, por_revisar: 2 }, { id: 8, nombre: 'Impresión', pendientes: 1, por_revisar: 0 }];

    it('los apartados van después de las de Bóveda y antes de «Revisados»', () => {
        expect(pestanasErrores(apartados).map(p => p.key)).toEqual(['revisar', 'senal', 'datos', 'ap:3', 'ap:8', 'revisados', 'todos']);
        expect(pestanasErrores([]).map(p => p.key)).toEqual(['revisar', 'senal', 'datos', 'revisados', 'todos']);
    });

    it('«ap:<id>» → el id; las demás → null', () => {
        expect(apartadoDeVista('ap:8')).toBe(8);
        expect(apartadoDeVista('revisar')).toBeNull();
    });

    it('«Para revisar» cuenta los pendientes menos las fallas/permisos que están en un apartado', () => {
        expect(pendientesSueltos(5, apartados)).toBe(3);
        expect(pendientesSueltos(1, apartados)).toBe(0);
    });
});

describe('el estado del arreglo', () => {
    it('la vuelta de uno arreglado, sin revisar → reabierto', () => {
        expect(estadoArreglo({ estado: 'pendiente', reaparecio_de: 40, arreglado_version: null, arreglo_fallo_en: null })).toBe('reabierto');
    });
    it('arreglado y sin vuelta → vigilando; con vuelta → fallo', () => {
        expect(estadoArreglo({ estado: 'revisado', reaparecio_de: null, arreglado_version: '20261103-1950', arreglo_fallo_en: null })).toBe('vigilando');
        expect(estadoArreglo({ estado: 'revisado', reaparecio_de: null, arreglado_version: '20261103-1950', arreglo_fallo_en: '2026-11-04T12:10:00Z' })).toBe('fallo');
    });
    it('revisado a secas o pendiente normal → nada', () => {
        expect(estadoArreglo({ estado: 'revisado', reaparecio_de: null, arreglado_version: null, arreglo_fallo_en: null })).toBeNull();
        expect(estadoArreglo({ estado: 'pendiente', reaparecio_de: null, arreglado_version: null, arreglo_fallo_en: null })).toBeNull();
    });
});
