import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowDown, ArrowRight, Ban, Check, ChevronDown, HardHat, PackageCheck, PackagePlus, PackageX, Plus, Search,
    Truck, UserCheck, Warehouse,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { FiltroFichas, Pildora } from '../FichaInicio';
import { CIFRA, CUADRO, PILDORA, ROTULO_FICHAS } from '../fichasInicio';
import type { TonoTarjeta } from '../tarjetaActiva';
import { TARJETA, plural, rutaLista } from './formato';
import type { PropsVistaInventario } from './perfil';
import {
    GRUPOS, TOPE_GRUPO, TOPE_SEC_CEL, TOPE_ULTIMO, TOPE_ULTIMO_CERRADO, etiquetaPaso, filasDelGrupo, gruposDe, modeloSuperAdmin, porDia,
    rotuloGrupo, textoHasta,
    type Casilla, type Destino, type Evento, type FilaSec, type FiltroSec, type Grupo, type IconoEvento, type PasoCircuitoSA,
    type Responsable,
} from './superadmin.modelo';

/**
 * Detalle «Inventario» del Inicio del SUPER ADMINISTRADOR (Marcos y Mauricio, rol 1): diseño «Super Administrador» de
 * la opción A del lienzo (VistaSuperAdmin de boveda-diseno/frontend/src/preview/inventario/opcionA.tsx), con los datos
 * de GET /transferencias/inicio/perfil (contrato en tipos.ts). La espera, el error, la descripción bajo el título y el
 * selector «Ver como» los pone DetalleInventario. Lógica (pasos, grupos, eventos, conteos, a quién le toca) en
 * `superadmin.modelo.ts`, con test.
 *
 * A ellos no les toca nada: arriba, en UNA tarjeta, el circuito de todas las obras (con «Despachada» aunque la app no
 * tenga «Despachar»: casi siempre «sin despacho») y lo pendiente de cada uno (2×2, chico); al lado, lo último que pasó
 * (mismo alto: al abrirlo se desliza por dentro); abajo, a todo el ancho, la secuencia de CADA solicitud agrupada por
 * paso, con nombres y fechas, el paso de ahora marcado y a quién le toca. Solo lo que la app guarda (pidió, aprobó o
 * no, despachó, recibió y la diferencia anotada al recibir): los WhatsApp de jefatura no quedan registrados.
 * Celular: circuito, secuencia y lo último, en ese orden. Los toques del circuito y de «Quién tiene qué» bajan a la
 * secuencia; «Ver» abre la solicitud (o su diferencia) en Inventario.
 */

const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40';
const ID_SEC = 'inv-sa-sec';
const idGrupo = (g: Grupo) => `inv-sa-g-${g}`;

/** Punto del rótulo de cada paso (el gris de «No aprobada»: cerrada, sin significado de color). */
const PUNTO: Record<Grupo, string> = {
    aprobar: CUADRO.ambar, aprobada: CUADRO.ambar, camino: CUADRO.azul, dif: CUADRO.rojo, completa: CUADRO.verde,
    rechazada: 'bg-zinc-400 dark:bg-zinc-500',
};

/**
 * Lleva a un bloque de esta vista (la secuencia o un paso dentro de ella) y le pasa el foco a su título. Se llama un
 * cuadro después del clic: el paso puede no estar dibujado hasta que cambie la pestaña. Solo se mueve si el bloque no
 * está a la vista y sin animar con «reducir movimiento».
 */
const irA = (id: string) => window.requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 64 || r.top > window.innerHeight - 200) {
        const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    }
    el.querySelector<HTMLElement>('h3, h4')?.focus({ preventScroll: true });
});

// ═══════════════════════════════ Piezas ═══════════════════════════════

/** Rótulo de un bloque (sin cifra); el título recibe el foco cuando otro botón lleva hasta aquí. */
const Rotulo: React.FC<{ id: string; titulo: string; nota?: string; nivel?: 'h3' | 'h4' }> = ({ id, titulo, nota, nivel = 'h3' }) => {
    const H = nivel;
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <H id={id} tabIndex={-1} className={cn(ROTULO_FICHAS, 'focus:outline-none')}>{titulo}</H>
            {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
        </div>
    );
};

const Vacio: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" aria-hidden />{children}
    </p>
);

/** «Ver las N» / «Ver menos»: despliega la lista ahí mismo (como «Próximos 14 días» de Asistencia). */
const VerMas: React.FC<{ abierto: boolean; onClick: () => void; texto: string; controla: string; className?: string }> = ({
    abierto, onClick, texto, controla, className,
}) => (
    <div className={cn('mt-1 flex justify-center border-t border-border pt-1.5', className)}>
        {/* eslint-disable-next-line no-restricted-syntax -- desplegar la lista (igual que DetalleAsistenciaMes) */}
        <button type="button" onClick={onClick} aria-expanded={abierto} aria-controls={controla}
            className={cn('inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-section font-semibold text-green-700 hover:underline dark:text-green-300', FOCO)}>
            {abierto ? 'Ver menos' : texto}
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', abierto && 'rotate-180')} aria-hidden />
        </button>
    </div>
);

/** Enlace verde chico que lleva a Inventario (lo que no cabe aquí). */
const EnlaceInventario: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className }) => (
    // eslint-disable-next-line no-restricted-syntax -- enlace a Inventario (navega)
    <button type="button" onClick={onClick}
        className={cn('inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-300 md:min-h-9', FOCO, className)}>
        {children}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </button>
);

// ─────────────── Franja del circuito ───────────────

const ANILLO: Record<TonoTarjeta, string> = {
    rojo: 'ring-red-500', ambar: 'ring-amber-500', azul: 'ring-blue-500', verde: 'ring-green-600', neutro: 'ring-border',
};

/**
 * El circuito en UNA línea (≈ 80 px): cuatro círculos unidos con su conteo; las etapas en curso con alguna, más
 * grandes, en su color y con anillo. Desde 640 px, bajo cada una, «hasta N días». Compacto: bajo 640 px los nombres
 * en `text-label` y la bajada corta, para que no se peguen a 360 px. Cada etapa baja a su pestaña de la secuencia.
 */
const Circuito: React.FC<{ pasos: PasoCircuitoSA[]; etiqueta: string; onIr: (d: Destino) => void; className?: string }> = ({
    pasos, etiqueta, onIr, className,
}) => (
    <ol aria-label={etiqueta} className={cn('grid w-full max-w-2xl grid-cols-4', className)}>
        {pasos.map((p, i) => (
            <li key={p.key} className="relative min-w-0">
                {/* La línea va de centro a centro de los círculos (columnas parejas). */}
                {i > 0 && <span className="absolute right-1/2 top-[21px] z-0 h-0.5 w-full bg-border" aria-hidden />}
                {/* eslint-disable-next-line no-restricted-syntax -- etapa del circuito: baja a su pestaña de la secuencia (misma vista) */}
                <button type="button" onClick={() => onIr(p.ir)} aria-label={etiquetaPaso(p)}
                    className={cn('relative z-10 flex min-h-11 w-full min-w-0 flex-col items-center gap-0.5 rounded-xl px-0.5 pb-1 text-center transition-colors duration-200 hover:bg-muted/50', FOCO)}>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card">
                        <span className={cn('flex items-center justify-center rounded-full font-bold tabular-nums',
                            p.resaltar ? cn('h-11 w-11 text-base ring-2', PILDORA[p.tono], ANILLO[p.tono]) : 'h-9 w-9 bg-muted text-sm text-foreground')}>
                            {p.total}
                        </span>
                    </span>
                    <span className={cn('mt-0.5 text-xs leading-tight max-sm:text-label', p.resaltar ? 'font-bold text-foreground' : 'font-medium text-zinc-700 dark:text-zinc-300')}>{p.texto}</span>
                    <span className={cn('leading-tight', p.resaltar ? cn('text-xs font-semibold', CIFRA[p.tono]) : 'text-label text-muted-foreground')}>
                        <span className="sm:hidden">{p.bajadaCorta}</span><span className="max-sm:hidden">{p.bajada}</span>
                    </span>
                    {p.hasta !== null && (
                        <span className="text-label leading-tight text-muted-foreground max-sm:hidden">{textoHasta(p.hasta)}</span>
                    )}
                    {p.nota && <span className="text-label leading-tight text-muted-foreground">{p.nota}</span>}
                </button>
            </li>
        ))}
    </ol>
);

/** Las diferencias, APARTE del circuito: una fila roja tocable con cuántas hay y la más antigua; baja a «Recibidas». */
const DiferenciasAparte: React.FC<{ titulo: string; bajada: string; onClick: () => void; className?: string }> = ({
    titulo, bajada, onClick, className,
}) => (
    // eslint-disable-next-line no-restricted-syntax -- fila de aviso tocable: baja a la secuencia (misma vista)
    <button type="button" onClick={onClick}
        className={cn('flex min-h-11 w-full max-w-2xl items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors duration-200 hover:bg-red-100 dark:hover:bg-red-500/25',
            PILDORA.rojo, FOCO, className)}>
        <PackageX className="h-5 w-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{titulo}</span>
            <span className="block text-xs">{bajada}</span>
        </span>
        <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />
    </button>
);

// ─────────────── Quién tiene qué ───────────────

const ICONO_RESPONSABLE: Record<Responsable['key'], React.ReactNode> = {
    aprueba: <UserCheck className="h-4 w-4" />,
    bodega: <Warehouse className="h-4 w-4" />,
    obras: <HardHat className="h-4 w-4" />,
    jefatura: <Search className="h-4 w-4" />,
};

/**
 * Lo pendiente de una persona: toda la caja baja a la secuencia con lo suyo (44 px o más de alto). Arriba el círculo,
 * el nombre y la cifra; las dos líneas chicas, a todo el ancho de la caja (a 1280 px mide ≈ 270 px).
 */
const PersonaPendiente: React.FC<{ r: Responsable; onIr: (d: Destino) => void }> = ({ r, onIr }) => {
    const { ademas } = r;
    return (
        <li className="min-w-0 rounded-2xl bg-muted/60 dark:bg-muted/40">
            {/* eslint-disable-next-line no-restricted-syntax -- caja de persona: baja a la secuencia con lo suyo (misma vista) */}
            <button type="button" onClick={() => onIr(r.ir)} aria-label={`${r.nombre}: ${r.cifra}, ${r.linea}. Ver en la secuencia`}
                className={cn('block min-h-11 w-full px-3 py-2.5 text-left transition-colors duration-200 hover:bg-muted', ademas ? 'rounded-t-2xl' : 'rounded-2xl', FOCO)}>
                <span className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-label font-bold text-zinc-700 shadow-[var(--shadow-sm)] dark:text-zinc-300" aria-hidden>
                        {r.iniciales ?? ICONO_RESPONSABLE[r.key]}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{r.nombre}</span>
                    <span className={cn('shrink-0 text-title font-bold leading-none tabular-nums', CIFRA[r.cifra ? r.tono : 'neutro'])} aria-hidden>{r.cifra}</span>
                    <ArrowDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </span>
                <span className="mt-1.5 block text-xs leading-snug text-zinc-700 dark:text-zinc-300">{r.linea}</span>
                <span className="mt-0.5 block text-label leading-snug text-muted-foreground">{r.nota}</span>
            </button>
            {ademas && (
                // eslint-disable-next-line no-restricted-syntax -- lo otro pendiente de la persona: baja a la secuencia con eso
                <button type="button" onClick={() => onIr(ademas.ir)}
                    className={cn('flex min-h-11 w-full items-center gap-2 rounded-b-2xl border-t border-border px-3 text-left text-xs font-semibold text-red-700 transition-colors duration-200 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10', FOCO)}>
                    <PackageX className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">{ademas.texto}</span>
                    <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />
                </button>
            )}
        </li>
    );
};

// ─────────────── Pasos de una solicitud ───────────────

const BORDE_AHORA: Record<TonoTarjeta, string> = {
    rojo: 'border-red-500', ambar: 'border-amber-500', azul: 'border-blue-500', verde: 'border-green-600', neutro: 'border-border',
};

/** El punto del paso (las reglas del camino P·A·D·R de la app: hecho relleno, ahora anillo, falta punteado, sin registro hueco). */
const PuntoPaso: React.FC<{ c: Casilla }> = ({ c }) => {
    if (c.tipo === 'fin') {
        return c.completa
            ? <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" strokeWidth={3} />
            : <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }
    return (
        <span className={cn('box-border h-4 w-4 shrink-0 rounded-full',
            c.tipo === 'ahora' ? cn('border-[3px] bg-card', BORDE_AHORA[c.tono ?? 'ambar'])
                : c.tipo === 'falta' ? 'border border-dashed border-zinc-400 bg-card dark:border-zinc-500'
                    : c.tipo === 'sin' ? 'border-2 border-zinc-300 bg-card dark:border-zinc-600'
                        : c.punto ? CUADRO[c.punto] : 'bg-zinc-700 dark:bg-zinc-300')} />
    );
};

/** Un verbo corto no se parte («Ahora:» / «sale de bodega», no «… de» / «bodega»). */
const NB = String.fromCharCode(160);
const sinPartir = (verbo: string) => (verbo.length <= 15 ? verbo.replace(/ /g, NB) : verbo);

/**
 * Un paso. Desde 768 px, compacto: el punto arriba con la línea hacia el siguiente y debajo «Verbo · fecha», el nombre
 * y un dato chico (cinco columnas que calzan fila con fila). En el celular: en vertical, el punto a la izquierda y la
 * línea hacia abajo, «Pidió Carla Soto» en una línea; lo que falta no se dibuja (se nombra al final).
 */
const PasoSecuencia: React.FC<{ c: Casilla; sig?: Casilla }> = ({ c, sig }) => {
    if (c.tipo === 'nada') return <li className="max-md:hidden" aria-hidden />;
    const linea = !!sig && sig.tipo !== 'nada';
    const rojo = c.punto === 'rojo' && !!c.motivo;
    const fecha = [c.verbo, c.fecha].filter(Boolean).join(' · ');
    return (
        <li className={cn('flex min-w-0 gap-3 md:flex-col md:gap-1.5', c.tipo === 'falta' && 'max-md:hidden')}>
            <div className="flex shrink-0 flex-col items-center max-md:pt-0.5 md:flex-row" aria-hidden>
                <PuntoPaso c={c} />
                {linea && (
                    <span className={cn('w-0.5 flex-1 md:h-0.5 md:w-auto',
                        sig.tipo === 'falta' ? 'bg-border max-md:hidden' : 'bg-zinc-400 dark:bg-zinc-500')} />
                )}
            </div>
            <div className="min-w-0 flex-1 pb-3 md:pb-0 md:pr-2">
                {c.tipo === 'ahora' && (
                    <div className={cn('rounded-xl px-2.5 py-1.5 max-md:-mt-1 md:px-2 md:py-1', PILDORA[c.tono ?? 'ambar'])}>
                        <p className="text-xs font-bold">Ahora: {sinPartir(c.verbo)}</p>
                        {/* Desde 768 px en 13 px: «Leonardo López» cabe entero en la columna de 1280 px. */}
                        <p className="text-sm font-semibold leading-snug md:text-section">{c.quien}</p>
                        {c.detalle && <p className="text-xs">{c.detalle}</p>}
                        {c.nota && <p className="text-label">{c.nota}</p>}
                    </div>
                )}
                {c.tipo === 'falta' && (
                    <>
                        <p className="text-xs text-muted-foreground">{c.verbo}</p>
                        {c.nota && <p className="text-label leading-snug text-muted-foreground">{c.nota}</p>}
                    </>
                )}
                {c.tipo === 'sin' && (
                    <>
                        {/* Celular: «Sin despacho · la obra recibió directo». */}
                        <p className="text-sm leading-snug text-muted-foreground md:hidden">{[c.verbo, c.nota].filter(Boolean).join(' · ')}</p>
                        <p className="text-xs text-muted-foreground max-md:hidden">{c.verbo}</p>
                        {c.nota && <p className="text-label leading-snug text-muted-foreground max-md:hidden">{c.nota}</p>}
                    </>
                )}
                {c.tipo === 'fin' && (
                    <>
                        <p className="text-sm font-semibold leading-snug text-zinc-700 dark:text-zinc-300 md:hidden">{c.verbo}: {c.quien?.toLowerCase()}</p>
                        <p className="text-xs text-muted-foreground max-md:hidden">{c.verbo}</p>
                        <p className="text-sm font-semibold leading-snug text-zinc-700 dark:text-zinc-300 max-md:hidden">{c.quien}</p>
                    </>
                )}
                {c.tipo === 'hecho' && (
                    <>
                        {/* Celular: «Pidió Carla Soto» y debajo «13 oct · Prevencionista». */}
                        <p className="text-sm leading-snug md:hidden">
                            <span className={rojo ? 'font-semibold text-red-700 dark:text-red-300' : 'text-muted-foreground'}>{c.verbo}</span>
                            {c.quien && <>{' '}<span className="font-semibold">{c.quien}</span></>}
                        </p>
                        {(c.fecha || c.extra) && <p className="text-xs text-muted-foreground md:hidden">{[c.fecha, c.extra].filter(Boolean).join(' · ')}</p>}
                        {/* Desde 768 px: «Pidió · 13 oct», el nombre y el dato chico. */}
                        <p className={cn('text-xs max-md:hidden', rojo ? 'font-semibold text-red-700 dark:text-red-300' : 'text-muted-foreground')}>{fecha}</p>
                        {c.quien && <p className="text-sm font-semibold leading-snug max-md:hidden">{c.quien}</p>}
                        {c.extra && <p className="text-label leading-snug text-muted-foreground max-md:hidden">{c.extra}</p>}
                        {c.motivo && <p className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-300">«{c.motivo}»</p>}
                        {c.difs?.map(d => (
                            <div key={d.clave} className="mt-1 space-y-0.5">
                                <Pildora tono={d.tono}>{d.pildora}</Pildora>
                                <p className="text-label leading-snug text-zinc-700 dark:text-zinc-300">{d.texto}</p>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </li>
    );
};

/** Enlace de la fila: abre esa solicitud (o su diferencia) en Inventario; nada se aprueba ni recibe aquí. */
const VerSolicitud: React.FC<{ f: FilaSec; onIr: (ruta: string) => void; className?: string }> = ({ f, onIr, className }) => (
    // eslint-disable-next-line no-restricted-syntax -- enlace de la fila (abre la solicitud en Inventario)
    <button type="button" onClick={() => onIr(f.ruta)} aria-label={f.etiquetaRuta}
        className={cn('inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1 text-section font-semibold text-green-700 hover:underline dark:text-green-300 md:min-h-9', FOCO, className)}>
        {/* «Ver» en el celular y desde 1280 px (al lado del nombre de la obra, en la columna angosta). */}
        <span className="md:hidden xl:inline">Ver</span><span className="max-md:hidden xl:hidden">Ver solicitud</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </button>
);

/** Una solicitud con su secuencia completa: a la izquierda qué y adónde; a la derecha los cinco pasos. */
const FilaSecuencia: React.FC<{ f: FilaSec; onIr: (ruta: string) => void; className?: string }> = ({ f, onIr, className }) => (
    <li className={cn('border-t border-border py-4 first:border-t-0 md:py-2.5 xl:grid xl:grid-cols-[12rem_minmax(0,1fr)] xl:gap-6 2xl:grid-cols-[15rem_minmax(0,1fr)]', className)}>
        <div className="min-w-0">
            {/* El enlace va al lado del nombre de la obra, sin sumar alto a la fila. */}
            <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-base font-semibold leading-snug xl:text-sm">{f.lugar}</p>
                <VerSolicitud f={f} onIr={onIr} className="-my-3 -mr-1 md:-my-2" />
            </div>
            <p className="text-section leading-snug text-zinc-700 dark:text-zinc-300 xl:text-xs">{f.items}</p>
            <p className="mt-0.5 text-label text-muted-foreground">{f.tipo ? `${f.codigo} · ${f.tipo}` : f.codigo}</p>
        </div>
        <ol aria-label={`Secuencia de la solicitud ${f.codigo}${f.ahora ? `. Ahora: ${f.ahora}` : ''}`} className="mt-3 md:grid md:grid-cols-5 xl:mt-0.5">
            {f.casillas.map((c, i) => <PasoSecuencia key={i} c={c} sig={f.casillas[i + 1]} />)}
        </ol>
        {f.despues && <p className="pl-7 text-xs text-muted-foreground md:hidden">{f.despues}</p>}
    </li>
);

/** Enlace del rótulo de un paso en «Todas»: abre su pestaña con todas las de ese paso. */
const VerGrupo: React.FC<{ n: number; onClick: () => void; className?: string }> = ({ n, onClick, className }) => (
    // eslint-disable-next-line no-restricted-syntax -- enlace del rótulo: cambia la pestaña de la secuencia (misma vista)
    <button type="button" onClick={onClick}
        className={cn('inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-300 md:min-h-9', FOCO, className)}>
        Ver {plural(n, 'la', 'las')} {n}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </button>
);

// ─────────────── Lo último que pasó ───────────────

const ICONO_EVENTO: Record<IconoEvento, React.ReactNode> = {
    pidio: <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />,
    aprobo: <Check className="h-3.5 w-3.5" strokeWidth={2.5} />,
    rechazo: <Ban className="h-3.5 w-3.5" />,
    despacho: <Truck className="h-3.5 w-3.5" />,
    recibio: <PackageCheck className="h-3.5 w-3.5" />,
    faltante: <PackageX className="h-3.5 w-3.5" />,
    sobrante: <PackagePlus className="h-3.5 w-3.5" />,
};
const PIE_EVENTO: Partial<Record<TonoTarjeta, string>> = {
    rojo: 'text-red-700 dark:text-red-300', ambar: 'text-amber-800 dark:text-amber-300',
};

const FilaEvento: React.FC<{ e: Evento }> = ({ e }) => (
    <li className="flex items-start gap-3 border-t border-border py-2 first:border-t-0">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', PILDORA[e.tono])} aria-hidden>
            {ICONO_EVENTO[e.icono]}
        </span>
        <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">
                {e.quien ? <><span className="font-semibold">{e.quien}</span> {e.frase}</> : e.frase}
            </p>
            <p className={cn('text-xs', PIE_EVENTO[e.tono] ?? 'text-muted-foreground')}>{e.pie}</p>
        </div>
    </li>
);

/**
 * «Lo último que pasó». En el computador tiene SIEMPRE el alto de la tarjeta de al lado (no la estira) y, al abrirla,
 * se desliza por dentro: la secuencia de abajo no se mueve. En el celular (va al final) muestra 520 px; lo cortado se
 * desvanece y «Ver los N» lo despliega ahí mismo. Se dibujan 30 cerrada y hasta 150 abierta; lo anterior, en Inventario.
 */
const LoUltimo: React.FC<{ eventos: Evento[]; hoy: string; onIr: (ruta: string) => void; className?: string }> = ({ eventos, hoy, onIr, className }) => {
    const [abierto, setAbierto] = useState(false);
    const n = eventos.length;
    const dias = useMemo(() => porDia(eventos.slice(0, abierto ? TOPE_ULTIMO : TOPE_ULTIMO_CERRADO), hoy), [eventos, hoy, abierto]);
    const corta = !abierto && n > 0;
    return (
        <div className={cn('relative min-w-0 xl:min-h-[420px] xl:self-stretch', className)}>
            <div className="xl:absolute xl:inset-0">
                <section className={cn(TARJETA, 'flex flex-col xl:h-full')} aria-labelledby="inv-sa-u">
                    <Rotulo id="inv-sa-u" titulo="Lo último que pasó" nota={abierto ? 'Desliza para ver más' : 'Lo más nuevo arriba'} />
                    {n === 0 ? <Vacio>Todavía no hay movimientos registrados.</Vacio> : (
                        <>
                            <div id="inv-sa-u-lista"
                                className={cn('relative mt-3 min-h-0 flex-1', abierto ? 'xl:-mr-2 xl:overflow-y-auto xl:overscroll-contain xl:pr-2' : 'max-h-[520px] overflow-hidden xl:max-h-none')}>
                                <div className="space-y-4">
                                    {dias.map(d => (
                                        <div key={d.fecha}>
                                            <h4 className="text-xs font-semibold text-muted-foreground">{d.rotulo}</h4>
                                            <ul className="mt-1">{d.eventos.map(e => <FilaEvento key={e.clave} e={e} />)}</ul>
                                        </div>
                                    ))}
                                    {abierto && n > TOPE_ULTIMO && (
                                        <div className="border-t border-border pt-1">
                                            <EnlaceInventario onClick={() => onIr(rutaLista('todas'))}>Lo anterior, en Inventario</EnlaceInventario>
                                        </div>
                                    )}
                                </div>
                                {corta && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" aria-hidden />}
                            </div>
                            <VerMas abierto={abierto} controla="inv-sa-u-lista" texto={`Ver los ${n}`} onClick={() => setAbierto(v => !v)} />
                        </>
                    )}
                </section>
            </div>
        </div>
    );
};

// ═══════════════════════════════ La vista ═══════════════════════════════

const VistaSuperAdmin: React.FC<PropsVistaInventario> = ({ datos }) => {
    const navigate = useNavigate();
    const irRuta = (ruta: string) => navigate(ruta);
    const m = useMemo(() => modeloSuperAdmin(datos), [datos]);
    const [filtro, setFiltro] = useState<FiltroSec>('todas');
    const [todas, setTodas] = useState(false);
    const ir = ({ filtro: f, grupo }: Destino) => {
        setFiltro(f);
        setTodas(false);
        irA(grupo ? idGrupo(grupo) : ID_SEC);
    };
    const enTodas = filtro === 'todas';
    const grupos = gruposDe(filtro);
    const total = grupos.reduce((a, g) => a + m.porGrupo[g.key].length, 0);
    const conRotulo = grupos.length > 1;
    // Filas anteriores a cada paso (en una pestaña, en el celular se ven las 3 primeras de toda la pestaña).
    const desde = grupos.map((_, i) => grupos.slice(0, i).reduce((a, g) => a + m.porGrupo[g.key].length, 0));
    const lugar = m.todas ? 'todas las obras' : 'lo que puedes ver';

    return (
        // Computador: a la izquierda el circuito con lo pendiente de cada uno; a la derecha, lo último que pasó (del mismo
        // alto); abajo, a todo el ancho, la secuencia de cada solicitud. Celular: circuito, secuencia y lo último.
        <div data-vista="superadmin" className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
            <section className={cn(TARJETA, 'min-w-0 xl:col-start-1 xl:row-start-1')} aria-labelledby="inv-sa-c">
                <Rotulo id="inv-sa-c" titulo={`Todo el circuito · ${lugar}`} nota="Toca una etapa para ver sus solicitudes" />
                <Circuito className="mt-4" etiqueta={`Circuito de la solicitud, ${lugar}`} pasos={m.circuito} onIr={ir} />
                {m.diferencias && (
                    <DiferenciasAparte className="mt-3" titulo={m.diferencias.titulo} bajada={m.diferencias.bajada}
                        onClick={() => ir({ filtro: 'recibidas' })} />
                )}

                <div className="mt-5 space-y-3 border-t border-border pt-4">
                    <Rotulo id="inv-sa-q" nivel="h4" titulo="Quién tiene qué · lo pendiente de cada uno" nota="Toca para ver sus solicitudes" />
                    {/* Sin igualar altos: cada caja termina donde termina lo suyo. */}
                    <ul className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-2 md:gap-3">
                        {m.responsables.map(r => <PersonaPendiente key={r.key} r={r} onIr={ir} />)}
                    </ul>
                </div>
            </section>

            <section id={ID_SEC} className="min-w-0 scroll-mt-20 space-y-3 xl:col-span-2 xl:row-start-2" aria-labelledby="inv-sa-s">
                <Rotulo id="inv-sa-s" titulo="Secuencia completa · cada solicitud"
                    nota={enTodas
                        ? 'Quién hizo cada paso y cuándo, y a quién le toca ahora · agrupadas por paso'
                        : 'Quién hizo cada paso y cuándo, y a quién le toca ahora · lo que se movió último, arriba'} />
                <FiltroFichas opciones={m.filtros} activa={filtro} etiqueta="Ver la secuencia por paso"
                    onCambiar={f => { setFiltro(f); setTodas(false); }} />
                <div className={TARJETA}>
                    {total === 0 ? <Vacio>{enTodas ? 'Todavía no hay solicitudes.' : 'No hay solicitudes en este paso.'}</Vacio> : (
                        <>
                            <div id="inv-sa-s-lista">
                                {grupos.map((g, gi) => {
                                    const filas = m.porGrupo[g.key];
                                    const n = filas.length;
                                    if (n === 0) return null;
                                    const { vista, resto } = filasDelGrupo(n, { enTodas, desplegada: todas });
                                    // «Todas»: 2 por paso desde 768 px y 1 en el celular. Pestaña: todas, y 3 en el celular.
                                    const oculta = (i: number) => !todas && (enTodas ? i >= 1 : desde[gi] + i >= TOPE_SEC_CEL);
                                    // El enlace «Ver las N» del rótulo solo cuando hay alguna escondida (2 = solo en el celular).
                                    const enlace = enTodas && !todas && n > 1 ? (n > TOPE_GRUPO ? '' : 'md:hidden') : null;
                                    return (
                                        <div key={g.key} className={cn('border-t border-border first:border-t-0', !todas && !enTodas && desde[gi] >= TOPE_SEC_CEL && 'max-md:hidden')}>
                                            {conRotulo && (
                                                <div id={idGrupo(g.key)} className={cn('flex min-h-11 scroll-mt-20 items-center justify-between gap-3 md:min-h-9', gi > 0 && 'pt-2 md:pt-3')}>
                                                    <h4 tabIndex={-1} className={cn(ROTULO_FICHAS, 'flex min-w-0 items-start gap-2 focus:outline-none')}>
                                                        <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', PUNTO[g.key])} aria-hidden />
                                                        <span className="min-w-0 tabular-nums">{rotuloGrupo(g, n)}</span>
                                                    </h4>
                                                    {enlace !== null && <VerGrupo n={n} className={enlace || undefined} onClick={() => ir({ filtro: g.filtro })} />}
                                                </div>
                                            )}
                                            <ul>
                                                {filas.slice(0, vista).map((f, i) => (
                                                    <FilaSecuencia key={f.id} f={f} onIr={irRuta} className={oculta(i) ? 'max-md:hidden' : undefined} />
                                                ))}
                                            </ul>
                                            {resto > 0 && (
                                                <div className="border-t border-border py-1">
                                                    <EnlaceInventario onClick={() => irRuta(rutaLista(GRUPOS.find(x => x.key === g.key)?.lista ?? 'todas'))}>
                                                        y {resto} más en Inventario
                                                    </EnlaceInventario>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {m.tope && (
                                <p className="mt-2 flex flex-wrap items-center gap-x-2 border-t border-border pt-2 text-xs text-muted-foreground">
                                    {m.tope.texto}
                                    <EnlaceInventario onClick={() => irRuta(m.tope?.ruta ?? rutaLista('todas'))}>Abrir Inventario</EnlaceInventario>
                                </p>
                            )}
                            {enTodas
                                ? <VerMas abierto={todas} onClick={() => setTodas(v => !v)} controla="inv-sa-s-lista" texto={`Ver las ${total}`} />
                                : total > TOPE_SEC_CEL && (
                                    <VerMas abierto={todas} onClick={() => setTodas(v => !v)} controla="inv-sa-s-lista" texto={`Ver las ${total}`} className="md:hidden" />
                                )}
                        </>
                    )}
                </div>
            </section>

            {/* Último en el celular; en el computador, a la derecha del circuito y del mismo alto. */}
            <LoUltimo className="xl:col-start-2 xl:row-start-1" eventos={m.eventos} hoy={datos.hoy} onIr={irRuta} />
        </div>
    );
};

export default VistaSuperAdmin;
