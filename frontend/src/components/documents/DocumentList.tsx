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
import { showDeleteToast } from '../../utils/toastUtils';
import { useAuth } from '../../context/AuthContext';

import { Button } from '../ui/Button';
import api from '../../services/api';
import type { Documento } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { cn } from '../../utils/cn';

interface DocumentListProps {
    trabajadorId: number;
}

export const DocumentList: React.FC<DocumentListProps> = ({ trabajadorId }) => {
    const { hasPermission } = useAuth();
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

    const handleToggleActive = (doc: Documento) => {
        if (doc.activo) {
            showDeleteToast({
                onConfirm: async () => {
                    await api.delete(`/documentos/${doc.id}`);
                    fetchDocuments();
                },
                message: "¿Eliminar?",
                successMessage: "Documento eliminado",
                errorMessage: "Error al eliminar documento"
            });
        } else {
            restoreDocument();
        }
    };

    const restoreDocument = async () => {
        try {
            // Future implementation for restore
        } catch (err) { }
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

    // Custom empty state if needed, or just let the table header show up?
    // The previous code returned early if empty.
    // If we want "Download All" to be visible, we need it outside.
    // But if there are no docs, Download All makes no sense.

    if (documents.length === 0) {
        return (
            <div className="py-16 text-center premium-card border-dashed">
                <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h4 className="text-lg font-semibold text-brand-dark">Sin documentos</h4>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
                    Este trabajador no tiene archivos registrados actualmente.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* The table container */}
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <tbody className="divide-y divide-[#E8E8ED]">
                            <AnimatePresence>
                                {documents.map((doc, i) => (
                                    <motion.tr
                                        key={doc.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className={cn(
                                            "group border-l-4 border-l-transparent hover:border-l-brand-primary hover:bg-background/80 transition-all duration-300 relative",
                                            !doc.activo && "opacity-50 grayscale",
                                            isExpired(doc.fecha_vencimiento) && "bg-rose-50/20 hover:border-l-rose-500"
                                        )}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm border",
                                                    isExpired(doc.fecha_vencimiento)
                                                        ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                                        : "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                                                )}>
                                                    <FileText className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <h4 className="text-sm font-bold text-brand-dark truncate" title={doc.tipo_nombre}>
                                                        {doc.tipo_nombre || 'Documento'}
                                                    </h4>
                                                    <span className="text-[11px] text-muted truncate mt-0.5" title={doc.nombre_archivo}>
                                                        {doc.nombre_archivo}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 bg-background px-2 py-1 rounded-md border border-[#E8E8ED]">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(doc.fecha_subida).toLocaleDateString()}
                                                </span>

                                                {doc.fecha_vencimiento ? (
                                                    <div className={cn(
                                                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                                                        isExpired(doc.fecha_vencimiento)
                                                            ? "bg-rose-50 text-rose-600 border-rose-100"
                                                            : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                    )}>
                                                        {isExpired(doc.fecha_vencimiento) ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                                        {isExpired(doc.fecha_vencimiento) ? 'Vencido' : 'Vigente'}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-muted-foreground bg-background px-2 py-1 rounded-md border border-[#E8E8ED] uppercase tracking-wider">
                                                        Indefinido
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right w-[100px]">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="glass"
                                                    size="icon"
                                                    className="h-9 w-9 text-brand-primary shadow-sm hover:scale-110 active:scale-95 transition-all"
                                                    onClick={() => handleDownload(doc)}
                                                >
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="glass"
                                                    size="icon"
                                                    className={cn(
                                                        "h-9 w-9 shadow-sm hover:scale-110 active:scale-95 transition-all text-rose-500",
                                                        !doc.activo && "text-emerald-500",
                                                        !hasPermission('documentos.eliminar') && "opacity-30 grayscale cursor-not-allowed"
                                                    )}
                                                    onClick={() => hasPermission('documentos.eliminar') && handleToggleActive(doc)}
                                                    disabled={!hasPermission('documentos.eliminar')}
                                                    title={!hasPermission('documentos.eliminar') ? "No tienes permisos" : (doc.activo ? "Eliminar" : "Restaurar")}
                                                >
                                                    {doc.activo ? <Trash2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
