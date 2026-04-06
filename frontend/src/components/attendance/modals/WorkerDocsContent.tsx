import React from 'react';
import { FileDown, FilePlus, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../../ui/Button';
import { DocumentUploader } from '../../documents/DocumentUploader';
import { DocumentList } from '../../documents/DocumentList';
import api from '../../../services/api';
import { cn } from '../../../utils/cn';
import type { Trabajador } from '../../../types/entities';

interface WorkerDocsContentProps {
    worker: Trabajador;
    isUploading: boolean;
    setIsUploading: (val: boolean) => void;
    hasPermission: (perm: string) => boolean;
    onSuccess: () => void;
}

export const WorkerDocsContent: React.FC<WorkerDocsContentProps> = ({
    worker,
    isUploading,
    setIsUploading,
    hasPermission,
    onSuccess
}) => {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-[#F9F9FB] p-5 rounded-2xl border border-[#E8E8ED]">
                <div>
                    <h4 className="text-base font-bold text-brand-dark tracking-tight">Bóveda de Documentos</h4>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider opacity-70">
                        Expediente digital de {worker.apellido_paterno} {worker.nombres}
                    </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    {!isUploading && (
                        <Button
                            size="sm"
                            variant="glass"
                            onClick={async () => {
                                try {
                                    const nid = toast.loading('Generando ZIP...');
                                    const response = await api.get(`/documentos/download-all/${worker.id}`, {
                                        responseType: 'blob',
                                    });
                                    const url = window.URL.createObjectURL(new Blob([response.data]));
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.setAttribute('download', `Documentos_${worker.apellido_paterno}_${worker.nombres}.zip`);
                                    document.body.appendChild(link);
                                    link.click();
                                    link.remove();
                                    toast.dismiss(nid);
                                    toast.success('Descarga iniciada');
                                } catch (err) {
                                    toast.error('Error al descargar documentos');
                                }
                            }}
                            className="text-brand-primary font-bold border-brand-primary/20 flex-1 sm:flex-initial"
                            leftIcon={<FileDown className="h-4 w-4" />}
                        >
                            <span className="hidden sm:inline">Descargar (.zip)</span>
                            <span className="sm:hidden">Descargar</span>
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant={isUploading ? 'glass' : 'primary'}
                        disabled={!hasPermission('documentos.subir') && !isUploading}
                        onClick={() => setIsUploading(!isUploading)}
                        leftIcon={isUploading ? <ArrowLeft className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                        className={cn(
                            "flex-1 sm:flex-initial font-bold shadow-sm",
                            (!hasPermission('documentos.subir') && !isUploading) && "opacity-50 grayscale cursor-not-allowed"
                        )}
                        title={(!hasPermission('documentos.subir') && !isUploading) ? "No tienes permisos" : (isUploading ? "Volver" : "Subir Documento")}
                    >
                        <span className="hidden sm:inline">{isUploading ? 'Volver a la lista' : 'Subir Documento'}</span>
                        <span className="sm:hidden">{isUploading ? 'Volver' : 'Subir'}</span>
                    </Button>
                </div>
            </div>

            {isUploading ? (
                <DocumentUploader
                    trabajadorId={worker.id}
                    onCancel={() => setIsUploading(false)}
                    onSuccess={() => {
                        setIsUploading(false);
                        onSuccess();
                    }}
                />
            ) : (
                <DocumentList trabajadorId={worker.id} />
            )}
        </div>
    );
};
