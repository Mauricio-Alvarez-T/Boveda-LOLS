/**
 * Tests del mensaje WhatsApp "solicitud de ingreso pendiente" (2026-09-08).
 * Debe llevar nombre, obra y fecha de contratación; sin emojis; footer del repo.
 */
import { buildSolicitudIngresoMessage, fechaContratacion, nombreCompletoSolicitud } from './solicitudIngresoWhatsApp';

const base = {
    nombres: 'Juan Andrés',
    apellido_paterno: 'Pérez',
    apellido_materno: 'Cotapos',
    obra_nombre: 'TOESCA',
    fecha_ingreso: '2026-09-15',
    solicitante_nombre: 'Pedro Supervisor',
};

describe('buildSolicitudIngresoMessage', () => {
    test('incluye título, nombre completo, obra y fecha dd-mm-aaaa', () => {
        const msg = buildSolicitudIngresoMessage(base);
        expect(msg).toContain('*Solicitud de ingreso de trabajador*');
        expect(msg).toContain('Pendiente de revisión por administración.');
        expect(msg).toContain('- Trabajador: Juan Andrés Pérez Cotapos');
        expect(msg).toContain('- Obra: TOESCA');
        expect(msg).toContain('- Fecha de contratación: 15-09-2026');
        expect(msg).toContain('- Solicitado por: Pedro Supervisor');
        expect(msg.trim().endsWith('_Generado con Bóveda LOLS_')).toBe(true);
    });

    test('sin apellido materno ni solicitante: no deja espacios dobles ni línea vacía de solicitante', () => {
        const msg = buildSolicitudIngresoMessage({ ...base, apellido_materno: null, solicitante_nombre: null });
        expect(msg).toContain('- Trabajador: Juan Andrés Pérez\n');
        expect(msg).not.toContain('Solicitado por');
    });

    test('orden: trabajador → obra → fecha', () => {
        const msg = buildSolicitudIngresoMessage(base);
        const i1 = msg.indexOf('Trabajador:');
        const i2 = msg.indexOf('Obra:');
        const i3 = msg.indexOf('Fecha de contratación:');
        expect(i1).toBeLessThan(i2);
        expect(i2).toBeLessThan(i3);
    });

    test('sin emojis (compatibilidad con el redirect de WhatsApp)', () => {
        const msg = buildSolicitudIngresoMessage(base);
        expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(msg)).toBe(false);
    });

    test('defensivo: obra/fecha ausentes', () => {
        const msg = buildSolicitudIngresoMessage({ ...base, obra_nombre: null, fecha_ingreso: null });
        expect(msg).toContain('- Obra: (sin obra)');
        expect(msg).toContain('- Fecha de contratación: (sin fecha)');
    });
});

describe('fechaContratacion', () => {
    test('acepta YYYY-MM-DD, ISO con hora y Date', () => {
        expect(fechaContratacion('2026-09-15')).toBe('15-09-2026');
        expect(fechaContratacion('2026-09-15T03:00:00.000Z')).toBe('15-09-2026');
        expect(fechaContratacion(new Date('2026-09-15T12:00:00Z'))).toBe('15-09-2026');
        expect(fechaContratacion(null)).toBe('');
    });
});

describe('nombreCompletoSolicitud', () => {
    test('recorta espacios y omite partes vacías', () => {
        expect(nombreCompletoSolicitud({ nombres: ' Ana ', apellido_paterno: 'Soto', apellido_materno: '  ' })).toBe('Ana Soto');
    });
});
