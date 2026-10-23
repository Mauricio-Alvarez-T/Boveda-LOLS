/**
 * Contrato de GET /api/transferencias/inicio/perfil → `{ data: InventarioPerfilApi }`
 * (backend: transferenciaService.inicioPerfil; reglas: docs/reglas/inventario-transferencias.md § Inicio por perfil).
 *
 * Todo lo que necesitan las tres vistas del detalle «Inventario» del Inicio en una sola respuesta:
 *   - Leonardo López (quien aprueba) → opción A del lienzo («VistaLeonardo»).
 *   - Daphne Lazcano (jefatura: «Ver diferencias» sin aprobar) → opción B («Jefatura»).
 *   - Jefes de obra y prevencionistas → opción A («VistaObra»).
 *
 * Reglas del contrato:
 *   - Alcance = el de GET /:id en producción: con `ver_todas`, todas las obras; sin él, las solicitudes propias y, si
 *     tiene bodega asignada, las destinadas a su bodega. Todo lo que viene se puede abrir con GET /:id.
 *   - Fechas: 'YYYY-MM-DD' en la hora local del servidor (Chile). Días: enteros ≥ 0 calculados en el servidor con la
 *     misma fecha de `hoy`.
 *   - Cantidades: números (los DECIMAL ya convertidos). `null` = la app no lo registró (no es 0).
 *   - Nunca hay dinero (valores, costos): no está en el SQL ni en el JSON.
 *   - Lo que la app NO registra no viene: los WhatsApp no quedan guardados (no hay «le preguntó a…»). Los usuarios
 *     tampoco tienen teléfono: los botones de WhatsApp abren el mensaje y la persona elige el contacto.
 *   - Sin obras de prueba ni obras finalizadas (como la tarjeta del Inicio).
 */

/** Estado de una solicitud que puede venir (las canceladas no vienen). */
export type EstadoSolicitudPerfil = 'pendiente' | 'aprobada' | 'en_transito' | 'recepcion_parcial' | 'recibida' | 'rechazada';

/**
 * Etapa del circuito Pedida → Aprobada → Despachada → Recibida:
 * pendiente → pedida · aprobada → aprobada (aún sin salir) · en_transito y recepcion_parcial → despachada ·
 * recibida → recibida · rechazada → rechazada (fuera del circuito).
 */
export type EtapaPerfil = 'pedida' | 'aprobada' | 'despachada' | 'recibida' | 'rechazada';

/** `tipo_flujo` de la tabla transferencias. */
export type TipoFlujoPerfil =
    | 'solicitud' | 'solicitud_materiales' | 'push_directo' | 'intra_bodega' | 'intra_obra' | 'orden_gerencia' | 'devolucion';

/**
 * Lo que se pidió, en palabras del lienzo:
 *   - `materiales`: materiales de construcción (`solicitud_materiales`: solo ítems personalizados, se compran).
 *   - `herramientas`: lleva ítems del catálogo de Inventario (equipos y herramientas: andamios, moldajes, betoneras…).
 */
export type TipoSolicitudPerfil = 'materiales' | 'herramientas';

/** Perfil que eligió el servidor según los permisos: qué vista mostrar. */
export type PerfilInventario =
    /** Tiene `inventario.transferencias.aprobar` (Leonardo; también el Super Administrador). */
    | 'aprueba'
    /** Tiene `inventario.transferencias.diferencias_ver` sin aprobar (Daphne). */
    | 'jefatura'
    /** El resto: pide y recibe (jefes de obra, prevencionistas, bodegueros). */
    | 'obra';

/** Un usuario de la app (sin teléfono: no está en la BD). */
export interface PersonaPerfil {
    id: number;
    nombre: string | null;
}

/**
 * Quien pidió: además su rol en la app (roles.nombre). Es un rol de ACCESO, no un cargo: puede decir quién es («Jefe de
 * Obra», «Bodeguero») o ser genérico («En Terreno», «Administrador»). Para el «cargo» del lienzo, `cargoDe` de
 * leonardo.modelo.ts (solo si se lee como un cargo).
 */
export interface SolicitantePerfil extends PersonaPerfil {
    rol: string | null;
}

/** Un paso hecho: quién y cuándo. Cualquiera de los dos puede faltar si la app no lo guardó. */
export interface PasoPerfil {
    por: PersonaPerfil | null;
    fecha: string | null;
}

/** Origen o destino: una obra o una bodega. */
export interface LugarPerfil {
    tipo: 'obra' | 'bodega';
    id: number;
    nombre: string | null;
    /**
     * Solo bodegas: responsable (texto libre, mig 060) o null. Para mostrarla como el resto de la app:
     * formatBodegaNombreResponsable(nombre, responsable) de utils/formatBodega.ts.
     */
    responsable: string | null;
}

/** Un ítem de la solicitud. Sin valores ni costos. */
export interface ItemPerfil {
    /** Única dentro de la solicitud ('c12' catálogo · 'p5' personalizado): sirve de `key`. */
    clave: string;
    /** true = ítem personalizado (fuera del catálogo, «materiales de construcción»). */
    personalizado: boolean;
    descripcion: string;
    /** Como se guardó ('UN', 'SACO', 'M3', 'KG'…); null si no tiene. */
    unidad: string | null;
    /** Lo que se pidió. */
    pedida: number;
    /**
     * Lo que sale (catálogo: cantidad_enviada al aprobar; personalizado: cantidad aprobada). null = aún no se aprueba o no
     * se registró. Un 0 es un 0 de verdad (el aprobador lo cortó a 0): no usar `||`.
     */
    enviada: number | null;
    /** Lo que llegó. null hasta la primera recepción (en_transito/aprobada/pendiente/rechazada). */
    recibida: number | null;
}

export interface SolicitudPerfil {
    id: number;
    codigo: string;
    estado: EstadoSolicitudPerfil;
    etapa: EtapaPerfil;
    tipo_flujo: TipoFlujoPerfil | null;
    tipo: TipoSolicitudPerfil;
    /**
     * null mientras está pendiente en una solicitud normal (el origen lo decide quien aprueba). Es el origen «principal»
     * de la cabecera: el primero con cantidad de la aprobación.
     */
    origen: LugarPerfil | null;
    /**
     * Cuántos lugares MÁS, además de `origen`, de donde sale (la aprobación puede sacar de varias bodegas y obras: los
     * splits de transferencia_item_origenes, el origen de cada ítem y el de los personalizados que salen de una obra).
     * 0 con uno solo o ninguno. El servidor lo manda siempre; opcional solo para datos armados a mano (banco, tests).
     */
    origenes_extra?: number;
    destino: LugarPerfil | null;
    solicitante: SolicitantePerfil | null;
    /** La pidió quien mira. */
    propia: boolean;
    fecha_solicitud: string | null;
    /**
     * Quién aprobó y cuándo. En una RECHAZADA la app pisa la fecha de aprobación con la del rechazo: aquí viene
     * `fecha: null` y `por` solo si había sido aprobada antes (si no, `aprobacion` es null).
     */
    aprobacion: PasoPerfil | null;
    /**
     * Quién despachó y cuándo. OJO: la interfaz no tiene «Despachar» desde 2026-04-14 (recibir() acepta una aprobada),
     * así que muchas llegan a recibidas sin despacho: entonces es null. Push directo y orden de gerencia sí lo traen.
     */
    despacho: PasoPerfil | null;
    /** Quién cerró la recepción (recibida) y cuándo. En una recepción parcial aún es null: ver `ultima_recepcion`. */
    recepcion: PasoPerfil | null;
    /** Solo `recepcion_parcial`: el último viaje recibido (quién y cuándo). */
    ultima_recepcion: PasoPerfil | null;
    /** Solo rechazadas: quién, cuándo y el motivo que escribió (puede ser null). */
    rechazo: { por: PersonaPerfil | null; fecha: string | null; motivo: string | null } | null;
    /**
     * Días en la etapa actual, contados en el servidor: pendiente desde la solicitud; aprobada desde la aprobación;
     * despachada desde el despacho (o la aprobación, si no hubo despacho); recibida desde la recepción; rechazada desde
     * el rechazo.
     */
    dias: number;
    /** Recibida o rechazada este mes (según `hoy`). */
    del_mes: boolean;
    /**
     * Solo pendientes y si quien mira tiene `aprobar`: true = puede aprobarla o rechazarla; false = la pidió él mismo y
     * no tiene `sod_bypass` (SoD: solicitante ≠ aprobador): mostrar la nota en vez del botón. null = no aplica.
     * El servidor lo vuelve a validar al aprobar.
     */
    puede_aprobar: boolean | null;
    bloqueo_aprobar: 'sod_solicitante' | null;
    /** Catálogo primero, después personalizados (los que quien aprobó quitó no vienen). */
    items: ItemPerfil[];
}

/** Una diferencia pendiente (≠ 0) de un ítem: lo que llegó no calza con lo enviado. */
export interface DiferenciaPerfil {
    /** id de la diferencia (transferencia_discrepancias). */
    id: number;
    transferencia_id: number;
    codigo: string;
    descripcion: string;
    unidad: string | null;
    enviada: number;
    /** Lo que declaró quien recibió. */
    recibida: number;
    /** enviada − recibida: positivo = faltan; negativo = llegaron de más. */
    diferencia: number;
    /** Cuántas faltan (≥ 0). */
    faltan: number;
    /** Cuántas llegaron de más (≥ 0). */
    sobran: number;
    /** Origen de la solicitud (cabecera) y destino. */
    origen: LugarPerfil | null;
    destino: LugarPerfil | null;
    aprobacion: PasoPerfil | null;
    /** null si no se registró despacho (ver SolicitudPerfil.despacho). */
    despacho: PasoPerfil | null;
    /** Quién anotó lo que llegó (la recepción que cerró) y cuándo. */
    recepcion: PasoPerfil | null;
    /** Días desde la recepción. */
    dias: number;
}

/** Una etapa del circuito: cuántas y los días de la más antigua (null si no hay ninguna). */
export interface EtapaCircuitoPerfil {
    total: number;
    dias: number | null;
}

export interface CircuitoPerfil {
    /** pendientes (por aprobar). */
    pedida: EtapaCircuitoPerfil;
    /** aprobadas que aún no salen. */
    aprobada: EtapaCircuitoPerfil;
    /** en tránsito o con recepción parcial. */
    despachada: EtapaCircuitoPerfil;
    /** `total` = recibidas ESTE mes; `ultima` = fecha de la última recibida (de cualquier mes; null si nunca). */
    recibida: { total: number; ultima: string | null };
    /**
     * Aparte del circuito: `total` = solicitudes con alguna diferencia pendiente ≠ 0 (como la tarjeta del Inicio),
     * `items` = cuántos ítems con diferencia suman, `dias` = desde la recepción de la más antigua. Viene para TODOS los
     * perfiles con su alcance (para el aviso «1 diferencia sin aclarar» de la obra), aunque no vean la lista.
     */
    diferencias: EtapaCircuitoPerfil & {
        items: number;
        /**
         * id de la solicitud con la diferencia pendiente más antigua (la de `dias`); null sin diferencias. El aviso de la
         * vista de obra la abre (quien no ve diferencias no tiene la lista, pero sí puede abrir su solicitud). El servidor
         * lo manda siempre; opcional solo para datos armados a mano (banco de pruebas, tests).
         */
        mas_antigua_id?: number | null;
    };
}

export interface PuedePerfil {
    aprobar: boolean;
    /** `aprobar` o `diferencias_ver`: viene la lista `diferencias`. */
    ver_diferencias: boolean;
    /** Solo `aprobar` (resolver o descartar una diferencia). */
    resolver_diferencias: boolean;
    /** «Pedir materiales»: `transferencias.solicitar` o `transferencias.solicitud_materiales`. */
    solicitar: boolean;
    recibir: boolean;
    sod_bypass: boolean;
}

/** Topes de las listas (las cifras de `circuito` son exactas; si una lista llega al tope, el resto está en Inventario). */
export interface LimitesPerfil {
    /**
     * Tope POR ETAPA en curso (pendientes · aprobadas · despachadas, cada una las más antiguas primero): las aprobadas
     * viejas no dejan fuera las pendientes.
     */
    en_curso: number;
    /** recibidas leídas, las más nuevas primero… */
    recibidas: number;
    /** …de las que vienen las del mes y, como mínimo, estas últimas. */
    recibidas_recientes: number;
    /** rechazadas de este mes. */
    rechazadas: number;
    diferencias: number;
    aprobadores: number;
}

export interface InventarioPerfilApi {
    /** Hoy en el servidor ('YYYY-MM-DD'), la fecha con que se contaron los días. */
    hoy: string;
    perfil: PerfilInventario;
    /** rol 1 (Marcos y Mauricio): ven todo; su vista propia es aparte. */
    super_admin: boolean;
    /** `todas` = con `ver_todas`. Sin él: propias y, si `bodega_id`, también las destinadas a esa bodega. */
    alcance: { todas: boolean; bodega_id: number | null };
    /** Obra asignada a quien mira (la de su sesión); null si no tiene. Solo da el nombre: no amplía el alcance. */
    obra: { id: number; nombre: string | null } | null;
    puede: PuedePerfil;
    /**
     * Quiénes aprueban hoy (permiso efectivo `aprobar`, sin el Super Administrador), por nombre. Para «Esperando a
     * Leonardo» y «Apurar a Leonardo». Vacío si nadie (p. ej. en test): usar un texto sin nombre.
     */
    aprobadores: PersonaPerfil[];
    circuito: CircuitoPerfil;
    /**
     * Una sola lista, en este orden: en curso (pendientes, aprobadas y despachadas, las más antiguas primero), recibidas
     * (las del mes y como mínimo las 10 últimas, las más nuevas primero) y rechazadas de este mes (las más nuevas primero).
     */
    solicitudes: SolicitudPerfil[];
    /** Solo con `aprobar` o `diferencias_ver` (las más antiguas primero); null sin esos permisos. */
    diferencias: DiferenciaPerfil[] | null;
    limites: LimitesPerfil;
}

/** Respuesta HTTP completa. */
export interface RespuestaInventarioPerfil {
    data: InventarioPerfilApi;
}
