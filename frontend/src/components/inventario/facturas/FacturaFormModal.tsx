import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Receipt, PackagePlus, Camera, FileText, Paperclip, X, Sparkles, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../services/api';
import type { ItemInventario, CategoriaInventario } from '../../../types/entities';
import type { ApiResponse } from '../../../types';
import { cn } from '../../../utils/cn';
import { Modal } from '../../ui/Modal';
import { SkeletonFormulario } from '../../ui/Skeleton';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { FieldError } from '../../ui/FieldError';
import { QtyStepper } from '../../ui/QtyStepper';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { fmtMoneyExacto as fmtMoney } from '../../../utils/format';
import { showApiError } from '../../../utils/toastUtils';
import { compressImage } from '../../../utils/compressImage';
import { formatearTamano } from '../../../utils/archivos';
import { FacturaArchivoViewer } from './FacturaArchivoViewer';
import type { FacturaDetalle } from './tipos';

/**
 * Alta / edición de una factura de inventario (mig 157, pedido Daphne 2026-11-25).
 *
 * La factura es el REGISTRO de lo comprado: no mueve stock ni costo, así que los
 * ítems no llevan destino. Se elige el ítem del catálogo (o se crea con «Nuevo»).
 * - Foto/PDF: se adjunta y queda guardado con la factura.
 * - «Llenar con la foto»: la IA lee el archivo y prellena todo para revisar (solo
 *   si el servidor tiene la clave; si no, el botón no aparece).
 * - «Continuar después» guarda un borrador. Cerrar la ventana (X, Esc o tocar
 *   fuera) con algo escrito TAMBIÉN guarda el borrador: antes se perdía todo
 *   (reporte Daphne: «si uno toca cualquier parte de la pantalla, se elimina»).
 */

interface LineItem {
    item_id: number;
    descripcion: string;
    unidad: string;
    // Permiten '' (vacío) mientras el usuario edita; se coercen a número al calcular/guardar.
    cantidad: number | '';
    precio_unitario: number | '';
    /** Texto de la línea tal cual viene en la factura (lo llena la lectura con IA). */
    descripcion_factura: string;
}

interface LecturaIA {
    proveedor: string | null;
    numero_factura: string | null;
    fecha_factura: string | null;
    monto_neto: number | null;
    items: { descripcion: string; cantidad: number; precio_unitario: number; item_id: number | null }[];
}

interface Props {
    isOpen: boolean;
    /** null = factura nueva; número = continuar un borrador o editar una registrada. */
    facturaId: number | null;
    /** El servidor tiene la lectura con IA activa (GET /facturas-inventario/config). */
    lecturaIA: boolean;
    onClose: () => void;
    /** Se guardó algo (borrador o registrada): el padre recarga la lista. */
    onSaved: () => void;
}

// El cliente `api` manda JSON por defecto y axios convertiría el FormData a JSON (el archivo
// llegaba vacío: «No se recibió el archivo»). Igual que las demás subidas de la Bóveda.
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

const hoy = () => new Date().toISOString().slice(0, 10);
const INPUT = 'w-full px-3 py-2 text-sm border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none';

export const FacturaFormModal: React.FC<Props> = ({ isOpen, facturaId, lecturaIA, onClose, onSaved }) => {
    /* ── Identidad de lo que se edita ── */
    const [idActual, setIdActual] = useState<number | null>(null);
    const [estadoOriginal, setEstadoOriginal] = useState<'nueva' | 'borrador' | 'registrada'>('nueva');
    const [cargandoFactura, setCargandoFactura] = useState(false);

    /* ── Form ── */
    const [numFactura, setNumFactura] = useState('');
    const [proveedor, setProveedor] = useState('');
    const [fechaFactura, setFechaFactura] = useState(hoy);
    const [observaciones, setObservaciones] = useState('');
    const [items, setItems] = useState<LineItem[]>([]);
    const [montoLeido, setMontoLeido] = useState<number | null>(null);
    const [formErrors, setFormErrors] = useState<{ numFactura?: string; proveedor?: string; fecha?: string; items?: string }>({});
    const [guardando, setGuardando] = useState<null | 'borrador' | 'registrada'>(null);
    const snapshot = useRef('');

    /* ── Archivo (foto/PDF) ── */
    const [archivo, setArchivo] = useState<File | null>(null);
    const [archivoGuardado, setArchivoGuardado] = useState<{ nombre: string | null; mime: string | null } | null>(null);
    const [comprimiendo, setComprimiendo] = useState(false);
    const [leyendo, setLeyendo] = useState(false);
    const [verArchivo, setVerArchivo] = useState(false);
    const camaraRef = useRef<HTMLInputElement>(null);
    const archivoRef = useRef<HTMLInputElement>(null);

    /* ── Catálogo ── */
    const [catalogoItems, setCatalogoItems] = useState<ItemInventario[]>([]);
    const [categorias, setCategorias] = useState<CategoriaInventario[]>([]);
    const [showNewItemModal, setShowNewItemModal] = useState(false);
    const [newItemTargetIdx, setNewItemTargetIdx] = useState<number | null>(null);
    const [creatingItem, setCreatingItem] = useState(false);
    const [newItem, setNewItem] = useState({ categoria_id: '' as number | '', descripcion: '', unidad: 'U', valor_compra: '' });

    const estadoForm = () => JSON.stringify({ numFactura, proveedor, fechaFactura, observaciones, items, archivo: archivo?.name ?? null });

    /* ── Abrir: limpiar o hidratar ── */
    useEffect(() => {
        if (!isOpen) return;
        api.get<ApiResponse<ItemInventario[]>>('/items-inventario?activo=true&limit=500')
            .then(res => setCatalogoItems(res.data.data)).catch(() => {});
        api.get<ApiResponse<CategoriaInventario[]>>('/categorias-inventario?activo=true&limit=100')
            .then(res => setCategorias(res.data.data || [])).catch(() => {});

        setArchivo(null); setMontoLeido(null); setFormErrors({});
        if (facturaId == null) {
            setIdActual(null); setEstadoOriginal('nueva'); setArchivoGuardado(null);
            setNumFactura(''); setProveedor(''); setFechaFactura(hoy()); setObservaciones(''); setItems([]);
            snapshot.current = JSON.stringify({ numFactura: '', proveedor: '', fechaFactura: hoy(), observaciones: '', items: [], archivo: null });
            return;
        }
        setCargandoFactura(true);
        api.get(`/facturas-inventario/${facturaId}`)
            .then(res => {
                const f: FacturaDetalle = res.data.data;
                const its: LineItem[] = (f.items || []).map(it => ({
                    item_id: it.item_id || 0,
                    descripcion: it.item_descripcion || '',
                    unidad: it.unidad || 'U',
                    cantidad: Number(it.cantidad) || 1,
                    precio_unitario: Number(it.precio_unitario) || 0,
                    descripcion_factura: it.descripcion_factura || '',
                }));
                const fecha = f.fecha_factura ? String(f.fecha_factura).slice(0, 10) : '';
                setIdActual(f.id);
                setEstadoOriginal(f.estado === 'borrador' ? 'borrador' : 'registrada');
                setArchivoGuardado(f.tiene_archivo ? { nombre: f.archivo_nombre ?? null, mime: f.archivo_mime ?? null } : null);
                setNumFactura(f.numero_factura || ''); setProveedor(f.proveedor || '');
                setFechaFactura(fecha); setObservaciones(f.observaciones || ''); setItems(its);
                snapshot.current = JSON.stringify({ numFactura: f.numero_factura || '', proveedor: f.proveedor || '', fechaFactura: fecha, observaciones: f.observaciones || '', items: its, archivo: null });
            })
            .catch(err => { showApiError(err, 'No se pudo cargar la factura'); onClose(); })
            .finally(() => setCargandoFactura(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir / cambiar de factura
    }, [isOpen, facturaId]);

    /* ── Ítems ── */
    const updateItem = (idx: number, patch: Partial<LineItem>) =>
        setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    const addItem = () => {
        setItems(prev => [...prev, { item_id: 0, descripcion: '', unidad: 'U', cantidad: 1, precio_unitario: '', descripcion_factura: '' }]);
        if (formErrors.items) setFormErrors(p => ({ ...p, items: undefined }));
    };
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
    const selectCatalogItem = (idx: number, value: string | number | null) => {
        const found = catalogoItems.find(c => c.id === Number(value));
        const actual = items[idx];
        updateItem(idx, {
            item_id: Number(value) || 0,
            descripcion: found?.descripcion || '',
            unidad: found?.unidad || 'U',
            // El precio leído de la factura manda; el del catálogo solo si la línea no traía.
            precio_unitario: actual?.precio_unitario !== '' && actual?.precio_unitario != null ? actual.precio_unitario : (found?.valor_compra || ''),
        });
    };

    const montoNeto = useMemo(
        () => items.reduce((sum, i) => sum + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0),
        [items],
    );

    const availableOptions = useMemo(() => {
        const opts = catalogoItems.filter(Boolean).map(c => ({
            value: c.id,
            label: `${c.nro_item ? c.nro_item + ' — ' : ''}${c.descripcion} (${c.unidad})`,
        }));
        // Ítems de la factura que no estén en el catálogo cargado (inactivos o fuera
        // del limit=500) igual deben mostrarse en el select.
        const known = new Set(opts.map(o => o.value));
        for (const it of items) {
            if (it.item_id && !known.has(it.item_id)) {
                opts.push({ value: it.item_id, label: `${it.descripcion || `Ítem ${it.item_id}`} (${it.unidad})` });
                known.add(it.item_id);
            }
        }
        return opts;
    }, [catalogoItems, items]);

    /* ── Archivo ── */
    const elegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (!f.type.startsWith('image/') && f.type !== 'application/pdf') { toast.error('La foto tiene que ser una imagen (JPG, PNG, WEBP) o un PDF.'); return; }
        setComprimiendo(true);
        // Legible para leer montos, folio y RUT (letra chica): igual que la foto de un gasto.
        const listo = await compressImage(f, { maxDim: 2000, minDim: 1400, maxBytes: 400 * 1024 }).catch(() => f);
        setComprimiendo(false);
        if (listo.size > 10 * 1024 * 1024) { toast.error('El archivo pesa más de 10 MB.'); return; }
        setArchivo(listo);
    };

    /** Lo que se le pasa a la IA: el archivo recién elegido o, si no hay, el ya guardado. */
    const archivoParaLeer = async (): Promise<Blob | null> => {
        if (archivo) return archivo;
        if (archivoGuardado && idActual) {
            const res = await api.get(`/facturas-inventario/${idActual}/archivo`, { responseType: 'blob' });
            return new Blob([res.data], { type: archivoGuardado.mime || res.headers['content-type'] || 'image/jpeg' });
        }
        return null;
    };

    const aplicarLectura = (l: LecturaIA) => {
        if (l.numero_factura) setNumFactura(l.numero_factura);
        if (l.proveedor) setProveedor(l.proveedor);
        if (l.fecha_factura) setFechaFactura(l.fecha_factura);
        setMontoLeido(l.monto_neto);
        if (l.items.length) {
            setItems(l.items.map(it => {
                const cat = it.item_id ? catalogoItems.find(c => c.id === it.item_id) : undefined;
                return {
                    item_id: cat ? cat.id : 0,
                    descripcion: cat?.descripcion || '',
                    unidad: cat?.unidad || 'U',
                    cantidad: it.cantidad,
                    precio_unitario: it.precio_unitario,
                    descripcion_factura: it.descripcion,
                };
            }));
        }
        setFormErrors({});
        const sinVincular = l.items.filter(it => !it.item_id || !catalogoItems.some(c => c.id === it.item_id)).length;
        toast.success('Factura leída: revisa los datos antes de registrar', {
            description: sinVincular
                ? `${sinVincular} ${sinVincular === 1 ? 'línea no está' : 'líneas no están'} en el catálogo: elige el ítem o créalo con «Nuevo».`
                : undefined,
        });
    };

    const leerFactura = async () => {
        setLeyendo(true);
        try {
            const blob = await archivoParaLeer();
            if (!blob) { toast.error('Primero saca una foto o sube el PDF de la factura'); return; }
            const fd = new FormData();
            fd.append('archivo', blob, archivo?.name || archivoGuardado?.nombre || 'factura');
            const res = await api.post<ApiResponse<LecturaIA>>('/facturas-inventario/leer', fd, MULTIPART);
            const l = res.data.data;
            if (items.length && l.items.length) {
                if (!window.confirm('La factura ya tiene ítems. ¿Reemplazarlos por los que se leyeron de la foto?')) {
                    aplicarLectura({ ...l, items: [] });
                    return;
                }
            }
            aplicarLectura(l);
        } catch (err) {
            showApiError(err, 'No se pudo leer la factura');
        } finally {
            setLeyendo(false);
        }
    };

    /* ── Guardar ── */
    const validarCompleta = () => {
        const errs: typeof formErrors = {};
        if (!numFactura.trim()) errs.numFactura = 'Ingresa el número de factura';
        if (!proveedor.trim()) errs.proveedor = 'Ingresa el proveedor';
        if (!fechaFactura) errs.fecha = 'Ingresa la fecha de la factura';
        if (!items.length) errs.items = 'Agrega al menos un ítem';
        else if (items.some(i => !i.item_id)) errs.items = 'Hay líneas sin ítem del catálogo: elígelo o créalo con «Nuevo»';
        else if (items.some(i => !(Number(i.cantidad) > 0))) errs.items = 'Cada ítem necesita una cantidad mayor a 0';
        setFormErrors(errs);
        return Object.keys(errs).length === 0;
    };

    /** Guarda y devuelve true si quedó guardado. `silencioso`: sin toast propio (lo pone quien cierra). */
    const guardar = async (estado: 'borrador' | 'registrada', silencioso = false): Promise<boolean> => {
        if (estado === 'registrada' && !validarCompleta()) return false;
        setGuardando(estado);
        try {
            const payload: Record<string, unknown> = {
                estado,
                monto_neto: montoNeto,
                items: items
                    .filter(i => estado === 'registrada' || i.item_id || i.descripcion_factura.trim() || Number(i.precio_unitario) > 0)
                    .map(i => ({
                        ...(i.item_id ? { item_id: i.item_id } : {}),
                        cantidad: Number(i.cantidad) > 0 ? Number(i.cantidad) : 1,
                        precio_unitario: Number(i.precio_unitario) || 0,
                        ...(i.descripcion_factura.trim() ? { descripcion_factura: i.descripcion_factura.trim() } : {}),
                    })),
            };
            // Borrador: solo lo que tenga algo (una fecha vacía no pasa la validación de formato).
            if (numFactura.trim()) payload.numero_factura = numFactura.trim();
            if (proveedor.trim()) payload.proveedor = proveedor.trim();
            if (fechaFactura) payload.fecha_factura = fechaFactura;
            if (observaciones.trim()) payload.observaciones = observaciones.trim();

            let id = idActual;
            if (id) await api.put(`/facturas-inventario/${id}`, payload);
            else {
                const res = await api.post<ApiResponse<{ id: number }>>('/facturas-inventario', payload);
                id = res.data.data.id;
                setIdActual(id);
            }
            if (archivo && id) {
                const fd = new FormData();
                fd.append('archivo', archivo, archivo.name);
                await api.post(`/facturas-inventario/${id}/archivo`, fd, MULTIPART);
                setArchivoGuardado({ nombre: archivo.name, mime: archivo.type });
                setArchivo(null);
            }
            if (!silencioso) {
                toast.success(
                    estado === 'borrador' ? 'Borrador guardado'
                        : estadoOriginal === 'registrada' ? 'Factura actualizada' : 'Factura registrada',
                    estado === 'borrador' ? { description: 'Lo retomas desde la lista de facturas.' } : undefined,
                );
            }
            onSaved();
            return true;
        } catch (err) {
            showApiError(err, estado === 'borrador' ? 'No se pudo guardar el borrador' : 'No se pudo guardar la factura');
            return false;
        } finally {
            setGuardando(null);
        }
    };

    const hayCambios = () => estadoForm() !== snapshot.current;

    /**
     * Cerrar (X, Esc, tocar fuera, Cancelar). Una factura nueva o un borrador con
     * cambios se guarda como borrador en vez de perderse; una registrada pregunta.
     */
    const pedirCierre = async () => {
        if (guardando || leyendo) return;
        if (!hayCambios()) { onClose(); return; }
        if (estadoOriginal === 'registrada') {
            if (window.confirm('Tienes cambios sin guardar en esta factura. ¿Salir sin guardarlos?')) onClose();
            return;
        }
        if (await guardar('borrador', true)) {
            toast.success('Guardado como borrador', { description: 'Lo retomas desde la lista de facturas.' });
            onClose();
        }
    };

    /* ── Crear ítem nuevo en el catálogo y vincularlo a la línea ── */
    const openNewItem = (idx: number) => {
        setNewItemTargetIdx(idx);
        const linea = items[idx];
        setNewItem({
            categoria_id: '',
            descripcion: (linea?.descripcion_factura || '').toUpperCase(),
            unidad: 'U',
            valor_compra: linea && Number(linea.precio_unitario) > 0 ? String(linea.precio_unitario) : '',
        });
        setShowNewItemModal(true);
    };

    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItem.categoria_id) { toast.error('Selecciona una categoría'); return; }
        if (!newItem.descripcion.trim()) { toast.error('Ingresa la descripción'); return; }
        if (!newItem.unidad.trim()) { toast.error('Ingresa la unidad'); return; }

        setCreatingItem(true);
        try {
            const payload: Record<string, unknown> = {
                categoria_id: Number(newItem.categoria_id),
                descripcion: newItem.descripcion.trim(),
                unidad: newItem.unidad.trim(),
            };
            if (newItem.valor_compra.trim() !== '') payload.valor_compra = Number(newItem.valor_compra) || 0;

            const res = await api.post('/items-inventario', payload);
            // El CRUD genérico devuelve el ítem DIRECTO (res.data), no envuelto en { data }.
            const body = res.data as { data?: ItemInventario } & Partial<ItemInventario>;
            const created = (body.data ?? body) as ItemInventario;
            if (!created || created.id == null) throw new Error('La respuesta del servidor no incluyó el ítem creado');
            setCatalogoItems(prev => [...prev, created]);
            if (newItemTargetIdx != null) {
                updateItem(newItemTargetIdx, { item_id: created.id, descripcion: created.descripcion, unidad: created.unidad });
            }
            toast.success(`Ítem "${created.descripcion}" creado y vinculado`);
            setShowNewItemModal(false);
            setNewItemTargetIdx(null);
        } catch (err) {
            showApiError(err, 'Error al crear el ítem');
        } finally {
            setCreatingItem(false);
        }
    };

    const esRegistrada = estadoOriginal === 'registrada';
    const titulo = esRegistrada ? `Editar factura #${numFactura}` : estadoOriginal === 'borrador' ? 'Continuar factura (borrador)' : 'Registrar factura';
    const esImagen = archivo?.type.startsWith('image/');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!archivo || !esImagen) { setPreviewUrl(null); return; }
        const u = URL.createObjectURL(archivo);
        setPreviewUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [archivo, esImagen]);
    const hayArchivo = !!archivo || !!archivoGuardado;
    const diferenciaLeida = montoLeido != null && items.length > 0 && Math.abs(montoLeido - montoNeto) >= 1;

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={pedirCierre}
                title={titulo}
                description="Registro de lo comprado: no cambia el stock ni el costo del inventario."
                icon={Receipt}
                size="lg"
            >
                {cargandoFactura ? (
                    <SkeletonFormulario campos={5} que="la factura" />
                ) : (
                <form onSubmit={e => { e.preventDefault(); guardar('registrada'); }} className="space-y-5" noValidate>
                    {/* ── Foto o PDF ── */}
                    <div>
                        <span className="text-xs font-bold text-brand-dark mb-1.5 block">Foto o PDF de la factura</span>
                        <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirArchivo} />
                        <input ref={archivoRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={elegirArchivo} />
                        <div className="flex flex-col gap-2">
                            {archivo ? (
                                <div className="overflow-hidden rounded-xl border border-border bg-card">
                                    {previewUrl && (
                                        <img src={previewUrl} alt={`Vista previa de ${archivo.name}`} className="block max-h-56 w-full object-contain bg-muted/40" />
                                    )}
                                    <div className="flex items-center gap-2 border-t border-border px-3 py-2 first:border-t-0">
                                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1 truncate text-xs text-brand-dark">{archivo.name}</span>
                                        <span className="text-caption text-muted-foreground tabular-nums">{formatearTamano(archivo.size)}</span>
                                        <IconButton icon={<X className="h-4 w-4" />} variant="danger" aria-label="Quitar el archivo" onClick={() => setArchivo(null)} />
                                    </div>
                                </div>
                            ) : archivoGuardado && (
                                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate text-xs text-brand-dark">{archivoGuardado.nombre || 'Foto guardada'}</span>
                                    <Button type="button" variant="link" size="sm" onClick={() => setVerArchivo(true)}>Ver</Button>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <Button type="button" variant="glass" onClick={() => camaraRef.current?.click()} disabled={comprimiendo || leyendo}
                                    leftIcon={comprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}>
                                    {hayArchivo ? 'Otra foto' : 'Tomar foto'}
                                </Button>
                                <Button type="button" variant="glass" onClick={() => archivoRef.current?.click()} disabled={comprimiendo || leyendo}
                                    leftIcon={<FileText className="h-4 w-4" />}>
                                    Subir archivo
                                </Button>
                            </div>
                            {lecturaIA && hayArchivo && (
                                <Button type="button" variant="secondary" onClick={leerFactura} disabled={leyendo || comprimiendo}
                                    isLoading={leyendo} leftIcon={<Sparkles className="h-4 w-4" />}>
                                    {leyendo ? 'Leyendo la factura…' : 'Llenar con la foto'}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* ── Número + Proveedor + Fecha ── */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block" htmlFor="factura-numero">N° Factura</label>
                            <input id="factura-numero" type="text" value={numFactura} placeholder="Ej: 001234"
                                onChange={e => { setNumFactura(e.target.value); if (formErrors.numFactura) setFormErrors(p => ({ ...p, numFactura: undefined })); }}
                                className={cn(INPUT, formErrors.numFactura ? 'border-destructive' : 'border-border')} />
                            <FieldError message={formErrors.numFactura} className="mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block" htmlFor="factura-proveedor">Proveedor</label>
                            <input id="factura-proveedor" type="text" value={proveedor} placeholder="Nombre del proveedor"
                                onChange={e => { setProveedor(e.target.value); if (formErrors.proveedor) setFormErrors(p => ({ ...p, proveedor: undefined })); }}
                                className={cn(INPUT, formErrors.proveedor ? 'border-destructive' : 'border-border')} />
                            <FieldError message={formErrors.proveedor} className="mt-1" />
                        </div>
                    </div>
                    <div className="w-48">
                        <label className="text-xs font-bold text-brand-dark mb-1 block" htmlFor="factura-fecha">Fecha de compra</label>
                        <input id="factura-fecha" type="date" value={fechaFactura}
                            onChange={e => { setFechaFactura(e.target.value); if (formErrors.fecha) setFormErrors(p => ({ ...p, fecha: undefined })); }}
                            className={cn(INPUT, formErrors.fecha ? 'border-destructive' : 'border-border')} />
                        <FieldError message={formErrors.fecha} className="mt-1" />
                    </div>

                    {/* ── Ítems ── */}
                    <div>
                        <span className="text-xs font-bold text-brand-dark mb-2 block">Ítems de la factura</span>
                        <div className="space-y-2">
                            {items.map((item, idx) => {
                                const sinVincular = !item.item_id;
                                return (
                                    <div key={idx} className={cn('rounded-xl border p-3 space-y-3', sinVincular && item.descripcion_factura ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-800/60' : 'bg-muted border-border')}>
                                        {item.descripcion_factura && (
                                            <p className="text-caption text-muted-foreground">
                                                En la factura: <span className="font-semibold text-brand-dark">«{item.descripcion_factura}»</span>
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                                <SearchableSelect
                                                    options={availableOptions.filter(o => !items.some((i, j) => j !== idx && i.item_id === o.value))}
                                                    value={item.item_id || null}
                                                    onChange={(val) => selectCatalogItem(idx, val)}
                                                    placeholder="Buscar ítem del catálogo..."
                                                />
                                            </div>
                                            <Button type="button" variant="outline" size="sm" onClick={() => openNewItem(idx)}
                                                title="Crear un ítem nuevo en el catálogo" leftIcon={<PackagePlus className="h-3.5 w-3.5" />}
                                                className="shrink-0 whitespace-nowrap">
                                                <span className="hidden sm:inline">Nuevo</span>
                                            </Button>
                                        </div>
                                        {sinVincular && item.descripcion_factura && (
                                            <p className="flex items-center gap-1.5 text-caption font-semibold text-amber-800 dark:text-amber-300">
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                No está en el catálogo: elígelo arriba o créalo con «Nuevo».
                                            </p>
                                        )}
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-caption text-muted-foreground font-medium">Cant:</span>
                                                    <QtyStepper value={Number(item.cantidad) || 0} onChange={v => updateItem(idx, { cantidad: v })}
                                                        min={0} size="sm" unidad={item.unidad} />
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-caption text-muted-foreground font-medium">P.Unit:</span>
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                                        <input type="number" min={0} step="any" value={item.precio_unitario} aria-label="Precio unitario neto"
                                                            onChange={e => updateItem(idx, { precio_unitario: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })}
                                                            className="w-28 pl-5 pr-2 py-1 text-xs border border-border rounded-lg text-right font-bold bg-card" />
                                                    </div>
                                                </div>
                                            </div>
                                            <IconButton type="button" onClick={() => removeItem(idx)} aria-label="Quitar ítem de la factura"
                                                variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} />
                                        </div>
                                        {Number(item.cantidad) > 0 && Number(item.precio_unitario) > 0 && (
                                            <p className="text-caption text-right text-muted-foreground">
                                                Subtotal: <span className="font-bold text-brand-dark">{fmtMoney(Number(item.cantidad) * Number(item.precio_unitario))}</span>
                                            </p>
                                        )}
                                    </div>
                                );
                            })}

                            {/* eslint-disable-next-line no-restricted-syntax -- añadir fila (dashed full-width, borde reactivo a error) */}
                            <button type="button" onClick={addItem}
                                className={cn(
                                    'w-full border-2 border-dashed rounded-xl py-4 text-center text-xs font-bold text-muted-foreground hover:border-brand-primary/40 hover:text-brand-primary transition-colors',
                                    formErrors.items ? 'border-destructive/60' : 'border-border'
                                )}>
                                <Plus className="h-4 w-4 inline-block mr-1 -mt-0.5" />
                                Agregar ítem
                            </button>
                        </div>
                        <FieldError message={formErrors.items} className="mt-2" />
                    </div>

                    {/* ── Total ── */}
                    {items.length > 0 && (
                        <div className="bg-muted rounded-xl px-4 py-3 border border-border">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                                    <Receipt className="h-3.5 w-3.5 text-brand-primary" /> Total Neto
                                </span>
                                <span className="text-sm font-black text-brand-dark">{fmtMoney(montoNeto)}</span>
                            </div>
                            {diferenciaLeida && (
                                <p className="mt-1 text-caption text-amber-800 dark:text-amber-300 text-right">
                                    La factura dice {fmtMoney(montoLeido!)} neto: revisa cantidades y precios.
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── Observaciones ── */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block" htmlFor="factura-obs">Observaciones</label>
                        <textarea id="factura-obs" value={observaciones} onChange={e => setObservaciones(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl resize-none h-16 bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            placeholder="Opcional..." />
                    </div>

                    {/* ── Acciones ── */}
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2">
                        {esRegistrada ? (
                            <Button type="button" variant="ghost" size="sm" onClick={pedirCierre}>Cancelar</Button>
                        ) : (
                            <Button type="button" variant="outline" size="sm" onClick={async () => { if (await guardar('borrador')) onClose(); }}
                                disabled={!!guardando || leyendo} isLoading={guardando === 'borrador'} leftIcon={<Clock className="h-3.5 w-3.5" />}>
                                Continuar después
                            </Button>
                        )}
                        <Button type="submit" variant="primary" size="sm" disabled={!!guardando || leyendo}
                            isLoading={guardando === 'registrada'} leftIcon={<Receipt className="h-3.5 w-3.5" />}>
                            {esRegistrada ? 'Guardar cambios' : 'Registrar factura'}
                        </Button>
                    </div>
                </form>
                )}
            </Modal>

            {/* ═══ Crear ítem nuevo (anidado) ═══ */}
            <Modal isOpen={showNewItemModal} onClose={() => setShowNewItemModal(false)} title="Crear ítem nuevo" size="md">
                <form onSubmit={handleCreateItem} className="space-y-4" noValidate>
                    <p className="text-label text-muted-foreground">
                        El ítem se agrega al catálogo y se vincula automáticamente a esta línea de la factura.
                    </p>
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block" htmlFor="nuevo-item-cat">Categoría <span className="text-red-500">*</span></label>
                        <select id="nuevo-item-cat" value={newItem.categoria_id}
                            onChange={e => setNewItem(n => ({ ...n, categoria_id: e.target.value ? Number(e.target.value) : '' }))}
                            className={cn(INPUT, 'border-border')} required>
                            <option value="">Seleccionar categoría...</option>
                            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block" htmlFor="nuevo-item-desc">Descripción <span className="text-red-500">*</span></label>
                        <input id="nuevo-item-desc" type="text" value={newItem.descripcion} placeholder="Ej: Saco de cemento especial"
                            onChange={e => setNewItem(n => ({ ...n, descripcion: e.target.value }))}
                            className={cn(INPUT, 'border-border')} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block" htmlFor="nuevo-item-unidad">Unidad <span className="text-red-500">*</span></label>
                            <input id="nuevo-item-unidad" type="text" value={newItem.unidad} placeholder="U, kg, m, m²..."
                                onChange={e => setNewItem(n => ({ ...n, unidad: e.target.value }))}
                                className={cn(INPUT, 'border-border')} required />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block" htmlFor="nuevo-item-valor">
                                Valor compra <span className="text-muted-foreground font-normal">(opcional)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                                <input id="nuevo-item-valor" type="number" min={0} step="any" value={newItem.valor_compra} placeholder="0"
                                    onChange={e => setNewItem(n => ({ ...n, valor_compra: e.target.value }))}
                                    className={cn(INPUT, 'border-border pl-7')} />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewItemModal(false)}>Cancelar</Button>
                        <Button type="submit" variant="primary" size="sm" disabled={creatingItem} isLoading={creatingItem}
                            leftIcon={<PackagePlus className="h-3.5 w-3.5" />}>
                            {creatingItem ? 'Creando...' : 'Crear y vincular'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {verArchivo && idActual && (
                <FacturaArchivoViewer facturaId={idActual} nombre={archivoGuardado?.nombre} mime={archivoGuardado?.mime}
                    onClose={() => setVerArchivo(false)} />
            )}
        </>
    );
};

export default FacturaFormModal;
