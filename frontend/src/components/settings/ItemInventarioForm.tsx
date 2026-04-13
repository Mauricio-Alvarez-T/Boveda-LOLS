import React, { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save, Upload, Trash2, ImageIcon } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import api from '../../services/api';
import type { ItemInventario, CategoriaInventario } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    nro_item: z.coerce.number().int().min(1, 'Número de ítem requerido'),
    categoria_id: z.coerce.number().int().min(1, 'Categoría requerida'),
    descripcion: z.string().min(1, 'Descripción requerida'),
    m2: z.coerce.number().optional().nullable(),
    valor_compra: z.coerce.number().min(0, 'Valor >= 0'),
    valor_arriendo: z.coerce.number().min(0, 'Valor >= 0'),
    unidad: z.string().min(1, 'Unidad requerida'),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: ItemInventario | null;
    onSuccess: () => void;
    onCancel: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export const ItemInventarioForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const [categorias, setCategorias] = useState<CategoriaInventario[]>([]);
    const [imagePreview, setImagePreview] = useState<string | null>(initialData?.imagen_url ? `${API_BASE}${initialData.imagen_url}` : null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nro_item: initialData?.nro_item ?? undefined,
            categoria_id: initialData?.categoria_id ?? undefined,
            descripcion: initialData?.descripcion || '',
            m2: initialData?.m2 ?? null,
            valor_compra: initialData?.valor_compra ?? 0,
            valor_arriendo: initialData?.valor_arriendo ?? 0,
            unidad: initialData?.unidad || 'U',
        },
    });

    useFormDirtyProtection(isDirty || !!imageFile);

    useEffect(() => {
        api.get<ApiResponse<CategoriaInventario[]>>('/categorias-inventario?activo=true&limit=100')
            .then(res => setCategorias(res.data.data))
            .catch(() => {});
    }, []);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error('La imagen no debe superar 5 MB');
            return;
        }
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const uploadImage = async (itemId: number) => {
        if (!imageFile) return;
        setUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append('imagen', imageFile);
            await api.post(`/inventario/items/${itemId}/imagen`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
        } catch {
            toast.error('Error al subir imagen');
        } finally {
            setUploadingImage(false);
        }
    };

    const removeImage = async () => {
        if (initialData?.id && initialData.imagen_url) {
            try {
                await api.delete(`/inventario/items/${initialData.id}/imagen`);
                toast.success('Imagen eliminada');
            } catch {
                toast.error('Error al eliminar imagen');
            }
        }
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const onSubmit = async (data: FormData) => {
        try {
            const payload = { ...data, m2: data.m2 || null };
            let itemId = initialData?.id;
            if (initialData) {
                await api.put(`/items-inventario/${initialData.id}`, payload);
                toast.success('Ítem actualizado');
            } else {
                const res = await api.post<ApiResponse<{ id: number }>>('/items-inventario', payload);
                itemId = res.data.data.id;
                toast.success('Ítem creado');
            }
            if (imageFile && itemId) {
                await uploadImage(itemId);
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar ítem');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <Input label="Nro Ítem" type="number" {...register('nro_item')} error={errors.nro_item?.message} placeholder="1" />
                <Select
                    label="Categoría"
                    {...register('categoria_id')}
                    error={errors.categoria_id?.message}
                    options={categorias.map(c => ({ value: c.id, label: c.nombre }))}
                />
            </div>
            <Input label="Descripción" {...register('descripcion')} error={errors.descripcion?.message} placeholder="ANDAMIO VERTICAL PATA REGULABLE" />
            <div className="grid grid-cols-3 gap-4">
                <Input label="M2 (moldajes)" type="number" step="0.0001" {...register('m2')} error={errors.m2?.message} placeholder="0.00" />
                <Input label="Valor Compra ($)" type="number" {...register('valor_compra')} error={errors.valor_compra?.message} placeholder="0" />
                <Input label="Valor Arriendo ($)" type="number" {...register('valor_arriendo')} error={errors.valor_arriendo?.message} placeholder="0" />
            </div>
            <Input label="Unidad" {...register('unidad')} error={errors.unidad?.message} placeholder="U" />

            {/* Image upload */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground ml-0.5">Imagen del ítem</label>
                <div className="flex items-start gap-4">
                    {imagePreview ? (
                        <div className="relative group">
                            <img
                                src={imagePreview}
                                alt="Preview"
                                className="w-24 h-24 object-cover rounded-xl border border-[#E8E8ED]"
                            />
                            <button
                                type="button"
                                onClick={removeImage}
                                className="absolute -top-2 -right-2 p-1 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    ) : (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-24 h-24 border-2 border-dashed border-[#E8E8ED] rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all"
                        >
                            <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                            <span className="text-[9px] text-muted-foreground/60 font-medium">Subir foto</span>
                        </div>
                    )}
                    <div className="flex flex-col gap-2 flex-1">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageSelect}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E8E8ED] rounded-xl hover:bg-muted/50 transition-all w-fit"
                        >
                            <Upload className="h-3.5 w-3.5" />
                            {imagePreview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                        </button>
                        <p className="text-[10px] text-muted-foreground">JPG, PNG o WEBP. Máx 5 MB.</p>
                    </div>
                </div>
            </div>

            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-6 z-10">
                <Button type="submit" isLoading={isSubmitting || uploadingImage} leftIcon={<Save className="h-4 w-4" />} className="w-full sm:w-auto">
                    Guardar
                </Button>
            </div>
        </form>
    );
};
