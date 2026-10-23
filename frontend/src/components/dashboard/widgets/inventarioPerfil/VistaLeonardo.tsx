import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, ChevronRight, PackageX, User } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import type { Transferencia } from '../../../../types/entities';
import { cn } from '../../../../utils/cn';
import ResumenAccionModal from '../../../inventario/transferencia-detail/ResumenAccionModal';
import { Pildora } from '../FichaInicio';
import { CIFRA, PILDORA, ROTULO_FICHAS } from '../fichasInicio';
import type { TonoTarjeta } from '../tarjetaActiva';
import { TARJETA } from './formato';
import {
    NOTA_PROPIA, NOTA_PROPIA_CORTA, NOTA_RESOLVER_VER_COMO, RUTA_POR_APROBAR, TEXTO_FUERA_DE_LISTA, TOPE_LEO, abiertaVigente,
    avisoDiferencias, bajadaPorAprobar, esPropiaBloqueada, etiquetaCircuito, etiquetaPaso, filaPorAprobar, marcaPedida,
    pasosCircuito, porAprobar, resumenTrasAccion, textoCifra, textoHasta, textoPie, textoVacio,
    type AccionResuelta, type AvisoDiferencias, type FilaPorAprobarModelo, type MarcaPaso, type PasoCircuito,
    type ResumenTrasAccion,
} from './leonardo.modelo';
import { esSuperAdmin, type PropsVistaInventario } from './perfil';
import ResolverSolicitud from './ResolverSolicitud';

/**
 * Detalle «Inventario» del Inicio para quien APRUEBA (Leonardo López; el Super Administrador tiene su vista aparte):
 * opción A «Lo tuyo primero» del lienzo (VistaLeonardo de boveda-diseno/frontend/src/preview/inventario/opcionA.tsx),
 * con los datos de GET /transferencias/inicio/perfil (contrato en tipos.ts). La espera, el error y la descripción bajo
 * el título los pone DetalleInventario. Lógica (orden, tope, textos, enlaces) en `leonardo.modelo.ts`, con test.
 *
 * Una tarjeta: «Te toca · por aprobar» con la cifra grande en ámbar, el circuito completo en una línea (Pedida marcada:
 * «estas son ↓»), las diferencias sin aclarar aparte en una fila roja (las resuelve él; la tarjeta de arriba las suma a
 * lo por aprobar) y la bandeja de las más antiguas primero (5 a la vista). Una acción por fila: la fila entera despliega
 * debajo, ahí mismo, el detalle REAL de Inventario para aprobarla o rechazarla (el dueño 2026-10-23: «resolver
 * enseguida y no me lleve hasta Inventario»; ResolverSolicitud.tsx envuelve TransferenciaDetail), una abierta a la vez,
 * con «Abrir en Inventario» y la X; al resolverla se cierra, sale el aviso (y el resumen con WhatsApp al aprobar) y se
 * vuelve a pedir el Inicio. Si la pidió él mismo (SoD), en vez del botón va una nota apagada y la fila abre la solicitud
 * en Inventario, como antes. Bajo 1280 px (celular, tablet y notebook chico con el menú abierto): «Revisar →» arriba a
 * la derecha y los días en una píldora corta; desde 1280 px, la fila del lienzo en una línea con la pastilla.
 *
 * OJO al promover: el enlace de cada fila (`&id=N`) necesita que Inventario lea `id` y lo pase a TransferenciasPanel
 * (`initialSelectedId`); sin eso se abre la primera de la lista, que es la más nueva. Lo cuida un test del modelo.
 */

/** Anillo de foco del sistema (`ring-ring`, verde con contraste ≥ 3:1 sobre blanco; SKILL diseño). */
const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// ═══════════════════════════════ Piezas ═══════════════════════════════

const Circulo: React.FC<{ tono: TonoTarjeta; children: React.ReactNode }> = ({ tono, children }) => (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-section font-bold', PILDORA[tono])} aria-hidden>
        {children}
    </span>
);

/**
 * Fila entera tocable (una acción por fila). Con `abierta` (boolean) despliega el detalle bajo ella (acordeón: el lector
 * de pantalla oye «expandido / contraído»); sin él, abre la solicitud en Inventario. Lo de adentro marca la acción con verde.
 */
const FilaTocable: React.FC<{ onClick: () => void; abierta?: boolean; controla?: string; children: React.ReactNode }> = ({
    onClick, abierta, controla, children,
}) => (
    // eslint-disable-next-line no-restricted-syntax -- fila entera tocable del lienzo: despliega el detalle (o abre la solicitud)
    <button type="button" onClick={onClick} aria-expanded={abierta} aria-controls={abierta ? controla : undefined}
        className={cn('group -mx-2 flex w-[calc(100%+1rem)] min-h-11 items-start gap-3 rounded-xl px-2 py-3 text-left transition-colors duration-200 hover:bg-muted/60 xl:items-center',
            abierta && 'bg-muted/60', FOCO)}>
        {children}
    </button>
);

/** La flecha de la acción: hacia la derecha si navega; hacia abajo si despliega (hacia arriba, ya abierta). */
const FlechaAccion: React.FC<{ abierta?: boolean }> = ({ abierta }) => (abierta === undefined
    ? <ArrowRight className="h-4 w-4" aria-hidden />
    : <ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', abierta && 'rotate-180')} aria-hidden />);

/** La acción de la fila bajo 1280 px: enlace verde chico («Revisar ⌄»), no una barra. */
const AccionCorta: React.FC<{ children: React.ReactNode; abierta?: boolean; className?: string }> = ({ children, abierta, className }) => (
    <span className={cn('inline-flex items-center gap-1 text-sm font-semibold text-green-700 group-hover:underline dark:text-green-300', className)}>
        {children}<FlechaAccion abierta={abierta} />
    </span>
);

/** La acción de la fila desde 1280 px: la pastilla verde de 44 px a la derecha (dibujo; el botón es la fila). */
const AccionPastilla: React.FC<{ children: React.ReactNode; abierta?: boolean; className?: string }> = ({ children, abierta, className }) => (
    <span className={cn('inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-green-50 px-4 text-sm font-semibold text-green-700 transition-colors duration-200 group-hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:group-hover:bg-green-500/25', className)}>
        {children}<FlechaAccion abierta={abierta} />
    </span>
);

/** Cabeza del bloque: rótulo, la cifra grande en su color y la frase que dice qué es. */
const Encabezado: React.FC<{
    id: string; rotulo: string; cifra: number; tono: TonoTarjeta; texto: string; bajada?: string;
}> = ({ id, rotulo, cifra, tono, texto, bajada }) => (
    <div className="space-y-3">
        <h3 id={id} className={ROTULO_FICHAS}>{rotulo}</h3>
        <div className="flex min-w-0 items-center gap-4">
            <span className={cn('text-display-sm font-bold leading-none tracking-display tabular-nums', CIFRA[cifra ? tono : 'neutro'])}>{cifra}</span>
            <div className="min-w-0">
                <p className="text-lg font-semibold leading-snug">{texto}</p>
                {bajada && <p className="text-sm text-muted-foreground">{bajada}</p>}
            </div>
        </div>
    </div>
);

const Vacio: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" aria-hidden />{children}
    </p>
);

/** Pie de la lista: enlace verde centrado de 44 px que lleva a Inventario. */
const PieEnlace: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <div className="mt-1 flex justify-center border-t border-border pt-1.5">
        {/* eslint-disable-next-line no-restricted-syntax -- enlace del pie de la lista (navega a Inventario) */}
        <button type="button" onClick={onClick}
            className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-section font-semibold text-green-700 hover:underline dark:text-green-300', FOCO)}>
            {children}<ArrowRight className="h-4 w-4" aria-hidden />
        </button>
    </div>
);

// ─────────────── Franja del circuito ───────────────

const ANILLO: Record<TonoTarjeta, string> = {
    rojo: 'ring-red-500', ambar: 'ring-amber-500', azul: 'ring-blue-500', verde: 'ring-green-600', neutro: 'ring-border',
};

/**
 * El circuito en UNA línea (≈ 80 px): tres círculos unidos con su conteo (Pedida → Aprobada → Recibida, sin «Despachada»:
 * don Luis 2026-10-23); la etapa del perfil, más grande, en su color y con anillo. Desde 640 px, bajo cada etapa en
 * curso, «hasta N días». Ancho tope de 672 px para que en el computador se lea como un camino. Cada etapa abre Inventario → Solicitudes con su lista (qué lista, en su `title`).
 */
const Circuito: React.FC<{
    pasos: PasoCircuito[]; marcas: Partial<Record<PasoCircuito['key'], MarcaPaso>>; etiqueta: string; onIr: (ruta: string) => void;
    className?: string;
}> = ({ pasos, marcas, etiqueta, onIr, className }) => (
    <ol aria-label={etiqueta} className={cn('grid w-full max-w-2xl grid-cols-3', className)}>
        {pasos.map((p, i) => {
            const r = marcas[p.key];
            const bajada = r?.bajada ?? p.bajada;
            return (
                <li key={p.key} className="relative min-w-0">
                    {/* La línea va de centro a centro de los círculos (columnas parejas). */}
                    {i > 0 && <span className="absolute right-1/2 top-[21px] z-0 h-0.5 w-full bg-border" aria-hidden />}
                    {/* eslint-disable-next-line no-restricted-syntax -- etapa del circuito: abre Inventario con su lista */}
                    <button type="button" onClick={() => onIr(p.ruta)} aria-label={etiquetaPaso(p, r)} title={p.abre}
                        className={cn('relative z-10 flex min-h-11 w-full min-w-0 flex-col items-center gap-0.5 rounded-xl px-0.5 pb-1 text-center transition-colors duration-200 hover:bg-muted/50', FOCO)}>
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card">
                            <span className={cn('flex items-center justify-center rounded-full font-bold tabular-nums',
                                r ? cn('h-11 w-11 text-base ring-2', PILDORA[r.tono], ANILLO[r.tono]) : 'h-9 w-9 bg-muted text-sm text-foreground')}>
                                {p.total}
                            </span>
                        </span>
                        <span className={cn('mt-0.5 text-xs leading-tight', r ? 'font-bold text-foreground' : 'font-medium text-zinc-700 dark:text-zinc-300')}>{p.texto}</span>
                        <span className={cn('leading-tight', r ? cn('text-xs font-semibold', CIFRA[r.tono]) : 'text-label text-muted-foreground')}>
                            {bajada}
                        </span>
                        {p.hasta !== null && (
                            <span className="text-label leading-tight text-muted-foreground max-sm:hidden">{textoHasta(p.hasta)}</span>
                        )}
                    </button>
                </li>
            );
        })}
    </ol>
);

/**
 * Las diferencias sin aclarar, APARTE del circuito: la fila roja tocable del lienzo (DiferenciasAparte, la misma de las
 * otras vistas), que abre Inventario → Diferencias (las resuelve quien aprueba).
 */
const DiferenciasAparte: React.FC<{ aviso: AvisoDiferencias; onClick: () => void; className?: string }> = ({ aviso, onClick, className }) => (
    // eslint-disable-next-line no-restricted-syntax -- fila de aviso tocable del lienzo A (abre Inventario → Diferencias)
    <button type="button" onClick={onClick} aria-label={`${aviso.titulo}. ${aviso.bajada}. Abre «Diferencias» en Inventario`}
        className={cn('flex min-h-11 w-full max-w-2xl items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors duration-200 hover:bg-red-100 dark:hover:bg-red-500/25',
            PILDORA.rojo, FOCO, className)}>
        <PackageX className="h-5 w-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{aviso.titulo}</span>
            <span className="block text-xs">{aviso.bajada}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </button>
);

// ═══════════════════════════════ Por aprobar ═══════════════════════════════

/**
 * Una fila de la bandeja. Dos disposiciones:
 *   - bajo 1280 px (celular del lienzo; también tablet y notebook chico, donde con el menú lateral la pastilla a la
 *     derecha apretaba el texto): apilada, «Revisar →» arriba a la derecha y los días en una píldora corta;
 *   - desde 1280 px: en una línea — obra y quién · ítems · «9 días esperando» · «Aprobar o rechazar».
 */
const FilaPorAprobar: React.FC<{
    f: FilaPorAprobarModelo; onIr: (ruta: string) => void;
    /** Solo las que se resuelven aquí (`f.resuelveAqui`): si su despliegue está abierto, y qué hacer al tocarla. */
    abierta: boolean; onResolver: () => void;
    /** El despliegue (ResolverSolicitud), cuando está abierta. */
    children?: React.ReactNode;
}> = ({ f, onIr, abierta, onResolver, children }) => {
    const aqui = f.resuelveAqui;
    const idDespliegue = idDespliegueDe(f.id);
    return (
    <li id={idFila(f.id)} className="scroll-mt-20 border-t border-border first:border-t-0">
        <FilaTocable onClick={aqui ? onResolver : () => onIr(f.ruta)} abierta={aqui ? abierta : undefined} controla={idDespliegue}>
            <Circulo tono={f.tonoCirculo}>{f.iniciales || <User className="h-4 w-4" />}</Circulo>
            <span className="min-w-0 flex-1 xl:flex xl:items-center xl:gap-6">
                <span className="block xl:w-56 xl:shrink-0">
                    {/* «Revisar →» arriba a la derecha (en la línea de las píldoras no cabía a 360 px). */}
                    <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-base font-semibold leading-snug">{f.lugar}</span>
                        {f.propia
                            ? <span className="shrink-0 text-xs text-muted-foreground xl:hidden">{NOTA_PROPIA_CORTA}</span>
                            : <AccionCorta className="shrink-0 xl:hidden" abierta={abierta}>Revisar</AccionCorta>}
                    </span>
                    {/* Sin cortar: el cargo baja de línea si no cabe. */}
                    {f.quien && <span className="block text-xs text-muted-foreground">{f.quien}</span>}
                </span>
                <span className="mt-1.5 block min-w-0 xl:mt-0 xl:flex-1">
                    <span className="block text-section leading-snug text-zinc-700 dark:text-zinc-300">{f.items}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {f.masAntigua && <Pildora tono="ambar">La más antigua</Pildora>}
                        {/* Corta («9 días») mientras no hay columna para la larga: la frase de arriba ya dice que esperan. */}
                        <span className="xl:hidden"><Pildora tono={f.tono}>{f.textoDias}</Pildora></span>
                        <Pildora tono="neutro">{f.tipo}</Pildora>
                        {/* Sin destino el código ya es el título: no se repite. */}
                        {f.codigoAparte && <span className="text-label text-muted-foreground max-md:hidden">{f.codigo}</span>}
                    </span>
                </span>
                <span className="w-32 shrink-0 text-right max-xl:hidden">
                    <Pildora tono={f.tono}>{f.textoEspera}</Pildora>
                </span>
            </span>
            {f.propia ? (
                // SoD: la pidió él mismo; en vez del botón, una nota apagada (la fila igual abre la solicitud).
                <span className="ml-3 inline-flex min-h-11 w-44 shrink-0 items-center justify-end gap-2 self-center text-right text-xs text-muted-foreground max-xl:hidden">
                    {NOTA_PROPIA}<ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                </span>
            ) : (
                <AccionPastilla className="ml-3 self-center max-xl:hidden" abierta={abierta}>Aprobar o rechazar</AccionPastilla>
            )}
        </FilaTocable>
        {aqui && abierta && (
            // A todo el ancho de la tarjeta (el mismo de la fila), con borde: es el detalle de Inventario de esta solicitud.
            <div id={idDespliegue} role="region" aria-label={`Aprobar o rechazar ${f.codigo}`}
                className="-mx-2 mb-3 mt-1 rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
                {children}
            </div>
        )}
    </li>
    );
};

/** Ids de la fila y de su despliegue (para llevar la vista hasta ella y devolverle el foco al cerrar). */
const idFila = (id: number) => `inv-leo-f-${id}`;
const idDespliegueDe = (id: number) => `inv-leo-d-${id}`;

/** Lleva la fila a la vista si su despliegue quedó abajo, fuera de la pantalla (sin animar con «reducir movimiento»). */
const mostrarFila = (id: number) => window.requestAnimationFrame(() => {
    const fila = document.getElementById(idFila(id));
    const despliegue = document.getElementById(idDespliegueDe(id));
    if (!fila || !despliegue) return;
    const tope = fila.closest('.overflow-y-auto')?.getBoundingClientRect().top ?? 0;
    const r = despliegue.getBoundingClientRect();
    if (r.top < tope || r.top > window.innerHeight - 160) {
        const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        fila.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    }
});

const VistaLeonardo: React.FC<PropsVistaInventario> = ({ datos, onCambio }) => {
    const navigate = useNavigate();
    const ir = (ruta: string) => navigate(ruta);
    const { user } = useAuth();
    const pendientes = porAprobar(datos);
    // La cifra es la exacta del circuito (la lista puede venir con tope); la bandeja muestra las 5 más antiguas.
    const n = datos.circuito.pedida.total;
    const propias = pendientes.filter(esPropiaBloqueada).length;
    const visibles = pendientes.slice(0, TOPE_LEO);
    const diferencias = avisoDiferencias(datos.circuito.diferencias);

    // «Aprobar o rechazar» ahí mismo (el dueño 2026-10-23): una fila abierta a la vez. `n` vuelve a montar el despliegue
    // (la solicitud se pide de nuevo) cada vez que se abre.
    const [abierta, setAbierta] = useState<{ id: number; n: number } | null>(null);
    const idAbierta = abiertaVigente(abierta?.id, visibles.map(s => s.id));
    // El resumen con WhatsApp que Inventario abre tras aprobar (ResumenAccionModal), con la solicitud fresca.
    const [resumen, setResumen] = useState<{ open: boolean; t: Transferencia | null; tipo: ResumenTrasAccion }>({ open: false, t: null, tipo: 'aprobar' });
    // «Ver como → quien aprueba» del Super Administrador: lo que haga ahí queda a SU nombre.
    const nota = esSuperAdmin(user) && !datos.super_admin ? NOTA_RESOLVER_VER_COMO : null;
    const resolver = (id: number) => {
        if (idAbierta === id) { setAbierta(null); return; }
        setAbierta(a => ({ id, n: (a?.n ?? 0) + 1 }));
        mostrarFila(id);
    };
    const cerrar = (id: number) => {
        setAbierta(null);
        // La X desaparece con el despliegue: el foco vuelve a la fila.
        window.requestAnimationFrame(() => document.getElementById(idFila(id))?.querySelector('button')?.focus({ preventScroll: true }));
    };
    const alResolver = (accion: AccionResuelta, t: Transferencia | null) => {
        setAbierta(null);
        const tipo = resumenTrasAccion(accion);
        if (tipo && t) setResumen({ open: true, t, tipo });
        onCambio?.();
    };
    return (
        <section data-vista="leonardo" className={TARJETA} aria-labelledby="inv-leo-t">
            <Encabezado id="inv-leo-t" rotulo="Te toca · por aprobar" cifra={n} tono="ambar" texto={textoCifra(n)}
                bajada={bajadaPorAprobar(n, datos.circuito.pedida.dias ?? pendientes[0]?.dias, propias)} />
            {/* El circuito completo, en una línea, entre la frase y la lista: «Pedida» es lo de abajo. */}
            <Circuito className="mt-5" etiqueta={etiquetaCircuito(datos.alcance.todas)} onIr={ir}
                pasos={pasosCircuito(datos.circuito, datos.hoy)} marcas={{ pedida: marcaPedida(n) }} />
            {/* Aparte del circuito: lo que llegó distinto también le toca (la tarjeta de arriba lo suma a lo por aprobar). */}
            {diferencias && <DiferenciasAparte className="mt-3" aviso={diferencias} onClick={() => ir(diferencias.ruta)} />}
            {n === 0
                ? <Vacio>{textoVacio(diferencias?.total ?? 0)}</Vacio>
                : (
                    <>
                        {visibles.length > 0
                            ? (
                                <ul className="mt-2">
                                    {visibles.map((s, i) => {
                                        const f = filaPorAprobar(s, i, pendientes.length);
                                        const esta = idAbierta === s.id;
                                        return (
                                            <FilaPorAprobar key={s.id} f={f} onIr={ir} abierta={esta} onResolver={() => resolver(s.id)}>
                                                {esta && (
                                                    <ResolverSolicitud key={`${s.id}-${abierta?.n ?? 0}`} id={s.id} ruta={f.ruta} nota={nota}
                                                        onCerrar={() => cerrar(s.id)} onResuelta={alResolver} onCambio={() => onCambio?.()} />
                                                )}
                                            </FilaPorAprobar>
                                        );
                                    })}
                                </ul>
                            )
                            : <p className="py-3 text-sm text-muted-foreground">{TEXTO_FUERA_DE_LISTA}</p>}
                        <PieEnlace onClick={() => ir(RUTA_POR_APROBAR)}>{textoPie(n)}</PieEnlace>
                    </>
                )}
            {/* Lo mismo que Inventario tras aprobar: el resumen con el respaldo por WhatsApp (queda abierto aunque la fila salga). */}
            <ResumenAccionModal isOpen={resumen.open} onClose={() => setResumen(r => ({ ...r, open: false }))} t={resumen.t} tipo={resumen.tipo} />
        </section>
    );
};

export default VistaLeonardo;
