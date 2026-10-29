import { borrarBorrador, claveBorrador, guardarBorrador, leerBorrador, ofrecerBorrador, type Almacen } from './borradorObra';
import { formVacio } from './reglas';

const memoria = (): Almacen & { datos: Map<string, string> } => {
    const datos = new Map<string, string>();
    return { datos, getItem: k => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); }, removeItem: k => { datos.delete(k); } };
};

describe('borrador de una obra (red para el botón Atrás, el gesto del teléfono y el menú)', () => {
    test('lo escrito sobrevive a salir de la obra y se ofrece al volver (solo si difiere de lo cargado)', () => {
        const a = memoria();
        const cargado = { ...formVacio(), nombre: 'Gorbea 3082', comuna: 'Santiago' };
        const escrito = { ...cargado, desafio: 'Un desafío largo de 1.200 letras…\nCon dos párrafos.' };
        guardarBorrador(7, { updated_at: '2026-10-29T13:00:00.123Z', form: escrito }, a, new Date('2026-10-29T13:05:00Z'));
        // Atrás: la obra se desmonta sin guardar. Al volver:
        const b = leerBorrador(7, a);
        expect(b).toEqual({ updated_at: '2026-10-29T13:00:00.123Z', form: escrito, guardado_at: '2026-10-29T13:05:00.000Z' });
        expect(ofrecerBorrador(b, cargado)).toBe(true);
        expect(ofrecerBorrador(b, escrito)).toBe(false);   // ya guardado: nada que ofrecer
        borrarBorrador(7, a);
        expect(leerBorrador(7, a)).toBeNull();
    });

    test('una clave por obra (y la obra nueva aparte)', () => {
        const a = memoria();
        guardarBorrador(null, { updated_at: null, form: { ...formVacio(), nombre: 'Nueva' } }, a);
        guardarBorrador(8, { updated_at: 'x', form: { ...formVacio(), nombre: 'Otra' } }, a);
        expect([...a.datos.keys()].sort()).toEqual([claveBorrador(8), claveBorrador(null)].sort());
        expect(leerBorrador(null, a)?.form.nombre).toBe('Nueva');
        expect(leerBorrador(9, a)).toBeNull();
    });

    test('sin almacenamiento, lleno o con basura: nunca lanza', () => {
        const roto: Almacen = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); }, removeItem: () => { throw new Error('x'); } };
        expect(() => guardarBorrador(7, { updated_at: null, form: formVacio() }, roto)).not.toThrow();
        expect(leerBorrador(7, roto)).toBeNull();
        expect(() => borrarBorrador(7, roto)).not.toThrow();
        expect(leerBorrador(7, null)).toBeNull();
        const a = memoria();
        a.datos.set(claveBorrador(7), '{no es json');
        expect(leerBorrador(7, a)).toBeNull();
        a.datos.set(claveBorrador(7), JSON.stringify({ form: { otra: 'forma' } }));
        expect(leerBorrador(7, a)).toBeNull();
    });
});
