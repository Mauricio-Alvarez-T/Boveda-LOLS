import React, { useState, useEffect } from 'react';
import { Cargando, Skeleton } from '../ui/Skeleton';
import { Plus, FileText, Trash2, Receipt, Eye, Pencil, History, Paperclip, Clock } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { FacturaInventario } from '../../types/entities';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { StatusBadge } from '../ui/StatusBadge';
import { fmtFecha } from '../../utils/fechas';
import { fmtMoneyExacto } from '../../utils/format';
import { showApiError, showConfirmToast } from '../../utils/toastUtils';
import { FacturaFormModal } from './facturas/FacturaFormModal';
import { FacturaArchivoViewer } from './facturas/FacturaArchivoViewer';
import type { FacturaDetalle } from './facturas/tipos';

const fmtMoney = fmtMoneyExacto;

interface Props {
    canCreate: boolean;
    canDelete: boolean;
    /**
     * Modo Bodega Virtual (mig 099). Ajusta SOLO lo MOSTRADO: cuando no está
     * en 'sumar', los ítems con destino virtual se restan del monto exhibido y
     * en 'ocultar' además se esconden del detalle. Solo afecta a facturas
     * anteriores a la mig 157 (las nuevas no tienen destino).
     */
    bodegaVirtualModo?: 'ocultar' | 'mostrar' | 'sumar';
}

/**
 * Facturas de inventario = REGISTRO de lo comprado (mig 157, pedido Daphne 2026-11-25).
 * No mueven stock ni costo. Cada una guarda su foto/PDF; se puede dejar a medias
 * como borrador («Continuar después») y la IA puede leer la foto para prellenarla.
 * Orden: borradores arriba, después por fecha de compra (la más nueva primero).
 */
const FacturasTab: React.FC<Props> = ({ canCreate, canDelete, bodegaVirtualModo = 'ocultar' }) => {
    const [facturas, setFacturas] = useState<FacturaInventario[]>([]);
    const [loading, setLoading] = useState(false);
    const [lecturaIA, setLecturaIA] = useState(false);

    /* ── Formulario: null = cerrado; 'nueva' = alta; número = borrador / edición ── */
    const [formAbierto, setFormAbierto] = useState<'nueva' | number | null>(null);

    /* ── Vista previa (detalle) ── */
    const [detalleId, setDetalleId] = useState<number | null>(null);
    const [detalle, setDetalle] = useState<FacturaDetalle | null>(null);
    const [verArchivo, setVerArchivo] = useState(false);
    // Historial de modificaciones de la factura abierta (GET /:id/historial).
    const [historial, setHistorial] = useState<Array<{
        id: number; fecha: string; usuario_nombre: string | null;
        resumen: string | null; items_detalle: string[];
    }>>([]);

    const fetchFacturas = async () => {
        setLoading(prev => prev || facturas.length === 0);
        try {
            const res = await api.get('/facturas-inventario');
            setFacturas(res.data.data || []);
        } catch { setFacturas([]); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchFacturas();
        api.get('/facturas-inventario/config')
            .then(res => setLecturaIA(!!res.data.data?.lectura_ia))
            .catch(() => setLecturaIA(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
    }, []);

    /* ── Vista previa: cargar detalle con ítems + historial de cambios ── */
    const openDetalle = async (id: number) => {
        setDetalleId(id);
        setDetalle(null);
        setHistorial([]);
        try {
            const [resDetalle, resHistorial] = await Promise.all([
                api.get(`/facturas-inventario/${id}`),
                // El historial no bloquea la vista si falla (degrada a vacío).
                api.get(`/facturas-inventario/${id}/historial`).catch(() => ({ data: { data: [] } })),
            ]);
            setDetalle(resDetalle.data.data);
            setHistorial(resHistorial.data.data || []);
        } catch (err) {
            showApiError(err, 'No se pudo cargar la factura');
            setDetalleId(null);
        }
    };

    /* ── Anular / descartar borrador (no toca stock desde la mig 157) ── */
    const handleAnular = (f: FacturaInventario) => {
        const borrador = f.estado === 'borrador';
        showConfirmToast({
            message: borrador
                ? '¿Descartar este borrador? Se borra de la lista.'
                : `¿Anular la factura #${f.numero_factura}? Sale de la lista; el inventario no cambia.`,
            confirmLabel: borrador ? 'Sí, descartar' : 'Sí, anular',
            cancelLabel: 'No',
            onConfirm: async () => {
                try {
                    await api.put(`/facturas-inventario/${f.id}/anular`);
                    toast.success(borrador ? 'Borrador descartado' : 'Factura anulada');
                    fetchFacturas();
                } catch (err) {
                    showApiError(err, 'Error al anular');
                }
            },
        });
    };

    const borradores = facturas.filter(f => f.estado === 'borrador');
    const registradas = facturas.filter(f => f.estado !== 'borrador');

    /* ── Render ── */
    // Header + botón (también sobre la silueta de carga, apagado: la ventana se monta recién con la lista).
    const encabezado = (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <h3 className="text-sm font-bold text-brand-dark">Facturas de Inventario</h3>
                <p className="text-caption text-muted-foreground">Registro de lo comprado. No cambia el stock del inventario.</p>
            </div>
            {canCreate && (
                <Button variant="primary" size="sm" disabled={loading} onClick={() => setFormAbierto('nueva')}
                    leftIcon={<Plus className="h-3.5 w-3.5" />}>
                    Nueva Factura
                </Button>
            )}
        </div>
    );

    if (loading) return (
        <div className="space-y-4">
            {encabezado}
            {/* Silueta de las filas: número y proveedor, fecha y monto, y sus botones. */}
            <Cargando que="las facturas" className="space-y-2">
                {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border" aria-hidden="true">
                        <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-3.5 w-16 shrink-0" />
                                <Skeleton className={i % 2 ? 'h-3 w-24' : 'h-3 w-32'} />
                            </div>
                            <Skeleton className="h-3 w-40 max-w-full" />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Skeleton className="h-8 w-8 rounded-lg" />
                            {canCreate && <Skeleton className="h-8 w-8 rounded-lg" />}
                        </div>
                    </div>
                ))}
            </Cargando>
        </div>
    );

    const fila = (f: FacturaInventario) => {
        const borrador = f.estado === 'borrador';
        // Monto MOSTRADO según el modo Bodega Virtual (solo facturas viejas con destino virtual).
        const montoVirtual = Number(f.monto_virtual || 0);
        const restarVirtual = bodegaVirtualModo !== 'sumar' && montoVirtual > 0;
        const montoMostrado = restarVirtual ? Number(f.monto_neto) - montoVirtual : Number(f.monto_neto);
        const abrir = () => (borrador && canCreate ? setFormAbierto(f.id) : openDetalle(f.id));
        return (
            <div
                key={f.id}
                onClick={abrir}
                title={borrador ? 'Continuar este borrador' : 'Ver detalle de la factura'}
                className={cn(
                    'flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer',
                    borrador
                        ? 'border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-50 dark:border-amber-800/60 dark:bg-amber-500/10'
                        : 'border-border hover:border-brand-primary/40 hover:bg-muted/40'
                )}
            >
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-brand-dark">{f.numero_factura ? `#${f.numero_factura}` : 'Sin número'}</span>
                        <span className="text-caption text-muted-foreground truncate">{f.proveedor || 'Proveedor pendiente'}</span>
                        {borrador && <StatusBadge tone="warning" label="BORRADOR" />}
                        {f.tiene_archivo && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Tiene foto o PDF" />}
                        {restarVirtual && (
                            <span
                                className="px-1.5 py-0.5 rounded-md text-caption font-bold border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-800/60 shrink-0"
                                title={`Monto del documento: ${fmtMoney(Number(f.monto_neto))} (incluye ${fmtMoney(montoVirtual)} en bodega virtual)`}
                            >
                                VIRTUAL −{fmtMoney(montoVirtual)}
                            </span>
                        )}
                    </div>
                    <p className="text-label text-muted-foreground">
                        {f.fecha_factura ? fmtFecha(f.fecha_factura) : 'Sin fecha'} &middot; {fmtMoney(montoMostrado)} neto
                        {borrador && f.registrado_por_nombre ? ` · empezó ${f.registrado_por_nombre}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {borrador ? (
                        canCreate && (
                            <Button variant="secondary" size="sm" onClick={() => setFormAbierto(f.id)} leftIcon={<Clock className="h-3.5 w-3.5" />}>
                                Continuar
                            </Button>
                        )
                    ) : (
                        <IconButton onClick={() => openDetalle(f.id)} aria-label="Ver detalle" variant="ghost" size="sm"
                            icon={<Eye className="h-3.5 w-3.5" />} />
                    )}
                    {!borrador && canCreate && (
                        <IconButton onClick={() => setFormAbierto(f.id)} aria-label="Editar factura" variant="ghost" size="sm"
                            icon={<Pencil className="h-3.5 w-3.5" />} />
                    )}
                    {canDelete && (
                        <IconButton onClick={() => handleAnular(f)} aria-label={borrador ? 'Descartar borrador' : 'Anular factura'}
                            variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {encabezado}

            {facturas.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto opacity-20 mb-3" />
                    <p className="text-sm font-medium">No hay facturas registradas</p>
                    {canCreate && (
                        <p className="text-xs mt-1">Haz click en <span className="font-bold text-brand-dark">+ Nueva Factura</span> para registrar la primera</p>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {borradores.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-caption font-bold uppercase tracking-wider text-muted-foreground">Por terminar</p>
                            {borradores.map(fila)}
                        </div>
                    )}
                    {registradas.length > 0 && (
                        <div className="space-y-2">
                            {borradores.length > 0 && <p className="text-caption font-bold uppercase tracking-wider text-muted-foreground">Registradas</p>}
                            {registradas.map(fila)}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ VISTA PREVIA (DETALLE) ═══ */}
            <Modal
                isOpen={detalleId !== null}
                onClose={() => { setDetalleId(null); setDetalle(null); }}
                title={detalle ? `Factura #${detalle.numero_factura}` : 'Factura'}
                size="lg"
            >
                {!detalle ? (
                    // Silueta de la vista previa: cabecera, «Ítems» y «Total Neto» con sus rótulos de verdad.
                    <Cargando que="la factura" className="space-y-4">
                        <div className="bg-muted/40 rounded-xl border border-border p-4" aria-hidden="true">
                            <div className="flex h-5 items-center"><Skeleton className="h-4 w-24" /></div>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                {([['Proveedor:', 'w-28'], ['Fecha:', 'w-20'], ['Registró:', 'w-24']] as const).map(([r, ancho]) => (
                                    <p key={r} className="text-muted-foreground flex items-center gap-1 min-w-0">
                                        {r} <Skeleton className={cn('h-3 max-w-full', ancho)} />
                                    </p>
                                ))}
                            </div>
                        </div>
                        <div aria-hidden="true">
                            <p className="text-xs font-bold text-brand-dark mb-2">Ítems</p>
                            <div className="space-y-2">
                                {[0, 1, 2].map(i => (
                                    <div key={i} className="flex items-start justify-between gap-3 px-3 py-2 rounded-xl border border-border">
                                        <div className="flex-1 min-w-0 space-y-1.5">
                                            <Skeleton className={i === 1 ? 'h-3.5 w-1/2' : 'h-3.5 w-3/4'} />
                                            <Skeleton className="h-3 w-2/5" />
                                        </div>
                                        <Skeleton className="h-3.5 w-16 shrink-0" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between bg-muted/40 rounded-xl px-4 py-3 border border-border" aria-hidden="true">
                            <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                                <Receipt className="h-3.5 w-3.5 text-brand-primary" /> Total Neto
                            </span>
                            <Skeleton className="h-4 w-24" />
                        </div>
                    </Cargando>
                ) : (
                    <div className="space-y-4 datos-aparecen">
                        {/* Cabecera */}
                        <div className="bg-muted rounded-xl border border-border p-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-brand-dark">#{detalle.numero_factura}</span>
                                {!detalle.activo && (
                                    <StatusBadge tone="danger" label="ANULADA" />
                                )}
                                {detalle.activo && historial.length > 0 && (
                                    <StatusBadge tone="warning" label="MODIFICADA" />
                                )}
                            </div>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                <p className="text-muted-foreground">Proveedor: <span className="font-semibold text-brand-dark">{detalle.proveedor}</span></p>
                                <p className="text-muted-foreground">Fecha: <span className="font-semibold text-brand-dark">{fmtFecha(detalle.fecha_factura)}</span></p>
                                {detalle.registrado_por_nombre && (
                                    <p className="text-muted-foreground">Registró: <span className="font-semibold text-brand-dark">{detalle.registrado_por_nombre}</span></p>
                                )}
                            </div>
                        </div>

                        {/* Foto / PDF de la factura */}
                        {detalle.tiene_archivo ? (
                            <Button variant="secondary" size="sm" onClick={() => setVerArchivo(true)} leftIcon={<Paperclip className="h-3.5 w-3.5" />}>
                                Ver la factura ({detalle.archivo_nombre || 'foto'})
                            </Button>
                        ) : (
                            <p className="text-caption text-muted-foreground italic">Sin foto ni PDF adjunto.</p>
                        )}

                        {/* Ítems — el filtrado por modo Bodega Virtual es SOLO de render (facturas viejas). */}
                        {(() => {
                            const allItems = detalle.items || [];
                            const virtualSum = allItems.reduce((s, it) => s + (it.bodega_es_virtual ? Number(it.cantidad) * Number(it.precio_unitario) : 0), 0);
                            const restar = bodegaVirtualModo !== 'sumar' && virtualSum > 0;
                            const visibles = bodegaVirtualModo === 'ocultar' ? allItems.filter(it => !it.bodega_es_virtual) : allItems;
                            const ocultos = allItems.length - visibles.length;
                            return (
                                <>
                                    <div>
                                        <p className="text-xs font-bold text-brand-dark mb-2">Ítems</p>
                                        <div className="space-y-2">
                                            {visibles.map((it, idx) => (
                                                <div key={idx} className="flex items-start justify-between gap-3 px-3 py-2 rounded-xl border border-border">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-brand-dark break-words flex items-center gap-1.5">
                                                            {it.item_descripcion || it.descripcion_factura}
                                                            {!!it.bodega_es_virtual && (
                                                                <span className="px-1.5 py-0.5 rounded-md text-caption font-bold border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-800/60 shrink-0">
                                                                    VIRTUAL
                                                                </span>
                                                            )}
                                                        </p>
                                                        {it.descripcion_factura && it.item_descripcion && it.descripcion_factura !== it.item_descripcion && (
                                                            <p className="text-caption text-muted-foreground break-words">En la factura: «{it.descripcion_factura}»</p>
                                                        )}
                                                        <p className="text-caption text-muted-foreground">
                                                            {Number(it.cantidad).toLocaleString('es-CL')} {it.unidad || ''} &middot; {fmtMoney(it.precio_unitario)} c/u
                                                            {/* Destino: solo facturas anteriores a la mig 157 (las que sí movían stock). */}
                                                            {it.obra_nombre ? ` · Obra: ${it.obra_nombre}` : it.bodega_nombre ? ` · Bodega: ${it.bodega_nombre}` : ''}
                                                        </p>
                                                    </div>
                                                    <span className="text-xs font-bold text-brand-dark shrink-0">
                                                        {fmtMoney(Number(it.cantidad) * Number(it.precio_unitario))}
                                                    </span>
                                                </div>
                                            ))}
                                            {ocultos > 0 && (
                                                <p className="text-caption text-muted-foreground italic">
                                                    {ocultos} ítem{ocultos === 1 ? '' : 's'} en bodega virtual oculto{ocultos === 1 ? '' : 's'} (modo "Virtual oculta").
                                                </p>
                                            )}
                                            {allItems.length === 0 && (
                                                <p className="text-xs text-muted-foreground italic">Sin ítems.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Total mostrado según modo; el documento (monto_neto) no cambia */}
                                    <div className="bg-muted rounded-xl px-4 py-3 border border-border">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                                                <Receipt className="h-3.5 w-3.5 text-brand-primary" /> Total Neto
                                            </span>
                                            <span className="text-sm font-black text-brand-dark">
                                                {fmtMoney(restar ? Number(detalle.monto_neto) - virtualSum : Number(detalle.monto_neto))}
                                            </span>
                                        </div>
                                        {restar && (
                                            <p className="mt-1 text-caption text-muted-foreground text-right">
                                                En bodega virtual: {fmtMoney(virtualSum)} (no suma) · Documento: {fmtMoney(Number(detalle.monto_neto))}
                                            </p>
                                        )}
                                    </div>
                                </>
                            );
                        })()}

                        {/* Observaciones */}
                        {detalle.observaciones && (
                            <div>
                                <p className="text-xs font-bold text-brand-dark mb-1">Observaciones</p>
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{detalle.observaciones}</p>
                            </div>
                        )}

                        {/* Historial de cambios (ediciones/anulación post-ingreso) */}
                        {historial.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-brand-dark mb-2 flex items-center gap-1.5">
                                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                                    Historial de cambios
                                </p>
                                <div className="space-y-2">
                                    {historial.map(h => (
                                        <div key={h.id} className="px-3 py-2 rounded-xl border border-border bg-muted/40">
                                            <p className="text-xs font-medium text-brand-dark">
                                                {h.resumen || 'Modificación registrada'}
                                            </p>
                                            {h.items_detalle.length > 0 && (
                                                <ul className="mt-1 space-y-0.5">
                                                    {h.items_detalle.map((linea, i) => (
                                                        <li key={i} className="text-caption text-muted-foreground">· {linea}</li>
                                                    ))}
                                                </ul>
                                            )}
                                            <p className="mt-1 text-caption text-muted-foreground/70">
                                                {h.usuario_nombre || 'Sistema'} · {new Date(h.fecha).toLocaleString('es-CL', {
                                                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                                                })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {verArchivo && detalle?.tiene_archivo && (
                <FacturaArchivoViewer
                    facturaId={detalle.id}
                    nombre={detalle.archivo_nombre}
                    mime={detalle.archivo_mime}
                    descripcion={<span>#{detalle.numero_factura} · {detalle.proveedor} · {fmtMoney(Number(detalle.monto_neto))} neto</span>}
                    onClose={() => setVerArchivo(false)}
                />
            )}

            <FacturaFormModal
                isOpen={formAbierto !== null}
                facturaId={typeof formAbierto === 'number' ? formAbierto : null}
                lecturaIA={lecturaIA}
                onClose={() => setFormAbierto(null)}
                onSaved={fetchFacturas}
            />
        </div>
    );
};

export default FacturasTab;
