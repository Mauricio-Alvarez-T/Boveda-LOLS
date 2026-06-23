import React, { useMemo, useState } from 'react';
import { BookOpen, Search, Clock, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import { cn } from '../utils/cn';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressBar } from '../components/ui/ProgressBar';
import { showConfirmToast } from '../utils/toastUtils';
import { JourneyRunner } from '../components/ayuda/journey/JourneyRunner';
import { AsistenciaJourneyRunner } from '../components/ayuda/asistencia/AsistenciaJourneyRunner';
import { VehiculosJourneyRunner } from '../components/ayuda/vehiculos/VehiculosJourneyRunner';
import { JOURNEYS, type JourneyDef } from '../components/ayuda/journey/journeys';
import { useTutorialProgreso } from '../hooks/ayuda/useTutorialProgreso';

/**
 * Centro de ayuda. Tutoriales organizados por FLUJO DE TRABAJO (end-to-end): cada
 * recorrido (`JourneyRunner`) usa las PANTALLAS REALES de la app con datos de
 * ejemplo, guiando crear → aprobar → recibir con texto entre pasos. Visible para
 * todos los usuarios. Muestra el progreso del usuario (cross-device).
 */

const headerTitle = (
    <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-brand-primary" />
        <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-bold text-brand-dark">Centro de ayuda</h1>
            <p className="text-muted-foreground text-xs">Aprende a usar Bóveda LOLS paso a paso</p>
        </div>
    </div>
);

const JourneyCard: React.FC<{ journey: JourneyDef; completado: boolean; onOpen: () => void }> = ({ journey, completado, onOpen }) => {
    const Icon = journey.icon;
    const disponible = journey.estado === 'disponible';
    return (
        // eslint-disable-next-line no-restricted-syntax -- tarjeta-acción (toda la card es clickable; no encaja en Button)
        <button
            type="button"
            onClick={disponible ? onOpen : undefined}
            disabled={!disponible}
            className={cn(
                'group flex flex-col text-left rounded-card border p-5 transition-all h-full',
                completado ? 'border-success bg-success/5 shadow-sm' : 'border-border bg-card',
                disponible
                    ? 'hover:border-brand-primary/40 hover:shadow-sm cursor-pointer'
                    : 'opacity-70 cursor-default'
            )}
        >
            <div className="flex items-center justify-between">
                <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center', completado ? 'bg-success/15' : 'bg-muted')}>
                    <Icon className={cn('h-5 w-5 transition-colors', completado ? 'text-success' : 'text-muted-foreground group-hover:text-brand-primary')} />
                </div>
                {completado ? (
                    <span className="inline-flex items-center gap-1 text-label font-bold text-success bg-success/10 rounded-full px-2.5 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Completado
                    </span>
                ) : disponible ? (
                    <span className="text-label font-bold text-success bg-success/10 rounded-full px-2.5 py-1">Disponible</span>
                ) : (
                    <span className="text-label font-bold text-muted-foreground bg-muted rounded-full px-2.5 py-1">Próximamente</span>
                )}
            </div>

            <p className="text-caption font-bold uppercase tracking-widest text-muted-foreground mt-4">{journey.modulo}</p>
            <h3 className="text-title-sm font-bold text-brand-dark leading-snug mt-0.5">{journey.titulo}</h3>
            <p className="text-caption text-muted-foreground mt-1.5 flex-1">{journey.descripcion}</p>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                {journey.duracion ? (
                    <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {journey.duracion}
                    </span>
                ) : <span />}
                {disponible && (
                    <span className="inline-flex items-center gap-1 text-caption font-bold text-brand-primary">
                        {completado ? 'Repetir' : 'Empezar'} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                )}
            </div>
        </button>
    );
};

const CentroAyuda: React.FC = () => {
    useSetPageHeader(headerTitle);

    const { completados, marcar, reiniciar, isCompleto } = useTutorialProgreso();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [cat, setCat] = useState<string | null>(null);

    const categorias = useMemo(() => Array.from(new Set(JOURNEYS.map(j => j.modulo))), []);

    // Avance global (solo disponibles) + por categoría.
    const disponibles = useMemo(() => JOURNEYS.filter(j => j.estado === 'disponible'), []);
    const completadosDisp = disponibles.filter(j => isCompleto(j.id)).length;
    const catProg = useMemo(() => {
        const m: Record<string, { disp: number; comp: number }> = {};
        JOURNEYS.forEach(j => {
            if (!m[j.modulo]) m[j.modulo] = { disp: 0, comp: 0 };
            if (j.estado === 'disponible') { m[j.modulo].disp++; if (completados[j.id]) m[j.modulo].comp++; }
        });
        return m;
    }, [completados]);

    const filtradas = useMemo(() => {
        const q = query.trim().toLowerCase();
        return JOURNEYS.filter(j => {
            if (cat && j.modulo !== cat) return false;
            if (q) {
                const hay = `${j.titulo} ${j.descripcion} ${j.modulo}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [query, cat]);

    const selected = selectedId ? JOURNEYS.find(j => j.id === selectedId) || null : null;

    if (selected && selected.estado === 'disponible') {
        const props = {
            journey: selected,
            completadoAt: completados[selected.id],
            onCompletar: marcar,
            onExit: () => setSelectedId(null),
        };
        if (selected.runner === 'asistencia') return <AsistenciaJourneyRunner {...props} />;
        if (selected.runner === 'vehiculos') return <VehiculosJourneyRunner {...props} />;
        return <JourneyRunner {...props} />;
    }

    const pedirReinicio = () => showConfirmToast({
        message: '¿Reiniciar tu progreso de tutoriales?',
        confirmLabel: 'Sí, reiniciar',
        cancelLabel: 'No',
        onConfirm: async () => { await reiniciar(); },
    });

    return (
        <div className="w-full max-w-6xl mx-auto space-y-5">
            {/* Intro */}
            <div>
                <h2 className="text-headline font-bold text-brand-dark">¿Con qué te ayudamos hoy?</h2>
                <p className="text-body text-muted-foreground mt-1">
                    Elige un flujo de trabajo y recórrelo paso a paso sobre la app real. Iremos sumando más recorridos de a poco.
                </p>
            </div>

            {/* Resumen de avance */}
            {disponibles.length > 0 && (
                <div className="rounded-card border border-border bg-card p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-caption font-bold text-brand-dark mb-1.5">
                            Tu progreso: {completadosDisp} de {disponibles.length} completados
                        </p>
                        <ProgressBar recibido={completadosDisp} pendiente={disponibles.length - completadosDisp} showLabel />
                    </div>
                    {completadosDisp > 0 && (
                        // eslint-disable-next-line no-restricted-syntax -- enlace de acción secundaria (texto)
                        <button
                            type="button"
                            onClick={pedirReinicio}
                            className="shrink-0 inline-flex items-center gap-1.5 text-caption font-bold text-muted-foreground hover:text-destructive transition-colors"
                        >
                            <RotateCcw className="h-3.5 w-3.5" /> Reiniciar
                        </button>
                    )}
                </div>
            )}

            {/* Buscador + filtros */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar un tutorial..."
                        className="w-full h-11 pl-9 pr-3 text-sm bg-card border border-input rounded-control outline-none focus:ring-2 focus:ring-brand-primary/40 focus:border-brand-primary"
                    />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {/* eslint-disable-next-line no-restricted-syntax -- chip de filtro (selector segmentado) */}
                    <button
                        type="button"
                        onClick={() => setCat(null)}
                        className={cn(
                            'shrink-0 px-3 h-8 rounded-full text-caption font-bold border transition-colors',
                            cat === null ? 'bg-brand-primary text-white border-brand-primary' : 'bg-card text-muted-foreground border-border hover:border-brand-primary/40'
                        )}
                    >
                        Todas
                    </button>
                    {categorias.map(c => {
                        const cp = catProg[c];
                        return (
                            // eslint-disable-next-line no-restricted-syntax -- chip de filtro (selector segmentado)
                            <button
                                key={c}
                                type="button"
                                onClick={() => setCat(c)}
                                className={cn(
                                    'shrink-0 px-3 h-8 rounded-full text-caption font-bold border transition-colors whitespace-nowrap',
                                    cat === c ? 'bg-brand-primary text-white border-brand-primary' : 'bg-card text-muted-foreground border-border hover:border-brand-primary/40'
                                )}
                            >
                                {c}{cp && cp.disp > 0 ? ` · ${cp.comp}/${cp.disp}` : ''}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Grid de tutoriales */}
            {filtradas.length === 0 ? (
                <EmptyState
                    icon={BookOpen}
                    title="No encontramos tutoriales"
                    description="Prueba con otra palabra o quita el filtro de categoría."
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtradas.map(j => (
                        <JourneyCard key={j.id} journey={j} completado={isCompleto(j.id)} onOpen={() => setSelectedId(j.id)} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default CentroAyuda;
