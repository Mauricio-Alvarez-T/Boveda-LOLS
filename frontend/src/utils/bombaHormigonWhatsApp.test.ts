/**
 * Tests del generador del mensaje de WhatsApp del "uso de bomba de hormigón".
 *
 * Capa FRONTEND del flujo end-to-end "nuevo uso → mensaje de WhatsApp".
 * Fija QUÉ debe decir el mensaje según los checkbox/dropdown elegidos en el
 * formulario, de modo que el mensaje SIEMPRE quede acorde a las selecciones
 * (anti-regresión). Usa la MISMA fixture que el test de backend
 * `backend/tests/bomba-hormigon.test.js`; juntos cubren creación → WhatsApp.
 */
import { buildBombaHormigonWhatsappText, type BombaWhatsappForm } from './bombaHormigonWhatsApp';

// Fixture "rica": un uso que ejercita todos los checkbox/dropdown del formulario
// con valores mixtos (algunos Sí, otros No; dropdowns no triviales).
const baseForm = (): BombaWhatsappForm => ({
    fecha: '2026-06-24',
    tipo_trabajo: 'Coronación tapa',    // texto libre "tipo de trabajo"
    tipo_bomba: 'Telescópica',          // dropdown tipo de bomba
    hora_inicio: '08:30',
    toma_muestras: true,                 // checkbox
    traslado_bombas: false,              // checkbox
    vibradores_origen: 'Externa',        // dropdown
    vibradores_detalle: '3 con sonda de 45',
    tipo_hormigon: 'H-30',
    cantidad_m3: '25.5',
    frecuencia: 'Cada 2 h',
    hidrofugo: true,                     // checkbox
    permiso_calzada: false,              // checkbox
    es_externa: true,                    // dropdown "Origen" (Externa/Empresa)
    observaciones: 'Hormigonado losa piso 3',
});

const makeForm = (overrides: Partial<BombaWhatsappForm> = {}): BombaWhatsappForm => ({ ...baseForm(), ...overrides });

describe('buildBombaHormigonWhatsappText', () => {
    it('el mensaje refleja exactamente los checkbox y dropdown seleccionados', () => {
        const msg = buildBombaHormigonWhatsappText(makeForm(), 'Edificio Norte', 'Franco Gutiérrez');

        expect(msg).toContain('*Programación de hormigón*');
        expect(msg).toContain('Obra: Edificio Norte');
        expect(msg).toContain('Fecha: 24/06/2026');                       // YYYY-MM-DD → DD/MM/YYYY
        expect(msg).toContain('Tipo de trabajo: Coronación tapa');        // texto libre tipo_trabajo
        expect(msg).toContain('Tipo: Telescópica');                       // dropdown tipo_bomba
        expect(msg).toContain('Origen: Externa (arriendo)');              // dropdown es_externa = true
        expect(msg).toContain('Vibradores: Externa — 3 con sonda de 45'); // dropdown + detalle
        expect(msg).toContain('Toma de muestras: Sí');                    // checkbox true
        expect(msg).toContain('Traslado de bombas: No');                  // checkbox false
        expect(msg).toContain('Hidrófugo: Sí');                           // checkbox true
        expect(msg).toContain('Permiso de la calzada: No');               // checkbox false
        expect(msg).toContain('Tipo de hormigón: H-30');
        expect(msg).toContain('Cantidad: 25.5 m³');
        expect(msg).toContain('Hora de inicio: 08:30');
        expect(msg).toContain('Frecuencia: Cada 2 h');
        expect(msg).toContain('Observaciones: Hormigonado losa piso 3');
        // El solicitante (usuario logueado) cierra el mensaje.
        const lineas = msg.split('\n');
        expect(lineas[lineas.length - 1]).toBe('Solicitante: Franco Gutiérrez');
    });

    it('al invertir las selecciones el mensaje cambia de forma consistente (no miente)', () => {
        const msg = buildBombaHormigonWhatsappText(
            makeForm({
                es_externa: false,
                hidrofugo: false,
                toma_muestras: false,
                traslado_bombas: true,
                permiso_calzada: true,
                tipo_bomba: 'Estacionaria',
            }),
            'Edificio Norte',
        );

        expect(msg).toContain('Origen: Empresa (propia)');
        expect(msg).not.toContain('Externa (arriendo)');
        expect(msg).toContain('Hidrófugo: No');
        expect(msg).toContain('Toma de muestras: No');
        expect(msg).toContain('Traslado de bombas: Sí');
        expect(msg).toContain('Permiso de la calzada: Sí');
        expect(msg).toContain('Tipo: Estacionaria');
        expect(msg).not.toContain('Tipo: Telescópica');
    });

    it('omite las líneas opcionales cuando no hay dato, pero conserva las obligatorias', () => {
        const msg = buildBombaHormigonWhatsappText(
            makeForm({
                tipo_trabajo: '',
                hora_inicio: '',
                tipo_hormigon: '',
                cantidad_m3: '',
                frecuencia: '',
                observaciones: '',
                vibradores_origen: '',
                vibradores_detalle: '',
            }),
            'Edificio Norte',
        );

        // Condicionales ausentes (sin solicitante: no se pasó el 3er argumento)
        expect(msg).not.toContain('Tipo de trabajo:');
        expect(msg).not.toContain('Solicitante:');
        expect(msg).not.toContain('Hora de inicio:');
        expect(msg).not.toContain('Tipo de hormigón:');
        expect(msg).not.toContain('Cantidad:');
        expect(msg).not.toContain('Frecuencia:');
        expect(msg).not.toContain('Observaciones:');
        expect(msg).not.toContain('Vibradores:');
        // Obligatorias presentes
        expect(msg).toContain('Toma de muestras: Sí');
        expect(msg).toContain('Origen: Externa (arriendo)');
    });

    it('sin obra resuelta usa el placeholder —', () => {
        const msg = buildBombaHormigonWhatsappText(makeForm(), '—');
        expect(msg).toContain('Obra: —');
    });
});
