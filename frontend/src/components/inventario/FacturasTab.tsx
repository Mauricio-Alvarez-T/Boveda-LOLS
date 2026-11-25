import React, { useState, useEffect, useRef } from 'react';
import { Cargando, Skeleton } from '../ui/Skeleton';
import { Plus, FileText, Trash2, Receipt, Eye, Pencil, History, Paperclip, Clock, Download, Tag, Search, X, Palette } from 'lucide-react';
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
import {
    PALETA, colorDe, nombreColor, paramsFiltros, hayFiltros, FILTROS_VACIOS,
    type ColorFactura, type FiltrosFacturas,
} from './facturas/marcasFactura';
import { descargarExcelCompras, tituloCompras, type LineaCompra } from './facturas/excelCompras';

const fmtMoney = fmtMoneyExacto;
/** Facturas por página (antes la lista quedaba en las 20 del límite por defecto del backend). */
const POR_PAGINA = 50;

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

    /* ── Filtros, paginación y marcas de color (mig 158) ── */
    const [filtros, setFiltros] = useState<FiltrosFacturas>(FILTROS_VACIOS);
    const [busqueda, setBusqueda] = useState('');          // texto del buscador; pasa a `filtros.q` con pausa
    const [pagina, setPagina] = useState(1);
    const [total, setTotal] = useState(0);
    const [cargandoMas, setCargandoMas] = useState(false);
    const [nombresColor, setNombresColor] = useState<Partial<Record<ColorFactura, string | null>>>({});
    const [marcandoId, setMarcandoId] = useState<number | null>(null);   // fila con la paleta abierta
    const [coloresAbierto, setColoresAbierto] = useState(false);
    const [borradorNombres, setBorradorNombres] = useState<Partial<Record<ColorFactura, string>>>({});
    const [exportando, setExportando] = useState(false);
    const pedido = useRef(0);   // descarta respuestas viejas si los filtros cambian rápido
    const yaCargo = useRef(false);

    const fetchFacturas = async (pag = 1) => {
        const id = ++pedido.current;
        // La silueta completa solo en la PRIMERA carga: al filtrar, la barra de filtros no puede desmontarse
        // (perdería el foco del campo que se está escribiendo).
        if (pag === 1) setLoading(prev => prev || !yaCargo.current); else setCargandoMas(true);
        try {
            const res = await api.get('/facturas-inventario', { params: { ...paramsFiltros(filtros), limit: POR_PAGINA, page: pag } });
            if (id !== pedido.current) return;
            yaCargo.current = true;
            const nuevas: FacturaInventario[] = res.data.data || [];
            setFacturas(prev => (pag === 1 ? nuevas : [...prev, ...nuevas]));
            setTotal(Number(res.data.total) || 0);
            setPagina(pag);
        } catch {
            if (id === pedido.current && pag === 1) { setFacturas([]); setTotal(0); }
        } finally {
            if (id === pedido.current) { setLoading(false); setCargandoMas(false); }
        }
    };

    const fetchColores = () => api.get('/facturas-inventario/colores')
        .then(res => setNombresColor(Object.fromEntries(((res.data.data || []) as { color: ColorFactura; nombre: string | null }[]).map(c => [c.color, c.nombre]))))
        .catch(() => setNombresColor({}));

    useEffect(() => {
        api.get('/facturas-inventario/config')
            .then(res => setLecturaIA(!!res.data.data?.lectura_ia))
            .catch(() => setLecturaIA(false));
        fetchColores();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
    }, []);

    // Cada cambio de filtro vuelve a la página 1.
    useEffect(() => {
        fetchFacturas(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchFacturas lee `filtros` del render actual
    }, [filtros]);

    // El buscador aplica con una pausa corta (no un pedido por tecla).
    useEffect(() => {
        const t = setTimeout(() => setFiltros(f => (f.q === busqueda ? f : { ...f, q: busqueda })), 350);
        return () => clearTimeout(t);
    }, [busqueda]);

    const marcar = async (f: FacturaInventario, color: ColorFactura | null) => {
        setMarcandoId(null);
        try {
            await api.put(`/facturas-inventario/${f.id}/marca`, { color });
            // Si hay un filtro de color activo, la fila puede dejar de cumplirlo: se recarga; si no, se actualiza en el lugar.
            if (filtros.color) fetchFacturas(1);
            else setFacturas(prev => prev.map(x => (x.id === f.id ? { ...x, color_marca: color } : x)));
        } catch (err) {
            showApiError(err, 'No se pudo marcar la factura');
        }
    };

    const abrirColores = () => {
        setBorradorNombres(Object.fromEntries(PALETA.map(p => [p.color, nombresColor[p.color] || ''])));
        setColoresAbierto(true);
    };

    const guardarNombres = async () => {
        try {
            const cambiados = PALETA.filter(p => (borradorNombres[p.color] || '').trim() !== (nombresColor[p.color] || ''));
            await Promise.all(cambiados.map(p => api.put(`/facturas-inventario/colores/${p.color}`, { nombre: (borradorNombres[p.color] || '').trim() })));
            await fetchColores();
            setColoresAbierto(false);
            if (cambiados.length) toast.success('Nombres de los colores guardados');
        } catch (err) {
            showApiError(err, 'No se pudieron guardar los nombres');
        }
    };

    const exportar = async () => {
        setExportando(true);
        try {
            const res = await api.get('/facturas-inventario/export-lineas', { params: paramsFiltros(filtros) });
            const lineas: LineaCompra[] = res.data.data || [];
            if (!lineas.length) { toast.info('No hay facturas registradas con estos filtros'); return; }
            const partes: string[] = [];
            if (filtros.desde || filtros.hasta) partes.push(`Fecha de factura: ${filtros.desde ? fmtFecha(filtros.desde) : '…'} al ${filtros.hasta ? fmtFecha(filtros.hasta) : '…'}`);
            if (filtros.q.trim()) partes.push(`Búsqueda: «${filtros.q.trim()}»`);
            if (filtros.color === 'marcadas') partes.push('Solo facturas marcadas');
            else if (filtros.color) partes.push(`Marca: ${nombreColor(filtros.color, nombresColor)}`);
            await descargarExcelCompras(lineas, { titulo: tituloCompras(filtros), filtrosTexto: partes.join(' · ') || 'Todas las facturas registradas', nombres: nombresColor });
        } catch (err) {
            showApiError(err, 'No se pudo exportar');
        } finally {
            setExportando(false);
        }
    };

    const fetchFacturasTodo = () => fetchFacturas(1);

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
                    fetchFacturasTodo();
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
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {/* Excel «COMPRAS» con los filtros activos (mig 158). */}
                <Button variant="secondary" size="sm" onClick={exportar} isLoading={exportando} disabled={loading}
                    leftIcon={<Download className="h-3.5 w-3.5" />} className="whitespace-nowrap">
                    Exportar Excel
                </Button>
                {canCreate && (
                    <Button variant="primary" size="sm" disabled={loading} onClick={() => setFormAbierto('nueva')}
                        leftIcon={<Plus className="h-3.5 w-3.5" />} className="whitespace-nowrap">
                        Nueva Factura
                    </Button>
                )}
            </div>
        </div>
    );

    // Filtros: fecha de factura, búsqueda y marca de color (mig 158).
    const chipColor = (valor: FiltrosFacturas['color'], texto: string, punto?: string) => {
        const activo = filtros.color === valor;
        return (
            // eslint-disable-next-line no-restricted-syntax -- chip de filtro (toggle denso con punto de color), patrón FiltrosRapidos
            <button key={valor || 'todas'} type="button" aria-pressed={activo}
                onClick={() => setFiltros(f => ({ ...f, color: valor }))}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold transition-colors',
                    activo ? 'border-brand-primary bg-brand-primary/10 text-brand-dark' : 'border-border text-muted-foreground hover:bg-muted hover:text-brand-dark')}>
                {punto && <span className={cn('h-2.5 w-2.5 rounded-full', punto)} aria-hidden="true" />}
                {texto}
            </button>
        );
    };
    const barraFiltros = (
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
                <label className="text-caption text-muted-foreground">
                    Desde
                    <input type="date" value={filtros.desde} max={filtros.hasta || undefined} aria-label="Fecha de factura desde"
                        onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))}
                        className="mt-0.5 block w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-brand-dark" />
                </label>
                <label className="text-caption text-muted-foreground">
                    Hasta
                    <input type="date" value={filtros.hasta} min={filtros.desde || undefined} aria-label="Fecha de factura hasta"
                        onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))}
                        className="mt-0.5 block w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-brand-dark" />
                </label>
                <label className="col-span-2 text-caption text-muted-foreground sm:col-span-1">
                    Buscar
                    <span className="relative mt-0.5 block">
                        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <input type="search" value={busqueda} placeholder="N° de factura o proveedor" aria-label="Buscar por número o proveedor"
                            onChange={e => setBusqueda(e.target.value)}
                            className="block w-full rounded-lg border border-border bg-card py-1.5 pl-7 pr-2 text-xs text-brand-dark" />
                    </span>
                </label>
                {hayFiltros(filtros) && (
                    <Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} className="col-span-2 sm:col-span-1"
                        onClick={() => { setBusqueda(''); setFiltros(FILTROS_VACIOS); }}>
                        Limpiar
                    </Button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {chipColor('', 'Todas')}
                {chipColor('marcadas', 'Solo marcadas', 'bg-gradient-to-r from-orange-400 via-blue-400 to-purple-400')}
                {PALETA.map(p => chipColor(p.color, nombreColor(p.color, nombresColor), p.punto))}
                {canCreate && (
                    <IconButton size="sm" variant="ghost" aria-label="Nombrar los colores" title="Ponerle nombre a cada color"
                        onClick={abrirColores} icon={<Palette className="h-3.5 w-3.5" />} />
                )}
            </div>
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
        const marca = colorDe(f.color_marca);
        return (
            <div key={f.id}>
            <div
                onClick={abrir}
                title={borrador ? 'Continuar este borrador' : 'Ver detalle de la factura'}
                className={cn(
                    'flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer',
                    borrador
                        ? 'border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-50 dark:border-amber-800/60 dark:bg-amber-500/10'
                        : 'border-border hover:border-brand-primary/40 hover:bg-muted/40',
                    // Marca de color (mig 158): borde izquierdo grueso del color.
                    marca && cn('border-l-4', marca.borde)
                )}
            >
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        {marca && (
                            <span className="inline-flex items-center gap-1 text-caption font-semibold text-muted-foreground" title={`Marca: ${nombreColor(marca.color, nombresColor)}`}>
                                <span className={cn('h-2.5 w-2.5 rounded-full', marca.punto)} aria-hidden="true" />
                                {nombreColor(marca.color, nombresColor)}
                            </span>
                        )}
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
                    {canCreate && (
                        <IconButton onClick={() => setMarcandoId(marcandoId === f.id ? null : f.id)} aria-label="Marcar con color"
                            title="Marcar con color" aria-expanded={marcandoId === f.id} variant="ghost" size="sm"
                            className="hover:bg-warning/10 hover:text-warning" icon={<Tag className="h-3.5 w-3.5" />} />
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
            {/* Paleta de la marca, bajo la fila (compartida: la ve todo el equipo). */}
            {marcandoId === f.id && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2">
                    <span className="text-caption text-muted-foreground mr-1">Marcar:</span>
                    {PALETA.map(p => (
                        // eslint-disable-next-line no-restricted-syntax -- muestra de color (el color es el dato), chip denso
                        <button key={p.color} type="button" aria-pressed={f.color_marca === p.color} onClick={() => marcar(f, p.color)}
                            className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold transition-colors',
                                f.color_marca === p.color ? 'border-brand-primary bg-brand-primary/10 text-brand-dark' : 'border-border text-muted-foreground hover:bg-muted hover:text-brand-dark')}>
                            <span className={cn('h-2.5 w-2.5 rounded-full', p.punto)} aria-hidden="true" />
                            {nombreColor(p.color, nombresColor)}
                        </button>
                    ))}
                    {f.color_marca && (
                        <Button variant="ghost" size="sm" onClick={() => marcar(f, null)} leftIcon={<X className="h-3.5 w-3.5" />}>Quitar marca</Button>
                    )}
                </div>
            )}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {encabezado}
            {barraFiltros}

            {facturas.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto opacity-20 mb-3" />
                    {hayFiltros(filtros) ? (
                        <p className="text-sm font-medium">Ninguna factura cumple estos filtros</p>
                    ) : (<>
                        <p className="text-sm font-medium">No hay facturas registradas</p>
                        {canCreate && (
                            <p className="text-xs mt-1">Haz click en <span className="font-bold text-brand-dark">+ Nueva Factura</span> para registrar la primera</p>
                        )}
                    </>)}
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
                    {/* Paginación: antes la lista se cortaba en 20 sin aviso. */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-muted-foreground">
                        <span>{facturas.length} de {total} factura{total === 1 ? '' : 's'}</span>
                        {facturas.length < total && (
                            <Button variant="secondary" size="sm" isLoading={cargandoMas} onClick={() => fetchFacturas(pagina + 1)}>
                                Ver más
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Nombre de cada color (compartido): «naranjo = Maquinaria nueva». */}
            <Modal isOpen={coloresAbierto} onClose={() => setColoresAbierto(false)} title="Colores de las marcas" icon={Palette} size="sm"
                description="El nombre se ve en los filtros, en cada factura marcada y en la leyenda del Excel."
                footer={(
                    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="ghost" onClick={() => setColoresAbierto(false)}>Cancelar</Button>
                        <Button type="button" onClick={guardarNombres}>Guardar</Button>
                    </div>
                )}>
                <div className="space-y-2">
                    {PALETA.map(p => (
                        <label key={p.color} className="flex items-center gap-3">
                            <span className={cn('h-4 w-4 shrink-0 rounded-full', p.punto)} aria-hidden="true" />
                            <span className="w-20 shrink-0 text-sm text-muted-foreground">{p.etiqueta}</span>
                            <input type="text" maxLength={60} value={borradorNombres[p.color] || ''} placeholder="Sin nombre"
                                aria-label={`Nombre del color ${p.etiqueta}`}
                                onChange={e => setBorradorNombres(b => ({ ...b, [p.color]: e.target.value }))}
                                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-brand-dark" />
                        </label>
                    ))}
                </div>
            </Modal>

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
                                                            {it.medidas ? ` · Medidas: ${it.medidas}` : ''}
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
                onSaved={fetchFacturasTodo}
            />
        </div>
    );
};

export default FacturasTab;
