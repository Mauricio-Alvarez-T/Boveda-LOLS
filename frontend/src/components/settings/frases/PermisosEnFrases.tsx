import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Lock, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { ICONO_MENU } from '../../soporte/iconosMenu';
import { ETIQUETA_NADA, GRUPOS, PANTALLAS, nivelDe, type Grupo, type ItemPantalla, type Pantalla } from '../../../config/permisosPantallas';
import {
    conY, dependientes, diferencia, difiere, enLista, etiquetaFrase, frasePantalla, minuscula, moduloSinEntrada, puertasDistintas,
    type Frase, type ParteFrase,
} from '../../../config/frasesPermisos';
import { cn } from '../../../utils/cn';

/**
 * Permisos «en frases» (opción E, Marcos 2026-10-28): la MISMA vista para un rol (Configuración › Roles) y para una
 * persona (Usuarios › permisos). Una tarjeta por módulo, con la barra verde y el ícono del menú; cada pantalla se lee
 * como una frase y «Cambiar» abre atajos de nivel (Nada · Mira · Trabaja · Todo) y un interruptor por acción. En una
 * persona (`rol` presente) lo que tiene de más va en azul y lo que le quitaron en ámbar, dentro de la misma frase
 * (los colores de «propio» y «quitado» de Soporte). La lógica de frases está en `config/frasesPermisos.ts`.
 */
interface Props {
    /** Lo que tiene ahora (el rol o la persona), con lo no guardado. */
    perms: ReadonlySet<string>;
    /** Solo en una persona: lo que trae su rol (para marcar lo propio y lo quitado). */
    rol?: ReadonlySet<string>;
    /** ¿Esa pantalla tiene algo sin guardar? */
    sinGuardarEn: (p: Pantalla) => boolean;
    soloLectura: boolean;
    /** Solo las pantallas distintas a su rol (persona). */
    soloDistinto?: boolean;
    onNivel: (p: Pantalla, nivel: number) => void;
    onAlternar: (p: Pantalla, clave: string) => void;
    /** Persona: esa pantalla vuelve a lo de su rol. */
    onComoSuRol?: (p: Pantalla) => void;
    /** Persona: ¿«Como su rol» cambiaría algo en esa pantalla? (si no, no se muestra). */
    puedeVolver?: (p: Pantalla) => boolean;
    /** Persona: dar o quitar la entrada a un módulo que no es fila de ninguna pantalla (`inventario.ver`). */
    onAlternarPuerta?: (clave: string) => void;
    /** Persona: ¿esa entrada cambió y no se guardó? (el aviso no desaparece y queda marcado). */
    puertaSinGuardar?: (clave: string) => boolean;
}

const MARCA_CLASE: Record<NonNullable<ParteFrase['marca']>, string> = {
    propio: 'rounded bg-blue-100 px-1 font-semibold text-blue-800 dark:bg-blue-500/20 dark:text-blue-200',
    quitado: 'rounded bg-amber-100 px-1 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
};

const Parte: React.FC<{ x: ParteFrase }> = ({ x }) => (
    <>
        <span className={x.marca ? MARCA_CLASE[x.marca] : undefined}>
            {minuscula(etiquetaFrase(x.it))}
            {x.marca && <span className="sr-only"> ({x.marca === 'propio' ? 'propio, su rol no lo trae' : 'quitado, su rol sí lo trae'})</span>}
        </span>
        {x.it.marca === 'dinero' && <span className="ml-0.5 font-bold text-amber-600 dark:text-amber-400" aria-label="montos">$</span>}
    </>
);

/**
 * «a, b y c» (lo que puede; «e» antes de sonido /i/) o «a, b ni c» (lo que no puede), con cada parte marcada. Si se
 * cortó la lista, `extra` va al final entre paréntesis: «a, b, c (y 2 más)».
 */
const Lista: React.FC<{ partes: ParteFrase[]; union: 'y' | 'ni'; extra?: number }> = ({ partes, union, extra = 0 }) => (
    <>
        {partes.map((x, i) => {
            const ultima = i === partes.length - 1 && extra === 0;
            const nexo = union === 'y' ? conY(minuscula(etiquetaFrase(x.it))) : 'ni';
            return (
                <React.Fragment key={x.it.clave}>
                    {i > 0 && (ultima ? ` ${nexo} ` : ', ')}
                    <Parte x={x} />
                </React.Fragment>
            );
        })}
        {extra > 0 && <> (y {extra} más)</>}
    </>
);

/** La frase de una pantalla. `maxNo` corta lo que no puede (la lista de abajo lo muestra entero). */
export const TextoFrase: React.FC<{ f: Frase; maxNo?: number; className?: string }> = ({ f, maxNo = 3, className }) => {
    const no = f.noPuede.slice(0, maxNo);
    const quitados = f.noPuede.filter(x => x.marca === 'quitado');
    return (
        <p className={cn('text-sm leading-relaxed text-foreground', className)}>
            {f.puede.length === 0 ? (
                // Si se la quitaron entera, que se note: no es lo mismo que una pantalla que su rol nunca tuvo.
                quitados.length > 0
                    ? <span className="text-muted-foreground">No la ve: le quitaron <Lista partes={quitados} union="y" />.</span>
                    : <span className="text-muted-foreground">No la ve.</span>
            ) : <>Puede <Lista partes={f.puede} union="y" />.</>}
            {f.puede.length > 0 && no.length > 0 && (
                <span className="text-muted-foreground"> No puede <Lista partes={no} union="ni" extra={f.noPuede.length - no.length} />.</span>
            )}
        </p>
    );
};

/** El óvalo del interruptor (solo dibujo: la fila entera es el botón). Verde = la tiene; rojo si es delicada. */
const Ovalo: React.FC<{ on: boolean; delicado?: boolean }> = ({ on, delicado }) => (
    <span
        aria-hidden="true"
        className={cn(
            'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
            // Apagado con 3:1 contra el fondo (WCAG 1.4.11): /70, no /35.
            on ? (delicado ? 'bg-destructive' : 'bg-brand-primary') : 'bg-muted-foreground/70',
        )}
    >
        <span className={cn('absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-all duration-200', on ? 'left-6' : 'left-1')}>
            {on && <Check className={cn('h-3 w-3', delicado ? 'text-destructive' : 'text-brand-primary')} strokeWidth={3} />}
        </span>
    </span>
);

/** Una acción: TODA la fila (44 px) es el interruptor, como `ListaClaves` de la matriz. */
const FilaAccion: React.FC<{ it: ItemPantalla; on: boolean; deRol?: boolean; disabled: boolean; onCambiar: () => void }> = ({ it, on, deRol, disabled, onCambiar }) => (
    <li>
        {/* eslint-disable-next-line no-restricted-syntax -- fila-interruptor a lo ancho (no hay primitivo Switch) */}
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={disabled}
            onClick={onCambiar}
            className="flex min-h-11 w-full items-center gap-3 rounded-control px-1 py-1 text-left transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
        >
            <span className="min-w-0 flex-1 text-sm text-foreground">
                {it.etiqueta}
                {it.marca === 'dinero' && <span className="ml-1 font-bold text-amber-600 dark:text-amber-400" aria-label="montos">$</span>}
            </span>
            {deRol !== undefined && on && !deRol && <Chip tone="info" label="Propio" />}
            {deRol !== undefined && !on && deRol && <Chip tone="warning" label="Quitado" />}
            <Ovalo on={on} delicado={it.marca === 'delicado'} />
        </button>
    </li>
);

/** Los niveles de la pantalla como atajos (botones con `aria-pressed`); el de ahora en verde, ninguno si es «a medida». */
const Atajos: React.FC<{ p: Pantalla; nivel: number; disabled: boolean; onNivel: (n: number) => void }> = ({ p, nivel, disabled, onNivel }) => {
    const opciones = [{ n: 0, etiqueta: ETIQUETA_NADA, agrega: 'No la ve' }, ...p.niveles.map((x, i) => ({ n: i + 1, etiqueta: x.etiqueta, agrega: x.agrega }))];
    return (
        <div role="group" aria-label={`Nivel en ${p.nombre}`} className="flex flex-wrap items-center gap-2">
            <span className="mr-1 hidden text-xs font-semibold text-muted-foreground sm:inline">Rápido:</span>
            {opciones.map(o => (
                // eslint-disable-next-line no-restricted-syntax -- atajo de nivel: el elegido va en verde (elemento seleccionado)
                <button
                    key={o.n}
                    type="button"
                    aria-pressed={nivel === o.n}
                    title={o.agrega}
                    disabled={disabled}
                    onClick={() => onNivel(o.n)}
                    className={cn(
                        'min-h-11 rounded-full border px-3.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9',
                        nivel === o.n ? 'border-brand-primary bg-brand-primary text-white' : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                >
                    {o.etiqueta}
                </button>
            ))}
            {nivel === -1 && <span className="text-xs text-muted-foreground">Ahora: a medida</span>}
        </div>
    );
};

const BLOQUES: { titulo: React.ReactNode; filtro: (it: ItemPantalla) => boolean }[] = [
    { titulo: null, filtro: it => !it.marca },
    { titulo: <span className="text-amber-700 dark:text-amber-400">$ Montos · solo a mano</span>, filtro: it => it.marca === 'dinero' },
    {
        titulo: <span className="inline-flex items-center gap-1 text-destructive"><Lock className="h-3 w-3" aria-hidden="true" /> Delicados · solo para quien corresponde</span>,
        filtro: it => it.marca === 'delicado',
    },
];

/** Lo que también se apaga con «Nada» en la fila puerta (las pantallas libres del módulo no dependen de ella). */
const loQueApaga = (p: Pantalla) => {
    const g = GRUPOS.find(x => x.id === p.grupo);
    return g ? dependientes(g).map(x => x.nombre) : [];
};

const FilaPantalla: React.FC<{
    p: Pantalla; props: Props; abierta: boolean; onAbrir: () => void;
}> = ({ p, props, abierta, onAbrir }) => {
    const { perms, rol, soloLectura } = props;
    const listoRef = useRef<HTMLButtonElement>(null);
    const f = frasePantalla(p, perms, rol);
    const distinta = rol ? difiere(diferencia(rol, perms, p)) : false;
    const sinGuardar = props.sinGuardarEn(p);
    const volver = distinta && !soloLectura && props.onComoSuRol && (props.puedeVolver?.(p) ?? true);
    return (
        <li className={cn('px-4 py-3.5 sm:px-5', sinGuardar && 'shadow-[inset_3px_0_0_var(--color-warning)]')}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-ui font-semibold text-brand-dark">
                        {p.nombre}
                        {p.dinero && <span className="ml-1 font-bold text-amber-600 dark:text-amber-400" aria-label="montos">$</span>}
                        {sinGuardar && <span className="sr-only"> (sin guardar)</span>}
                    </p>
                    <TextoFrase f={f} className="mt-0.5" maxNo={abierta ? 0 : 3} />
                </div>
                <Button
                    ref={listoRef}
                    variant={abierta ? 'secondary' : 'ghost'}
                    size="sm"
                    className="min-h-11 shrink-0"
                    leftIcon={soloLectura ? undefined : <Pencil className="h-3.5 w-3.5" />}
                    aria-expanded={abierta}
                    onClick={onAbrir}
                >
                    {abierta ? 'Listo' : soloLectura ? 'Ver detalle' : 'Cambiar'}
                </Button>
            </div>
            {abierta && (
                <div className="mt-3 rounded-control border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Atajos p={p} nivel={nivelDe(perms, p).nivel} disabled={soloLectura} onNivel={n => props.onNivel(p, n)} />
                        {volver && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-11 sm:min-h-9"
                                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                                onClick={() => {
                                    props.onComoSuRol?.(p);
                                    // El botón desaparece al quedar igual al rol: el foco no se va al inicio de la página.
                                    requestAnimationFrame(() => listoRef.current?.focus());
                                }}
                            >
                                Como su rol
                            </Button>
                        )}
                    </div>
                    {p.puerta && !soloLectura && loQueApaga(p).length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">«{ETIQUETA_NADA}» acá apaga también {enLista(loQueApaga(p))}: sin esta pantalla no {loQueApaga(p).length === 1 ? 'se ve' : 'se ven'}.</p>
                    )}
                    {BLOQUES.map((b, i) => {
                        const items = p.items.filter(b.filtro);
                        if (!items.length) return null;
                        return (
                            <div key={i} className="mt-2">
                                {b.titulo && <p className="pt-1 text-xs font-semibold">{b.titulo}</p>}
                                <ul className="divide-y divide-border">
                                    {items.map(it => (
                                        <FilaAccion
                                            key={it.clave}
                                            it={it}
                                            on={perms.has(it.clave)}
                                            deRol={rol ? rol.has(it.clave) : undefined}
                                            disabled={soloLectura}
                                            onCambiar={() => props.onAlternar(p, it.clave)}
                                        />
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}
        </li>
    );
};

/**
 * La entrada al módulo cuando no calza con sus pantallas: en una persona, la que es distinta a su rol (hoy solo
 * `inventario.ver`, que no es fila de ninguna pantalla), con su botón; y en rol o persona, si tiene pantallas pero no
 * la entrada, que no se ve nada del módulo aunque las frases digan «Puede…». Con un cambio sin guardar en la entrada
 * el aviso sigue (con borde ámbar y «Deshacer»): no desaparece bajo el dedo ni se lleva el foco.
 */
const AvisoEntrada: React.FC<{ g: Grupo; props: Props }> = ({ g, props }) => {
    const { perms, rol, soloLectura, onAlternarPuerta } = props;
    const distinta = rol ? puertasDistintas(rol, perms).find(x => x.grupo.id === g.id) : undefined;
    const sinEntrada = moduloSinEntrada(perms, g);
    const sinGuardar = !!g.puerta && !!props.puertaSinGuardar?.(g.puerta);
    if (!distinta && !sinEntrada && !sinGuardar) return null;
    const conBoton = !!(onAlternarPuerta && !soloLectura && g.puerta && (distinta || sinGuardar));
    return (
        <li className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 bg-background px-4 py-3 sm:px-5', sinGuardar && 'shadow-[inset_3px_0_0_var(--color-warning)]')}>
            <AlertTriangle className={cn('h-4 w-4 shrink-0', distinta?.tipo === 'propio' ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400')} aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-foreground">
                {distinta?.tipo === 'propio' && <>Tiene la entrada a {g.nombre} aunque su rol no la trae. </>}
                {distinta?.tipo === 'quitado' && <>Le quitaron la entrada a {g.nombre} (su rol sí la trae). </>}
                {!distinta && sinGuardar && <>La entrada a {g.nombre} queda como la trae su rol (sin guardar). </>}
                {sinEntrada && <>Sin la entrada no ve nada de {g.nombre}, aunque abajo diga lo que puede.</>}
            </p>
            {distinta && <Chip tone={distinta.tipo === 'propio' ? 'info' : 'warning'} label={distinta.tipo === 'propio' ? 'Propio' : 'Quitado'} />}
            {/* Mismo lugar para el botón en todos los estados: al tocarlo no se desmonta y el foco se queda en él. */}
            {conBoton && (
                <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" leftIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => onAlternarPuerta?.(g.puerta as string)}>
                    {distinta ? (distinta.tipo === 'quitado' ? 'Devolver la entrada' : 'Quitar la entrada') : 'Deshacer'}
                </Button>
            )}
        </li>
    );
};

/** La línea de arriba: cómo se lee la vista. */
export const LeyendaFrases: React.FC<{ conMarcas: boolean; soloLectura?: boolean }> = ({ conMarcas, soloLectura }) => (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{soloLectura ? 'Se lee como una frase. Toca «Ver detalle» para ver cada acción.' : 'Se lee como una frase. Toca «Cambiar» para elegir.'}</span>
        {conMarcas && (
            <>
                <span><span className={MARCA_CLASE.propio}>azul</span> = tiene más que su rol</span>
                <span><span className={MARCA_CLASE.quitado}>ámbar</span> = le quitaron algo de su rol</span>
            </>
        )}
        <span><b className="text-amber-600 dark:text-amber-400">$</b> = ve montos</span>
    </p>
);

/** ¿Pantalla ancha (xl)? Con dos columnas fijas las tarjetas no saltan de columna al abrir «Cambiar». */
function useDosColumnas(): boolean {
    const consulta = '(min-width: 1280px)';
    const [si, setSi] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
    useEffect(() => {
        const mq = window.matchMedia(consulta);
        const cambio = () => setSi(mq.matches);
        mq.addEventListener('change', cambio);
        return () => mq.removeEventListener('change', cambio);
    }, []);
    return si;
}

/** Dónde cortar la lista en dos columnas seguidas (en orden) para que queden lo más parejas posible. */
function corte(pesos: number[]): number {
    const total = pesos.reduce((a, b) => a + b, 0);
    let mejor = 1, peor = Infinity, acum = 0;
    for (let i = 1; i < pesos.length; i++) {
        acum += pesos[i - 1];
        const alto = Math.max(acum, total - acum);
        if (alto < peor) { peor = alto; mejor = i; }
    }
    return mejor;
}

export const PermisosEnFrases: React.FC<Props> = props => {
    const { perms, rol, soloDistinto } = props;
    const [abierta, setAbierta] = useState<string | null>(null);
    const dosColumnas = useDosColumnas();

    const grupos = GRUPOS.map(g => {
        const todas = PANTALLAS.filter(p => p.grupo === g.id);
        const puerta = rol ? puertasDistintas(rol, perms).filter(x => x.grupo.id === g.id).length : 0;
        const distintas = puerta + (rol ? todas.reduce((n, p) => { const d = diferencia(rol, perms, p); return n + d.propios.length + d.quitados.length; }, 0) : 0);
        return {
            g,
            total: todas.length,
            ve: todas.filter(p => nivelDe(perms, p).nivel !== 0).length,
            distintas,
            // Con «solo lo distinto», la pantalla que se está cambiando no desaparece al quedar igual a su rol.
            pantallas: todas.filter(p => !soloDistinto || (rol && difiere(diferencia(rol, perms, p))) || props.sinGuardarEn(p) || abierta === p.id),
            conAviso: moduloSinEntrada(perms, g) || puerta > 0 || (!!g.puerta && !!props.puertaSinGuardar?.(g.puerta)),
        };
    }).filter(x => x.pantallas.length > 0 || x.conAviso);

    if (!grupos.length) {
        return <p className="rounded-card border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nada distinto a su rol: tiene justo lo que trae el rol.</p>;
    }

    const tarjeta = ({ g, total, ve, distintas, pantallas }: (typeof grupos)[number]) => {
        const Icono = ICONO_MENU[g.id];
        return (
            <section key={g.id} aria-label={g.nombre} className="overflow-hidden rounded-card border border-border bg-card">
                <header className="flex items-center gap-3 bg-brand-primary px-4 py-2.5 text-white">
                    <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <h3 className="flex-1 text-sm font-bold">{g.nombre}</h3>
                    <span className="text-xs text-white/90">
                        {ve === 0 ? 'no lo ve' : `ve ${ve} de ${total}`}
                        {distintas > 0 && ` · ${distintas} ${distintas === 1 ? 'cosa distinta' : 'cosas distintas'}`}
                    </span>
                </header>
                <ul className="divide-y divide-border">
                    <AvisoEntrada g={g} props={props} />
                    {pantallas.map(p => (
                        <FilaPantalla key={p.id} p={p} props={props} abierta={abierta === p.id} onAbrir={() => setAbierta(abierta === p.id ? null : p.id)} />
                    ))}
                </ul>
            </section>
        );
    };

    if (!dosColumnas || grupos.length < 2) {
        return <div className="flex flex-col gap-4">{grupos.map(tarjeta)}</div>;
    }
    // Dos columnas FIJAS (en orden: la primera de arriba abajo, después la segunda). El corte se calcula con las
    // pantallas de cada módulo, no con su alto en pantalla: abrir «Cambiar» no mueve tarjetas de una columna a otra.
    const i = corte(grupos.map(x => x.pantallas.length + 1));
    return (
        <div className="grid grid-cols-2 items-start gap-4">
            <div className="flex min-w-0 flex-col gap-4">{grupos.slice(0, i).map(tarjeta)}</div>
            <div className="flex min-w-0 flex-col gap-4">{grupos.slice(i).map(tarjeta)}</div>
        </div>
    );
};
