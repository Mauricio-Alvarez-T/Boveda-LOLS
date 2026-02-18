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
                <div className="h-14 w-14 bg-[#F5F5F7] rounded-full flex items-center justify-center mb-4">
                    <Archive className="h-7 w-7 text-[#6E6E73]" />
                </div>
                <h2 className="text-lg font-semibold text-[#1D1D1F]">Selecciona una Obra</h2>
                <p className="text-[#6E6E73] mt-2 max-w-md text-sm">
                    Para gestionar fiscalizaciones, primero debes seleccionar una obra en el menú superior.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#1D1D1F] flex items-center gap-3">
                        <Archive className="h-7 w-7 text-[#0071E3]" />
                        Fiscalización y Exportación
                    </h1>
                    <p className="text-[#6E6E73] mt-1 text-sm">
                        Proyecto activo: <span className="text-[#1D1D1F] font-semibold">{selectedObra.nombre}</span>
                    </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-[#0071E3]/8 flex items-center justify-center">
                    <ShieldCheck className="h-6 w-6 text-[#0071E3]" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Configuration Card */}
                <div className="lg:col-span-1 space-y-5">
                    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-6 space-y-5">
                        <h3 className="text-base font-semibold text-[#1D1D1F] flex items-center gap-2">
                            <Search className="h-4 w-4 text-[#0071E3]" />
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

                        <div className="p-4 rounded-xl bg-[#F5F5F7] space-y-3">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-[#6E6E73]">Trabajadores en nómina:</span>
                                <span className="text-[#1D1D1F] font-semibold">{report.length}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-[#6E6E73]">Presentes para exportar:</span>
                                <span className="text-[#34C759] font-semibold">{presentCount}</span>
                            </div>
                            <div className="h-px bg-[#D2D2D7]" />
                            <p className="text-[10px] text-[#A1A1A6] italic leading-relaxed">
                                * El ZIP incluirá automáticamente los documentos vigentes de todos los trabajadores marcados como 'Presente' o 'Atraso' en la fecha seleccionada.
                            </p>
                        </div>

                        <Button
                            className="w-full"
                            onClick={handleExport}
                            isLoading={exporting}
                            disabled={loading || presentCount === 0}
                            variant="primary"
                            leftIcon={<Download className="h-4 w-4" />}
                        >
                            Descargar ZIP
                        </Button>
                    </div>

                    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-6 space-y-5">
                        <h3 className="text-base font-semibold text-[#1D1D1F] flex items-center gap-2">
                            <Mail className="h-4 w-4 text-[#5856D6]" />
                            Enviar por Correo
                        </h3>
                        <Input
                            label="Correo Destinatario"
                            placeholder="fiscalizador@inspeccion.cl"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <Button
                            className="w-full"
                            variant="secondary"
                            onClick={handleSendEmail}
                            isLoading={sending}
                            disabled={loading || presentCount === 0 || !email}
                            leftIcon={<Mail className="h-4 w-4" />}
                        >
                            Enviar Paquete
                        </Button>
                    </div>
                </div>

                {/* Status Breakdown */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden min-h-[400px]">
                        <div className="px-6 py-5 border-b border-[#D2D2D7] flex items-center justify-between">
                            <h3 className="text-[#1D1D1F] font-semibold">Estado de los Trabajadores ({date})</h3>
                            {loading && <Loader2 className="h-5 w-5 animate-spin text-[#0071E3]" />}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-[#F5F5F7] uppercase text-[10px] tracking-widest text-[#6E6E73]">
                                        <th className="px-6 py-3.5 font-semibold">Trabajador</th>
                                        <th className="px-6 py-3.5 font-semibold">Estado</th>
                                        <th className="px-6 py-3.5 font-semibold">Inclusión en ZIP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E8E8ED]">
                                    {report.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-6 py-20 text-center text-[#6E6E73] italic text-sm">
                                                No hay registros de asistencia para esta fecha.
                                                Pasa lista primero en el módulo de Asistencia.
                                            </td>
                                        </tr>
                                    ) : (
                                        report.map((item) => (
                                            <tr key={item.trabajador_id} className="hover:bg-[#F5F5F7]/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-semibold text-[#1D1D1F]">{item.nombres} {item.apellido_paterno}</p>
                                                    <p className="text-[10px] text-[#6E6E73]">{item.rut}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={cn(
                                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase",
                                                        item.estado === 'Presente' ? "bg-[#34C759]/10 text-[#34C759]" :
                                                            item.estado === 'Atraso' ? "bg-[#FF9F0A]/10 text-[#FF9F0A]" :
                                                                "bg-[#FF3B30]/10 text-[#FF3B30]"
                                                    )}>
                                                        {item.estado}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {(item.estado === 'Presente' || item.estado === 'Atraso') ? (
                                                        <div className="flex items-center gap-2 text-[#34C759] text-xs font-medium">
                                                            <CheckCircle2 className="h-4 w-4" /> Incluido
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-[#A1A1A6] text-xs font-medium italic">
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
