import {
    abreFormulario, ariaSemaforo, diasCalendario, eventosFlota, fechaConDia, fechaCorta, hoyIso, textoPlazo, urgenteDeEvento, bajadaVehiculo, fichasVehiculos, fraseVehiculo, mensajeWhatsApp, ordenSemaforo, PAPELES_META, papelDesdeUrl,
    pildora, primerNombre, rutaSubir, textoAvisar, tipoDocumentoDePapel, tituloVehiculo, tonoCelda, tonoFicha, urgentes,
    type PapelApi, type PapelClave, type PapelOtroApi, type VehiculoPapelesApi,
} from './fichasVehiculosInicio';

const papel = (clave: PapelClave, extra: Partial<PapelApi> = {}): PapelApi => ({
    clave, estado: 'vigente', categoria: 'documento', subtipo: null, registro_id: 1,
    fecha_vencimiento: '2027-06-01', dias_restantes: 200, avisa: true, ...extra,
});
const vencido = (clave: PapelClave, dias: number, extra: Partial<PapelApi> = {}) => papel(clave, { estado: 'vencido', dias_restantes: dias, ...extra });
const porVencer = (clave: PapelClave, dias: number, extra: Partial<PapelApi> = {}) => papel(clave, { estado: 'por_vencer', dias_restantes: dias, ...extra });
const otro = (nombre: string, dias: number, extra: Partial<PapelOtroApi> = {}): PapelOtroApi => ({
    categoria: 'documento', subtipo: null, nombre, registro_id: 9, fecha_vencimiento: '2026-11-01',
    dias_restantes: dias, estado: dias < 0 ? 'vencido' : 'por_vencer', ...extra,
});

const veh = (extra: Partial<VehiculoPapelesApi> = {}): VehiculoPapelesApi => ({
    vehiculo_id: 7, patente: 'KDPW-31', marca: 'Toyota', modelo: 'Hilux', tipo: 'camioneta',
    empresa_id: 2, empresa_nombre: 'LOLS', conductor_id: 4, conductor_nombre: 'Óscar Núñez',
    papeles: PAPELES_META.map(m => papel(m.clave)), otros: [],
    requiere_accion: 0, vencidos: 0, peor_dias: null, ...extra,
});
/** Los cinco al día salvo los que se pasan. */
const con = (...cambios: PapelApi[]) => PAPELES_META.map(m => cambios.find(c => c.clave === m.clave) ?? papel(m.clave));

describe('fichasVehiculosInicio', () => {
    test('los cinco papeles en el orden del semáforo y su tipo de formulario en Vehículos', () => {
        expect(PAPELES_META.map(m => [m.clave, m.nombre, m.corto, m.conArticulo])).toEqual([
            ['permiso', 'Permiso de circulación', 'Permiso', 'el permiso de circulación'],
            ['poliza', 'Póliza de seguro', 'Póliza', 'la póliza de seguro'],
            ['tecnica', 'Revisión técnica', 'Técnica', 'la revisión técnica'],
            ['gases', 'Revisión de gases', 'Gases', 'la revisión de gases'],
            ['mantencion', 'Mantención', 'Mant.', 'la mantención'],
        ]);
        expect(PAPELES_META.map(m => tipoDocumentoDePapel(m.clave)))
            .toEqual(['permiso_circulacion', 'poliza', 'revision_tecnica', 'revision_gases', 'mantencion']);
    });

    test('papel de la URL: solo uno de los cinco', () => {
        expect(papelDesdeUrl('gases')).toBe('gases');
        expect(papelDesdeUrl('leasing')).toBeNull();
        expect(papelDesdeUrl('')).toBeNull();
        expect(papelDesdeUrl(null)).toBeNull();
    });

    test('urgentes: vencidos y por vencer que avisan + otros, del más vencido al más holgado', () => {
        const v = veh({
            papeles: con(porVencer('poliza', 6), vencido('gases', -124), porVencer('mantencion', 11),
                vencido('tecnica', -3, { avisa: false }), papel('permiso', { estado: 'sin_registro', dias_restantes: null })),
            otros: [otro('Seguro a terceros', 3, { subtipo: 'seguro_terceros' })],
        });
        expect(urgentes(v).map(u => [u.clave, u.dias])).toEqual([
            ['gases', -124], [null, 3], ['poliza', 6], ['mantencion', 11],
        ]);
    });

    test('urgentes: a igual plazo, primero los cinco; vigente y sin fecha no entran', () => {
        const v = veh({
            papeles: con(porVencer('poliza', 5), papel('tecnica', { estado: 'sin_fecha', dias_restantes: null })),
            otros: [otro('Revisión mecánica', 5, { categoria: 'revision', subtipo: 'mecanica' })],
        });
        expect(urgentes(v).map(u => u.clave)).toEqual(['poliza', null]);
        expect(urgentes(veh())).toEqual([]);
    });

    test('frase: venció / vence, con singular bien escrito', () => {
        const v = veh({ papeles: con(vencido('gases', -124), porVencer('poliza', 6)) });
        expect(fraseVehiculo(urgentes(v))).toBe('Venció la revisión de gases hace 124 días. Vence la póliza de seguro en 6 días.');
        expect(fraseVehiculo(urgentes(veh({ papeles: con(vencido('permiso', -1), porVencer('tecnica', 0), porVencer('mantencion', 1)) }))))
            .toBe('Venció el permiso de circulación hace 1 día. Vence la revisión técnica hoy. Vence la mantención en 1 día.');
        expect(fraseVehiculo([])).toBe('');
    });

    test('frase de lo que no es de los cinco: artículo y minúscula; el leasing sin «fin de»', () => {
        const v = veh({
            otros: [
                otro('Seguro a terceros', -2, { subtipo: 'seguro_terceros' }),
                otro('Revisión mecánica', 4, { categoria: 'revision', subtipo: 'mecanica' }),
                otro('Fin de leasing', 20, { categoria: 'leasing', subtipo: 'fin_leasing', registro_id: null }),
                otro('Primera inscripción', 9, { subtipo: 'primera_inscripcion' }),
            ],
        });
        expect(fraseVehiculo(urgentes(v))).toBe(
            'Venció el seguro a terceros hace 2 días. Vence la revisión mecánica en 4 días. '
            + 'Vence la primera inscripción en 9 días. Vence el leasing en 20 días.');
        expect(urgentes(v).map(u => pildora(u).texto)).toEqual(['Seguro a terceros · vencido', 'Mecánica · 4 d', 'Inscripción · 9 d', 'Leasing · 20 d']);
        // Nombre desconocido: va entero en la píldora; una sigla no se pasa a minúscula.
        const raro = urgentes(veh({ otros: [otro('SOAP', 3, { subtipo: 'xyz' })] }))[0];
        expect([raro.corto, raro.conArticulo]).toEqual(['SOAP', 'el SOAP']);
    });

    test('píldora: vencido en rojo; hoy y días en ámbar', () => {
        const [g, p, m] = urgentes(veh({ papeles: con(vencido('gases', -124), porVencer('poliza', 0), porVencer('mantencion', 11)) }));
        expect(pildora(g)).toEqual({ texto: 'Gases · vencido', tono: 'rojo' });
        expect(pildora(p)).toEqual({ texto: 'Póliza · hoy', tono: 'ambar' });
        expect(pildora(m)).toEqual({ texto: 'Mant. · 11 d', tono: 'ambar' });
    });

    test('tono de la ficha y del semáforo', () => {
        expect(tonoFicha(veh({ vencidos: 1, requiere_accion: 2 }))).toBe('rojo');
        expect(tonoFicha(veh({ vencidos: 0, requiere_accion: 2 }))).toBe('ambar');
        expect((['vencido', 'por_vencer', 'vigente', 'sin_fecha', 'sin_registro'] as const).map(tonoCelda))
            .toEqual(['rojo', 'ambar', 'neutro', 'neutro', 'punteado']);
    });

    test('semáforo: siempre cinco en orden (el que falta, sin registro) y el texto para el lector', () => {
        const desordenados = [porVencer('mantencion', 3), vencido('poliza', -8), papel('permiso'), papel('gases', { estado: 'sin_fecha', dias_restantes: null })];
        expect(ordenSemaforo(desordenados).map(p => [p.clave, p.estado])).toEqual([
            ['permiso', 'vigente'], ['poliza', 'vencido'], ['tecnica', 'sin_registro'], ['gases', 'sin_fecha'], ['mantencion', 'por_vencer'],
        ]);
        expect(ariaSemaforo(desordenados)).toBe('Permiso de circulación: al día, Póliza de seguro: vencido, '
            + 'Revisión técnica: sin registro, Revisión de gases: sin fecha, Mantención: por vencer');
    });

    test('fichas: solo vehículos con algo urgente, en el orden del servidor; cargando = ninguna', () => {
        const a = veh({ vehiculo_id: 1, papeles: con(vencido('gases', -10)), requiere_accion: 1, vencidos: 1 });
        const b = veh({ vehiculo_id: 2 });
        const c = veh({ vehiculo_id: 3, papeles: con(porVencer('poliza', 4)), requiere_accion: 1 });
        expect(fichasVehiculos({ dias: 30, total_vehiculos: 3, vehiculos: [a, b, c] }).map(f => f.v.vehiculo_id)).toEqual([1, 3]);
        expect(fichasVehiculos(null)).toEqual([]);
    });

    test('título, bajada y botón de aviso', () => {
        expect(tituloVehiculo(veh())).toBe('Toyota Hilux');
        expect(tituloVehiculo(veh({ modelo: null }))).toBe('Toyota');
        expect(bajadaVehiculo(veh())).toBe('KDPW-31 · conduce Óscar Núñez');
        expect(bajadaVehiculo(veh({ conductor_id: null, conductor_nombre: null }))).toBe('KDPW-31 · sin conductor asignado');
        expect(textoAvisar(veh())).toBe('Avisar a Óscar');
        expect(textoAvisar(veh({ conductor_nombre: 'JUAN PÉREZ' }))).toBe('Avisar a Juan');
        expect(textoAvisar(veh({ conductor_nombre: null }))).toBe('Avisar por WhatsApp');
        expect(primerNombre('  ')).toBe('');
    });

    test('mensaje de WhatsApp: con y sin conductor', () => {
        const v = veh({ papeles: con(vencido('gases', -124), porVencer('poliza', 6)) });
        expect(mensajeWhatsApp(v, urgentes(v))).toBe('Hola Óscar, al KDPW-31 se le venció la revisión de gases hace 124 días '
            + 'y le vence la póliza de seguro en 6 días. Coordinemos para dejarlo al día.');
        const sin = veh({ conductor_nombre: null, papeles: con(vencido('permiso', -1), porVencer('tecnica', 0), porVencer('mantencion', 1)) });
        expect(mensajeWhatsApp(sin, urgentes(sin))).toBe('Hola, al KDPW-31 se le venció el permiso de circulación hace 1 día, '
            + 'le vence la revisión técnica hoy y le vence la mantención en 1 día. Coordinemos para dejarlo al día.');
        expect(mensajeWhatsApp(veh(), [])).toBe('Hola Óscar, revisemos los papeles del KDPW-31.');
    });

    test('ruta de «Subir el nuevo»: el papel más urgente si es de los cinco; si no, solo el vehículo', () => {
        const v = veh({ papeles: con(porVencer('poliza', 6), vencido('gases', -124)) });
        expect(rutaSubir(v, urgentes(v))).toBe('/vehiculos?vehiculo=7&papel=gases');
        const leasing = veh({ papeles: con(porVencer('poliza', 6)), otros: [otro('Fin de leasing', -5, { categoria: 'leasing', subtipo: 'fin_leasing' })] });
        expect(rutaSubir(leasing, urgentes(leasing))).toBe('/vehiculos?vehiculo=7');
        expect(rutaSubir(v, [])).toBe('/vehiculos?vehiculo=7');
    });

    test('«Subir el nuevo» solo si el enlace abre un formulario: renovar pide editar; agregar, crear', () => {
        const todo = { editar: true, crear: true };
        const v = veh({ papeles: con(vencido('gases', -124, { categoria: 'revision' })) });
        expect(abreFormulario(v, urgentes(v), todo)).toBe(true);
        expect(abreFormulario(v, urgentes(v), { editar: false, crear: true })).toBe(false);
        // Póliza que viene de la tabla antigua de seguros: Vehículos abre «Agregar» → pide crear.
        const antigua = veh({ papeles: con(vencido('poliza', -3, { categoria: 'seguro' })) });
        expect(abreFormulario(antigua, urgentes(antigua), { editar: false, crear: true })).toBe(true);
        expect(abreFormulario(antigua, urgentes(antigua), { editar: true, crear: false })).toBe(false);
        // Lo más urgente es de `otros` (leasing): no hay formulario por enlace.
        const leasing = veh({ otros: [otro('Fin de leasing', -5, { categoria: 'leasing', subtipo: 'fin_leasing' })] });
        expect(abreFormulario(leasing, urgentes(leasing), todo)).toBe(false);
        expect(abreFormulario(v, [], todo)).toBe(false);
    });

    test('eventos del calendario: vencidos y por vencer que avisan, papel por papel, del más vencido al más holgado', () => {
        const juan = veh({ vehiculo_id: 1, patente: 'PRLG-45', marca: 'HINO', modelo: 'FC 1118', conductor_nombre: 'Juan Pérez',
            papeles: con(vencido('gases', -124, { fecha_vencimiento: '2026-06-20' }), porVencer('tecnica', 8, { fecha_vencimiento: '2026-10-30T03:00:00.000Z' }),
                porVencer('poliza', 3, { fecha_vencimiento: '2026-10-25', avisa: false })) });
        const sin = veh({ vehiculo_id: 2, patente: 'TWCB-97', marca: 'Maxus', modelo: 'G 90', conductor_nombre: null,
            otros: [otro('Fin de leasing', 29, { categoria: 'leasing', subtipo: 'fin_leasing', registro_id: null, fecha_vencimiento: '2026-11-20' })] });
        const ev = eventosFlota({ dias: 30, total_vehiculos: 2, vehiculos: [juan, sin] });
        expect(ev.map(e => [e.patente, e.papel, e.fecha, e.dias, e.estado, e.clave])).toEqual([
            ['PRLG-45', 'Revisión de gases', '2026-06-20', -124, 'vencido', 'gases'],
            ['PRLG-45', 'Revisión técnica', '2026-10-30', 8, 'por_vencer', 'tecnica'],
            ['TWCB-97', 'Fin de leasing', '2026-11-20', 29, 'por_vencer', null],
        ]);
        expect(new Set(ev.map(e => e.key)).size).toBe(3);
        expect(eventosFlota(null)).toEqual([]);
        // El WhatsApp de una fila habla solo de ESE papel.
        expect(mensajeWhatsApp(juan, urgenteDeEvento(juan, ev[1])))
            .toBe('Hola Juan, al PRLG-45 le vence la revisión técnica en 8 días. Coordinemos para dejarlo al día.');
        expect(urgenteDeEvento(sin, ev[2]).map(u => u.nombre)).toEqual(['Fin de leasing']);
    });

    test('plazos y fechas en palabras', () => {
        expect([textoPlazo(-1), textoPlazo(-124), textoPlazo(0), textoPlazo(1), textoPlazo(8)])
            .toEqual(['venció hace 1 día', 'venció hace 124 días', 'vence hoy', 'vence en 1 día', 'vence en 8 días']);
        expect(fechaCorta('2026-10-24')).toBe('24 oct');
        expect(fechaConDia('2026-11-06')).toBe('vie 6 nov');
        expect(hoyIso(new Date(2026, 9, 2, 23, 30))).toBe('2026-10-02');
    });

    test('calendario: semanas desde el lunes hasta hoy + 30, hoy marcado, pasado y fuera de ventana apagados', () => {
        const e = (fecha: string, estado: 'vencido' | 'por_vencer' = 'por_vencer') =>
            ({ key: fecha + estado, vehiculo_id: 1, patente: 'X', vehiculo: 'X', fecha, dias: 0, papel: 'P', clave: null, estado });
        const cal = diasCalendario('2026-10-22', [e('2026-10-24'), e('2026-10-24'), e('2026-11-06'), e('2026-10-20', 'vencido')]);
        expect(cal).toHaveLength(35); // jueves: cinco semanas
        expect(cal[0]).toMatchObject({ iso: '2026-10-19', num: 19, pasado: true, hoy: false, fuera: false });
        expect(cal.find(d => d.hoy)?.iso).toBe('2026-10-22');
        expect(cal.find(d => d.iso === '2026-10-24')?.eventos).toHaveLength(2);
        expect(cal.find(d => d.iso === '2026-11-06')?.eventos).toHaveLength(1);
        expect(cal.find(d => d.iso === '2026-10-20')?.eventos).toHaveLength(0); // lo vencido no va en el calendario
        expect(cal.find(d => d.iso === '2026-11-21')?.fuera).toBe(false); // hoy + 30
        expect(cal.find(d => d.iso === '2026-11-22')?.fuera).toBe(true);  // hoy + 31: sin datos
        // Lunes: cinco semanas, y los últimos días (más allá de hoy + 30) apagados.
        const lunes = diasCalendario('2026-10-26', []);
        expect(lunes).toHaveLength(35);
        expect(lunes.filter(d => d.fuera).map(d => d.iso)).toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
        // Domingo: seis semanas, para que hoy + 30 (24-nov) tenga su celda; cruza de año sin problema.
        const domingo = diasCalendario('2026-10-25', [e('2026-11-24')]);
        expect(domingo).toHaveLength(42);
        expect(domingo.find(d => d.iso === '2026-11-24')).toMatchObject({ fuera: false, eventos: [expect.anything()] });
        expect(diasCalendario('2026-12-27', [])[0].iso).toBe('2026-12-21');
        const fin = diasCalendario('2026-12-27', []);
        expect(fin[fin.length - 1].iso).toBe('2027-01-31');
        expect(diasCalendario('2026-10-22', [], 10)).toHaveLength(14);
    });
});
