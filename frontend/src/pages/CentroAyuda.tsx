import React, { useMemo, useState } from 'react';
import { BookOpen, Search, Clock, ArrowRight } from 'lucide-react';
import { cn } from '../utils/cn';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { EmptyState } from '../components/ui/EmptyState';
import { GuiaDetalle } from '../components/ayuda/GuiaDetalle';
import { GUIAS, type Guia } from '../components/ayuda/guiasData';

/**
 * Centro de ayuda (Etapa 1 — cascarón). Catálogo de guías por módulo + detalle
 * paso a paso in-page. Visible para todos los usuarios. El contenido es
 * provisional (datos en `components/ayuda/guiasData.ts`) hasta definir el estilo
 * final; el cascarón (nav + página + layout de guía) queda estable.
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

const GuiaCard: React.FC<{ guia: Guia; onOpen: () => void }> = ({ guia, onOpen }) => {
    const Icon = guia.icon;
    const disponible = guia.estado === 'disponible';
    return (
        // eslint-disable-next-line no-restricted-syntax -- tarjeta-acción (toda la card es clickable; no encaja en Button)
        <button
            type="button"
            onClick={disponible ? onOpen : undefined}
            disabled={!disponible}
            className={cn(
                'group flex flex-col text-left rounded-card border border-border bg-card p-5 transition-all h-full',
                disponible
                    ? 'hover:border-brand-primary/40 hover:shadow-sm cursor-pointer'
                    : 'opacity-70 cursor-default'
            )}
        >
            <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-brand-primary transition-colors" />
                </div>
                {disponible ? (
                    <span className="text-label font-bold text-success bg-success/10 rounded-full px-2.5 py-1">Disponible</span>
                ) : (
                    <span className="text-label font-bold text-muted-foreground bg-muted rounded-full px-2.5 py-1">Próximamente</span>
                )}
            </div>

            <p className="text-caption font-bold uppercase tracking-widest text-muted-foreground mt-4">{guia.modulo}</p>
            <h3 className="text-title-sm font-bold text-brand-dark leading-snug mt-0.5">{guia.titulo}</h3>
            <p className="text-caption text-muted-foreground mt-1.5 flex-1">{guia.descripcion}</p>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                {guia.duracion ? (
                    <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {guia.duracion}
                    </span>
                ) : <span />}
                {disponible && (
                    <span className="inline-flex items-center gap-1 text-caption font-bold text-brand-primary">
                        Ver guía <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                )}
            </div>
        </button>
    );
};

const CentroAyuda: React.FC = () => {
    useSetPageHeader(headerTitle);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [cat, setCat] = useState<string | null>(null);

    const categorias = useMemo(() => Array.from(new Set(GUIAS.map(g => g.modulo))), []);

    const filtradas = useMemo(() => {
        const q = query.trim().toLowerCase();
        return GUIAS.filter(g => {
            if (cat && g.modulo !== cat) return false;
            if (q) {
                const hay = `${g.titulo} ${g.descripcion} ${g.modulo}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [query, cat]);

    const selected = selectedId ? GUIAS.find(g => g.id === selectedId) || null : null;

    if (selected) {
        return (
            <div className="w-full max-w-3xl mx-auto">
                <GuiaDetalle guia={selected} onBack={() => setSelectedId(null)} />
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto space-y-5">
            {/* Intro */}
            <div>
                <h2 className="text-headline font-bold text-brand-dark">¿Con qué te ayudamos hoy?</h2>
                <p className="text-body text-muted-foreground mt-1">
                    Elige un apartado y sigue la guía paso a paso. Iremos sumando más guías de a poco.
                </p>
            </div>

            {/* Buscador + filtros */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar una guía..."
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
                    {categorias.map(c => (
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
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid de guías */}
            {filtradas.length === 0 ? (
                <EmptyState
                    icon={BookOpen}
                    title="No encontramos guías"
                    description="Prueba con otra palabra o quita el filtro de categoría."
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtradas.map(g => (
                        <GuiaCard key={g.id} guia={g} onOpen={() => setSelectedId(g.id)} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default CentroAyuda;
