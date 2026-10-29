import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAparecer } from '../hooks/useAparecer';
import { toast } from 'sonner';
import { Lightbulb, Inbox, Hourglass, CheckCheck, Archive, Clock, Gauge, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStandardHeader } from '../components/ui/PageHeader';
import { EstadoPill } from '../components/ideas/Meta';
import { EmptyState } from '../components/ui/EmptyState';
import { Cargando, Skeleton, SkeletonCirculo } from '../components/ui/Skeleton';
import { SearchBar } from '../components/ui/SearchBar';
import { PestanasElasticas } from '../components/ui/PestanasElasticas';
import { BarraPaginada } from '../components/ui/BarraPaginada';
import { IdeaDetalle } from '../components/ideas/IdeaDetalle';
import { ProponerMejoraModal } from '../components/ideas/ProponerMejoraModal';
import { Button } from '../components/ui/Button';
import { TIPOS, ESTADOS, impacto, hace, primerNombre, ETIQUETA_BUZON_IDEAS } from '../components/ideas/ideasConfig';
import { useIdeasPendientes } from '../hooks/useIdeas';
import { cn } from '../utils/cn';
import api from '../services/api';
import type { Idea, IdeaEstado, IdeaTipo, IdeasResumenBandeja } from '../types/entities';

type Filtro = IdeaEstado | 'todas';

const FILTROS: { key: Filtro; label: string }[] = [
    { key: 'pendiente', label: 'Pendientes' },
    { key: 'aceptada', label: 'Aceptadas' },
    { key: 'hecha', label: 'Hechas' },
    { key: 'desechada', label: 'Desechadas' },
    { key: 'todas', label: 'Todas' },
];

/** Fila de tipo: «Todo» + los tipos de idea, con su ícono. */
const OPCIONES_TIPO: { key: IdeaTipo | 'todos'; label: string; icon?: React.ElementType }[] = [
    { key: 'todos', label: 'Todo' },
    ...(Object.keys(TIPOS) as IdeaTipo[]).map(t => ({
        key: t,
        label: t === 'idea' ? 'Ideas' : t === 'cuesta' ? 'Me cuesta' : 'No funciona',
        icon: TIPOS[t].icon as React.ElementType,
    })),
];

const RESUMEN_VACIO: IdeasResumenBandeja = { pendiente: 0, aceptada: 0, desechada: 0, hecha: 0, pendiente_mas_antigua: null };

/** Tarjeta de número de la cabecera: neutra, el número manda (design system: KPI). */
// `valor` null = todavía cargando: la cifra (y su nota) van en silueta, nunca un 0 falso (§9.4). Dentro de un botón,
// la silueta es un <span> con la clase `.silueta` (un <div> no va dentro de <button>).
const Kpi: React.FC<{ icon: React.ElementType; label: string; valor: number | null; nota?: string; activo?: boolean; onClick: () => void }> = ({ icon: Icon, label, valor, nota, activo, onClick }) => (
    // eslint-disable-next-line no-restricted-syntax -- tarjeta KPI clicable que filtra la lista; Button no soporta este layout
    <button type="button" onClick={onClick}
        className={cn('flex flex-col items-start gap-1 rounded-card border bg-card p-4 text-left transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
            activo ? 'border-brand-primary' : 'border-border')}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        {valor === null
            ? <span aria-hidden="true" className="silueta block h-7 w-12 rounded-md md:h-9" />
            : <span className="text-title md:text-headline font-bold tracking-headline text-brand-dark tabular-nums leading-none">{valor}</span>}
        {nota && (valor === null
            ? <span aria-hidden="true" className="silueta mt-0.5 block h-3 w-32 max-w-full rounded-md" />
            : <span className="text-caption text-muted-foreground">{nota}</span>)}
    </button>
);

/**
 * Bandeja de Ideas para Bóveda (`ideas.revisar`): donde Marcos y Mauricio revisan
 * las propuestas una a una. Pendientes primero y de la más antigua a la más nueva;
 * al decidir una, salta sola a la siguiente. Regla: mejoras del sistema, no mañas.
 */
const IdeasPage: React.FC = () => {
    const { hasPermission } = useAuth();
    const puedeRevisar = hasPermission('ideas.revisar');
    const pendientesStore = useIdeasPendientes();

    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [resumen, setResumen] = useState<IdeasResumenBandeja>(RESUMEN_VACIO);
    const [cargando, setCargando] = useState(true);
    // Fundido de datos solo si antes se vio el contorno (hooks/useAparecer).
    const aparece = useAparecer(cargando);
    const [filtro, setFiltro] = useState<Filtro>('pendiente');
    const [tipo, setTipo] = useState<IdeaTipo | 'todos'>('todos');
    const [busqueda, setBusqueda] = useState('');
    const [seleccionId, setSeleccionId] = useState<number | null>(null);
    const [verDetalleMovil, setVerDetalleMovil] = useState(false);
    const detalleRef = useRef<HTMLDivElement>(null);
    // Quien revisa no tiene "Buzón de ideas" en el menú (un solo botón, Marcos 20-10): si quiere
    // proponer algo, lo hace desde aquí.
    const [proponer, setProponer] = useState(false);
    const accionProponer = useMemo(() => (
        <Button variant="secondary" size="sm" onClick={() => setProponer(true)} leftIcon={<Lightbulb className="h-4 w-4" />}>
            Proponer una idea
        </Button>
    ), []);

    // Celular: al abrir una idea, el detalle ocupa la pantalla desde arriba.
    useEffect(() => {
        if (verDetalleMovil) detalleRef.current?.scrollIntoView({ block: 'start' });
    }, [verDetalleMovil, seleccionId]);

    useStandardHeader({ title: 'Ideas para Bóveda', icon: Lightbulb, badgeCount: resumen.pendiente, actions: puedeRevisar ? accionProponer : undefined });

    const cargar = useCallback(async () => {
        try {
            const res = await api.get<{ data: { ideas: Idea[]; resumen: IdeasResumenBandeja } }>('/ideas');
            setIdeas(res.data.data.ideas || []);
            setResumen(res.data.data.resumen || RESUMEN_VACIO);
            return res.data.data.ideas || [];
        } catch {
            toast.error('No se pudo cargar la bandeja de ideas');
            return [];
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { if (puedeRevisar) cargar(); }, [puedeRevisar, cargar]);

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return ideas.filter(i =>
            (filtro === 'todas' || i.estado === filtro) &&
            (tipo === 'todos' || i.tipo === tipo) &&
            (!q || [i.resumen, i.detalle, i.autor_nombre, i.pantalla_nombre, i.obra_nombre].some(t => (t || '').toLowerCase().includes(q)))
        );
    }, [ideas, filtro, tipo, busqueda]);

    // Siempre hay una seleccionada si la lista tiene algo (escritorio).
    useEffect(() => {
        if (!visibles.length) { setSeleccionId(null); return; }
        if (!visibles.some(i => i.id === seleccionId)) setSeleccionId(visibles[0].id);
    }, [visibles, seleccionId]);

    const seleccionada = ideas.find(i => i.id === seleccionId) || null;
    const parecidas = useMemo(() => (seleccionada?.pantalla_nombre
        ? ideas.filter(i => i.id !== seleccionada.id && i.pantalla_nombre === seleccionada.pantalla_nombre)
        : []), [ideas, seleccionada]);

    const alGuardar = async (actualizada: Idea, decidio: boolean) => {
        const estabaPendiente = seleccionada?.estado === 'pendiente';
        // Siguiente pendiente ANTES de recargar: la que venía después en la lista visible.
        const idx = visibles.findIndex(i => i.id === actualizada.id);
        const siguiente = visibles.slice(idx + 1).find(i => i.estado === 'pendiente') || visibles.find(i => i.estado === 'pendiente' && i.id !== actualizada.id);
        await cargar();
        pendientesStore.refetch();
        if (decidio && estabaPendiente && filtro === 'pendiente') {
            setSeleccionId(siguiente ? siguiente.id : null);
            if (!siguiente) toast.success('¡Bandeja al día! No quedan ideas pendientes.');
        } else {
            setSeleccionId(actualizada.id);
        }
    };

    if (!puedeRevisar) {
        return <EmptyState icon={Lightbulb} title="Sin acceso a la bandeja" description={`Para proponer una mejora usa "${ETIQUETA_BUZON_IDEAS}" en el menú.`} />;
    }

    const diasMasAntigua = resumen.pendiente_mas_antigua ? hace(resumen.pendiente_mas_antigua) : '';

    return (
        <div className="flex flex-col gap-5">
            {/* Números (en el celular se ocultan mientras se lee una idea) */}
            <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', verDetalleMovil && 'hidden lg:grid')}>
                <Kpi icon={Inbox} label="Pendientes" valor={cargando ? null : resumen.pendiente} activo={filtro === 'pendiente'}
                    nota={resumen.pendiente ? `La más antigua llegó ${diasMasAntigua}` : 'Bandeja al día'} onClick={() => setFiltro('pendiente')} />
                <Kpi icon={Hourglass} label="Aceptadas · por hacer" valor={cargando ? null : resumen.aceptada} activo={filtro === 'aceptada'} onClick={() => setFiltro('aceptada')} />
                <Kpi icon={CheckCheck} label="Hechas" valor={cargando ? null : resumen.hecha} activo={filtro === 'hecha'} onClick={() => setFiltro('hecha')} />
                <Kpi icon={Archive} label="Desechadas" valor={cargando ? null : resumen.desechada} activo={filtro === 'desechada'} onClick={() => setFiltro('desechada')} />
            </div>

            {/* Filtros */}
            {/* En el celular cada fila se desliza de lado en vez de apilarse en tres pisos. */}
            <div className={cn('flex flex-col md:flex-row md:items-center gap-2 md:gap-3', verDetalleMovil && 'hidden lg:flex')}>
                <div className="flex items-center min-w-0">
                    <div className="flex w-fit min-w-0 max-w-full rounded-2xl border border-border bg-card p-1">
                    <BarraPaginada>{p => (
                    <PestanasElasticas estiloOpcion={p.estiloOpcion} revelar={p.revelar}
                        opciones={FILTROS}
                        activa={filtro}
                        onCambiar={setFiltro}
                        aria-label="Estado de las ideas"
                        claseFila="gap-1"
                        claseOpcion="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 font-medium whitespace-nowrap"
                        claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                        render={(f) => (
                            <>
                                {f.label}
                                {f.key !== 'todas' && !cargando && <span className="ml-1.5 opacity-70 tabular-nums">{resumen[f.key as IdeaEstado]}</span>}
                            </>
                        )}
                    />
                    )}</BarraPaginada>
                    </div>
                </div>
                <div className="flex items-center md:ml-auto min-w-0">
                    <div className="flex w-fit min-w-0 max-w-full rounded-2xl border border-border bg-card p-1">
                    <BarraPaginada>{p => (
                        <PestanasElasticas estiloOpcion={p.estiloOpcion} revelar={p.revelar}
                            opciones={OPCIONES_TIPO}
                            activa={tipo}
                            onCambiar={setTipo}
                            aria-label="Tipo de idea"
                            claseFila="gap-1"
                            claseOpcion="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 font-medium whitespace-nowrap"
                            claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                            render={(o) => {
                                const Icono = o.icon;
                                return (
                                    <>
                                        {Icono && <Icono className="h-3.5 w-3.5" />}
                                        {o.label}
                                    </>
                                );
                            }}
                        />
                    )}</BarraPaginada>
                    </div>
                </div>
                <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar idea, persona, pantalla…" className="md:w-64" />
            </div>

            {cargando ? (
                // Lista (ícono del tipo, título, quién · pantalla, cuándo) y, en el computador, el detalle de la primera.
                <Cargando que="las ideas" className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-4 items-start">
                    <ul className="flex flex-col gap-2" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map(i => (
                            <li key={i} className="flex items-start gap-3 rounded-card border border-border bg-card p-3.5">
                                <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <Skeleton className={cn('h-4', i % 2 ? 'w-3/5' : 'w-4/5')} />
                                    <Skeleton className="h-3 w-1/2" />
                                    <div className="flex gap-1.5 pt-0.5"><Skeleton className="h-2.5 w-14" /><Skeleton className="h-2.5 w-20" /></div>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="hidden lg:flex flex-col gap-4" aria-hidden="true">
                        <section className="rounded-card border border-border bg-card p-4 md:p-5">
                            <div className="flex items-start gap-3">
                                <SkeletonCirculo className="h-11 w-11" />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-5 w-20 rounded-full" /></div>
                                    <Skeleton className="h-3 w-56 max-w-full" />
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {['w-20', 'w-28', 'w-24', 'w-32'].map(w => <Skeleton key={w} className={cn('h-6 rounded-full', w)} />)}
                            </div>
                        </section>
                        <section className="space-y-2.5 rounded-card border border-border bg-card p-4 md:p-5">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </section>
                        <section className="space-y-3 rounded-card border border-border bg-card p-4">
                            <Skeleton className="h-3 w-40" />
                            <Skeleton className="h-16 w-full rounded-xl" />
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-16 w-full rounded-xl" />
                        </section>
                    </div>
                </Cargando>
            ) : !visibles.length ? (
                <EmptyState
                    icon={filtro === 'pendiente' ? CheckCheck : Inbox}
                    title={filtro === 'pendiente' ? 'Bandeja al día' : 'Nada por aquí'}
                    description={filtro === 'pendiente' ? 'No quedan ideas pendientes de revisar.' : 'No hay ideas con este filtro.'}
                />
            ) : (
                // `grid-cols-1` (= minmax(0,1fr)) en el teléfono: con la columna implícita `auto`, un texto sin espacios
                // (una URL, «DESPIHAJD…» de 46 letras) la estiraba a 900 px y el detalle se salía de la pantalla.
                <div className={cn('grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-4 items-start', aparece)}>
                    {/* Lista */}
                    <ul className={cn('flex flex-col gap-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1', verDetalleMovil && 'hidden lg:flex')}>
                        {visibles.map(i => {
                            const t = TIPOS[i.tipo];
                            const Icon = t.icon;
                            const imp = impacto(i);
                            const activa = i.id === seleccionId;
                            return (
                                <li key={i.id}>
                                    {/* eslint-disable-next-line no-restricted-syntax -- tarjeta de lista seleccionable (ícono, título, metadatos, chips); Button no soporta este layout */}
                                    <button type="button"
                                        onClick={() => { setSeleccionId(i.id); setVerDetalleMovil(true); }}
                                        className={cn('w-full flex items-start gap-3 rounded-card border bg-card p-3.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                            activa ? 'border-brand-primary shadow-sm' : 'border-border hover:border-muted-foreground/30')}>
                                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', i.tipo === 'falla' ? 'bg-destructive/10' : 'bg-muted')}>
                                            <Icon className={cn('h-4 w-4', i.tipo === 'falla' ? 'text-destructive' : 'text-muted-foreground')} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-brand-dark leading-snug line-clamp-2">{i.resumen}</span>
                                            <span className="block text-caption text-muted-foreground mt-1 truncate">
                                                {primerNombre(i.autor_nombre)}{i.autor_rol ? ` · ${i.autor_rol}` : ''} · {i.pantalla_nombre || 'Bóveda'}
                                            </span>
                                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                <span className="inline-flex items-center gap-1 text-micro text-muted-foreground"><Clock className="h-3 w-3" />{hace(i.created_at)}</span>
                                                {imp.nivel && <span className="inline-flex items-center gap-1 text-micro text-muted-foreground"><Gauge className="h-3 w-3" />impacto {imp.nivel}</span>}
                                                {imp.posiblePreferencia && <span className="inline-flex items-center gap-1 text-micro font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3 w-3" />¿preferencia?</span>}
                                                {filtro === 'todas' && <EstadoPill tone={ESTADOS[i.estado].tone}>{ESTADOS[i.estado].label}</EstadoPill>}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {/* Detalle */}
                    <div ref={detalleRef} className={cn('scroll-mt-4', !verDetalleMovil && 'hidden lg:block')}>
                        {seleccionada && (
                            <IdeaDetalle
                                key={seleccionada.id}
                                idea={seleccionada}
                                parecidas={parecidas}
                                onSeleccionar={id => { setSeleccionId(id); setVerDetalleMovil(true); }}
                                onGuardado={alGuardar}
                                onVolver={() => setVerDetalleMovil(false)}
                            />
                        )}
                    </div>
                </div>
            )}
            <ProponerMejoraModal isOpen={proponer} onClose={() => setProponer(false)} />
        </div>
    );
};

export default IdeasPage;
