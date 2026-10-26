import { CATEGORIA_ERROR, filtrarErrores, navegadorCorto, pideRevision, porQueSinFoto, textoDuracion, type ErrorSoporte } from './errores';

const fila = (o: Partial<ErrorSoporte>): ErrorSoporte => ({
    id: 1, usuario_id: 20, usuario_nombre: 'Tomás Vera', categoria: 'falla', mensaje: 'No se pudo guardar la recepción',
    permisos_faltantes: [], veces: 1, primera_vez: '2026-10-26T17:28:00.000Z', ultima_vez: '2026-10-26T17:32:00.000Z',
    tiene_foto: false, foto_pedida: false, estado: 'pendiente', ...o,
});

describe('categorías', () => {
    it('solo falla, pantalla rota y permiso piden revisión', () => {
        expect(['falla', 'app', 'permiso', 'lento', 'sin_senal', 'dato'].filter(c => pideRevision(c as never))).toEqual(['falla', 'app', 'permiso']);
    });

    it('el color dice qué es: rojo solo para fallas de la app; permiso ámbar; señal azul; dato neutro', () => {
        expect(CATEGORIA_ERROR.falla.tono).toBe('danger');
        expect(CATEGORIA_ERROR.app.tono).toBe('danger');
        expect(CATEGORIA_ERROR.permiso.tono).toBe('warning');
        expect(CATEGORIA_ERROR.sin_senal.tono).toBe('info');
        expect(CATEGORIA_ERROR.dato.tono).toBe('neutral');
    });
});

describe('filtrarErrores', () => {
    const lista = [
        fila({ id: 1, usuario_nombre: 'Tomás Vera', pantalla_nombre: 'Inventario', obra_nombre: 'Toesca 2770' }),
        fila({ id: 2, usuario_nombre: 'Francisca Muñoz', mensaje: 'No tienes permisos para esta acción', pantalla_nombre: 'Trabajadores' }),
    ];
    it('por persona, mensaje, pantalla u obra, sin tildes', () => {
        expect(filtrarErrores(lista, 'munoz').map(e => e.id)).toEqual([2]);
        expect(filtrarErrores(lista, 'TOESCA').map(e => e.id)).toEqual([1]);
        expect(filtrarErrores(lista, 'permisos').map(e => e.id)).toEqual([2]);
        expect(filtrarErrores(lista, '  ').map(e => e.id)).toEqual([1, 2]);
    });
});

describe('navegadorCorto', () => {
    it('reconoce los navegadores comunes', () => {
        expect(navegadorCorto('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36')).toBe('Chrome 118 · Android 10');
        expect(navegadorCorto('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0')).toBe('Edge 129 · Windows');
        expect(navegadorCorto('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari · iPhone');
        expect(navegadorCorto(null)).toBe('');
    });
});

describe('porQueSinFoto', () => {
    it('explica siempre por qué no hay foto', () => {
        expect(porQueSinFoto(fila({ tiene_foto: true }))).toBe('');
        expect(porQueSinFoto(fila({ foto_borrada_en: '2026-10-20' }))).toMatch(/se borró/);
        expect(porQueSinFoto(fila({ categoria: 'permiso' }))).toMatch(/no lleva foto/);
        expect(porQueSinFoto(fila({ foto_pedida: false }))).toMatch(/tope/);
        expect(porQueSinFoto(fila({ foto_pedida: true }))).toMatch(/no alcanzó/);
    });
});

describe('textoDuracion', () => {
    it('con coma decimal bajo 10 s', () => {
        expect(textoDuracion(830)).toBe('tardó 0,8 s');
        expect(textoDuracion(18_400)).toBe('tardó 18 s');
        expect(textoDuracion(null)).toBe('');
    });
});
