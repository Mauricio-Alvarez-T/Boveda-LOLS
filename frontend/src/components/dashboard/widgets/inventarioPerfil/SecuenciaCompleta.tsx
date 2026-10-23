import React from 'react';
import { ArrowRight, Ban, Check, ChevronDown } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { FiltroFichas, Pildora } from '../FichaInicio';
import { CUADRO, PILDORA, ROTULO_FICHAS } from '../fichasInicio';
import type { TonoTarjeta } from '../tarjetaActiva';
import { TARJETA, plural, rutaLista } from './formato';
import {
    GRUPOS, TOPE_GRUPO, TOPE_SEC_CEL, filasDelGrupo, gruposDe, rotuloGrupo,
    type Casilla, type FilaSec, type Grupo, type ModeloSecuencia,
} from './superadmin.modelo';
import type { EstadoSecuencia } from './useSecuencia';

/**
 * «Secuencia completa · cada solicitud» (diseño «Super Administrador» de la opción A del lienzo): cada solicitud con
 * Pidió → Aprobó → Recibió → «Ahora: … · a quién le toca», agrupadas en cinco pasos (pestañas Todas · Por aprobar ·
 * Aprobadas · Recibidas · No aprobadas), con «Ver las N». Estaba dentro de VistaSuperAdmin; desde 2026-10-23 va también
 * bajo lo de VistaJefatura (el dueño: a Daphne «le interesa tener el detalle en lo que va cada solicitud»), por eso vive
 * aparte. Lógica en `superadmin.modelo.ts` (`modeloSecuencia` / `modeloSuperAdmin`); el estado (pestaña, desplegada) en
 * `useSecuencia.ts`, porque el circuito del Super Administrador también lleva a sus pestañas.
 * Nada se aprueba ni se recibe aquí: «Ver» abre la solicitud (o su diferencia) en Inventario.
 * Exporta además las piezas chicas que comparte con VistaSuperAdmin (Rotulo, Vacio, VerMas, EnlaceInventario).
 */

/** Anillo de foco del sistema (`ring-ring`, verde sólido: se ve sobre la tarjeta blanca), como VistaLeonardo y VistaObra. */
const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// ═══════════════════════════════ Piezas (también de VistaSuperAdmin) ═══════════════════════════════

/** Rótulo de un bloque (sin cifra); el título recibe el foco cuando otro botón lleva hasta aquí. */
export const Rotulo: React.FC<{ id: string; titulo: string; nota?: string; nivel?: 'h3' | 'h4' }> = ({ id, titulo, nota, nivel = 'h3' }) => {
    const H = nivel;
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <H id={id} tabIndex={-1} className={cn(ROTULO_FICHAS, 'focus:outline-none')}>{titulo}</H>
            {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
        </div>
    );
};

export const Vacio: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" aria-hidden />{children}
    </p>
);

/** «Ver las N» / «Ver menos»: despliega la lista ahí mismo (como «Próximos 14 días» de Asistencia). */
export const VerMas: React.FC<{ abierto: boolean; onClick: () => void; texto: string; controla: string; className?: string }> = ({
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
export const EnlaceInventario: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className }) => (
    // eslint-disable-next-line no-restricted-syntax -- enlace a Inventario (navega)
    <button type="button" onClick={onClick}
        className={cn('inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-300 md:min-h-9', FOCO, className)}>
        {children}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </button>
);

// ─────────────── Pasos de una solicitud ───────────────

/** Punto del rótulo de cada paso (el gris de «No aprobada»: cerrada, sin significado de color). */
const PUNTO: Record<Grupo, string> = {
    aprobar: CUADRO.ambar, aprobada: CUADRO.ambar, dif: CUADRO.rojo, completa: CUADRO.verde,
    rechazada: 'bg-zinc-400 dark:bg-zinc-500',
};

const BORDE_AHORA: Record<TonoTarjeta, string> = {
    rojo: 'border-red-500', ambar: 'border-amber-500', azul: 'border-blue-500', verde: 'border-green-600', neutro: 'border-border',
};

/** El punto del paso (las reglas del camino P·A·R de la app: hecho relleno, ahora anillo, falta punteado, sin registro hueco). */
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

/**
 * Lo que no conviene partir («recibir lo que falta», «hace 2 días») va junto en el celular y desde 1280 px, donde la
 * columna le da el ancho. De 768 a 1279 px (iPad vertical, media ventana con el menú abierto) las cuatro columnas son
 * angostas y se corta normal: con espacios que no se cortan, un verbo largo se salía de la píldora y se montaba en la
 * columna siguiente.
 */
const JUNTO = 'whitespace-nowrap md:max-xl:whitespace-normal';
const NB = String.fromCharCode(160);
const NB_TODOS = new RegExp(NB, 'g');

/** Un verbo corto, junto («Ahora:» / «recibir», no partido en dos líneas). */
const VerboAhora: React.FC<{ verbo: string }> = ({ verbo }) =>
    (verbo.length <= 15 ? <span className={JUNTO}>{verbo}</span> : <>{verbo}</>);

/** Un texto del modelo: lo que viene unido con espacios que no se cortan («hace 2 días») va junto (salvo de 768 a 1279 px). */
const TextoJunto: React.FC<{ texto: string }> = ({ texto }) => (
    <>
        {texto.split(' ').map((parte, i) => (
            <React.Fragment key={i}>
                {i > 0 && ' '}
                {parte.includes(NB) ? <span className={JUNTO}>{parte.replace(NB_TODOS, ' ')}</span> : parte}
            </React.Fragment>
        ))}
    </>
);

/**
 * Un paso. En cuatro columnas que calzan fila con fila (desde 768 px Y con la lista de 32rem o más, abajo): el punto
 * arriba con la línea hacia el siguiente y debajo «Verbo · fecha», el nombre y un dato chico. Si no: en vertical, el
 * punto a la izquierda y la línea hacia abajo, «Pidió Carla Soto» en una línea; lo que falta no se dibuja (se nombra al
 * final).
 * Las cuatro columnas piden las dos cosas (`md:@lg:`): con el menú lateral abierto, de 768 a ~850 px la tarjeta mide
 * ~460 px y en columnas angostas no cabían las palabras largas (se salían o se partían). Ahí va en
 * vertical, como VistaJefatura pasa a su tira cuando la columna no da. El `@container` es la lista (`ids.lista`).
 */
const PasoSecuencia: React.FC<{ c: Casilla; sig?: Casilla }> = ({ c, sig }) => {
    if (c.tipo === 'nada') return <li className="max-md:hidden @max-lg:hidden" aria-hidden />;
    const linea = !!sig && sig.tipo !== 'nada';
    const rojo = c.punto === 'rojo' && !!c.motivo;
    const fecha = [c.verbo, c.fecha].filter(Boolean).join(' · ');
    return (
        <li className={cn('flex min-w-0 gap-3 md:@lg:flex-col md:@lg:gap-1.5', c.tipo === 'falta' && 'max-md:hidden @max-lg:hidden')}>
            <div className="flex shrink-0 flex-col items-center max-md:pt-0.5 @max-lg:pt-0.5 md:@lg:flex-row" aria-hidden>
                <PuntoPaso c={c} />
                {linea && (
                    <span className={cn('w-0.5 flex-1 md:@lg:h-0.5 md:@lg:w-auto',
                        sig.tipo === 'falta' ? 'bg-border max-md:hidden @max-lg:hidden' : 'bg-zinc-400 dark:bg-zinc-500')} />
                )}
            </div>
            <div className="min-w-0 flex-1 pb-3 md:@lg:pb-0 md:@lg:pr-2">
                {c.tipo === 'ahora' && (
                    <div className={cn('rounded-xl px-2.5 py-1.5 [overflow-wrap:anywhere] max-md:-mt-1 @max-lg:-mt-1 md:@lg:px-2 md:@lg:py-1', PILDORA[c.tono ?? 'ambar'])}>
                        <p className="text-xs font-bold">Ahora: <VerboAhora verbo={c.verbo} /></p>
                        {/* Desde 768 px en 13 px: «Leonardo López» cabe entero en la columna de 1280 px. */}
                        <p className="text-sm font-semibold leading-snug md:@lg:text-section">{c.quien}</p>
                        {c.detalle && <p className="text-xs"><TextoJunto texto={c.detalle} /></p>}
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
                        {/* Celular: «Pidió · sin datos aquí». */}
                        <p className="text-sm leading-snug text-muted-foreground md:@lg:hidden">{[c.verbo, c.nota].filter(Boolean).join(' · ')}</p>
                        <p className="text-xs text-muted-foreground max-md:hidden @max-lg:hidden">{c.verbo}</p>
                        {c.nota && <p className="text-label leading-snug text-muted-foreground max-md:hidden @max-lg:hidden">{c.nota}</p>}
                    </>
                )}
                {c.tipo === 'fin' && (
                    <>
                        <p className="text-sm font-semibold leading-snug text-zinc-700 dark:text-zinc-300 md:@lg:hidden">{c.verbo}: {c.quien?.toLowerCase()}</p>
                        <p className="text-xs text-muted-foreground max-md:hidden @max-lg:hidden">{c.verbo}</p>
                        <p className="text-sm font-semibold leading-snug text-zinc-700 dark:text-zinc-300 max-md:hidden @max-lg:hidden">{c.quien}</p>
                    </>
                )}
                {c.tipo === 'hecho' && (
                    <>
                        {/* Celular: «Pidió Carla Soto» y debajo «13 oct · Prevencionista». */}
                        <p className="text-sm leading-snug md:@lg:hidden">
                            <span className={rojo ? 'font-semibold text-red-700 dark:text-red-300' : 'text-muted-foreground'}>{c.verbo}</span>
                            {c.quien && <>{' '}<span className="font-semibold">{c.quien}</span></>}
                        </p>
                        {(c.fecha || c.extra) && <p className="text-xs text-muted-foreground md:@lg:hidden">{[c.fecha, c.extra].filter(Boolean).join(' · ')}</p>}
                        {/* Desde 768 px: «Pidió · 13 oct», el nombre y el dato chico. */}
                        <p className={cn('text-xs max-md:hidden @max-lg:hidden', rojo ? 'font-semibold text-red-700 dark:text-red-300' : 'text-muted-foreground')}>{fecha}</p>
                        {c.quien && <p className="text-sm font-semibold leading-snug max-md:hidden @max-lg:hidden">{c.quien}</p>}
                        {c.extra && <p className="text-label leading-snug text-muted-foreground max-md:hidden @max-lg:hidden">{c.extra}</p>}
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

/** Una solicitud con su secuencia completa: a la izquierda qué y adónde; a la derecha los cuatro pasos. */
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
        <ol aria-label={`Secuencia de la solicitud ${f.codigo}${f.ahora ? `. Ahora: ${f.ahora}` : ''}`} className="mt-3 md:@lg:grid md:@lg:grid-cols-4 xl:mt-0.5">
            {f.casillas.map((c, i) => <PasoSecuencia key={i} c={c} sig={f.casillas[i + 1]} />)}
        </ol>
        {f.despues && <p className="pl-7 text-xs text-muted-foreground md:@lg:hidden">{f.despues}</p>}
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

// ═══════════════════════════════ La sección ═══════════════════════════════

/**
 * La sección entera: rótulo, pestañas y la tarjeta con los pasos. En «Todas» se ven 2 por paso (1 en el celular); en
 * una pestaña o desplegada, hasta 50 por paso y el resto en Inventario. `sec` = `useSecuencia` de la vista que la pone;
 * `onIrRuta` navega a Inventario.
 */
const SecuenciaCompleta: React.FC<{
    m: ModeloSecuencia; sec: EstadoSecuencia; onIrRuta: (ruta: string) => void; className?: string;
}> = ({ m, sec, onIrRuta, className }) => {
    const { ids, filtro, todas } = sec;
    const enTodas = filtro === 'todas';
    const grupos = gruposDe(filtro, m.grupos);
    const total = grupos.reduce((a, g) => a + m.porGrupo[g.key].length, 0);
    const conRotulo = grupos.length > 1;
    // Filas anteriores a cada paso (en una pestaña, en el celular se ven las 3 primeras de toda la pestaña).
    const desde = grupos.map((_, i) => grupos.slice(0, i).reduce((a, g) => a + m.porGrupo[g.key].length, 0));
    return (
        <section id={ids.seccion} className={cn('min-w-0 scroll-mt-20 space-y-3', className)} aria-labelledby={ids.rotulo}>
            <Rotulo id={ids.rotulo} titulo="Secuencia completa · cada solicitud"
                nota={enTodas
                    ? 'Quién hizo cada paso y cuándo, y a quién le toca ahora · agrupadas por paso'
                    : 'Quién hizo cada paso y cuándo, y a quién le toca ahora · lo que se movió último, arriba'} />
            <FiltroFichas opciones={m.filtros} activa={filtro} etiqueta="Ver la secuencia por paso" onCambiar={sec.elegir} />
            <div className={TARJETA}>
                {total === 0 ? <Vacio>{enTodas ? 'Todavía no hay solicitudes.' : 'No hay solicitudes en este paso.'}</Vacio> : (
                    <>
                        <div id={ids.lista} className="@container">
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
                                            <div id={ids.grupo(g.key)} className={cn('flex min-h-11 scroll-mt-20 items-center justify-between gap-3 md:min-h-9', gi > 0 && 'pt-2 md:pt-3')}>
                                                <h4 tabIndex={-1} className={cn(ROTULO_FICHAS, 'flex min-w-0 items-start gap-2 focus:outline-none')}>
                                                    <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', PUNTO[g.key])} aria-hidden />
                                                    <span className="min-w-0 tabular-nums">{rotuloGrupo(g, n)}</span>
                                                </h4>
                                                {enlace !== null && <VerGrupo n={n} className={enlace || undefined} onClick={() => sec.ir({ filtro: g.filtro })} />}
                                            </div>
                                        )}
                                        <ul>
                                            {filas.slice(0, vista).map((f, i) => (
                                                <FilaSecuencia key={f.id} f={f} onIr={onIrRuta} className={oculta(i) ? 'max-md:hidden' : undefined} />
                                            ))}
                                        </ul>
                                        {resto > 0 && (
                                            <div className="border-t border-border py-1">
                                                <EnlaceInventario onClick={() => onIrRuta(rutaLista(GRUPOS.find(x => x.key === g.key)?.lista ?? 'todas'))}>
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
                                <EnlaceInventario onClick={() => onIrRuta(m.tope?.ruta ?? rutaLista('todas'))}>Abrir Inventario</EnlaceInventario>
                            </p>
                        )}
                        {enTodas
                            ? <VerMas abierto={todas} onClick={sec.alternarTodas} controla={ids.lista} texto={`Ver las ${total}`} />
                            : total > TOPE_SEC_CEL && (
                                <VerMas abierto={todas} onClick={sec.alternarTodas} controla={ids.lista} texto={`Ver las ${total}`} className="md:hidden" />
                            )}
                    </>
                )}
            </div>
        </section>
    );
};

export default SecuenciaCompleta;
