import React, { useEffect, useState } from 'react';
import { Eye, FolderInput, FolderPlus, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';
import { textoIngreso } from './fichaUsuario';
import { estadoArreglo, type ApartadoSoporte, type ErrorSoporte } from './errores';
import { leerVersionPublicada, versionLegible } from '../../services/versionApp';

/**
 * Soporte → Errores: errores que se vigilan solos y apartados propios (Marcos 2026-11-03, página «Errores que se
 * vigilan solos» del lienzo; mig 150; docs/reglas/seguridad-rbac.md § Errores).
 *   · «Arreglado en esta versión»: versión = cada subida a producción. La que está arriba ahora se lee de
 *     /version.json (aunque esta pestaña sea vieja). Si el mismo error vuelve con esa versión o una más nueva, se
 *     reabre solo y les avisa: «el arreglo no funcionó». Con Bóveda viejo abierto no cuenta.
 *   · Apartados propios, además de «Señal y lentitud» y «Datos mal ingresados»: mover errores ahí y, si se quiere, que
 *     los próximos iguales lleguen solos.
 */

const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';

/** Una opción grande con su círculo (role="radio"), como en el lienzo. */
const Opcion: React.FC<{ elegida: boolean; onElegir: () => void; titulo: React.ReactNode; detalle?: React.ReactNode }> = ({ elegida, onElegir, titulo, detalle }) => (
    // eslint-disable-next-line no-restricted-syntax -- opción de radio grande (título + detalle); Button no tiene este layout
    <button type="button" role="radio" aria-checked={elegida} onClick={onElegir}
        className={cn('flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
            elegida ? 'border-brand-primary bg-brand-primary/5' : 'border-border hover:bg-background')}>
        <span aria-hidden className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', elegida ? 'border-brand-primary' : 'border-border')}>
            {elegida && <span className="h-2 w-2 rounded-full bg-brand-primary" />}
        </span>
        <span className="min-w-0">
            <span className="block text-sm font-semibold text-brand-dark">{titulo}</span>
            {detalle && <span className="block text-xs text-muted-foreground">{detalle}</span>}
        </span>
    </button>
);

/** Lo que pasó con el arreglo de este error (arriba del detalle). */
export const AvisoArreglo: React.FC<{ e: ErrorSoporte }> = ({ e }) => {
    const estado = estadoArreglo(e);
    if (estado === 'reabierto') {
        const pasos = [
            {
                titulo: 'Arreglado',
                texto: `${e.reabierto_arreglado_por || 'Soporte'} lo marcó arreglado${e.reabierto_arreglado_en ? ` ${textoIngreso(e.reabierto_arreglado_en)}` : ''}, en la versión del ${versionLegible(e.reabierto_version)}${e.reabierto_tipo === 'proxima' ? ' (desde la siguiente)' : ''}.`,
                extra: e.reabierto_nota ? `«${e.reabierto_nota}»` : null,
            },
            { titulo: 'Volvió', texto: `Le pasó a ${e.usuario_nombre} ${textoIngreso(e.primera_vez)}, con la versión del ${versionLegible(e.version_app)}.`, extra: null },
            { titulo: 'Se reabrió solo', texto: 'Volvió a «Para revisar» y les llegó el aviso «El arreglo no funcionó».', extra: null },
        ];
        return (
            <div role="alert" className="space-y-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-3 dark:border-red-900/50 dark:bg-red-500/10">
                <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                    <RotateCcw aria-hidden className="h-4 w-4 shrink-0" />El arreglo no funcionó: volvió a pasar con la versión del arreglo
                </p>
                <ol className="grid gap-2 sm:grid-cols-3">
                    {pasos.map(p => (
                        <li key={p.titulo} className="rounded-lg bg-card px-3 py-2">
                            <p className="text-caption font-bold uppercase tracking-wide text-muted-foreground">{p.titulo}</p>
                            <p className="text-xs text-foreground">{p.texto}</p>
                            {p.extra && <p className="mt-1 text-xs text-muted-foreground">{p.extra}</p>}
                        </li>
                    ))}
                </ol>
            </div>
        );
    }
    if (estado === 'vigilando') {
        return (
            <div className="flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-foreground dark:border-green-900/50 dark:bg-green-500/10">
                <Eye aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-300" />
                <p>
                    <strong>Arreglado {e.arreglado_tipo === 'proxima' ? `desde la versión que se suba después del ${versionLegible(e.arreglado_version)}` : `en la versión del ${versionLegible(e.arreglado_version)}`}.</strong>{' '}
                    Queda vigilando: si vuelve a pasar a alguien que ya tiene esa versión o una más nueva, se reabre solo y les avisa.
                    Si le pasa a alguien con Bóveda viejo abierto, no cuenta (todavía no tiene el arreglo).
                </p>
            </div>
        );
    }
    if (estado === 'fallo') {
        return (
            <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-300">
                <RotateCcw aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                Este arreglo (versión del {versionLegible(e.arreglado_version)}) no funcionó: volvió a pasar{e.arreglo_fallo_en ? ` ${textoIngreso(e.arreglo_fallo_en)}` : ''} y está de nuevo en «Para revisar».
            </p>
        );
    }
    return null;
};

/** «¿En qué versión quedó arreglado?» */
export const DialogoArreglado: React.FC<{
    abierto: boolean; notaInicial: string; onCerrar: () => void;
    onGuardar: (tipo: 'actual' | 'proxima', version: string, nota: string) => Promise<void>;
}> = ({ abierto, notaInicial, onCerrar, onGuardar }) => {
    const [tipo, setTipo] = useState<'actual' | 'proxima'>('actual');
    const [nota, setNota] = useState(notaInicial);
    const [version, setVersion] = useState<string | null | undefined>(undefined); // undefined = leyendo
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (!abierto) return undefined;
        let vivo = true;
        setTipo('actual');
        setNota(notaInicial);
        setVersion(undefined);
        leerVersionPublicada().then(v => { if (vivo) setVersion(v); });
        return () => { vivo = false; };
    }, [abierto, notaInicial]);

    const guardar = async () => {
        if (!version) return;
        setGuardando(true);
        try { await onGuardar(tipo, version, nota); } finally { setGuardando(false); }
    };
    const actual = version ? versionLegible(version) : '…';

    return (
        <Modal isOpen={abierto} onClose={onCerrar} size="md" icon={Wrench} title="¿En qué versión quedó arreglado?"
            description="Si el mismo error vuelve a pasar con esa versión o una más nueva, se reabre solo y les avisa."
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
                    <Button onClick={guardar} isLoading={guardando} disabled={!version}>Guardar y vigilar</Button>
                </div>
            )}>
            <div role="radiogroup" aria-label="Versión del arreglo" className="space-y-2">
                <Opcion elegida={tipo === 'actual'} onElegir={() => setTipo('actual')}
                    titulo="La que está ahora en Bóveda" detalle={`Subida del ${actual}. Vigila desde ya.`} />
                <Opcion elegida={tipo === 'proxima'} onElegir={() => setTipo('proxima')}
                    titulo="La próxima que subamos" detalle="El arreglo todavía no está arriba: vigila desde que se suba." />
            </div>
            {version === null && (
                <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-300">No se pudo leer qué versión está publicada. Revise la conexión y vuelva a abrir esto.</p>
            )}
            <label htmlFor="nota-arreglo" className="mt-4 block text-xs font-semibold text-muted-foreground">Qué se arregló (nota para ustedes, opcional)</label>
            <textarea id="nota-arreglo" value={nota} onChange={ev => setNota(ev.target.value)} rows={2} maxLength={1000} className={cn(CAMPO, 'mt-1.5')} />
            <p className="mt-2 text-xs text-muted-foreground">También se marcan los errores iguales que estén sin revisar (el mismo error en la misma pantalla).</p>
        </Modal>
    );
};

export type DestinoApartado = { apartadoId: number | null; nombreNuevo?: string; auto: boolean };

/** «Mover a un apartado» (o crear uno nuevo y mover). */
export const DialogoApartado: React.FC<{
    abierto: boolean; apartados: readonly ApartadoSoporte[]; actual: number | null; onCerrar: () => void;
    onGuardar: (d: DestinoApartado) => Promise<void>;
}> = ({ abierto, apartados, actual, onCerrar, onGuardar }) => {
    const [destino, setDestino] = useState<number | 'nuevo' | 'sacar'>('nuevo');
    const [nombre, setNombre] = useState('');
    const [auto, setAuto] = useState(true);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (!abierto) return;
        const otro = apartados.find(a => a.id !== actual);
        setDestino(otro ? otro.id : 'nuevo');
        setNombre('');
        setAuto(true);
    }, [abierto, apartados, actual]);

    const listo = destino !== 'nuevo' || nombre.trim().length >= 2;
    const guardar = async () => {
        if (!listo) return;
        setGuardando(true);
        try {
            await onGuardar(destino === 'sacar' ? { apartadoId: null, auto: false }
                : destino === 'nuevo' ? { apartadoId: null, nombreNuevo: nombre.trim(), auto } : { apartadoId: destino, auto });
        } finally { setGuardando(false); }
    };

    return (
        <Modal isOpen={abierto} onClose={onCerrar} size="md" icon={FolderInput} title="Mover a un apartado"
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
                    <Button onClick={guardar} isLoading={guardando} disabled={!listo}>
                        {destino === 'nuevo' ? 'Crear y mover' : destino === 'sacar' ? 'Sacar del apartado' : 'Mover'}
                    </Button>
                </div>
            )}>
            <div role="radiogroup" aria-label="Apartado" className="space-y-2">
                {apartados.filter(a => a.id !== actual).map(a => (
                    <Opcion key={a.id} elegida={destino === a.id} onElegir={() => setDestino(a.id)} titulo={a.nombre}
                        detalle={a.pendientes ? `${a.pendientes} sin revisar` : 'Sin errores pendientes'} />
                ))}
                <Opcion elegida={destino === 'nuevo'} onElegir={() => setDestino('nuevo')} titulo="+ Crear un apartado nuevo" />
                {actual !== null && (
                    <Opcion elegida={destino === 'sacar'} onElegir={() => setDestino('sacar')} titulo="Sacarlo del apartado"
                        detalle="Vuelve a su lugar de siempre (Para revisar, Señal y lentitud o Datos mal ingresados)." />
                )}
            </div>
            {destino === 'nuevo' && (
                <div className="mt-3">
                    <Input label="Nombre del apartado nuevo" value={nombre} onChange={ev => setNombre(ev.target.value)} maxLength={60}
                        placeholder="Por ejemplo: Fotos que no suben" autoFocus />
                </div>
            )}
            {destino !== 'sacar' && (
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                    <input type="checkbox" checked={auto} onChange={ev => setAuto(ev.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-primary" />
                    <span>
                        <span className="block font-semibold text-brand-dark">Los próximos errores iguales llegan solos aquí</span>
                        <span className="block text-xs text-muted-foreground">Mismo mensaje en la misma pantalla, le pase a quien le pase. También se mueven los iguales que ya están sin revisar.</span>
                    </span>
                </label>
            )}
        </Modal>
    );
};

/** «+ Nuevo apartado» (solo crearlo; después se mueven errores con «Mover a un apartado»). */
export const DialogoNuevoApartado: React.FC<{ abierto: boolean; onCerrar: () => void; onCrear: (nombre: string) => Promise<void> }> = ({ abierto, onCerrar, onCrear }) => {
    const [nombre, setNombre] = useState('');
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { if (abierto) setNombre(''); }, [abierto]);
    const listo = nombre.trim().length >= 2;
    const crear = async () => {
        if (!listo) return;
        setGuardando(true);
        try { await onCrear(nombre.trim()); } finally { setGuardando(false); }
    };
    return (
        <Modal isOpen={abierto} onClose={onCerrar} size="sm" icon={FolderPlus} title="Nuevo apartado"
            description="Para juntar errores de un mismo tipo, además de «Señal y lentitud» y «Datos mal ingresados»."
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
                    <Button onClick={crear} isLoading={guardando} disabled={!listo}>Crear</Button>
                </div>
            )}>
            <Input label="Nombre" value={nombre} onChange={ev => setNombre(ev.target.value)} maxLength={60} placeholder="Por ejemplo: Impresión de documentos" autoFocus />
        </Modal>
    );
};

/** Borrar un apartado (sus errores vuelven a su lugar de siempre). */
export const DialogoBorrarApartado: React.FC<{ apartado: ApartadoSoporte | null; onCerrar: () => void; onBorrar: () => Promise<void> }> = ({ apartado, onCerrar, onBorrar }) => {
    const [borrando, setBorrando] = useState(false);
    const borrar = async () => {
        setBorrando(true);
        try { await onBorrar(); } finally { setBorrando(false); }
    };
    return (
        <Modal isOpen={!!apartado} onClose={onCerrar} size="sm" icon={Trash2} title={`¿Borrar «${apartado?.nombre ?? ''}»?`}
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
                    <Button variant="destructive" onClick={borrar} isLoading={borrando}>Borrar apartado</Button>
                </div>
            )}>
            <p className="text-sm text-foreground">
                Sus errores no se borran: vuelven a su lugar de siempre (Para revisar, Señal y lentitud o Datos mal ingresados), y los
                próximos iguales ya no llegan solos aquí.
            </p>
        </Modal>
    );
};
