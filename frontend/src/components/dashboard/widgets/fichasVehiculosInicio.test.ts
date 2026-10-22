import {
    abreFormulario, ariaSemaforo, bajadaVehiculo, fichasVehiculos, fraseVehiculo, mensajeWhatsApp, ordenSemaforo, PAPELES_META, papelDesdeUrl,
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
});
