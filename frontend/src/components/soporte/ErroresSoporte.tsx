import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    AlertCircle, ArrowLeft, Bug, CheckCircle2, Clock, Image as ImageIcon, Info, Laptop, MessageSquareText, Repeat,
    RotateCcw, Smartphone, UserSearch,
} from 'lucide-react';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { PestanasElasticas } from '../ui/PestanasElasticas';
import { SearchBar } from '../ui/SearchBar';
import { SkeletonFilas } from '../ui/Skeleton';
import { useErroresSoporte } from '../../hooks/useErroresSoporte';
import { cn } from '../../utils/cn';
import { textoIngreso } from './fichaUsuario';
import {
    CATEGORIA_ERROR, VISTAS_ERRORES, filtrarErrores, navegadorCorto, pideRevision, porQueSinFoto, textoDuracion,
    type ErrorSoporte, type VistaErrores,
} from './errores';

/**
 * Soporte · «Errores» (mig 141, Marcos 2026-10-26): los avisos que mandó la app de cada persona cuando le salió un
 * error. Como «Personas»: la lista a la izquierda y el aviso elegido a la derecha (en el celular, uno a la vez).
 * «Para revisar» = fallas del servidor, pantallas rotas y permisos sin revisar; lento, sin señal y datos mal ingresados
 * solo se cuentan (sus propias vistas). Cada aviso dice qué es, cuántas veces pasó, la foto (si es una falla) y lo que
 * escribió la persona; se marca revisado con una nota. Solo el Super Administrador (el servidor lo exige).
 */

const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';

const Iniciales: React.FC<{ nombre: string }> = ({ nombre }) => (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
        {nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}
    </span>
);

const Marcas: React.FC<{ e: ErrorSoporte }> = ({ e }) => {
    const c = CATEGORIA_ERROR[e.categoria];
    return (
        <span className="flex flex-wrap gap-1.5">
            <Chip tone={c.tono} label={c.etiqueta} />
            {pideRevision(e.categoria) && (e.estado === 'revisado'
                ? <Chip tone="success" label="Revisado" icon={<CheckCircle2 className="h-3 w-3" />} />
                : <Chip tone="warning" label="Sin revisar" />)}
            {e.veces > 1 && <Chip label={`${e.veces} veces`} icon={<Repeat className="h-3 w-3" />} />}
            {e.tiene_foto && <Chip label="Foto" icon={<ImageIcon className="h-3 w-3" />} />}
            {e.descripcion && <Chip label="Escribió" icon={<MessageSquareText className="h-3 w-3" />} />}
        </span>
    );
};

/** La foto del aviso: se pide aparte (con la sesión) y se muestra entera; tocarla la abre en grande. Va con key = id. */
const FotoAviso: React.FC<{ e: ErrorSoporte }> = ({ e }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [falla, setFalla] = useState(false);
    useEffect(() => {
        if (!e.tiene_foto) return undefined;
        let vivo = true;
        let creada: string | null = null;
        api.get(`/soporte/errores/${e.id}/foto`, { responseType: 'blob' })
            .then(res => { if (!vivo) return; creada = URL.createObjectURL(res.data as Blob); setUrl(creada); })
            .catch(() => { if (vivo) setFalla(true); });
        return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
    }, [e.id, e.tiene_foto]);

    const sinFoto = porQueSinFoto(e);
    if (sinFoto) return <p className="rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-xs text-muted-foreground">{sinFoto}</p>;
    if (falla) return <p className="text-xs text-muted-foreground">No se pudo cargar la foto.</p>;
    if (!url) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
    return (
        <a href={url} target="_blank" rel="noreferrer" title="Abrir la foto en grande" className="block">
            <img src={url} alt={`Foto de la pantalla de ${e.usuario_nombre}`}
                className={cn('rounded-xl border border-border bg-muted object-contain object-top',
                    e.dispositivo === 'movil' ? 'mx-auto max-h-[28rem] w-auto max-w-full' : 'w-full max-h-[28rem]')} />
        </a>
    );
};

const Detalle: React.FC<{ e: ErrorSoporte; onRevisado: (estado: ErrorSoporte['estado'], nota: string) => Promise<void>; onVerFicha: () => void }> = ({ e, onRevisado, onVerFicha }) => {
    const [nota, setNota] = useState(e.nota || '');
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { setNota(e.nota || ''); }, [e.id, e.nota]);
    const c = CATEGORIA_ERROR[e.categoria];
    const esFalla = e.categoria === 'falla' || e.categoria === 'app';

    const guardar = async (estado: ErrorSoporte['estado']) => {
        setGuardando(true);
        try { await onRevisado(estado, nota); } finally { setGuardando(false); }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <Iniciales nombre={e.usuario_nombre} />
                    <div className="min-w-0">
                        <p className="truncate text-section font-semibold text-brand-dark">{e.usuario_nombre}</p>
                        <p className="truncate text-xs text-muted-foreground">{[e.rol_nombre, e.obra_nombre && `Obra ${e.obra_nombre}`].filter(Boolean).join(' · ')}</p>
                    </div>
                </div>
                <Marcas e={e} />
            </div>

            <div className={cn('rounded-xl border px-3 py-2.5',
                esFalla ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-500/10' : 'border-border bg-background')}>
                <p className={cn('flex items-start gap-2 text-sm font-semibold', esFalla ? 'text-red-700 dark:text-red-300' : 'text-foreground')}>
                    <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{e.mensaje}
                </p>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">{c.explicacion}</p>
                {e.permisos_faltantes.length > 0 && (
                    <p className="mt-1.5 pl-6 text-xs text-foreground">
                        Le faltó: {e.permisos_faltantes.map((p, i) => (
                            <React.Fragment key={p.clave}>{i > 0 && ' o '}<strong>{p.nombre}</strong> <span className="text-muted-foreground">({p.clave})</span></React.Fragment>
                        ))}
                    </p>
                )}
            </div>

            <FotoAviso key={e.id} e={e} />

            {e.descripcion ? (
                <blockquote className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Lo que escribió</p>
                    «{e.descripcion}»
                </blockquote>
            ) : pideRevision(e.categoria) ? (
                <p className="text-xs text-muted-foreground">No escribió nada (el aviso llegó igual).</p>
            ) : null}

            <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Pantalla</dt>
                <dd className="min-w-0 break-words text-foreground">{e.pantalla_nombre || '—'}{e.pantalla ? <span className="block text-caption text-muted-foreground">{e.pantalla}</span> : null}</dd>
                <dt className="text-muted-foreground">Cuándo</dt>
                <dd className="text-foreground">{textoIngreso(e.ultima_vez)}{e.veces > 1 ? ` (la primera vez, ${textoIngreso(e.primera_vez)})` : ''}</dd>
                <dt className="text-muted-foreground">Veces</dt>
                <dd className="text-foreground">{e.veces}</dd>
                <dt className="text-muted-foreground">Desde</dt>
                <dd className="flex min-w-0 items-center gap-1.5 text-foreground">
                    {e.dispositivo === 'movil' ? <Smartphone aria-hidden className="h-4 w-4 shrink-0" /> : <Laptop aria-hidden className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{e.dispositivo === 'movil' ? 'Celular' : 'Computador'}{e.navegador ? ` · ${navegadorCorto(e.navegador)}` : ''}</span>
                </dd>
            </dl>

            <details className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
                <summary className="cursor-pointer font-semibold text-muted-foreground">Detalle técnico (para programar)</summary>
                <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                    <dt className="text-muted-foreground">Pidió</dt><dd className="break-all font-mono text-foreground">{e.accion || '—'}</dd>
                    <dt className="text-muted-foreground">Código</dt><dd className="font-mono text-foreground">{e.codigo ?? 'sin respuesta'}</dd>
                    {e.duracion_ms != null && <><dt className="text-muted-foreground">Espera</dt><dd className="text-foreground">{textoDuracion(e.duracion_ms)}</dd></>}
                </dl>
                {e.detalle_tecnico && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono text-caption text-foreground">{e.detalle_tecnico}</pre>}
            </details>

            {pideRevision(e.categoria) && (
                <div className="space-y-2">
                    {e.estado === 'revisado' && (
                        <p className="text-xs text-muted-foreground">Revisado{e.revisado_por_nombre ? ` por ${e.revisado_por_nombre}` : ''}{e.revisado_en ? ` · ${textoIngreso(e.revisado_en)}` : ''}</p>
                    )}
                    <label htmlFor="nota-error" className="sr-only">Qué se hizo</label>
                    <textarea id="nota-error" value={nota} onChange={ev => setNota(ev.target.value)} rows={2} maxLength={1000}
                        placeholder="Qué se hizo (nota para ustedes, opcional)…" className={CAMPO} />
                    <div className="flex flex-wrap gap-2">
                        {e.estado === 'pendiente' ? (
                            <Button onClick={() => guardar('revisado')} isLoading={guardando} leftIcon={<CheckCircle2 className="h-4 w-4" />}>Marcar revisado</Button>
                        ) : (
                            <Button variant="secondary" onClick={() => guardar('pendiente')} isLoading={guardando} leftIcon={<RotateCcw className="h-4 w-4" />}>Volver a «sin revisar»</Button>
                        )}
                        <Button variant="secondary" onClick={onVerFicha} leftIcon={<UserSearch className="h-4 w-4" />}>Ver su ficha</Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const ErroresSoporte: React.FC = () => {
    const navigate = useNavigate();
    const resumen = useErroresSoporte();
    const [vista, setVista] = useState<VistaErrores>('revisar');
    const [lista, setLista] = useState<ErrorSoporte[] | null>(null);
    const [fallo, setFallo] = useState(false);
    const [texto, setTexto] = useState('');
    const [idElegido, setIdElegido] = useState<number | null>(null);
    const [verDetalleMovil, setVerDetalleMovil] = useState(false);
    const detalleRef = useRef<HTMLDivElement>(null);

    // Cada cambio de vista (o «recargar» tras revisar) vuelve a pedir la lista.
    const [recarga, setRecarga] = useState(0);
    useEffect(() => {
        let vivo = true;
        api.get<{ data: ErrorSoporte[] }>('/soporte/errores', { params: { vista } })
            .then(res => { if (vivo) setLista(res.data.data || []); })
            .catch(() => { if (vivo) setFallo(true); });
        return () => { vivo = false; };
    }, [vista, recarga]);

    const cambiarVista = (v: VistaErrores) => {
        setVista(v);
        setLista(null);
        setFallo(false);
        setIdElegido(null);
        setVerDetalleMovil(false);
    };
    const recargar = () => { setFallo(false); setRecarga(n => n + 1); };

    const visibles = useMemo(() => filtrarErrores(lista ?? [], texto), [lista, texto]);
    const elegido = visibles.find(e => e.id === idElegido) ?? (verDetalleMovil ? undefined : visibles[0]);

    const elegir = (id: number) => {
        setIdElegido(id);
        setVerDetalleMovil(true);
        requestAnimationFrame(() => detalleRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    };

    const revisar = async (e: ErrorSoporte, estado: ErrorSoporte['estado'], nota: string) => {
        try {
            await api.patch(`/soporte/errores/${e.id}`, { estado, nota });
            toast.success(estado === 'revisado' ? 'Marcado como revisado.' : 'Volvió a «sin revisar».');
            void resumen.refetch();
            recargar();
        } catch {
            toast.error('No se pudo guardar. Intenta de nuevo.');
        }
    };

    const nPendientes = resumen.pendientes;
    const lentos = resumen.lentos;

    return (
        <div className="flex flex-col gap-4">
            {lentos.personas >= 3 && (
                <div className="flex items-start gap-2.5 rounded-card border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-foreground dark:border-blue-900/50 dark:bg-blue-500/10">
                    <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
                    <p>
                        <strong>En la última hora, {lentos.personas} personas tuvieron respuestas lentas</strong>
                        {lentos.desde && lentos.hasta ? ` (${textoIngreso(lentos.desde)} a ${textoIngreso(lentos.hasta).replace(/^hoy /, '')})` : ''}.
                        {' '}Si les pasa a varios a la vez, suele ser el servidor (o un deploy), no la señal de cada uno.
                    </p>
                </div>
            )}

            <div className="self-start max-w-full overflow-x-auto rounded-2xl border border-border bg-card p-1">
                <PestanasElasticas opciones={VISTAS_ERRORES} activa={vista} onCambiar={cambiarVista} aria-label="Qué avisos ver" claseFila="gap-1"
                    claseOpcion="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-medium whitespace-nowrap"
                    claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                    render={o => <>{o.label}{o.key === 'revisar' && nPendientes > 0 ? <span className="tabular-nums">({nPendientes})</span> : null}</>} />
            </div>

            {fallo ? (
                <EmptyState icon={Bug} title="No se pudieron cargar los errores" description="Revisa la conexión y vuelve a intentarlo."
                    action={<Button variant="secondary" onClick={recargar}>Reintentar</Button>} />
            ) : (
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
                    <section aria-label="Avisos de error" className={cn('rounded-card border border-border bg-card lg:sticky lg:top-2', verDetalleMovil && 'hidden lg:block')}>
                        <div className="border-b border-border p-3">
                            <SearchBar value={texto} onChange={setTexto} placeholder="Buscar persona, mensaje, pantalla…" />
                        </div>
                        {lista === null ? (
                            <SkeletonFilas filas={5} />
                        ) : !visibles.length ? (
                            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                                {texto ? 'Nada con esa búsqueda.' : vista === 'revisar' ? 'No hay errores por revisar. Todo tranquilo.' : 'Nada por aquí.'}
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1 p-2 lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto overscroll-contain">
                                {visibles.map(e => {
                                    const activa = e.id === elegido?.id;
                                    return (
                                        <li key={e.id}>
                                            {/* eslint-disable-next-line no-restricted-syntax -- fila de lista seleccionable (como la de Personas); Button no soporta este layout */}
                                            <button type="button" onClick={() => elegir(e.id)} aria-current={activa ? 'true' : undefined}
                                                className={cn('flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                                    activa ? 'border-brand-primary bg-brand-primary/5' : 'border-transparent hover:bg-background')}>
                                                <Iniciales nombre={e.usuario_nombre} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-baseline gap-2">
                                                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-dark">{e.usuario_nombre}</span>
                                                        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{textoIngreso(e.ultima_vez)}</span>
                                                    </span>
                                                    <span className={cn('block truncate text-xs', e.categoria === 'falla' || e.categoria === 'app' ? 'text-red-700 dark:text-red-300' : 'text-foreground')}>{e.mensaje}</span>
                                                    <span className="block truncate text-caption text-muted-foreground">{e.pantalla_nombre || e.pantalla || '—'}</span>
                                                    <span className="mt-1.5 block"><Marcas e={e} /></span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    <div ref={detalleRef} className={cn('scroll-mt-2 min-w-0', !verDetalleMovil && 'hidden lg:block')}>
                        {verDetalleMovil && (
                            <Button variant="ghost" size="sm" className="mb-2 lg:hidden" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => setVerDetalleMovil(false)}>
                                Volver a la lista
                            </Button>
                        )}
                        <section aria-label="Detalle del error" className="rounded-card border border-border bg-card p-5">
                            {elegido ? (
                                <Detalle e={elegido} onRevisado={(estado, nota) => revisar(elegido, estado, nota)}
                                    onVerFicha={() => navigate(`/soporte?u=${elegido.usuario_id}`)} />
                            ) : (
                                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Info className="h-4 w-4" /> Elige un aviso de la lista.</p>
                            )}
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ErroresSoporte;
