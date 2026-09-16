import {
    agruparPorTrabajador, agruparPorObra, filtrarDisponibles, toggleIds, estadoSeleccion,
    buildCrearLotePayload, validarNuevoLote, buildConfirmarRetiroPayload, buildRecepcionPayload,
    diasDesde, resumenLote, accionesLote, filasBandejaLotes, desenlaceLote,
    type DocumentoDisponible, type LoteResumen, agruparLotesPorEstado, inicialesNombre, lineaTiempoLote,
} from './documentosFisicos';

const doc = (id: number, extra: Partial<DocumentoDisponible> = {}): DocumentoDisponible => ({
    id, nombre_archivo: `doc${id}.doc`, fecha_generacion: null, fecha_descarga: '2026-09-14 10:00:00', tipo_nombre: 'Contrato de Trabajo (Bóveda)', tipo_codigo: 'CONTRATO',
    trabajador_id: 5, trabajador_nombre: 'Pérez Soto Juan', rut: '12.345.678-5', trabajador_activo: true, obra_id: 7, obra_nombre: 'Edificio Central', ...extra,
});

describe('documentosFisicos (plan Gestiones B6)', () => {
    const docs = [
        doc(1), doc(2, { tipo_nombre: 'ODI', tipo_codigo: 'ODI_D40' }),
        doc(3, { trabajador_id: 9, trabajador_nombre: 'Álvarez Ana', rut: '9.999.999-9', obra_id: 2, obra_nombre: 'Bodega Peñaflor' }),
        doc(4, { trabajador_id: 6, trabajador_nombre: 'Zúñiga Pedro', rut: '1.111.111-1' }),
        doc(5, { trabajador_id: null, trabajador_nombre: null, rut: null, obra_id: null, obra_nombre: null }),
    ];

    it('agruparPorTrabajador: un grupo por trabajador, ordenado por obra y nombre; sin obra al final como "Sin obra"', () => {
        const g = agruparPorTrabajador(docs);
        expect(g.map(x => [x.obra_nombre, x.trabajador_nombre, x.docs.length])).toEqual([
            ['Bodega Peñaflor', 'Álvarez Ana', 1],
            ['Edificio Central', 'Pérez Soto Juan', 2],
            ['Edificio Central', 'Zúñiga Pedro', 1],
            ['Sin obra', 'Trabajador sin nombre', 1],
        ]);
        expect(g[1].docs.map(d => d.id)).toEqual([1, 2]);
        const obras = agruparPorObra(g);
        expect(obras.map(o => [o.obra_nombre, o.grupos.length])).toEqual([['Bodega Peñaflor', 1], ['Edificio Central', 2], ['Sin obra', 1]]);
    });

    it('filtrarDisponibles: texto sin tildes ni mayúsculas sobre nombre/RUT/tipo/obra, y por obra', () => {
        expect(filtrarDisponibles(docs, 'alvarez').map(d => d.id)).toEqual([3]);
        expect(filtrarDisponibles(docs, '12.345').map(d => d.id)).toEqual([1, 2]);
        expect(filtrarDisponibles(docs, 'odi').map(d => d.id)).toEqual([2]);
        expect(filtrarDisponibles(docs, '', 7).map(d => d.id)).toEqual([1, 2, 4]);
        expect(filtrarDisponibles(docs, 'peñaflor', 7)).toEqual([]);
        expect(filtrarDisponibles(docs, '   ')).toHaveLength(5);
    });

    it('toggleIds / estadoSeleccion: marca sin repetir, desmarca, y calcula todos/parcial/ninguno', () => {
        let sel = toggleIds([], [1, 2], true);
        expect(sel).toEqual([1, 2]);
        sel = toggleIds(sel, [2, 3], true);
        expect(sel).toEqual([1, 2, 3]);
        expect(estadoSeleccion(sel, [1, 2, 3])).toBe('todos');
        expect(estadoSeleccion(sel, [3, 4])).toBe('parcial');
        sel = toggleIds(sel, [1, 3], false);
        expect(sel).toEqual([2]);
        expect(estadoSeleccion(sel, [1, 3])).toBe('ninguno');
        expect(estadoSeleccion(sel, [])).toBe('ninguno');
    });

    it('buildCrearLotePayload / validarNuevoLote: ids únicos y enteros, portador numérico, observación solo si hay', () => {
        expect(buildCrearLotePayload({ portadorId: '7', seleccion: [3, 1, 3, 0, -2, 2.5 as number] })).toEqual({ portador_id: 7, documento_ids: [3, 1] });
        expect(buildCrearLotePayload({ portadorId: 7, seleccion: [1], observacion: '  kit  ' })).toEqual({ portador_id: 7, documento_ids: [1], observacion: 'kit' });
        expect(validarNuevoLote({ portadorId: '', seleccion: [1] })).toMatch(/quién retira/);
        expect(validarNuevoLote({ portadorId: 7, seleccion: [] })).toMatch(/al menos un documento/);
        expect(validarNuevoLote({ portadorId: 7, seleccion: [1] })).toBeNull();
    });

    it('buildConfirmarRetiroPayload y buildRecepcionPayload: "en terreno" no viaja; firmado manda sobre sin firma', () => {
        expect(buildConfirmarRetiroPayload([2, 2, 1])).toEqual({ documento_ids: [2, 1] });
        expect(buildConfirmarRetiroPayload([])).toEqual({ documento_ids: [] });
        expect(buildRecepcionPayload({ 11: 'firmado', 12: 'sin_firma', 13: 'en_terreno' }, ' faltó la 12 ')).toEqual({ firmados: [11], sin_firma: [12], observacion: 'faltó la 12' });
        expect(buildRecepcionPayload({ 11: 'en_terreno' })).toEqual({ firmados: [], sin_firma: [] });
    });

    it('diasDesde: fechas de BD ("YYYY-MM-DD HH:mm:ss"), ISO y solo fecha; nunca negativo', () => {
        const hoy = new Date(2026, 8, 14);
        expect(diasDesde('2026-09-10 12:00:00', hoy)).toBe(4);
        expect(diasDesde('2026-09-14T09:00:00', hoy)).toBe(0);
        expect(diasDesde('2026-09-01', hoy)).toBe(13);
        expect(diasDesde('2026-09-20', hoy)).toBe(0);
        expect(diasDesde(null, hoy)).toBe(0);
        expect(diasDesde('basura', hoy)).toBe(0);
    });

    const lote = (extra: Partial<LoteResumen> = {}): LoteResumen => ({
        id: 41, portador_id: 7, portador_nombre: 'Jhoan', creado_por: 3, creado_por_nombre: 'Matías', estado: 'pendiente_retiro', observacion: null,
        creado_en: '2026-09-14 10:00:00', retirado_en: null, cerrado_en: null, total: 3, pendientes: 3, en_terreno: 0, firmados: 0, sin_firma: 0, no_entregados: 0, ...extra,
    });

    it('resumenLote: solo conteos distintos de cero, con plural', () => {
        expect(resumenLote(lote())).toBe('3 esperando retiro');
        expect(resumenLote(lote({ pendientes: 0, en_terreno: 1, firmados: 2, sin_firma: 1, no_entregados: 1 }))).toBe('1 en terreno · 2 firmados · 1 sin firma · 1 quedó en oficina');
        expect(resumenLote(lote({ pendientes: 0 }))).toBe('Sin documentos');
    });

    it('accionesLote: doble llave — confirmar retiro SOLO el portador asignado; RRHH recibe y anula', () => {
        const rrhh = { id: 3, puedeRegistrar: true, puedePortar: false };
        const jhoan = { id: 7, puedeRegistrar: false, puedePortar: true };
        const hector = { id: 8, puedeRegistrar: false, puedePortar: true };
        expect(accionesLote(lote(), jhoan)).toEqual({ confirmarRetiro: true, recepcion: false, anular: false });
        expect(accionesLote(lote(), hector)).toEqual({ confirmarRetiro: false, recepcion: false, anular: false });
        expect(accionesLote(lote(), rrhh)).toEqual({ confirmarRetiro: false, recepcion: false, anular: true });
        expect(accionesLote(lote({ estado: 'en_terreno' }), rrhh)).toEqual({ confirmarRetiro: false, recepcion: true, anular: false });
        expect(accionesLote(lote({ estado: 'en_terreno' }), jhoan)).toEqual({ confirmarRetiro: false, recepcion: false, anular: false });
        expect(accionesLote(lote({ estado: 'cerrado' }), rrhh)).toEqual({ confirmarRetiro: false, recepcion: false, anular: false });
        // RRHH que además porta: puede confirmar solo si el lote es SUYO.
        expect(accionesLote(lote({ portador_id: 3 }), { id: 3, puedeRegistrar: true, puedePortar: true }).confirmarRetiro).toBe(true);
    });

    it('desenlaceLote: el carril dice «Firmados», la tarjeta dice si terminó de otra forma', () => {
        // Solo aplica a lotes cerrados: los otros dos carriles ya dicen dónde están los papeles.
        expect(desenlaceLote(lote({ estado: 'pendiente_retiro' }))).toBeNull();
        expect(desenlaceLote(lote({ estado: 'en_terreno', pendientes: 0, en_terreno: 3 }))).toBeNull();

        const cerrado = (extra: Partial<LoteResumen>) => desenlaceLote(lote({ estado: 'cerrado', pendientes: 0, ...extra }));
        expect(cerrado({ firmados: 3 })).toBe('firmado');
        // Volvió con algunas firmas: sigue siendo el caso normal del carril.
        expect(cerrado({ firmados: 2, sin_firma: 1 })).toBe('firmado');
        // Volvió entero sin una sola firma: esos papeles ya están listos para salir de nuevo.
        expect(cerrado({ sin_firma: 3 })).toBe('sin_firmas');
        // El portador nunca lo retiró: nunca salió de la oficina.
        expect(cerrado({ no_entregados: 3 })).toBe('no_retirado');
        // Mezcla sin firmas: manda lo que volvió en blanco, que es lo que hay que volver a mandar.
        expect(cerrado({ sin_firma: 1, no_entregados: 2 })).toBe('sin_firmas');
    });

    it('filasBandejaLotes: texto por alcance; nada si todo es cero', () => {
        expect(filasBandejaLotes({ por_confirmar: 1, en_terreno: 0, alcance: 'propios' })).toEqual([
            { severity: 'warning', title: '1 lote te espera en oficina', description: 'RRHH los dejó impresos a tu nombre: confirma cuando los retires' },
        ]);
        const rrhh = filasBandejaLotes({ por_confirmar: 2, en_terreno: 3, alcance: 'todos' });
        expect(rrhh.map(f => f.title)).toEqual(['2 lotes que el portador aún no retira', '3 lotes de documentos en terreno']);
        expect(filasBandejaLotes({ por_confirmar: 3, en_terreno: 0, alcance: 'propios' })[0].title).toBe('3 lotes te esperan en oficina');
        expect(filasBandejaLotes({ por_confirmar: 0, en_terreno: 0, alcance: 'todos' })).toEqual([]);
        expect(filasBandejaLotes(null)).toEqual([]);
    });
});

describe('tablero de custodia', () => {
    const base = { portador_id: 1, portador_nombre: 'Jhoan Vásquez', creado_por: 2, creado_por_nombre: 'Matías', observacion: null, total: 3, pendientes: 0, en_terreno: 0, firmados: 0, sin_firma: 0, no_entregados: 0, retirado_en: null, cerrado_en: null };
    it('agruparLotesPorEstado reparte en los tres carriles conservando el orden', () => {
        const g = agruparLotesPorEstado([
            { ...base, id: 1, estado: 'en_terreno', creado_en: '2026-09-10 10:00:00' },
            { ...base, id: 2, estado: 'pendiente_retiro', creado_en: '2026-09-15 10:00:00' },
            { ...base, id: 3, estado: 'pendiente_retiro', creado_en: '2026-09-14 10:00:00' },
            { ...base, id: 4, estado: 'cerrado', creado_en: '2026-09-01 10:00:00' },
        ]);
        expect(g.pendiente_retiro.map(l => l.id)).toEqual([2, 3]);
        expect(g.en_terreno.map(l => l.id)).toEqual([1]);
        expect(g.cerrado.map(l => l.id)).toEqual([4]);
    });
    it('inicialesNombre y lineaTiempoLote', () => {
        expect(inicialesNombre('Jhoan Vásquez')).toBe('JV');
        expect(inicialesNombre('  Héctor  ')).toBe('H');
        expect(inicialesNombre(null)).toBe('');
        const hoy = new Date(2026, 8, 15, 12);
        expect(lineaTiempoLote({ ...base, estado: 'pendiente_retiro', creado_en: '2026-09-15 08:00:00' }, hoy)).toBe('Listo desde hoy · lo preparó Matías');
        expect(lineaTiempoLote({ ...base, estado: 'en_terreno', creado_en: '2026-09-10 08:00:00', retirado_en: '2026-09-14 08:00:00' }, hoy)).toBe('En terreno desde ayer');
        expect(lineaTiempoLote({ ...base, estado: 'cerrado', creado_en: '2026-09-01 08:00:00', retirado_en: '2026-09-02 08:00:00', cerrado_en: '2026-09-10 08:00:00' }, hoy)).toBe('Volvió hace 5 días');
    });
});
