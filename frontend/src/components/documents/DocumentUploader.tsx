import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Upload, FileText, X } from 'lucide-react';

import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { TipoDocumento } from '../../types/entities';
import type { ApiResponse } from '../../types';

const uploadSchema = z.object({
    tipo_documento_id: z.coerce.number().min(1, 'Selecciona un tipo de documento'),
    fecha_vencimiento: z.string().optional(),
});

type UploadFormData = z.infer<typeof uploadSchema>;

interface DocumentUploaderProps {
    trabajadorId: number;
    onSuccess: () => void;
    onCancel: () => void;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({ trabajadorId, onSuccess, onCancel }) => {
    const [loading, setLoading] = useState(false);
    const [tipos, setTipos] = useState<{ value: number; label: string }[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<UploadFormData>({
        resolver: zodResolver(uploadSchema),
    });

    useEffect(() => {
        const fetchTipos = async () => {
            try {
                const res = await api.get<ApiResponse<TipoDocumento[]>>('/documentos/tipos?activo=true');
                setTipos(res.data.data.map(t => ({ value: t.id, label: t.nombre })));
            } catch (err) {
                toast.error('Error al cargar tipos de documento');
            }
        };
        fetchTipos();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (selectedFile.size > 10 * 1024 * 1024) {
                toast.error('El archivo excede los 10MB');
                return;
            }
            setFile(selectedFile);

            if (selectedFile.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => setPreview(reader.result as string);
                reader.readAsDataURL(selectedFile);
            } else {
                setPreview(null);
            }
        }
    };

    const onSubmit = async (data: UploadFormData) => {
        if (!file) {
            toast.error('Debes seleccionar un archivo');
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('archivo', file);
        formData.append('tipo_documento_id', data.tipo_documento_id.toString());
        if (data.fecha_vencimiento) formData.append('fecha_vencimiento', data.fecha_vencimiento);

        try {
            await api.post(`/documentos/upload/${trabajadorId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Documento subido y procesado exitosamente');
            onSuccess();
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || 'Error al subir documento';
            toast.error(errorMsg, {
                description: 'Verifica el tipo de archivo y que no exceda 10MB.',
                duration: 6000,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <Select
                    label="Tipo de Documento"
                    options={tipos}
                    error={errors.tipo_documento_id?.message}
                    {...register('tipo_documento_id')}
                />

                <Input
                    label="Fecha de Vencimiento (Opcional)"
                    type="date"
                    error={errors.fecha_vencimiento?.message}
                    {...register('fecha_vencimiento')}
                />

                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground ml-1">Archivo (PDF, Imagen o TXT)</label>
                    <div
                        className={`relative h-48 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center p-4 cursor-pointer
              ${file ? 'border-brand-primary bg-brand-primary/5' : 'border-white/10 hover:border-brand-primary/50 hover:bg-white/5'}`}
                    >
                        <input
                            type="file"
                            onChange={handleFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            accept=".pdf,image/*,.txt"
                        />

                        {file ? (
                            <div className="text-center space-y-2">
                                {preview ? (
                                    <img src={preview} alt="Vista previa" className="h-20 w-20 object-cover rounded-lg mx-auto border border-white/20" />
                                ) : (
                                    <FileText className="h-12 w-12 text-brand-primary mx-auto" />
                                )}
                                <div className="flex items-center gap-2 justify-center">
                                    <span className="text-sm font-semibold text-white truncate max-w-[200px]">{file.name}</span>
                                    <button type="button" onClick={() => { setFile(null); setPreview(null); }} className="text-rose-400 hover:text-rose-300">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                                <p className="text-[10px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                        ) : (
                            <div className="text-center space-y-2">
                                <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mx-auto">
                                    <Upload className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">Haz clic o arrastra un archivo</p>
                                    <p className="text-xs text-muted-foreground text-center">PDF, PNG, JPG, TXT (Máx. 10MB)</p>
                                </div>
                                <p className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block">
                                    Auto-conversión a PDF activa
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    isLoading={loading}
                    disabled={!file}
                    leftIcon={<Upload className="h-5 w-5" />}
                >
                    Subir Documento
                </Button>
            </div>
        </form>
    );
};
