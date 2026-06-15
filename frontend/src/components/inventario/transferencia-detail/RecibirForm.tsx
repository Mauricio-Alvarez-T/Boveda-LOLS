import React, { useState } from 'react';
import { PackageCheck, PackageOpen, Info, AlertTriangle, ShoppingBag } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Modal } from '../../ui/Modal';
import type { TransferenciaItem } from '../../../types/entities';
import { ProgressBar } from '../../ui/ProgressBar';
import { ImagePicker } from '../../ui/ImagePicker';
import { QtyStepper } from '../../ui/QtyStepper';

interface ReceiveItem { item_id: number; cantidad_recibida: number; correcto: boolean; observacion: string; }

/**
 * Form de recepción de catálogo (parcial vs total): tabla +/− por ítem, checkbox
 * "entrega final", banner/modal de merma. Extraído de TransferenciaDetail.tsx
 * (Fase 1) — única instancia (catálogo, items.length>0). El estado vive en el hook
 * useTransferenciaDetail y se pasa por props; el padre lo monta condicionalmente.
 */
export const RecibirForm: React.FC<{
    items: TransferenciaItem[];
    receiveItems: ReceiveItem[];
    setReceiveItems: React.Dispatch<React.SetStateAction<ReceiveItem[]>>;
    cierreFinal: boolean;
    setCierreFinal: React.Dispatch<React.SetStateAction<boolean>>;
    confirmMermaOpen: boolean;
    setConfirmMermaOpen: React.Dispatch<React.SetStateAction<boolean>>;
    pendientePorItem: (item: TransferenciaItem) => number;
    onRecibir: (items: { item_id: number; cantidad_recibida: number; observacion?: string }[], tipo?: 'parcial' | 'total', observacion?: string, itemsCustom?: { transferencia_item_custom_id: number; cantidad_recibida: number }[]) => Promise<number | null>;
    /** Sube una foto OPCIONAL tras registrar la recepción (best-effort, no bloquea). */
    onUploadFoto?: (recepcionId: number, file: File) => Promise<boolean>;
    loading: boolean;
    /** Nº de entregas ya registradas (para el badge "Viaje N" y el avance global). */
    viajesPrevios?: number;
    /** Ítems personalizados aprobados (para recibir su cantidad en solicitudes mixtas). */
    itemsCustom?: { id: number; descripcion: string; unidad: string | null; cantidad: number; cantidad_aprobada?: number | null; cantidad_recibida?: number; aprobado?: boolean }[];
    onClose: () => void;
    onOpenItem: (itemId: number) => void;
}> = ({ items, receiveItems, setReceiveItems, cierreFinal, setCierreFinal, confirmMermaOpen, setConfirmMermaOpen, pendientePorItem, onRecibir, onUploadFoto, loading, viajesPrevios = 0, itemsCustom = [], onClose, onOpenItem }) => {
    const [fotoFile, setFotoFile] = useState<File | null>(null);
    const [customRecibido, setCustomRecibido] = useState<Record<number, number>>({});

    // Personalizados aprobados con saldo pendiente (aprobada − ya recibido).
    const customPend = itemsCustom
        .filter(c => c.aprobado !== false)
        .map(c => {
            const aprob = c.cantidad_aprobada != null ? c.cantidad_aprobada : c.cantidad;
            return { id: c.id, descripcion: c.descripcion, unidad: c.unidad, aprob, pendiente: Math.max(0, aprob - (c.cantidad_recibida || 0)) };
        });
    const totalCustomEsteViaje = customPend.reduce((s, c) => s + (customRecibido[c.id] || 0), 0);
    const customRecibidoPayload = () => customPend
        .map(c => ({ transferencia_item_custom_id: c.id, cantidad_recibida: customRecibido[c.id] || 0 }))
        .filter(x => x.cantidad_recibida > 0);

    // Cálculos derivados para la UI:
    // - totalRecibidoEsteViaje = suma de inputs (info en footer)
    // - totalFaltaGlobal = suma de pendientes (lo que el camión debería traer)
    // - hayFaltantes = true si suma_inputs < suma_falta (al menos 1 ítem no completa)
    const totalRecibidoEsteViaje = receiveItems.reduce((s, ri) => s + (ri.cantidad_recibida || 0), 0);
    const totalFaltaGlobal = items.reduce((s, it) => s + pendientePorItem(it), 0);
    const totalRecibidoPrevio = items.reduce((s, it) => s + (Number(it.cantidad_recibida) || 0), 0);
    const hayFaltantes = items.some((it, idx) => {
        const ri = receiveItems[idx];
        if (!ri) return false;
        return ri.cantidad_recibida < pendientePorItem(it);
    });

    // Ítems que quedarán sin recibir si se cierra ahora.
    const faltantesAlCerrar = items
        .map((it, idx) => {
            const ri = receiveItems[idx];
            if (!ri) return null;
            const faltante = pendientePorItem(it) - ri.cantidad_recibida;
            if (faltante <= 0) return null;
            return {
                descripcion: it.item_descripcion || `Item #${it.item_id}`,
                cantidad: faltante,
                unidad: it.unidad || '',
            };
        })
        .filter((x): x is { descripcion: string; cantidad: number; unidad: string } => x !== null);

    // Ítems con SOBRANTE (llegó MÁS de lo pendiente) — antes el cierre los
    // registraba como discrepancia en silencio; ahora se avisa en el modal.
    const sobrantesAlCerrar = items
        .map((it, idx) => {
            const ri = receiveItems[idx];
            if (!ri) return null;
            const sobra = ri.cantidad_recibida - pendientePorItem(it);
            if (sobra <= 0) return null;
            return {
                descripcion: it.item_descripcion || `Item #${it.item_id}`,
                cantidad: sobra,
                unidad: it.unidad || '',
            };
        })
        .filter((x): x is { descripcion: string; cantidad: number; unidad: string } => x !== null);
    const haySobrante = sobrantesAlCerrar.length > 0;

    const handleCerrarTotal = async () => {
        const recepcionId = await onRecibir(
            receiveItems.map(ri => ({
                item_id: ri.item_id,
                cantidad_recibida: ri.cantidad_recibida,
            })),
            'total', undefined, customRecibidoPayload()
        );
        if (recepcionId) {
            if (fotoFile && onUploadFoto) await onUploadFoto(recepcionId, fotoFile);
            onClose();
        }
    };

    const handleClickCerrar = () => {
        // Confirmar si hay faltante sin marcar "entrega final" O si hay sobrante
        // (llegó más de lo enviado) — ambos generan discrepancia.
        if ((hayFaltantes && !cierreFinal) || haySobrante) {
            setConfirmMermaOpen(true);
        } else {
            handleCerrarTotal();
        }
    };

    const handleParcial = async () => {
        const recepcionId = await onRecibir(
            receiveItems.map(ri => ({
                item_id: ri.item_id,
                cantidad_recibida: ri.cantidad_recibida,
            })),
            'parcial', undefined, customRecibidoPayload()
        );
        if (recepcionId) {
            if (fotoFile && onUploadFoto) await onUploadFoto(recepcionId, fotoFile);
            onClose();
        }
    };

    // Quick-fill: rellena todos al pendiente / vacía todos.
    const setAll = (mode: 'pendiente' | 'cero') => {
        setReceiveItems(receiveItems.map((ri, idx) => ({
            ...ri,
            cantidad_recibida: mode === 'pendiente' ? pendientePorItem(items[idx]) : 0,
        })));
    };

    return (
        <div className="shrink-0 border border-brand-primary/30 bg-brand-primary/5 rounded-xl mb-4 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-brand-primary/20 bg-card/60">
                <h4 className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
                    <PackageCheck className="h-4 w-4 text-brand-primary" /> Recepción de cargamento
                </h4>
                <p className="text-label text-muted-foreground mt-0.5">
                    Marca qué llegó este viaje. Si falta algo, podrás registrar otros viajes después.
                </p>
            </div>

            {/* Avance global de la recepción (acumulado de viajes previos) */}
            {(viajesPrevios > 0 || totalRecibidoPrevio > 0) && (
                <div className="px-4 py-3 border-b border-brand-primary/20 bg-card/30 space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-label font-bold text-brand-dark">Avance de la recepción</span>
                        {viajesPrevios > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold whitespace-nowrap">
                                Viaje {viajesPrevios + 1}
                            </span>
                        )}
                    </div>
                    <ProgressBar recibido={totalRecibidoPrevio} pendiente={totalFaltaGlobal} showLabel />
                    <p className="text-caption text-muted-foreground tabular-nums">
                        {totalRecibidoPrevio} recibido · {totalFaltaGlobal} pendiente
                    </p>
                </div>
            )}

            {/* Tabla densa: una fila por ítem */}
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-brand-primary border-b border-border">
                            <th className="text-left px-3 py-2 font-bold text-white">Ítem</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-20">Enviada</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-20">Falta</th>
                            <th className="text-left px-3 py-2 font-bold text-white w-44">
                                <div className="flex items-center justify-between gap-2">
                                    <span>Llegó este viaje</span>
                                    <span className="flex gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setAll('pendiente')}
                                            className="text-micro font-bold text-white hover:underline"
                                            title="Rellenar todo al pendiente"
                                        >
                                            todo
                                        </button>
                                        <span className="text-white/60">·</span>
                                        <button
                                            type="button"
                                            onClick={() => setAll('cero')}
                                            className="text-micro font-bold text-white hover:underline"
                                            title="Vaciar todos los inputs"
                                        >
                                            nada
                                        </button>
                                    </span>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => {
                            const ri = receiveItems[idx];
                            if (!ri) return null;
                            const enviada = Number(item.cantidad_enviada) || Number(item.cantidad_solicitada);
                            const falta = pendientePorItem(item);
                            const sobrante = ri.cantidad_recibida > falta ? ri.cantidad_recibida - falta : 0;
                            const incompleto = ri.cantidad_recibida < falta;
                            return (
                                <tr key={item.id || idx} className={cn(idx % 2 === 0 ? "bg-card" : "bg-muted")}>
                                    <td className="px-3 py-1.5 text-brand-dark">
                                        <button
                                            type="button"
                                            onClick={() => onOpenItem(item.item_id)}
                                            className="text-left font-medium hover:underline hover:text-brand-primary transition-colors cursor-pointer"
                                        >
                                            {item.item_descripcion || `Item #${item.item_id}`}
                                        </button>
                                        {item.unidad && <span className="text-caption text-muted-foreground ml-1">({item.unidad})</span>}
                                    </td>
                                    <td className="text-center text-muted-foreground">{enviada}</td>
                                    <td className={cn(
                                        "text-center font-bold",
                                        falta === 0 ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"
                                    )}>
                                        {falta}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <QtyStepper
                                                value={ri.cantidad_recibida}
                                                onChange={c => {
                                                    const updated = [...receiveItems];
                                                    updated[idx] = { ...updated[idx], cantidad_recibida: c };
                                                    setReceiveItems(updated);
                                                }}
                                                size="lg"
                                                variant="card"
                                                warning={sobrante > 0 ? 'sobrante' : null}
                                                ariaLabel={item.item_descripcion || `Item #${item.item_id}`}
                                            />
                                            {sobrante > 0 && (
                                                <span
                                                    className="ml-1 text-micro font-bold text-amber-700 bg-amber-100 border border-amber-300 dark:text-amber-200 dark:bg-amber-500/15 dark:border-amber-800 px-1.5 py-0.5 rounded-full"
                                                    title="Vino más de lo enviado — se registrará como sobrante al cerrar"
                                                >
                                                    +{sobrante} sobrante
                                                </span>
                                            )}
                                            {incompleto && falta > 0 && ri.cantidad_recibida > 0 && (
                                                <span
                                                    className="ml-1 text-micro font-medium text-muted-foreground"
                                                    title={`Faltan ${falta - ri.cantidad_recibida} para completar este ítem`}
                                                >
                                                    faltan {falta - ri.cantidad_recibida}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Otros materiales (personalizados) — recepción en solicitudes mixtas */}
            {customPend.length > 0 && (
                <div className="border-t border-brand-primary/20 px-4 py-3">
                    <p className="text-label font-black text-brand-dark/60 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5" /> Otros materiales
                    </p>
                    <ul className="space-y-2">
                        {customPend.map(c => (
                            <li key={c.id} className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-xs font-medium text-brand-dark truncate">{c.descripcion}</div>
                                    <div className="text-caption text-muted-foreground tabular-nums">aprobado {c.aprob} · pendiente {c.pendiente}{c.unidad ? ` ${c.unidad}` : ''}</div>
                                </div>
                                <QtyStepper
                                    value={customRecibido[c.id] || 0}
                                    onChange={v => setCustomRecibido(prev => ({ ...prev, [c.id]: v }))}
                                    size="md"
                                    variant="card"
                                    unidad={c.unidad}
                                    ariaLabel={c.descripcion}
                                />
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Sticky footer: checkbox + totales + botones */}
            <div className="border-t border-brand-primary/20 bg-muted/40 px-4 py-3 space-y-3">
                {/* Checkbox "entrega final" — solo visible si hay faltantes */}
                {hayFaltantes && (
                    <label className="flex items-start gap-2 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={cierreFinal}
                            onChange={e => setCierreFinal(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <span className="text-xs text-brand-dark">
                            <span className="font-bold">Esta es la entrega final</span> — los ítems faltantes quedarán como merma.
                            <Info className="inline h-3 w-3 ml-0.5 text-muted-foreground" />
                            <span className="block text-caption text-muted-foreground mt-0.5">
                                Marca esta opción si NO van a venir más viajes. Los ítems no recibidos se registrarán como discrepancia.
                            </span>
                        </span>
                    </label>
                )}

                {/* Banner amber resumen — solo si checkbox marcado */}
                {cierreFinal && faltantesAlCerrar.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 rounded-lg px-3 py-2 text-label text-amber-900 dark:text-amber-200">
                        <div className="font-bold mb-1 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" /> Se registrarán como merma:
                        </div>
                        <ul className="ml-5 space-y-0.5 list-disc">
                            {faltantesAlCerrar.map((f, i) => (
                                <li key={i}>
                                    <span className="font-bold">{f.cantidad}</span>
                                    {f.unidad ? ` ${f.unidad}` : ''} · {f.descripcion}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Totales */}
                <div className="flex items-center justify-between text-label text-muted-foreground">
                    <span>
                        Total este viaje: <span className="font-bold text-brand-dark">{totalRecibidoEsteViaje}</span>
                        {totalFaltaGlobal > 0 && (
                            <> · Pendiente global: <span className="font-bold text-amber-700 dark:text-amber-300">{totalFaltaGlobal}</span></>
                        )}
                    </span>
                    <span>{items.length} ítem{items.length === 1 ? '' : 's'}</span>
                </div>

                {/* Foto opcional de la recepción (nunca obligatoria) */}
                {onUploadFoto && (
                    <ImagePicker file={fotoFile} onChange={setFotoFile} label="Adjuntar foto (opcional)" disabled={loading} />
                )}

                {/* Botones de acción */}
                <div className="flex flex-wrap gap-2">
                    {/* "Faltan más viajes" — oculto si checkbox marcado (contradictorio) */}
                    {!cierreFinal && (
                        <button
                            onClick={handleParcial}
                            disabled={loading || (totalRecibidoEsteViaje + totalCustomEsteViaje) === 0}
                            title={
                                (totalRecibidoEsteViaje + totalCustomEsteViaje) === 0
                                    ? 'Marca al menos 1 unidad de algún ítem antes de registrar'
                                    : 'Registra lo de este viaje. La transferencia queda abierta esperando próximos viajes.'
                            }
                            className="flex-1 min-w-[160px] py-3.5 text-xs font-bold text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
                        >
                            <PackageOpen className="h-3.5 w-3.5" />
                            {loading ? 'Registrando...' : 'Faltan más viajes'}
                        </button>
                    )}
                    <button
                        onClick={handleClickCerrar}
                        disabled={loading}
                        title="Cierra la transferencia. Cualquier diferencia entre lo enviado y lo recibido se registra como discrepancia."
                        className="flex-1 min-w-[160px] py-3.5 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                    >
                        <PackageCheck className="h-3.5 w-3.5" />
                        {loading ? 'Cerrando...' : 'Esta es toda la entrega'}
                    </button>
                    <button onClick={onClose} className="px-4 py-3.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                        Cancelar
                    </button>
                </div>
            </div>

            {/* Modal de confirmación defensivo — si el user clickea cerrar con
                faltantes y NO marcó el checkbox. Defensa contra cierre accidental. */}
            <Modal
                isOpen={confirmMermaOpen}
                onClose={() => setConfirmMermaOpen(false)}
                title="¿Cerrar transferencia?"
                size="sm"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <button
                            onClick={() => setConfirmMermaOpen(false)}
                            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={async () => {
                                setConfirmMermaOpen(false);
                                await handleCerrarTotal();
                            }}
                            disabled={loading}
                            className="px-4 py-2 text-xs font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-all"
                        >
                            Sí, cerrar igual
                        </button>
                    </div>
                }
            >
                <div className="space-y-3 text-sm">
                    {faltantesAlCerrar.length > 0 && (
                        <div>
                            <p className="text-brand-dark">Quedan estos ítems sin recibir (merma):</p>
                            <ul className="ml-5 mt-1 space-y-1 list-disc text-xs">
                                {faltantesAlCerrar.map((f, i) => (
                                    <li key={i}>
                                        <span className="font-bold">{f.cantidad}</span>
                                        {f.unidad ? ` ${f.unidad}` : ''} · {f.descripcion}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {sobrantesAlCerrar.length > 0 && (
                        <div>
                            <p className="text-brand-dark">Llegó <strong>más</strong> de lo enviado (sobrante):</p>
                            <ul className="ml-5 mt-1 space-y-1 list-disc text-xs">
                                {sobrantesAlCerrar.map((f, i) => (
                                    <li key={i}>
                                        <span className="font-bold">+{f.cantidad}</span>
                                        {f.unidad ? ` ${f.unidad}` : ''} · {f.descripcion}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 rounded-lg px-3 py-2">
                        Las diferencias se registrarán como <strong>discrepancia</strong>. La transferencia se cerrará y <strong>no podrás registrar más viajes</strong>.
                    </p>
                </div>
            </Modal>
        </div>
    );
};
