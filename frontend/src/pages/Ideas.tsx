import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Lightbulb, Inbox, Hourglass, CheckCheck, Archive, Clock, Gauge, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStandardHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { EstadoPill } from '../components/ideas/Meta';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchBar } from '../components/ui/SearchBar';
import { PestanasElasticas } from '../components/ui/PestanasElasticas';
import { IdeaDetalle } from '../components/ideas/IdeaDetalle';
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

const RESUMEN_VACIO: IdeasResumenBandeja = { pendiente: 0, aceptada: 0, desechada: 0, hecha: 0, pendiente_mas_antigua: null };

/** Tarjeta de número de la cabecera: neutra, el número manda (design system: KPI). */
const Kpi: React.FC<{ icon: React.ElementType; label: string; valor: number; nota?: string; activo?: boolean; onClick: () => void }> = ({ icon: Icon, label, valor, nota, activo, onClick }) => (
    // eslint-disable-next-line no-restricted-syntax -- tarjeta KPI clicable que filtra la lista; Button no soporta este layout
    <button type="button" onClick={onClick}
        className={cn('flex flex-col items-start gap-1 rounded-card border bg-card p-4 text-left transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
            activo ? 'border-brand-primary' : 'border-border')}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <span className="text-title md:text-headline font-bold tracking-headline text-brand-dark tabular-nums leading-none">{valor}</span>
        {nota && <span className="text-caption text-muted-foreground">{nota}</span>}
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
    const [filtro, setFiltro] = useState<Filtro>('pendiente');
    const [tipo, setTipo] = useState<IdeaTipo | 'todos'>('todos');
    const [busqueda, setBusqueda] = useState('');
    const [seleccionId, setSeleccionId] = useState<number | null>(null);
    const [verDetalleMovil, setVerDetalleMovil] = useState(false);
    const detalleRef = useRef<HTMLDivElement>(null);

    // Celular: al abrir una idea, el detalle ocupa la pantalla desde arriba.
    useEffect(() => {
        if (verDetalleMovil) detalleRef.current?.scrollIntoView({ block: 'start' });
    }, [verDetalleMovil, seleccionId]);

    useStandardHeader({ title: 'Ideas para Bóveda', icon: Lightbulb, badgeCount: resumen.pendiente });

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
                <Kpi icon={Inbox} label="Pendientes" valor={resumen.pendiente} activo={filtro === 'pendiente'}
                    nota={resumen.pendiente ? `La más antigua llegó ${diasMasAntigua}` : 'Bandeja al día'} onClick={() => setFiltro('pendiente')} />
                <Kpi icon={Hourglass} label="Aceptadas · por hacer" valor={resumen.aceptada} activo={filtro === 'aceptada'} onClick={() => setFiltro('aceptada')} />
                <Kpi icon={CheckCheck} label="Hechas" valor={resumen.hecha} activo={filtro === 'hecha'} onClick={() => setFiltro('hecha')} />
                <Kpi icon={Archive} label="Desechadas" valor={resumen.desechada} activo={filtro === 'desechada'} onClick={() => setFiltro('desechada')} />
            </div>

            {/* Filtros */}
            {/* En el celular cada fila se desliza de lado en vez de apilarse en tres pisos. */}
            <div className={cn('flex flex-col md:flex-row md:items-center gap-2 md:gap-3', verDetalleMovil && 'hidden lg:flex')}>
                <div className="flex items-center overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0 [scrollbar-width:none]">
                    {/* Misma caja que un `Button size="sm"` (h-9, px-3, gap-1.5, rounded-full → radio 18), sin su whileTap. */}
                    <PestanasElasticas
                        opciones={FILTROS}
                        activa={filtro}
                        onCambiar={setFiltro}
                        aria-label="Estado de las ideas"
                        claseFila="gap-1"
                        claseOpcion="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 font-medium whitespace-nowrap"
                        claseInactiva="text-brand-dark hover:bg-black/5"
                        radio={18}
                        render={(f) => (
                            <>
                                {f.label}
                                {f.key !== 'todas' && <span className="ml-1.5 opacity-70 tabular-nums">{resumen[f.key as IdeaEstado]}</span>}
                            </>
                        )}
                    />
                </div>
                <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0 md:ml-auto [scrollbar-width:none]">
                    <Button size="sm" className="shrink-0" variant={tipo === 'todos' ? 'secondary' : 'ghost'} onClick={() => setTipo('todos')}>Todo</Button>
                    {(Object.keys(TIPOS) as IdeaTipo[]).map(t => {
                        const Icon = TIPOS[t].icon;
                        return (
                            <Button key={t} size="sm" className="shrink-0" variant={tipo === t ? 'secondary' : 'ghost'} onClick={() => setTipo(t)} leftIcon={<Icon className="h-3.5 w-3.5" />}>
                                {t === 'idea' ? 'Ideas' : t === 'cuesta' ? 'Me cuesta' : 'No funciona'}
                            </Button>
                        );
                    })}
                </div>
                <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar idea, persona, pantalla…" className="md:w-64" />
            </div>

            {cargando ? (
                <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-4">
                    <div className="animate-pulse rounded-card border border-border bg-card h-96" />
                    <div className="hidden lg:block animate-pulse rounded-card border border-border bg-card h-96" />
                </div>
            ) : !visibles.length ? (
                <EmptyState
                    icon={filtro === 'pendiente' ? CheckCheck : Inbox}
                    title={filtro === 'pendiente' ? 'Bandeja al día' : 'Nada por aquí'}
                    description={filtro === 'pendiente' ? 'No quedan ideas pendientes de revisar.' : 'No hay ideas con este filtro.'}
                />
            ) : (
                <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-4 items-start">
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
        </div>
    );
};

export default IdeasPage;
