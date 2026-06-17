import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ScrollText, Plus, Eye, Trash2, Loader2, X, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { compressImage } from '../../utils/compressImage';
import type { VehiculoDocumento, VehiculoDocumentoCategoria } from '../../types/entities';

// Las 4 categorías de respaldo del vehículo (Antecedentes de Circulación).
const CATEGORIAS: { value: VehiculoDocumentoCategoria; label: string }[] = [
    { value: 'permiso_circulacion', label: 'Permiso de circulación' },
    { value: 'seguro_terceros', label: 'Seguro contra terceros' },
    { value: 'primera_inscripcion', label: 'Primera inscripción (padrón)' },
    { value: 'poliza', label: 'Póliza' },
];

const labelCategoria = (c: string) => CATEGORIAS.find(x => x.value === c)?.label || c;

interface Props {
    vehiculoId: number;
}

export const VehiculoDocumentos: React.FC<Props> = ({ vehiculoId }) => {
    const { hasPermission } = useAuth();
    const canCreate = hasPermission('vehiculos.crear');
    const canDelete = hasPermission('vehiculos.eliminar');

    const [docs, setDocs] = useState<VehiculoDocumento[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [categoria, setCategoria] = useState<VehiculoDocumentoCategoria>('permiso_circulacion');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null); // objectURL de imagen seleccionada (vista previa)
    const [uploading, setUploading] = useState(false);
    const [viewingId, setViewingId] = useState<number | null>(null);
    const [viewer, setViewer] = useState<{ url: string; mime: string; name: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Genera/actualiza la vista previa al elegir un archivo. Solo imágenes → miniatura;
    // PDF u otros → sin imagen (se muestra ficha con nombre).
    const handleFileChange = (f: File | null) => {
        setPreview(prev => { if (prev) window.URL.revokeObjectURL(prev); return null; });
        setFile(f);
        if (f && f.type.startsWith('image/')) {
            setPreview(window.URL.createObjectURL(f));
        }
    };

    const fetchDocs = useCallback(async () => {
        try {
            const res = await api.get<{ data: VehiculoDocumento[] }>(`/vehiculos/${vehiculoId}/documentos`);
            setDocs(res.data.data || []);
        } catch { /* silencioso */ }
    }, [vehiculoId]);

    useEffect(() => { fetchDocs(); }, [fetchDocs]);

    const resetForm = () => {
        setShowAdd(false);
        setFile(null);
        setPreview(prev => { if (prev) window.URL.revokeObjectURL(prev); return null; });
        setCategoria('permiso_circulacion');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleUpload = async () => {
        if (!file) { toast.error('Selecciona un archivo (PDF o imagen)'); return; }
        setUploading(true);
        try {
            // Las imágenes se comprimen en el navegador (objetivo ≤ 500 KB); los PDF van tal cual.
            const archivo = await compressImage(file, { maxBytes: 500 * 1024 });
            if (archivo.size > 10 * 1024 * 1024) {
                toast.error('El archivo supera los 10 MB incluso comprimido. Sube un PDF más liviano.');
                setUploading(false);
                return;
            }
            const fd = new FormData();
            fd.append('archivo', archivo);
            fd.append('categoria', categoria);
            await api.post(`/vehiculos/${vehiculoId}/documentos`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Documento agregado');
            resetForm();
            fetchDocs();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al subir el documento');
        } finally {
            setUploading(false);
        }
    };

    const handleView = async (doc: VehiculoDocumento) => {
        setViewingId(doc.id);
        try {
            const res = await api.get(`/vehiculos/${vehiculoId}/documentos/${doc.id}/download`, { responseType: 'blob' });
            // Derivar el MIME de la extensión del archivo (más confiable que el header
            // del backend, que tras el proxy de cPanel puede llegar como octet-stream).
            // Sin un type correcto, el navegador abre el JPEG/PDF como texto crudo.
            const ext = (doc.nombre_archivo.split('.').pop() || '').toLowerCase();
            const mimeByExt: Record<string, string> = {
                jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
            };
            const mime = mimeByExt[ext] || res.headers['content-type'] || 'application/octet-stream';
            const url = window.URL.createObjectURL(new Blob([res.data], { type: mime }));
            // Abrir en un modal dentro de la misma página (no pestaña nueva)
            setViewer(prev => { if (prev) window.URL.revokeObjectURL(prev.url); return { url, mime, name: doc.nombre_archivo }; });
        } catch {
            toast.error('No se pudo abrir el documento');
        } finally {
            setViewingId(null);
        }
    };

    const closeViewer = () => {
        setViewer(prev => { if (prev) window.URL.revokeObjectURL(prev.url); return null; });
    };

    const handleDelete = async (doc: VehiculoDocumento) => {
        if (!window.confirm(`¿Eliminar "${doc.nombre_archivo}"?`)) return;
        try {
            await api.delete(`/vehiculos/${vehiculoId}/documentos/${doc.id}`);
            toast.success('Documento eliminado');
            fetchDocs();
        } catch {
            toast.error('Error al eliminar el documento');
        }
    };

    return (
        <>
        <section>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-brand-dark/50 uppercase tracking-widest flex items-center gap-1.5">
                    <ScrollText className="h-3.5 w-3.5" /> Documentos
                </span>
                {canCreate && !showAdd && (
                    <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}
                        leftIcon={<Plus className="h-3 w-3" />}
                        className="text-brand-primary hover:text-brand-primary hover:bg-brand-primary/5">
                        Agregar
                    </Button>
                )}
            </div>

            {/* Formulario inline de carga */}
            {showAdd && (
                <div className="mb-2 p-3 rounded-xl border border-border bg-muted/40 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-caption font-bold text-muted-foreground uppercase tracking-wide">Nuevo documento</span>
                        <div className="flex items-center gap-1">
                            {/* SUBIR compacto: gris (plomo) sin archivo; verde apenas hay vista previa (listo para subir) */}
                            <Button size="sm" aria-label="Subir documento" title="Subir documento"
                                onClick={handleUpload} disabled={uploading || !file}
                                variant={file ? 'primary' : 'secondary'}
                                leftIcon={uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                className="h-7 px-2.5 text-xs font-bold">
                                SUBIR
                            </Button>
                            <IconButton size="sm" aria-label="Cancelar" onClick={resetForm} icon={<X className="h-3.5 w-3.5" />} />
                        </div>
                    </div>
                    <select value={categoria} onChange={e => setCategoria(e.target.value as VehiculoDocumentoCategoria)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <input ref={fileInputRef} type="file" accept=".pdf,image/*"
                        onChange={e => handleFileChange(e.target.files?.[0] || null)}
                        className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-primary/10 file:text-brand-primary file:text-xs file:font-semibold hover:file:bg-brand-primary/20" />

                    {/* Vista previa del archivo seleccionado (antes de subir) */}
                    {file && (
                        preview ? (
                            <div className="rounded-lg border border-border bg-card p-2 flex flex-col items-center gap-1">
                                <img src={preview} alt="Vista previa" className="max-h-48 w-auto rounded-md object-contain" />
                                <span className="text-micro text-muted-foreground truncate max-w-full" title={file.name}>{file.name}</span>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2">
                                <FileText className="h-5 w-5 text-brand-primary shrink-0" />
                                <span className="text-xs text-brand-dark truncate" title={file.name}>{file.name}</span>
                            </div>
                        )
                    )}
                    <p className="text-micro text-muted-foreground/70">PDF o imagen. Las imágenes se comprimen automáticamente (objetivo ≤ 500 KB).</p>
                </div>
            )}

            <div className="space-y-1.5">
                {docs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1 pl-1 italic">Sin documentos cargados</p>
                ) : (
                    docs.map(doc => (
                        <div key={doc.id} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border">
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <span className="text-xs font-bold text-brand-dark">{labelCategoria(doc.categoria)}</span>
                                <span className="text-caption text-muted-foreground truncate" title={doc.nombre_archivo}>{doc.nombre_archivo}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                <IconButton size="sm" aria-label="Ver documento" onClick={() => handleView(doc)}
                                    disabled={viewingId === doc.id}
                                    className="hover:bg-brand-primary/10 hover:text-brand-primary"
                                    icon={viewingId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} />
                                {canDelete && (
                                    <IconButton size="sm" variant="danger" aria-label="Eliminar documento"
                                        onClick={() => handleDelete(doc)} icon={<Trash2 className="h-3.5 w-3.5" />} />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </section>

        {/* Visor de documento en modal (misma página, no pestaña nueva) */}
        {viewer && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                onClick={closeViewer}>
                <div className="relative bg-card rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border shrink-0">
                        <span className="text-sm font-semibold text-brand-dark truncate" title={viewer.name}>{viewer.name}</span>
                        <IconButton size="sm" aria-label="Cerrar" onClick={closeViewer} icon={<X className="h-4 w-4" />} />
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto bg-muted/40 flex items-center justify-center">
                        {viewer.mime.startsWith('image/') ? (
                            <img src={viewer.url} alt={viewer.name} className="max-w-full max-h-[80vh] object-contain" />
                        ) : (
                            <iframe src={viewer.url} title={viewer.name} className="w-full h-[80vh] border-0" />
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};
