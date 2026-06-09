import React, { useState } from 'react';
import { toast } from 'sonner';
import { Mic, Square, Sparkles, Download, ArrowLeft, Loader2, FileText, Building2, Briefcase, MapPin, AlertTriangle } from 'lucide-react';

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
    worker: AmonestacionWorker | null;
}

const hoy = () => new Date().toISOString().split('T')[0];

export const AmonestacionModal: React.FC<Props> = ({ isOpen, onClose, worker }) => {
    const [fecha, setFecha] = useState(hoy());
    const [motivo, setMotivo] = useState('');
    const [carta, setCarta] = useState<string | null>(null); // null = paso "input"; string = paso "review"
    const [generando, setGenerando] = useState(false);
    const [descargando, setDescargando] = useState(false);

    const { supported: voiceSupported, listening, start, stop } = useSpeechRecognition({
        lang: 'es-CL',
        onFinal: (text) => setMotivo(prev => (prev ? prev.trim() + ' ' : '') + text),
    });

    if (!worker) return null;

    const nombreCompleto = `${worker.apellido_paterno} ${worker.apellido_materno || ''} ${worker.nombres}`.replace(/\s+/g, ' ').trim();

    const reset = () => {
        setMotivo(''); setCarta(null); setFecha(hoy());
        setGenerando(false); setDescargando(false);
        try { stop(); } catch { /* noop */ }
    };
    const handleClose = () => { reset(); onClose(); };

    const toggleMic = () => { if (listening) stop(); else start(); };

    const generar = async () => {
        if (!motivo.trim()) { toast.error('Describe brevemente el motivo (puedes dictarlo).'); return; }
        try { stop(); } catch { /* noop */ }
        setGenerando(true);
        try {
            const res = await api.post('/amonestaciones/generar', {
                trabajador_id: worker.id, fecha, texto: motivo.trim(),
            });
            setCarta(res.data.carta || '');
            toast.success('Carta redactada. Revísala antes de descargar.');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'No se pudo generar la carta con IA.');
        } finally {
            setGenerando(false);
        }
    };

    // Permite avanzar a redactar a mano (sin IA): útil si no hay clave o sin internet.
    const escribirAMano = () => setCarta(motivo.trim());

    const descargarPdf = async () => {
        if (!carta || !carta.trim()) { toast.error('La carta está vacía.'); return; }
        setDescargando(true);
        try {
            const res = await api.post('/amonestaciones/pdf',
                { trabajador_id: worker.id, fecha, carta },
                { responseType: 'blob' }
            );
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            const safe = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
            link.setAttribute('download', `Amonestacion_${safe(worker.apellido_paterno)}_${safe(worker.nombres)}_${fecha}.pdf`);
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

    const enReview = carta !== null;

    const footer = enReview ? (
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
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Carta de Amonestación"
            size="md"
            footer={footer}
        >
            <div className="space-y-4">
                {/* Identidad del trabajador (solo lectura) */}
                <div className="bg-background rounded-2xl p-4 border border-border">
                    <p className="text-sm font-bold text-brand-dark">{nombreCompleto}</p>
                    {worker.rut && <p className="text-xs text-muted-foreground">{worker.rut}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {worker.cargo_nombre && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-card rounded-lg text-[11px] text-brand-dark border border-border">
                                <Briefcase className="h-3 w-3 text-brand-primary" /> {worker.cargo_nombre}
                            </span>
                        )}
                        {worker.obra_nombre && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-card rounded-lg text-[11px] text-brand-dark border border-border">
                                <MapPin className="h-3 w-3 text-brand-accent" /> {worker.obra_nombre}
                            </span>
                        )}
                        {worker.empresa_nombre && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-card rounded-lg text-[11px] text-brand-dark border border-border">
                                <Building2 className="h-3 w-3 text-warning" /> {worker.empresa_nombre}
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
        </Modal>
    );
};
