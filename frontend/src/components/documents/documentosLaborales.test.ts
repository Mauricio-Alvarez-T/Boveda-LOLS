import {
    KIT_INGRESO, contarObligatorios, docsSubidos, eppItemsDesdeTexto, buildKitPayload,
    buildAmonestacionPayload, validarAmonestacion, faltanDesdeError, AMONESTACION_OTRO, hoyYmd,
    faltanDatosContrato, buildDatosPersonalesPayload, CAMPOS_CONTRATO, validarDatosContrato, camposFaltantesDesdeError,
    conceptoDiasTrabajados, lineasValidas, totalFiniquito, validarFiniquito, buildFiniquitoPayload, workerDesdeSolicitud,
    avisoEnlaceFiniquito, MAX_LINEAS_FINIQUITO, LUGAR_FIRMA_DEFAULT,
} from './documentosLaborales';
import type { SolicitudIngreso } from '../../types/entities';

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

describe('finiquito (plan Gestiones B5)', () => {
    const haberes = [{ concepto: 'Días trabajados septiembre 2026', monto: 450000 }];
    const form = { fechaFiniquito: '2026-09-14', lugarFirma: LUGAR_FIRMA_DEFAULT, haberes, descuentos: [] };
    const ctx = { fechaDesvinculacion: '2026-09-10', causalSinArticulo: false };

    it('conceptoDiasTrabajados: mes y año de la baja; sin fecha válida, solo el rótulo', () => {
        expect(conceptoDiasTrabajados('2026-09-10')).toBe('Días trabajados septiembre 2026');
        expect(conceptoDiasTrabajados('2026-01-31T03:00:00.000Z')).toBe('Días trabajados enero 2026');
        expect(conceptoDiasTrabajados(null)).toBe('Días trabajados');
        expect(conceptoDiasTrabajados('basura')).toBe('Días trabajados');
    });

    it('lineasValidas y totalFiniquito: recorta, descarta vacíos/negativos/decimales, resta descuentos', () => {
        expect(lineasValidas([{ concepto: ' x ', monto: 100 }, { concepto: '', monto: 5 }, { concepto: 'y', monto: -1 }, { concepto: 'z', monto: 1.5 }]))
            .toEqual([{ concepto: 'x', monto: 100 }]);
        expect(totalFiniquito({ haberes, descuentos: [{ concepto: 'Anticipo', monto: 50000 }] })).toBe(400000);
        expect(totalFiniquito({ haberes: [], descuentos: [] })).toBe(0);
    });

    it('validarFiniquito: fecha, orden respecto de la baja, haberes, tope de líneas, total negativo, causal legal', () => {
        expect(validarFiniquito(form, ctx)).toBeNull();
        expect(validarFiniquito({ ...form, fechaFiniquito: '' }, ctx)).toMatch(/fecha del finiquito/);
        expect(validarFiniquito({ ...form, fechaFiniquito: '2026-09-09' }, ctx)).toMatch(/anterior a la desvinculación \(2026-09-10\)/);
        expect(validarFiniquito({ ...form, fechaFiniquito: '2026-09-10' }, ctx)).toBeNull();
        expect(validarFiniquito({ ...form, haberes: [{ concepto: '', monto: 0 }] }, ctx)).toMatch(/al menos una línea/);
        // Estado inicial del modal (concepto precargado, monto 0): no se emite un finiquito de $0.
        expect(validarFiniquito({ ...form, haberes: [{ concepto: 'Días trabajados septiembre 2026', monto: 0 }] }, ctx)).toMatch(/mayor a cero/);
        expect(validarFiniquito({ ...form, haberes: [...haberes, { concepto: '', monto: 1000 }] }, ctx)).toMatch(/monto pero sin concepto/);
        expect(validarFiniquito({ ...form, descuentos: [{ concepto: 'Anticipo', monto: 450001 }] }, ctx)).toMatch(/descuentos no pueden superar/);
        const once = Array.from({ length: MAX_LINEAS_FINIQUITO + 1 }, (_, i) => ({ concepto: `L${i}`, monto: 1 }));
        expect(validarFiniquito({ ...form, haberes: once }, ctx)).toMatch(/Máximo 10/);
        expect(validarFiniquito({ ...form, lugarFirma: 'x'.repeat(101) }, ctx)).toMatch(/100 caracteres/);
        // Baja registrada sin artículo (operativa LOLS): hay que elegir la legal.
        expect(validarFiniquito(form, { ...ctx, causalSinArticulo: true })).toMatch(/causal del Código del Trabajo/);
        expect(validarFiniquito({ ...form, causalCodigo: 'VENCIMIENTO_PLAZO' }, { ...ctx, causalSinArticulo: true })).toBeNull();
        // Sin fecha de baja conocida no se valida el orden (el backend lo hará).
        expect(validarFiniquito({ ...form, fechaFiniquito: '2020-01-01' }, { causalSinArticulo: false })).toBeNull();
    });

    it('buildFiniquitoPayload: codigo FINIQUITO, solo líneas válidas, sin claves vacías, lugar solo si no es el default', () => {
        expect(buildFiniquitoPayload(form)).toEqual({ codigo: 'FINIQUITO', fecha_finiquito: '2026-09-14', haberes });
        const p = buildFiniquitoPayload({ ...form, lugarFirma: ' Cerrillos ', descuentos: [{ concepto: 'Anticipo', monto: 50000 }, { concepto: '', monto: 0 }], causalCodigo: 'RENUNCIA' });
        expect(p).toEqual({
            codigo: 'FINIQUITO', fecha_finiquito: '2026-09-14', haberes, lugar_firma: 'Cerrillos',
            descuentos: [{ concepto: 'Anticipo', monto: 50000 }], causal_codigo: 'RENUNCIA',
        });
        expect(Object.keys(buildFiniquitoPayload({ ...form, causalCodigo: '  ' }))).not.toContain('causal_codigo');
    });

    it('workerDesdeSolicitud: claves personales PRESENTES (null) para que el kit no vuelva a pedir la ficha; activo=true', () => {
        const s = {
            id: 41, estado: 'aprobada', rut: '12.345.678-5', nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: null,
            cargo_id: 2, cargo_nombre: 'Jornal', obra_id: 7, obra_nombre: 'Edificio Central', empresa_id: 1, empresa_nombre: 'LOLS',
            fecha_ingreso: '2026-09-01', fecha_nacimiento: '1995-12-03T03:00:00.000Z', estado_civil: null, direccion: 'Av. España 505', comuna: null,
            afp: null, salud: null, nacionalidad: 'Chilena', telefono: null, cargas_familiares: null, talla_calzado: null, talla_pantalon: null, talla_polera: null,
            cuenta_rut: null, banco: null, tipo_cuenta: null, numero_cuenta: null, observaciones: null, solicitante_id: 9, fecha_solicitud: '2026-09-01',
            resuelto_por: 3, fecha_resolucion: '2026-09-14', motivo_rechazo: null, trabajador_id: 5101,
        } as SolicitudIngreso;
        const w = workerDesdeSolicitud(s, 5101);
        expect(w).toMatchObject({ id: 5101, nombres: 'Juan', apellido_paterno: 'Pérez', rut: '12.345.678-5', cargo_nombre: 'Jornal', empresa_nombre: 'LOLS', activo: true });
        expect(w.fecha_nacimiento).toBe('1995-12-03');
        // `undefined` haría que EmitirKitModal pida GET /trabajadores/:id (trabajadores.ver); null = "sé que falta".
        expect(w).toHaveProperty('nacionalidad', 'Chilena');
        expect(w).toHaveProperty('estado_civil', null);
        expect(w).toHaveProperty('comuna', null);
        expect(faltanDatosContrato(w)).toEqual(['estado_civil', 'comuna']);
    });

    it('avisoEnlaceFiniquito: solo FINIQUITO con enlazado === false', () => {
        expect(avisoEnlaceFiniquito({ tipo_codigo: 'FINIQUITO', enlazado: false })).toMatch(/no se pudo enlazar/);
        expect(avisoEnlaceFiniquito({ tipo_codigo: 'FINIQUITO', enlazado: true })).toBeNull();
        expect(avisoEnlaceFiniquito({ tipo_codigo: 'FINIQUITO' })).toBeNull();
        expect(avisoEnlaceFiniquito({ tipo_codigo: 'AMONESTACION', enlazado: false })).toBeNull();
        expect(avisoEnlaceFiniquito(null)).toBeNull();
    });
});
