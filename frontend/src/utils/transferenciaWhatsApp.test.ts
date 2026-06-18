/**
 * Tests del generador del respaldo de WhatsApp de transferencias.
 * Fijan QUÉ debe decir el mensaje en cada estado × tipo de ítem × cambio, para
 * que los cambios del ciclo queden SIEMPRE plasmados (anti-regresión del respaldo).
 * Casos clave: recibido 0 (no esconder faltante), ítem cortado a 0 por aprobador,
 * custom recibido en "recibida" con discrepancia, y estados terminales (rechazo/cancelación).
 */
import { buildTransferenciaWhatsappText, type WhatsappCustomItem } from './transferenciaWhatsApp';
import type { Transferencia, TransferenciaItem } from '../types/entities';

// fmtFechaHora trae date-fns (ESM); lo mockeamos — no es lo que probamos acá.
jest.mock('./fechas', () => ({ fmtFechaHora: () => '01/01/2026 10:00' }));

const makeT = (estado: Transferencia['estado'], extra: Partial<Transferencia> = {}): Transferencia =>
    ({ codigo: 'TRF-202601-0001', estado, fecha_solicitud: '2026-01-01T10:00:00', ...extra } as unknown as Transferencia);

const cat = (o: Partial<TransferenciaItem>): TransferenciaItem =>
    ({ id: 1, item_id: 1, item_descripcion: 'Cemento', cantidad_solicitada: 0, cantidad_enviada: null, cantidad_recibida: null, observacion: null, ...o } as unknown as TransferenciaItem);

const build = (estado: Transferencia['estado'], items: TransferenciaItem[], itemsCustom: WhatsappCustomItem[] = [], extra: Partial<Transferencia> = {}) =>
    buildTransferenciaWhatsappText({ t: makeT(estado, extra), items, itemsCustom, estadoLabel: estado, origen: 'Bodega Central', destino: 'Obra A' });

describe('buildTransferenciaWhatsappText', () => {
    it('pendiente: muestra la cantidad solicitada', () => {
        const msg = build('pendiente', [cat({ cantidad_solicitada: 3 })]);
        expect(msg).toContain('• 3 — Cemento');
    });

    it('recibida con faltante TOTAL (recibida=0): muestra 0, NO la enviada', () => {
        const msg = build('recibida', [cat({ cantidad_solicitada: 5, cantidad_enviada: 5, cantidad_recibida: 0 })]);
        expect(msg).toContain('• 0 — Cemento');          // el 0 real se muestra (bug falsy-|| corregido)
        expect(msg).toContain('Enviadas: 5 (-5)');         // discrepancia anotada
        expect(msg).not.toContain('• 5 — Cemento');        // NO miente con la enviada
    });

    it('aprobada con ítem cortado a 0 por el aprobador: muestra 0, NO la solicitada', () => {
        const msg = build('aprobada', [cat({ cantidad_solicitada: 5, cantidad_enviada: 0 })]);
        expect(msg).toContain('Items enviados');
        expect(msg).toContain('• 0 — Cemento');            // el recorte a 0 queda plasmado
        expect(msg).not.toContain('• 5 — Cemento');
    });

    it('recepcion_parcial: muestra enviada + recibidas/faltan', () => {
        const msg = build('recepcion_parcial', [cat({ cantidad_solicitada: 10, cantidad_enviada: 10, cantidad_recibida: 4 })]);
        expect(msg).toContain('• 10 — Cemento');
        expect(msg).toContain('Recibidas: 4 · Faltan: 6');
    });

    it('custom "comprar" en recibida: muestra lo RECIBIDO + discrepancia vs aprobado', () => {
        const custom: WhatsappCustomItem = { descripcion: 'Guantes', cantidad: 12, cantidad_aprobada: 10, cantidad_recibida: 7, aprobado: true, fuente: 'comprar' };
        const msg = build('recibida', [], [custom]);
        expect(msg).toContain('Por comprar (1)');
        expect(msg).toContain('• 7 — Guantes');            // recibido, no aprobado
        expect(msg).toContain('Aprobadas: 10 (-3)');       // discrepancia del custom (antes ausente)
    });

    it('custom: omite los que el aprobador quitó (aprobado=false)', () => {
        const msg = build('aprobada', [], [
            { descripcion: 'Casco', cantidad: 2, aprobado: false, fuente: 'comprar' },
            { descripcion: 'Botas', cantidad: 3, aprobado: true, fuente: 'comprar' },
        ]);
        expect(msg).not.toContain('Casco');
        expect(msg).toContain('• 3 — Botas');
    });

    it('rechazada: incluye motivo y quién rechazó', () => {
        const msg = build('rechazada', [cat({ cantidad_solicitada: 1 })], [], {
            observaciones_rechazo: 'No hay stock', rechazado_por_nombre: 'Juan Pérez',
        });
        expect(msg).toContain('RECHAZADA');
        expect(msg).toContain('Motivo:* No hay stock');
        expect(msg).toContain('Rechazada por: Juan Pérez');
    });

    it('cancelada: indica cancelación y quién la hizo', () => {
        const msg = build('cancelada', [cat({ cantidad_solicitada: 1 })], [], { cancelado_por_nombre: 'Ana Soto' });
        expect(msg).toContain('CANCELADA');
        expect(msg).toContain('Cancelada por: Ana Soto');
    });
});
