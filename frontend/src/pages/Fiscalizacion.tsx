import React, { useState, useEffect } from 'react';
import {
    Download,
    Mail,
    Search,
    Loader2,
    Archive,
    ShieldCheck,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import api from '../services/api';
import type { Asistencia } from '../types/entities';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';

import { useObra } from '../context/ObraContext';

const FiscalizacionPage: React.FC = () => {
    const { selectedObra } = useObra();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [email, setEmail] = useState('');

    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [sending, setSending] = useState(false);
    const [report, setReport] = useState<Asistencia[]>([]);

    const fetchStatus = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            const res = await api.get<ApiResponse<Asistencia[]>>(`/asistencias/obra/${selectedObra.id}?fecha=${date}`);
            setReport(res.data.data);
        } catch (err) {
            toast.error('Error al cargar reporte de asistencia');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, [selectedObra, date]);

    const handleExport = async () => {
        if (!selectedObra) return;
        setExporting(true);
        try {
            const response = await api.get(`/fiscalizacion/exportar-obra?obra_id=${selectedObra.id}&fecha=${date}`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Fiscalizacion-Obra-${selectedObra.id}-${date}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Bóveda exportada exitosamente');
        } catch (err) {
            toast.error('Error al generar ZIP. Asegúrate de que los trabajadores tengan documentos subidos.');
        } finally {
            setExporting(false);
        }
    };

    const handleSendEmail = async () => {
        if (!selectedObra) return;
        if (!email) {
            toast.error('Especifica un correo destinatario');
            return;
        }
        setSending(true);
        try {
            await api.post('/fiscalizacion/enviar-obra', {
                obra_id: selectedObra.id,
                fecha: date,
                email: email
            });
            toast.success(`Paquete enviado correctamente a ${email}`);
        } catch (err) {
            toast.error('Error al enviar el correo');
        } finally {
            setSending(false);
        }
    };

    const presentCount = report.filter(r => r.estado === 'Presente' || r.estado === 'Atraso').length;

    if (!selectedObra) {
        return (
            <div className="h-[50vh] flex flex-col items-center justify-center text-center p-8">
                <div className="h-16 w-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Archive className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-bold text-white">Selecciona una Obra</h2>
                <p className="text-muted-foreground mt-2 max-w-md">
                    Para gestionar fiscalizaciones, primero debes seleccionar una obra en el menú superior.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Archive className="h-8 w-8 text-brand-primary" />
                        Fiscalización y Exportación
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Proyecto activo: <span className="text-white font-semibold">{selectedObra.nombre}</span>
                    </p>
                </div>
                <div className="h-14 w-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
                    <ShieldCheck className="h-8 w-8 text-brand-primary" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Configuration Card */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="premium-card p-6 space-y-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Search className="h-5 w-5 text-brand-primary" />
                            Configurar Paquete
                        </h3>

                        <div className="space-y-4">
                            <Input
                                label="Fecha de Auditoría"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Trabajadores en nómina:</span>
                                <span className="text-white font-bold">{report.length}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Presentes para exportar:</span>
                                <span className="text-emerald-400 font-bold">{presentCount}</span>
                            </div>
                            <div className="h-px bg-white/10" />
                            <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                                * El ZIP incluirá automáticamente los documentos vigentes de todos los trabajadores marcados como 'Presente' o 'Atraso' en la fecha seleccionada.
                            </p>
                        </div>

                        <Button
                            className="w-full"
                            onClick={handleExport}
                            isLoading={exporting}
                            disabled={loading || presentCount === 0}
                            variant="primary"
                            leftIcon={<Download className="h-5 w-5" />}
                        >
                            Descargar ZIP
                        </Button>
                    </div>

                    <div className="premium-card p-6 space-y-6 border-brand-secondary/30">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Mail className="h-5 w-5 text-brand-secondary" />
                            Enviar por Correo
                        </h3>
                        <Input
                            label="Correo Destinatario"
                            placeholder="fiscalizador@inspeccion.cl"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <Button
                            className="w-full bg-brand-secondary hover:bg-brand-secondary/80 text-white"
                            onClick={handleSendEmail}
                            isLoading={sending}
                            disabled={loading || presentCount === 0 || !email}
                            leftIcon={<Mail className="h-5 w-5" />}
                        >
                            Enviar Paquete
                        </Button>
                    </div>
                </div>

                {/* Status Breakdown */}
                <div className="lg:col-span-2">
                    <div className="premium-card p-0 overflow-hidden min-h-[400px]">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-white font-bold">Estado de los Trabajadores ({date})</h3>
                            {loading && <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/5 uppercase text-[10px] tracking-widest text-muted-foreground">
                                        <th className="px-6 py-4 font-semibold">Trabajador</th>
                                        <th className="px-6 py-4 font-semibold">Estado</th>
                                        <th className="px-6 py-4 font-semibold">Inclusión en ZIP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {report.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-6 py-20 text-center text-muted-foreground italic">
                                                No hay registros de asistencia para esta fecha.
                                                Pasa lista primero en el módulo de Asistencia.
                                            </td>
                                        </tr>
                                    ) : (
                                        report.map((item) => (
                                            <tr key={item.trabajador_id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-semibold text-white">{item.nombres} {item.apellido_paterno}</p>
                                                    <p className="text-[10px] text-muted-foreground">{item.rut}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={cn(
                                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase",
                                                        item.estado === 'Presente' ? "bg-emerald-500/10 text-emerald-400" :
                                                            item.estado === 'Atraso' ? "bg-amber-500/10 text-amber-400" :
                                                                "bg-rose-500/10 text-rose-400"
                                                    )}>
                                                        {item.estado}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {(item.estado === 'Presente' || item.estado === 'Atraso') ? (
                                                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                                                            <CheckCircle2 className="h-4 w-4" /> Incluido
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium italic">
                                                            <AlertCircle className="h-4 w-4" /> Excluido
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FiscalizacionPage;
