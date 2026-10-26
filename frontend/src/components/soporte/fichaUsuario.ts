import { menuVisible, veBuzonIdeas, type SeccionMenu } from '../layout/menuLateral';
import { pestanasInventarioVisibles, type DefPestanaInventario } from '../inventario/pestanasInventario';
import { SECCION_LABEL, permisosGestiones, seccionesDisponibles, type SeccionTrabajo } from '../consultas/gestionesNav';
import {
    PERMISO_APROBAR, PERMISO_DIFERENCIAS_VER, PERMISO_RECIBIR, PERMISO_TAB_TRANSFERENCIAS, PERMISO_VER_TODAS, PERMISOS_PEDIR,
    esSuperAdmin, vistaInventario, type VistaInventario,
} from '../dashboard/widgets/inventarioPerfil/perfil';
import { normalizar } from '../../utils/busquedaTrabajadores';

/**
 * «Soporte · usuarios» (Marcos 2026-10-23): la FICHA de una persona, lógica PURA con test (`fichaUsuario.test.ts`).
 * Con sus permisos efectivos (los que llevaría su token, de GET /api/soporte/usuarios/:id) se calcula qué ve, con las
 * MISMAS funciones que usa la app — nada se repite aquí:
 *   - el menú: `menuVisible` (menuLateral.ts, la del Sidebar);
 *   - las pestañas de Inventario: `pestanasInventarioVisibles` (la lista de Inventario.tsx);
 *   - las secciones de Gestiones: `permisosGestiones` + `seccionesDisponibles` (gestionesNav.ts, las de Consultas.tsx);
 *   - la vista de Inventario del Inicio: `vistaInventario` (perfil.ts) y el Inicio de gerencia (`inicio.gerencia`).
 * Más los avisos: combinaciones de permisos que no funcionan o que explican un «no veo X».
 */

export type OrigenPermiso = 'rol' | 'propio' | 'quitado';

/** Una persona de la lista (GET /api/soporte/usuarios). */
export interface UsuarioSoporte {
    id: number;
    nombre: string;
    email: string;
    rol_id: number;
    rol_nombre: string;
    obra_id: number | null;
    obra_nombre: string | null;
    bodega_id: number | null;
    bodega_nombre: string | null;
}

export interface PermisoFicha {
    clave: string;
    modulo: string;
    nombre: string;
    descripcion: string | null;
    orden: number;
    origen: OrigenPermiso;
}

/** GET /api/soporte/usuarios/:id */
export interface FichaSoporte {
    usuario: UsuarioSoporte & { activo: boolean };
    obra: { id: number; nombre: string | null; activa: boolean | null; finalizada: boolean | null } | null;
    /** Exactamente lo que llevaría su token (`p`). */
    efectivos: string[];
    /** Los efectivos (origen rol / propio) y los quitados, con nombre y módulo del catálogo. */
    permisos: PermisoFicha[];
    sesion: {
        ultimo_ingreso: string | null;
        ultimo_cambio: string | null;
        /** 'rol' = permisos de su rol · 'propios' = sus permisos propios · 'datos' = su rol, obra o bodega. */
        ultimo_cambio_de: 'rol' | 'propios' | 'datos' | null;
    };
}

export interface AvisoFicha {
    /** warning = algo no calza (ámbar) · info = para saber (neutro). */
    tono: 'warning' | 'info';
    texto: string;
}

export interface GrupoPermisos {
    modulo: string;
    permisos: PermisoFicha[];
    propios: number;
    quitados: number;
}

export interface ResumenFicha {
    esSuperAdmin: boolean;
    /** El menú lateral, en orden. */
    menus: SeccionMenu[];
    /** «Comparte tu idea» al pie del menú. */
    buzonIdeas: boolean;
    /** null = no entra a Inventario (sin «Ver inventario»). */
    pestanasInventario: DefPestanaInventario[] | null;
    /** null = no ve Gestiones. Con 2 o más hay portada. */
    seccionesGestiones: { clave: SeccionTrabajo; label: string }[] | null;
    inicioGerencia: boolean;
    vistaInventario: VistaInventario;
    /** La vista de la tarjeta Inventario del Inicio, en palabras (o por qué no la tiene). */
    textoInicioInventario: string;
    grupos: GrupoPermisos[];
    cuenta: { efectivos: number; propios: number; quitados: number };
    avisos: AvisoFicha[];
}

/** Qué vista de Inventario del Inicio le toca, en palabras (perfil.ts). */
export const TEXTO_VISTA_INVENTARIO: Record<VistaInventario, string> = {
    superadmin: 'Super Administrador: todo lo que pasa, con «Ver como» arriba del Inicio',
    leonardo: 'Quien aprueba: lo que espera su aprobación, de todas las obras',
    jefatura: 'Jefatura: el circuito de todas las obras y las diferencias, sin aprobar',
    obra: 'Jefe de obra: pide y recibe materiales para su obra',
    otro: 'La general: las solicitudes que le tocan y las alertas de inventario',
};

/** Etiqueta corta del origen de un permiso. */
export const TEXTO_ORIGEN: Record<OrigenPermiso, string> = {
    rol: 'del rol',
    propio: 'propio',
    quitado: 'quitado',
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «28 abr, 14:30» (es-CL) o '' si no hay fecha. */
const fechaHora = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const QUE_CAMBIO: Record<NonNullable<FichaSoporte['sesion']['ultimo_cambio_de']>, string> = {
    rol: 'los permisos de su rol',
    propios: 'sus permisos propios',
    datos: 'su rol, obra o bodega',
};

/**
 * ¿Le cambiaron los permisos (o el rol, la obra, la bodega) después de su último ingreso? Los permisos viajan en el
 * token: hasta que vuelva a entrar ve lo de antes. Con fechas que no se leen, no.
 */
export function cambioDespuesDeIngresar(sesion: FichaSoporte['sesion'] | null | undefined): boolean {
    if (!sesion?.ultimo_cambio) return false;
    const cambio = Date.parse(sesion.ultimo_cambio);
    if (Number.isNaN(cambio)) return false;
    if (!sesion.ultimo_ingreso) return true;
    const ingreso = Date.parse(sesion.ultimo_ingreso);
    return !Number.isNaN(ingreso) && cambio > ingreso;
}

/** Los avisos de la ficha, en orden de importancia. */
export function avisosFicha(f: FichaSoporte): AvisoFicha[] {
    const ef = new Set(f.efectivos);
    const tiene = (p: string) => ef.has(p);
    const empieza = (pref: string) => f.efectivos.some(k => k.startsWith(pref));
    const avisos: AvisoFicha[] = [];
    const u = f.usuario;

    if (!u.activo) avisos.push({ tono: 'warning', texto: 'Está inactiva: no puede iniciar sesión.' });
    if (esSuperAdmin(u)) {
        avisos.push({ tono: 'info', texto: 'Es Super Administrador: tiene todo el catálogo y no se puede «ver como» él.' });
    }

    if (cambioDespuesDeIngresar(f.sesion)) {
        const cuando = fechaHora(f.sesion.ultimo_cambio);
        const ingreso = f.sesion.ultimo_ingreso ? `su último ingreso (${fechaHora(f.sesion.ultimo_ingreso)})` : 'que entró por última vez';
        const que = f.sesion.ultimo_cambio_de ? QUE_CAMBIO[f.sesion.ultimo_cambio_de] : 'sus permisos';
        avisos.push({
            tono: 'warning',
            texto: `Cambiaron ${que}${cuando ? ` el ${cuando}` : ''}, después de ${ingreso}: debe volver a iniciar sesión para verlos. «Ver como» ya muestra lo nuevo.`,
        });
    }

    if (!f.efectivos.length) {
        avisos.push({ tono: 'warning', texto: 'No tiene ningún permiso: solo ve el Inicio y Ayuda.' });
        return avisos;
    }

    // Inventario
    const pide = PERMISOS_PEDIR.some(p => tiene(p));
    const recibe = tiene(PERMISO_RECIBIR);
    const pestanaSolicitudes = tiene(PERMISO_TAB_TRANSFERENCIAS);
    if (!empieza('inventario.')) {
        avisos.push({ tono: 'info', texto: 'No tiene ningún permiso de Inventario.' });
    } else {
        if (!tiene('inventario.ver')) {
            avisos.push({ tono: 'warning', texto: 'Tiene permisos de Inventario pero no «Ver inventario»: el menú Inventario no le aparece.' });
        } else if (!pestanasInventarioVisibles(tiene).length) {
            avisos.push({ tono: 'warning', texto: 'Entra a Inventario pero no tiene ninguna pestaña: lo ve vacío.' });
        }
        if ((pide || recibe) && !pestanaSolicitudes) {
            const verbo = pide && recibe ? 'pedir y recibir' : pide ? 'pedir' : 'recibir';
            avisos.push({ tono: 'warning', texto: `Puede ${verbo} materiales, pero no tiene la pestaña «Solicitudes» de Inventario: no tiene dónde hacerlo.` });
        }
        if (tiene(PERMISO_APROBAR) && !tiene(PERMISO_VER_TODAS)) {
            avisos.push({ tono: 'warning', texto: 'Tiene «Aprobar» sin «Ver todas las obras»: solo le llegan las solicitudes propias y las de su bodega, no la bandeja de todas.' });
        }
        if (tiene(PERMISO_DIFERENCIAS_VER) && !tiene(PERMISO_VER_TODAS) && !tiene(PERMISO_APROBAR)) {
            avisos.push({ tono: 'warning', texto: 'Tiene «Ver diferencias» sin «Ver todas las obras»: ve solo las diferencias de lo suyo.' });
        }
        if (u.bodega_id != null && recibe) {
            avisos.push({ tono: 'info', texto: `Tiene bodega asignada (${u.bodega_nombre || `bodega #${u.bodega_id}`}): recibe solo lo que llega a esa bodega.` });
        }
    }

    // Obra asignada que ya no corre
    if (f.obra && (f.obra.finalizada || f.obra.activa === false)) {
        avisos.push({ tono: 'warning', texto: `Su obra asignada (${f.obra.nombre || `obra #${f.obra.id}`}) está ${f.obra.finalizada ? 'finalizada' : 'inactiva'}.` });
    }

    // Permisos de un módulo sin la puerta de entrada
    if (empieza('asistencia.') && !tiene('asistencia.ver')) {
        avisos.push({ tono: 'warning', texto: 'Tiene permisos de Asistencia pero no «Ver asistencia»: el menú Asistencia no le aparece.' });
    }
    if (empieza('documentos.') && !menuVisible(tiene, u).some(m => m.clave === 'gestiones')) {
        avisos.push({ tono: 'warning', texto: 'Tiene permisos de Documentos pero no ve Gestiones (le falta «Ver trabajadores»).' });
    }

    const quitados = f.permisos.filter(p => p.origen === 'quitado').length;
    if (quitados) {
        avisos.push({ tono: 'info', texto: `Su rol trae ${plural(quitados, 'permiso que a esta persona se le quitó', 'permisos que a esta persona se le quitaron')} a mano (marcados «quitado»).` });
    }
    return avisos;
}

/**
 * Los permisos agrupados por módulo, en el orden del catálogo. (La marca de sensibles —$ / crítico— la pone la página
 * con `permisosHierarchy.ts`, que no se puede cargar en jest: usa `import.meta`.)
 */
export function gruposPermisos(permisos: readonly PermisoFicha[]): GrupoPermisos[] {
    const grupos: GrupoPermisos[] = [];
    const porModulo = new Map<string, GrupoPermisos>();
    for (const p of permisos) {
        let g = porModulo.get(p.modulo);
        if (!g) {
            g = { modulo: p.modulo, permisos: [], propios: 0, quitados: 0 };
            porModulo.set(p.modulo, g);
            grupos.push(g);
        }
        g.permisos.push({ ...p });
        if (p.origen === 'propio') g.propios += 1;
        if (p.origen === 'quitado') g.quitados += 1;
    }
    return grupos;
}

/** Todo lo que muestra la ficha, calculado de la respuesta del servidor. */
export function resumenFicha(f: FichaSoporte): ResumenFicha {
    const ef = new Set(f.efectivos);
    const tiene = (p: string) => ef.has(p);
    const u = f.usuario;
    const menus = menuVisible(tiene, u);
    const conGestiones = menus.some(m => m.clave === 'gestiones');
    const vista = vistaInventario(tiene, u);
    return {
        esSuperAdmin: esSuperAdmin(u),
        menus,
        buzonIdeas: veBuzonIdeas(tiene),
        pestanasInventario: tiene('inventario.ver') ? pestanasInventarioVisibles(tiene) : null,
        seccionesGestiones: conGestiones
            ? seccionesDisponibles(permisosGestiones(tiene)).map(clave => ({ clave, label: SECCION_LABEL[clave] }))
            : null,
        inicioGerencia: tiene('inicio.gerencia'),
        vistaInventario: vista,
        textoInicioInventario: tiene('inventario.ver')
            ? TEXTO_VISTA_INVENTARIO[vista]
            : 'Sin tarjeta de Inventario (le falta «Ver inventario»)',
        grupos: gruposPermisos(f.permisos),
        cuenta: {
            efectivos: f.efectivos.length,
            propios: f.permisos.filter(p => p.origen === 'propio').length,
            quitados: f.permisos.filter(p => p.origen === 'quitado').length,
        },
        avisos: avisosFicha(f),
    };
}

// ── Lista y buscador ──────────────────────────────────────────────────────────
// (`normalizar` = el de Asistencia y Gestiones: minúsculas, sin tildes, NFD.)

/**
 * Filtra la lista: por rol (`rolId`, null = todos) y por texto (cada palabra debe aparecer en el nombre, el correo, el
 * rol, la obra o la bodega; sin tildes ni mayúsculas).
 */
export function filtrarUsuarios(lista: readonly UsuarioSoporte[], texto: string, rolId: number | null): UsuarioSoporte[] {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    return lista.filter(u => {
        if (rolId != null && u.rol_id !== rolId) return false;
        if (!palabras.length) return true;
        const donde = normalizar([u.nombre, u.email, u.rol_nombre, u.obra_nombre, u.bodega_nombre].join(' '));
        return palabras.every(p => donde.includes(p));
    });
}

/** Los roles presentes en la lista (para el filtro), por nombre, con cuántas personas tiene cada uno. */
export function rolesDeLista(lista: readonly UsuarioSoporte[]): { id: number; nombre: string; n: number }[] {
    const roles = new Map<number, { id: number; nombre: string; n: number }>();
    for (const u of lista) {
        const r = roles.get(u.rol_id);
        if (r) r.n += 1;
        else roles.set(u.rol_id, { id: u.rol_id, nombre: u.rol_nombre, n: 1 });
    }
    return [...roles.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** «Obra Gorbea 3082 · Bodega Cerrillos», o '' si no tiene ninguna. */
export function lugarUsuario(u: Pick<UsuarioSoporte, 'obra_nombre' | 'bodega_nombre'>): string {
    return [u.obra_nombre && `Obra ${u.obra_nombre}`, u.bodega_nombre && `Bodega ${u.bodega_nombre.replace(/^bodega\s+/i, '')}`]
        .filter(Boolean).join(' · ');
}
