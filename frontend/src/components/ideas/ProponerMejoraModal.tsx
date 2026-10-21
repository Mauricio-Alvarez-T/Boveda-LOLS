import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Lightbulb, MapPin, Building2, Smartphone, Monitor, CheckCircle2, ArrowLeft, Send, Loader2,
    MessageSquareText, Inbox, ImagePlus, X, Maximize2,
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
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { Idea, IdeaTipo } from '../../types/entities';
import {
    TIPOS, ESTADOS, MOTIVOS, FORMULARIOS,
    nombrePantalla, hace, primerNombre,
} from './ideasConfig';
import { PestanasElasticas } from '../ui/PestanasElasticas';

const PESTANAS = [{ key: 'nueva' as const }, { key: 'mias' as const }];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Abrir directo en "Mis ideas" (p. ej. cuando hay una novedad). */
    pestanaInicial?: 'nueva' | 'mias';
}

const esMovil = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
/** Desde aquí caben las tres columnas (tipos · Proponer · Mis ideas); más angosto, pestañas. */
const TRES_COLUMNAS = '(min-width: 1024px)';

const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';
const ETIQUETA = 'block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2';

/**
 * "Proponer una mejora": el lado del usuario de Ideas para Bóveda (mig 120).
 *
 * Corto a propósito (Marcos 20-10-2026: un formulario largo desmotiva): elegir el tipo,
 * escribir con sus palabras en UNA casilla y, si quiere, un pantallazo (también se puede
 * pegar con Ctrl+V). La pantalla, la obra y el dispositivo se capturan solos.
 */
export const ProponerMejoraModal: React.FC<Props> = ({ isOpen, onClose, pestanaInicial = 'nueva' }) => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const location = useLocation();
    const resumenMias = useMisIdeasResumen();
    const anchas = useMediaQuery(TRES_COLUMNAS);

    const [pestana, setPestana] = useState<'nueva' | 'mias'>(pestanaInicial);
    const [paso, setPaso] = useState<'tipo' | 'form' | 'enviada'>('tipo');
    const [tipo, setTipo] = useState<IdeaTipo | null>(null);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    // Cada envío vuelve a cargar "Mis ideas" (en tres columnas está a la vista mientras se propone).
    const [enviadas, setEnviadas] = useState(0);
    // Foto opcional (mig 121): se comprime acá mismo a ~5 KB; lo que se ve es lo que se manda.
    const [foto, setFoto] = useState<Miniatura | null>(null);
    const [comprimiendo, setComprimiendo] = useState(false);
    const [verFoto, setVerFoto] = useState(false);
    const galeriaRef = useRef<HTMLInputElement>(null);
    const fotoUrl = useMemo(() => (foto ? URL.createObjectURL(foto.blob) : null), [foto]);
    useEffect(() => () => { if (fotoUrl) URL.revokeObjectURL(fotoUrl); }, [fotoUrl]);

    const cargarFoto = async (f: File) => {
        setComprimiendo(true);
        const mini = await comprimirMiniatura(f, { maxBytes: 5 * 1024 });
        setComprimiendo(false);
        if (!mini) { toast.error('No se pudo leer esa imagen. Prueba con otra foto o captura.'); return; }
        setFoto(mini);
    };
    const elegirFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) cargarFoto(f);
    };
    // En el computador lo más rápido es sacar la captura (Win+Shift+S) y pegarla con Ctrl+V en
    // cualquier parte del formulario. Si lo pegado no es una imagen, se pega el texto como siempre.
    const pegarFoto = (e: React.ClipboardEvent) => {
        const imagen = Array.from(e.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
        if (!imagen) return;
        e.preventDefault();
        cargarFoto(imagen);
    };
    // Recuadro «Arrastra aquí» (Marcos 20-10): en el computador se suelta el archivo; en el iPhone se
    // arrastra desde Fotos.
    const [arrastrando, setArrastrando] = useState(false);
    const soltarFoto = (e: React.DragEvent) => {
        e.preventDefault();
        setArrastrando(false);
        const imagen = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
        if (imagen) cargarFoto(imagen);
        else if (e.dataTransfer.files.length) toast.error('Eso no es una imagen. Suelta un pantallazo (PNG o JPG).');
    };
    // Con el formulario abierto, una imagen soltada FUERA del recuadro no hace que el navegador la abra
    // encima del formulario (se perdería lo escrito).
    const formAbierto = isOpen && paso === 'form';
    useEffect(() => {
        if (!formAbierto) return;
        const sinAbrir = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
        window.addEventListener('dragover', sinAbrir);
        window.addEventListener('drop', sinAbrir);
        return () => {
            window.removeEventListener('dragover', sinAbrir);
            window.removeEventListener('drop', sinAbrir);
        };
    }, [formAbierto]);

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
        setPaso('tipo'); setTipo(null); setTexto('');
        setFoto(null); setVerFoto(false);
    };
    const cerrar = () => { onClose(); setTimeout(reiniciar, 250); };

    const esFalla = tipo === 'falla';
    const textos = FORMULARIOS[tipo || 'cuesta'];
    // Sin mínimo de caracteres: basta con que no quede vacío.
    const completo = !!tipo && texto.trim().length > 0;

    const enviar = async () => {
        if (!tipo || !completo) return;
        setEnviando(true);
        try {
            // El título para la bandeja lo saca el servidor de la primera línea del texto.
            await api.post('/ideas', {
                tipo,
                detalle: texto.trim(),
                pantalla: contexto.pantalla || undefined,
                pantalla_nombre: contexto.pantallaNombre || undefined,
                obra_id: selectedObra?.id || undefined,
                dispositivo: contexto.dispositivo,
                foto: foto?.dataUrl || undefined,
            });
            setPaso('enviada');
            setEnviadas(n => n + 1);
            resumenMias.refetch();
        } catch (e) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg || 'No se pudo enviar. Vuelve a intentarlo.');
        } finally {
            setEnviando(false);
        }
    };

    const nombre = primerNombre(user?.nombre);
    const elegirTipo = (t: IdeaTipo) => {
        if (paso === 'enviada') reiniciar();
        setTipo(t);
        setPaso('form');
    };

    const contextoChips = (
        <div className="flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider mr-1">Se envía junto a tu idea:</span>
            <Meta icon={<MapPin className="h-3 w-3" />}>{contexto.pantallaNombre || 'Bóveda'}</Meta>
            {selectedObra && <Meta icon={<Building2 className="h-3 w-3" />}>{selectedObra.nombre}</Meta>}
            <Meta icon={contexto.dispositivo === 'movil' ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}>
                {contexto.dispositivo === 'movil' ? 'Celular' : 'Computador'}
            </Meta>
        </div>
    );

    /** Tarjeta de un tipo: en grilla (pestañas) o una debajo de otra (panel izquierdo). */
    const tarjetaTipo = (t: IdeaTipo, enPanel: boolean) => {
        const cfg = TIPOS[t];
        const Icon = cfg.icon;
        const activa = enPanel && tipo === t && paso === 'form';
        return (
            // eslint-disable-next-line no-restricted-syntax -- tarjeta seleccionable (ícono + título + ayuda); Button no soporta este layout
            <button
                key={t}
                type="button"
                onClick={() => elegirTipo(t)}
                aria-pressed={enPanel ? activa : undefined}
                className={cn(
                    'group flex items-start gap-3 p-4 rounded-card border bg-card text-left transition-all hover:border-brand-primary hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                    !enPanel && 'sm:flex-col',
                    activa ? 'border-brand-primary ring-1 ring-brand-primary shadow-sm' : 'border-border',
                )}
            >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                    activa ? (t === 'falla' ? 'bg-destructive/10' : 'bg-brand-primary/10') : 'bg-muted',
                    t === 'falla' ? 'group-hover:bg-destructive/10' : 'group-hover:bg-brand-primary/10')}>
                    <Icon className={cn('h-5 w-5',
                        activa ? (t === 'falla' ? 'text-destructive' : 'text-brand-primary') : 'text-muted-foreground',
                        t === 'falla' ? 'group-hover:text-destructive' : 'group-hover:text-brand-primary')} />
                </span>
                <span>
                    <span className="block text-sm font-bold text-brand-dark">{cfg.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{cfg.ayuda}</span>
                </span>
            </button>
        );
    };

    const gracias = (
        <div className="flex flex-col items-center text-center gap-3 py-8">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-9 w-9 text-success" />
            </span>
            <h3 className="text-title-sm font-bold tracking-tight text-brand-dark">¡Gracias{nombre ? `, ${nombre}` : ''}!</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
                {esFalla
                    ? 'Marcos y Mauricio ya recibieron el aviso por correo. Cuando lo revisen vas a ver en "Mis ideas" en qué quedó.'
                    : 'Tu idea quedó en la bandeja de Marcos y Mauricio. La revisan cuando tienen tiempo, y vas a ver en "Mis ideas" en qué quedó.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
                {/* En tres columnas "Mis ideas" ya está a la vista, a la derecha. */}
                {!anchas && <Button variant="secondary" size="sm" onClick={() => setPestana('mias')}>Ver mis ideas</Button>}
                <Button variant="ghost" size="sm" onClick={reiniciar}>Proponer otra</Button>
            </div>
        </div>
    );

    /** Lo que falta + Enviar: pie del modal en pestañas, pie de la columna Proponer en tres columnas. */
    const barraEnviar = (
        <div className="flex flex-col gap-2 w-full">
            {/* Junto al botón: un "Enviar" gris sin explicación no dice qué hacer. */}
            {!completo && (
                <p className="text-caption text-muted-foreground text-right">Para enviar, cuéntanos {textos.falta}.</p>
            )}
            <div className={cn('flex items-center gap-3', anchas ? 'justify-end' : 'justify-between')}>
                {/* En tres columnas el tipo se cambia en el panel izquierdo. */}
                {!anchas && (
                    <Button variant="ghost" size="sm" onClick={() => setPaso('tipo')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                        Cambiar tipo
                    </Button>
                )}
                <Button onClick={enviar} disabled={!completo || enviando} leftIcon={enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}>
                    {esFalla ? 'Avisar' : 'Enviar idea'}
                </Button>
            </div>
        </div>
    );

    // Una sola casilla y el pantallazo. Pegar una imagen (Ctrl+V) en cualquier parte del formulario la
    // toma como pantallazo.
    const camposFormulario = tipo && (
        <div className="flex flex-col gap-5" onPaste={pegarFoto}>
            <div className="flex items-center gap-2">
                <Meta tono={tipo === 'falla' ? 'peligro' : 'neutro'} icon={React.createElement(TIPOS[tipo].icon, { className: 'h-3 w-3' })}>{TIPOS[tipo].label}</Meta>
                {esFalla && <span className="text-caption text-muted-foreground">Les llega al tiro por correo a Marcos y Mauricio.</span>}
            </div>

            <div>
                <label htmlFor="idea-texto" className={ETIQUETA}>{textos.label}</label>
                <textarea
                    id="idea-texto"
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    rows={4}
                    maxLength={4000}
                    autoFocus
                    placeholder={textos.placeholder}
                    className={CAMPO}
                />
            </div>

            {/* Pantallazo, opcional: lo que se ve explica más rápido que lo que se escribe */}
            <div>
                <p className={`${ETIQUETA} mb-0.5`}>Pantallazo <span className="font-normal normal-case tracking-normal">(opcional)</span></p>
                <p className="text-caption text-muted-foreground mb-2">{textos.pantallazo}</p>
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
                    // Solo pantallazo (Marcos 16-10): lo que sirve es la captura de la pantalla de
                    // Bóveda, no una foto de cámara. El selector igual deja elegir de la galería.
                    <div
                        onDragEnter={e => { e.preventDefault(); setArrastrando(true); }}
                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!arrastrando) setArrastrando(true); }}
                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false); }}
                        onDrop={soltarFoto}
                        className={cn('flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                            arrastrando ? 'border-brand-primary bg-brand-primary/5' : 'border-border bg-background')}
                    >
                        <span className="flex flex-col items-center gap-1">
                            <ImagePlus className={cn('h-6 w-6', arrastrando ? 'text-brand-primary' : 'text-muted-foreground')} />
                            <span className="text-sm font-semibold text-brand-dark">{arrastrando ? 'Suéltalo aquí' : 'Arrastra aquí tu pantallazo'}</span>
                            <span className="text-caption text-muted-foreground">
                                {contexto.dispositivo === 'movil' ? 'o súbelo con el botón' : 'o pégalo con Ctrl+V, o súbelo con el botón'}
                            </span>
                        </span>
                        <Button variant="secondary" size="sm" className="w-full sm:w-auto" onClick={() => galeriaRef.current?.click()} leftIcon={<ImagePlus className="h-4 w-4" />}>
                            Subir pantallazo
                        </Button>
                    </div>
                )}
                {verFoto && foto && fotoUrl && (
                    <VisorAdjunto url={fotoUrl} mime={foto.blob.type} nombre="Foto de tu idea" size={foto.blob.size}
                        descripcion={`Vista previa — ${foto.ancho}×${foto.alto} px, todavía no se ha enviado`} onClose={() => setVerFoto(false)} />
                )}
            </div>
        </div>
    );

    const tipos = Object.keys(TIPOS) as IdeaTipo[];

    return (
        <Modal
            isOpen={isOpen}
            onClose={cerrar}
            size={anchas ? '2xl' : 'lg'}
            noBodyPadding={anchas}
            icon={Lightbulb}
            title="Ideas para Bóveda"
            description={<span>Se enviará con tu nombre: <strong className="text-brand-dark">{user?.nombre}</strong>{user?.rol ? ` · ${user.rol}` : ''}</span>}
            footer={!anchas && pestana === 'nueva' && paso === 'form' ? barraEnviar : undefined}
        >
            {anchas ? (
                // Tres columnas (Marcos 20-10): los tipos en un panel a la izquierda, uno debajo del otro, y
                // Proponer y Mis ideas lado a lado. Cada columna hace scroll por su cuenta.
                <div className="grid h-[min(80dvh,780px)] grid-cols-[240px_minmax(0,1fr)_380px] divide-x divide-border">
                    <nav aria-label="Qué quieres contarnos" className="flex min-h-0 flex-col gap-2.5 overflow-y-auto custom-scrollbar bg-background p-4">
                        <p className={ETIQUETA}>¿Qué quieres contarnos?</p>
                        {tipos.map(t => tarjetaTipo(t, true))}
                    </nav>

                    <section aria-labelledby="ideas-col-proponer" className="flex min-h-0 flex-col">
                        <div className="shrink-0 border-b border-border px-6 pt-5 pb-4">
                            <h4 id="ideas-col-proponer" className="text-section font-bold text-brand-dark">Proponer</h4>
                            <div className="mt-1.5">{contextoChips}</div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5">
                            {paso === 'enviada' ? gracias : paso === 'form' && tipo ? camposFormulario : (
                                <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-10 text-center">
                                    <Lightbulb className="h-7 w-7 text-muted-foreground" />
                                    <p className="text-sm font-bold text-brand-dark">Elige a la izquierda qué quieres contarnos</p>
                                    <p className="max-w-sm text-xs text-muted-foreground">Una idea nueva, algo que te cuesta o algo que no funciona. Lo cuentas con tus palabras y, si quieres, con un pantallazo.</p>
                                </div>
                            )}
                        </div>
                        {paso === 'form' && tipo && (
                            <div className="shrink-0 border-t border-border bg-background px-6 py-3">{barraEnviar}</div>
                        )}
                    </section>

                    <section aria-labelledby="ideas-col-mias" className="flex min-h-0 flex-col">
                        <div className="shrink-0 flex items-center gap-2 border-b border-border px-5 pt-5 pb-4">
                            <h4 id="ideas-col-mias" className="text-section font-bold text-brand-dark">Mis ideas</h4>
                            {resumenMias.total > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-micro font-bold tabular-nums text-muted-foreground">{resumenMias.total}</span>
                            )}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4">
                            <MisIdeas key={enviadas} onProponer={reiniciar} onVistas={resumenMias.refetch} />
                        </div>
                    </section>
                </div>
            ) : (
                <>
                    {/* Pestañas: en el celular y en pantallas angostas no caben las tres columnas */}
                    <div className="mb-5 flex w-fit rounded-2xl bg-muted p-1">
                        <PestanasElasticas
                            opciones={PESTANAS}
                            activa={pestana}
                            onCambiar={setPestana}
                            aria-label="Comparte tu idea"
                            claseFila="gap-1"
                            claseOpcion="inline-flex h-8 items-center rounded-xl px-3 font-medium whitespace-nowrap"
                            claseInactiva="text-muted-foreground hover:text-brand-dark"
                            render={(o) => o.key === 'nueva' ? 'Proponer' : (
                                <>
                                    Mis ideas
                                    {resumenMias.total > 0 && <span className="ml-1.5 opacity-80 tabular-nums">{resumenMias.total}</span>}
                                    {resumenMias.novedades > 0 && pestana !== 'mias' && (
                                        <span className="ml-1.5 h-2 w-2 rounded-full bg-warning" aria-label={`${resumenMias.novedades} con novedades`} />
                                    )}
                                </>
                            )}
                        />
                    </div>

                    {pestana === 'mias' ? (
                        <MisIdeas key={enviadas} onProponer={() => { setPestana('nueva'); reiniciar(); }} onVistas={resumenMias.refetch} />
                    ) : paso === 'enviada' ? gracias : (
                        <div className="flex flex-col gap-5">
                            {contextoChips}

                            {/* Paso 1: tipo */}
                            {paso === 'tipo' && (
                                <div>
                                    <p className={ETIQUETA}>¿Qué quieres contarnos?</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        {tipos.map(t => tarjetaTipo(t, false))}
                                    </div>
                                </div>
                            )}

                            {/* Paso 2: una sola casilla y el pantallazo */}
                            {paso === 'form' && camposFormulario}
                        </div>
                    )}
                </>
            )}
        </Modal>
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
