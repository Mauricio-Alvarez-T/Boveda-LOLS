import { faltanteReason } from './faltanteReason';

describe('faltanteReason', () => {
    it('sin stock disponible → "Sin stock"', () => {
        expect(faltanteReason({ cantidad_solicitada: 5, stock_disponible: 0 }))
            .toEqual({ kind: 'sin_stock', label: 'Sin stock' });
    });

    it('stock parcial (menos que lo pedido) → "Solo N disponible"', () => {
        expect(faltanteReason({ cantidad_solicitada: 5, stock_disponible: 2 }))
            .toEqual({ kind: 'parcial', label: 'Solo 2 disponible' });
    });

    it('stock suficiente pero se envió menos → "Ajuste manual"', () => {
        // stock alcanza para lo pedido; el faltante es decisión del aprobador.
        expect(faltanteReason({ cantidad_solicitada: 5, stock_disponible: 10 }))
            .toEqual({ kind: 'manual', label: 'Ajuste manual' });
    });

    it('stock exactamente igual a lo pedido → "Ajuste manual" (el techo no obliga el faltante)', () => {
        expect(faltanteReason({ cantidad_solicitada: 5, stock_disponible: 5 }))
            .toEqual({ kind: 'manual', label: 'Ajuste manual' });
    });

    it('stock negativo (defensivo) → "Sin stock"', () => {
        expect(faltanteReason({ cantidad_solicitada: 3, stock_disponible: -1 }).kind).toBe('sin_stock');
    });
});
