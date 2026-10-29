import React, { useState, useEffect } from 'react';
import {
    FileText,
    Download,
    Trash2,
    Calendar,
    AlertCircle,
    CheckCircle2,
    Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { showDeleteToast } from '../../utils/toastUtils';
import { useAuth } from '../../context/AuthContext';

import { IconButton } from '../ui/IconButton';
import { Cargando, Skeleton } from '../ui/Skeleton';
import api from '../../services/api';
import type { Documento } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { cn } from '../../utils/cn';
import { descargarArchivo } from '../../utils/descargarArchivo';

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
            // El endpoint responde el ARRAY plano (sin envelope `{data}`): leer solo `res.data.data`
            // dejaba la lista siempre vacía. Se acepta cualquiera de las dos formas.
            const res = await api.get<ApiResponse<Documento[]> | Documento[]>(`/documentos/trabajador/${trabajadorId}`);
            const raw = (res.data as ApiResponse<Documento[]>)?.data ?? res.data;
            setDocuments(Array.isArray(raw) ? raw : []);
        } catch (err) {
            toast.error('Error al cargar documentos');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [trabajadorId]);

    // Restringido (contrato/finiquito/anexo, mig 110) → /documentos-laborales con su gate exclusivo;
    // el helper muestra el 403 con el nombre del permiso que falta (antes el GET fallaba mudo).
    const handleDownload = async (doc: Documento) => {
        const url = doc.restringido ? `/documentos-laborales/${doc.id}/download` : `/documentos/download/${doc.id}`;
        await descargarArchivo(api, url, { nombre: doc.nombre_archivo, modo: 'download' });
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

    // Silueta de la tabla de documentos: ícono, tipo y archivo, fecha y estado (desde sm) y las dos acciones.
    if (loading) {
        return (
            <Cargando que="los documentos" className="bg-card rounded-2xl border border-border overflow-hidden">
                <ul className="divide-y divide-border" aria-hidden="true">
                    {[0, 1, 2, 3].map(i => (
                        <li key={i} className="flex items-center gap-3 border-l-4 border-l-transparent px-4 py-3">
                            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <Skeleton className={cn('h-3.5', i % 2 ? 'w-2/5' : 'w-1/2')} />
                                <Skeleton className="h-3 w-3/4 sm:w-1/2" />
                            </div>
                            <Skeleton className="hidden h-6 w-20 shrink-0 rounded-md sm:block" />
                            <Skeleton className="hidden h-6 w-16 shrink-0 rounded-md sm:block" />
                            <div className="flex shrink-0 gap-2 sm:ml-5">
                                <Skeleton className="h-11 w-11 rounded-full md:h-9 md:w-9" />
                                <Skeleton className="h-11 w-11 rounded-full md:h-9 md:w-9" />
                            </div>
                        </li>
                    ))}
                </ul>
            </Cargando>
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
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <tbody className="divide-y divide-border">
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
                                            isExpired(doc.fecha_vencimiento) && "bg-destructive/5 dark:bg-destructive/10 hover:border-l-destructive"
                                        )}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm border",
                                                    isExpired(doc.fecha_vencimiento)
                                                        ? "bg-destructive/10 text-destructive border-destructive/20"
                                                        : "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                                                )}>
                                                    <FileText className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <h4 className="text-sm font-bold text-brand-dark truncate" title={doc.tipo_nombre}>
                                                        {doc.tipo_nombre || 'Documento'}
                                                    </h4>
                                                    <span className="text-label text-muted-foreground truncate mt-0.5" title={doc.nombre_archivo}>
                                                        {doc.nombre_archivo}
                                                    </span>
                                                    {(doc.origen === 'generado' || doc.restringido) && (
                                                        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-caption font-bold uppercase tracking-wider text-muted-foreground">
                                                            <Lock className="h-3 w-3" /> {doc.origen === 'generado' ? 'Generado por Bóveda' : 'Solo oficina'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <span className="text-caption font-bold text-muted-foreground flex items-center gap-1.5 bg-background px-2 py-1 rounded-md border border-border">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(doc.fecha_subida).toLocaleDateString()}
                                                </span>

                                                {doc.fecha_vencimiento ? (
                                                    <div className={cn(
                                                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-caption font-bold uppercase tracking-wider border",
                                                        isExpired(doc.fecha_vencimiento)
                                                            ? "bg-rose-50 text-rose-600 border-rose-100"
                                                            : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                    )}>
                                                        {isExpired(doc.fecha_vencimiento) ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                                        {isExpired(doc.fecha_vencimiento) ? 'Vencido' : 'Vigente'}
                                                    </div>
                                                ) : (
                                                    <span className="text-caption font-bold text-muted-foreground bg-background px-2 py-1 rounded-md border border-border uppercase tracking-wider">
                                                        Indefinido
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right w-[100px]">
                                            <div className="flex justify-end gap-2">
                                                <IconButton
                                                    variant="ghost"
                                                    aria-label="Descargar"
                                                    title="Descargar"
                                                    className="shadow-sm"
                                                    onClick={() => handleDownload(doc)}
                                                    icon={<Download className="h-4 w-4" />}
                                                />
                                                <IconButton
                                                    variant={doc.activo ? 'danger' : 'ghost'}
                                                    aria-label={doc.activo ? 'Eliminar' : 'Restaurar'}
                                                    className="shadow-sm"
                                                    onClick={() => hasPermission('documentos.eliminar') && handleToggleActive(doc)}
                                                    disabled={!hasPermission('documentos.eliminar')}
                                                    title={!hasPermission('documentos.eliminar') ? "No tienes permisos" : (doc.activo ? "Eliminar" : "Restaurar")}
                                                    icon={doc.activo ? <Trash2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                                />
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
