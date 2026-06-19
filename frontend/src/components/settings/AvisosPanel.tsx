import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Mail, Save, X, Send, Power, PowerOff, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { showDeleteToast } from '../../utils/toastUtils';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

interface Regla { id: number; categoria: string; etiqueta: string; umbral: number; activo: boolean | number; }
interface Suscriptor { id: number; email: string; nombre: string | null; activo: boolean | number; }
interface FormState { email: string; nombre: string; activo: boolean; }

const PERMISO = 'sistema.avisos.gestionar';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AvisosPanel: React.FC = () => {
    const { hasPermission } = useAuth();
    const puedeGestionar = hasPermission(PERMISO);

    const [reglas, setReglas] = useState<Regla[]>([]);
    const [suscriptores, setSuscriptores] = useState<Suscriptor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>({ email: '', nombre: '', activo: true });
    const [saving, setSaving] = useState(false);
    const [sendingId, setSendingId] = useState<number | 'me' | null>(null);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [r, s] = await Promise.all([
                api.get<{ data: Regla[] }>('/avisos/reglas?activo=all'),
                api.get<{ data: Suscriptor[] }>('/avisos/suscriptores?activo=all'),
            ]);
            setReglas(r.data.data || []);
            setSuscriptores(s.data.data || []);
        } catch { toast.error('Error al cargar la configuración de avisos'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchAll(); }, []);

    // ── Reglas (categorías) ──────────────────────────────────────────────
    const updateRegla = async (r: Regla, cambios: Partial<Pick<Regla, 'activo' | 'umbral'>>) => {
        setReglas(prev => prev.map(x => x.id === r.id ? { ...x, ...cambios } : x)); // optimista
        try { await api.put(`/avisos/reglas/${r.id}`, cambios); }
        catch { toast.error('No se pudo guardar el cambio'); fetchAll(); }
    };

    const handleUmbralBlur = (r: Regla, value: string) => {
        const n = Math.max(1, Number(value) || 1);
        if (n !== r.umbral) updateRegla(r, { umbral: n });
    };

    // ── Suscriptores ─────────────────────────────────────────────────────
    const handleOpenCreate = () => { setEditingId(null); setForm({ email: '', nombre: '', activo: true }); setShowForm(true); };
    const handleOpenEdit = (s: Suscriptor) => { setEditingId(s.id); setForm({ email: s.email, nombre: s.nombre || '', activo: !!s.activo }); setShowForm(true); };

    const handleSave = async () => {
        const email = form.email.trim();
        if (!EMAIL_RE.test(email)) { toast.error('Ingresa un email válido'); return; }
        setSaving(true);
        try {
            const payload = { email, nombre: form.nombre.trim() || null, activo: form.activo };
            if (editingId) { await api.put(`/avisos/suscriptores/${editingId}`, payload); toast.success('Suscriptor actualizado'); }
            else { await api.post('/avisos/suscriptores', payload); toast.success('Suscriptor agregado'); }
            setShowForm(false);
            fetchAll();
        } catch (err: any) { toast.error(err.response?.data?.error || 'Error al guardar'); }
        finally { setSaving(false); }
    };

    const handleToggleSuscriptor = async (s: Suscriptor) => {
        try { await api.put(`/avisos/suscriptores/${s.id}`, { activo: !s.activo }); fetchAll(); }
        catch { toast.error('Error al cambiar estado'); }
    };

    const handleDelete = (s: Suscriptor) => {
        showDeleteToast({
            message: `¿Quitar a ${s.nombre || s.email} de los avisos?`,
            onConfirm: async () => { await api.delete(`/avisos/suscriptores/${s.id}`); fetchAll(); },
        });
    };

    const handleSendTest = async (target: { id: number; email: string } | 'me') => {
        const key = target === 'me' ? 'me' : target.id;
        setSendingId(key);
        const body = target === 'me' ? {} : { to: target.email };
        const tid = toast.loading('Enviando resumen de prueba…');
        try {
            const res = await api.post<{ to: string; total: number }>('/avisos/enviar-prueba', body);
            toast.success(`Resumen de prueba enviado a ${res.data.to} (${res.data.total} novedades de ayer)`, { id: tid });
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al enviar la prueba', { id: tid });
        } finally { setSendingId(null); }
    };

    if (loading) {
        return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div>;
    }

    return (
        <div className="space-y-8">
            {/* Intro */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Resumen automático por email cada mañana (08:00) con las novedades del día anterior.
                </p>
                {puedeGestionar && (
                    <Button variant="secondary" size="sm" onClick={() => handleSendTest('me')} isLoading={sendingId === 'me'} leftIcon={<Send className="h-4 w-4" />}>
                        <span className="hidden sm:inline">Probarme a mí</span>
                        <span className="sm:hidden">Probar</span>
                    </Button>
                )}
            </div>

            {/* ── Categorías a vigilar ── */}
            <div className="space-y-3">
                <h4 className="text-xs font-black text-brand-dark/60 uppercase tracking-widest flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-brand-primary" /> Categorías a vigilar
                </h4>
                {reglas.map(r => (
                    <div key={r.id} className={cn(
                        "bg-card rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3",
                        r.activo ? "border-border" : "border-border opacity-60"
                    )}>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-brand-dark">{r.etiqueta}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Avisar si hay al menos <b>{r.umbral}</b> en el día.</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                Umbral
                                <input
                                    type="number" min={1} defaultValue={r.umbral} disabled={!puedeGestionar}
                                    onBlur={e => handleUmbralBlur(r, e.target.value)}
                                    className="w-16 px-2 py-1.5 text-base rounded-lg border border-border bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                />
                            </label>
                            <IconButton
                                disabled={!puedeGestionar}
                                onClick={() => updateRegla(r, { activo: !r.activo })}
                                aria-label={r.activo ? 'Desactivar categoría' : 'Activar categoría'}
                                title={r.activo ? 'Desactivar' : 'Activar'}
                                className="h-10 w-10 sm:h-9 sm:w-9"
                                icon={r.activo ? <Power className="h-4 w-4 text-brand-primary" /> : <PowerOff className="h-4 w-4" />}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Destinatarios ── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-brand-dark/60 uppercase tracking-widest flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-brand-primary" /> Destinatarios ({suscriptores.length})
                    </h4>
                    {puedeGestionar && (
                        <Button size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="h-4 w-4" />}>
                            <span className="hidden sm:inline">Nuevo Destinatario</span><span className="sm:hidden">Nuevo</span>
                        </Button>
                    )}
                </div>

                <AnimatePresence>
                    {showForm && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            className="bg-background rounded-2xl border border-border p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-brand-dark">{editingId ? 'Editar Destinatario' : 'Nuevo Destinatario'}</h4>
                                <IconButton onClick={() => setShowForm(false)} aria-label="Cerrar" title="Cerrar" className="h-10 w-10 sm:h-9 sm:w-9" icon={<X className="h-4 w-4" />} />
                            </div>
                            <Input label="Email" type="email" placeholder="correo@empresa.cl" value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                            <Input label="Nombre (opcional)" placeholder="Ej: Marco Uribe" value={form.nombre}
                                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                                    className="w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary/30" />
                                <span className="text-sm text-brand-dark font-medium">Activo (recibe el resumen diario)</span>
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

                {suscriptores.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">Sin destinatarios</p>
                        <p className="text-sm mt-1">Agrega correos para que reciban el resumen diario.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {suscriptores.map(s => (
                            <div key={s.id} className={cn(
                                "bg-card rounded-2xl border p-4 flex items-start justify-between gap-3",
                                s.activo ? "border-border" : "border-border opacity-60"
                            )}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-semibold text-brand-dark">{s.nombre || s.email}</h4>
                                        <span className={cn("text-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                                            s.activo ? "bg-brand-primary/10 text-brand-primary" : "bg-muted text-muted-foreground")}>
                                            {s.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </div>
                                    {s.nombre && <p className="text-xs text-muted-foreground mt-1 truncate">{s.email}</p>}
                                </div>
                                {puedeGestionar && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <IconButton onClick={() => handleSendTest({ id: s.id, email: s.email })} disabled={sendingId === s.id}
                                            aria-label="Enviar prueba" title="Enviar resumen de prueba a este correo" className="h-10 w-10 sm:h-9 sm:w-9"
                                            icon={sendingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} />
                                        <IconButton onClick={() => handleToggleSuscriptor(s)} aria-label={s.activo ? 'Desactivar' : 'Activar'}
                                            title={s.activo ? 'Desactivar' : 'Activar'} className="h-10 w-10 sm:h-9 sm:w-9"
                                            icon={s.activo ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />} />
                                        <IconButton onClick={() => handleOpenEdit(s)} aria-label="Editar" title="Editar" className="h-10 w-10 sm:h-9 sm:w-9"
                                            icon={<Pencil className="h-4 w-4" />} />
                                        <IconButton variant="danger" onClick={() => handleDelete(s)} aria-label="Quitar" title="Quitar" className="h-10 w-10 sm:h-9 sm:w-9"
                                            icon={<Trash2 className="h-4 w-4" />} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AvisosPanel;
