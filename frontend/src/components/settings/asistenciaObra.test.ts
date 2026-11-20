import { cuerpoAsistencia, diaCorto, etiquetaChip, soloDia, valorAsistencia } from './asistenciaObra';

const HOY = '2026-11-20';

describe('asistenciaObra', () => {
    test('estado de la obra: preparando, desde una fecha o sin asistencia', () => {
        expect(valorAsistencia({ participa_asistencia: true, asistencia_desde: null }, HOY)).toEqual({ estado: 'preparacion', fecha: HOY });
        expect(valorAsistencia({ participa_asistencia: true, asistencia_desde: '2026-11-16T03:00:00.000Z' }, HOY))
            .toEqual({ estado: 'desde', fecha: '2026-11-16' });
        // Sin el campo (obra vieja en caché) participa: queda en preparación.
        expect(valorAsistencia({}, HOY).estado).toBe('preparacion');
        expect(valorAsistencia({ participa_asistencia: false, asistencia_desde: '2026-11-16' }, HOY))
            .toEqual({ estado: 'no', fecha: '2026-11-16' });
    });

    test('lo que se manda al guardar', () => {
        expect(cuerpoAsistencia({ estado: 'preparacion', fecha: HOY })).toEqual({ participa_asistencia: true, asistencia_desde: null });
        expect(cuerpoAsistencia({ estado: 'desde', fecha: '2026-11-16' })).toEqual({ participa_asistencia: true, asistencia_desde: '2026-11-16' });
        expect(cuerpoAsistencia({ estado: 'no', fecha: HOY })).toEqual({ participa_asistencia: false });
    });

    test('textos del chip', () => {
        expect(diaCorto('2026-11-16')).toBe('16 nov');
        expect(etiquetaChip({ estado: 'desde', fecha: '2026-11-16' })).toBe('Asis · desde 16 nov');
        expect(etiquetaChip({ estado: 'preparacion', fecha: HOY })).toBe('Asis · preparando');
        expect(etiquetaChip({ estado: 'no', fecha: HOY })).toBe('Asis');
        expect(soloDia('basura')).toBe('');
    });
});
