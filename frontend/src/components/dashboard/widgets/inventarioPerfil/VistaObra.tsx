import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Ban, Check, ChevronRight, PackageCheck, PackageX, Plus, Truck } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Pildora } from '../FichaInicio';
import { CIFRA, PILDORA, ROTULO_FICHAS } from '../fichasInicio';
import type { TonoTarjeta } from '../tarjetaActiva';
import { RUTA_PEDIR, TARJETA, fechaCorta, plural, rutaLista, rutaSolicitud, textoDias } from './formato';
import {
    RUTA_RECIBIR_VACIO, TOPE_HISTORIAL, botonRecibir, botonesGrandes, estadoPorRecibir, itemsPedidos, itemsQueLlegan, lineaEsperando,
    lineaFuera, lineaHistorial, lineaPorRecibir, modeloObra, pasosCircuito, pildoraEsperando, pildoraHistorial, textoRechazo,
    type AvisoDiferencias, type BotonGrande, type BotonRecibir, type DatosCircuito, type MarcaCircuito, type Paso, type PieLista,
} from './obra.modelo';
import type { PropsVistaInventario } from './perfil';
import type { SolicitudPerfil } from './tipos';

/**
 * Detalle «Inventario» del Inicio para quien pide y recibe materiales para su obra (jefes de obra y prevencionistas):
 * opción A «Lo tuyo primero» del lienzo (VistaObra de boveda-diseno/frontend/src/preview/inventario/opcionA.tsx, Marcos
 * 2026-10-22). De arriba abajo: los botones grandes («Pedir materiales», solo con permiso de pedir, y «Recibir»:
 * `botonesGrandes`), lo que llega a su obra (y,
 * aparte y sin «Recibir», lo suyo que va a otro lugar: devoluciones, traslados, lo pedido para otra obra), el historial de
 * lo que ya llegó junto a lo que espera aprobación (y lo no aprobado del mes), y sus solicitudes en el circuito con el
 * aviso de diferencias aparte, en rojo. Una acción por fila: la fila entera se toca.
 *
 * Todo NAVEGA a Inventario (desde el Inicio no se aprueba ni se recibe; aunque quien mira tenga `aprobar`, aquí no hay
 * ningún botón de aprobar ni se lee `puede.aprobar` / `puede_aprobar`): cada fila abre su solicitud
 * (`rutaSolicitud`), «Pedir materiales» abre el asistente de pedir (`RUTA_PEDIR`). Recibe `datos`
 * (GET /transferencias/inicio/perfil, contrato en tipos.ts) ya cargados: la espera, el error y la descripción bajo el
 * título los pone DetalleInventario. Orden, topes y textos: `obra.modelo.ts` (con test); lo común, `formato.ts`.
 * Reglas: docs/reglas/inventario-transferencias.md § Inicio por perfil → «Vista de obra».
 * Celular (bajo 768 px): la acción de cada fila es un enlace verde chico; desde 768 px, la pastilla a la derecha.
 */

// Anillo de foco = el token `ring` (verde, 3:1 sobre blanco), sin transparencia: con teclado se tiene que ver.
const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const FOCO_GRANDE = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
/** Textos libres (los personalizados lo son): una palabra larga sin espacios no se sale de la tarjeta. */
const PARTE = 'wrap-anywhere';
const ID_RECIBIR = 'inv-obra-rec';

/**
 * Lleva a un bloque de esta misma vista (en el celular está más abajo). Solo se mueve si el bloque no está a la vista y
 * sin animar con «reducir movimiento»; el foco pasa a su título.
 */
const bajarA = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 64 || r.top > window.innerHeight - 200) {
        const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    }
    el.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
};

// ═══════════════════════════════ Piezas ═══════════════════════════════

const Circulo: React.FC<{ tono: TonoTarjeta; children: React.ReactNode }> = ({ tono, children }) => (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-section font-bold', PILDORA[tono])} aria-hidden>
        {children}
    </span>
);

/** Fila entera tocable (una acción por fila): abre la solicitud. Lo de adentro marca la acción con verde. */
const FilaTocable: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    // eslint-disable-next-line no-restricted-syntax -- fila entera tocable del lienzo A: abre la solicitud (navega)
    <button type="button" onClick={onClick}
        className={cn('group -mx-2 flex w-[calc(100%+1rem)] min-h-11 items-start gap-3 rounded-xl px-2 py-3 text-left transition-colors duration-200 hover:bg-muted/60 md:items-center', FOCO)}>
        {children}
    </button>
);

/** La acción de la fila en el celular: enlace verde chico («Recibir →»), no una barra. */
const AccionCorta: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <span className={cn('inline-flex items-center gap-1 text-sm font-semibold text-green-700 group-hover:underline dark:text-green-300', className)}>
        {children}<ArrowRight className="h-4 w-4" aria-hidden />
    </span>
);

/** La acción de la fila desde 768 px: la pastilla verde de 44 px a la derecha (dibujo; el botón es la fila). */
const AccionPastilla: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <span className={cn('inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-green-50 px-4 text-sm font-semibold text-green-700 transition-colors duration-200 group-hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:group-hover:bg-green-500/25', className)}>
        {children}<ArrowRight className="h-4 w-4" aria-hidden />
    </span>
);

/** Fila que solo abre la solicitud: toda la fila se toca, con la flecha gris a la derecha. */
const FilaAbre: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <FilaTocable onClick={onClick}>
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden />
    </FilaTocable>
);

/** Rótulo de un bloque (sin cifra); el título recibe el foco cuando otro botón lleva hasta aquí (con teclado, subrayado). */
const Rotulo: React.FC<{ id: string; titulo: string; nota?: string | null }> = ({ id, titulo, nota }) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={id} tabIndex={-1} className={cn(ROTULO_FICHAS, 'focus:outline-none focus-visible:underline')}>{titulo}</h3>
        {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
    </div>
);

const Vacio: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" aria-hidden />{children}
    </p>
);

/** Pie de una lista: enlace verde centrado de 44 px que lleva a Inventario. */
const PieEnlace: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <div className="mt-1 flex justify-center border-t border-border pt-1.5">
        {/* eslint-disable-next-line no-restricted-syntax -- enlace del pie de la lista (navega a Inventario) */}
        <button type="button" onClick={onClick}
            className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-section font-semibold text-green-700 hover:underline dark:text-green-300', FOCO)}>
            {children}<ArrowRight className="h-4 w-4" aria-hidden />
        </button>
    </div>
);

/** El pie de una lista que pasó su tope («Ver las 7 en Inventario»); nada si caben todas. */
const PieTope: React.FC<{ pie: PieLista | null; onAbrir: (ruta: string) => void }> = ({ pie, onAbrir }) =>
    (pie ? <PieEnlace onClick={() => onAbrir(pie.ruta)}>{pie.texto}</PieEnlace> : null);

// ─────────────── Franja del circuito ───────────────

const ANILLO: Record<TonoTarjeta, string> = {
    rojo: 'ring-red-500', ambar: 'ring-amber-500', azul: 'ring-blue-500', verde: 'ring-green-600', neutro: 'ring-border',
};

/**
 * El circuito en UNA línea (≈ 80 px): cuatro círculos unidos con su conteo; las etapas marcadas, más grandes, en su
 * color y con anillo. Desde 640 px, bajo cada etapa en curso, «hasta N días». Ancho tope de 672 px para que en el
 * computador se lea como un camino. Cada etapa abre Inventario → Solicitudes con su filtro.
 */
const Circuito: React.FC<{
    datos: DatosCircuito; hoy: string; marcas: Partial<Record<Paso, MarcaCircuito>>; etiqueta: string; onAbrir: (ruta: string) => void;
}> = ({ datos, hoy, marcas, etiqueta, onAbrir }) => (
    <ol aria-label={etiqueta} className="grid w-full max-w-2xl grid-cols-4">
        {pasosCircuito(hoy).map((p, i) => {
            const m = marcas[p.key];
            const n = datos.conteos[p.key];
            const hasta = datos.hasta[p.key];
            const bajada = m?.bajada ?? p.bajada;
            return (
                <li key={p.key} className="relative min-w-0">
                    {/* La línea va de centro a centro de los círculos (columnas parejas). */}
                    {i > 0 && <span className="absolute right-1/2 top-[21px] z-0 h-0.5 w-full bg-border" aria-hidden />}
                    {/* eslint-disable-next-line no-restricted-syntax -- etapa del circuito: abre Inventario con su lista */}
                    <button type="button" onClick={() => onAbrir(rutaLista(p.filtro))} aria-label={`${p.texto}: ${n}, ${bajada}`}
                        className={cn('relative z-10 flex min-h-11 w-full min-w-0 flex-col items-center gap-0.5 rounded-xl px-0.5 pb-1 text-center transition-colors duration-200 hover:bg-muted/50', FOCO)}>
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card">
                            <span className={cn('flex items-center justify-center rounded-full font-bold tabular-nums',
                                m ? cn('h-11 w-11 text-base ring-2', PILDORA[m.tono], ANILLO[m.tono]) : 'h-9 w-9 bg-muted text-sm text-foreground')}>
                                {n}
                            </span>
                        </span>
                        <span className={cn('mt-0.5 text-xs leading-tight', m ? 'font-bold text-foreground' : 'font-medium text-zinc-700 dark:text-zinc-300')}>{p.texto}</span>
                        <span className={cn('leading-tight', m ? cn('text-xs font-semibold', CIFRA[m.tono]) : 'text-label text-muted-foreground')}>{bajada}</span>
                        {hasta !== undefined && n > 0 && (
                            <span className="text-label leading-tight text-muted-foreground max-sm:hidden">hasta {textoDias(hasta)}</span>
                        )}
                    </button>
                </li>
            );
        })}
    </ol>
);

/**
 * Las diferencias de su obra, APARTE del circuito: una fila roja tocable que abre la solicitud (con una sola) o sus
 * recibidas (con varias).
 */
const DiferenciasAparte: React.FC<{ aviso: AvisoDiferencias; onClick: () => void }> = ({ aviso, onClick }) => (
    // eslint-disable-next-line no-restricted-syntax -- fila de aviso tocable del lienzo A (abre la solicitud o sus recibidas)
    <button type="button" onClick={onClick} aria-label={`${aviso.titulo}. ${aviso.bajada}. Abrir en Inventario`}
        className={cn('flex min-h-11 w-full max-w-2xl items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors duration-200 hover:bg-red-100 dark:hover:bg-red-500/25 xl:flex-1',
            PILDORA.rojo, FOCO)}>
        <PackageX className="h-5 w-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{aviso.titulo}</span>
            <span className="block text-xs">{aviso.bajada}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </button>
);

// ─────────────── Botones grandes ───────────────

/**
 * «+ Pedir materiales» (verde lleno) y «Recibir» (contorno verde), los que diga `botonesGrandes`. El número de lo que
 * llega a su obra vive SOLO en la burbuja azul de «Recibir». Con una sola por recibir la abre directo; con varias, baja
 * a la lista de abajo; sin nada, abre lo último que llegó. Sin el permiso de recibir el botón dice «Lo que llega» y va
 * neutro (sin verde de acción). Sin permiso de pedir no hay «Pedir materiales»: «Recibir» va solo, a todo el ancho y en
 * una fila también en el celular (no un cuadro alto casi vacío). Nunca hay botón de aprobar.
 */
const BotonesGrandes: React.FC<{
    botones: readonly BotonGrande[]; porRecibir: SolicitudPerfil[]; boton: BotonRecibir; onAbrir: (ruta: string) => void;
}> = ({ botones, porRecibir, boton, onAbrir }) => {
    const n = porRecibir.length;
    const solo = botones.length === 1;
    const recibir = () => {
        if (n === 1) onAbrir(rutaSolicitud(porRecibir[0]));
        else if (n > 1) bajarA(ID_RECIBIR);
        else onAbrir(RUTA_RECIBIR_VACIO);
    };
    return (
        <div className={cn('grid gap-3 sm:gap-6', solo ? 'grid-cols-1' : 'grid-cols-2')}>
            {botones.includes('pedir') && (
                // eslint-disable-next-line no-restricted-syntax -- botón grande del Inicio de obra (tile de 112 px, navega)
                <button type="button" onClick={() => onAbrir(RUTA_PEDIR)}
                    className={cn('flex min-h-28 flex-col items-start justify-between gap-3 rounded-3xl bg-brand-primary p-4 text-left text-white shadow-[var(--shadow-md)] transition duration-200 hover:brightness-95 active:brightness-90 sm:flex-row sm:items-center sm:justify-start sm:gap-4 sm:p-6', FOCO_GRANDE)}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20" aria-hidden>
                        <Plus className="h-6 w-6" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-lg font-bold leading-tight sm:text-title-sm">Pedir materiales</span>
                        <span className="mt-0.5 block text-xs sm:text-sm">Nueva solicitud a bodega</span>
                    </span>
                </button>
            )}
            {botones.includes('recibir') && (
                // eslint-disable-next-line no-restricted-syntax -- botón grande del Inicio de obra (tile de 112 px; abre o baja a la lista)
                <button type="button" onClick={recibir} aria-label={boton.etiqueta}
                    className={cn('relative flex min-h-28 rounded-3xl bg-card p-4 text-left text-foreground shadow-[var(--shadow-md)] transition-colors duration-200 sm:p-6',
                        solo ? 'flex-row items-center gap-4' : 'flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:justify-start sm:gap-4',
                        boton.accion ? 'ring-2 ring-brand-primary hover:bg-green-50 dark:hover:bg-green-500/10' : 'ring-1 ring-border hover:bg-muted/60',
                        FOCO_GRANDE)}>
                    <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                        boton.accion ? 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-muted text-muted-foreground')} aria-hidden>
                        <PackageCheck className="h-6 w-6" />
                    </span>
                    <span className={cn('min-w-0', solo && n > 0 && 'pr-10')}>
                        <span className={cn('block text-lg font-bold leading-tight sm:text-title-sm', boton.accion ? 'text-green-700 dark:text-green-300' : 'text-foreground')}>
                            {boton.titulo}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground sm:text-sm">{boton.texto}</span>
                    </span>
                    {n > 0 && (
                        <span className={cn('absolute flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-600 px-2 text-sm font-bold tabular-nums text-white',
                            solo ? 'right-4 top-1/2 -translate-y-1/2 sm:right-5' : 'right-3 top-3 sm:right-5 sm:top-1/2 sm:-translate-y-1/2')} aria-hidden>
                            {n}
                        </span>
                    )}
                </button>
            )}
        </div>
    );
};

// ─────────────── Filas ───────────────

const FilaPorRecibir: React.FC<{ s: SolicitudPerfil; accion: string; onAbrir: (ruta: string) => void }> = ({ s, accion, onAbrir }) => {
    const estado = estadoPorRecibir(s);
    return (
        <li className="border-t border-border first:border-t-0">
            <FilaTocable onClick={() => onAbrir(rutaSolicitud(s))}>
                <Circulo tono={estado.tono}>{estado.enCamino ? <Truck className="h-4 w-4" /> : <Check className="h-4 w-4" />}</Circulo>
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Pildora tono={estado.tono}>{estado.texto}</Pildora>
                        <span className="text-label text-muted-foreground">{s.codigo}</span>
                    </span>
                    <span className={cn('mt-1 block text-base font-semibold leading-snug', PARTE)}>{itemsQueLlegan(s)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={cn('min-w-0 text-xs text-muted-foreground', PARTE)}>{lineaPorRecibir(s)}</span>
                        <AccionCorta className="ml-auto md:hidden">{accion}</AccionCorta>
                    </span>
                </span>
                <AccionPastilla className="max-md:hidden">{accion}</AccionPastilla>
            </FilaTocable>
        </li>
    );
};

/** Lo suyo que NO llega a su obra (devolución, traslado, lo pedido para otra obra): solo se abre, sin «Recibir». */
const FilaFuera: React.FC<{ s: SolicitudPerfil; obraId: number | null; onAbrir: (ruta: string) => void }> = ({ s, obraId, onAbrir }) => (
    <li className="border-t border-border first:border-t-0">
        <FilaAbre onClick={() => onAbrir(rutaSolicitud(s))}>
            <span className={cn('block text-sm font-semibold leading-snug', PARTE)}>{itemsQueLlegan(s, 2)}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('min-w-0 text-xs text-muted-foreground', PARTE)}>{lineaFuera(s, obraId)}</span>
                <span className="text-label text-muted-foreground">{s.codigo}</span>
            </span>
        </FilaAbre>
    </li>
);

const FilaHistorial: React.FC<{ s: SolicitudPerfil; onAbrir: (ruta: string) => void }> = ({ s, onAbrir }) => {
    const pildora = pildoraHistorial(s);
    const linea = lineaHistorial(s);
    return (
        <li className="border-t border-border first:border-t-0">
            <FilaAbre onClick={() => onAbrir(rutaSolicitud(s))}>
                <span className="flex items-start gap-3">
                    <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{fechaCorta(s.recepcion?.fecha)}</span>
                    <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm font-semibold leading-snug', PARTE)}>{itemsQueLlegan(s, 2)}</span>
                        {(linea || pildora) && (
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {linea && <span className={cn('min-w-0 text-xs text-muted-foreground', PARTE)}>{linea}</span>}
                                {pildora && <Pildora tono={pildora.tono}>{pildora.texto}</Pildora>}
                            </span>
                        )}
                    </span>
                </span>
            </FilaAbre>
        </li>
    );
};

// ═══════════════════════════════ La vista ═══════════════════════════════

const VistaObra: React.FC<PropsVistaInventario> = ({ datos }) => {
    const navigate = useNavigate();
    const m = modeloObra(datos);
    const { enObra, obraId, porRecibir, fuera, esperando, historial, rechazadas, diferencias, rotulos } = m;
    const boton = botonRecibir(porRecibir.todas.length, enObra, datos.puede.recibir);
    return (
        <div data-vista="obra" className="space-y-6">
            <BotonesGrandes botones={botonesGrandes(datos.puede)} porRecibir={porRecibir.todas} boton={boton} onAbrir={navigate} />

            {/* Sin cifra ni frase grande: el número vive solo en la burbuja de «Recibir». */}
            <section id={ID_RECIBIR} className={cn(TARJETA, 'scroll-mt-20')} aria-labelledby="inv-obra-r">
                <Rotulo id="inv-obra-r" titulo={`Tus aprobados · por recibir en ${enObra}`} nota={boton.nota} />
                {porRecibir.todas.length === 0
                    ? <Vacio>No hay nada en camino a {enObra}.</Vacio>
                    : (
                        <>
                            <ul className="mt-2">
                                {porRecibir.visibles.map(s => <FilaPorRecibir key={s.id} s={s} accion={boton.accionFila} onAbrir={navigate} />)}
                            </ul>
                            <PieTope pie={porRecibir.pie} onAbrir={navigate} />
                        </>
                    )}
                {/* Lo suyo que sale de su obra o va a otra: aparte y sin «Recibir» (no se le invita a confirmar su propia devolución). */}
                {fuera.todas.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <h4 className={ROTULO_FICHAS}>Va a otro lugar</h4>
                            <span className="text-xs text-muted-foreground">Lo confirma quien recibe en el destino</span>
                        </div>
                        <ul className="mt-1">{fuera.visibles.map(s => <FilaFuera key={s.id} s={s} obraId={obraId} onAbrir={navigate} />)}</ul>
                        <PieTope pie={fuera.pie} onAbrir={navigate} />
                    </div>
                )}
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <section className={cn(TARJETA, 'min-w-0 space-y-2')} aria-labelledby="inv-obra-h">
                    <Rotulo id="inv-obra-h" titulo="Historial de aprobados" nota="Lo que ya llegó a tu obra" />
                    {historial.length === 0 ? <Vacio>Todavía no ha llegado nada a {enObra}.</Vacio> : (
                        <>
                            <ul>{historial.slice(0, TOPE_HISTORIAL).map(s => <FilaHistorial key={s.id} s={s} onAbrir={navigate} />)}</ul>
                            <PieEnlace onClick={() => navigate(rutaLista('recibida'))}>Ver todo tu historial</PieEnlace>
                        </>
                    )}
                </section>

                <section className={cn(TARJETA, 'min-w-0 space-y-2')} aria-labelledby="inv-obra-e">
                    <div className="flex items-baseline justify-between gap-3">
                        <h3 id="inv-obra-e" className={ROTULO_FICHAS}>{m.tituloEsperando}</h3>
                        <span className={cn('text-title-sm font-bold tabular-nums', CIFRA[esperando.todas.length ? 'ambar' : 'neutro'])}>{esperando.todas.length}</span>
                    </div>
                    {esperando.todas.length === 0 ? <Vacio>Nada esperando aprobación.</Vacio> : (
                        <>
                            <ul>
                                {esperando.visibles.map(s => {
                                    const pildora = pildoraEsperando(s.dias);
                                    const linea = lineaEsperando(s, obraId);
                                    return (
                                        <li key={s.id} className="border-t border-border first:border-t-0">
                                            <FilaAbre onClick={() => navigate(rutaSolicitud(s))}>
                                                <span className={cn('block text-sm font-semibold leading-snug', PARTE)}>{itemsPedidos(s)}</span>
                                                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    {linea && <span className={cn('min-w-0 text-xs text-muted-foreground', PARTE)}>{linea}</span>}
                                                    <Pildora tono={pildora.tono}>{pildora.texto}</Pildora>
                                                </span>
                                            </FilaAbre>
                                        </li>
                                    );
                                })}
                            </ul>
                            <PieTope pie={esperando.pie} onAbrir={navigate} />
                        </>
                    )}
                    {/* Lo que no se aprobó va aquí (no en el historial de aprobados), con su motivo; cada una abre su solicitud. */}
                    {rechazadas.todas.length > 0 && (
                        <div className="space-y-2 border-t border-border pt-3">
                            <h4 className={ROTULO_FICHAS}>No {plural(rechazadas.todas.length, 'aprobada', 'aprobadas')} · este mes</h4>
                            <ul className="space-y-2">
                                {rechazadas.visibles.map(s => {
                                    const r = textoRechazo(s);
                                    return (
                                        <li key={s.id}>
                                            {/* eslint-disable-next-line no-restricted-syntax -- aviso tocable del lienzo A: abre la solicitud no aprobada */}
                                            <button type="button" onClick={() => navigate(rutaSolicitud(s))}
                                                className={cn('flex min-h-11 w-full items-start gap-2.5 rounded-2xl bg-muted/60 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-muted', FOCO)}>
                                                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300" aria-hidden />
                                                <span className={cn('min-w-0 flex-1 text-xs text-zinc-700 dark:text-zinc-300', PARTE)}>
                                                    <span className="font-semibold text-foreground">{r.items}</span>{r.cuando}
                                                    {r.motivo && <>{' '}«{r.motivo}»</>}
                                                </span>
                                                <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                            <PieTope pie={rechazadas.pie} onAbrir={navigate} />
                        </div>
                    )}
                </section>
            </div>

            <section className={TARJETA} aria-labelledby="inv-obra-c">
                <Rotulo id="inv-obra-c" titulo={rotulos.titulo} nota={rotulos.nota} />
                {/* Computador: la fila de diferencias al lado del circuito (no deja medio ancho vacío). */}
                <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-8">
                    <Circuito etiqueta={m.todasASuObra ? `Circuito de tus solicitudes, ${enObra}` : 'Circuito de tus solicitudes'}
                        datos={m.circuito} hoy={datos.hoy} onAbrir={navigate} marcas={rotulos.marcas} />
                    {diferencias && <DiferenciasAparte aviso={diferencias} onClick={() => navigate(diferencias.ruta)} />}
                </div>
            </section>
        </div>
    );
};

export default VistaObra;
