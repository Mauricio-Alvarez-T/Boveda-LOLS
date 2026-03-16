import React, { useState, useEffect } from 'react';
import { X, Mail, Send, ChevronRight, ChevronLeft, Pencil, Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

interface PlantillaCorreo {
    id: number;
    nombre: string;
    asunto: string;
    cuerpo: string;
    es_predeterminada: boolean;
}

interface TrabajadorAvanzado {
    id: number;
    nombres: string;
    apellido_paterno: string;
    [key: string]: any;
}

interface EnvioEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    destinatarioEmail: string;
    trabajadores: TrabajadorAvanzado[];
}

const EnvioEmailModal: React.FC<EnvioEmailModalProps> = ({ isOpen, onClose, destinatarioEmail, trabajadores }) => {
    const [plantillas, setPlantillas] = useState<PlantillaCorreo[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [emailDestino, setEmailDestino] = useState(destinatarioEmail);
    const [asunto, setAsunto] = useState('');
    const [cuerpo, setCuerpo] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [hasCredentials, setHasCredentials] = useState(true);

    useEffect(() => {
        if (!isOpen) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const [plantillasRes, credRes] = await Promise.all([
                    api.get<{ data: PlantillaCorreo[] }>('/usuarios/me/plantillas'),
                    api.get<{ email_corporativo: string; tiene_password: boolean }>('/usuarios/me/email-config')
                ]);

                const fetchedPlantillas = plantillasRes.data.data;
                setPlantillas(fetchedPlantillas);
                setHasCredentials(credRes.data.tiene_password && !!credRes.data.email_corporativo);

                const def = fetchedPlantillas.find(p => p.es_predeterminada) || fetchedPlantillas[0];
                if (def) {
                    setSelectedId(def.id);
                    setAsunto(def.asunto);
                    setCuerpo(def.cuerpo);
                }
            } catch (err) {
                toast.error('Error al cargar plantillas');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isOpen]);

    const handleSelectPlantilla = (p: PlantillaCorreo) => {
        setSelectedId(p.id);
        setAsunto(p.asunto);
        setCuerpo(p.cuerpo);
        setEditMode(false);
    };

    const handleSend = async () => {
        if (!emailDestino || !asunto || !cuerpo) {
            toast.error('Completa el destinatario, asunto y el cuerpo del correo');
            return;
        }
        setSending(true);
        try {
            await api.post('/fiscalizacion/enviar-excel', {
                trabajadores,
                destinatario_email: emailDestino,
                asunto,
                cuerpo
            });
            toast.success(`Reporte enviado correctamente a ${destinatarioEmail}`);
            onClose();
        } catch (err: any) {
            if (err.response?.data?.code === 'NO_EMAIL_CREDENTIALS') {
                toast.error('Configura tu correo en Configuración > Mi Correo antes de enviar.');
            } else {
                toast.error(err.response?.data?.error || 'Error al enviar el correo');
            }
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

    /* ── Shared form content ── */
    const FormContent = ({ isMobile = false }: { isMobile?: boolean }) => (
        <div className="space-y-4">
            {!hasCredentials && (
                <div className="flex items-start gap-2 p-3 bg-warning/8 border border-warning/30 rounded-xl text-sm text-warning">
                    ⚠️ No tienes credenciales de correo guardadas. Ve a <strong>Configuración &gt; Mi Correo</strong> para configurarlas.
                </div>
            )}

            {plantillas.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                    <p>Sin plantillas configuradas.</p>
                    <p className="mt-1">Ve a <strong>Configuración &gt; Plantillas Email</strong> para crear una.</p>
                </div>
            )}

            {/* Mobile: horizontal template pills */}
            {isMobile && plantillas.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {plantillas.map(p => (
                        <button
                            key={p.id}
                            onClick={() => handleSelectPlantilla(p)}
                            className={cn(
                                "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                                selectedId === p.id
                                    ? "bg-brand-primary text-white border-brand-primary"
                                    : "bg-white text-brand-dark border-border"
                            )}
                        >
                            {p.nombre}
                        </button>
                    ))}
                </div>
            )}

            <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Para</label>
                <input
                    type="email"
                    value={emailDestino}
                    onChange={(e) => setEmailDestino(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brand-dark placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                />
            </div>

            <Input
                label="Asunto"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Asunto del correo"
            />

            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">Mensaje</label>
                    <button
                        className="text-xs text-brand-primary flex items-center gap-1 hover:underline"
                        onClick={() => setEditMode(e => !e)}
                    >
                        <Pencil className="h-3 w-3" />
                        {editMode ? 'Vista previa' : 'Editar'}
                    </button>
                </div>
                {editMode ? (
                    <textarea
                        rows={isMobile ? 6 : 10}
                        className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-brand-dark placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all resize-none"
                        value={cuerpo}
                        onChange={(e) => setCuerpo(e.target.value)}
                    />
                ) : (
                    <div className="w-full min-h-[120px] md:min-h-[200px] rounded-xl border border-[#E8E8ED] bg-background px-4 py-3 text-sm text-brand-dark whitespace-pre-line">
                        {cuerpo || <span className="text-muted italic">Selecciona una plantilla o escribe un mensaje</span>}
                    </div>
                )}
            </div>
        </div>
    );

    const FooterButtons = () => (
        <>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button
                onClick={handleSend}
                isLoading={sending}
                disabled={!hasCredentials || !emailDestino || !asunto || !cuerpo || trabajadores.length === 0}
                leftIcon={<Send className="h-4 w-4" />}
            >
                Enviar
            </Button>
        </>
    );

    return (
        <AnimatePresence>
            {/* ── MOBILE: Fullscreen ── */}
            <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-white">
                <motion.div
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 60 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="flex flex-col h-full"
                >
                    {/* Nav bar */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E8ED] bg-white/80 backdrop-blur-xl shrink-0">
                        <button onClick={onClose} className="flex items-center gap-1 text-brand-primary text-sm font-medium">
                            <ChevronLeft className="h-5 w-5" />
                            <span>Volver</span>
                        </button>
                        <div className="flex-1 text-center pr-12">
                            <h3 className="text-base font-semibold text-brand-dark flex items-center justify-center gap-2">
                                <Mail className="h-4 w-4 text-brand-primary" />
                                Enviar Reporte
                            </h3>
                        </div>
                    </div>

                    <div className="px-4 py-2 bg-background border-b border-[#E8E8ED] shrink-0">
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium">{trabajadores.length} trabajador{trabajadores.length !== 1 ? 'es' : ''} seleccionado{trabajadores.length !== 1 ? 's' : ''}</span>
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto px-4 py-4">
                            <FormContent isMobile={true} />
                        </div>
                    )}

                    <div className="px-4 py-3 border-t border-[#E8E8ED] bg-background flex justify-end gap-3 shrink-0">
                        <FooterButtons />
                    </div>
                </motion.div>
            </div>

            {/* ── DESKTOP: Classic centered card ── */}
            <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8ED]">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                                <Mail className="h-4 w-4 text-brand-primary" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-brand-dark">Enviar Reporte</h2>
                                <p className="text-xs text-muted-foreground">
                                    <span className="font-medium">{trabajadores.length} trabajador{trabajadores.length !== 1 ? 'es' : ''} seleccionado{trabajadores.length !== 1 ? 's' : ''}</span>
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-muted-foreground hover:text-brand-dark transition-colors p-1 rounded-lg hover:bg-background">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                        </div>
                    ) : (
                        <div className="flex max-h-[70vh] overflow-hidden">
                            {/* Left: Template List */}
                            {plantillas.length > 0 && (
                                <div className="w-52 flex-shrink-0 border-r border-[#E8E8ED] overflow-y-auto bg-background">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted px-4 pt-4 pb-2">
                                        Plantillas
                                    </p>
                                    {plantillas.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleSelectPlantilla(p)}
                                            className={cn(
                                                "w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-white/60 transition-colors",
                                                selectedId === p.id ? "bg-white text-brand-primary" : "text-brand-dark"
                                            )}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-semibold truncate">{p.nombre}</span>
                                                    {p.es_predeterminada && <Star className="h-2.5 w-2.5 fill-warning text-warning flex-shrink-0" />}
                                                </div>
                                                <p className="text-[10px] text-muted truncate mt-0.5">{p.asunto}</p>
                                            </div>
                                            {selectedId === p.id && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Right: Edit & Preview */}
                            <div className="flex-1 overflow-y-auto p-5">
                                <FormContent />
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E8E8ED] bg-background">
                        <FooterButtons />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default EnvioEmailModal;
