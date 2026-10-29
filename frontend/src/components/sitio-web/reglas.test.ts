import {
    ALT_MIN, ANIO_MAX, ANIO_MIN, ESTADOS, ESTADO_SITIO, ETIQUETA_ESTADO, LARGOS, MAX_BYTES_FOTO, MIN_ANCHO_FOTO, REFERENCIAS, SERVICIOS,
    SLUG_PATRONES_RESERVADOS, SLUG_RE, SLUG_RESERVADOS, TIPOS,
    agruparPorEstado, autorizacionBloqueada, avisoToken, contarFiltros, cuerpoDesdeForm, erroresForm, estadoDerivado, faltantes,
    fichaDesdeForm, filtrarObras, formDesdeObra, formIguales, formVacio, formatoSuperficie, mover, numeroDeCampo, obraParaReglas,
    slugDesde, slugValido, soloCambios, totalPendientes, ultimaConProblema, urlObraEnSitio,
} from './reglas';
import type { ObraSitio, ObraSitioLista, PublicacionSitio } from './tipos';

// El catálogo del backend (sitioWeb.config.js no tiene dependencias): la copia de la pantalla tiene que calzar.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CFG = require('../../../../backend/src/config/sitioWeb.config.js');

describe('catálogos = espejo de backend/src/config/sitioWeb.config.js', () => {
    test('estados, etiquetas, tipos, servicios y referencias', () => {
        expect([...ESTADOS]).toEqual([...CFG.ESTADOS]);
        expect(ESTADO_SITIO).toEqual({ ...CFG.ESTADO_SITIO });
        expect(ETIQUETA_ESTADO).toEqual({ ...CFG.ETIQUETA_ESTADO });
        expect([...TIPOS]).toEqual([...CFG.TIPOS]);
        expect(SERVICIOS.map(s => ({ ...s }))).toEqual(CFG.SERVICIOS.map((s: object) => ({ ...s })));
        expect([...REFERENCIAS]).toEqual([...CFG.REFERENCIAS]);
    });

    test('largos, años, foto y slug', () => {
        expect({ ...LARGOS }).toEqual({ ...CFG.LARGOS });
        expect([ALT_MIN, ANIO_MIN, ANIO_MAX]).toEqual([CFG.ALT_MIN, CFG.ANIO_MIN, CFG.ANIO_MAX]);
        expect([MIN_ANCHO_FOTO, MAX_BYTES_FOTO]).toEqual([CFG.MIN_ANCHO, CFG.MAX_BYTES]);
        expect(SLUG_RE.source).toBe(CFG.SLUG_RE.source);
        expect([...SLUG_RESERVADOS]).toEqual([...CFG.SLUG_RESERVADOS]);
        expect(SLUG_PATRONES_RESERVADOS.map(r => r.source)).toEqual(CFG.SLUG_PATRONES_RESERVADOS.map((r: RegExp) => r.source));
    });
});

describe('slugDesde (= backend)', () => {
    test('sin tildes ni eñes, minúsculas y guiones', () => {
        expect(slugDesde('Av. España 778')).toBe('av-espana-778');
        expect(slugDesde('  Bascuñán  Guerrero #818 ')).toBe('bascunan-guerrero-818');
        expect(slugDesde('Enfermera Lucía Vidal Arias 6679')).toBe('enfermera-lucia-vidal-arias-6679');
        expect(slugDesde('')).toBe('');
        expect(slugDesde(null)).toBe('');
        expect(slugDesde('¡¡¡')).toBe('');
    });

    test('más de 80: corta en un guion, nunca a mitad de palabra', () => {
        const largo = slugDesde('Edificio '.repeat(12));
        expect(largo.length).toBeLessThanOrEqual(80);
        expect(largo.endsWith('-')).toBe(false);
        expect(largo.split('-').every(p => p === 'edificio')).toBe(true);
        expect(slugDesde('a'.repeat(100))).toBe('a'.repeat(80));
    });

    test('reservados: ejemplo, muestra-* y los ids de las muestras de un carrusel', () => {
        expect(slugValido('abate-molina-211')).toBe(true);
        expect(slugValido('ejemplo')).toBe(false);
        expect(slugValido('muestra')).toBe(false);
        expect(slugValido('muestra-en-curso-1')).toBe(false);
        expect(slugValido('terminados-1')).toBe(false);
        expect(slugValido('en-construccion-12')).toBe(false);
        expect(slugValido('terminados-uno')).toBe(true);
        expect(slugValido('Con-Mayuscula')).toBe(false);
        expect(slugValido('doble--guion')).toBe(false);
        expect(slugValido(`a${'-b'.repeat(40)}`)).toBe(false);
    });
});

const completa = {
    nombre: 'Abate Molina 211', slug: 'abate-molina-211', estado: 'terminado', comuna: 'Santiago', tipo: 'Edificio y oficinas',
    servicios: 'construccion', superficie_m2: 581, anio: 2018, referencia: null,
};
const foto = { alt: 'Edificio de seis pisos en la esquina' };

describe('faltantes (= backend)', () => {
    test('completa con portada: nada', () => {
        expect(faltantes(completa, foto)).toEqual([]);
    });

    test('una regla por campo, con el texto del backend', () => {
        const campos = (o: object, f: object | null = foto, x = {}) => faltantes({ ...completa, ...o }, f, x).map(x => x.campo);
        expect(campos({ nombre: '  ' })).toEqual(['nombre']);
        expect(campos({ slug: 'ejemplo' })).toEqual(['slug']);
        expect(campos({ estado: 'otro' })).toEqual(['estado']);
        expect(campos({ comuna: '' })).toEqual(['comuna']);
        expect(campos({ tipo: 'Galpón' })).toEqual(['tipo']);
        expect(campos({ tipo: null })).toEqual([]);   // titular, tipo y superficie son opcionales en el sitio
        expect(campos({ servicios: '' })).toEqual(['servicios']);
        expect(campos({ servicios: ['construccion', 'pintura'] })).toEqual(['servicios']);
        expect(campos({ superficie_m2: 0 })).toEqual(['superficie_m2']);
        expect(campos({ superficie_m2: 12.5 })).toEqual(['superficie_m2']);
        expect(campos({ superficie_m2: null })).toEqual([]);
        expect(campos({ anio: null })).toEqual(['anio']);
        expect(campos({ anio: 1990 })).toEqual(['anio']);
        expect(campos({ estado: 'en_construccion', anio: null })).toEqual([]);
        expect(faltantes({ ...completa, comuna: null }, foto)[0].mensaje).toBe('Falta la comuna.');
        expect(faltantes({ ...completa, tipo: 'Galpón' }, foto)[0].mensaje).toBe('El tipo «Galpón» ya no existe en el sitio: elige otro.');
    });

    test('portada: foto aprobada o referencial en construcción y terminadas; una en proyecto puede ir sin', () => {
        expect(faltantes(completa, null)).toEqual([{ campo: 'portada', mensaje: 'Una obra terminada necesita una foto de portada aprobada.' }]);
        expect(faltantes({ ...completa, estado: 'en_construccion', anio: null }, null)[0].mensaje)
            .toBe('Una obra en construcción necesita una foto de portada aprobada.');
        expect(faltantes(completa, null, { porAprobar: 1 })[0].mensaje)
            .toBe('La foto de portada espera aprobación: sin ella, la obra no puede salir al sitio.');
        expect(faltantes({ ...completa, estado: 'contratado', anio: null }, null)).toEqual([]);
        expect(faltantes({ ...completa, referencia: 'rendersEjemplo/maipu-40' }, null)).toEqual([]);
        expect(faltantes({ ...completa, referencia: 'rendersEjemplo/no-existe' }, null)[0].mensaje)
            .toBe('La imagen referencial que tenía la obra ya no existe en el sitio: sube una foto propia.');
    });

    test('la portada necesita descripción y la heredada tiene que ser de su carpeta', () => {
        expect(faltantes(completa, { alt: 'Obra' }).map(f => f.campo)).toEqual(['portada']);
        expect(faltantes(completa, { alt: 'Edificio de seis pisos', heredada_src: '/proyectos/otra/1.jpg' }).map(f => f.campo)).toEqual(['portada']);
        expect(faltantes(completa, { alt: 'Edificio de seis pisos', heredada_src: '/proyectos/abate-molina-211/1.jpg' })).toEqual([]);
    });
});

describe('estadoDerivado (= backend)', () => {
    const obra = (o: object = {}) => ({ id: 7, incluir: true, publicado_hash: 'h1', ...o });
    const pub = (o: object = {}) => ({ obras: { 7: 'h1' }, build_estado: 'ok', en_linea: true, ...o });

    test('fuera del sitio: borrador o retiro pendiente', () => {
        expect(estadoDerivado({ obra: obra({ incluir: false, publicado_hash: null }) })).toBe('borrador');
        expect(estadoDerivado({ obra: obra({ incluir: false }) })).toBe('retiro_pendiente');
    });

    test('nunca publicada: borrador si le falta algo, lista si no', () => {
        expect(estadoDerivado({ obra: obra({ publicado_hash: null }), faltantes: [{ campo: 'comuna', mensaje: '' }] })).toBe('borrador');
        expect(estadoDerivado({ obra: obra({ publicado_hash: null }), hashActual: 'h9' })).toBe('listo');
    });

    test('publicada: cambios, publicando, publicada o no llegó', () => {
        expect(estadoDerivado({ obra: obra(), hashActual: 'h2' }, pub())).toBe('cambios');
        // Le faltan datos: el sitio mantiene lo publicado (publicar no la cambia); con su portada rechazada, se retira.
        expect(estadoDerivado({ obra: obra(), faltantes: [{ campo: 'x', mensaje: '' }], hashActual: 'h1' }, pub())).toBe('incompleta');
        expect(estadoDerivado({ obra: obra(), faltantes: [{ campo: 'portada', mensaje: '' }], rechazadaPublicada: true }, pub())).toBe('retiro_pendiente');
        expect(estadoDerivado({ obra: obra(), hashActual: 'h1' }, pub())).toBe('publicada');
        expect(estadoDerivado({ obra: obra(), hashActual: 'h1' }, pub({ en_linea: false }))).toBe('publicando');
        expect(estadoDerivado({ obra: obra(), hashActual: 'h1' }, pub({ build_estado: 'fallo', en_linea: false }))).toBe('no_llego');
        // «En línea» manda sobre una compilación fallida (corrida repetida o push posterior que la llevó).
        expect(estadoDerivado({ obra: obra(), hashActual: 'h1' }, pub({ build_estado: 'fallo' }))).toBe('publicada');
        // La última publicación no la llevó (entró antes): ya está en el sitio.
        expect(estadoDerivado({ obra: obra(), hashActual: 'h1' }, pub({ obras: {}, en_linea: false }))).toBe('publicada');
        expect(estadoDerivado({ obra: obra(), hashActual: 'h1' }, null)).toBe('publicada');
    });
});

const fila = (o: Partial<ObraSitioLista>): ObraSitioLista => ({
    id: 1, slug: 's', nombre: 'Obra', estado: 'en_construccion', comuna: 'Santiago', orden: 10, incluir: true, vinculada: false,
    tiene_portada: true, portada_id: 1, referencia: null, fotos_por_aprobar: 0, faltantes: [], estadoDerivado: 'publicada',
    publicado_at: null, updated_at: '2026-10-29T12:00:00.000Z', ...o,
});

describe('lista', () => {
    test('agruparPorEstado: en el orden del sitio, por orden, nombre e id; sin grupos vacíos', () => {
        const g = agruparPorEstado([
            fila({ id: 1, estado: 'terminado', orden: 20, nombre: 'B' }),
            fila({ id: 2, estado: 'en_construccion', orden: 10, nombre: 'Z' }),
            fila({ id: 3, estado: 'terminado', orden: 10, nombre: 'C' }),
            fila({ id: 4, estado: 'terminado', orden: 20, nombre: 'A' }),
        ]);
        expect(g.map(x => [x.etiqueta, x.obras.map(o => o.id)])).toEqual([['En construcción', [2]], ['Terminado', [3, 4, 1]]]);
    });

    test('mover: sube y baja, null en el borde', () => {
        expect(mover([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
        expect(mover([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
        expect(mover([1, 2, 3], 1, -1)).toBeNull();
        expect(mover([1, 2, 3], 3, 1)).toBeNull();
        expect(mover([1, 2, 3], 9, 1)).toBeNull();
    });

    test('filtros y búsqueda sin tildes, todas las palabras', () => {
        const obras = [
            fila({ id: 1, nombre: 'Av. España 778', comuna: 'Santiago', estadoDerivado: 'cambios' }),
            fila({ id: 2, nombre: 'Gorbea 3082', comuna: 'Santiago', fotos_por_aprobar: 1 }),
            fila({ id: 3, nombre: 'Maipú 40', comuna: 'Maipú', incluir: false, estadoDerivado: 'borrador', faltantes: [{ campo: 'comuna', mensaje: '' }] }),
            fila({ id: 4, nombre: 'Toesca 2770', estadoDerivado: 'publicada' }),
        ];
        expect(filtrarObras(obras, 'todas', 'espana').map(o => o.id)).toEqual([1]);
        expect(filtrarObras(obras, 'todas', 'maipu').map(o => o.id)).toEqual([3]);
        expect(filtrarObras(obras, 'todas', 'santiago 30').map(o => o.id)).toEqual([2]);
        expect(filtrarObras(obras, 'pendientes', '').map(o => o.id)).toEqual([1, 2]);
        expect(filtrarObras(obras, 'faltan', '').map(o => o.id)).toEqual([3]);
        expect(filtrarObras(obras, 'fuera', '').map(o => o.id)).toEqual([3]);
        expect(contarFiltros(obras)).toEqual({ todas: 4, pendientes: 2, faltan: 1, fuera: 1 });
        // Publicada y ahora con faltantes: publicar no la cambia → no es «por publicar» (sale en «Les faltan datos»).
        const incompleta = fila({ id: 5, estadoDerivado: 'incompleta', faltantes: [{ campo: 'comuna', mensaje: '' }] });
        expect(filtrarObras([incompleta], 'pendientes', '')).toEqual([]);
        expect(filtrarObras([incompleta], 'faltan', '').map(o => o.id)).toEqual([5]);
    });
});

describe('avisos', () => {
    test('vencimiento del permiso de GitHub', () => {
        expect(avisoToken({ modo: 'publicar', tokenVenceEnDias: 45 })).toBeNull();
        expect(avisoToken({ modo: 'publicar', tokenVenceEnDias: 30 })?.tono).toBe('aviso');
        expect(avisoToken({ modo: 'publicar', tokenVenceEnDias: 1 })?.texto).toContain('vence en 1 día:');
        expect(avisoToken({ modo: 'publicar', tokenVenceEnDias: 0 })?.tono).toBe('peligro');
        expect(avisoToken({ modo: 'publicar', tokenVenceEnDias: -3 })?.texto).toContain('venció hace 3 días');
        expect(avisoToken({ modo: 'publicar', tokenVenceEnDias: null })?.tono).toBe('aviso');
        expect(avisoToken({ modo: 'simulacion', tokenVenceEnDias: null })).toBeNull();
    });

    test('última publicación con problema: error o compilación fallida; las importaciones no cuentan', () => {
        const p = (o: Partial<PublicacionSitio>): PublicacionSitio => ({
            id: 1, modo: 'publicar', estado: 'ok', usuario_nombre: null, commit_sha: null, url_commit: null, obras_incluidas: 0, resumen: null,
            error_codigo: null, error_mensaje: null, build_estado: 'ok', build_url: null, en_linea_at: null, created_at: '', finalizado_at: null,
            tiene_paquete: false, ...o,
        });
        expect(ultimaConProblema([])).toBeNull();
        expect(ultimaConProblema([p({ id: 1, estado: 'error' }), p({ id: 2 })])).toBeNull();
        expect(ultimaConProblema([p({ id: 2, estado: 'error' }), p({ id: 1 })])?.id).toBe(2);
        expect(ultimaConProblema([p({ id: 3, modo: 'importacion' }), p({ id: 2, build_estado: 'fallo' })])?.id).toBe(2);
        // Falló la compilación, pero el sitio ya la muestra (corrida repetida o push posterior): no hay aviso rojo.
        expect(ultimaConProblema([p({ id: 2, build_estado: 'fallo', en_linea_at: '2026-10-29T12:10:00.000Z' })])).toBeNull();
        expect(ultimaConProblema([p({ id: 3, estado: 'simulada' }), p({ id: 2, estado: 'sin_cambios' })])).toBeNull();
        expect(totalPendientes({ fotosPorAprobar: 2, obrasConCambios: 3 })).toBe(5);
        expect(totalPendientes(null)).toBe(0);
    });
});

const OBRA: ObraSitio = {
    id: 9, obra_id: 4, obra_nombre: 'ABATE MOLINA 211', slug: 'abate-molina-211', slug_congelado: true, nombre: 'Abate Molina 211',
    titular: 'Locales comerciales y oficinas, 6 pisos.', tipo: 'Edificio y oficinas', mandante: 'Electrónica Kolm Ltda.', mandante_autoriza: true,
    mandante_autoriza_por_nombre: null, mandante_autoriza_at: null, comuna: 'Santiago', direccion: 'Abate Molina 211, esquina Sazié 2605',
    superficie_m2: 581, estado: 'terminado', anio: 2018, inicio: null, servicios: ['construccion'], desafio: null, solucion: null, resultado: null,
    referencia: null, orden: 90, incluir: true, publicado_at: null, creado_por_nombre: null, actualizado_por_nombre: null,
    created_at: '', updated_at: '2026-10-29T12:00:00.000Z',
};

describe('formulario', () => {
    test('ida y vuelta: sin tocar nada, PUT no manda nada', () => {
        const f = formDesdeObra(OBRA);
        expect(formIguales(f, formDesdeObra(OBRA))).toBe(true);
        const base = cuerpoDesdeForm(f, { slugCongelado: true });
        expect(soloCambios(cuerpoDesdeForm(f, { slugCongelado: true }), base)).toEqual({});
        expect(soloCambios(cuerpoDesdeForm({ ...f, comuna: 'Providencia' }, { slugCongelado: true }), base)).toEqual({ comuna: 'Providencia' });
    });

    test('cuerpo: vacío → null, números enteros, año solo en terminadas, slug congelado no viaja', () => {
        const f = { ...formDesdeObra(OBRA), titular: '  ', superficie_m2: '6.800', anio: '2018' };
        const c = cuerpoDesdeForm(f, { slugCongelado: true });
        expect(c).toMatchObject({ titular: null, superficie_m2: 6800, anio: 2018, obra_id: 4 });
        expect(c).not.toHaveProperty('slug');
        expect(cuerpoDesdeForm({ ...f, estado: 'en_construccion' }).anio).toBeNull();
        expect(cuerpoDesdeForm({ ...f, mandante: '' }).mandante_autoriza).toBe(false);
    });

    test('obra nueva: sin dirección web la arma el servidor; sin vínculo no manda obra_id', () => {
        const c = cuerpoDesdeForm({ ...formVacio(), nombre: 'Nueva' }, { nueva: true });
        expect(c).not.toHaveProperty('slug');
        expect(c).not.toHaveProperty('obra_id');
        expect(c.servicios).toEqual(['construccion']);
        expect(cuerpoDesdeForm({ ...formVacio(), nombre: 'Nueva', slug: 'nueva-1', obra_id: 3 }, { nueva: true })).toMatchObject({ slug: 'nueva-1', obra_id: 3 });
    });

    test('errores que impiden guardar', () => {
        const ok = { ...formVacio(), nombre: 'Obra' };
        expect(erroresForm(ok, { nueva: true })).toEqual({});
        expect(Object.keys(erroresForm({ ...ok, nombre: '' }))).toEqual(['nombre']);
        expect(Object.keys(erroresForm({ ...ok, slug: 'Con Espacios' }))).toEqual(['slug']);
        expect(erroresForm({ ...ok, slug: 'ejemplo' }).slug).toContain('reservada');
        expect(Object.keys(erroresForm({ ...ok, nombre: '¡¡' }, { nueva: true }))).toEqual(['slug']);
        expect(Object.keys(erroresForm({ ...ok, superficie_m2: '12,5' }))).toEqual(['superficie_m2']);
        expect(Object.keys(erroresForm({ ...ok, anio: '1980' }))).toEqual(['anio']);
        expect([numeroDeCampo(''), numeroDeCampo('6.800'), numeroDeCampo('1.234.567'), numeroDeCampo('6.8')]).toEqual([null, 6800, 1234567, NaN]);
    });

    test('faltantes en vivo desde el formulario', () => {
        const f = { ...formVacio(), nombre: 'Gorbea 3082', comuna: 'Santiago', estado: 'contratado' as const };
        expect(faltantes(obraParaReglas(f), null)).toEqual([]);
        expect(faltantes(obraParaReglas({ ...f, estado: 'terminado' }), null).map(x => x.campo)).toEqual(['anio', 'portada']);
        expect(faltantes(obraParaReglas({ ...f, estado: 'en_construccion' }), null, { porAprobar: 1 }).map(x => x.campo)).toEqual(['portada']);
        expect(faltantes(obraParaReglas({ ...f, estado: 'en_construccion' }, 'rendersEjemplo/gorbea-3082'), null)).toEqual([]);
    });

    test('la autorización del mandante es para ese nombre', () => {
        expect(autorizacionBloqueada({ mandante: 'Kolm', mandante_autoriza: true }, 'Kolm')).toBe(false);
        expect(autorizacionBloqueada({ mandante: 'Kolm', mandante_autoriza: true }, ' Kolm  ')).toBe(false);
        expect(autorizacionBloqueada({ mandante: 'Kolm', mandante_autoriza: true }, 'Otro')).toBe(true);
        expect(autorizacionBloqueada({ mandante: 'Kolm', mandante_autoriza: false }, 'Otro')).toBe(false);
        expect(autorizacionBloqueada(null, 'Otro')).toBe(false);
    });
});

describe('vista previa (como FichaObra.astro)', () => {
    test('solo lo que se publica, en el orden de la ficha', () => {
        const v = fichaDesdeForm(formDesdeObra(OBRA));
        expect(v.datos).toEqual([
            ['Tipo de obra', 'Edificio y oficinas'],
            ['Mandante', 'Electrónica Kolm Ltda.'],
            ['Comuna', 'Santiago'],
            ['Dirección', 'Abate Molina 211, esquina Sazié 2605'],
            ['Superficie construida', '581 m²'],
            ['Año de término', '2018'],
            ['Servicios', 'Construcción'],
        ]);
        expect(v.relato).toEqual([]);
        expect(v.estado).toBe('Terminado');
    });

    test('mandante sin autorizar no sale; en proyecto dice «Inicio previsto»', () => {
        const v = fichaDesdeForm({ ...formDesdeObra(OBRA), mandante_autoriza: false, estado: 'contratado', inicio: 'Marzo 2027', desafio: 'Un terreno chico' });
        expect(v.datos.map(d => d[0])).not.toContain('Mandante');
        expect(v.datos).toContainEqual(['Inicio previsto', 'Marzo 2027']);
        expect(v.relato).toEqual([['Desafío', 'Un terreno chico']]);
    });

    test('formatos', () => {
        expect(formatoSuperficie(6800)).toBe('6.800 m²');
        expect(formatoSuperficie(1234567)).toBe('1.234.567 m²');
        expect(formatoSuperficie(581)).toBe('581 m²');
        expect(urlObraEnSitio('https://nuevo.lols.cl/', 'gorbea-3082')).toBe('https://nuevo.lols.cl/proyectos/gorbea-3082/');
    });
});
