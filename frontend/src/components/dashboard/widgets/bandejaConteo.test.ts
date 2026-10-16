import { contarBandeja } from './bandejaConteo';

const fila = (severity: 'critical' | 'warning' | 'info') => ({ severity });

describe('contarBandeja (encabezado de la Bandeja del día)', () => {
    it('cuenta los documentos físicos: solo con lotes pendientes la bandeja NO está vacía', () => {
        const docsFisicos = [fila('warning'), fila('warning')];
        expect(contarBandeja([], 0, [[], [], docsFisicos, []])).toEqual({ total: 2, criticas: 0 });
    });

    it('los críticos de cualquier grupo externo suman a "críticas" (alertas B7 incluidas)', () => {
        const vehiculos = [fila('critical'), fila('warning')];
        const docsFisicos = [fila('critical')];
        const inventario = [fila('info')];
        expect(contarBandeja([fila('critical'), fila('info')], 0, [vehiculos, [], docsFisicos, inventario]))
            .toEqual({ total: 6, criticas: 3 });
    });

    it('la fila sintética de trabajadores sin documentos suma 1 al total y nunca es crítica', () => {
        expect(contarBandeja([], 7, [])).toEqual({ total: 1, criticas: 0 });
        expect(contarBandeja([], 0, [])).toEqual({ total: 0, criticas: 0 });
    });
});
