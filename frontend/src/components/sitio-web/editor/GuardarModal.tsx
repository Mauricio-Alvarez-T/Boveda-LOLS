import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, RefreshCw, Save } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { FormError } from '../../ui/FormError';
import { Aviso } from '../../costos/piezas';
import type { Diferencia } from './borradorSitio';

interface Props {
    diferencias: Diferencia[];
    /** Lo que impide guardar (nombre vacío, superficie que no es número…). */
    errores: { id: number; nombre: string; mensaje: string }[];
    onGuardar: () => Promise<{ ok: true } | { ok: false; choques: { id: number; nombre: string | null }[] | null; mensaje: string }>;
    onRecargar: (ids: number[]) => Promise<void>;
    onClose: () => void;
}

/**
 * «Guardar» del editor visual: lo que cambió, obra por obra («campo: antes → después»), y un solo guardado para todo
 * (todo o nada). Guardar NO publica: el sitio no cambia hasta «Publicar cambios». Si otra persona guardó una de esas
 * obras mientras tanto, no se guarda nada y se listan con «Recargar» (lo escrito en ESAS obras se pierde; el resto
 * queda).
 */
export const GuardarModal: React.FC<Props> = ({ diferencias, errores, onGuardar, onRecargar, onClose }) => {
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [choques, setChoques] = useState<{ id: number; nombre: string | null }[] | null>(null);
    const [recargando, setRecargando] = useState(false);

    const porObra = diferencias.reduce<{ id: number; obra: string; filas: Diferencia[] }[]>((acc, d) => {
        const g = acc.find(x => x.id === d.id);
        if (g) g.filas.push(d); else acc.push({ id: d.id, obra: d.obra, filas: [d] });
        return acc;
    }, []);

    const guardar = async () => {
        setGuardando(true);
        setError(null);
        const r = await onGuardar();
        setGuardando(false);
        if (r.ok) { onClose(); return; }
        if (r.choques) setChoques(r.choques);
        setError(r.mensaje);
    };

    const recargar = async () => {
        if (!choques) return;
        setRecargando(true);
        await onRecargar(choques.map(c => c.id));
        setRecargando(false);
        onClose();
    };

    const bloqueado = errores.length > 0;

    return (
        <Modal isOpen onClose={guardando ? () => undefined : onClose} size="md" title="Guardar cambios" icon={Save}
            description={`${diferencias.length} cambio${diferencias.length === 1 ? '' : 's'} en ${porObra.length} obra${porObra.length === 1 ? '' : 's'}`}
            footer={
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="ghost" onClick={onClose} disabled={guardando || recargando} className="h-11 md:h-9">Seguir editando</Button>
                    {choques ? (
                        <Button variant="secondary" onClick={recargar} isLoading={recargando} leftIcon={<RefreshCw className="h-4 w-4" />} className="h-11 md:h-9">Recargar</Button>
                    ) : (
                        <Button onClick={guardar} isLoading={guardando} disabled={bloqueado || !diferencias.length} leftIcon={<Save className="h-4 w-4" />} className="h-11 md:h-9">
                            Guardar
                        </Button>
                    )}
                </div>
            }>
            <div className="flex flex-col gap-4 text-sm text-brand-dark">
                <p className="text-muted-foreground">
                    Se guarda en la Bóveda. <strong className="font-semibold text-brand-dark">El sitio no cambia</strong> hasta que alguien pulse «Publicar cambios».
                </p>

                {choques && (
                    <Aviso icon={AlertTriangle} tono="peligro">
                        <p className="font-semibold">No se guardó nada: otra persona guardó cambios mientras editabas.</p>
                        <ul className="mt-1 list-disc pl-4">{choques.map(c => <li key={c.id}>{c.nombre || `Obra n.º ${c.id}`}</li>)}</ul>
                        <p className="mt-1">«Recargar» trae lo último. Lo que escribiste en {choques.length === 1 ? 'esa obra' : 'esas obras'} se pierde; lo de las demás queda.</p>
                    </Aviso>
                )}
                {!choques && <FormError message={error} />}

                {bloqueado && (
                    <Aviso icon={AlertTriangle} tono="peligro">
                        <p className="font-semibold">Corrige esto antes de guardar:</p>
                        <ul className="mt-1 list-disc pl-4">{errores.map((e, i) => <li key={`${e.id}-${i}`}>{e.nombre}: {e.mensaje}</li>)}</ul>
                    </Aviso>
                )}

                <div className="flex flex-col gap-3">
                    {porObra.map(g => (
                        <section key={g.id} className="rounded-xl border border-border bg-card">
                            <h3 className="border-b border-border px-3 py-2 text-sm font-semibold text-brand-dark">{g.obra}</h3>
                            <ul className="flex flex-col divide-y divide-border">
                                {g.filas.map(d => (
                                    <li key={d.campo} className="flex flex-col gap-1 px-3 py-2">
                                        <span className="text-xs font-medium text-muted-foreground">{d.etiqueta}</span>
                                        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                                            <span className="min-w-0 break-words text-muted-foreground line-through decoration-muted-foreground/50 line-clamp-3 sm:flex-1">{d.antes}</span>
                                            <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:mt-0.5 sm:block" aria-label="pasa a" />
                                            <span className="min-w-0 break-words line-clamp-4 sm:flex-1">{d.despues}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

export default GuardarModal;
