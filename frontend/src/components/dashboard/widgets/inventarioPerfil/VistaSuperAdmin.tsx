import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowDown, Ban, Check, HardHat, PackageCheck, PackagePlus, PackageX, Plus, Search, UserCheck,
} from 'lucide-react';
import { useObra } from '../../../../context/ObraContext';
import { cn } from '../../../../utils/cn';
import { CIFRA, PILDORA } from '../fichasInicio';
import type { TonoTarjeta } from '../tarjetaActiva';
import { TARJETA, rutaLista } from './formato';
import type { PropsVistaInventario } from './perfil';
import SecuenciaCompleta, { EnlaceInventario, Rotulo, Vacio, VerMas } from './SecuenciaCompleta';
import {
    TOPE_ULTIMO, TOPE_ULTIMO_CERRADO, etiquetaPaso, etiquetaResponsable, modeloSuperAdmin, notaObraElegida, porDia, textoHasta,
    textoVerUltimo, type Destino, type Evento, type IconoEvento, type PasoCircuitoSA, type Responsable,
} from './superadmin.modelo';
import { useSecuencia } from './useSecuencia';

/**
 * Detalle «Inventario» del Inicio del SUPER ADMINISTRADOR (Marcos y Mauricio, rol 1): diseño «Super Administrador» de
 * la opción A del lienzo (VistaSuperAdmin de boveda-diseno/frontend/src/preview/inventario/opcionA.tsx), con los datos
 * de GET /transferencias/inicio/perfil (contrato en tipos.ts). La espera, el error, la descripción bajo el título y el
 * selector «Ver como» los pone DetalleInventario. Lógica (pasos, grupos, eventos, conteos, a quién le toca) en
 * `superadmin.modelo.ts`, con test.
 *
 * A ellos no les toca nada: arriba, en UNA tarjeta, el circuito de todas las obras (Pedida → Aprobada → Recibida: sin
 * «Despachada», don Luis 2026-10-23, bodegueros y conductores fuera del ciclo de solicitud) y lo pendiente de cada uno
 * (tres cajas chicas: quien aprueba, Obras y Jefatura); al lado, lo último que pasó (mismo alto: al abrirlo se desliza
 * por dentro); abajo, a todo el ancho, la secuencia de CADA solicitud agrupada por paso, con nombres y fechas, el paso de
 * ahora marcado y a quién le toca. Solo lo que la app guarda (pidió, aprobó o no, recibió y la diferencia anotada al
 * recibir): los WhatsApp de jefatura no quedan registrados.
 * Celular: circuito, secuencia y lo último, en ese orden. Los toques del circuito y de «Quién tiene qué» bajan a la
 * secuencia; «Ver» abre la solicitud (o su diferencia) en Inventario.
 * La secuencia vive en SecuenciaCompleta.tsx (desde 2026-10-23 también va en VistaJefatura): aquí se ve igual que antes,
 * con los mismos ids («inv-sa-sec», «inv-sa-g-…»).
 */

/** Anillo de foco del sistema (`ring-ring`, verde sólido: se ve sobre la tarjeta blanca), como VistaLeonardo y VistaObra. */
const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
/** En un botón con fondo de color (el aviso rojo), el anillo va separado del fondo por un borde. */
const FOCO_GRANDE = cn(FOCO, 'focus-visible:ring-offset-2 focus-visible:ring-offset-background');

// ─────────────── Franja del circuito ───────────────

const ANILLO: Record<TonoTarjeta, string> = {
    rojo: 'ring-red-500', ambar: 'ring-amber-500', azul: 'ring-blue-500', verde: 'ring-green-600', neutro: 'ring-border',
};

/**
 * El circuito en UNA línea (≈ 80 px): tres círculos unidos con su conteo; las etapas en curso con alguna, más
 * grandes, en su color y con anillo. Desde 640 px, bajo cada una, «hasta N días». Compacto: bajo 640 px los nombres
 * en `text-label` y la bajada corta, para que no se peguen a 360 px. Cada etapa baja a su pestaña de la secuencia.
 */
const Circuito: React.FC<{ pasos: PasoCircuitoSA[]; etiqueta: string; onIr: (d: Destino) => void; className?: string }> = ({
    pasos, etiqueta, onIr, className,
}) => (
    <ol aria-label={etiqueta} className={cn('grid w-full max-w-2xl grid-cols-3', className)}>
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
            PILDORA.rojo, FOCO_GRANDE, className)}>
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
            <button type="button" onClick={() => onIr(r.ir)} aria-label={etiquetaResponsable(r)}
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

// ─────────────── Lo último que pasó ───────────────

const ICONO_EVENTO: Record<IconoEvento, React.ReactNode> = {
    pidio: <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />,
    aprobo: <Check className="h-3.5 w-3.5" strokeWidth={2.5} />,
    rechazo: <Ban className="h-3.5 w-3.5" />,
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
                            <VerMas abierto={abierto} controla="inv-sa-u-lista" texto={textoVerUltimo(n)} onClick={() => setAbierto(v => !v)} />
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
    const { selectedObra } = useObra();
    const m = useMemo(() => modeloSuperAdmin(datos), [datos]);
    // La pestaña de la secuencia: el circuito y «Quién tiene qué» bajan a ella (`ir`).
    const sec = useSecuencia('inv-sa');
    const { ir } = sec;
    const lugar = m.todas ? 'todas las obras' : 'lo que puedes ver';
    // Con una obra elegida arriba, este detalle sigue con todas: lo dice (como VistaJefatura).
    const notaObra = notaObraElegida(selectedObra?.nombre, lugar);

    return (
        // Computador: a la izquierda el circuito con lo pendiente de cada uno; a la derecha, lo último que pasó (del mismo
        // alto); abajo, a todo el ancho, la secuencia de cada solicitud. Celular: circuito, secuencia y lo último.
        <div data-vista="superadmin" className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
            <section className={cn(TARJETA, 'min-w-0 xl:col-start-1 xl:row-start-1')} aria-labelledby="inv-sa-c">
                <Rotulo id="inv-sa-c" titulo={`Todo el circuito · ${lugar}`} nota="Toca una etapa para ver sus solicitudes" />
                {notaObra && <p className="mt-1 text-xs text-muted-foreground">{notaObra}</p>}
                <Circuito className="mt-4" etiqueta={`Circuito de la solicitud, ${lugar}`} pasos={m.circuito} onIr={ir} />
                {m.diferencias && (
                    <DiferenciasAparte className="mt-3" titulo={m.diferencias.titulo} bajada={m.diferencias.bajada}
                        onClick={() => ir({ filtro: 'recibidas' })} />
                )}

                <div className="mt-5 space-y-3 border-t border-border pt-4">
                    <Rotulo id="inv-sa-q" nivel="h4" titulo="Quién tiene qué · lo pendiente de cada uno" nota="Toca para ver sus solicitudes" />
                    {/* Sin igualar altos: cada caja termina donde termina lo suyo. */}
                    <ul className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-3 md:gap-3">
                        {m.responsables.map(r => <PersonaPendiente key={r.key} r={r} onIr={ir} />)}
                    </ul>
                </div>
            </section>

            <SecuenciaCompleta className="xl:col-span-2 xl:row-start-2" m={m} sec={sec} onIrRuta={irRuta} />

            {/* Último en el celular; en el computador, a la derecha del circuito y del mismo alto. */}
            <LoUltimo className="xl:col-start-2 xl:row-start-1" eventos={m.eventos} hoy={datos.hoy} onIr={irRuta} />
        </div>
    );
};

export default VistaSuperAdmin;
