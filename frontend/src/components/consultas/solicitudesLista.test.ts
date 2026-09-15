import {
    contarPorEstado, filtrar, diasDesde, tonoEspera, textoEspera, agruparPorObra, iniciales, nombreCompleto,
} from './solicitudesLista';
import type { SolicitudIngreso } from '../../types/entities';

const sol = (p: Partial<SolicitudIngreso>): SolicitudIngreso => ({
    id: 1, estado: 'pendiente', rut: '1-9', nombres: 'Juan Pablo', apellido_paterno: 'Pérez', apellido_materno: 'Soto',
    cargo_id: null, obra_id: null, empresa_id: null, fecha_ingreso: '2026-09-20', fecha_nacimiento: null, estado_civil: null,
    direccion: null, comuna: null, afp: null, salud: null, nacionalidad: null, telefono: null, cargas_familiares: null,
    talla_calzado: null, talla_pantalon: null, talla_polera: null, cuenta_rut: null, banco: null, tipo_cuenta: null,
    numero_cuenta: null, observaciones: null, solicitante_id: 5, fecha_solicitud: '2026-09-15T10:00:00', resuelto_por: null,
    fecha_resolucion: null, motivo_rechazo: null, trabajador_id: null, ...p,
});

describe('solicitudesLista', () => {
    const items = [
        sol({ id: 1, obra_id: 7, obra_nombre: 'ABATE 80' }),
        sol({ id: 2, estado: 'aprobada', obra_id: 7, obra_nombre: 'ABATE 80' }),
        sol({ id: 3, estado: 'rechazada' }),
        sol({ id: 4, obra_id: 9, obra_nombre: 'CONFERENCIA 622' }),
    ];

    it('contarPorEstado y filtrar son consistentes', () => {
        expect(contarPorEstado(items)).toEqual({ pendiente: 2, aprobada: 1, rechazada: 1, todas: 4 });
        expect(filtrar(items, 'pendiente').map(s => s.id)).toEqual([1, 4]);
        expect(filtrar(items, 'todas')).toHaveLength(4);
    });

    it('diasDesde cuenta días calendario, nunca negativo, null si inválida', () => {
        const hoy = new Date(2026, 8, 15, 9, 0);
        expect(diasDesde('2026-09-15T23:50:00', hoy)).toBe(0);
        expect(diasDesde('2026-09-14T00:10:00', hoy)).toBe(1);
        expect(diasDesde('2026-09-10T12:00:00', hoy)).toBe(5);
        expect(diasDesde('2026-09-20', hoy)).toBe(0);
        expect(diasDesde('basura', hoy)).toBeNull();
        expect(diasDesde(null, hoy)).toBeNull();
    });

    it('tonoEspera: 0-1 ok, 2-4 aviso, ≥5 crítico; textoEspera legible', () => {
        expect(tonoEspera(0)).toBe('ok');
        expect(tonoEspera(1)).toBe('ok');
        expect(tonoEspera(2)).toBe('aviso');
        expect(tonoEspera(4)).toBe('aviso');
        expect(tonoEspera(5)).toBe('critico');
        expect(tonoEspera(null)).toBe('ok');
        expect(textoEspera(0)).toBe('Enviada hoy');
        expect(textoEspera(1)).toBe('Enviada ayer');
        expect(textoEspera(3)).toBe('Hace 3 días');
        expect(textoEspera(null)).toBe('');
    });

    it('agruparPorObra conserva orden de llegada y junta "Sin obra"', () => {
        const g = agruparPorObra(items);
        expect(g.map(x => x.obra)).toEqual(['ABATE 80', 'Sin obra', 'CONFERENCIA 622']);
        expect(g[0].items.map(s => s.id)).toEqual([1, 2]);
        expect(g[1].clave).toBe('sin-obra');
    });

    it('iniciales y nombreCompleto toleran nulos', () => {
        expect(iniciales(sol({}))).toBe('PJ');
        expect(iniciales({ apellido_paterno: '', nombres: '' })).toBe('');
        expect(nombreCompleto(sol({ apellido_materno: null }))).toBe('Pérez Juan Pablo');
    });
});
