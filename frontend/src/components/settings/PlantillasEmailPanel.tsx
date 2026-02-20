import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Star, StarOff, Loader2, Mail, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { showDeleteToast } from '../../utils/toastUtils';
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

interface FormState {
    nombre: string;
    asunto: string;
    cuerpo: string;
}

const DEFAULT_TEMPLATES: Omit<PlantillaCorreo, 'id' | 'es_predeterminada'>[] = [
    {
        nombre: 'Formal (Inspección)',
        asunto: 'Documentación para Fiscalización - Bóveda LOLS',
        cuerpo: `Estimado(a) Inspector(a),

Junto con saludar cordialmente, adjunto a la presente la nómina de trabajadores y la documentación correspondiente solicitada para la fiscalización del día de la fecha.

Quedo a su disposición para cualquier consulta adicional.

Atentamente,
[Tu Nombre]
[Cargo] - Bóveda LOLS`
    },
    {
        nombre: 'Simple (Interno)',
        asunto: 'Reporte de Nómina - Bóveda LOLS',
        cuerpo: `Hola,

Se adjunta el reporte de nómina generado desde el sistema Bóveda LOLS.

Saludos,
[Tu Nombre]`
    },
    {
        nombre: 'Dirección del Trabajo (DT)',
        asunto: 'Antecedentes Dirección del Trabajo - Bóveda LOLS',
        cuerpo: `Estimado(a) Inspector(a) de la Dirección del Trabajo,

En cumplimiento a lo solicitado en visita de fiscalización, se adjunta nómina de personal activo con los antecedentes contractuales y documentales respectivos.

Esta documentación fue generada desde el Sistema de Gestión Documental Bóveda LOLS.

Quedo a disposición del tribunal.

Atentamente,
[Nombre y Cargo]
[RUT Empresa]`
    }
];

const PlantillasEmailPanel: React.FC = () => {
    const [plantillas, setPlantillas] = useState<PlantillaCorreo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState>({ nombre: '', asunto: '', cuerpo: '' });
    const [saving, setSaving] = useState(false);

    const fetchPlantillas = async () => {
        setLoading(true);
        try {
            const res = await api.get<{ data: PlantillaCorreo[] }>('/usuarios/me/plantillas');
            setPlantillas(res.data.data);
        } catch (err) {
            toast.error('Error al cargar plantillas');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPlantillas(); }, []);

    const handleOpenCreate = () => {
        setEditingId(null);
        setForm({ nombre: '', asunto: '', cuerpo: '' });
        setShowForm(true);
    };

    const handleOpenEdit = (p: PlantillaCorreo) => {
        setEditingId(p.id);
        setForm({ nombre: p.nombre, asunto: p.asunto, cuerpo: p.cuerpo });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.nombre || !form.asunto || !form.cuerpo) {
            toast.error('Todos los campos son requeridos');
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                await api.put(`/usuarios/me/plantillas/${editingId}`, form);
                toast.success('Plantilla actualizada');
            } else {
                await api.post('/usuarios/me/plantillas', form);
                toast.success('Plantilla creada');
            }
            setShowForm(false);
            fetchPlantillas();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar plantilla');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (p: PlantillaCorreo) => {
        showDeleteToast({
            message: `¿Eliminar la plantilla "${p.nombre}"?`,
            onConfirm: async () => {
                await api.delete(`/usuarios/me/plantillas/${p.id}`);
                fetchPlantillas();
            }
        });
    };

    const handleSetDefault = async (id: number) => {
        try {
            await api.put(`/usuarios/me/plantillas/${id}/predeterminar`);
            fetchPlantillas();
            toast.success('Plantilla predeterminada actualizada');
        } catch (err) {
            toast.error('Error al actualizar');
        }
    };

    const handleCreateDefaults = async () => {
        setSaving(true);
        try {
            for (const tpl of DEFAULT_TEMPLATES) {
                await api.post('/usuarios/me/plantillas', tpl);
            }
            await api.put(`/usuarios/me/plantillas/1/predeterminar`).catch(() => { });
            toast.success('3 plantillas de ejemplo creadas');
            fetchPlantillas();
        } catch (err) {
            toast.error('Error al crear plantillas de ejemplo');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#0071E3]" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-[#6E6E73]">
                        {plantillas.length} plantilla{plantillas.length !== 1 ? 's' : ''} configurada{plantillas.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    {plantillas.length === 0 && (
                        <Button variant="secondary" onClick={handleCreateDefaults} isLoading={saving} leftIcon={<Mail className="h-4 w-4" />}>
                            Crear plantillas de ejemplo
                        </Button>
                    )}
                    <Button onClick={handleOpenCreate} leftIcon={<Plus className="h-4 w-4" />}>
                        Nueva Plantilla
                    </Button>
                </div>
            </div>

            {/* Form panel */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-[#F5F5F7] rounded-2xl border border-[#D2D2D7] p-5 space-y-4"
                    >
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-[#1D1D1F]">{editingId ? 'Editar Plantilla' : 'Nueva Plantilla'}</h4>
                            <button onClick={() => setShowForm(false)} className="text-[#6E6E73] hover:text-[#1D1D1F]">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <Input
                            label="Nombre de la Plantilla"
                            placeholder="Ej: Formal, Inspección DT..."
                            value={form.nombre}
                            onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                        />
                        <Input
                            label="Asunto del Correo"
                            placeholder="Ej: Documentación para Fiscalización"
                            value={form.asunto}
                            onChange={(e) => setForm(f => ({ ...f, asunto: e.target.value }))}
                        />
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-[#6E6E73]">Cuerpo del Correo</label>
                            <textarea
                                rows={6}
                                placeholder="Escribe el cuerpo del correo..."
                                className="w-full rounded-xl border border-[#D2D2D7] bg-white px-4 py-3 text-sm text-[#1D1D1F] placeholder:text-[#A1A1A6] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30 focus:border-[#0071E3] transition-all resize-none"
                                value={form.cuerpo}
                                onChange={(e) => setForm(f => ({ ...f, cuerpo: e.target.value }))}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                            <Button onClick={handleSave} isLoading={saving} leftIcon={<Save className="h-4 w-4" />}>
                                {editingId ? 'Actualizar' : 'Guardar'}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Template Cards */}
            {plantillas.length === 0 ? (
                <div className="text-center py-16 text-[#6E6E73]">
                    <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Sin plantillas configuradas</p>
                    <p className="text-sm mt-1">Crea una plantilla o usa las de ejemplo para empezar.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {plantillas.map((p) => (
                        <div
                            key={p.id}
                            className={cn(
                                "bg-white rounded-2xl border p-5 transition-all",
                                p.es_predeterminada ? "border-[#0071E3]/40 shadow-sm shadow-[#0071E3]/10" : "border-[#D2D2D7]"
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-semibold text-[#1D1D1F]">{p.nombre}</h4>
                                        {p.es_predeterminada && (
                                            <span className="text-[10px] font-bold uppercase tracking-wide bg-[#0071E3]/10 text-[#0071E3] px-2 py-0.5 rounded-full">
                                                Predeterminada
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-[#6E6E73] mt-1 truncate">Asunto: {p.asunto}</p>
                                    <p className="text-xs text-[#A1A1A6] mt-1 line-clamp-2 whitespace-pre-line">{p.cuerpo}</p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                        onClick={() => handleSetDefault(p.id)}
                                        className={cn(
                                            "p-2 rounded-lg text-sm transition-colors",
                                            p.es_predeterminada ? "text-[#FF9F0A]" : "text-[#6E6E73] hover:text-[#FF9F0A] hover:bg-[#FF9F0A]/8"
                                        )}
                                        title={p.es_predeterminada ? 'Ya es predeterminada' : 'Marcar como predeterminada'}
                                    >
                                        {p.es_predeterminada ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                                    </button>
                                    <button
                                        onClick={() => handleOpenEdit(p)}
                                        className="p-2 rounded-lg text-[#6E6E73] hover:text-[#0071E3] hover:bg-[#0071E3]/8 transition-colors"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(p)}
                                        className="p-2 rounded-lg text-[#6E6E73] hover:text-[#FF3B30] hover:bg-[#FF3B30]/8 transition-colors"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PlantillasEmailPanel;
