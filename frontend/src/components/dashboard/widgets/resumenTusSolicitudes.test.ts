import { resumenTusSolicitudes } from './resumenTusSolicitudes';
import type { SolicitudIngreso } from '../../../types/entities';

const sol = (id: number, extra: Partial<SolicitudIngreso>) => ({
    id, estado: 'pendiente', nombres: 'Bruno', apellido_paterno: 'Ficticio', apellido_materno: null, cargo_nombre: 'Jornal', obra_nombre: 'Obra Sur',
    fecha_solicitud: '2026-10-21 09:00:00', fecha_resolucion: null, motivo_rechazo: null, ...extra,
} as unknown as SolicitudIngreso);
const HOY = new Date(2026, 9, 21, 12);

describe('resumenTusSolicitudes', () => {
    it('sin solicitudes: verde y nada', () => {
        expect(resumenTusSolicitudes([], HOY)).toMatchObject({ pendientes: 0, tono: 'verde', filas: [] });
    });

    it('ordena rechazadas, pendientes (la más antigua primero) y aprobadas recientes; tope 4 en la tarjeta', () => {
        const r = resumenTusSolicitudes([
            sol(1, { fecha_solicitud: '2026-10-21 08:00:00' }),
            sol(2, { fecha_solicitud: '2026-10-18 08:00:00', nombres: 'Hugo', apellido_paterno: 'Modelo' }),
            sol(3, { estado: 'rechazada', fecha_resolucion: '2026-10-20 10:00:00', motivo_rechazo: 'el RUT no coincide con el carnet' }),
            sol(4, { estado: 'aprobada', fecha_resolucion: '2026-10-20 10:00:00' }),
            sol(5, { estado: 'aprobada', fecha_resolucion: '2026-08-01 10:00:00' }),
            sol(6, { estado: 'aprobada', fecha_resolucion: '2026-10-19 10:00:00' }),
        ] as SolicitudIngreso[], HOY);
        expect(r.tono).toBe('rojo');
        expect(r.pendientes).toBe(2);
        expect(r.filas.map(f => f.id)).toEqual([3, 2, 1, 4]);
        expect(r.filas[0]).toMatchObject({ nota: 'Motivo: el RUT no coincide con el carnet', chip: 'rechazada' });
        expect(r.filas[1]).toMatchObject({ nombre: 'Modelo Hugo', chip: '3 días', tono: 'ambar', nota: 'Enviada el dom 18 · lleva 3 días' });
        expect(r.filas[2]).toMatchObject({ chip: 'hoy', tono: 'neutro', nota: 'Enviada hoy' });
        expect(r.grupos.aprobada.map(f => f.id)).toEqual([4, 6]);
        expect(r.grupos.aprobada[0].nota).toBe('Aprobada el mar 20: ya es trabajador');
    });

    it('solo pendientes: ámbar', () => {
        expect(resumenTusSolicitudes([sol(1, {})], HOY).tono).toBe('ambar');
    });
});
