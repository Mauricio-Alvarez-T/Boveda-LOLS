import React, { useState, useEffect } from 'react';
import { X, Mail, Send, ChevronRight, Pencil, Star, Loader2 } from 'lucide-react';
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

                // Auto-select default or first template
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

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Modal */}
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
                            <div className="h-8 w-8 rounded-lg bg-[#0071E3]/10 flex items-center justify-center">
                                <Mail className="h-4 w-4 text-[#0071E3]" />
                            </div>
                            <div className="flex-1 w-full max-w-sm">
                                <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">Enviar Reporte</h2>
                                <p className="text-xs text-[#6E6E73] mb-2">
                                    <span className="font-medium">{trabajadores.length} trabajador{trabajadores.length !== 1 ? 'es' : ''} seleccionado{trabajadores.length !== 1 ? 's' : ''}</span>
                                </p>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-[#A1A1A6]">Para:</span>
                                    <input
                                        type="email"
                                        value={emailDestino}
                                        onChange={(e) => setEmailDestino(e.target.value)}
                                        placeholder="correo@ejemplo.com"
                                        className="flex-1 rounded-md border border-[#D2D2D7] bg-white px-2 py-1 text-sm text-[#1D1D1F] placeholder:text-[#A1A1A6] focus:outline-none focus:ring-1 focus:ring-[#0071E3] focus:border-[#0071E3] transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-[#6E6E73] hover:text-[#1D1D1F] transition-colors p-1 rounded-lg hover:bg-[#F5F5F7]">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-[#0071E3]" />
                        </div>
                    ) : (
                        <div className="flex max-h-[70vh] overflow-hidden">
                            {/* Left: Template List */}
                            {plantillas.length > 0 && (
                                <div className="w-52 flex-shrink-0 border-r border-[#E8E8ED] overflow-y-auto bg-[#F5F5F7]">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#A1A1A6] px-4 pt-4 pb-2">
                                        Plantillas
                                    </p>
                                    {plantillas.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleSelectPlantilla(p)}
                                            className={cn(
                                                "w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-white/60 transition-colors",
                                                selectedId === p.id ? "bg-white text-[#0071E3]" : "text-[#1D1D1F]"
                                            )}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-semibold truncate">{p.nombre}</span>
                                                    {p.es_predeterminada && <Star className="h-2.5 w-2.5 fill-[#FF9F0A] text-[#FF9F0A] flex-shrink-0" />}
                                                </div>
                                                <p className="text-[10px] text-[#A1A1A6] truncate mt-0.5">{p.asunto}</p>
                                            </div>
                                            {selectedId === p.id && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Right: Edit & Preview */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                {!hasCredentials && (
                                    <div className="flex items-start gap-2 p-3 bg-[#FF9F0A]/8 border border-[#FF9F0A]/30 rounded-xl text-sm text-[#FF9F0A]">
                                        ⚠️ No tienes credenciales de correo guardadas. Ve a <strong>Configuración &gt; Mi Correo</strong> para configurarlas.
                                    </div>
                                )}

                                {plantillas.length === 0 && (
                                    <div className="text-center py-10 text-[#6E6E73] text-sm">
                                        <p>Sin plantillas configuradas.</p>
                                        <p className="mt-1">Ve a <strong>Configuración &gt; Plantillas Email</strong> para crear una.</p>
                                    </div>
                                )}

                                <Input
                                    label="Asunto"
                                    value={asunto}
                                    onChange={(e) => setAsunto(e.target.value)}
                                    placeholder="Asunto del correo"
                                />

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-[#6E6E73]">Mensaje</label>
                                        <button
                                            className="text-xs text-[#0071E3] flex items-center gap-1 hover:underline"
                                            onClick={() => setEditMode(e => !e)}
                                        >
                                            <Pencil className="h-3 w-3" />
                                            {editMode ? 'Vista previa' : 'Editar'}
                                        </button>
                                    </div>
                                    {editMode ? (
                                        <textarea
                                            rows={10}
                                            className="w-full rounded-xl border border-[#D2D2D7] bg-white px-4 py-3 text-sm text-[#1D1D1F] placeholder:text-[#A1A1A6] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30 focus:border-[#0071E3] transition-all resize-none"
                                            value={cuerpo}
                                            onChange={(e) => setCuerpo(e.target.value)}
                                        />
                                    ) : (
                                        <div className="w-full min-h-[200px] rounded-xl border border-[#E8E8ED] bg-[#F5F5F7] px-4 py-3 text-sm text-[#1D1D1F] whitespace-pre-line">
                                            {cuerpo || <span className="text-[#A1A1A6] italic">Selecciona una plantilla o escribe un mensaje</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E8E8ED] bg-[#F5F5F7]">
                        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button
                            onClick={handleSend}
                            isLoading={sending}
                            disabled={!hasCredentials || !emailDestino || !asunto || !cuerpo || trabajadores.length === 0}
                            leftIcon={<Send className="h-4 w-4" />}
                        >
                            Enviar Reporte
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default EnvioEmailModal;
