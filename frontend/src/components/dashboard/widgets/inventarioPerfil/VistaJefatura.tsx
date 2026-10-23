import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp, RotateCcw } from 'lucide-react';
import { ObraContext } from '../../../../context/ObraContext';
import { useMediaQuery } from '../../../../hooks/useMediaQuery';
import { cn } from '../../../../utils/cn';
import { shareViaWhatsApp } from '../../../../utils/whatsappShare';
import { Button } from '../../../ui/Button';
import WhatsAppIcon from '../../../ui/WhatsAppIcon';
import { EnlaceFicha, PieFicha, Pildora } from '../FichaInicio';
import { CIFRA, PILDORA, ROTULO_FICHAS } from '../fichasInicio';
import type { TonoTarjeta } from '../tarjetaActiva';
import { iniciales, nombreCorto, numero, plural, rutaDiferencia, rutaLista, rutaSolicitud, tonoDias } from './formato';
import {
    FILTRO_ETAPA, NOMBRE_ETAPA, POR_DEFECTO_JEFATURA, TOPE_INICIO, alcanceJefatura, anchoFila, aQuienApurar, bajadaAprobada,
    bajadaAprobadas, bajadaDespachada, bajadaDespachadas, bajadaDiferencias, bajadaPedida, bajadaPedidas, bajadaRecibida,
    bajadaRecibidas, cifraDias, cifraDiferencia, cuantasPorApurar, diferenciasPendientes, disposicionDiferencia, etapasJefatura,
    etiquetaEtapa, fraseFila, fueraDeLista, haceCuanto, laApruebaSoloSuperAdmin, listasJefatura, mensajeApurar, mensajeDiferencia,
    notaObraElegida, notaSoloSuperAdmin, personasDiferencia, pildoraRecibida, pildorasParcial, pildorasTipo, queDiferencia,
    rellenaEtapa, rutaDe, solicitudesConDiferencia, textoApurar, textoEnInventario, textosTope, textoVerResumen, tituloAprobadas,
    tituloDespachadas, tituloDiferencias, tituloFila, tituloPedidas, tituloRecibidas, tonoCirculo,
    type BotonPreguntarTexto, type ClaveEtapa, type CifraFila, type DiferenciasPendientes, type EtapaCircuito, type ListasJefatura,
    type PersonaDiferencia, type PildoraFila,
} from './jefatura.modelo';
import type { PropsVistaInventario } from './perfil';
import type { DiferenciaPerfil, InventarioPerfilApi, SolicitudPerfil } from './tipos';

/**
 * Detalle «Inventario» del Inicio para JEFATURA (Daphne Lazcano: «Ver diferencias» sin aprobar; Marcos 2026-10-22):
 * opción B «El circuito» del lienzo (`Jefatura` de boveda-diseno/frontend/src/preview/inventario/opcionB.tsx).
 *
 * Arriba, el circuito de la solicitud de lo que ve (con `ver_todas`, todas las obras): Pedida → Aprobada → Despachada →
 * Recibida, y Diferencias aparte, cada etapa con su cifra (todas cuentan solicitudes, como la tarjeta del Inicio). Al
 * entrar vienen abiertas «Pedida» (lo que espera a Leonardo) y «Diferencias» (lo que ella aclara); tocar otra etapa
 * muestra solo su lista y tocarla de nuevo vuelve. Desde 768 px las cinco etapas van en tarjetas en línea (más compactas
 * si la columna es angosta; en una columna de menos de 600 px, en la tira) y, con espacio, los dos paneles lado a lado,
 * siempre con «Pedida» completa; en el celular (bajo 768 px) el circuito va en una tira de una línea, las diferencias en
 * un chip rojo y lo que espera a Leonardo resumido, para que sus diferencias suban. Cada lista muestra primero unas
 * pocas (`TOPE_INICIO`) con «Ver las N» / «Ocultar».
 *
 * Daphne NO aprueba ni resuelve: no hay botones de aprobar ni de resolver. Sus acciones son de WhatsApp (sin número: los
 * usuarios no tienen teléfono, ella elige el contacto): «Apurar a Leonardo» con la lista y «Preguntar» a quien despachó o
 * recibió, con el mensaje listo. Las solicitudes aprobadas, en camino y recibidas abren Inventario → Solicitudes con ella
 * a la vista y cada diferencia abre «Diferencias» (en solo lectura para ella); las pendientes no se tocan (como el
 * lienzo: ella no actúa sobre cada una). Solo se muestra lo que la app registra.
 * Lógica pura (orden, topes, textos, medidas y mensajes): `jefatura.modelo.ts`. La espera, el error y la línea bajo el
 * título los pone DetalleInventario.
 */

type Ir = (ruta: string) => void;

// ───────────────────────────── Medidas ─────────────────────────────
// Lo de celular se decide con la PANTALLA (bajo 768 px, la regla de Marcos); el resto, con el espacio real de la vista.

/** Celular: la tira, el chip y «Pedida» resumida. Desde 768 px, siempre la disposición del computador. */
const MOVIL = '(max-width: 767px)';
/** `sm` de Tailwind: el panel pasa de `p-4` a `p-5` (para calcular el ancho de las filas). */
const SM = '(min-width: 640px)';

/** Ancho de una caja (UN solo ResizeObserver, el de la vista: las filas se calculan desde él). */
const useAncho = (ref: React.RefObject<HTMLElement | null>) => {
    const [ancho, setAncho] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        setAncho(el.clientWidth);
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => setAncho(el.clientWidth));
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return ancho;
};

/** Desde este ancho las tarjetas del circuito van con el tamaño del lienzo; bajo él (computador angosto), compactas. */
const ANCHO_EN_LINEA = 860;
/**
 * Bajo este ancho ni las tarjetas compactas caben (computador de 768 a ~860 px con el menú lateral abierto: la columna
 * queda en ~470-560 px): el circuito va en la tira. Lo demás sigue como en el computador («Pedida» completa).
 */
const ANCHO_TIRA = 600;
/** Desde este ancho los dos paneles van lado a lado (o la lista en dos columnas). */
const ANCHO_DOS = 1000;
/** En el celular, desde este ancho las píldoras de cada fila van bajo la frase (si no, al pie de la fila). */
const ANCHO_FILA = 600;
/** En el celular, desde este ancho la acción del panel va arriba, junto al título (si no, al pie). */
const ANCHO_CABEZA = 640;

interface Medidas { ancho: number; movil: boolean }
const MedidasVista = createContext<Medidas>({ ancho: 0, movil: false });

interface Contexto {
    /** Es lo primero que ve (título más grande). */
    principal: boolean;
    /** La lista va en dos columnas (un solo panel en pantalla ancha). */
    dos: boolean;
    /** Celular: lo que espera a Leonardo se resume. */
    resumen: boolean;
    /** Ancho de una fila de la lista (de ahí salen las medidas de cada diferencia). */
    anchoFila: number;
}

// ───────────────────────────── Foco ─────────────────────────────
// Un anillo verde al 50 % no llega a 3:1 y uno verde sobre verde no se ve: contorno sólido de 2 px.

/** Sobre blanco o gris: contorno del token `ring` por dentro (no lo corta el borde de la tira ni el relleno vecino). */
const FOCO = 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-4';
/** Sobre el relleno verde o rojo: contorno blanco por dentro. */
const FOCO_RELLENO = 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-4';
/** Botones chicos y filas: contorno del token `ring` en el borde. */
const FOCO_BOTON = 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring';

// ───────────────────────────── El circuito ─────────────────────────────

/**
 * Relleno rojo de «Diferencias» abierta: como `.tarjeta-activa` (index.css, la tarjeta verde del Inicio) pero en rojo.
 * Redefine los tokens neutros adentro, así `bg-card`, el texto y la cola toman el rojo; en oscuro baja a red-800, igual
 * que la verde baja a green-900 (diseno.md §9.14).
 */
const RELLENO_ROJO = cn(
    'text-white [--card:var(--color-red-600)] [--foreground:white] [--muted-foreground:white]',
    '[--border:rgb(255_255_255/0.25)] [--muted:rgb(255_255_255/0.16)] dark:[--card:var(--color-red-800)]',
);
/** Relleno de la etapa abierta (si tiene algo): verde LOLS (la tarjeta elegida, green-700 / oscuro green-900) o rojo en Diferencias. */
const RELLENO = { verde: 'tarjeta-activa', rojo: RELLENO_ROJO } as const;
const rellenoDe = (e: EtapaCircuito) => (e.clave === 'diferencias' ? 'rojo' : 'verde');

const colorCifra = (e: EtapaCircuito, rellena: boolean) => {
    if (!rellena) return CIFRA[e.tono];
    // Sobre verde, lo que avisa en amarillo claro (solo cifras grandes en negrita, tarjetaActiva.ts).
    return rellenoDe(e) === 'verde' && (e.tono === 'ambar' || e.tono === 'rojo') ? 'text-yellow-300' : 'text-white';
};
const colorDato = (e: EtapaCircuito, rellena: boolean) =>
    (rellena ? 'text-white' : e.tonoDato === 'neutro' ? 'text-muted-foreground' : CIFRA[e.tonoDato]);

/** Texto de la marca sobre el relleno: fondo blanco FIJO (sin variante oscura), «los chips conservan su fondo claro» (§9.14). */
const SOBRE_RELLENO: Record<TonoTarjeta, string> = {
    rojo: 'text-red-700', ambar: 'text-amber-800', azul: 'text-blue-700', verde: 'text-green-700', neutro: 'text-zinc-700',
};
const MarcaEtapa: React.FC<{ marca: NonNullable<EtapaCircuito['marca']>; rellena: boolean }> = ({ marca, rellena }) => (rellena
    ? <span className={cn('rounded-full bg-white px-2 py-0.5 text-label font-semibold', SOBRE_RELLENO[marca.tono])}>{marca.texto}</span>
    : <Pildora tono={marca.tono}>{marca.texto}</Pildora>);

/** Círculo con el número del paso (o el aviso, en Diferencias: rojo si hay alguna, gris si no). */
const CirculoEtapa: React.FC<{ e: EtapaCircuito; rellena: boolean; className?: string }> = ({ e, rellena, className }) => (
    <span aria-hidden className={cn('relative z-10 flex shrink-0 items-center justify-center rounded-full text-section font-bold tabular-nums', className,
        rellena ? (rellenoDe(e) === 'rojo' ? 'bg-white text-red-700' : 'bg-white text-green-800')
            : e.numero == null ? PILDORA[e.tono === 'neutro' ? 'neutro' : 'rojo'] : 'bg-muted text-foreground')}>
        {e.numero ?? <AlertTriangle className="h-4 w-4" />}
    </span>
);

/** «Cola de gota» de la etapa abierta hacia su lista (la misma forma que ColaGota del Inicio): toma `--card` del relleno. */
const Cola: React.FC = () => (
    <svg aria-hidden viewBox="0 0 44 18"
        className="cola-gota pointer-events-none absolute top-full left-[calc(50%-22px)] -mt-px h-[18px] w-11">
        <path d="M0 0C12 0 18 3 20.5 13.5C21.1 16.2 22.9 16.2 23.5 13.5C26 3 32 0 44 0Z" style={{ fill: 'var(--card)' }} />
    </svg>
);

/**
 * Desde 768 px: cuatro tarjetas en línea con flechas y Diferencias aparte. `compacta` (columna angosta, bajo 860 px):
 * menos relleno y letra un paso más chica, para que las cinco quepan sin pasar a la tira del celular.
 */
const CircuitoEnLinea: React.FC<{
    etapas: EtapaCircuito[]; abiertas: ClaveEtapa[]; conCola: boolean; compacta: boolean; onElegir: (c: ClaveEtapa) => void;
}> = ({ etapas, abiertas, conCola, compacta, onElegir }) => (
    <div className="flex items-stretch">
        {etapas.map((e, i) => {
            const abierta = abiertas.includes(e.clave);
            const rellena = rellenaEtapa(e, abierta);
            const previa = etapas[i - 1];
            const unido = !!previa && previa.numero != null && e.numero != null && rellena && rellenaEtapa(previa, abiertas.includes(previa.clave));
            return (
                <React.Fragment key={e.clave}>
                    {previa && (e.numero == null ? (
                        <span aria-hidden className={cn('w-px shrink-0 border-l border-dashed border-border', compacta ? 'mx-2.5' : 'mx-4')} />
                    ) : (
                        <span aria-hidden className={cn('flex shrink-0 items-center justify-center', compacta ? 'w-5' : 'w-7')}>
                            <span className={cn('h-0.5', compacta ? 'w-2' : 'w-3', unido ? 'bg-green-700' : 'bg-muted-foreground/50')} />
                            <ChevronRight className={cn('-ml-1.5 h-4 w-4', unido ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')} />
                        </span>
                    ))}
                    {/* eslint-disable-next-line no-restricted-syntax -- etapa del circuito (tarjeta completa pinchable, como FlujoDocumentos) */}
                    <button type="button" aria-pressed={abierta} aria-label={etiquetaEtapa(e)} onClick={() => onElegir(e.clave)}
                        className={cn('relative flex min-w-0 flex-1 flex-col items-start rounded-[20px] bg-card text-left text-foreground', compacta ? 'p-3' : 'p-4',
                            rellena ? cn(RELLENO[rellenoDe(e)], 'shadow-[var(--shadow-md)]', FOCO_RELLENO)
                                // El hover se anima; el relleno no (de rojo a verde se veía café por 200 ms).
                                : cn('shadow-[var(--shadow-sm)] transition-colors duration-200 hover:bg-muted/40 motion-reduce:transition-none', FOCO,
                                    abierta && 'ring-2 ring-ring'))}>
                        {compacta ? (
                            // Angosta: el círculo con la marca arriba y el nombre debajo, para que «Despachada» quepa entera.
                            <>
                                <span className="flex w-full flex-wrap items-center justify-between gap-1.5">
                                    <CirculoEtapa e={e} rellena={rellena} className="h-6 w-6" />
                                    {e.marca && <MarcaEtapa marca={e.marca} rellena={rellena} />}
                                </span>
                                <span className="mt-1.5 text-sm font-semibold">{NOMBRE_ETAPA[e.clave]}</span>
                            </>
                        ) : (
                            <span className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                                <span className="flex min-w-0 items-center gap-2">
                                    <CirculoEtapa e={e} rellena={rellena} className="h-7 w-7" />
                                    <span className="text-base font-semibold">{NOMBRE_ETAPA[e.clave]}</span>
                                </span>
                                {e.marca && <MarcaEtapa marca={e.marca} rellena={rellena} />}
                            </span>
                        )}
                        <span className={cn('font-bold leading-none tracking-tight tabular-nums', compacta ? 'mt-2 text-title' : 'mt-3 text-headline',
                            colorCifra(e, rellena))}>{e.cifra}</span>
                        <span className={cn('mt-1.5 leading-snug text-muted-foreground', compacta ? 'text-xs' : 'text-sm')}>{e.que}</span>
                        <span className={cn('mt-auto pt-2 text-xs font-semibold', colorDato(e, rellena))}>{e.dato}</span>
                        {rellena && conCola && <Cola />}
                    </button>
                </React.Fragment>
            );
        })}
    </div>
);

/**
 * Celular (o una columna de menos de 600 px): el circuito en UNA línea —cifra grande y nombre de cada paso, unidos por
 * flechas—. Lo abierto va en verde con su cola hacia la lista (con 0, solo un anillo). Un paso que avisa y no está
 * abierto conserva su fondo de color.
 */
const TiraCircuito: React.FC<{ etapas: EtapaCircuito[]; abiertas: ClaveEtapa[]; onElegir: (c: ClaveEtapa) => void }> = ({
    etapas, abiertas, onElegir,
}) => {
    const pasos = etapas.filter(e => e.numero != null);
    const flecha = (k: string) => (
        <ChevronRight key={k} aria-hidden className="h-4 w-4 shrink-0 self-center text-muted-foreground" />
    );
    return (
        <div className="flex items-stretch rounded-3xl bg-card p-1.5 text-foreground shadow-[var(--shadow-md)]">
            {pasos.map((e, i) => {
                const abierta = abiertas.includes(e.clave);
                const rellena = rellenaEtapa(e, abierta);
                const realce = !abierta && e.marca ? e.marca.tono : null;
                const paso = (
                    // eslint-disable-next-line no-restricted-syntax -- paso del circuito (toda la casilla pinchable)
                    <button type="button" aria-pressed={abierta} aria-label={etiquetaEtapa(e)} onClick={() => onElegir(e.clave)}
                        className={cn('flex min-h-18 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-1 py-2.5 text-center',
                            rellena ? FOCO_RELLENO : FOCO,
                            abierta && !rellena && 'ring-2 ring-inset ring-ring',
                            !abierta && (realce ? PILDORA[realce] : 'hover:bg-muted/60'))}>
                        <span className={cn('text-title font-bold leading-none tracking-tight tabular-nums', colorCifra(e, rellena))}>{e.cifra}</span>
                        <span className={cn('mt-1.5 text-label font-semibold leading-tight', rellena ? 'text-white' : !realce && 'text-foreground')}>{NOMBRE_ETAPA[e.clave]}</span>
                    </button>
                );
                return (
                    <React.Fragment key={e.clave}>
                        {i > 0 && flecha(`f-${e.clave}`)}
                        {rellena ? (
                            // Base = el relleno de la casilla (8 px): así mide lo mismo que las casillas sueltas.
                            <div className="tarjeta-activa relative flex min-w-0 items-stretch rounded-2xl bg-card shadow-[var(--shadow-md)]" style={{ flex: '1 1 8px' }}>
                                {paso}
                                <Cola />
                            </div>
                        ) : paso}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

/** Con la tira: «Diferencias» va aparte del circuito, como chip rojo de 44 px en la línea del rótulo. */
const ChipDiferencias: React.FC<{ e: EtapaCircuito; abierta: boolean; onElegir: (c: ClaveEtapa) => void }> = ({ e, abierta, onElegir }) => {
    const rellena = rellenaEtapa(e, abierta);
    return (
        // eslint-disable-next-line no-restricted-syntax -- etapa «Diferencias» del circuito en el celular (chip pinchable)
        <button type="button" aria-pressed={abierta} aria-label={etiquetaEtapa(e)} onClick={() => onElegir(e.clave)}
            className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold',
                rellena ? cn(RELLENO.rojo, 'bg-card shadow-[var(--shadow-md)]', FOCO_RELLENO)
                    : cn(e.cifra ? PILDORA.rojo : PILDORA.neutro, FOCO_BOTON, abierta && 'ring-2 ring-ring'))}>
            <AlertTriangle aria-hidden className="h-4 w-4" />
            <span><b className="font-bold tabular-nums">{e.cifra}</b> {plural(e.cifra, 'diferencia', 'diferencias')}</span>
        </button>
    );
};

// ───────────────────────────── Paneles y filas ─────────────────────────────

const PUNTO: Record<TonoTarjeta, string> = {
    rojo: 'bg-red-600', ambar: 'bg-amber-500', azul: 'bg-blue-500', verde: 'bg-green-600', neutro: 'bg-zinc-400',
};

/**
 * Panel de una etapa. `accion` va junto al título (en el celular angosto, al pie); `pie`, siempre al pie. Sin cuerpo
 * (lista vacía), solo el título y la bajada: «Nada espera aprobación» ya lo dice todo.
 */
const Panel: React.FC<{
    rotulo: string; tono: TonoTarjeta; titulo: string; bajada: string; grande?: boolean;
    accion?: React.ReactNode; pie?: React.ReactNode; children?: React.ReactNode;
}> = ({ rotulo, tono, titulo, bajada, grande, accion, pie, children }) => {
    const { ancho, movil } = useContext(MedidasVista);
    const arriba = !movil || ancho >= ANCHO_CABEZA;
    const abajo = [!arriba && accion, pie].filter(Boolean) as React.ReactNode[];
    const cuerpo = children != null && children !== false;
    return (
        <section aria-label={titulo} className="min-w-0 rounded-3xl bg-card p-4 text-foreground shadow-[var(--shadow-md)] sm:p-5">
            <header className={cn('flex', cuerpo && 'border-b border-border pb-4', arriba ? 'flex-row justify-between gap-4' : 'flex-col gap-3')}>
                <div className="min-w-0 flex-1">
                    <p className={cn(ROTULO_FICHAS, 'flex items-center gap-1.5')}>
                        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', PUNTO[tono])} />{rotulo}
                    </p>
                    <h3 className={cn('mt-1.5 font-bold tracking-tight', grande ? 'text-title' : 'text-title-sm')}>{titulo}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{bajada}</p>
                </div>
                {accion && arriba && <div className="shrink-0">{accion}</div>}
            </header>
            {cuerpo && children}
            {abajo.length > 0 && (
                <div className={cn(!cuerpo && 'mt-3')}>
                    <PieFicha>
                        {abajo.length === 1 && <span />}
                        {abajo.map((a, i) => <React.Fragment key={i}>{a}</React.Fragment>)}
                    </PieFicha>
                </div>
            )}
        </section>
    );
};

/** Lista de filas separadas por una raya; en dos columnas si `dos` (pantalla ancha y un solo panel). */
const Lista: React.FC<{ dos?: boolean; children: React.ReactNode }> = ({ dos, children }) => {
    const filas = React.Children.toArray(children);
    const cols = dos ? 2 : 1;
    return (
        <ul className={cn('grid grid-cols-1', dos && 'grid-cols-2 gap-x-10')}>
            {filas.map((f, i) => (
                <li key={React.isValidElement(f) && f.key != null ? f.key : i} className={cn(i >= cols && 'border-t border-border')}>{f}</li>
            ))}
        </ul>
    );
};

const Vacio: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
);

/** «Ver las N» / «Ocultar» (como «Ver las 6» de Daphne y el `BotonDesplegar` del lienzo), 44 px de alto. */
const BotonDesplegar: React.FC<{ abierto: boolean; onClick: () => void; children: React.ReactNode }> = ({ abierto, onClick, children }) => (
    // eslint-disable-next-line no-restricted-syntax -- desplegar la lista (como «Ver los N» de Asistencia), 44 px de alto
    <button type="button" aria-expanded={abierto} onClick={onClick}
        className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-section font-semibold text-foreground hover:underline', FOCO_BOTON)}>
        {children}
        {abierto ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
    </button>
);

/**
 * Una lista del Inicio con tope: muestra las primeras `tope` y, si hay más, el pie del lienzo (`PieTope`): «Se ven 8 de
 * 12» con «Ver las 12» / «Ocultar». `total` = la cifra exacta (puede ser mayor que la lista: el resto está en Inventario).
 */
function ListaConTope<T>({ lista, total, tope, dos, items, children }: {
    lista: readonly T[]; total: number; tope: number; dos?: boolean; items?: boolean; children: (x: T) => React.ReactNode;
}) {
    const [todas, setTodas] = useState(false);
    const conTope = lista.length > tope;
    const vistas = conTope && !todas ? lista.slice(0, tope) : lista;
    const textos = textosTope({ vistas: vistas.length, enLista: lista.length, total, abierto: todas, items });
    return (
        <>
            <Lista dos={dos}>{vistas.map(children)}</Lista>
            {conTope && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-1.5">
                    <span className="text-xs text-muted-foreground">{textos.cuantas}</span>
                    <BotonDesplegar abierto={todas} onClick={() => setTodas(v => !v)}>{textos.boton}</BotonDesplegar>
                </div>
            )}
        </>
    );
}

/** El enlace del pie (EnlaceFicha). En el celular, 44 px de alto como el resto de la vista (EnlaceFicha trae 36). */
const Enlace: React.FC<React.ComponentProps<typeof EnlaceFicha>> = props => {
    const { movil } = useContext(MedidasVista);
    return <span className={cn('contents', movil && '[&>button]:min-h-11')}><EnlaceFicha {...props} /></span>;
};

/** «Ver las 240 en Inventario»: solo si el servidor cortó la lista (lo que falta está en Inventario). */
const pieInventario = (clave: ClaveEtapa, total: number, enLista: number, ir: Ir): React.ReactNode => (
    fueraDeLista(total, enLista) > 0
        ? <Enlace onClick={() => ir(rutaLista(FILTRO_ETAPA[clave]))}>{textoEnInventario(clave, total)}</Enlace>
        : undefined
);

/** Qué hace la fila al tocarla. */
type Accion = { texto: string; onClick: () => void };

/**
 * Una solicitud en la lista: quién pidió y para dónde, cuándo y cuántos días. Si tiene acción, TODA la fila se toca
 * (zona grande para un Android viejo) y «Ver ›» queda como pista bajo la cifra.
 */
const FilaSolicitud: React.FC<{
    circulo: React.ReactNode; tonoCirculo: TonoTarjeta; titulo: string; bajada: string; frase?: string;
    cifra?: CifraFila; pildoras?: PildoraFila[]; accion?: Accion;
}> = ({ circulo, tonoCirculo, titulo, bajada, frase, cifra, pildoras = [], accion }) => {
    const { ancho, movil } = useContext(MedidasVista);
    const ancha = !movil || ancho >= ANCHO_FILA;
    const pista = accion && (
        <span className="inline-flex min-h-9 shrink-0 items-center gap-1 px-1 text-section font-semibold text-foreground group-hover:underline">
            {accion.texto}
            <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
    );
    const chips = pildoras.length > 0 && (
        <span className="flex flex-wrap gap-1.5">{pildoras.map(p => <Pildora key={p.texto} tono={p.tono}>{p.texto}</Pildora>)}</span>
    );
    // Todo en <span> (bloques con `block`): la fila puede ser un <button>, que solo admite contenido en línea.
    const cuerpo = (
        <>
            <span aria-hidden className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-section font-bold', PILDORA[tonoCirculo])}>
                {circulo}
            </span>
            <span className="block min-w-0 flex-1">
                <span className="flex items-start gap-3">
                    <span className="block min-w-0 flex-1">
                        <span className="block break-words text-base font-semibold leading-snug">{titulo}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{bajada}</span>
                        {frase && <span className="mt-2 block text-section leading-snug text-foreground">{frase}</span>}
                        {ancha && chips && <span className="mt-2 block">{chips}</span>}
                    </span>
                    {(cifra || pista) && (
                        <span className="flex shrink-0 flex-col items-end text-right">
                            {cifra && (
                                <>
                                    <span className={cn('block text-title-sm font-bold leading-none tracking-tight tabular-nums', CIFRA[cifra.tono])}>{cifra.valor}</span>
                                    <span className="mt-1 block text-label text-muted-foreground">{cifra.etiqueta}</span>
                                </>
                            )}
                            {pista && <span className={cn('block', cifra && 'mt-1.5')}>{pista}</span>}
                        </span>
                    )}
                </span>
                {!ancha && chips && <span className="mt-2 block">{chips}</span>}
            </span>
        </>
    );
    if (!accion) return <div className="flex gap-3 py-4">{cuerpo}</div>;
    return (
        // eslint-disable-next-line no-restricted-syntax -- fila completa pinchable: zona de toque grande (abre la solicitud en Inventario)
        <button type="button" onClick={accion.onClick}
            aria-label={`${accion.texto}: ${titulo}. ${bajada}${cifra ? `. ${cifra.valor} ${cifra.etiqueta}` : ''}`}
            className={cn('group -mx-2 flex w-[calc(100%+16px)] gap-3 rounded-2xl px-2 py-4 text-left transition-colors duration-200 hover:bg-muted/40 motion-reduce:transition-none', FOCO_BOTON)}>
            {cuerpo}
        </button>
    );
};

/**
 * Una solicitud vista por quien mira todas las obras. `compacta`: solo quién, dónde y cuántos días (la lista de
 * «Pedida»), con `nota` en vez de la frase de lo pedido.
 */
const FilaTodas: React.FC<{
    s: SolicitudPerfil; bajada: string; cifra?: CifraFila; accion?: Accion; extra?: PildoraFila[]; compacta?: boolean; nota?: string;
}> = ({ s, bajada, cifra, accion, extra = [], compacta, nota }) => {
    const quien = s.solicitante?.nombre?.trim();
    return (
        <FilaSolicitud circulo={quien ? iniciales(quien) : '?'} tonoCirculo={tonoCirculo(s)} titulo={tituloFila(s)} bajada={bajada}
            frase={compacta ? nota : fraseFila(s)} cifra={cifra} pildoras={compacta ? extra : [...extra, ...pildorasTipo(s)]} accion={accion} />
    );
};

const ver = (s: SolicitudPerfil, ir: Ir): Accion => ({ texto: 'Ver', onClick: () => ir(rutaSolicitud(s)) });

/**
 * «Apurar a Leonardo»: la única acción con relleno de Daphne (44 px). green-700 y no el verde de marca: con letra
 * blanca de 14 px el verde de marca no pasa AA (lo mismo que `.tarjeta-activa`).
 */
const BotonApurar: React.FC<{ quien: string | null; mensaje: () => string }> = ({ quien, mensaje }) => (
    <Button variant="primary" size="sm" onClick={() => { void shareViaWhatsApp(mensaje(), 'Solicitudes por aprobar'); }}
        leftIcon={<WhatsAppIcon className="h-4 w-4" />}
        className="h-11 bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800">
        {textoApurar(quien)}
    </Button>
);

/**
 * «Preguntar» por WhatsApp a quien despachó (o aprobó) o recibió. Sin relleno (el relleno es para «Apurar a Leonardo»):
 * con espacio, enlace verde con el ícono; si no cabe, solo el ícono en un círculo de 44 × 44 con su nombre para el lector.
 */
const BotonPreguntar: React.FC<{ nombre: string; d: DiferenciaPerfil; texto: BotonPreguntarTexto }> = ({ nombre, d, texto }) => {
    const alTocar = () => { void shareViaWhatsApp(mensajeDiferencia(d, nombre), `Diferencia ${d.codigo}`); };
    const etiqueta = `Preguntar a ${nombre} por WhatsApp`;
    if (texto === 'icono') {
        return (
            // eslint-disable-next-line no-restricted-syntax -- solo el ícono de WhatsApp (44 × 44) para que el nombre y la fecha vayan en una línea
            <button type="button" onClick={alTocar} aria-label={etiqueta} title={etiqueta}
                className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-green-100 dark:hover:bg-green-500/25', FOCO_BOTON, PILDORA.verde)}>
                <WhatsAppIcon className="h-5 w-5" />
            </button>
        );
    }
    return (
        // eslint-disable-next-line no-restricted-syntax -- enlace con el ícono de WhatsApp, 44 px de alto
        <button type="button" onClick={alTocar} aria-label={etiqueta}
            className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-section font-semibold text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-500/25', FOCO_BOTON)}>
            <WhatsAppIcon className="h-4 w-4" />
            {texto === 'largo' ? `Preguntar a ${nombreCorto(nombre)}` : 'Preguntar'}
        </button>
    );
};

/** Una persona de la diferencia: quién despachó (o aprobó) o quién recibió (nombre y fecha, una línea cada uno) y su botón. */
const Persona: React.FC<{ p: PersonaDiferencia; d: DiferenciaPerfil; boton: BotonPreguntarTexto }> = ({ p, d, boton }) => (
    <li className="flex min-w-0 items-center gap-2.5 py-1.5">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-label font-bold text-foreground shadow-[var(--shadow-sm)]">
            {iniciales(p.nombre)}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold leading-snug">{p.nombre}</span>
            <span className="block text-xs text-muted-foreground">{p.texto}</span>
        </span>
        <BotonPreguntar nombre={p.nombre} d={d} texto={boton} />
    </li>
);

/**
 * Una diferencia: qué ítem, cuánto falta (o sobra) y las personas con nombre: quién despachó y quién recibió. `ancho` =
 * el de su fila, calculado desde la vista (`anchoFila`): angosta (celular), la frase y las personas usan todo el ancho,
 * sin la sangría del ícono; ancha, las dos personas van lado a lado. La cabeza (ítem, ruta y cifra) se toca y abre la
 * diferencia en Inventario (solo lectura).
 */
const FilaDiferencia: React.FC<{ d: DiferenciaPerfil; ir: Ir; ancho: number }> = ({ d, ir, ancho }) => {
    const cifra = cifraDiferencia(d);
    const personas = personasDiferencia(d);
    const { sangria, juntas, boton } = disposicionDiferencia(ancho, personas.length);
    const item = d.descripcion?.trim() || 'Ítem sin nombre';
    const ruta = rutaDe(d);
    return (
        <div className="py-4">
            {/* eslint-disable-next-line no-restricted-syntax -- cabeza de la diferencia pinchable: abre la diferencia en Inventario */}
            <button type="button" onClick={() => ir(rutaDiferencia(d.transferencia_id))}
                aria-label={`Ver la diferencia en Inventario: ${item}. ${ruta}. ${cifra.valor} ${cifra.etiqueta}`}
                className={cn('group -m-1 flex w-[calc(100%+8px)] items-start gap-3 rounded-xl p-1 text-left', FOCO_BOTON)}>
                <span aria-hidden className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', PILDORA[cifra.tono])}>
                    <AlertTriangle className="h-4 w-4" />
                </span>
                <span className="block min-w-0 flex-1">
                    <span className="block break-words text-base font-semibold leading-snug group-hover:underline">{item}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{ruta}</span>
                </span>
                <span className="block shrink-0 text-right">
                    <span className={cn('block text-title-sm font-bold leading-none tracking-tight tabular-nums', CIFRA[cifra.tono])}>{cifra.valor}</span>
                    <span className="mt-1 block text-label text-muted-foreground">{cifra.etiqueta}</span>
                </span>
            </button>
            <div className={cn(sangria && 'pl-13')}>
                <p className="mt-2 text-section leading-snug text-foreground">
                    Se enviaron <b className="font-semibold">{numero(d.enviada)}</b> y llegaron{' '}
                    <b className="font-semibold">{numero(d.recibida)}</b>: {queDiferencia(d)}.
                    {' '}<span className="text-muted-foreground">{haceCuanto(d.dias)}</span>
                </p>
                {personas.length > 0 && (
                    <div className="mt-3 rounded-2xl bg-muted/60 px-3 pb-1.5 pt-2.5">
                        <p className={ROTULO_FICHAS}>Quién lo hizo</p>
                        <ul aria-label="Quién lo hizo" className={cn('mt-0.5 grid grid-cols-1', juntas && 'grid-cols-2 gap-x-4')}>
                            {personas.map(p => <Persona key={p.paso} p={p} d={d} boton={boton} />)}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

// ───────────────────────────── Los paneles de Daphne ─────────────────────────────

interface DatosPanel {
    datos: InventarioPerfilApi;
    listas: ListasJefatura;
    quien: string | null;
    pendientes: DiferenciasPendientes | null;
    ir: Ir;
}

/**
 * Lo que espera a Leonardo. Daphne no actúa sobre cada una (las filas no se tocan, como el lienzo): las apura todas con
 * un mensaje. En el celular va resumido —la más antigua, «Apurar a Leonardo» y «Ver las 6»— para que sus diferencias, lo
 * que ella misma aclara, suban a la primera o segunda pantalla. Las que pidió el único que aprueba no van en el mensaje:
 * llevan la nota «solo la puede aprobar un Super Administrador».
 */
const PedidasJefatura: React.FC<DatosPanel & { ctx: Contexto }> = ({ datos, listas, quien, ir, ctx }) => {
    const [verLista, setVerLista] = useState(false);
    const lista = listas.pedidas;
    const total = Math.max(datos.circuito.pedida.total, lista.length);
    const { resumen } = ctx;
    const { aprobadores } = datos;
    const mensaje = () => mensajeApurar(lista, { total, aprobadores });
    const apurar = cuantasPorApurar(lista, { total, aprobadores }) > 0 ? <BotonApurar quien={quien} mensaje={mensaje} /> : undefined;
    const filas = (
        <ListaConTope lista={lista} total={total} tope={TOPE_INICIO.solicitudes} dos={ctx.dos}>
            {s => (
                <FilaTodas key={s.id} s={s} bajada={bajadaPedida(s)} compacta
                    nota={laApruebaSoloSuperAdmin(s, aprobadores) ? notaSoloSuperAdmin(s) : undefined}
                    cifra={cifraDias(s.dias, 'esperando', tonoDias(s.dias), 'pedida')} />
            )}
        </ListaConTope>
    );
    return (
        <Panel rotulo="Paso 1 · Pedida" tono={total ? 'ambar' : 'neutro'} grande={ctx.principal}
            titulo={tituloPedidas(total, quien)}
            bajada={bajadaPedidas(lista, { resumen, aprobadores })}
            accion={!resumen ? apurar : undefined}
            pie={pieInventario('pedida', total, lista.length, ir)}>
            {lista.length === 0 ? undefined : !resumen ? filas : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
                        {apurar}
                        <BotonDesplegar abierto={verLista} onClick={() => setVerLista(v => !v)}>
                            {verLista ? 'Ocultar' : textoVerResumen(total)}
                        </BotonDesplegar>
                    </div>
                    {verLista && <div className="mt-2 border-t border-border">{filas}</div>}
                </>
            )}
        </Panel>
    );
};

const PanelEtapa: React.FC<DatosPanel & { clave: ClaveEtapa; ctx: Contexto }> = props => {
    const { clave, ctx, datos, listas, ir, pendientes } = props;
    const { principal: grande, dos } = ctx;
    const { circuito } = datos;
    const tope = TOPE_INICIO.solicitudes;
    if (clave === 'pedida') return <PedidasJefatura datos={datos} listas={listas} quien={props.quien} pendientes={pendientes} ir={ir} ctx={ctx} />;
    if (clave === 'aprobada') {
        const lista = listas.aprobadas;
        const total = Math.max(circuito.aprobada.total, lista.length);
        return (
            <Panel rotulo="Paso 2 · Aprobada" tono="neutro" grande={grande} titulo={tituloAprobadas(total)} bajada={bajadaAprobadas(lista)}
                pie={pieInventario(clave, total, lista.length, ir)}>
                {lista.length > 0 && (
                    <ListaConTope lista={lista} total={total} tope={tope} dos={dos}>
                        {s => (
                            <FilaTodas key={s.id} s={s} bajada={bajadaAprobada(s)} accion={ver(s, ir)}
                                cifra={cifraDias(s.dias, 'en bodega', tonoDias(s.dias), 'aprobada')} />
                        )}
                    </ListaConTope>
                )}
            </Panel>
        );
    }
    if (clave === 'despachada') {
        const lista = listas.despachadas;
        const total = Math.max(circuito.despachada.total, lista.length);
        return (
            <Panel rotulo="Paso 3 · Despachada" tono={total ? 'azul' : 'neutro'} grande={grande} titulo={tituloDespachadas(total)} bajada={bajadaDespachadas(total)}
                pie={pieInventario(clave, total, lista.length, ir)}>
                {lista.length > 0 && (
                    <ListaConTope lista={lista} total={total} tope={tope} dos={dos}>
                        {s => (
                            <FilaTodas key={s.id} s={s} bajada={bajadaDespachada(s)} accion={ver(s, ir)} extra={pildorasParcial(s)}
                                cifra={cifraDias(s.dias, 'en camino', 'azul', 'salió')} />
                        )}
                    </ListaConTope>
                )}
            </Panel>
        );
    }
    if (clave === 'recibida') {
        const lista = listas.recibidas;
        const total = Math.max(circuito.recibida.total, lista.length);
        return (
            <Panel rotulo="Paso 4 · Recibida" tono={total ? 'verde' : 'neutro'} grande={grande} titulo={tituloRecibidas(total)} bajada={bajadaRecibidas(datos.hoy)}
                pie={pieInventario(clave, total, lista.length, ir)}>
                {lista.length > 0 && (
                    <ListaConTope lista={lista} total={total} tope={tope} dos={dos}>
                        {s => {
                            const llego = pildoraRecibida(s, pendientes);
                            return <FilaTodas key={s.id} s={s} bajada={bajadaRecibida(s)} accion={ver(s, ir)} extra={llego ? [llego] : []} />;
                        }}
                    </ListaConTope>
                )}
            </Panel>
        );
    }
    // Diferencias: la cifra es de SOLICITUDES (como la tarjeta y la pestaña); la lista, ítem por ítem.
    const lista = listas.diferencias;
    const total = Math.max(circuito.diferencias.total, solicitudesConDiferencia(lista));
    const items = Math.max(circuito.diferencias.items, lista?.length ?? 0);
    // Sin la lista (sin permiso) o con la lista cortada por el servidor, el resto está en la pestaña.
    const enInventario = lista == null ? 'Ver en Inventario' : items > lista.length ? textoEnInventario(clave, total) : null;
    return (
        <Panel rotulo="Aparte · Diferencias" tono={total ? 'rojo' : 'neutro'} grande={grande} titulo={tituloDiferencias(total)}
            bajada={bajadaDiferencias(total, items)}
            pie={enInventario && <Enlace onClick={() => ir(rutaLista(FILTRO_ETAPA[clave]))}>{enInventario}</Enlace>}>
            {lista == null ? <Vacio>Las diferencias se revisan en Inventario → Diferencias.</Vacio>
                : lista.length > 0 && (
                    <ListaConTope lista={lista} total={items} tope={TOPE_INICIO.diferencias} dos={dos} items={items !== total}>
                        {d => <FilaDiferencia key={d.id} d={d} ir={ir} ancho={ctx.anchoFila} />}
                    </ListaConTope>
                )}
        </Panel>
    );
};

// ───────────────────────────── La vista ─────────────────────────────

/** Circuito arriba y, debajo, la lista de lo abierto. Tocar otra etapa la abre; tocarla de nuevo vuelve a lo de entrada. */
const VistaJefatura: React.FC<PropsVistaInventario> = ({ datos }) => {
    const navigate = useNavigate();
    const ir: Ir = ruta => navigate(ruta);
    const [sel, setSel] = useState<ClaveEtapa | null>(null);
    const cajaRef = useRef<HTMLDivElement>(null);
    const listaRef = useRef<HTMLDivElement>(null);
    const ancho = useAncho(cajaRef);
    const movil = useMediaQuery(MOVIL);
    const sm = useMediaQuery(SM);
    // El selector de obra de arriba (fuera de su proveedor —pruebas— no hay ninguna).
    const obraElegida = useContext(ObraContext)?.selectedObra ?? null;
    // Antes de medir (ancho 0) se supone que cabe: así el primer dibujo del computador no parte en la tira.
    const enLinea = !movil && (ancho === 0 || ancho >= ANCHO_TIRA);
    const grande = ancho >= ANCHO_DOS;
    const medidas = useMemo(() => ({ ancho, movil }), [ancho, movil]);

    const etapas = etapasJefatura(datos.circuito);
    const listas = listasJefatura(datos);
    const pendientes = diferenciasPendientes(datos);
    const quien = aQuienApurar(datos.aprobadores);
    const grupos = sel ? [[sel]] : POR_DEFECTO_JEFATURA;
    const abiertas = grupos.flat();
    const lado = grande && grupos.length > 1;
    const dos = grande && grupos.length === 1;
    const dif = etapas.find(e => e.numero == null);
    const alcance = alcanceJefatura(datos.alcance);
    const nota = obraElegida ? notaObraElegida(alcance) : null;
    const ctx = (principal: boolean): Contexto => ({
        principal, dos, resumen: movil, anchoFila: anchoFila(ancho, { lado, dos, relleno: sm ? 40 : 32 }),
    });

    const elegir = (c: ClaveEtapa) => {
        setSel(s => (s === c ? null : c));
        // En la tira (celular) la lista queda debajo: si quedó fuera de la vista, se trae.
        if (enLinea) return;
        requestAnimationFrame(() => {
            const el = listaRef.current;
            if (!el) return;
            if (el.getBoundingClientRect().top > window.innerHeight - 160) {
                const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
            }
        });
    };
    const volver = (texto: string) => (
        <Enlace apagado onClick={() => setSel(null)} icono={<RotateCcw className="h-4 w-4" aria-hidden />}>{texto}</Enlace>
    );

    return (
        <MedidasVista.Provider value={medidas}>
            <div ref={cajaRef} data-vista="jefatura" className="space-y-5">
                <section aria-label={`Circuito de la solicitud · ${alcance}`} className={enLinea ? 'space-y-3' : 'space-y-2'}>
                    {enLinea ? (
                        <>
                            <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                <h3 className={ROTULO_FICHAS}>El circuito de la solicitud · {alcance}</h3>
                                {!sel ? <span className="text-xs text-muted-foreground">Toca una etapa para ver sus solicitudes</span>
                                    : volver('Volver a pendientes y diferencias')}
                            </div>
                            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
                            {/* Con dos paneles apilados la cola de la segunda etapa apuntaría al primero: solo lado a lado. */}
                            <CircuitoEnLinea etapas={etapas} abiertas={abiertas} onElegir={elegir} conCola={grupos.length === 1 || grande}
                                compacta={ancho < ANCHO_EN_LINEA} />
                        </>
                    ) : (
                        <>
                            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                {!sel ? <h3 className={ROTULO_FICHAS}>Circuito · {alcance}</h3> : volver('Volver a pendientes')}
                                {dif && <ChipDiferencias e={dif} abierta={abiertas.includes(dif.clave)} onElegir={elegir} />}
                            </div>
                            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
                            <TiraCircuito etapas={etapas} abiertas={abiertas} onElegir={elegir} />
                        </>
                    )}
                </section>
                <p className="sr-only" aria-live="polite">{`Abierto: ${abiertas.map(c => NOMBRE_ETAPA[c]).join(' y ')}`}</p>
                <div ref={listaRef} className={cn('grid scroll-mt-20 grid-cols-1 items-start gap-6', lado && 'grid-cols-2')}>
                    {grupos.map(g => (
                        <PanelEtapa key={g.join('-')} clave={g[0]} datos={datos} listas={listas} quien={quien} pendientes={pendientes} ir={ir}
                            ctx={ctx(!sel)} />
                    ))}
                </div>
            </div>
        </MedidasVista.Provider>
    );
};

export default VistaJefatura;
