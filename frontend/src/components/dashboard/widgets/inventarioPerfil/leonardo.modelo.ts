import type { TonoTarjeta } from '../tarjetaActiva';
import {
    TIPO, fraseItems, iniciales, masAntiguasPrimero, nombreDe, nombreLugar, plural, porRecibirCircuito, rutaLista, rutaSolicitud,
    textoDias, tonoDias, type FiltroInventario,
} from './formato';
import type { CircuitoPerfil, InventarioPerfilApi, SolicitudPerfil } from './tipos';

/**
 * Lógica PURA de VistaLeonardo (detalle «Inventario» del Inicio para quien aprueba; opción A «Lo tuyo primero» del
 * lienzo, Marcos 2026-10-22): qué pendientes se muestran y en qué orden, el tope, los textos de la cabeza, del
 * circuito, de las diferencias y de cada fila, y adónde lleva cada toque. Test en `leonardo.modelo.test.ts`.
 * Solo usa lo que trae GET /transferencias/inicio/perfil (contrato en tipos.ts): nada inventado.
 */

/** Filas a la vista en la bandeja de Leonardo; el resto, en Inventario (lienzo: TOPE_LEO). */
export const TOPE_LEO = 5;

// ─────────────────────────────── Bandeja «por aprobar» ───────────────────────────────

/** Las pendientes de la respuesta, las que llevan más días primero (empieza por arriba). */
export const porAprobar = (datos: Pick<InventarioPerfilApi, 'solicitudes'>): SolicitudPerfil[] =>
    masAntiguasPrimero(datos.solicitudes.filter(s => s.estado === 'pendiente'));

/** La pidió quien mira y no tiene `sod_bypass`: no puede aprobarla (SoD solicitante ≠ aprobador). */
export const esPropiaBloqueada = (s: Pick<SolicitudPerfil, 'puede_aprobar' | 'bloqueo_aprobar'>): boolean =>
    s.puede_aprobar === false || s.bloqueo_aprobar === 'sod_solicitante';

/** La frase junto a la cifra grande: «solicitud espera tu aprobación» / «solicitudes esperan tu aprobación». */
export const textoCifra = (n: number): string =>
    plural(n, 'solicitud espera tu aprobación', 'solicitudes esperan tu aprobación');

/**
 * La bajada bajo la frase (lienzo: «La más antigua lleva 9 días: empieza por arriba.»). `total` = cuántas esperan
 * (cifra exacta del circuito), `dias` = días de la más antigua, `propias` = cuántas pidió quien mira y no puede aprobar.
 * Sin pendientes, nada (va el vacío «Nada por aprobar»).
 */
export function bajadaPorAprobar(total: number, dias: number | null | undefined, propias = 0): string | undefined {
    if (total <= 0) return undefined;
    const d = dias ?? 0;
    const frase = total === 1
        ? (d <= 0 ? 'Es de hoy.' : `Lleva ${textoDias(d)} esperando.`)
        : (d <= 0 ? 'La más antigua es de hoy: empieza por arriba.' : `La más antigua lleva ${textoDias(d)}: empieza por arriba.`);
    if (propias <= 0) return frase;
    const nota = propias === 1
        ? (total === 1 ? 'La pediste tú: la aprueba otra persona.' : 'Una la pediste tú: la aprueba otra persona.')
        : `${propias} las pediste tú: las aprueba otra persona.`;
    return `${frase} ${nota}`;
}

/**
 * El pie de la bandeja. Sin cifra: Inventario → Pendientes pagina de a 20 y de la más nueva a la más antigua, así que
 * «Ver las 37» prometería una lista que no se ve entera. Con más de las que caben, «Ver todas en Inventario».
 */
export const textoPie = (total: number): string => (total > TOPE_LEO ? 'Ver todas en Inventario' : 'Ver en Inventario');

/**
 * Sin pendientes: «Nada por aprobar. Todo al día.» (lienzo). Si quedan diferencias sin aclarar (las resuelve él, mig
 * 131) no está «todo al día»: solo «Nada por aprobar.» y la fila roja de abajo dice lo que falta.
 */
export const textoVacio = (diferencias: number): string =>
    (diferencias > 0 ? 'Nada por aprobar.' : 'Nada por aprobar. Todo al día.');

/**
 * Hay pendientes (cifra exacta del circuito) pero ninguna vino en la lista (tope o datos de otro momento): en vez de una
 * lista vacía, adónde ir.
 */
export const TEXTO_FUERA_DE_LISTA = 'No alcanzan a mostrarse aquí: están en Inventario → Pendientes.';

/** Píldora de la derecha en el computador: «9 días esperando» / «de hoy». */
export const textoEspera = (dias: number): string => (dias <= 0 ? 'de hoy' : `${textoDias(dias)} esperando`);

/** Nota apagada en lugar de «Aprobar o rechazar» cuando la pidió quien mira (SoD). */
export const NOTA_PROPIA = 'La pediste tú: la aprueba otra persona';
/** La misma nota, corta (celular y pantallas medianas, en lugar de «Revisar →»). */
export const NOTA_PROPIA_CORTA = 'La pediste tú';

/**
 * Palabras que dicen un CARGO (lo que la persona hace en la obra), al comienzo de una palabra. `roles.nombre` es un rol
 * de ACCESO: muchos son genéricos («En Terreno», «Administrador») y no dicen quién es la persona.
 */
const CARGO = /(^|[^a-záéíóúüñ])(jef[ae](?![a-záéíóúüñ])|prevenci|bodeguer|capataz|supervis|encargad|residente|administradora? de obra|ingenier|arquitect|t[eé]cnic|conductor|operador|maestr|gerente|inspector|top[oó]graf|dibujant)/;

/**
 * El «cargo» que va junto al nombre (lienzo: «Carla Soto · Prevencionista»). La app no guarda cargo de los usuarios: lo
 * más cercano es el nombre de su rol. Se muestra SOLO si se lee como un cargo («Jefe de Obra», «Jefe Obra»,
 * «Prevencionista», «Bodeguero», «Supervisor…»); un rol de acceso («En Terreno», «Administrador», «Super Administrador»,
 * «Operaciones») no va: entonces la fila lleva solo el nombre. null si no hay rol o no es un cargo.
 */
export function cargoDe(rol?: string | null): string | null {
    const texto = rol?.trim();
    if (!texto) return null;
    return CARGO.test(texto.toLowerCase()) ? texto : null;
}

/** Todo lo que dibuja una fila de la bandeja (lienzo: FilaPorAprobar). */
export interface FilaPorAprobarModelo {
    id: number;
    codigo: string;
    /** Obra (o bodega, con su responsable como el resto de la app) de destino; si la app no la tiene, el código. */
    lugar: string;
    /** El código va también en la línea de las píldoras (desde 768 px); no si ya es el título (sin destino). */
    codigoAparte: boolean;
    /** Nombre de quien pidió (null si la app no lo guardó). */
    solicitante: string | null;
    /** Iniciales para el círculo ('' sin nombre). */
    iniciales: string;
    /** «Carla Soto · Prevencionista» (el rol solo si es un cargo, `cargoDe`; sin rol, solo el nombre; sin nada, vacío). */
    quien: string;
    /** «Arnés de seguridad ×6, Casco con barbiquejo ×10 y 1 ítem más». */
    items: string;
    tipo: string;
    dias: number;
    /** Color de los días: gris hasta 7, ámbar 8-30, rojo más de 30. */
    tono: TonoTarjeta;
    /** El círculo se pone rojo con más de 30 días. */
    tonoCirculo: TonoTarjeta;
    /** «9 días» (celular y pantallas medianas). */
    textoDias: string;
    /** «9 días esperando» (computador). */
    textoEspera: string;
    /** La más antigua de varias: lleva la píldora «La más antigua». */
    masAntigua: boolean;
    /** La pidió quien mira (SoD): nota apagada en vez del botón. */
    propia: boolean;
    /**
     * Al tocarla se resuelve AQUÍ (el dueño 2026-10-23): se despliega bajo la fila el detalle real de Inventario para
     * aprobarla o rechazarla. Una propia (SoD) no: no se ofrece aprobar y la fila abre la solicitud en Inventario, como antes.
     */
    resuelveAqui: boolean;
    /** Abre Inventario → Solicitudes con esta solicitud (para aprobarla o rechazarla, o solo verla). */
    ruta: string;
}

/** Arma la fila `i` de la bandeja ya ordenada (`total` = cuántas filas tiene la bandeja). */
export function filaPorAprobar(s: SolicitudPerfil, i: number, total: number): FilaPorAprobarModelo {
    const solicitante = nombreDe(s.solicitante);
    const cargo = cargoDe(s.solicitante?.rol);
    const destino = nombreLugar(s.destino, { conResponsable: true });
    return {
        id: s.id,
        codigo: s.codigo,
        lugar: destino ?? s.codigo,
        codigoAparte: destino != null,
        solicitante,
        iniciales: solicitante ? iniciales(solicitante) : '',
        quien: [solicitante, cargo].filter(Boolean).join(' · '),
        items: fraseItems(s.items) || 'Sin ítems registrados',
        tipo: TIPO[s.tipo] ?? TIPO.materiales,
        dias: s.dias,
        tono: tonoDias(s.dias),
        tonoCirculo: s.dias > 30 ? 'rojo' : 'neutro',
        textoDias: textoDias(s.dias),
        textoEspera: textoEspera(s.dias),
        masAntigua: i === 0 && total > 1,
        propia: esPropiaBloqueada(s),
        resuelveAqui: !esPropiaBloqueada(s),
        ruta: rutaSolicitud(s),
    };
}

// ─────────────────────────────── Aprobar o rechazar aquí (2026-10-23) ───────────────────────────────

/**
 * El dueño (2026-10-23): «cuando haga clic en el botón de aprobar o rechazar te abra en el mismo lugar como un despliegue
 * sobre ese pendiente para resolver enseguida y no me lleve hasta Inventario». Bajo la fila tocada (una abierta a la
 * vez) va el detalle REAL de Inventario (TransferenciaDetail, con su «Revisar y aprobar» y «Rechazar», sus validaciones
 * de stock, origen y SoD), envuelto por ResolverSolicitud.tsx.
 */
export const ROTULO_RESOLVER = 'Aprobar o rechazar aquí';

/**
 * Nota del despliegue cuando el Super Administrador mira «Ver como → quien aprueba»: lo que haga ahí es de verdad y
 * queda a SU nombre (no al de quien aprueba).
 */
export const NOTA_RESOLVER_VER_COMO = 'Es de verdad: lo que apruebes o rechaces aquí queda a tu nombre.';

/** Lo que, hecho en el despliegue y con éxito, lo cierra y vuelve a pedir el Inicio (la fila sale de la lista). */
export type AccionResuelta = 'aprobar' | 'rechazar' | 'recibir_total' | 'recibir_parcial' | 'rechazar_recepcion' | 'cancelar' | 'eliminar';

/** El modal-resumen con WhatsApp que Inventario abre tras la acción (TransferenciasPanel): solo al aprobar y al recibir. */
export type ResumenTrasAccion = 'aprobar' | 'recibir_total' | 'recibir_parcial';

/** Qué resumen abre cada acción (null: solo el aviso que ya da Inventario, p. ej. «Transferencia rechazada»). */
export const resumenTrasAccion = (a: AccionResuelta): ResumenTrasAccion | null =>
    (a === 'aprobar' || a === 'recibir_total' || a === 'recibir_parcial' ? a : null);

/** La fila abierta, solo si sigue en la bandeja (tras «Actualizar» o lo que resolvió otra persona, puede haber salido). */
export const abiertaVigente = (abierta: number | null | undefined, ids: readonly number[]): number | null =>
    (abierta != null && ids.includes(abierta) ? abierta : null);

// ─────────────────────────────── Franja del circuito ───────────────────────────────

/** Pedida → Aprobada → Recibida (don Luis 2026-10-23: bodegueros y conductores fuera del ciclo; sin «Despachada»). */
export type Paso = 'pedida' | 'aprobada' | 'recibida';

/** Una etapa del circuito tal como se dibuja. */
export interface PasoCircuito {
    key: Paso;
    texto: string;
    /** La bajada de siempre («por aprobar», «por recibir», «en octubre»). */
    bajada: string;
    total: number;
    /** Días de la más antigua en esa etapa (solo las en curso; null en Recibida o sin ninguna). */
    hasta: number | null;
    /** Al tocarla: Inventario → Solicitudes con este filtro. */
    ruta: string;
    /**
     * Qué lista abre, dicho tal cual (para el lector de pantalla y el `title`): si alguna por recibir está en tránsito,
     * «Aprobada» abre «Todas» (el filtro «Aprobadas» de Inventario no la muestra) y «Recibidas» es de todos los meses.
     */
    abre: string;
}

const MESES_LARGOS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** '2026-10-22' → «octubre». Vacío si no es una fecha. */
export function mesLargo(iso?: string | null): string {
    const m = /^\d{4}-(\d{2})-\d{2}/.exec((iso ?? '').trim());
    const mes = m ? Number(m[1]) : 0;
    return mes >= 1 && mes <= 12 ? MESES_LARGOS[mes - 1] : '';
}

/** El filtro de Inventario → Solicitudes de cada etapa (StatusFilterBar) y cómo se dice qué abre. */
const LISTA_PASO: Record<Paso, { filtro: FiltroInventario; abre: string }> = {
    pedida: { filtro: 'pendiente', abre: 'Abre «Pendientes» en Inventario' },
    aprobada: { filtro: 'aprobada', abre: 'Abre «Aprobadas» en Inventario' },
    recibida: { filtro: 'recibida', abre: 'Abre «Recibidas» en Inventario, de todos los meses' },
};

/** «Aprobada» cuando alguna por recibir está en tránsito: el filtro «Aprobadas» de Inventario no la muestra. */
const APROBADA_CON_TRANSITO = { filtro: 'todas', abre: 'Abre «Todas» en Inventario: algunas por recibir no están en «Aprobadas»' } as const;

/**
 * Las tres etapas Pedida → Aprobada → Recibida con las cifras exactas del servidor (don Luis 2026-10-23: bodegueros y
 * conductores fuera del ciclo de solicitud, sin «Despachada»). «Aprobada · por recibir» cuenta también las que el
 * servidor manda como despachadas (en tránsito o con una parte recibida: envío directo u orden de gerencia), con los días
 * de la más antigua de las dos (`porRecibirCircuito`). Dice «por recibir» (no «aún sin salir», del lienzo): lo que se
 * sabe es que nadie la ha recibido.
 */
export function pasosCircuito(c: CircuitoPerfil, hoy: string): PasoCircuito[] {
    const mes = mesLargo(hoy);
    const enTransito = (c.despachada?.total ?? 0) > 0;
    const paso = (key: Paso, texto: string, bajada: string, total: number, hasta: number | null): PasoCircuito => {
        const lista = key === 'aprobada' && enTransito ? APROBADA_CON_TRANSITO : LISTA_PASO[key];
        return { key, texto, bajada, total, hasta: total > 0 ? hasta : null, ruta: rutaLista(lista.filtro), abre: lista.abre };
    };
    const a = porRecibirCircuito(c);
    return [
        paso('pedida', 'Pedida', 'por aprobar', c.pedida.total, c.pedida.dias),
        paso('aprobada', 'Aprobada', 'por recibir', a.total, a.dias),
        paso('recibida', 'Recibida', mes ? `en ${mes}` : 'este mes', c.recibida.total, null),
    ];
}

/** Bajo una etapa en curso (desde 640 px): «hasta 9 días»; si la más antigua es de hoy, «de hoy». */
export const textoHasta = (dias: number): string => (dias <= 0 ? 'de hoy' : `hasta ${textoDias(dias)}`);

/** La etapa marcada: su color, la bajada que se ve y lo que oye el lector de pantalla en lugar de la bajada. */
export interface MarcaPaso {
    tono: TonoTarjeta;
    bajada: string;
    aria: string;
}

/**
 * La marca de «Pedida» en la vista de Leonardo: ámbar con pendientes («estas son ↓», con una sola «esta es ↓»); sin
 * ninguna, gris «al día» (nada pendiente: no va en ámbar).
 */
export function marcaPedida(total: number): MarcaPaso {
    if (total <= 0) return { tono: 'neutro', bajada: 'al día', aria: 'al día' };
    return total === 1
        ? { tono: 'ambar', bajada: 'esta es ↓', aria: 'por aprobar, es la de la lista' }
        : { tono: 'ambar', bajada: 'estas son ↓', aria: 'por aprobar, son las de la lista' };
}

/** Nombre del circuito para lectores de pantalla. */
export const etiquetaCircuito = (todas: boolean): string =>
    (todas ? 'Circuito de la solicitud, todas las obras' : 'Circuito de la solicitud, lo que puedes ver');

/**
 * El `aria-label` de una etapa: «Pedida: 6, por aprobar, son las de la lista. Abre «Pendientes» en Inventario».
 * `marca` = la de la etapa marcada (su `aria` va en lugar de la bajada).
 */
export const etiquetaPaso = (p: Pick<PasoCircuito, 'texto' | 'total' | 'bajada' | 'abre'>, marca?: Pick<MarcaPaso, 'aria'>): string =>
    `${p.texto}: ${p.total}, ${marca?.aria ?? p.bajada}. ${p.abre}`;

/** El pie de la bandeja lleva a la lista de pendientes. */
export const RUTA_POR_APROBAR = rutaLista('pendiente');

// ─────────────────────────────── Diferencias, aparte del circuito ───────────────────────────────

/** Inventario → Diferencias: quien aprueba es quien las resuelve (mig 131) y ve esa pestaña. */
export const RUTA_DIFERENCIAS = rutaLista('discrepancias');

export interface AvisoDiferencias {
    /** Solicitudes con alguna diferencia pendiente ≠ 0: la cifra de «Diferencias por resolver» de la tarjeta de arriba. */
    total: number;
    titulo: string;
    bajada: string;
    ruta: string;
}

/**
 * La fila roja bajo el circuito (lienzo: DiferenciasAparte, la misma de las otras vistas): «4 diferencias sin aclarar» ·
 * «Lo que llegó no calza con lo enviado · la más antigua, hace 14 días». Cuenta SOLICITUDES (`circuito.diferencias.total`),
 * como la tarjeta del Inicio y la pestaña «Diferencias»: así la tarjeta de arriba («10 por resolver») = por aprobar (6) +
 * diferencias (4). null sin diferencias.
 */
export function avisoDiferencias(d: CircuitoPerfil['diferencias']): AvisoDiferencias | null {
    const n = d.total || 0;
    if (n <= 0) return null;
    const dias = d.dias ?? null;
    const cuando = dias == null ? ''
        : n === 1 ? (dias <= 0 ? ' · es de hoy' : ` · hace ${textoDias(dias)}`)
            : (dias <= 0 ? ' · la más antigua es de hoy' : ` · la más antigua, hace ${textoDias(dias)}`);
    return {
        total: n,
        titulo: `${n} ${plural(n, 'diferencia sin aclarar', 'diferencias sin aclarar')}`,
        bajada: `Lo que llegó no calza con lo enviado${cuando}`,
        ruta: RUTA_DIFERENCIAS,
    };
}
