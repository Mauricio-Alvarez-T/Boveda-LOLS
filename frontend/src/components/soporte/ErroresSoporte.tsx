import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    AlertCircle, ArrowLeft, Bug, CheckCircle2, Clock, Eye, Folder, FolderInput, FolderPlus, Image as ImageIcon, Info, Laptop,
    MessageSquareText, Repeat, RotateCcw, Smartphone, Trash2, UserSearch, Wrench,
} from 'lucide-react';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { PestanasElasticas } from '../ui/PestanasElasticas';
import { SearchBar } from '../ui/SearchBar';
import { Cargando, Skeleton, SkeletonCirculo } from '../ui/Skeleton';
import { useErroresSoporte } from '../../hooks/useErroresSoporte';
import { cn } from '../../utils/cn';
import { textoIngreso } from './fichaUsuario';
import { AvisosCelular } from './AvisosCelular';
import { RecordatoriosAvisos } from './RecordatoriosAvisos';
import {
    CATEGORIA_ERROR, apartadoDeVista, estadoArreglo, filtrarErrores, navegadorCorto, pendientesSueltos, pestanasErrores, pideRevision,
    porQueSinFoto, textoDuracion, type ApartadoSoporte, type ErrorSoporte, type VistaErrores,
} from './errores';
import {
    AvisoArreglo, DialogoApartado, DialogoArreglado, DialogoBorrarApartado, DialogoNuevoApartado, type DestinoApartado,
} from './ArregloApartados';
import { versionLegible } from '../../services/versionApp';

/** El mensaje del servidor (`{ error }`), o el que se pasa. */
const mensajeServidor = (err: unknown, otro: string) =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error || otro;

/**
 * Soporte · «Errores» (mig 141, Marcos 2026-10-26): los avisos que mandó la app de cada persona cuando le salió un
 * error. Como «Personas»: la lista a la izquierda y el aviso elegido a la derecha (en el celular, uno a la vez).
 * «Para revisar» = fallas del servidor, pantallas rotas y permisos sin revisar; lento, sin señal y datos mal ingresados
 * solo se cuentan (sus propias vistas). Cada aviso dice qué es, cuántas veces pasó, la foto (si es una falla) y lo que
 * escribió la persona; se marca revisado con una nota. Solo el Super Administrador (el servidor lo exige).
 * Desde la mig 150 (Marcos 2026-11-03): «Arreglado en esta versión» (si vuelve con esa versión, se reabre solo y
 * avisa) y apartados propios entre «Datos mal ingresados» y «Revisados» (ArregloApartados.tsx).
 */

const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';

const Iniciales: React.FC<{ nombre: string }> = ({ nombre }) => (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
        {nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}
    </span>
);

const Marcas: React.FC<{ e: ErrorSoporte }> = ({ e }) => {
    const c = CATEGORIA_ERROR[e.categoria];
    const arreglo = estadoArreglo(e);
    return (
        <span className="flex flex-wrap gap-1.5">
            <Chip tone={c.tono} label={c.etiqueta} />
            {arreglo === 'reabierto' && <Chip tone="danger" label="Volvió después del arreglo" icon={<RotateCcw className="h-3 w-3" />} />}
            {arreglo === 'vigilando' && <Chip tone="success" label="Arreglado · vigilando" icon={<Eye className="h-3 w-3" />} />}
            {arreglo === 'fallo' && <Chip tone="danger" label="El arreglo no funcionó" icon={<RotateCcw className="h-3 w-3" />} />}
            {pideRevision(e.categoria) && arreglo !== 'vigilando' && arreglo !== 'fallo' && (e.estado === 'revisado'
                ? <Chip tone="success" label="Revisado" icon={<CheckCircle2 className="h-3 w-3" />} />
                : <Chip tone="warning" label="Sin revisar" />)}
            {e.apartado_nombre && <Chip label={e.apartado_nombre} icon={<Folder className="h-3 w-3" />} />}
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
    if (!url) return <Cargando que="la foto"><Skeleton className="h-64 rounded-xl" /></Cargando>;
    return (
        <a href={url} target="_blank" rel="noreferrer" title="Abrir la foto en grande" className="block">
            <img src={url} alt={`Foto de la pantalla de ${e.usuario_nombre}`}
                className={cn('rounded-xl border border-border bg-muted object-contain object-top',
                    e.dispositivo === 'movil' ? 'mx-auto max-h-[28rem] w-auto max-w-full' : 'w-full max-h-[28rem]')} />
        </a>
    );
};

const Detalle: React.FC<{
    e: ErrorSoporte; onRevisado: (estado: ErrorSoporte['estado'], nota: string) => Promise<void>; onVerFicha: () => void;
    onArreglado: () => void; onMover: () => void; nota: string; setNota: (n: string) => void;
}> = ({ e, onRevisado, onVerFicha, onArreglado, onMover, nota, setNota }) => {
    const [guardando, setGuardando] = useState(false);
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

            <AvisoArreglo e={e} />

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
                <dt className="text-muted-foreground">Versión</dt>
                <dd className="text-foreground">{e.version_app ? `Bóveda del ${versionLegible(e.version_app)}` : 'De antes (esa app no la informaba)'}</dd>
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

            {pideRevision(e.categoria) ? (
                <div className="space-y-2">
                    {e.estado === 'revisado' && (
                        <p className="text-xs text-muted-foreground">Revisado{e.revisado_por_nombre ? ` por ${e.revisado_por_nombre}` : ''}{e.revisado_en ? ` · ${textoIngreso(e.revisado_en)}` : ''}</p>
                    )}
                    <label htmlFor="nota-error" className="sr-only">Qué se hizo</label>
                    <textarea id="nota-error" value={nota} onChange={ev => setNota(ev.target.value)} rows={2} maxLength={1000}
                        placeholder="Qué se hizo (nota para ustedes, opcional)…" className={CAMPO} />
                    <div className="flex flex-wrap gap-2">
                        {e.estado === 'pendiente' ? (
                            <>
                                <Button onClick={onArreglado} leftIcon={<Wrench className="h-4 w-4" />}>Arreglado en esta versión</Button>
                                <Button variant="secondary" onClick={() => guardar('revisado')} isLoading={guardando} leftIcon={<CheckCircle2 className="h-4 w-4" />}>Marcar revisado</Button>
                            </>
                        ) : (
                            <Button variant="secondary" onClick={() => guardar('pendiente')} isLoading={guardando} leftIcon={<RotateCcw className="h-4 w-4" />}>Volver a «sin revisar»</Button>
                        )}
                        <Button variant="secondary" onClick={onMover} leftIcon={<FolderInput className="h-4 w-4" />}>Mover a un apartado</Button>
                        <Button variant="secondary" onClick={onVerFicha} leftIcon={<UserSearch className="h-4 w-4" />}>Ver su ficha</Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={onMover} leftIcon={<FolderInput className="h-4 w-4" />}>Mover a un apartado</Button>
                </div>
            )}
        </div>
    );
};

/** La lista de avisos mientras llega: iniciales, persona + hora, mensaje, pantalla y las marcas. */
const ListaErroresSilueta: React.FC = () => (
    <Cargando que="los avisos de error">
        <ul className="flex flex-col gap-1 p-2" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5">
                    <SkeletonCirculo className="h-9 w-9" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <Skeleton className={cn('h-3.5', i % 2 ? 'w-24' : 'w-32')} />
                            <Skeleton className="ml-auto h-3 w-14" />
                        </div>
                        <Skeleton className={cn('h-3', i % 3 === 1 ? 'w-3/5' : 'w-4/5')} />
                        <Skeleton className="h-3 w-2/5" />
                        <div className="flex gap-1.5 pt-1"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /></div>
                    </div>
                </li>
            ))}
        </ul>
    </Cargando>
);

/** El detalle mientras llega la lista: la persona, el mensaje, la foto y los datos (rótulos de verdad). */
const DetalleSilueta: React.FC = () => (
    <Cargando que="el detalle del error" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3" aria-hidden="true">
            <div className="flex min-w-0 items-center gap-3">
                <SkeletonCirculo className="h-9 w-9" />
                <div className="min-w-0 space-y-2"><Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-3 w-28" /></div>
            </div>
            <div className="flex gap-1.5"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /></div>
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-background px-3 py-2.5" aria-hidden="true">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="ml-6 h-3 w-1/2" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm" aria-hidden="true">
            {['Pantalla', 'Cuándo', 'Veces', 'Desde'].map((r, i) => (
                <React.Fragment key={r}>
                    <dt className="text-muted-foreground">{r}</dt>
                    <dd className="flex items-center"><Skeleton className={cn('h-3.5', i === 2 ? 'w-8' : i === 1 ? 'w-40 max-w-full' : 'w-32 max-w-full')} /></dd>
                </React.Fragment>
            ))}
        </dl>
    </Cargando>
);

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
    // Apartados propios y los diálogos de «Arreglado en esta versión» / «Mover a un apartado» (mig 150).
    const [apartados, setApartados] = useState<ApartadoSoporte[]>([]);
    const [dialogo, setDialogo] = useState<'arreglado' | 'mover' | 'nuevo' | null>(null);
    const [aBorrar, setABorrar] = useState<ApartadoSoporte | null>(null);
    const [notaEscrita, setNotaEscrita] = useState<{ id: number | null; texto: string }>({ id: null, texto: '' });

    const cargarApartados = () => {
        api.get<{ data: ApartadoSoporte[] }>('/soporte/errores/apartados')
            .then(res => setApartados(res.data.data || []))
            .catch(() => { /* sin la mig 150 todavía: sin apartados */ });
    };
    useEffect(cargarApartados, []);

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
    // La nota es del error elegido (la usan «Marcar revisado» y «Arreglado en esta versión»): lo escrito vale mientras
    // siga elegido el mismo; al elegir otro, parte con la nota guardada de ese.
    const nota = notaEscrita.id === elegido?.id ? notaEscrita.texto : (elegido?.nota || '');
    const setNota = (texto: string) => setNotaEscrita({ id: elegido?.id ?? null, texto });
    const apartadoVista = apartadoDeVista(vista);
    const apartadoActual = apartados.find(a => a.id === apartadoVista) ?? null;

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

    const marcarArreglado = async (e: ErrorSoporte, tipo: 'actual' | 'proxima', version: string, notaArreglo: string) => {
        try {
            const r = await api.post<{ data: { iguales: number } }>(`/soporte/errores/${e.id}/arreglado`, { version, tipo, nota: notaArreglo });
            const iguales = Number(r.data.data?.iguales) || 0;
            toast.success(`Guardado: vigila ${tipo === 'actual' ? `desde la versión del ${versionLegible(version)}` : 'desde la próxima versión que se suba'}.`
                + (iguales ? ` También se marcaron ${iguales} ${iguales === 1 ? 'igual' : 'iguales'}.` : ''));
            setDialogo(null);
            void resumen.refetch();
            recargar();
            cargarApartados();
        } catch (err) {
            toast.error(mensajeServidor(err, 'No se pudo guardar. Intenta de nuevo.'));
        }
    };

    const mover = async (e: ErrorSoporte, d: DestinoApartado) => {
        try {
            let destino = d.apartadoId;
            let nombre = apartados.find(a => a.id === destino)?.nombre ?? '';
            if (d.nombreNuevo) {
                const c = await api.post<{ data: ApartadoSoporte }>('/soporte/errores/apartados', { nombre: d.nombreNuevo });
                destino = c.data.data.id;
                nombre = c.data.data.nombre;
            }
            const r = await api.patch<{ data: { movidos: number } }>(`/soporte/errores/${e.id}/apartado`, { apartado_id: destino, auto: d.auto });
            const movidos = Number(r.data.data?.movidos) || 1;
            toast.success(destino === null ? 'Volvió a su lugar de siempre.'
                : `${movidos > 1 ? `Se movieron ${movidos} errores` : 'Movido'} a «${nombre}».${d.auto ? ' Los próximos iguales llegan solos ahí.' : ''}`);
            setDialogo(null);
            void resumen.refetch();
            recargar();
            cargarApartados();
        } catch (err) {
            toast.error(mensajeServidor(err, 'No se pudo mover. Intenta de nuevo.'));
        }
    };

    const crearApartado = async (nombreNuevo: string) => {
        try {
            const c = await api.post<{ data: ApartadoSoporte }>('/soporte/errores/apartados', { nombre: nombreNuevo });
            toast.success(`Apartado «${c.data.data.nombre}» creado. Mueva errores ahí con «Mover a un apartado».`);
            setDialogo(null);
            cargarApartados();
        } catch (err) {
            toast.error(mensajeServidor(err, 'No se pudo crear. Intenta de nuevo.'));
        }
    };

    const borrarApartado = async () => {
        if (!aBorrar) return;
        try {
            await api.delete(`/soporte/errores/apartados/${aBorrar.id}`);
            toast.success(`Apartado «${aBorrar.nombre}» borrado. Sus errores volvieron a su lugar de siempre.`);
            setABorrar(null);
            cargarApartados();
            void resumen.refetch();
            cambiarVista('revisar');
        } catch (err) {
            toast.error(mensajeServidor(err, 'No se pudo borrar. Intenta de nuevo.'));
        }
    };

    const nPendientes = pendientesSueltos(resumen.pendientes, apartados);
    const lentos = resumen.lentos;
    const pestanas = pestanasErrores(apartados);

    return (
        <div className="flex flex-col gap-4">
            {/* Prueba piloto de avisos al celular (mig 143). */}
            <AvisosCelular />
            {/* Quién recibe los recordatorios de pendientes y si ya activó los avisos. */}
            <RecordatoriosAvisos />
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

            <div className="flex flex-wrap items-center gap-2">
                <div className="max-w-full overflow-x-auto rounded-2xl border border-border bg-card p-1">
                    <PestanasElasticas opciones={pestanas} activa={vista} onCambiar={cambiarVista} aria-label="Qué avisos ver" claseFila="gap-1"
                        claseOpcion="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-medium whitespace-nowrap"
                        claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                        render={o => {
                            const ap = apartadoDeVista(o.key);
                            const n = o.key === 'revisar' ? nPendientes : ap !== null ? (apartados.find(a => a.id === ap)?.pendientes ?? 0) : 0;
                            return <>{ap !== null && <Folder aria-hidden className="h-3.5 w-3.5" />}{o.label}{n > 0 ? <span className="tabular-nums">({n})</span> : null}</>;
                        }} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDialogo('nuevo')} leftIcon={<FolderPlus className="h-4 w-4" />}>Nuevo apartado</Button>
                {apartadoActual && (
                    <Button variant="ghost" size="sm" onClick={() => setABorrar(apartadoActual)} leftIcon={<Trash2 className="h-4 w-4" />}>Borrar «{apartadoActual.nombre}»</Button>
                )}
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
                            <ListaErroresSilueta />
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
                            {lista === null ? (
                                <DetalleSilueta />
                            ) : elegido ? (
                                <Detalle e={elegido} onRevisado={(estado, n) => revisar(elegido, estado, n)}
                                    onVerFicha={() => navigate(`/soporte?u=${elegido.usuario_id}`)}
                                    onArreglado={() => setDialogo('arreglado')} onMover={() => setDialogo('mover')} nota={nota} setNota={setNota} />
                            ) : (
                                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Info className="h-4 w-4" /> Elige un aviso de la lista.</p>
                            )}
                        </section>
                    </div>
                </div>
            )}

            <DialogoArreglado abierto={dialogo === 'arreglado' && !!elegido} notaInicial={nota} onCerrar={() => setDialogo(null)}
                onGuardar={(tipo, version, n) => (elegido ? marcarArreglado(elegido, tipo, version, n) : Promise.resolve())} />
            <DialogoApartado abierto={dialogo === 'mover' && !!elegido} apartados={apartados} actual={elegido?.apartado_id ?? null}
                onCerrar={() => setDialogo(null)} onGuardar={d => (elegido ? mover(elegido, d) : Promise.resolve())} />
            <DialogoNuevoApartado abierto={dialogo === 'nuevo'} onCerrar={() => setDialogo(null)} onCrear={crearApartado} />
            <DialogoBorrarApartado apartado={aBorrar} onCerrar={() => setABorrar(null)} onBorrar={borrarApartado} />
        </div>
    );
};

export default ErroresSoporte;
