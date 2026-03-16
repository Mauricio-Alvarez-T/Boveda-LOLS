import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useObra } from '../../context/ObraContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Save, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ConfiguracionHorario } from '../../types/entities';

const diasSemana = [
    { key: 'lun', label: 'Lunes' },
    { key: 'mar', label: 'Martes' },
    { key: 'mie', label: 'Miércoles' },
    { key: 'jue', label: 'Jueves' },
    { key: 'vie', label: 'Viernes' },
] as const;

export const HorariosConfigPanel: React.FC = () => {
    const { selectedObra } = useObra();
    const [horarios, setHorarios] = useState<ConfiguracionHorario[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (selectedObra) {
            fetchHorarios();
        }
    }, [selectedObra]);

    const fetchHorarios = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/config-horarios/obra/${selectedObra?.id}`);
            const data = response.data.data;

            // Si no hay datos, inicializamos con vacíos
            if (data.length === 0) {
                const defaultHorarios = diasSemana.map(d => ({
                    obra_id: selectedObra!.id,
                    dia_semana: d.key,
                    hora_entrada: '08:00',
                    hora_salida: '18:00',
                    hora_colacion_inicio: '13:00',
                    hora_colacion_fin: '14:00',
                    activo: true
                })) as ConfiguracionHorario[];
                setHorarios(defaultHorarios);
            } else {
                // Formatear tiempos (quitar segundos si los hay)
                const formatted = data.map((h: any) => ({
                    ...h,
                    hora_entrada: h.hora_entrada.substring(0, 5),
                    hora_salida: h.hora_salida.substring(0, 5),
                    hora_colacion_inicio: h.hora_colacion_inicio.substring(0, 5),
                    hora_colacion_fin: h.hora_colacion_fin.substring(0, 5),
                }));
                setHorarios(formatted);
            }
        } catch (error) {
            console.error('Error fetching horarios:', error);
            toast.error('Error al cargar la configuración de horarios');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedObra) return;
        try {
            setSaving(true);
            await api.put(`/config-horarios/obra/${selectedObra.id}/bulk`, { schedules: horarios });
            toast.success('Horarios guardados correctamente');
        } catch (error) {
            console.error('Error saving horarios:', error);
            toast.error('Error al guardar los horarios');
        } finally {
            setSaving(false);
        }
    };

    const updateHorario = (dia: string, field: keyof ConfiguracionHorario, value: string) => {
        setHorarios(prev => prev.map(h =>
            h.dia_semana === dia ? { ...h, [field]: value } : h
        ));
    };

    if (!selectedObra) {
        return (
            <div className="bg-white rounded-2xl border border-border p-12 text-center">
                <AlertCircle className="h-12 w-12 text-warning mx-auto mb-4" />
                <h3 className="text-xl font-bold text-brand-dark">Selecciona una obra</h3>
                <p className="text-muted-foreground mt-2">
                    Debes seleccionar una obra en el selector superior para configurar sus horarios.
                </p>
            </div>
        );
    }

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">Cargando configuración...</div>;
    }

    return (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="p-4 md:p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
                        <Clock className="h-5 w-5 text-brand-primary" />
                        Horarios por Defecto
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configura los horarios estándar semanales para la obra <strong>{selectedObra.nombre}</strong>.
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    leftIcon={<Save className="h-4 w-4" />}
                    className="w-full sm:w-auto"
                >
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
            </div>

            <div className="p-3 md:p-6 bg-background/30">
                {/* ─── DESKTOP VIEW ─── */}
                <div className="hidden md:block">
                    <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-4 mb-4 px-4 py-2 bg-background rounded-xl text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        <div>Día</div>
                        <div>Entrada</div>
                        <div>Salida</div>
                        <div>Inicio Colación</div>
                        <div>Fin Colación</div>
                    </div>

                    <div className="space-y-3">
                        {diasSemana.map((dia) => {
                            const horario = horarios.find(h => h.dia_semana === dia.key);
                            if (!horario) return null;

                            return (
                                <div key={dia.key} className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-4 items-center px-4 py-3 rounded-xl bg-white border border-[#E8E8ED] hover:border-border transition-colors shadow-sm">
                                    <div className="font-semibold text-brand-dark capitalize">
                                        {dia.label}
                                    </div>
                                    <Input type="time" value={horario.hora_entrada} onChange={(e) => updateHorario(dia.key, 'hora_entrada', e.target.value)} className="h-10" />
                                    <Input type="time" value={horario.hora_salida} onChange={(e) => updateHorario(dia.key, 'hora_salida', e.target.value)} className="h-10" />
                                    <Input type="time" value={horario.hora_colacion_inicio} onChange={(e) => updateHorario(dia.key, 'hora_colacion_inicio', e.target.value)} className="h-10" />
                                    <Input type="time" value={horario.hora_colacion_fin} onChange={(e) => updateHorario(dia.key, 'hora_colacion_fin', e.target.value)} className="h-10" />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ─── MOBILE VIEW ─── */}
                <div className="md:hidden space-y-4">
                    {diasSemana.map((dia) => {
                        const horario = horarios.find(h => h.dia_semana === dia.key);
                        if (!horario) return null;

                        return (
                            <div key={dia.key} className="bg-white p-4 rounded-xl border border-border shadow-sm space-y-3">
                                <h3 className="font-bold text-brand-dark capitalize border-b border-background pb-2 mb-3">
                                    {dia.label}
                                </h3>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Entrada</label>
                                        <Input type="time" value={horario.hora_entrada} onChange={(e) => updateHorario(dia.key, 'hora_entrada', e.target.value)} className="h-10 bg-background" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Salida</label>
                                        <Input type="time" value={horario.hora_salida} onChange={(e) => updateHorario(dia.key, 'hora_salida', e.target.value)} className="h-10 bg-background" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Inicio Col.</label>
                                        <Input type="time" value={horario.hora_colacion_inicio} onChange={(e) => updateHorario(dia.key, 'hora_colacion_inicio', e.target.value)} className="h-10 bg-background" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Fin Col.</label>
                                        <Input type="time" value={horario.hora_colacion_fin} onChange={(e) => updateHorario(dia.key, 'hora_colacion_fin', e.target.value)} className="h-10 bg-background" />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
