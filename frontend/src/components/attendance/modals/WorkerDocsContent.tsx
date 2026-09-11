import React from 'react';
import { FileDown, FilePlus, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../../ui/Button';
import { DocumentUploader } from '../../documents/DocumentUploader';
import { DocumentList } from '../../documents/DocumentList';
import api from '../../../services/api';
import { descargarArchivo } from '../../../utils/descargarArchivo';
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
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-muted p-5 rounded-2xl border border-border">
                <div>
                    <h4 className="text-base font-bold text-brand-dark tracking-tight">Bóveda de Documentos</h4>
                    <p className="text-label text-muted-foreground font-medium uppercase tracking-wider opacity-70">
                        Expediente digital de {worker.apellido_paterno} {worker.nombres}
                    </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    {!isUploading && (
                        <Button
                            size="sm"
                            variant="glass"
                            onClick={async () => {
                                // El ZIP omite los documentos laborales restringidos (mig 110): el helper
                                // avisa cuántos quedaron fuera y muestra el mensaje del backend si falla.
                                const nid = toast.loading('Generando ZIP...');
                                const ok = await descargarArchivo(api, `/documentos/download-all/${worker.id}`, {
                                    nombre: `Documentos_${worker.apellido_paterno}_${worker.nombres}.zip`,
                                    modo: 'download',
                                    fallbackError: 'No se pudo descargar la documentación',
                                });
                                toast.dismiss(nid);
                                if (ok) toast.success('Descarga iniciada');
                            }}
                            className="text-green-700 dark:text-green-300 font-bold border-brand-primary/20 flex-1 sm:flex-initial"
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
