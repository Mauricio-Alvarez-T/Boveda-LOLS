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
            <div className="bg-white rounded-2xl border border-[#D2D2D7] p-12 text-center">
                <AlertCircle className="h-12 w-12 text-[#FF9F0A] mx-auto mb-4" />
                <h3 className="text-xl font-bold text-[#1D1D1F]">Selecciona una obra</h3>
                <p className="text-[#6E6E73] mt-2">
                    Debes seleccionar una obra en el selector superior para configurar sus horarios.
                </p>
            </div>
        );
    }

    if (loading) {
        return <div className="p-8 text-center text-[#6E6E73]">Cargando configuración...</div>;
    }

    return (
        <div className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden">
            <div className="p-6 border-b border-[#D2D2D7] flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-[#1D1D1F] flex items-center gap-2">
                        <Clock className="h-5 w-5 text-[#0071E3]" />
                        Horarios por Defecto
                    </h2>
                    <p className="text-sm text-[#6E6E73] mt-1">
                        Configura los horarios estándar semanales para la obra <strong>{selectedObra.nombre}</strong>.
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    leftIcon={<Save className="h-4 w-4" />}
                >
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
            </div>

            <div className="p-6">
                <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-4 mb-4 px-4 py-2 bg-[#F5F5F7] rounded-xl text-xs font-bold text-[#6E6E73] uppercase tracking-wider">
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
                            <div key={dia.key} className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-4 items-center px-4 py-3 rounded-xl hover:bg-[#F5F5F7] transition-colors border border-transparent hover:border-[#D2D2D7]">
                                <div className="font-semibold text-[#1D1D1F] capitalize">
                                    {dia.label}
                                </div>
                                <div>
                                    <Input
                                        type="time"
                                        value={horario.hora_entrada}
                                        onChange={(e) => updateHorario(dia.key, 'hora_entrada', e.target.value)}
                                        className="h-10 bg-white"
                                    />
                                </div>
                                <div>
                                    <Input
                                        type="time"
                                        value={horario.hora_salida}
                                        onChange={(e) => updateHorario(dia.key, 'hora_salida', e.target.value)}
                                        className="h-10 bg-white"
                                    />
                                </div>
                                <div>
                                    <Input
                                        type="time"
                                        value={horario.hora_colacion_inicio}
                                        onChange={(e) => updateHorario(dia.key, 'hora_colacion_inicio', e.target.value)}
                                        className="h-10 bg-white"
                                    />
                                </div>
                                <div>
                                    <Input
                                        type="time"
                                        value={horario.hora_colacion_fin}
                                        onChange={(e) => updateHorario(dia.key, 'hora_colacion_fin', e.target.value)}
                                        className="h-10 bg-white"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
