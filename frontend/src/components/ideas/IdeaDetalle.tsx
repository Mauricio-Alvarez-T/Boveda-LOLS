import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    MapPin, Building2, Smartphone, Monitor, Clock, Check, X, CheckCheck, RotateCcw, Loader2,
    AlertTriangle, Gauge, StickyNote, MessageSquareText, ArrowLeft, Link2, Mail,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Meta, EstadoPill } from './Meta';
import { FotoIdea } from './FotoIdea';
import { cn } from '../../utils/cn';
import api from '../../services/api';
import type { Idea, IdeaEstado, IdeaMotivo } from '../../types/entities';
import {
    TIPOS, ESTADOS, MOTIVOS, FRECUENCIAS, ALCANCES, ALCANCES_IDEA, BENEFICIOS, CRITERIOS,
    impacto, unSoloTexto, hace, fechaCorta, primerNombre,
} from './ideasConfig';

interface Props {
    idea: Idea;
    /** Otras ideas desde la misma pantalla (para detectar repetidas). */
    parecidas: Idea[];
    onSeleccionar: (id: number) => void;
    /** Tras guardar: `decidio` = cambió el estado (para pasar a la siguiente pendiente). */
    onGuardado: (idea: Idea, decidio: boolean) => void;
    /** Solo móvil: volver a la lista. */
    onVolver?: () => void;
}

const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';
const ETIQUETA = 'block text-micro font-bold text-muted-foreground uppercase tracking-wider mb-1.5';

/**
 * Detalle de una idea en la bandeja de revisión (Marcos y Mauricio).
 * Está pensado para ir "una a una": leer, pasar los cinco criterios, responder
 * y decidir; al decidir una pendiente, la bandeja salta sola a la siguiente.
 */
export const IdeaDetalle: React.FC<Props> = ({ idea, parecidas, onSeleccionar, onGuardado, onVolver }) => {
    const [respuesta, setRespuesta] = useState(idea.respuesta || '');
    const [nota, setNota] = useState(idea.nota_interna || '');
    const [criterios, setCriterios] = useState<boolean[]>(() => CRITERIOS.map(() => false));
    const [desechando, setDesechando] = useState(false);
    const [motivo, setMotivo] = useState<IdeaMotivo | null>(null);
    const [guardando, setGuardando] = useState<string | null>(null);
    const motivosRef = useRef<HTMLElement>(null);

    // Al pedir "Desechar…", los motivos quedan a la vista (están debajo de la respuesta).
    useEffect(() => {
        if (desechando) motivosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [desechando]);

    // Cambió la idea seleccionada: todo vuelve a su estado.
    useEffect(() => {
        setRespuesta(idea.respuesta || '');
        setNota(idea.nota_interna || '');
        setCriterios(CRITERIOS.map(() => false));
        setDesechando(false);
        setMotivo(null);
    }, [idea.id, idea.respuesta, idea.nota_interna]);

    const tipo = TIPOS[idea.tipo];
    const TipoIcon = tipo.icon;
    const est = ESTADOS[idea.estado];
    const imp = impacto(idea);
    const nombre = primerNombre(idea.autor_nombre);
    const notasCambiaron = respuesta !== (idea.respuesta || '') || nota !== (idea.nota_interna || '');

    const guardar = async (accion: string, cuerpo: { estado?: IdeaEstado; motivo?: IdeaMotivo }) => {
        setGuardando(accion);
        try {
            const res = await api.patch<{ data: Idea }>(`/ideas/${idea.id}`, { ...cuerpo, respuesta, nota_interna: nota });
            onGuardado(res.data.data, !!cuerpo.estado);
            if (cuerpo.estado) toast.success(`Idea ${ESTADOS[cuerpo.estado].label.toLowerCase()}`);
            else toast.success('Notas guardadas');
        } catch (e) {
            toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'No se pudo guardar');
        } finally {
            setGuardando(null);
        }
    };

    const elegirMotivo = (m: IdeaMotivo) => {
        setMotivo(m);
        // Si todavía no escribieron nada, se propone el texto del motivo para editarlo.
        if (!respuesta.trim() || Object.values(MOTIVOS).some(x => x.sugerencia === respuesta)) {
            setRespuesta(MOTIVOS[m].sugerencia);
        }
    };

    const marcados = criterios.filter(Boolean).length;

    return (
        <article className="flex flex-col gap-4">
            {onVolver && (
                <Button variant="ghost" size="sm" className="self-start lg:hidden" onClick={onVolver} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                    Volver a la lista
                </Button>
            )}

            {/* Quién y desde dónde */}
            <section className="rounded-card border border-border bg-card p-4 md:p-5">
                <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-base font-bold text-brand-dark">
                        {(idea.autor_nombre || '?')[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h2 className="text-base font-bold text-brand-dark">{idea.autor_nombre}</h2>
                            <EstadoPill tone={est.tone}>{est.label}</EstadoPill>
                            <span className="text-caption text-muted-foreground tabular-nums">#{idea.id}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span>{idea.autor_rol || 'Sin rol'}</span>
                            {idea.autor_email && (
                                <a href={`mailto:${idea.autor_email}`} className="inline-flex items-center gap-1 hover:text-brand-primary">
                                    <Mail className="h-3 w-3" />{idea.autor_email}
                                </a>
                            )}
                        </p>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    <Meta icon={<TipoIcon className="h-3 w-3" />} tono={idea.tipo === 'falla' ? 'peligro' : 'neutro'}>
                        {tipo.label}
                    </Meta>
                    <Meta icon={<MapPin className="h-3 w-3" />}>{idea.pantalla_nombre || 'Bóveda'}</Meta>
                    {idea.obra_nombre && <Meta icon={<Building2 className="h-3 w-3" />}>{idea.obra_nombre}</Meta>}
                    {idea.dispositivo && (
                        <Meta icon={idea.dispositivo === 'movil' ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}>
                            {idea.dispositivo === 'movil' ? 'Celular' : 'Computador'}
                        </Meta>
                    )}
                    <Meta icon={<Clock className="h-3 w-3" />}>{fechaCorta(idea.created_at)} · {hace(idea.created_at)}</Meta>
                </div>
            </section>

            {/* Lo que propone */}
            <section className="rounded-card border border-border bg-card p-4 md:p-5">
                {unSoloTexto(idea) ? (
                    // Desde el 20-10 llega en un solo texto (el título es su primera línea).
                    <>
                        <p className={ETIQUETA}>{idea.tipo === 'falla' ? 'Qué pasó' : idea.tipo === 'idea' ? 'Qué se le ocurre' : 'Qué le cuesta'}</p>
                        <p className="text-base text-brand-dark leading-relaxed whitespace-pre-wrap break-words">{idea.detalle}</p>
                    </>
                ) : (
                    <>
                        <p className={ETIQUETA}>{idea.tipo === 'falla' ? 'Qué estaba haciendo' : idea.tipo === 'idea' ? 'Qué se le ocurre' : 'Qué le gustaría que cambie'}</p>
                        <h3 className="text-title-sm font-bold tracking-tight text-brand-dark leading-snug break-words">{idea.resumen}</h3>

                        <p className={`${ETIQUETA} mt-4`}>{idea.tipo === 'falla' ? 'Qué pasó' : idea.tipo === 'idea' ? 'Cómo se lo imagina' : 'Qué le cuesta o no entiende'}</p>
                        <p className="text-sm text-brand-dark leading-relaxed whitespace-pre-wrap break-words">{idea.detalle}</p>
                    </>
                )}

                {idea.esperado && idea.tipo !== 'cuesta' && (
                    <>
                        <p className={`${ETIQUETA} mt-4`}>{idea.tipo === 'falla' ? 'Qué esperaba' : 'Cómo lo hace hoy, sin esto'}</p>
                        <p className="text-sm text-brand-dark leading-relaxed whitespace-pre-wrap break-words">{idea.esperado}</p>
                    </>
                )}

                {/* Las señales solo vienen en las ideas de antes del 20-10 (el formulario ya no las pide). */}
                {idea.tipo !== 'falla' && (idea.frecuencia || idea.alcance || idea.beneficio) && (
                    <div className="mt-4 pt-4 border-t border-border">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {idea.frecuencia && <Meta>{FRECUENCIAS[idea.frecuencia]}</Meta>}
                            {idea.alcance && <Meta>{idea.tipo === 'idea' ? `Lo usaría: ${ALCANCES_IDEA[idea.alcance].toLowerCase()}` : ALCANCES[idea.alcance]}</Meta>}
                            {idea.beneficio && <Meta>{BENEFICIOS[idea.beneficio]}</Meta>}
                            {imp.nivel && (
                                <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-dark">
                                    <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                                    Impacto {imp.nivel}
                                </span>
                            )}
                        </div>
                        {imp.posiblePreferencia && (
                            <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                {idea.tipo === 'idea'
                                    ? <>Solo la usaría {nombre || 'esta persona'} y de vez en cuando: revisa si es una mejora para el sistema o una preferencia.</>
                                    : <>Solo le pasa a {nombre || 'esta persona'} y de vez en cuando: revisa si es un problema del sistema o una preferencia.</>}
                            </p>
                        )}
                    </div>
                )}
            </section>

            {/* Foto o captura que mandó */}
            {idea.tiene_foto && (
                <section className="rounded-card border border-border bg-card p-4">
                    <p className={ETIQUETA}>Foto que adjuntó</p>
                    <FotoIdea ideaId={idea.id} resumen={idea.resumen} tamano={idea.foto_bytes} />
                </section>
            )}

            {/* Parecidas: misma pantalla */}
            {parecidas.length > 0 && (
                <section className="rounded-card border border-border bg-card p-4">
                    <p className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        <Link2 className="h-3 w-3" /> También desde {idea.pantalla_nombre}
                    </p>
                    <ul className="flex flex-col gap-1">
                        {parecidas.slice(0, 3).map(p => (
                            <li key={p.id}>
                                {/* eslint-disable-next-line no-restricted-syntax -- fila clicable con texto truncado y chip; Button no soporta este layout */}
                                <button type="button" onClick={() => onSeleccionar(p.id)}
                                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors">
                                    <span className="text-xs text-brand-dark truncate flex-1 min-w-0">{p.resumen}</span>
                                    <span className="text-micro text-muted-foreground shrink-0">{primerNombre(p.autor_nombre)}</span>
                                    <EstadoPill tone={ESTADOS[p.estado].tone}>{ESTADOS[p.estado].label}</EstadoPill>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Antes de decidir */}
            {(idea.estado === 'pendiente' || idea.estado === 'aceptada') && idea.tipo !== 'falla' && (
                <section className="rounded-card border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-micro font-bold uppercase tracking-wider text-muted-foreground">Antes de decidir</p>
                        <span className="text-micro font-bold text-muted-foreground tabular-nums">{marcados}/{CRITERIOS.length}</span>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                        {CRITERIOS.map((c, i) => (
                            <li key={c}>
                                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                    <input type="checkbox" checked={criterios[i]}
                                        onChange={() => setCriterios(prev => prev.map((v, j) => (j === i ? !v : v)))}
                                        className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--color-brand-primary)]" />
                                    <span className={cn('text-xs leading-snug', criterios[i] ? 'text-brand-dark' : 'text-muted-foreground')}>{c}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-micro text-muted-foreground/80">Ayuda para decidir parejo; no se guarda.</p>
                </section>
            )}

            {/* Respuesta y nota interna */}
            <section className="rounded-card border border-border bg-card p-4 flex flex-col gap-3">
                <div>
                    <label htmlFor="idea-respuesta" className={`${ETIQUETA} flex items-center gap-1`}>
                        <MessageSquareText className="h-3 w-3" /> Respuesta para {nombre || 'el autor'} <span className="normal-case tracking-normal font-normal">· la ve en "Mis ideas"</span>
                    </label>
                    <textarea id="idea-respuesta" rows={2} value={respuesta} onChange={e => setRespuesta(e.target.value)} maxLength={1000}
                        placeholder="Ej: Buena idea, la vamos a hacer en las próximas semanas." className={CAMPO} />
                </div>
                <div>
                    <label htmlFor="idea-nota" className={`${ETIQUETA} flex items-center gap-1`}>
                        <StickyNote className="h-3 w-3" /> Nota interna <span className="normal-case tracking-normal font-normal">· solo ustedes dos</span>
                    </label>
                    <textarea id="idea-nota" rows={2} value={nota} onChange={e => setNota(e.target.value)} maxLength={1000}
                        placeholder="Ej: La toma Mauricio; tocar el footer del modal de asistencia." className={CAMPO} />
                </div>
                {notasCambiaron && (
                    <Button variant="secondary" size="sm" className="self-end" onClick={() => guardar('notas', {})} disabled={!!guardando}
                        leftIcon={guardando === 'notas' ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
                        Guardar sin decidir
                    </Button>
                )}
            </section>

            {/* Desechar: motivo obligatorio */}
            {desechando && (
                <section ref={motivosRef} className="rounded-card border border-border bg-card p-4">
                    <p className="text-micro font-bold uppercase tracking-wider text-muted-foreground mb-2">¿Por qué no?</p>
                    <div className="flex flex-col gap-1.5">
                        {(Object.keys(MOTIVOS) as IdeaMotivo[]).map(m => (
                            <Button key={m} variant={motivo === m ? 'primary' : 'secondary'} size="sm" className="justify-start text-left h-auto py-2 text-xs"
                                onClick={() => elegirMotivo(m)} aria-pressed={motivo === m}>
                                {MOTIVOS[m].label}
                            </Button>
                        ))}
                    </div>
                    <p className="mt-2 text-micro text-muted-foreground">La respuesta de arriba se rellena con un texto sugerido: ajústalo antes de confirmar.</p>
                </section>
            )}

            {/* Decisión */}
            <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-2 bg-gradient-to-t from-background via-background to-transparent">
                <div className="flex flex-wrap items-center justify-end gap-2 rounded-card border border-border bg-card p-3 shadow-sm">
                    {idea.revisor_nombre && idea.revisado_en && (
                        <span className="mr-auto text-caption text-muted-foreground">
                            Revisada por {primerNombre(idea.revisor_nombre)} · {fechaCorta(idea.revisado_en)}
                        </span>
                    )}

                    {desechando ? (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => { setDesechando(false); setMotivo(null); }}>Cancelar</Button>
                            {/* Neutro, no verde: desechar no es la acción "buena" de la pantalla (y es reversible). */}
                            <Button variant="secondary" size="sm" disabled={!motivo || !!guardando} onClick={() => motivo && guardar('desechar', { estado: 'desechada', motivo })}
                                leftIcon={guardando === 'desechar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}>
                                Confirmar: desechar
                            </Button>
                        </>
                    ) : idea.estado === 'pendiente' ? (
                        <>
                            <Button variant="secondary" size="sm" onClick={() => setDesechando(true)} leftIcon={<X className="h-4 w-4" />}>Desechar…</Button>
                            <Button size="sm" disabled={!!guardando} onClick={() => guardar('aceptar', { estado: 'aceptada' })}
                                leftIcon={guardando === 'aceptar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}>
                                Aceptar
                            </Button>
                        </>
                    ) : idea.estado === 'aceptada' ? (
                        <>
                            <Button variant="ghost" size="sm" disabled={!!guardando} onClick={() => guardar('pendiente', { estado: 'pendiente' })} leftIcon={<RotateCcw className="h-4 w-4" />}>
                                A pendiente
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setDesechando(true)} leftIcon={<X className="h-4 w-4" />}>Desechar…</Button>
                            <Button size="sm" disabled={!!guardando} onClick={() => guardar('hecha', { estado: 'hecha' })}
                                leftIcon={guardando === 'hecha' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}>
                                Marcar como hecha
                            </Button>
                        </>
                    ) : idea.estado === 'hecha' ? (
                        <Button variant="ghost" size="sm" disabled={!!guardando} onClick={() => guardar('deshacer', { estado: 'aceptada' })} leftIcon={<RotateCcw className="h-4 w-4" />}>
                            Deshacer: volver a aceptada
                        </Button>
                    ) : (
                        <Button variant="secondary" size="sm" disabled={!!guardando} onClick={() => guardar('reabrir', { estado: 'pendiente' })} leftIcon={<RotateCcw className="h-4 w-4" />}>
                            Reabrir
                        </Button>
                    )}
                </div>
            </div>
        </article>
    );
};

export default IdeaDetalle;
