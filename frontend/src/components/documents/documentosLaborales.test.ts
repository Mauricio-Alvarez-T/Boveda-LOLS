import {
    KIT_INGRESO, contarObligatorios, docsSubidos, eppItemsDesdeTexto, buildKitPayload,
    buildAmonestacionPayload, validarAmonestacion, faltanDesdeError, AMONESTACION_OTRO, hoyYmd,
    faltanDatosContrato, buildDatosPersonalesPayload, CAMPOS_CONTRATO, validarDatosContrato, camposFaltantesDesdeError,
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

    it('faltanDatosContrato: detecta los campos que la primera cláusula imprime', () => {
        const completo = { nacionalidad: 'Chilena', estado_civil: 'Casado/a', fecha_nacimiento: '1995-12-03', direccion: 'Av. España 505', comuna: 'Santiago' };
        expect(faltanDatosContrato(completo)).toEqual([]);
        expect(faltanDatosContrato({})).toEqual([...CAMPOS_CONTRATO]);
        // Dirección sin comuna imprimiría media dirección.
        expect(faltanDatosContrato({ ...completo, comuna: null })).toEqual(['comuna']);
        // Un valor en blanco no cuenta como dato.
        expect(faltanDatosContrato({ ...completo, nacionalidad: '   ' })).toEqual(['nacionalidad']);
        expect(faltanDatosContrato(null)).toEqual([]);
    });

    it('buildDatosPersonalesPayload: solo campos completados, nunca nulls ni vacíos', () => {
        const out = buildDatosPersonalesPayload({ nacionalidad: 'Chilena', comuna: '  Maipú  ', estado_civil: '', fecha_nacimiento: undefined });
        expect(out).toEqual({ nacionalidad: 'Chilena', comuna: 'Maipú' });
        // Clave: un PUT con nulls borraría datos ya cargados (el CRUD conserva null).
        expect(Object.values(out).every(v => typeof v === 'string' && v !== '')).toBe(true);
        expect(buildDatosPersonalesPayload({})).toEqual({});
        expect(Object.values(buildDatosPersonalesPayload({ direccion: '   ' }))).toHaveLength(0);
    });

    it('validarDatosContrato: exige lo que falta, rechaza fecha futura y textos largos', () => {
        expect(validarDatosContrato(['nacionalidad', 'fecha_nacimiento'], { nacionalidad: '', fecha_nacimiento: '2099-01-01' }, '2026-09-11'))
            .toEqual({ nacionalidad: 'Completa este dato', fecha_nacimiento: 'No puede ser una fecha futura' });
        expect(validarDatosContrato(['nacionalidad'], { nacionalidad: 'Chilena' })).toEqual({});
        // Un campo que no falta no se valida aunque venga vacío.
        expect(validarDatosContrato(['nacionalidad'], { nacionalidad: 'Chilena', comuna: '' })).toEqual({});
        expect(validarDatosContrato(['nacionalidad'], { nacionalidad: 'x'.repeat(61) }).nacionalidad).toMatch(/Máximo 60/);
    });

    it('camposFaltantesDesdeError: el servidor manda las claves de columna', () => {
        expect(camposFaltantesDesdeError({ response: { data: { code: 'DATOS_FALTANTES', campos_trabajador: ['nacionalidad', 'comuna'] } } }))
            .toEqual(['nacionalidad', 'comuna']);
        // 409 por representante o sueldo: no viene la lista.
        expect(camposFaltantesDesdeError({ response: { data: { code: 'DATOS_FALTANTES', faltan: ['sueldo'] } } })).toBeNull();
        expect(camposFaltantesDesdeError({ response: { data: { campos_trabajador: ['inventado'] } } })).toBeNull();
        expect(camposFaltantesDesdeError(new Error('net'))).toBeNull();
    });
});
