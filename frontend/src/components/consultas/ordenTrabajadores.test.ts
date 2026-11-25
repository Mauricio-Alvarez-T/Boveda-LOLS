import { ordenarPorIngresoReciente } from './ordenTrabajadores';

describe('ordenarPorIngresoReciente (idea #6 de Daphne)', () => {
    test('último ingreso arriba; a igual fecha conserva el orden alfabético; sin fecha al final', () => {
        const lista = [
            { id: 1, nombre: 'Álvarez', fecha_ingreso: '2026-11-03' },
            { id: 2, nombre: 'Bravo', fecha_ingreso: null },
            { id: 3, nombre: 'Castro', fecha_ingreso: '2026-11-20T03:00:00.000Z' },
            { id: 4, nombre: 'Díaz', fecha_ingreso: '2026-11-03' },
            { id: 5, nombre: 'Espinoza', fecha_ingreso: '2026-11-15' },
        ];
        expect(ordenarPorIngresoReciente(lista).map(w => w.id)).toEqual([3, 5, 1, 4, 2]);
    });

    test('no muta la lista recibida', () => {
        const lista = [{ fecha_ingreso: '2026-01-01' }, { fecha_ingreso: '2026-02-01' }];
        const copia = [...lista];
        ordenarPorIngresoReciente(lista);
        expect(lista).toEqual(copia);
    });
});
