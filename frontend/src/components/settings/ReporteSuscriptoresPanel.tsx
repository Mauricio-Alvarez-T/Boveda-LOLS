import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Mail, Save, X, Send, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { showDeleteToast } from '../../utils/toastUtils';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

interface Suscriptor {
    id: number;
    email: string;
    nombre: string | null;
    activo: boolean | number;
}

interface FormState {
    email: string;
    nombre: string;
    activo: boolean;
}

const PERMISO = 'sistema.reportes.gestionar';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ReporteSuscriptoresPanel: React.FC = () => {
    const { hasPermission } = useAuth();
    const puedeGestionar = hasPermission(PERMISO);

    const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>({ email: '', nombre: '', activo: true });
    const [saving, setSaving] = useState(false);
    const [sendingId, setSendingId] = useState<number | 'me' | null>(null);

    const fetchSuscriptores = async () => {
        setLoading(true);
        try {
            const res = await api.get<{ data: Suscriptor[] }>('/reportes/suscriptores?activo=all');
            setSuscriptores(res.data.data);
        } catch (err) {
            toast.error('Error al cargar suscriptores');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSuscriptores(); }, []);

    const handleOpenCreate = () => {
        setEditingId(null);
        setForm({ email: '', nombre: '', activo: true });
        setShowForm(true);
    };

    const handleOpenEdit = (s: Suscriptor) => {
        setEditingId(s.id);
        setForm({ email: s.email, nombre: s.nombre || '', activo: !!s.activo });
        setShowForm(true);
    };

    const handleSave = async () => {
        const email = form.email.trim();
        if (!EMAIL_RE.test(email)) {
            toast.error('Ingresa un email válido');
            return;
        }
        setSaving(true);
        try {
            const payload = { email, nombre: form.nombre.trim() || null, activo: form.activo };
            if (editingId) {
                await api.put(`/reportes/suscriptores/${editingId}`, payload);
                toast.success('Suscriptor actualizado');
            } else {
                await api.post('/reportes/suscriptores', payload);
                toast.success('Suscriptor agregado');
            }
            setShowForm(false);
            fetchSuscriptores();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActivo = async (s: Suscriptor) => {
        try {
            await api.put(`/reportes/suscriptores/${s.id}`, { activo: !s.activo });
            fetchSuscriptores();
        } catch (err) {
            toast.error('Error al cambiar estado');
        }
    };

    const handleDelete = (s: Suscriptor) => {
        showDeleteToast({
            message: `¿Quitar a ${s.nombre || s.email} de los reportes?`,
            onConfirm: async () => {
                await api.delete(`/reportes/suscriptores/${s.id}`);
                fetchSuscriptores();
            }
        });
    };

    /** Envía el reporte real de la semana previa a un destinatario (prueba). */
    const handleSendTest = async (target: { id: number; email: string } | 'me') => {
        const key = target === 'me' ? 'me' : target.id;
        setSendingId(key);
        const body = target === 'me' ? {} : { to: target.email };
        const tid = toast.loading('Enviando correo de prueba…');
        try {
            const res = await api.post<{ to: string }>('/reportes/enviar-prueba', body);
            toast.success(`Reporte de prueba enviado a ${res.data.to}`, { id: tid });
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al enviar la prueba', { id: tid });
        } finally {
            setSendingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    {suscriptores.length} suscriptor{suscriptores.length !== 1 ? 'es' : ''} · el reporte se envía los lunes 08:00
                </p>
                {puedeGestionar && (
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => handleSendTest('me')} isLoading={sendingId === 'me'} leftIcon={<Send className="h-4 w-4" />}>
                            <span className="hidden sm:inline">Probarme a mí</span>
                            <span className="sm:hidden">Probar</span>
                        </Button>
                        <Button size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="h-4 w-4" />}>
                            <span className="hidden sm:inline">Nuevo Suscriptor</span>
                            <span className="sm:hidden">Nuevo</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Form panel */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-background rounded-2xl border border-border p-5 space-y-4"
                    >
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-brand-dark">{editingId ? 'Editar Suscriptor' : 'Nuevo Suscriptor'}</h4>
                            <IconButton onClick={() => setShowForm(false)} aria-label="Cerrar" icon={<X className="h-4 w-4" />} />
                        </div>
                        <Input
                            label="Email"
                            type="email"
                            placeholder="correo@empresa.cl"
                            value={form.email}
                            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                        />
                        <Input
                            label="Nombre (opcional)"
                            placeholder="Ej: Mauricio Álvarez"
                            value={form.nombre}
                            onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                        />
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={form.activo}
                                onChange={(e) => setForm(f => ({ ...f, activo: e.target.checked }))}
                                className="w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
                            />
                            <span className="text-sm text-brand-dark font-medium">Activo (recibe el reporte semanal)</span>
                        </label>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                            <Button onClick={handleSave} isLoading={saving} leftIcon={<Save className="h-4 w-4" />}>
                                {editingId ? 'Actualizar' : 'Guardar'}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lista */}
            {suscriptores.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                    <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Sin suscriptores</p>
                    <p className="text-sm mt-1">Agrega destinatarios para que reciban el reporte automático.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {suscriptores.map((s) => (
                        <div
                            key={s.id}
                            className={cn(
                                "bg-card rounded-2xl border p-5 flex items-start justify-between gap-3 transition-all",
                                s.activo ? "border-border" : "border-border opacity-60"
                            )}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-semibold text-brand-dark">{s.nombre || s.email}</h4>
                                    <span className={cn(
                                        "text-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                                        s.activo ? "bg-brand-primary/10 text-brand-primary" : "bg-muted text-muted-foreground"
                                    )}>
                                        {s.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </div>
                                {s.nombre && <p className="text-xs text-muted-foreground mt-1 truncate">{s.email}</p>}
                            </div>
                            {puedeGestionar && (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <IconButton
                                        onClick={() => handleSendTest({ id: s.id, email: s.email })}
                                        disabled={sendingId === s.id}
                                        aria-label="Enviar prueba"
                                        title="Enviar reporte de prueba a este correo"
                                        icon={sendingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    />
                                    <IconButton
                                        onClick={() => handleToggleActivo(s)}
                                        aria-label={s.activo ? 'Desactivar' : 'Activar'}
                                        title={s.activo ? 'Desactivar' : 'Activar'}
                                        icon={s.activo ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                                    />
                                    <IconButton
                                        onClick={() => handleOpenEdit(s)}
                                        aria-label="Editar"
                                        title="Editar"
                                        icon={<Pencil className="h-4 w-4" />}
                                    />
                                    <IconButton
                                        variant="danger"
                                        onClick={() => handleDelete(s)}
                                        aria-label="Quitar"
                                        title="Quitar"
                                        icon={<Trash2 className="h-4 w-4" />}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ReporteSuscriptoresPanel;
