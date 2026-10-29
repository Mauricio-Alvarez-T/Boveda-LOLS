import { pedirSalida, protegerSalida } from './salidaProtegida';

describe('salidaProtegida (menú lateral con cambios sin guardar)', () => {
    test('sin nadie anotado el menú navega; anotada, la pantalla recibe el destino y el menú no navega', () => {
        expect(pedirSalida('/obras')).toBe(false);
        const pedidos: string[] = [];
        const soltar = protegerSalida(d => pedidos.push(d));
        expect(pedirSalida('/sitio-web?filtro=pendientes')).toBe(true);
        expect(pedidos).toEqual(['/sitio-web?filtro=pendientes']);
        soltar();
        expect(pedirSalida('/obras')).toBe(false);
    });

    test('soltar una anotación vieja no suelta la nueva', () => {
        const vieja = protegerSalida(() => {});
        const nuevos: string[] = [];
        const nueva = protegerSalida(d => nuevos.push(d));
        vieja();
        expect(pedirSalida('/x')).toBe(true);
        expect(nuevos).toEqual(['/x']);
        nueva();
    });
});
