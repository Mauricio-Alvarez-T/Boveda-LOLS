import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, FileText, Paperclip, Receipt, Trash2, Maximize2, Loader2, X } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { CurrencyInput } from '../ui/CurrencyInput';
import { SearchableSelect } from '../ui/SearchableSelect';
import { FormError } from '../ui/FormError';
import { VisorAdjunto } from '../ui/VisorAdjunto';
import { compressImage } from '../../utils/compressImage';
import { cn } from '../../utils/cn';
import { formatearTamano, navegadorMuestraPdf } from '../../utils/archivos';
import { fmtMoney } from '../../utils/format';
import { CATEGORIAS, AYUDA_CATEGORIA, GRUPOS_CATEGORIA, CATEGORIAS_GG, CATEGORIAS_MANO_OBRA, CATEGORIAS_SUELDO, PROVEEDORES_FRECUENTES, ESTADOS_PAGO, TIPOS_DOC, CAMPO, ETIQUETA, hoyISO, mensajeError } from './costosConfig';
import { Opciones, Aviso } from './piezas';
import { FotoGastoViewer } from './FotoGastoViewer';
import type { CostoCategoria, CostoEstadoPago, CostoGasto, CostoPartida, CostoTipoDocumento } from '../../types/entities';

interface Props {
    obraId: number;
    /** null = gasto nuevo. */
    gasto: CostoGasto | null;
    partidas: CostoPartida[];
    /** Gasto nuevo desde el detalle de un capítulo o partida: llega con la partida o la categoría ya elegida. */
    partidaInicial?: number | null;
    categoriaInicial?: CostoCategoria | null;
    /** Proveedores ya usados en la obra, para sugerirlos al escribir. */
    proveedores?: string[];
    onClose: () => void;
    onGuardado: () => void;
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

/**
 * Cargar o completar un gasto. Reemplaza el "le saco foto y la mando": con la foto
 * y el monto total basta para guardarlo; lo demás (proveedor, folio, a qué partida
 * va) se completa ahora o después, y mientras falte queda "por completar".
 */
export const GastoModal: React.FC<Props> = ({ obraId, gasto, partidas, partidaInicial = null, categoriaInicial = null, proveedores = [], onClose, onGuardado }) => {
    const editando = !!gasto;
    const [fecha, setFecha] = useState(gasto?.fecha?.slice(0, 10) || hoyISO());
    // Una planilla nueva desde «Sueldos» o «Anticipos» parte como planilla (sin IVA).
    const [tipo, setTipo] = useState<CostoTipoDocumento>(gasto?.tipo_documento
        || (categoriaInicial && CATEGORIAS_SUELDO.has(categoriaInicial) ? 'planilla' : 'factura'));
    const [total, setTotal] = useState(num(gasto?.monto_total));
    const [neto, setNeto] = useState(num(gasto?.monto_neto));
    const [proveedor, setProveedor] = useState(gasto?.proveedor || '');
    const [folio, setFolio] = useState(gasto?.folio || '');
    const [partidaId, setPartidaId] = useState<number | null>(gasto ? gasto.partida_id ?? null : partidaInicial);
    const [categoria, setCategoria] = useState<CostoCategoria | ''>(gasto ? gasto.categoria || '' : categoriaInicial || '');
    const [estadoPago, setEstadoPago] = useState<CostoEstadoPago>(gasto?.estado_pago || 'por_pagar');
    const [vencimiento, setVencimiento] = useState(gasto?.fecha_vencimiento?.slice(0, 10) || '');
    const [fechaPago, setFechaPago] = useState(gasto?.fecha_pago?.slice(0, 10) || '');
    const [observacion, setObservacion] = useState(gasto?.observacion || '');

    const [foto, setFoto] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewRoto, setPreviewRoto] = useState(false);
    const [comprimiendo, setComprimiendo] = useState(false);
    const [verGrande, setVerGrande] = useState(false);
    const [verGuardada, setVerGuardada] = useState(false);
    const camaraRef = useRef<HTMLInputElement>(null);
    const archivoRef = useRef<HTMLInputElement>(null);

    const [guardando, setGuardando] = useState(false);
    const [borrando, setBorrando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const opcionesPartida = useMemo(() => partidas.map(p => ({
        value: p.id,
        label: `${p.capitulo} · ${p.codigo ? `${p.codigo} ` : ''}${p.descripcion}`,
    })), [partidas]);

    const netoEstimado = tipo === 'factura' && total > 0 && !neto ? Math.round(total / 1.19) : null;
    const esPlanilla = tipo === 'planilla';

    // Sueldos y anticipos se pagan con planilla, sin IVA: si quedara «factura», el neto se estimaría
    // total ÷ 1,19 y la mano de obra saldría 16 % más baja.
    const elegirCategoria = (c: CostoCategoria | '') => {
        setCategoria(c);
        if (c && CATEGORIAS_SUELDO.has(c) && tipo === 'factura') setTipo('planilla');
    };

    const elegirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (!f.type.startsWith('image/') && f.type !== 'application/pdf') { setError('La foto tiene que ser una imagen (JPG, PNG, WEBP) o un PDF.'); return; }
        setError(null);
        setComprimiendo(true);
        // Legible para leer montos, folio y RUT (letra chica de una factura): hasta 2.000 px de lado
        // largo y nunca menos de 1.400, sin pasar de ~400 KB (el servidor tiene poco espacio).
        const listo = await compressImage(f, { maxDim: 2000, minDim: 1400, maxBytes: 400 * 1024 }).catch(() => f);
        setComprimiendo(false);
        if (listo.size > 10 * 1024 * 1024) { setError('El archivo pesa más de 10 MB.'); return; }
        setFoto(listo);
        setPreviewRoto(false);
        setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(listo); });
    };

    const quitarFoto = () => {
        setFoto(null);
        setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };

    const campos = () => ({
        fecha,
        tipo_documento: tipo,
        monto_total: total,
        // Neto vacío = el backend lo estima (factura) o usa el total (boleta, guía, otro).
        monto_neto: neto > 0 && !esPlanilla ? neto : '',
        iva: neto > 0 && tipo === 'factura' ? Math.max(0, total - neto) : '',
        proveedor,
        folio,
        partida_id: partidaId ?? '',
        categoria,
        estado_pago: estadoPago,
        // El vencimiento se conserva al pagar (sirve para ver si se pagó a tiempo).
        fecha_vencimiento: vencimiento,
        fecha_pago: estadoPago === 'pagada' ? fechaPago : '',
        observacion,
    });

    const guardar = async () => {
        if (!(total > 0)) { setError('Falta el monto total del documento.'); return; }
        if (neto > total) { setError('El neto no puede ser mayor que el total.'); return; }
        setError(null);
        setGuardando(true);
        try {
            if (editando && gasto) {
                await api.put(`/costos/gastos/${gasto.id}`, campos());
                if (foto) {
                    const fd = new FormData();
                    fd.append('foto', foto, foto.name);
                    await api.post(`/costos/gastos/${gasto.id}/foto`, fd);
                }
                toast.success('Gasto actualizado');
            } else {
                const fd = new FormData();
                for (const [k, v] of Object.entries(campos())) fd.append(k, String(v ?? ''));
                if (foto) fd.append('foto', foto, foto.name);
                await api.post(`/costos/obras/${obraId}/gastos`, fd);
                const falta = (!proveedor.trim() && !esPlanilla) || (!partidaId && !categoria);
                toast.success(falta ? 'Gasto cargado · queda por completar' : 'Gasto cargado');
            }
            onGuardado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo guardar el gasto.'));
        } finally {
            setGuardando(false);
        }
    };

    const borrar = async () => {
        if (!gasto) return;
        if (!window.confirm(`¿Borrar el gasto de ${fmtMoney(gasto.monto_total)}${gasto.proveedor ? ` de ${gasto.proveedor}` : ''}? También se borra su foto. Queda anotado en el historial.`)) return;
        setBorrando(true);
        try {
            await api.delete(`/costos/gastos/${gasto.id}`);
            toast.success('Gasto borrado');
            onGuardado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo borrar el gasto.'));
            setBorrando(false);
        }
    };

    const esImagen = foto?.type.startsWith('image/');

    return (
        <>
            <Modal
                isOpen
                onClose={onClose}
                size="lg"
                icon={Receipt}
                title={editando ? 'Gasto' : 'Cargar gasto'}
                description={editando ? 'Completa o corrige los datos. Cada cambio queda en el historial.' : 'Con la foto y el monto total ya se puede guardar; lo demás se completa después.'}
                footer={
                    <div className="flex w-full items-center justify-between gap-3">
                        {editando ? (
                            <Button variant="destructive" size="sm" onClick={borrar} disabled={borrando || guardando}
                                leftIcon={borrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}>
                                Borrar
                            </Button>
                        ) : <span />}
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                            <Button onClick={guardar} isLoading={guardando} disabled={comprimiendo || borrando}>
                                {editando ? 'Guardar cambios' : 'Guardar gasto'}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="flex flex-col gap-5">
                    {/* ── Foto de la factura ── */}
                    <div>
                        <span className={ETIQUETA}>Foto de la factura o boleta</span>
                        <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirFoto} />
                        <input ref={archivoRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={elegirFoto} />
                        {foto ? (
                            <div className="overflow-hidden rounded-xl border border-border bg-card">
                                {previewUrl && esImagen && !previewRoto ? (
                                    // eslint-disable-next-line no-restricted-syntax -- la imagen entera es el disparador del visor; Button no envuelve media
                                    <button type="button" onClick={() => setVerGrande(true)} title="Ver más grande"
                                        className="group relative block w-full cursor-zoom-in bg-muted/40">
                                        <img src={previewUrl} alt={`Vista previa de ${foto.name}`} onError={() => setPreviewRoto(true)}
                                            className="block max-h-64 w-full object-contain" />
                                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-1 text-micro font-semibold text-brand-dark shadow-sm backdrop-blur">
                                            <Maximize2 className="h-3 w-3" /> Ampliar
                                        </span>
                                    </button>
                                ) : previewUrl && foto.type === 'application/pdf' && navegadorMuestraPdf() ? (
                                    <iframe src={previewUrl} title={`Vista previa de ${foto.name}`} className="block h-64 w-full border-0 bg-white" />
                                ) : (
                                    <div className="flex h-28 flex-col items-center justify-center gap-1.5 bg-muted/40">
                                        <FileText className="h-7 w-7 text-muted-foreground" />
                                        <span className="text-micro text-muted-foreground">Vista previa no disponible</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate text-xs text-brand-dark">{foto.name}</span>
                                    <span className="text-caption text-muted-foreground tabular-nums">{formatearTamano(foto.size)}</span>
                                    <IconButton icon={<X className="h-4 w-4" />} variant="danger" aria-label="Quitar la foto" onClick={quitarFoto} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {gasto?.tiene_foto && (
                                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1 truncate text-xs text-brand-dark">{gasto.foto_nombre || 'Foto guardada'}</span>
                                        <Button variant="link" size="sm" onClick={() => setVerGuardada(true)}>Ver</Button>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="glass" onClick={() => camaraRef.current?.click()} disabled={comprimiendo}
                                        leftIcon={comprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}>
                                        {gasto?.tiene_foto ? 'Otra foto' : 'Tomar foto'}
                                    </Button>
                                    <Button variant="glass" onClick={() => archivoRef.current?.click()} disabled={comprimiendo}
                                        leftIcon={<FileText className="h-4 w-4" />}>
                                        Subir archivo
                                    </Button>
                                </div>
                                <p className="text-caption text-muted-foreground">Foto o PDF. La foto se achica sola para que ocupe poco y se siga leyendo.</p>
                            </div>
                        )}
                    </div>

                    {/* ── Documento ── */}
                    <div>
                        <span className={ETIQUETA}>Documento</span>
                        <Opciones etiqueta="Tipo de documento" valor={tipo} opciones={TIPOS_DOC} onChange={setTipo} />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <CurrencyInput label={esPlanilla ? 'Monto de la planilla *' : 'Monto total *'} value={total} onChange={setTotal} placeholder="$0" />
                        {esPlanilla ? (
                            <p className="self-end pb-2 text-caption text-muted-foreground">Una planilla no lleva IVA: cuenta el total. Anota en Observación de qué es (ej.: «Planilla trabajadores octubre»).</p>
                        ) : (
                            <div>
                                <CurrencyInput label={tipo === 'factura' ? 'Neto (sin IVA)' : 'Neto'} value={neto} onChange={setNeto} placeholder="Opcional" />
                                <p className="mt-1 ml-0.5 text-caption text-muted-foreground">
                                    {tipo === 'factura'
                                        ? (neto > 0 ? `IVA: ${fmtMoney(Math.max(0, total - neto))}` : netoEstimado ? `Si lo dejas vacío se estima: total ÷ 1,19 = ${fmtMoney(netoEstimado)}` : 'El que dice la factura.')
                                        : 'En boleta o guía cuenta el total: ese IVA no se recupera.'}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className={cn('grid grid-cols-2 gap-3', !esPlanilla && 'sm:grid-cols-[minmax(0,1fr)_9rem_10rem]')}>
                        {!esPlanilla && (<>
                        <div className="col-span-2 sm:col-span-1">
                            <label htmlFor="gasto-proveedor" className={ETIQUETA}>Proveedor</label>
                            <input id="gasto-proveedor" list="gasto-proveedores" value={proveedor} onChange={e => setProveedor(e.target.value)} maxLength={200}
                                placeholder="Dedalius, Copec, Sodimac…" className={CAMPO} />
                            <datalist id="gasto-proveedores">
                                {[...new Set([...proveedores, ...PROVEEDORES_FRECUENTES])].sort((a, b) => a.localeCompare(b, 'es')).map(p => <option key={p} value={p} />)}
                            </datalist>
                        </div>
                        <div>
                            <label htmlFor="gasto-folio" className={ETIQUETA}>N° / folio</label>
                            <input id="gasto-folio" value={folio} onChange={e => setFolio(e.target.value)} maxLength={40} inputMode="numeric"
                                placeholder="Opcional" className={CAMPO} />
                        </div>
                        </>)}
                        <div>
                            <label htmlFor="gasto-fecha" className={ETIQUETA}>Fecha</label>
                            <input id="gasto-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={CAMPO} />
                        </div>
                    </div>

                    {/* ── A qué se imputa ── */}
                    <div className="flex flex-col gap-3">
                        <span className={cn(ETIQUETA, 'mb-0')}>¿A qué corresponde?</span>
                        {partidas.length > 0 ? (
                            <SearchableSelect
                                label="Partida del presupuesto"
                                options={opcionesPartida}
                                value={partidaId}
                                onChange={v => setPartidaId(v === null || v === '' ? null : Number(v))}
                                placeholder="Buscar partida…"
                            />
                        ) : (
                            <Aviso icon={FileText} tono="neutro">Esta obra aún no tiene partidas: usa la categoría y asígnalo a una partida cuando esté el presupuesto.</Aviso>
                        )}
                        <div>
                            <label htmlFor="gasto-categoria" className="text-sm font-medium text-muted-foreground ml-0.5">Categoría</label>
                            <select id="gasto-categoria" value={categoria} onChange={e => elegirCategoria(e.target.value as CostoCategoria | '')} className={CAMPO + ' mt-1.5'}>
                                <option value="">{partidaId ? 'La de la partida (opcional)' : 'Elegir…'}</option>
                                {GRUPOS_CATEGORIA.map(g => (
                                    <optgroup key={g.clave} label={`${g.nombre}${g.periodicidad === 'por proyecto' ? ' (por proyecto)' : ''}`}>
                                        {g.categorias.map(c => <option key={c} value={c}>{CATEGORIAS[c]}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                            <p className="mt-1 ml-0.5 text-caption text-muted-foreground">
                                {categoria
                                    ? <>{AYUDA_CATEGORIA[categoria]}{!partidaId && (CATEGORIAS_GG.has(categoria) ? ' · Sin partida, se compara con los gastos generales del presupuesto.' : CATEGORIAS_MANO_OBRA.has(categoria) ? ' · Sin partida, se muestra como mano de obra (va dentro de los precios unitarios).' : '')}</>
                                    : 'Elige el tipo de gasto: mano de obra, gastos generales de obra, materiales o permisos.'}
                            </p>
                        </div>
                    </div>

                    {/* ── Pago ── */}
                    <div>
                        <span className={ETIQUETA}>Pago</span>
                        <Opciones etiqueta="Estado de pago" valor={estadoPago} opciones={ESTADOS_PAGO} onChange={setEstadoPago} />
                        <div className="mt-3 max-w-[12rem]">
                            {estadoPago === 'por_pagar' ? (
                                <>
                                    <label htmlFor="gasto-venc" className="text-sm font-medium text-muted-foreground ml-0.5">Vence el (opcional)</label>
                                    <input id="gasto-venc" type="date" value={vencimiento} onChange={e => setVencimiento(e.target.value)} className={CAMPO + ' mt-1.5'} />
                                </>
                            ) : (
                                <>
                                    <label htmlFor="gasto-pago" className="text-sm font-medium text-muted-foreground ml-0.5">Pagada el</label>
                                    <input id="gasto-pago" type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} className={CAMPO + ' mt-1.5'} />
                                    {!fechaPago && <p className="mt-1 ml-0.5 text-caption text-muted-foreground">Si la dejas vacía, queda la de hoy.</p>}
                                </>
                            )}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="gasto-obs" className={ETIQUETA}>Observación</label>
                        <textarea id="gasto-obs" value={observacion} onChange={e => setObservacion(e.target.value)} maxLength={500} rows={2}
                            placeholder="Ej.: subió el precio del cemento respecto a la cotización" className={CAMPO} />
                    </div>

                    <FormError message={error} />
                </div>
            </Modal>

            {verGrande && foto && previewUrl && (
                <VisorAdjunto url={previewUrl} mime={foto.type} nombre={foto.name} size={foto.size} onClose={() => setVerGrande(false)} />
            )}
            {verGuardada && gasto?.tiene_foto && <FotoGastoViewer gasto={gasto} onClose={() => setVerGuardada(false)} />}
        </>
    );
};

export default GastoModal;
