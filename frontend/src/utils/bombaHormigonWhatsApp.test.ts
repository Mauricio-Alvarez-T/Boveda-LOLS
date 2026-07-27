/**
 * Tests del generador del mensaje de WhatsApp del "uso de bomba de hormigón".
 *
 * Capa FRONTEND del flujo end-to-end "nuevo uso → mensaje de WhatsApp".
 * Fija QUÉ debe decir el mensaje según los checkbox/dropdown elegidos en el
 * formulario, de modo que el mensaje SIEMPRE quede acorde a las selecciones
 * (anti-regresión). Usa la MISMA fixture que el test de backend
 * `backend/tests/bomba-hormigon.test.js`; juntos cubren creación → WhatsApp.
 */
import {
    buildBombaHormigonWhatsappText,
    BOMBA_NO_SOLICITADA,
    esBombaNoSolicitada,
    origenLabel,
    type BombaWhatsappForm,
} from './bombaHormigonWhatsApp';

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

        // Formato WhatsApp: etiqueta en *negrita*, valor en letra normal (sin monoespaciado).
        expect(msg).toContain('*Programación de hormigón*');
        expect(msg).toContain('*Obra:* Edificio Norte');
        expect(msg).toContain('*Fecha:* 24/06/2026');                       // YYYY-MM-DD → DD/MM/YYYY
        expect(msg).toContain('*Tipo de trabajo:* Coronación tapa');        // texto libre tipo_trabajo
        expect(msg).toContain('*Tipo de bomba:* Telescópica');              // dropdown, etiqueta completa
        expect(msg).toContain('*Origen:* Externa (arriendo)');              // dropdown es_externa = true
        // Vibradores: MISMO wording que el Origen de la bomba (valor en BD: 'Externa').
        expect(msg).toContain('*Vibradores:* Externa (arriendo) — 3 con sonda de 45');
        expect(msg).toContain('*Toma de muestras:* Sí');                    // checkbox true
        expect(msg).toContain('*Traslado de bombas:* No');                  // checkbox false
        expect(msg).toContain('*Hidrófugo:* Sí');                           // checkbox true
        expect(msg).toContain('*Permiso de la calzada:* No');               // checkbox false
        expect(msg).toContain('*Tipo de hormigón:* H-30');
        expect(msg).toContain('*Cantidad:* 25.5 m³');
        expect(msg).toContain('*Hora de inicio:* 08:30');
        expect(msg).toContain('*Frecuencia:* Cada 2 h');
        expect(msg).toContain('*Observaciones:* Hormigonado losa piso 3');
        // Ningún valor va en monoespaciado: en obra reclamaron esa tipografía.
        expect(msg).not.toContain('```');
        // El solicitante (usuario logueado) cierra el mensaje.
        const lineas = msg.split('\n');
        expect(lineas[lineas.length - 1]).toBe('*Solicitante:* Franco Gutiérrez');
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

        expect(msg).toContain('*Origen:* Empresa (propia)');
        // La aserción va sobre la LÍNEA de origen: "Externa (arriendo)" es wording
        // compartido con Vibradores (la fixture los tiene externos), no basta con
        // buscarlo en todo el mensaje.
        expect(msg).not.toContain('*Origen:* Externa (arriendo)');
        expect(msg).toContain('*Hidrófugo:* No');
        expect(msg).toContain('*Toma de muestras:* No');
        expect(msg).toContain('*Traslado de bombas:* Sí');
        expect(msg).toContain('*Permiso de la calzada:* Sí');
        expect(msg).toContain('*Tipo de bomba:* Estacionaria');
        expect(msg).not.toContain('Telescópica');
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
        expect(msg).toContain('*Toma de muestras:* Sí');
        expect(msg).toContain('*Origen:* Externa (arriendo)');
    });

    it('hormigonado SIN bomba: tipo y origen dicen "No solicitado"', () => {
        // Los dos son el MISMO hecho (no se pidió bomba): el tipo lo guarda y el
        // origen se deriva. Con es_externa en true (basura del form) el origen NO
        // debe decir "Externa (arriendo)": manda el "No solicitado".
        const msg = buildBombaHormigonWhatsappText(
            makeForm({ tipo_bomba: BOMBA_NO_SOLICITADA, es_externa: true }),
            'Edificio Norte',
        );

        expect(msg).toContain('*Tipo de bomba:* No solicitado');
        expect(msg).toContain('*Origen:* No solicitado');
        // Solo la línea de Origen: los VIBRADORES sí pueden ser externos aunque no
        // se pida bomba (comparten el wording "Externa (arriendo)").
        expect(msg).not.toContain('*Origen:* Externa (arriendo)');
        expect(msg).not.toContain('*Origen:* Empresa (propia)');
        // El resto de la programación sigue saliendo (hay hormigón, solo no hay bomba).
        expect(msg).toContain('*Tipo de hormigón:* H-30');
        expect(msg).toContain('*Cantidad:* 25.5 m³');
    });

    it('origenLabel: etiqueta larga para Empresa/Externa, valor crudo si es desconocido', () => {
        // La BD guarda 'Empresa'/'Externa'; la etiqueta larga es solo de presentación.
        expect(origenLabel('Empresa')).toBe('Empresa (propia)');
        expect(origenLabel('Externa')).toBe('Externa (arriendo)');
        // Registros antiguos con otro texto se muestran tal cual (no se pierden).
        expect(origenLabel('Subcontrato Pérez')).toBe('Subcontrato Pérez');
        expect(origenLabel('')).toBe('');
        expect(origenLabel(null)).toBe('');
        expect(origenLabel(undefined)).toBe('');
    });

    it('vibradores de la empresa: el mensaje dice "Empresa (propia)"', () => {
        const msg = buildBombaHormigonWhatsappText(
            makeForm({ vibradores_origen: 'Empresa', vibradores_detalle: '3 vibradores con sonda de 45' }),
            'Edificio Norte',
        );
        expect(msg).toContain('*Vibradores:* Empresa (propia) — 3 vibradores con sonda de 45');
    });

    it('esBombaNoSolicitada tolera espacios y mayúsculas, y no confunde otros tipos', () => {
        expect(esBombaNoSolicitada(BOMBA_NO_SOLICITADA)).toBe(true);
        expect(esBombaNoSolicitada('  no solicitado ')).toBe(true);
        expect(esBombaNoSolicitada('NO SOLICITADO')).toBe(true);
        expect(esBombaNoSolicitada('Estacionaria')).toBe(false);
        expect(esBombaNoSolicitada('')).toBe(false);
        expect(esBombaNoSolicitada(null)).toBe(false);
        expect(esBombaNoSolicitada(undefined)).toBe(false);
    });

    it('sin obra resuelta usa el placeholder —', () => {
        const msg = buildBombaHormigonWhatsappText(makeForm(), '—');
        expect(msg).toContain('*Obra:* —');
    });
});
