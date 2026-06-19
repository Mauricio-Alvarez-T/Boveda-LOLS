import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ScrollText, Plus, Eye, Trash2, Loader2, X, Upload, FileText, Save, Bell, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { compressImage } from '../../utils/compressImage';
import type { VehiculoDocumento, VehiculoDocumentoCategoria, VehiculoRevision, VehiculoMantencion } from '../../types/entities';

// Tipos del apartado. Los "file" suben un archivo (foto/PDF); los "data" abren un
// formulario (lugar, fecha, vencimiento, observaciones, alerta) y se guardan en
// las tablas de revisiones/mantenciones existentes.
type Tipo =
    | { value: VehiculoDocumentoCategoria; label: string; kind: 'file' }
    | { value: 'revision_tecnica' | 'revision_gases'; label: string; kind: 'data'; endpoint: 'revisiones'; revTipo: 'tecnica' | 'gases' }
    | { value: 'mantencion'; label: string; kind: 'data'; endpoint: 'mantenciones' };

const TIPOS: Tipo[] = [
    { value: 'permiso_circulacion', label: 'Permiso de circulación', kind: 'file' },
    { value: 'seguro_terceros', label: 'Seguro contra terceros', kind: 'file' },
    { value: 'primera_inscripcion', label: 'Primera inscripción (padrón)', kind: 'file' },
    { value: 'poliza', label: 'Póliza', kind: 'file' },
    { value: 'revision_tecnica', label: 'Revisión técnica', kind: 'data', endpoint: 'revisiones', revTipo: 'tecnica' },
    { value: 'revision_gases', label: 'Revisión de gases', kind: 'data', endpoint: 'revisiones', revTipo: 'gases' },
    { value: 'mantencion', label: 'Mantención', kind: 'data', endpoint: 'mantenciones' },
];

const labelFile = (c: string) => TIPOS.find(t => t.value === c)?.label || c;
const fmtFecha = (s?: string | null) => s ? String(s).split('T')[0].split('-').reverse().join('/') : '—';

const EMPTY_FORM = { lugar: '', fecha: '', vencimiento: '', observaciones: '', diasAlerta: '30', emailAlerta: '', horaAlerta: '08:00' };

// Opciones de anticipación del aviso. El valor es "días antes del vencimiento";
// 0 = el mismo día. Se eligen de una lista para que quede claro (en vez de tipear).
const PRESETS_DIAS: { value: number; label: string }[] = [
    { value: 30, label: '30 días antes' },
    { value: 15, label: '15 días antes' },
    { value: 3,  label: '3 días antes' },
    { value: 0,  label: 'El mismo día' },
];

interface Props {
    vehiculoId: number;
}

export const VehiculoDocumentos: React.FC<Props> = ({ vehiculoId }) => {
    const { hasPermission } = useAuth();
    const canCreate = hasPermission('vehiculos.crear');
    const canEdit = hasPermission('vehiculos.editar');
    const canDelete = hasPermission('vehiculos.eliminar');

    const [docs, setDocs] = useState<VehiculoDocumento[]>([]);
    const [revisiones, setRevisiones] = useState<VehiculoRevision[]>([]);
    const [mantenciones, setMantenciones] = useState<VehiculoMantencion[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [tipoValue, setTipoValue] = useState<string>('permiso_circulacion');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [editing, setEditing] = useState<{ kind: 'revision' | 'mantencion'; id: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const [viewingId, setViewingId] = useState<number | null>(null);
    const [viewer, setViewer] = useState<{ url: string; mime: string; name: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const tipo = TIPOS.find(t => t.value === tipoValue)!;
    const isData = tipo.kind === 'data';
    // Obligatorios para guardar: lugar ≥ 4, fecha, vencimiento y email ≥ 5 caracteres.
    const dataValido = form.lugar.trim().length >= 4 && !!form.fecha && !!form.vencimiento && form.emailAlerta.trim().length >= 5;
    const listoParaGuardar = isData ? dataValido : !!file;

    const fetchAll = useCallback(async () => {
        try {
            const [d, r, m] = await Promise.all([
                api.get<{ data: VehiculoDocumento[] }>(`/vehiculos/${vehiculoId}/documentos`),
                api.get<{ data: VehiculoRevision[] }>(`/vehiculos/${vehiculoId}/revisiones`),
                api.get<{ data: VehiculoMantencion[] }>(`/vehiculos/${vehiculoId}/mantenciones`),
            ]);
            setDocs(d.data.data || []);
            setRevisiones(r.data.data || []);
            setMantenciones(m.data.data || []);
        } catch { /* silencioso */ }
    }, [vehiculoId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleFileChange = (f: File | null) => {
        setPreview(prev => { if (prev) window.URL.revokeObjectURL(prev); return null; });
        setFile(f);
        // Vista previa para imágenes y PDF (el PDF se muestra embebido en un visor).
        if (f && (f.type.startsWith('image/') || f.type === 'application/pdf')) {
            setPreview(window.URL.createObjectURL(f));
        }
    };

    const resetForm = () => {
        setShowAdd(false);
        setFile(null);
        setPreview(prev => { if (prev) window.URL.revokeObjectURL(prev); return null; });
        setForm({ ...EMPTY_FORM });
        setTipoValue('permiso_circulacion');
        setEditing(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const toDateInput = (s?: string | null) => s ? String(s).split('T')[0] : '';
    const toTimeInput = (s?: string | null) => s ? String(s).slice(0, 5) : '08:00';

    // Abre el formulario en modo edición pre-cargado con los datos del registro.
    const handleEditRevision = (r: VehiculoRevision) => {
        setTipoValue(r.tipo === 'gases' ? 'revision_gases' : 'revision_tecnica');
        setForm({
            lugar: r.planta || '', fecha: toDateInput(r.fecha), vencimiento: toDateInput(r.fecha_vencimiento),
            observaciones: r.observaciones || '', diasAlerta: r.dias_alerta != null ? String(r.dias_alerta) : '30',
            emailAlerta: r.email_alerta || '', horaAlerta: toTimeInput(r.hora_alerta),
        });
        setEditing({ kind: 'revision', id: r.id });
        setShowAdd(true);
    };
    const handleEditMantencion = (m: VehiculoMantencion) => {
        setTipoValue('mantencion');
        setForm({
            lugar: m.taller || '', fecha: toDateInput(m.fecha), vencimiento: toDateInput(m.fecha_proxima),
            observaciones: m.descripcion || '', diasAlerta: m.dias_alerta != null ? String(m.dias_alerta) : '30',
            emailAlerta: m.email_alerta || '', horaAlerta: toTimeInput(m.hora_alerta),
        });
        setEditing({ kind: 'mantencion', id: m.id });
        setShowAdd(true);
    };

    // Subir archivo (tipos "file")
    const handleUpload = async () => {
        if (!file) { toast.error('Selecciona un archivo (PDF o imagen)'); return; }
        setBusy(true);
        try {
            const archivo = await compressImage(file, { maxBytes: 500 * 1024 });
            if (archivo.size > 10 * 1024 * 1024) {
                toast.error('El archivo supera los 10 MB incluso comprimido. Sube un PDF más liviano.');
                setBusy(false); return;
            }
            const fd = new FormData();
            fd.append('archivo', archivo);
            fd.append('categoria', tipoValue);
            await api.post(`/vehiculos/${vehiculoId}/documentos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success('Documento agregado');
            resetForm();
            fetchAll();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al subir el documento');
        } finally { setBusy(false); }
    };

    // Guardar registro de datos (revisión técnica / gases / mantención)
    const handleSaveData = async () => {
        if (tipo.kind !== 'data') return;
        if (!dataValido) { toast.error('Completa lugar (mín. 4), fecha, vencimiento y email de alerta (mín. 5)'); return; }
        setBusy(true);
        try {
            const dias_alerta = form.diasAlerta ? Number(form.diasAlerta) : null;
            const email_alerta = form.emailAlerta.trim() || null;
            const hora_alerta = form.horaAlerta || null;
            const observaciones = form.observaciones.trim() || null;
            if (tipo.endpoint === 'revisiones') {
                const payload = {
                    tipo: tipo.revTipo, fecha: form.fecha, fecha_vencimiento: form.vencimiento,
                    planta: form.lugar.trim(), observaciones, resultado: 'aprobado', dias_alerta, email_alerta, hora_alerta,
                };
                if (editing?.kind === 'revision') await api.put(`/vehiculos/${vehiculoId}/revisiones/${editing.id}`, payload);
                else await api.post(`/vehiculos/${vehiculoId}/revisiones`, payload);
            } else {
                const payload = {
                    fecha: form.fecha, tipo: 'Mantención', km_al_realizar: 0,
                    taller: form.lugar.trim(), descripcion: observaciones, fecha_proxima: form.vencimiento,
                    dias_alerta, email_alerta, hora_alerta,
                };
                if (editing?.kind === 'mantencion') await api.put(`/vehiculos/${vehiculoId}/mantenciones/${editing.id}`, payload);
                else await api.post(`/vehiculos/${vehiculoId}/mantenciones`, payload);
            }
            toast.success(editing ? 'Registro actualizado' : 'Registro guardado');
            resetForm();
            fetchAll();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar el registro');
        } finally { setBusy(false); }
    };

    const handleView = async (doc: VehiculoDocumento) => {
        setViewingId(doc.id);
        try {
            const res = await api.get(`/vehiculos/${vehiculoId}/documentos/${doc.id}/download`, { responseType: 'blob' });
            const ext = (doc.nombre_archivo.split('.').pop() || '').toLowerCase();
            const mimeByExt: Record<string, string> = {
                jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
            };
            const mime = mimeByExt[ext] || res.headers['content-type'] || 'application/octet-stream';
            const url = window.URL.createObjectURL(new Blob([res.data], { type: mime }));
            setViewer(prev => { if (prev) window.URL.revokeObjectURL(prev.url); return { url, mime, name: doc.nombre_archivo }; });
        } catch {
            toast.error('No se pudo abrir el documento');
        } finally { setViewingId(null); }
    };

    const closeViewer = () => setViewer(prev => { if (prev) window.URL.revokeObjectURL(prev.url); return null; });

    const handleDeleteDoc = async (doc: VehiculoDocumento) => {
        if (!window.confirm(`¿Eliminar "${doc.nombre_archivo}"?`)) return;
        try { await api.delete(`/vehiculos/${vehiculoId}/documentos/${doc.id}`); toast.success('Documento eliminado'); fetchAll(); }
        catch { toast.error('Error al eliminar el documento'); }
    };
    const handleDeleteRevision = async (r: VehiculoRevision) => {
        if (!window.confirm('¿Eliminar este registro?')) return;
        try { await api.delete(`/vehiculos/${vehiculoId}/revisiones/${r.id}`); toast.success('Registro eliminado'); fetchAll(); }
        catch { toast.error('Error al eliminar el registro'); }
    };
    const handleDeleteMantencion = async (m: VehiculoMantencion) => {
        if (!window.confirm('¿Eliminar este registro?')) return;
        try { await api.delete(`/vehiculos/${vehiculoId}/mantenciones/${m.id}`); toast.success('Registro eliminado'); fetchAll(); }
        catch { toast.error('Error al eliminar el registro'); }
    };

    const vacio = docs.length === 0 && revisiones.length === 0 && mantenciones.length === 0;

    const AlertaBadge = ({ dias, email }: { dias?: number | null; email?: string | null }) =>
        (email && dias != null) ? (
            <span className="inline-flex items-center gap-1 text-micro font-bold text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-1.5 py-0.5 rounded-md w-fit mt-0.5">
                <Bell className="h-2.5 w-2.5" /> {dias === 0 ? 'Avisa el mismo día' : `Avisa ${dias}d antes`}
            </span>
        ) : null;

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

            {/* Formulario inline */}
            {showAdd && (
                <div className="mb-2 p-3 rounded-xl border border-border bg-muted/40 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-caption font-bold text-muted-foreground uppercase tracking-wide">{editing ? 'Editar registro' : 'Nuevo registro'}</span>
                        <div className="flex items-center gap-2">
                            {/* Gris (plomo) hasta estar listo; verde cuando se puede guardar */}
                            <Button size="sm" aria-label={isData ? 'Guardar registro' : 'Subir documento'} title={isData ? 'Guardar registro' : 'Subir documento'}
                                onClick={isData ? handleSaveData : handleUpload} disabled={busy || !listoParaGuardar}
                                variant={listoParaGuardar ? 'primary' : 'secondary'}
                                leftIcon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (isData ? <Save className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />)}
                                className="h-9 px-3 text-xs font-bold">
                                {isData ? 'GUARDAR' : 'SUBIR'}
                            </Button>
                            <IconButton size="sm" aria-label="Cancelar" title="Cancelar" onClick={resetForm}
                                className="h-9 w-9" icon={<X className="h-4 w-4" />} />
                        </div>
                    </div>

                    <select value={tipoValue} onChange={e => setTipoValue(e.target.value)} disabled={!!editing}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 disabled:opacity-60">
                        {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>

                    {/* FILE: subir archivo + vista previa */}
                    {!isData && (
                        <>
                            <input ref={fileInputRef} type="file" accept=".pdf,image/*"
                                onChange={e => handleFileChange(e.target.files?.[0] || null)}
                                className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-primary/10 file:text-brand-primary file:text-xs file:font-semibold hover:file:bg-brand-primary/20" />
                            {file && (
                                preview ? (
                                    <div className="rounded-lg border border-border bg-card p-2 flex flex-col items-center gap-1">
                                        {file.type === 'application/pdf' ? (
                                            <iframe src={preview} title="Vista previa" className="w-full h-64 rounded-md border border-border bg-white" />
                                        ) : (
                                            <img src={preview} alt="Vista previa" className="max-h-48 w-auto rounded-md object-contain" />
                                        )}
                                        <span className="text-micro text-muted-foreground truncate max-w-full" title={file.name}>{file.name}</span>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-brand-primary shrink-0" />
                                        <span className="text-xs text-brand-dark truncate" title={file.name}>{file.name}</span>
                                    </div>
                                )
                            )}
                            <p className="text-micro text-muted-foreground/70">PDF o imagen. Las imágenes se comprimen automáticamente (objetivo ≤ 500 KB); los PDF se suben tal cual.</p>
                        </>
                    )}

                    {/* DATA: formulario lugar/fecha/vencimiento/observaciones + alerta */}
                    {isData && (
                        <div className="space-y-2">
                            <input type="text" value={form.lugar} onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))}
                                placeholder={tipo.endpoint === 'mantenciones' ? 'Taller / lugar' : 'Planta / lugar de la revisión'}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-0.5">
                                    <span className="text-micro font-bold text-muted-foreground uppercase">Fecha</span>
                                    <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                                </label>
                                <label className="flex flex-col gap-0.5">
                                    <span className="text-micro font-bold text-muted-foreground uppercase">Vencimiento</span>
                                    <input type="date" value={form.vencimiento} onChange={e => setForm(f => ({ ...f, vencimiento: e.target.value }))}
                                        className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                                </label>
                            </div>
                            <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                                rows={2} placeholder="Observaciones (opcional)"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                            <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
                                <span className="text-micro font-bold text-muted-foreground uppercase flex items-center gap-1"><Bell className="h-3 w-3 text-brand-primary" /> Alerta de vencimiento</span>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex flex-col gap-0.5">
                                        <span className="text-micro text-muted-foreground">Anticipación del aviso</span>
                                        <select value={form.diasAlerta} onChange={e => setForm(f => ({ ...f, diasAlerta: e.target.value }))}
                                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                                            {/* Conserva un valor antiguo no estándar (ej. registros con 7 días) como opción extra */}
                                            {form.diasAlerta !== '' && !PRESETS_DIAS.some(p => String(p.value) === String(form.diasAlerta)) && (
                                                <option value={form.diasAlerta}>{form.diasAlerta} días antes</option>
                                            )}
                                            {PRESETS_DIAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                    </label>
                                    <label className="flex flex-col gap-0.5">
                                        <span className="text-micro text-muted-foreground">Hora del aviso</span>
                                        <input type="time" value={form.horaAlerta} onChange={e => setForm(f => ({ ...f, horaAlerta: e.target.value }))}
                                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                                    </label>
                                    <label className="flex flex-col gap-0.5 col-span-2">
                                        <span className="text-micro text-muted-foreground">Email alerta <span className="text-destructive">*</span></span>
                                        <input type="email" value={form.emailAlerta} onChange={e => setForm(f => ({ ...f, emailAlerta: e.target.value }))}
                                            placeholder="correo@empresa.cl" required
                                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                                    </label>
                                </div>
                                <p className="text-micro text-muted-foreground/70">Obligatorio: lugar (mín. 4), fecha, vencimiento y email (mín. 5). Avisa por correo según la anticipación elegida, a la hora indicada.</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Listado: documentos (archivo) + revisiones + mantenciones (datos) */}
            <div className="space-y-1.5">
                {vacio ? (
                    <p className="text-xs text-muted-foreground py-1 pl-1 italic">Sin registros cargados</p>
                ) : (
                    <>
                        {docs.map(doc => (
                            <div key={`doc_${doc.id}`} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border">
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-xs font-bold text-brand-dark">{labelFile(doc.categoria)}</span>
                                    <span className="text-caption text-muted-foreground truncate" title={doc.nombre_archivo}>{doc.nombre_archivo}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                    <IconButton size="sm" aria-label="Ver documento" title="Ver documento" onClick={() => handleView(doc)}
                                        disabled={viewingId === doc.id}
                                        className="h-10 w-10 sm:h-8 sm:w-8 hover:bg-brand-primary/10 hover:text-brand-primary"
                                        icon={viewingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} />
                                    {canDelete && (
                                        <IconButton size="sm" variant="danger" aria-label="Eliminar documento" title="Eliminar"
                                            onClick={() => handleDeleteDoc(doc)} className="h-10 w-10 sm:h-8 sm:w-8" icon={<Trash2 className="h-4 w-4" />} />
                                    )}
                                </div>
                            </div>
                        ))}

                        {revisiones.map(r => (
                            <div key={`rev_${r.id}`} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border">
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-xs font-bold text-brand-dark">{r.tipo === 'gases' ? 'Revisión de gases' : 'Revisión técnica'}</span>
                                    <span className="text-caption text-muted-foreground">
                                        {r.planta ? `${r.planta} · ` : ''}{fmtFecha(r.fecha)} → vence {fmtFecha(r.fecha_vencimiento)}
                                    </span>
                                    {r.observaciones && <span className="text-micro text-muted-foreground/70 italic">{r.observaciones}</span>}
                                    <AlertaBadge dias={r.dias_alerta} email={r.email_alerta} />
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                    {canEdit && (
                                        <IconButton size="sm" aria-label="Editar registro" title="Editar" onClick={() => handleEditRevision(r)}
                                            className="h-10 w-10 sm:h-8 sm:w-8 hover:bg-brand-primary/10 hover:text-brand-primary" icon={<Pencil className="h-4 w-4" />} />
                                    )}
                                    {canDelete && (
                                        <IconButton size="sm" variant="danger" aria-label="Eliminar registro" title="Eliminar"
                                            onClick={() => handleDeleteRevision(r)} className="h-10 w-10 sm:h-8 sm:w-8" icon={<Trash2 className="h-4 w-4" />} />
                                    )}
                                </div>
                            </div>
                        ))}

                        {mantenciones.map(m => (
                            <div key={`man_${m.id}`} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border">
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-xs font-bold text-brand-dark">Mantención</span>
                                    <span className="text-caption text-muted-foreground">
                                        {m.taller ? `${m.taller} · ` : ''}{fmtFecha(m.fecha)}{m.fecha_proxima ? ` → vence ${fmtFecha(m.fecha_proxima)}` : ''}
                                    </span>
                                    {m.descripcion && <span className="text-micro text-muted-foreground/70 italic">{m.descripcion}</span>}
                                    <AlertaBadge dias={m.dias_alerta} email={m.email_alerta} />
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                    {canEdit && (
                                        <IconButton size="sm" aria-label="Editar registro" title="Editar" onClick={() => handleEditMantencion(m)}
                                            className="h-10 w-10 sm:h-8 sm:w-8 hover:bg-brand-primary/10 hover:text-brand-primary" icon={<Pencil className="h-4 w-4" />} />
                                    )}
                                    {canDelete && (
                                        <IconButton size="sm" variant="danger" aria-label="Eliminar registro" title="Eliminar"
                                            onClick={() => handleDeleteMantencion(m)} className="h-10 w-10 sm:h-8 sm:w-8" icon={<Trash2 className="h-4 w-4" />} />
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </section>

        {/* Visor de documento en modal (misma página) */}
        {viewer && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={closeViewer}>
                <div className="relative bg-card rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border shrink-0">
                        <span className="text-sm font-semibold text-brand-dark truncate" title={viewer.name}>{viewer.name}</span>
                        <IconButton size="sm" aria-label="Cerrar" title="Cerrar" onClick={closeViewer}
                            className="h-10 w-10 sm:h-8 sm:w-8" icon={<X className="h-5 w-5 sm:h-4 sm:w-4" />} />
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
