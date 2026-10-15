import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Lightbulb, MapPin, Building2, Smartphone, Monitor, CheckCircle2, ArrowLeft, Send, Loader2,
    MessageSquareText, Sparkles, Inbox, Camera, ImagePlus, X, Maximize2,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Meta, EstadoPill } from './Meta';
import { FotoIdea } from './FotoIdea';
import { IconButton } from '../ui/IconButton';
import { VisorAdjunto } from '../ui/VisorAdjunto';
import { comprimirMiniatura, type Miniatura } from '../../utils/compressImage';
import { formatearTamano } from '../../utils/archivos';
import { EmptyState } from '../ui/EmptyState';
import { cn } from '../../utils/cn';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useObra } from '../../context/ObraContext';
import { useMisIdeasResumen } from '../../hooks/useIdeas';
import type { Idea, IdeaHecha, IdeaTipo, IdeaFrecuencia, IdeaAlcance, IdeaBeneficio } from '../../types/entities';
import {
    TIPOS, ESTADOS, MOTIVOS, FRECUENCIAS, ALCANCES, ALCANCES_IDEA, BENEFICIOS, FORMULARIOS,
    nombrePantalla, hace, fechaCorta, primerNombre,
} from './ideasConfig';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Abrir directo en "Mis ideas" (p. ej. cuando hay una novedad). */
    pestanaInicial?: 'nueva' | 'mias';
}

const esMovil = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';
const ETIQUETA = 'block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2';

/** Grupo de opciones de un toque (frecuencia, alcance, beneficio). */
function Opciones<T extends string>({ valor, opciones, onChange }: { valor: T | null; opciones: Record<T, string>; onChange: (v: T) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {(Object.keys(opciones) as T[]).map(k => (
                <Button key={k} type="button" size="sm" variant={valor === k ? 'primary' : 'secondary'}
                    className="text-xs" onClick={() => onChange(k)} aria-pressed={valor === k}>
                    {opciones[k]}
                </Button>
            ))}
        </div>
    );
}

/**
 * "Proponer una mejora": el lado del usuario de Ideas para Bóveda (mig 120).
 *
 * El formulario está armado contra las mañas: una idea no se puede enviar sin el
 * problema de hoy contado con algo de detalle, cada cuánto pasa, a quién afecta y
 * qué se ganaría. El medidor "qué tan clara está" muestra lo que falta en vez de
 * esconderlo detrás de un error al enviar. La pantalla, la obra y el dispositivo
 * se capturan solos.
 */
export const ProponerMejoraModal: React.FC<Props> = ({ isOpen, onClose, pestanaInicial = 'nueva' }) => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const location = useLocation();
    const resumenMias = useMisIdeasResumen();

    const [pestana, setPestana] = useState<'nueva' | 'mias'>(pestanaInicial);
    const [paso, setPaso] = useState<'tipo' | 'form' | 'enviada'>('tipo');
    const [tipo, setTipo] = useState<IdeaTipo | null>(null);
    const [resumen, setResumen] = useState('');
    const [detalle, setDetalle] = useState('');
    const [esperado, setEsperado] = useState('');
    const [frecuencia, setFrecuencia] = useState<IdeaFrecuencia | null>(null);
    const [alcance, setAlcance] = useState<IdeaAlcance | null>(null);
    const [beneficio, setBeneficio] = useState<IdeaBeneficio | null>(null);
    const [enviando, setEnviando] = useState(false);
    // Foto opcional (mig 121): se comprime acá mismo a ~5 KB; lo que se ve es lo que se manda.
    const [foto, setFoto] = useState<Miniatura | null>(null);
    const [comprimiendo, setComprimiendo] = useState(false);
    const [verFoto, setVerFoto] = useState(false);
    const camaraRef = useRef<HTMLInputElement>(null);
    const galeriaRef = useRef<HTMLInputElement>(null);
    const fotoUrl = useMemo(() => (foto ? URL.createObjectURL(foto.blob) : null), [foto]);
    useEffect(() => () => { if (fotoUrl) URL.revokeObjectURL(fotoUrl); }, [fotoUrl]);

    const elegirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setComprimiendo(true);
        const mini = await comprimirMiniatura(f, { maxBytes: 5 * 1024 });
        setComprimiendo(false);
        if (!mini) { toast.error('No se pudo leer esa imagen. Prueba con otra foto o captura.'); return; }
        setFoto(mini);
    };

    // La pantalla desde donde se abrió: se fija al abrir, no cambia mientras se escribe.
    const [contexto, setContexto] = useState({ pantalla: '', pantallaNombre: '', dispositivo: 'escritorio' as 'movil' | 'escritorio' });
    useEffect(() => {
        if (!isOpen) return;
        setPestana(pestanaInicial);
        setContexto({
            pantalla: `${location.pathname}${location.search}`,
            pantallaNombre: nombrePantalla(location.pathname, location.search),
            dispositivo: esMovil() ? 'movil' : 'escritorio',
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
    }, [isOpen]);

    const reiniciar = () => {
        setPaso('tipo'); setTipo(null); setResumen(''); setDetalle(''); setEsperado('');
        setFrecuencia(null); setAlcance(null); setBeneficio(null);
        setFoto(null); setVerFoto(false);
    };
    const cerrar = () => { onClose(); setTimeout(reiniciar, 250); };

    const esFalla = tipo === 'falla';
    const textos = FORMULARIOS[tipo || 'cuesta'];
    // Lo que falta, en el orden en que se llena el formulario.
    // Lo que falta, en el orden del formulario. Sin mínimo de caracteres: basta con no dejarlo vacío.
    const pasos = useMemo(() => {
        if (!tipo) return [];
        const f = FORMULARIOS[tipo].falta;
        return esFalla
            ? [
                { listo: resumen.trim().length > 0, falta: f.resumen },
                { listo: detalle.trim().length > 0, falta: f.detalle },
                { listo: esperado.trim().length > 0, falta: f.esperado || '' },
            ]
            : [
                { listo: resumen.trim().length > 0, falta: f.resumen },
                { listo: detalle.trim().length > 0, falta: f.detalle },
                { listo: !!frecuencia && !!alcance, falta: f.senales || '' },
                { listo: !!beneficio, falta: f.beneficio || '' },
            ];
    }, [tipo, esFalla, resumen, detalle, esperado, frecuencia, alcance, beneficio]);
    const listos = pasos.filter(p => p.listo).length;
    const completo = pasos.length > 0 && listos === pasos.length;
    const siguienteFalta = pasos.find(p => !p.listo)?.falta;

    const enviar = async () => {
        if (!tipo || !completo) return;
        setEnviando(true);
        try {
            await api.post('/ideas', {
                tipo,
                resumen: resumen.trim(),
                detalle: detalle.trim(),
                ...(esFalla ? { esperado: esperado.trim() } : { frecuencia, alcance, beneficio }),
                ...(tipo === 'idea' && esperado.trim() ? { esperado: esperado.trim() } : {}),
                pantalla: contexto.pantalla || undefined,
                pantalla_nombre: contexto.pantallaNombre || undefined,
                obra_id: selectedObra?.id || undefined,
                dispositivo: contexto.dispositivo,
                foto: foto?.dataUrl || undefined,
            });
            setPaso('enviada');
            resumenMias.refetch();
        } catch (e) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg || 'No se pudo enviar. Vuelve a intentarlo.');
        } finally {
            setEnviando(false);
        }
    };

    const nombre = primerNombre(user?.nombre);

    return (
        <Modal
            isOpen={isOpen}
            onClose={cerrar}
            size="lg"
            icon={Lightbulb}
            title="Ideas para Bóveda"
            description={<span>Se enviará con tu nombre: <strong className="text-brand-dark">{user?.nombre}</strong>{user?.rol ? ` · ${user.rol}` : ''}</span>}
            footer={pestana === 'nueva' && paso === 'form' ? (
                <div className="flex flex-col gap-2 w-full">
                    {/* Lo que falta, junto al botón: en el celular el medidor queda fuera de la
                        vista y un "Enviar" gris sin explicación no dice qué hacer. */}
                    {!completo && siguienteFalta && (
                        <p className="text-caption text-muted-foreground text-right">Para enviar, falta contarnos {siguienteFalta}.</p>
                    )}
                    <div className="flex items-center justify-between gap-3">
                        <Button variant="ghost" size="sm" onClick={() => setPaso('tipo')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                            Cambiar tipo
                        </Button>
                        <Button onClick={enviar} disabled={!completo || enviando} leftIcon={enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}>
                            {esFalla ? 'Avisar' : 'Enviar idea'}
                        </Button>
                    </div>
                </div>
            ) : undefined}
        >
            {/* Pestañas */}
            <div className="flex items-center gap-1.5 mb-5">
                <Button size="sm" variant={pestana === 'nueva' ? 'primary' : 'ghost'} onClick={() => setPestana('nueva')}>
                    Proponer
                </Button>
                <Button size="sm" variant={pestana === 'mias' ? 'primary' : 'ghost'} onClick={() => setPestana('mias')}>
                    Mis ideas
                    {resumenMias.total > 0 && <span className="ml-1.5 opacity-80 tabular-nums">{resumenMias.total}</span>}
                    {resumenMias.novedades > 0 && pestana !== 'mias' && (
                        <span className="ml-1.5 h-2 w-2 rounded-full bg-warning" aria-label={`${resumenMias.novedades} con novedades`} />
                    )}
                </Button>
            </div>

            {pestana === 'mias' ? (
                <MisIdeas onProponer={() => { setPestana('nueva'); reiniciar(); }} onVistas={resumenMias.refetch} />
            ) : paso === 'enviada' ? (
                <div className="flex flex-col items-center text-center gap-3 py-8">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                        <CheckCircle2 className="h-9 w-9 text-success" />
                    </span>
                    <h3 className="text-title-sm font-bold tracking-tight text-brand-dark">¡Gracias{nombre ? `, ${nombre}` : ''}!</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        {esFalla
                            ? 'Marcos y Mauricio ya recibieron el aviso por correo. Cuando lo revisen vas a ver acá en qué quedó.'
                            : 'Tu idea quedó en la bandeja de Marcos y Mauricio. La revisan cuando tienen tiempo, y vas a ver en "Mis ideas" en qué quedó.'}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mt-2">
                        <Button variant="secondary" size="sm" onClick={() => setPestana('mias')}>Ver mis ideas</Button>
                        <Button variant="ghost" size="sm" onClick={reiniciar}>Proponer otra</Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-5">
                    {/* Contexto que se manda solo */}
                    <div className="flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wider mr-1">Se envía junto a tu idea:</span>
                        <Meta icon={<MapPin className="h-3 w-3" />}>{contexto.pantallaNombre || 'Bóveda'}</Meta>
                        {selectedObra && <Meta icon={<Building2 className="h-3 w-3" />}>{selectedObra.nombre}</Meta>}
                        <Meta icon={contexto.dispositivo === 'movil' ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}>
                            {contexto.dispositivo === 'movil' ? 'Celular' : 'Computador'}
                        </Meta>
                    </div>

                    {/* Paso 1: tipo */}
                    {paso === 'tipo' && (
                        <div>
                            <p className={ETIQUETA}>¿Qué quieres contarnos?</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                {(Object.keys(TIPOS) as IdeaTipo[]).map(t => {
                                    const cfg = TIPOS[t];
                                    const Icon = cfg.icon;
                                    return (
                                        // eslint-disable-next-line no-restricted-syntax -- tarjeta seleccionable (ícono + título + ayuda); Button no soporta este layout
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => { setTipo(t); setPaso('form'); }}
                                            className="group flex sm:flex-col items-start gap-3 p-4 rounded-card border border-border bg-card text-left transition-all hover:border-brand-primary hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                                        >
                                            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted transition-colors',
                                                t === 'falla' ? 'group-hover:bg-destructive/10' : 'group-hover:bg-brand-primary/10')}>
                                                <Icon className={cn('h-5 w-5 text-muted-foreground',
                                                    t === 'falla' ? 'group-hover:text-destructive' : 'group-hover:text-brand-primary')} />
                                            </span>
                                            <span>
                                                <span className="block text-sm font-bold text-brand-dark">{cfg.label}</span>
                                                <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{cfg.ayuda}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <HechasRecientes />
                        </div>
                    )}

                    {/* Paso 2: el formulario según el tipo */}
                    {paso === 'form' && tipo && (
                        <>
                            <div className="flex items-center gap-2">
                                <Meta tono={tipo === 'falla' ? 'peligro' : 'neutro'} icon={React.createElement(TIPOS[tipo].icon, { className: 'h-3 w-3' })}>{TIPOS[tipo].label}</Meta>
                                {esFalla && <span className="text-caption text-muted-foreground">Les llega al tiro por correo a Marcos y Mauricio.</span>}
                            </div>

                            <div>
                                <label htmlFor="idea-resumen" className={ETIQUETA}>{textos.resumen.label}</label>
                                <input
                                    id="idea-resumen"
                                    value={resumen}
                                    onChange={e => setResumen(e.target.value)}
                                    maxLength={200}
                                    autoFocus
                                    placeholder={textos.resumen.placeholder}
                                    className={cn(CAMPO, 'h-11')}
                                />
                            </div>

                            <div>
                                <label htmlFor="idea-detalle" className={ETIQUETA}>{textos.detalle.label}</label>
                                <textarea
                                    id="idea-detalle"
                                    value={detalle}
                                    onChange={e => setDetalle(e.target.value)}
                                    rows={4}
                                    maxLength={4000}
                                    placeholder={textos.detalle.placeholder}
                                    className={CAMPO}
                                />
                                {textos.ejemplo && (
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="rounded-xl border border-border bg-background px-3 py-2">
                                            <p className="text-micro font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Así no</p>
                                            <p className="text-xs text-muted-foreground">{textos.ejemplo.no}</p>
                                        </div>
                                        <div className="rounded-xl border border-border bg-background px-3 py-2">
                                            <p className="text-micro font-bold uppercase tracking-wider text-success mb-0.5">Así sí</p>
                                            <p className="text-xs text-muted-foreground">{textos.ejemplo.si}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {textos.esperado && (
                                <div>
                                    <label htmlFor="idea-esperado" className={ETIQUETA}>
                                        {textos.esperado.label}
                                        {!textos.esperado.obligatorio && <span className="font-normal normal-case tracking-normal"> (opcional)</span>}
                                    </label>
                                    <textarea
                                        id="idea-esperado"
                                        value={esperado}
                                        onChange={e => setEsperado(e.target.value)}
                                        rows={2}
                                        maxLength={2000}
                                        placeholder={textos.esperado.placeholder}
                                        className={CAMPO}
                                    />
                                </div>
                            )}

                            {!esFalla && (
                                <>
                                    <div>
                                        <p className={ETIQUETA}>{textos.frecuencia}</p>
                                        <Opciones valor={frecuencia} opciones={FRECUENCIAS} onChange={setFrecuencia} />
                                    </div>
                                    <div>
                                        <p className={ETIQUETA}>{textos.alcance}</p>
                                        <Opciones valor={alcance} opciones={tipo === 'idea' ? ALCANCES_IDEA : ALCANCES} onChange={setAlcance} />
                                    </div>
                                    <div>
                                        <p className={ETIQUETA}>{textos.beneficio}</p>
                                        <Opciones valor={beneficio} opciones={BENEFICIOS} onChange={setBeneficio} />
                                    </div>
                                </>
                            )}

                            {/* Pantallazo, opcional: lo que se ve explica más rápido que lo que se escribe */}
                            <div>
                                <p className={`${ETIQUETA} mb-0.5`}>Pantallazo <span className="font-normal normal-case tracking-normal">(opcional)</span></p>
                                <p className="text-caption text-muted-foreground mb-2">
                                    {tipo === 'falla'
                                        ? 'De lo que salió mal o del mensaje de error.'
                                        : tipo === 'idea'
                                            ? 'De la pantalla donde te gustaría que estuviera lo nuevo.'
                                            : 'De la parte que te cuesta o que no entiendes.'}
                                </p>
                                <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirFoto} />
                                <input ref={galeriaRef} type="file" accept="image/*" className="hidden" onChange={elegirFoto} />
                                {comprimiendo ? (
                                    <div className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-background text-xs text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Achicando la foto…
                                    </div>
                                ) : foto && fotoUrl ? (
                                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
                                        {/* eslint-disable-next-line no-restricted-syntax -- la miniatura abre el visor; Button no envuelve media */}
                                        <button type="button" onClick={() => setVerFoto(true)} title="Ver más grande"
                                            className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40 cursor-zoom-in">
                                            <img src={fotoUrl} alt="Foto que se va a enviar" className="h-full w-full object-cover" />
                                            <Maximize2 className="absolute bottom-1 right-1 h-3 w-3 text-white drop-shadow" />
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-brand-dark">Se enviará así · {formatearTamano(foto.blob.size)}</p>
                                            <p className="text-micro text-muted-foreground leading-snug">
                                                Muy comprimida para no ocupar espacio: sirve para mostrar la pantalla, no para leer letra chica.
                                            </p>
                                        </div>
                                        <IconButton size="sm" onClick={() => setFoto(null)} aria-label="Quitar foto" title="Quitar" icon={<X className="h-3.5 w-3.5" />} />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="secondary" size="sm" onClick={() => camaraRef.current?.click()} leftIcon={<Camera className="h-4 w-4" />}>Tomar foto</Button>
                                        <Button variant="secondary" size="sm" onClick={() => galeriaRef.current?.click()} leftIcon={<ImagePlus className="h-4 w-4" />}>Subir pantallazo</Button>
                                    </div>
                                )}
                                {verFoto && foto && fotoUrl && (
                                    <VisorAdjunto url={fotoUrl} mime={foto.blob.type} nombre="Foto de tu idea" size={foto.blob.size}
                                        descripcion={`Vista previa — ${foto.ancho}×${foto.alto} px, todavía no se ha enviado`} onClose={() => setVerFoto(false)} />
                                )}
                            </div>

                            {/* Medidor: qué tan clara está la propuesta */}
                            <div className="rounded-card border border-border bg-background p-3.5">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className="text-xs font-bold text-brand-dark">
                                        {completo ? 'Lista para enviar' : 'Qué tan clara está tu propuesta'}
                                    </span>
                                    <span className="text-micro font-bold text-muted-foreground tabular-nums">{listos} de {pasos.length}</span>
                                </div>
                                <div className="flex gap-1">
                                    {pasos.map((p, i) => (
                                        <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', p.listo ? 'bg-brand-primary' : 'bg-border')} />
                                    ))}
                                </div>
                                <p className="mt-2 text-caption text-muted-foreground">
                                    {completo
                                        ? (esFalla ? 'Con esto podemos reproducirlo.' : 'Bien justificada: con esto la podemos evaluar.')
                                        : `Falta contarnos ${siguienteFalta}.`}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
};

/** Lo último que se hizo gracias a una idea: el crédito público es lo que mantiene viva la participación. */
const HechasRecientes: React.FC = () => {
    const [hechas, setHechas] = useState<IdeaHecha[]>([]);
    useEffect(() => {
        let vivo = true;
        api.get<{ data: IdeaHecha[] }>('/ideas/hechas')
            .then(r => { if (vivo) setHechas(r.data.data || []); })
            .catch(() => { /* sección opcional: sin datos no se muestra */ });
        return () => { vivo = false; };
    }, []);
    if (!hechas.length) return null;
    return (
        <div className="mt-6">
            <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                <Sparkles className="h-3.5 w-3.5" /> Hecho gracias a sus ideas
            </p>
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
                {hechas.slice(0, 4).map(h => (
                    <li key={h.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-sm text-brand-dark leading-snug">{h.resumen}</p>
                            <p className="text-caption text-muted-foreground mt-0.5">Idea de {h.autor} · {fechaCorta(h.hecha_en)}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

/** "Mis ideas": el estado de cada propuesta y la respuesta de quien la revisó. */
const MisIdeas: React.FC<{ onProponer: () => void; onVistas: () => void }> = ({ onProponer, onVistas }) => {
    const [ideas, setIdeas] = useState<Idea[] | null>(null);

    useEffect(() => {
        let vivo = true;
        api.get<{ data: Idea[] }>('/ideas/mias')
            .then(r => {
                if (!vivo) return;
                setIdeas(r.data.data || []);
                // Al abrir, las novedades quedan vistas (el punto se mantiene en esta vista hasta cerrar).
                if ((r.data.data || []).some(i => i.novedad)) {
                    api.post('/ideas/mias/vistas').then(onVistas).catch(() => { /* no es crítico */ });
                }
            })
            .catch(() => { if (vivo) setIdeas([]); });
        return () => { vivo = false; };
    }, [onVistas]);

    if (ideas === null) {
        return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }
    if (!ideas.length) {
        return (
            <EmptyState
                icon={Inbox}
                title="Todavía no has propuesto ideas"
                description="Si algo de Bóveda te cuesta o se te ocurre cómo mejorarlo, cuéntanos."
                action={<Button size="sm" onClick={onProponer}>Proponer la primera</Button>}
            />
        );
    }

    return (
        <ul className="flex flex-col gap-2.5">
            {ideas.map(idea => {
                const est = ESTADOS[idea.estado];
                const Icon = TIPOS[idea.tipo].icon;
                const etapas = [
                    { label: 'Enviada', ok: true },
                    { label: idea.estado === 'desechada' ? 'No por ahora' : 'Aceptada', ok: idea.estado !== 'pendiente' },
                    { label: 'Hecha', ok: idea.estado === 'hecha' },
                ];
                return (
                    <li key={idea.id} className={cn('rounded-card border bg-card p-3.5', idea.novedad ? 'border-warning/50' : 'border-border')}>
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold text-brand-dark leading-snug">{idea.resumen}</p>
                                    <EstadoPill tone={est.tone}>{est.labelAutor}</EstadoPill>
                                </div>
                                <p className="text-caption text-muted-foreground mt-0.5">
                                    {idea.pantalla_nombre || 'Bóveda'} · {hace(idea.created_at)}
                                    {idea.novedad && <span className="ml-1.5 font-bold text-amber-700 dark:text-amber-300">· Novedad</span>}
                                </p>
                                {idea.tiene_foto && (
                                    <div className="mt-2">
                                        <FotoIdea ideaId={idea.id} resumen={idea.resumen} tamano={idea.foto_bytes} compacta />
                                    </div>
                                )}

                                {/* Recorrido */}
                                {idea.estado !== 'desechada' && (
                                    <div className="mt-2.5 flex items-center gap-1.5" aria-label="Recorrido de la idea">
                                        {etapas.map((e, i) => (
                                            <React.Fragment key={e.label}>
                                                {i > 0 && <span className={cn('h-px flex-1', e.ok ? 'bg-brand-primary' : 'bg-border')} />}
                                                <span className={`text-micro font-bold uppercase tracking-wide ${e.ok ? 'text-brand-primary' : 'text-muted-foreground/60'}`}>
                                                    {e.label}
                                                </span>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                )}

                                {(idea.respuesta || idea.motivo) && (
                                    <div className="mt-2.5 rounded-xl bg-background border border-border px-3 py-2">
                                        <p className="flex items-center gap-1 text-micro font-bold uppercase tracking-wider text-muted-foreground">
                                            <MessageSquareText className="h-3 w-3" />
                                            {idea.revisor_nombre ? `Respuesta de ${primerNombre(idea.revisor_nombre)}` : 'Respuesta'}
                                            {idea.motivo && <span className="normal-case tracking-normal font-semibold"> · {MOTIVOS[idea.motivo].corto}</span>}
                                        </p>
                                        {idea.respuesta && <p className="text-xs text-brand-dark mt-1 leading-relaxed">{idea.respuesta}</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};

export default ProponerMejoraModal;
