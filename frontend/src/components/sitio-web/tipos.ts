/**
 * Tipos de /api/sitio-web (mig 147, docs/reglas/sitio-web.md). Las formas son las de
 * `backend/src/routes/sitio-web.routes.js` y sus services: si allá cambia un campo, cambia aquí.
 * Archivo sin JSX ni `import.meta`: lo usan `reglas.ts` y su test (jest en node).
 */
// Los estados con badge (StatusBadge) viven en src/types/sitioWeb.ts: utils/statusConfig.ts los usa sin depender de
// esta carpeta.
import type { EstadoDerivado, EstadoFoto, EstadoPublicacion } from '../../types/sitioWeb';

export type { EstadoDerivado, EstadoFoto, EstadoPublicacion };

/** Estados de la obra en la Bóveda (en el JSON del sitio: en-curso · contratado · terminado). */
export type EstadoObra = 'en_construccion' | 'contratado' | 'terminado';

export type ModoSitio = 'publicar' | 'simulacion';
export type MotivoModo = 'modo_simulacion' | 'sin_token' | 'sin_rama' | 'repo_invalido' | 'entorno_no_produccion' | 'repo_publico_no_permitido';

export type ModoPublicacion = 'publicar' | 'simulacion' | 'importacion';
/** Compilación del sitio en GitHub Actions (null = todavía no se consultó). */
export type EstadoBuild = 'en_cola' | 'compilando' | 'ok' | 'fallo' | 'reemplazada';

export interface Faltante { campo: string; mensaje: string }

export interface CatalogosSitio {
    estados: { valor: EstadoObra; sitio: string; etiqueta: string }[];
    tipos: string[];
    servicios: { slug: string; nombre: string }[];
    largos: Record<'slug' | 'nombre' | 'titular' | 'mandante' | 'comuna' | 'direccion' | 'inicio' | 'desafio' | 'solucion' | 'resultado' | 'alt', number>;
    altMin: number;
    anio: { min: number; max: number };
    foto: { anchos: number[]; minAncho: number; maxBytes: number; mimes: string[] };
}

/** GET /config. Nunca trae el token. */
export interface ConfigSitio {
    modo: ModoSitio;
    motivo: MotivoModo | null;
    repo: string;
    rama: string;
    urlSitio: string;
    tokenVenceEnDias: number | null;
    catalogos: CatalogosSitio;
}

/** Una fila de GET /obras. */
export interface ObraSitioLista {
    id: number;
    slug: string;
    nombre: string;
    estado: EstadoObra;
    comuna: string | null;
    orden: number;
    incluir: boolean;
    vinculada: boolean;
    tiene_portada: boolean;
    portada_id: number | null;
    referencia: string | null;
    fotos_por_aprobar: number;
    faltantes: Faltante[];
    estadoDerivado: EstadoDerivado;
    publicado_at: string | null;
    updated_at: string;
}

export interface ObraSitio {
    id: number;
    obra_id: number | null;
    /** Nombre de la obra vinculada de la Bóveda: solo con `obras.ver`. */
    obra_nombre: string | null;
    slug: string;
    slug_congelado: boolean;
    nombre: string;
    titular: string | null;
    tipo: string | null;
    mandante: string | null;
    mandante_autoriza: boolean;
    mandante_autoriza_por_nombre: string | null;
    mandante_autoriza_at: string | null;
    comuna: string | null;
    direccion: string | null;
    superficie_m2: number | null;
    estado: EstadoObra;
    anio: number | null;
    inicio: string | null;
    servicios: string[];
    desafio: string | null;
    solucion: string | null;
    resultado: string | null;
    referencia: string | null;
    orden: number;
    incluir: boolean;
    publicado_at: string | null;
    creado_por_nombre: string | null;
    actualizado_por_nombre: string | null;
    created_at: string;
    updated_at: string;
}

/** Foto de una obra en la pantalla: nunca trae la ruta ni el hash. */
export interface FotoSitio {
    id: number;
    rol: string;
    alt: string | null;
    ancho: number;
    alto: number;
    tamano_bytes: number;
    /** El 1.jpg que traía la obra importada del sitio. */
    heredada: boolean;
    estado: EstadoFoto;
    vigente: boolean;
    /** El sitio la muestra hoy (la nombra lo publicado): no se borra; para sacarla, se rechaza y se publica. */
    publicada: boolean;
    publicable: boolean;
    sin_personas_confirmado: boolean;
    confirmado_por_nombre: string | null;
    confirmado_at: string | null;
    subido_por: number | null;
    subido_por_nombre: string | null;
    aprobada_por_nombre: string | null;
    aprobada_at: string | null;
    rechazada_por_nombre: string | null;
    rechazada_at: string | null;
    created_at: string;
}

export interface EntradaHistorial {
    id: number;
    entidad: string;
    entidad_id: number | null;
    accion: string;
    resumen: string;
    detalle: unknown;
    created_at: string;
    usuario_nombre: string | null;
}

/** El JSON tal como sale a src/content/obras/<slug>.json. */
export interface JsonObraSitio {
    slug: string;
    orden: number;
    estado: 'en-curso' | 'contratado' | 'terminado';
    nombre: string;
    titular: string | null;
    tipo: string | null;
    mandante: string | null;
    comuna: string | null;
    direccion: string | null;
    superficieM2: number | null;
    anio: number | null;
    inicio: string | null;
    servicios: string[];
    desafio: string | null;
    solucion: string | null;
    resultado: string | null;
    fotos: { src: string; alt: string; srcset?: string; width?: number; height?: number }[];
    referencia?: string;
}

/** GET /obras/:id. */
export interface DetalleObraSitio {
    obra: ObraSitio;
    fotos: FotoSitio[];
    portada_id: number | null;
    faltantes: Faltante[];
    estadoDerivado: EstadoDerivado;
    /** Lo que se publicaría hoy (null si le falta algo). */
    json: JsonObraSitio | null;
    json_publicado: JsonObraSitio | null;
    historial: EntradaHistorial[];
}

export interface ObraDisponible { id: number; nombre: string; finalizada: boolean }

/** GET /obras/sugerencias/:obraId. La superficie solo viene con `costos.gestionar`. */
export interface SugerenciasObra {
    obra_id: number;
    nombre: string;
    slug: string;
    direccion: string | null;
    estado: EstadoObra;
    anio: number | null;
    inicio: string | null;
    superficie_m2?: number | null;
}

/* ──────────────── publicación ──────────────── */

export interface ItemObra { id: number; slug: string; nombre: string }

export interface CambiosPublicacion {
    nuevas: ItemObra[];
    cambiadas: ItemObra[];
    retiradas: { id: number | null; slug: string; nombre: string | null }[];
    mantienen: (ItemObra & { faltantes?: Faltante[] })[];
    excluidas: (ItemObra & { motivo: 'faltan_datos' | 'foto_rechazada'; faltantes?: Faltante[] })[];
    iguales: number;
}

/** GET /publicacion/previa (sin GitHub). */
export interface PreviaPublicacion {
    modo: ModoSitio;
    motivo: MotivoModo | null;
    base: { id: number; modo: ModoPublicacion; commit_sha: string | null; created_at: string } | null;
    cambios: CambiosPublicacion;
    archivos: { escribir: string[]; borrar: string[] };
    obras_incluidas: number;
    bloqueos: string[];
    avisos: string[];
    hay_cambios: boolean;
}

/** POST /publicar: siempre 200, también cuando falla (estado 'error' + código). */
export interface ResultadoPublicacion {
    id: number;
    modo: ModoSitio;
    estado: EstadoPublicacion;
    commit_sha: string | null;
    url_commit: string | null;
    obras_incluidas: number;
    cambios: CambiosPublicacion;
    archivos: { escribir: number; borrar: number };
    avisos: string[];
    paquete: boolean;
    error_codigo: string | null;
    error_mensaje: string | null;
    conciliadas: { id: number; estado: string }[];
}

/** Una fila de GET /publicaciones (las últimas 20). */
export interface PublicacionSitio {
    id: number;
    modo: ModoPublicacion;
    estado: EstadoPublicacion;
    usuario_nombre: string | null;
    commit_sha: string | null;
    url_commit: string | null;
    obras_incluidas: number;
    resumen: string | null;
    error_codigo: string | null;
    error_mensaje: string | null;
    build_estado: EstadoBuild | null;
    build_url: string | null;
    en_linea_at: string | null;
    created_at: string;
    finalizado_at: string | null;
    tiene_paquete: boolean;
}

export type EstadoPaso = 'ok' | 'pendiente' | 'no_llego' | EstadoBuild;

/** GET /publicaciones/:id (pone al día la compilación y el «en línea» mientras no termina). */
export interface DetallePublicacion extends PublicacionSitio {
    repo: string;
    rama: string;
    parent_sha: string | null;
    pasos: { clave: 'commit' | 'compilacion' | 'en_linea'; estado: EstadoPaso }[];
    terminada: boolean;
    detalle: {
        nuevas?: ItemObra[];
        cambiadas?: ItemObra[];
        retiradas?: { id: number | null; slug: string; nombre: string | null }[];
        mantienen?: ItemObra[];
        excluidas?: (ItemObra & { motivo?: string })[];
        escribir?: string[];
        borrar?: string[];
        [k: string]: unknown;
    } | null;
    aviso: string | null;
}

/** GET /pendientes (badge del menú, solo `sitio_web.publicar`). */
export interface PendientesSitio {
    fotosPorAprobar: number;
    obrasConCambios: number;
    ultimaConError: {
        id: number; modo: ModoPublicacion; estado: EstadoPublicacion; error_codigo: string | null; error_mensaje: string | null;
        build_estado: EstadoBuild | null; created_at: string;
    } | null;
}

export interface ResultadoImportar {
    publicacion_id: number | null;
    importadas: ItemObra[];
    ya_estaban: number;
    avisos: string[];
    commit_sha: string | null;
}

export interface ResultadoResincronizar {
    publicacion_id: number;
    commit_sha: string | null;
    actualizadas: ItemObra[];
    /** Obras que estaban en el repo y no en la Bóveda (agregadas a mano): quedaron importadas. */
    importadas: ItemObra[];
    quitadas: ItemObra[];
    fotos_rechazadas: { id: number; sitio_obra_id: number }[];
    avisos: string[];
    conciliadas: { id: number; estado: string }[];
}
