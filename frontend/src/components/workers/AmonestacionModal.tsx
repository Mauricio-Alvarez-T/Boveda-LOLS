import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mic, Square, Sparkles, Download, ArrowLeft, FileText, Building2, Briefcase, MapPin, AlertTriangle, Search, ChevronRight } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import api from '../../services/api';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

interface AmonestacionWorker {
    id: number;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
    rut?: string | null;
    obra_nombre?: string | null;
    empresa_nombre?: string | null;
    cargo_nombre?: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Trabajador pre-seleccionado (ej. desde la Ficha Rápida). */
    worker?: AmonestacionWorker | null;
    /** Lista para elegir trabajador (ej. desde la barra de Asistencia). */
    workers?: AmonestacionWorker[];
}

const hoy = () => new Date().toISOString().split('T')[0];
const nombreDe = (w: AmonestacionWorker) =>
    `${w.apellido_paterno} ${w.apellido_materno || ''} ${w.nombres}`.replace(/\s+/g, ' ').trim();

export const AmonestacionModal: React.FC<Props> = ({ isOpen, onClose, worker, workers }) => {
    const [picked, setPicked] = useState<AmonestacionWorker | null>(worker ?? null);
    const [pickSearch, setPickSearch] = useState('');
    const [fecha, setFecha] = useState(hoy());
    const [motivo, setMotivo] = useState('');
    const [carta, setCarta] = useState<string | null>(null); // null = paso "input"; string = paso "review"
    const [generando, setGenerando] = useState(false);
    const [descargando, setDescargando] = useState(false);

    const { supported: voiceSupported, listening, start, stop } = useSpeechRecognition({
        lang: 'es-CL',
        onFinal: (text) => setMotivo(prev => (prev ? prev.trim() + ' ' : '') + text),
    });

    // Reiniciar todo cada vez que se abre el modal.
    useEffect(() => {
        if (isOpen) {
            setPicked(worker ?? null);
            setPickSearch(''); setFecha(hoy()); setMotivo(''); setCarta(null);
            setGenerando(false); setDescargando(false);
        }
    }, [isOpen, worker]);

    const handleClose = () => { try { stop(); } catch { /* noop */ } onClose(); };
    const toggleMic = () => { if (listening) stop(); else start(); };

    const canPickAnother = !!(workers && workers.length > 0);
    const needsPicker = !picked;
    const enReview = !!picked && carta !== null;

    const generar = async () => {
        if (!picked) return;
        if (!motivo.trim()) { toast.error('Describe brevemente el motivo (puedes dictarlo).'); return; }
        try { stop(); } catch { /* noop */ }
        setGenerando(true);
        try {
            const res = await api.post('/amonestaciones/generar', {
                trabajador_id: picked.id, fecha, texto: motivo.trim(),
            });
            setCarta(res.data.carta || '');
            toast.success('Carta redactada. Revísala antes de descargar.');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'No se pudo generar la carta con IA.');
        } finally {
            setGenerando(false);
        }
    };

    // Avanzar a redactar a mano (sin IA): útil sin clave o sin internet.
    const escribirAMano = () => setCarta(motivo.trim());

    const descargarPdf = async () => {
        if (!picked || !carta || !carta.trim()) { toast.error('La carta está vacía.'); return; }
        setDescargando(true);
        try {
            const res = await api.post('/amonestaciones/pdf',
                { trabajador_id: picked.id, fecha, carta },
                { responseType: 'blob' }
            );
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            const safe = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
            link.setAttribute('download', `Amonestacion_${safe(picked.apellido_paterno)}_${safe(picked.nombres)}_${fecha}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('PDF descargado.');
        } catch {
            toast.error('No se pudo generar el PDF.');
        } finally {
            setDescargando(false);
        }
    };

    const listaFiltrada = (workers || []).filter(w => {
        const q = pickSearch.trim().toLowerCase();
        if (!q) return true;
        return `${nombreDe(w)} ${w.rut || ''}`.toLowerCase().includes(q);
    });

    const footer = needsPicker ? undefined : enReview ? (
        <>
            <Button variant="ghost" onClick={() => setCarta(null)} leftIcon={<ArrowLeft className="h-4 w-4" />} className="w-full sm:w-auto">
                Volver
            </Button>
            <Button onClick={descargarPdf} isLoading={descargando} leftIcon={<Download className="h-4 w-4" />} className="w-full sm:w-auto">
                Descargar PDF
            </Button>
        </>
    ) : (
        <>
            <Button variant="ghost" onClick={escribirAMano} className="w-full sm:w-auto" title="Saltar la IA y redactar/editar a mano">
                Escribir a mano
            </Button>
            <Button onClick={generar} isLoading={generando} leftIcon={<Sparkles className="h-4 w-4" />} className="w-full sm:w-auto">
                Generar carta
            </Button>
        </>
    );

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Carta de Amonestación" size="md" footer={footer}>
            {needsPicker ? (
                /* ── Paso 0: elegir trabajador ── */
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Elige el trabajador para la carta:</p>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            autoFocus
                            value={pickSearch}
                            onChange={(e) => setPickSearch(e.target.value)}
                            placeholder="Buscar por nombre o RUT..."
                            className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-card text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                        />
                    </div>
                    <div className="max-h-[45vh] overflow-y-auto custom-scrollbar -mx-1 px-1 space-y-1.5">
                        {listaFiltrada.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">Sin resultados.</p>
                        ) : listaFiltrada.map(w => (
                            <button
                                key={w.id}
                                onClick={() => setPicked(w)}
                                className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-background hover:bg-muted border border-border transition-colors text-left"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-brand-dark truncate">{nombreDe(w)}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {w.rut || ''}{w.cargo_nombre ? ` · ${w.cargo_nombre}` : ''}
                                    </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Identidad del trabajador */}
                    <div className="bg-background rounded-2xl p-4 border border-border">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-brand-dark">{nombreDe(picked!)}</p>
                                {picked!.rut && <p className="text-xs text-muted-foreground">{picked!.rut}</p>}
                            </div>
                            {canPickAnother && !enReview && (
                                <button onClick={() => { setPicked(null); setMotivo(''); setCarta(null); }} className="text-[11px] font-semibold text-brand-primary hover:underline shrink-0">
                                    Cambiar
                                </button>
                            )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {picked!.cargo_nombre && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-card rounded-lg text-[11px] text-brand-dark border border-border">
                                    <Briefcase className="h-3 w-3 text-brand-primary" /> {picked!.cargo_nombre}
                                </span>
                            )}
                            {picked!.obra_nombre && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-card rounded-lg text-[11px] text-brand-dark border border-border">
                                    <MapPin className="h-3 w-3 text-brand-accent" /> {picked!.obra_nombre}
                                </span>
                            )}
                            {picked!.empresa_nombre && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-card rounded-lg text-[11px] text-brand-dark border border-border">
                                    <Building2 className="h-3 w-3 text-warning" /> {picked!.empresa_nombre}
                                </span>
                            )}
                        </div>
                    </div>

                    {!enReview ? (
                        <>
                            {/* Fecha */}
                            <div>
                                <label className="block text-sm font-medium text-brand-dark mb-1">Fecha de la carta</label>
                                <input
                                    type="date"
                                    value={fecha}
                                    onChange={(e) => setFecha(e.target.value)}
                                    className="w-full h-11 px-3 rounded-xl border border-border bg-card text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                                />
                            </div>

                            {/* Motivo (voz + texto) */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-brand-dark">¿Qué pasó?</label>
                                    {voiceSupported && (
                                        <button
                                            type="button"
                                            onClick={toggleMic}
                                            className={
                                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors " +
                                                (listening
                                                    ? "bg-destructive text-white animate-pulse"
                                                    : "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20")
                                            }
                                        >
                                            {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                                            {listening ? 'Detener' : 'Dictar'}
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    value={motivo}
                                    onChange={(e) => setMotivo(e.target.value)}
                                    rows={4}
                                    placeholder='Ej: "El martes 9 de junio Juan Pérez llegó tarde por tercera vez, se le aplica amonestación."'
                                    className="w-full p-3 rounded-xl border border-border bg-card text-brand-dark resize-y focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                                />
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    {voiceSupported
                                        ? 'Dicta o escribe en pocas palabras. La IA lo convertirá en una carta formal.'
                                        : 'Escribe en pocas palabras (tu teclado también permite dictar). La IA lo convertirá en una carta formal.'}
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/30 bg-warning/10">
                                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                                <p className="text-xs text-brand-dark">
                                    <strong>Revisa y corrige</strong> el texto antes de descargar. Es un documento de apoyo; verifica nombres, fechas y datos.
                                </p>
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-sm font-medium text-brand-dark mb-1">
                                    <FileText className="h-4 w-4 text-brand-primary" /> Carta (editable)
                                </label>
                                <textarea
                                    value={carta || ''}
                                    onChange={(e) => setCarta(e.target.value)}
                                    rows={14}
                                    className="w-full p-3 rounded-xl border border-border bg-card text-brand-dark text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                                />
                            </div>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
};
