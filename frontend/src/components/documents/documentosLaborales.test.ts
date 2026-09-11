import {
    KIT_INGRESO, contarObligatorios, docsSubidos, eppItemsDesdeTexto, buildKitPayload,
    buildAmonestacionPayload, validarAmonestacion, faltanDesdeError, AMONESTACION_OTRO, hoyYmd,
} from './documentosLaborales';

describe('documentosLaborales (plan Gestiones B2)', () => {
    it('contarObligatorios: cuenta TIPOS obligatorios distintos; los generados (obligatorio=0) no inflan; legacy cae al conteo antiguo', () => {
        const docs = [
            { id: 1, activo: true, tipo_documento_id: 1, tipo_obligatorio: 1, origen: 'subido' as const },
            { id: 2, activo: true, tipo_documento_id: 1, tipo_obligatorio: 1, origen: 'subido' as const },   // mismo tipo, no suma
            { id: 3, activo: true, tipo_documento_id: 9, tipo_obligatorio: 0, origen: 'generado' as const },
            { id: 4, activo: false, tipo_documento_id: 2, tipo_obligatorio: 1, origen: 'subido' as const }, // inactivo
            { id: 5, activo: true, tipo_documento_id: 3, tipo_obligatorio: true, origen: 'subido' as const },
        ];
        expect(contarObligatorios(docs)).toBe(2);
        expect(contarObligatorios([{ activo: true }, { activo: true }, { activo: false }])).toBe(2);
        expect(contarObligatorios([])).toBe(0);
    });

    it('docsSubidos excluye los generados', () => {
        expect(docsSubidos([{ activo: true, origen: 'generado' as const }, { activo: true, origen: 'subido' as const }, { activo: true }])).toHaveLength(2);
    });

    it('eppItemsDesdeTexto: por línea o coma, sin vacíos', () => {
        expect(eppItemsDesdeTexto('Casco\n Guantes \n\nArnés,Zapatos')).toEqual(['Casco', 'Guantes', 'Arnés', 'Zapatos']);
        expect(eppItemsDesdeTexto('')).toEqual([]);
    });

    it('buildKitPayload: orden del kit, solo campos relevantes a lo marcado', () => {
        expect(buildKitPayload({ documentos: ['DAS', 'CONTRATO', 'AMONESTACION'], dias_plazo: '20', epp_texto: 'casco', duracion_charla: '45 min' }))
            .toEqual({ documentos: ['CONTRATO', 'DAS'], dias_plazo: 20 });
        expect(buildKitPayload({ documentos: [...KIT_INGRESO], fecha_documento: '2026-09-11', dias_plazo: 0, epp_texto: 'casco\nguantes', duracion_charla: ' 45 minutos ' }))
            .toEqual({ documentos: [...KIT_INGRESO], fecha_documento: '2026-09-11', epp_items: ['casco', 'guantes'], duracion_charla: '45 minutos' });
        expect(buildKitPayload({ documentos: [] })).toEqual({ documentos: [] });
    });

    it('buildAmonestacionPayload: "Otro" no viaja como motivo; vacíos fuera', () => {
        expect(buildAmonestacionPayload({ fechaCarta: '2026-09-11', fechaInfraccion: '', motivo: AMONESTACION_OTRO, detalle: ' Faltó ' }))
            .toEqual({ codigo: 'AMONESTACION', fecha_carta: '2026-09-11', detalle: 'Faltó' });
        expect(buildAmonestacionPayload({ fechaCarta: '2026-09-11', fechaInfraccion: '2026-09-10', motivo: 'Inasistencia injustificada' }))
            .toEqual({ codigo: 'AMONESTACION', fecha_carta: '2026-09-11', fecha_infraccion: '2026-09-10', motivo: 'Inasistencia injustificada' });
    });

    it('validarAmonestacion', () => {
        expect(validarAmonestacion({ fechaCarta: '' })).toMatch(/fecha de la carta/);
        expect(validarAmonestacion({ fechaCarta: '2026-09-11', fechaInfraccion: '2026-09-12' })).toMatch(/posterior/);
        expect(validarAmonestacion({ fechaCarta: '2026-09-11', motivo: AMONESTACION_OTRO, detalle: ' ' })).toMatch(/detalle/);
        expect(validarAmonestacion({ fechaCarta: '2026-09-11', motivo: 'x' })).toBeNull();
    });

    it('faltanDesdeError solo para 409 DATOS_FALTANTES', () => {
        expect(faltanDesdeError({ response: { data: { code: 'DATOS_FALTANTES', faltan: ['representante legal'] } } })).toEqual(['representante legal']);
        expect(faltanDesdeError({ response: { data: { error: 'x' } } })).toBeNull();
        expect(faltanDesdeError(new Error('net'))).toBeNull();
    });

    it('hoyYmd', () => {
        expect(hoyYmd(new Date(2026, 8, 1))).toBe('2026-09-01');
    });
});
