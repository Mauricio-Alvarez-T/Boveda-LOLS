import React, { useState, useEffect } from 'react';
import {
    FileText,
    Download,
    Trash2,
    Calendar,
    AlertCircle,
    CheckCircle2,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '../ui/Button';
import api from '../../services/api';
import type { Documento } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { cn } from '../../utils/cn';

interface DocumentListProps {
    trabajadorId: number;
}

export const DocumentList: React.FC<DocumentListProps> = ({ trabajadorId }) => {
    const [documents, setDocuments] = useState<Documento[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const res = await api.get<ApiResponse<Documento[]>>(`/documentos/trabajador/${trabajadorId}`);
            const data = Array.isArray(res.data.data) ? res.data.data : [];
            setDocuments(data);
        } catch (err) {
            toast.error('Error al cargar documentos');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [trabajadorId]);

    const handleDownload = async (doc: Documento) => {
        try {
            const response = await api.get(`/documentos/download/${doc.id}`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', doc.nombre_archivo);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            toast.error('Error al descargar archivo');
        }
    };

    const handleToggleActive = async (doc: Documento) => {
        try {
            await api.delete(`/documentos/${doc.id}`);
            toast.success(doc.activo ? 'Documento archivado' : 'Documento restaurado');
            fetchDocuments();
        } catch (err) {
            toast.error('Error al modificar documento');
        }
    };

    const isExpired = (date: string | null) => {
        if (!date) return false;
        return new Date(date) < new Date();
    };

    if (loading) {
        return (
            <div className="py-20 flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                <p className="text-muted-foreground text-sm mt-4">Consultando boveda...</p>
            </div>
        );
    }

    if (documents.length === 0) {
        return (
            <div className="py-16 text-center premium-card border-dashed">
                <div className="h-16 w-16 rounded-full bg-[#F5F5F7] flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h4 className="text-lg font-semibold text-[#1D1D1F]">Sin documentos</h4>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
                    Este trabajador no tiene archivos registrados actualmente.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence>
                {documents.map((doc, i) => (
                    <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className={cn(
                            "premium-card p-4 group relative flex flex-col gap-3",
                            !doc.activo && "opacity-50 grayscale",
                            isExpired(doc.fecha_vencimiento) && "border-rose-500/30"
                        )}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className={cn(
                                    "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                                    isExpired(doc.fecha_vencimiento) ? "bg-rose-500/10 text-rose-500" : "bg-brand-primary/10 text-brand-primary"
                                )}>
                                    <FileText className="h-6 w-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-base font-bold text-white truncate">{doc.tipo_nombre || 'Documento'}</h4>
                                    <p className="text-xs text-muted-foreground truncate">{doc.nombre_archivo}</p>
                                </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                                <Button variant="glass" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                                    <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="glass"
                                    size="icon"
                                    className={cn("h-8 w-8", doc.activo ? "text-rose-400" : "text-emerald-400")}
                                    onClick={() => handleToggleActive(doc)}
                                >
                                    {doc.activo ? <Trash2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-xs mt-2 bg-[#F5F5F7] p-2.5 rounded-lg">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                Subido: {new Date(doc.fecha_subida).toLocaleDateString()}
                            </div>
                            {doc.fecha_vencimiento ? (
                                <div className={cn(
                                    "flex items-center gap-1.5 font-bold",
                                    isExpired(doc.fecha_vencimiento) ? "text-rose-400" : "text-emerald-400"
                                )}>
                                    {isExpired(doc.fecha_vencimiento) ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                    Vence: {new Date(doc.fecha_vencimiento).toLocaleDateString()}
                                </div>
                            ) : (
                                <div className="text-muted-foreground italic">Sin vencimiento</div>
                            )}
                        </div>

                        {!doc.activo && (
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#E8E8ED] text-[#6E6E73] text-xs font-bold uppercase tracking-wider">
                                Archivado
                            </div>
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
