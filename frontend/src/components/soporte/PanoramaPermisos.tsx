import React, { useMemo } from 'react';
import { Check, LogIn } from 'lucide-react';
import { Cargando, Skeleton, SkeletonCirculo } from '../ui/Skeleton';
import { useAparecer } from '../../hooks/useAparecer';
import { cn } from '../../utils/cn';
import { ETIQUETA_BUZON_IDEAS } from '../ideas/ideasConfig';
import { entroHoy, lugarUsuario, textoIngreso } from './fichaUsuario';
import { ICONO_MENU } from './iconosMenu';
import { armarPanorama, textoPersonas, type ColumnaPanorama, type FilaPanorama, type UsuarioPanorama } from './panorama';

/**
 * «Panorama» de Soporte · usuarios (Marcos 2026-10-26): una fila por persona activa, agrupadas por rol, y una columna
 * por cada sección del menú lateral (con su ícono), con ✓ donde esa persona la ve. La columna Inicio dice qué Inicio le
 * toca. Arriba, cuántas de las mostradas ven cada sección. Tocar a una persona abre su ficha. Después de «Persona», su
 * último ingreso (el historial de inicios de sesión; «ver como» no cuenta) y arriba cuántas entraron hoy.
 * Todo lo calcula `armarPanorama` (panorama.ts, puro y con test) con las reglas de la app (menuVisible…).
 * Encabezado y columna «Persona» fijos: la tabla se desplaza dentro de su caja (también en el teléfono).
 */
interface Props {
    /** null = todavía no llega. */
    datos: UsuarioPanorama[] | null;
    texto: string;
    rolId: number | null;
    /** El buscador y el filtro por rol de la página (los mismos de la lista). */
    filtros: React.ReactNode;
    onElegir: (id: number) => void;
}

/** Fondos sólidos en las celdas fijas: al desplazar, lo de abajo no se transparenta. */
const TH_COLUMNA = 'bg-brand-primary px-1 pb-2 pt-2.5 align-bottom font-semibold text-white border-b border-white/15';
const CELDA = 'border-b border-border bg-card px-1 py-2 text-center align-middle transition-colors duration-200 ease-apple group-hover:bg-background';

const Marca: React.FC<{ ve: boolean; columna: string }> = ({ ve, columna }) => (
    ve ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-foreground" title={`Ve ${columna}`}>
            <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
            <span className="sr-only">Sí</span>
        </span>
    ) : (
        <>
            <span aria-hidden className="text-sm text-border">–</span>
            <span className="sr-only">No</span>
        </>
    )
);

const Encabezado: React.FC<{ c: ColumnaPanorama }> = ({ c }) => {
    const Icono = ICONO_MENU[c.clave];
    return (
        <th scope="col" title={c.descripcion} className={`${TH_COLUMNA} ${c.clave === 'inicio' ? 'min-w-22' : 'min-w-18'}`}>
            <span className="flex flex-col items-center gap-1">
                <Icono aria-hidden className="h-4 w-4" />
                <span className="text-xs leading-tight">{c.label}</span>
            </span>
        </th>
    );
};

const Fila: React.FC<{ f: FilaPanorama; columnas: ColumnaPanorama[]; onElegir: (id: number) => void }> = ({ f, columnas, onElegir }) => {
    const u = f.usuario;
    const lugar = lugarUsuario(u);
    return (
        <tr className="group cursor-pointer" onClick={() => onElegir(u.id)}>
            <th scope="row" className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left font-normal transition-colors duration-200 ease-apple group-hover:bg-background">
                {/* eslint-disable-next-line no-restricted-syntax -- nombre clicable en la celda fija (abre su ficha); Button no soporta las dos líneas truncadas */}
                <button type="button" onClick={e => { e.stopPropagation(); onElegir(u.id); }} title={`${u.nombre} · ${u.email}`}
                    className="block rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                    <span className="block w-28 truncate text-sm font-semibold text-brand-dark group-hover:underline sm:w-40">{u.nombre}</span>
                    {lugar && <span className="block w-28 truncate text-caption text-muted-foreground sm:w-40">{lugar}</span>}
                </button>
            </th>
            <td className={CELDA}>
                <span className={`whitespace-nowrap text-xs tabular-nums ${u.ultimo_ingreso ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {textoIngreso(u.ultimo_ingreso)}
                </span>
            </td>
            {columnas.map(c => (
                <td key={c.clave} className={CELDA}>
                    {c.clave === 'inicio' ? (
                        <span title={f.inicio.detalle.join('\n')}
                            className="inline-flex whitespace-nowrap rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                            {f.inicio.texto}
                        </span>
                    ) : (
                        <Marca ve={f.ve[c.clave]} columna={c.label} />
                    )}
                </td>
            ))}
        </tr>
    );
};

/**
 * La tabla mientras llegan las personas: el encabezado verde con las secciones del menú es fijo (va de verdad); los
 * totales, el rol, los nombres y las marcas van en gris. Se desplaza dentro de su caja, igual que la tabla.
 */
const PanoramaSilueta: React.FC<{ columnas: ColumnaPanorama[] }> = ({ columnas }) => (
    <Cargando que="el panorama" className="max-h-[calc(100dvh-15rem)] min-h-72 overflow-auto rounded-b-card">
        <table className="min-w-full border-separate border-spacing-0 text-sm" aria-hidden="true">
            <thead>
                <tr>
                    <th scope="col" className={`${TH_COLUMNA} sticky left-0 z-30 border-r px-3 text-left`}>
                        <span className="text-xs">Persona</span>
                    </th>
                    <th scope="col" className={`${TH_COLUMNA} min-w-22`}>
                        <span className="flex flex-col items-center gap-1">
                            <LogIn aria-hidden className="h-4 w-4" />
                            <span className="text-xs leading-tight">Último ingreso</span>
                        </span>
                    </th>
                    {columnas.map(c => <Encabezado key={c.clave} c={c} />)}
                </tr>
                <tr>
                    <th scope="row" className="sticky left-0 z-30 border-b border-r border-border bg-card px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                        Personas que la ven
                    </th>
                    <td className="border-b border-border bg-card px-1 py-1.5"><Skeleton className="mx-auto h-3 w-10" /></td>
                    {columnas.map(c => (
                        <td key={c.clave} className="border-b border-border bg-card px-1 py-1.5"><Skeleton className="mx-auto h-3 w-5" /></td>
                    ))}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <th scope="rowgroup" colSpan={columnas.length + 2} className="border-b border-border bg-muted p-0 text-left">
                        {/* Sobre el gris del grupo, la silueta va un tono más oscura (el borde) para que se vea. */}
                        <span className="sticky left-0 block w-fit px-3 py-2"><Skeleton className="h-3 w-32" style={{ backgroundColor: 'var(--color-border)' }} /></span>
                    </th>
                </tr>
                {[0, 1, 2, 3, 4, 5].map(i => (
                    <tr key={i}>
                        <th scope="row" className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left font-normal">
                            <span className="block w-28 space-y-1.5 sm:w-40">
                                <Skeleton className={cn('h-3.5', i % 2 ? 'w-20 sm:w-28' : 'w-24 sm:w-32')} />
                                <Skeleton className="h-3 w-16 sm:w-24" />
                            </span>
                        </th>
                        <td className={CELDA}><Skeleton className="mx-auto h-3 w-14" /></td>
                        {columnas.map(c => (
                            <td key={c.clave} className={CELDA}>
                                {c.clave === 'inicio'
                                    ? <Skeleton className="mx-auto h-5 w-16 rounded-full" />
                                    : <SkeletonCirculo className="mx-auto h-6 w-6" />}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </Cargando>
);

export const PanoramaPermisos: React.FC<Props> = ({ datos, texto, rolId, filtros, onElegir }) => {
    const p = useMemo(() => armarPanorama(datos ?? [], texto, rolId, ETIQUETA_BUZON_IDEAS), [datos, texto, rolId]);
    const aparece = useAparecer(datos === null);
    const total = datos?.length ?? 0;
    const hoy = useMemo(() => p.grupos.reduce((n, g) => n + g.filas.filter(f => entroHoy(f.usuario.ultimo_ingreso)).length, 0), [p]);

    return (
        <section aria-label="Panorama" className="min-w-0 rounded-card border border-border bg-card">
            <div className="flex flex-col gap-2 border-b border-border p-3 md:flex-row md:items-center">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_16rem]">{filtros}</div>
                <p className="text-xs text-muted-foreground md:max-w-xs md:text-right">
                    {datos === null
                        ? <span aria-hidden="true" className="silueta inline-block h-3 w-20 rounded-md align-middle" />
                        : `${textoPersonas(p.personas)}${p.personas !== total ? ` de ${total}` : ''}`}
                    {' · '}✓ = la ve en su menú lateral · toca a una persona para ver su ficha
                </p>
            </div>

            {datos === null ? (
                <PanoramaSilueta columnas={p.columnas} />
            ) : !p.grupos.length ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nadie con ese filtro.</p>
            ) : (
                <div className={`max-h-[calc(100dvh-15rem)] min-h-72 overflow-auto rounded-b-card ${aparece}`}>
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                        <caption className="sr-only">Qué secciones del menú ve cada persona, por rol</caption>
                        <thead className="sticky top-0 z-20">
                            <tr>
                                <th scope="col" className={`${TH_COLUMNA} sticky left-0 z-30 border-r px-3 text-left`}>
                                    <span className="text-xs">Persona</span>
                                </th>
                                <th scope="col" title="Cuándo inició sesión por última vez («ver como» no cuenta)" className={`${TH_COLUMNA} min-w-22`}>
                                    <span className="flex flex-col items-center gap-1">
                                        <LogIn aria-hidden className="h-4 w-4" />
                                        <span className="text-xs leading-tight">Último ingreso</span>
                                    </span>
                                </th>
                                {p.columnas.map(c => <Encabezado key={c.clave} c={c} />)}
                            </tr>
                            <tr>
                                <th scope="row" className="sticky left-0 z-30 border-b border-r border-border bg-card px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                                    Personas que la ven
                                </th>
                                <td title={`${textoPersonas(hoy)} de ${p.personas} entraron hoy`}
                                    className="whitespace-nowrap border-b border-border bg-card px-1 py-1.5 text-center text-xs font-semibold tabular-nums text-foreground">
                                    {hoy} hoy
                                </td>
                                {p.columnas.map(c => (
                                    <td key={c.clave} title={`${textoPersonas(p.totales[c.clave])} de ${p.personas} ven ${c.label}`}
                                        className="border-b border-border bg-card px-1 py-1.5 text-center text-xs font-semibold tabular-nums text-foreground">
                                        {p.totales[c.clave]}
                                    </td>
                                ))}
                            </tr>
                        </thead>
                        {p.grupos.map(g => (
                            <tbody key={g.rol_id}>
                                <tr>
                                    <th scope="rowgroup" colSpan={p.columnas.length + 2} className="border-b border-border bg-muted p-0 text-left">
                                        <span className="sticky left-0 block w-fit px-3 py-1.5 text-caption font-bold uppercase tracking-widest text-foreground">
                                            {g.rol_nombre}
                                            <span className="ml-2 font-medium normal-case tracking-normal text-muted-foreground">{textoPersonas(g.filas.length)}</span>
                                        </span>
                                    </th>
                                </tr>
                                {g.filas.map(f => <Fila key={f.usuario.id} f={f} columnas={p.columnas} onElegir={onElegir} />)}
                            </tbody>
                        ))}
                    </table>
                </div>
            )}
        </section>
    );
};
