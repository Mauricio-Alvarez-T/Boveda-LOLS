/**
 * Nuevo lote de documentos físicos (plan Gestiones B6): RRHH marca qué documentos impresos entrega y a
 * quién. Lista agrupada obra → trabajador con casilla por trabajador (marca su kit entero) y por documento,
 * buscador y filtro por obra. El portador se recuerda (localStorage). POST /documentos-lotes.
 * Un 409 DOCUMENTO_NO_DISPONIBLE (otro RRHH ya lo metió en un lote) recarga la lista y desmarca esos ids.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { PackageCheck, PackageOpen, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { EmptyState } from '../ui/EmptyState';
import { showApiError } from '../../utils/toastUtils';
import { fmtFecha } from '../../utils/format';
import { cn } from '../../utils/cn';
import {
    agruparPorTrabajador, agruparPorObra, filtrarDisponibles, toggleIds, estadoSeleccion,
    buildCrearLotePayload, validarNuevoLote, PORTADOR_STORAGE_KEY,
    type DocumentoDisponible, type Portador,
} from './documentosFisicos';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Se llama con el lote creado; el padre refresca la lista y el badge. */
    onCreado?: (r: { lote_id: number; n: number; portador_nombre: string }) => void;
}

const leerPortador = (): string => { try { return localStorage.getItem(PORTADOR_STORAGE_KEY) || ''; } catch { return ''; } };
const guardarPortador = (v: string) => { try { localStorage.setItem(PORTADOR_STORAGE_KEY, v); } catch { /* sin storage */ } };

const checkCls = 'h-4 w-4 rounded border-input accent-brand-primary focus:ring-brand-primary';

export const NuevoLoteModal: React.FC<Props> = ({ isOpen, onClose, onCreado }) => {
    const [portadores, setPortadores] = useState<Portador[]>([]);
    const [docs, setDocs] = useState<DocumentoDisponible[]>([]);
    const [cargando, setCargando] = useState(false);
    const [portadorId, setPortadorId] = useState('');
    const [q, setQ] = useState('');
    const [obraId, setObraId] = useState('');
    const [seleccion, setSeleccion] = useState<number[]>([]);
    const [observacion, setObservacion] = useState('');
    const [creando, setCreando] = useState(false);

    const cargar = async () => {
        setCargando(true);
        try {
            const [p, d] = await Promise.all([
                api.get<{ data: Portador[] }>('/documentos-lotes/portadores'),
                api.get<{ data: DocumentoDisponible[] }>('/documentos-lotes/disponibles'),
            ]);
            setPortadores(p.data?.data ?? []);
            setDocs(d.data?.data ?? []);
        } catch (err) {
            showApiError(err, 'No se pudieron cargar los documentos por retirar');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        setSeleccion([]); setQ(''); setObraId(''); setObservacion('');
        setPortadorId(leerPortador());
        // Diferido: el lint del React Compiler no permite setState sincrónico dentro del efecto.
        const t = window.setTimeout(() => { void cargar(); }, 0);
        return () => window.clearTimeout(t);
    }, [isOpen]);

    const obras = useMemo(() => {
        const m = new Map<number, string>();
        docs.forEach(d => { if (d.obra_id != null) m.set(d.obra_id, d.obra_nombre || `Obra ${d.obra_id}`); });
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([value, label]) => ({ value: String(value), label }));
    }, [docs]);

    const visibles = useMemo(() => filtrarDisponibles(docs, q, obraId ? Number(obraId) : null), [docs, q, obraId]);
    const porObra = useMemo(() => agruparPorObra(agruparPorTrabajador(visibles)), [visibles]);
    const idsVisibles = useMemo(() => visibles.map(d => d.id), [visibles]);
    const nTrabajadores = useMemo(() => new Set(docs.filter(d => seleccion.includes(d.id)).map(d => d.trabajador_id)).size, [docs, seleccion]);
    const sel = new Set(seleccion);

    const marcar = (ids: number[], on: boolean) => setSeleccion(prev => toggleIds(prev, ids, on));

    const crear = async () => {
        const error = validarNuevoLote({ portadorId, seleccion });
        if (error) { toast.error(error); return; }
        setCreando(true);
        try {
            const res = await api.post<{ data: { lote_id: number; n: number; portador_nombre: string } }>('/documentos-lotes', buildCrearLotePayload({ portadorId, seleccion, observacion }));
            guardarPortador(portadorId);
            toast.success(`Lote #${res.data.data.lote_id} creado: ${res.data.data.n} documento(s) para ${res.data.data.portador_nombre}`, {
                description: 'Queda pendiente hasta que el portador confirme en Bóveda que los recibió.',
            });
            onCreado?.(res.data.data);
            onClose();
        } catch (err) {
            const data = (err as { response?: { data?: { code?: string; no_disponibles?: number[] } } })?.response?.data;
            if (data?.code === 'DOCUMENTO_NO_DISPONIBLE') {
                const fuera = new Set(data.no_disponibles ?? []);
                setSeleccion(prev => prev.filter(id => !fuera.has(id)));
                void cargar();
            }
            showApiError(err, 'No se pudo crear el lote');
        } finally {
            setCreando(false);
        }
    };

    const footer = (
        <div className="flex w-full flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm text-brand-dark">
                <b>{seleccion.length}</b> documento{seleccion.length === 1 ? '' : 's'} · <b>{nTrabajadores}</b> trabajador{nTrabajadores === 1 ? '' : 'es'}
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <Button variant="ghost" onClick={onClose} disabled={creando}>Cancelar</Button>
                <Button leftIcon={<PackageCheck className="h-4 w-4" />} onClick={crear} isLoading={creando} disabled={!seleccion.length || !portadorId}>Crear lote</Button>
            </div>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nuevo lote de documentos" icon={PackageOpen} size="lg" footer={footer}
            description="Marca los documentos impresos que entregas y a quién. El lote queda por confirmar hasta que el portador lo acepte en Bóveda.">
            <div className="space-y-4">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select label="Quién retira" value={portadorId} onChange={e => setPortadorId(e.target.value)} disabled={cargando}
                        options={[{ value: '', label: portadores.length ? 'Selecciona al portador…' : (cargando ? 'Cargando…' : 'Nadie tiene el permiso "Portar Documentos Físicos"') },
                            ...portadores.map(p => ({ value: String(p.id), label: p.nombre }))]} />
                    <Input label="Observación (opcional)" value={observacion} maxLength={500} placeholder="Ej: kit de ingreso obra Central" onChange={e => setObservacion(e.target.value)} />
                </div>

                {!cargando && !portadores.length && (
                    <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Ningún usuario activo tiene el permiso <b>Portar Documentos Físicos</b>. Se concede por usuario en Configuración → Usuarios (permisos por usuario) y requiere volver a iniciar sesión.</span>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_14rem] gap-3">
                    <Input placeholder="Buscar por nombre, RUT, tipo de documento u obra…" value={q} onChange={e => setQ(e.target.value)} leftIcon={<Search className="h-4 w-4" />} />
                    <Select value={obraId} onChange={e => setObraId(e.target.value)} options={[{ value: '', label: 'Todas las obras' }, ...obras]} />
                </div>

                {cargando ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Cargando documentos por retirar…</p>
                ) : docs.length === 0 ? (
                    <EmptyState title="No hay documentos impresos por retirar"
                        description="Aparecen aquí los documentos generados por Bóveda que ya se descargaron o imprimieron y aún no están en un lote." />
                ) : visibles.length === 0 ? (
                    <EmptyState title="Sin resultados" description="Prueba con otro nombre, RUT u obra." />
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{visibles.length} documento{visibles.length === 1 ? '' : 's'} visibles</span>
                            <div className="flex gap-2">
                                <Button size="sm" variant="ghost" onClick={() => marcar(idsVisibles, true)}>Marcar visibles</Button>
                                <Button size="sm" variant="ghost" onClick={() => marcar(idsVisibles, false)} disabled={estadoSeleccion(seleccion, idsVisibles) === 'ninguno'}>Desmarcar</Button>
                            </div>
                        </div>
                        {porObra.map(o => (
                            <div key={o.obra_nombre} className="rounded-2xl border border-border overflow-hidden">
                                <div className="bg-muted px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">{o.obra_nombre}</div>
                                <ul className="divide-y divide-border">
                                    {o.grupos.map(g => {
                                        const ids = g.docs.map(d => d.id);
                                        const est = estadoSeleccion(seleccion, ids);
                                        return (
                                            <li key={g.key} className="px-3 py-2">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input type="checkbox" className={checkCls} checked={est === 'todos'}
                                                        ref={el => { if (el) el.indeterminate = est === 'parcial'; }}
                                                        onChange={e => marcar(ids, e.target.checked)} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-sm font-semibold text-brand-dark truncate">{g.trabajador_nombre}</span>
                                                        <span className="block text-xs text-muted-foreground">{g.rut || '—'} · {ids.length} documento{ids.length === 1 ? '' : 's'}</span>
                                                    </span>
                                                </label>
                                                <ul className="mt-1.5 ml-7 space-y-1">
                                                    {g.docs.map(d => (
                                                        <li key={d.id}>
                                                            <label className={cn('flex items-center gap-2 rounded-lg px-2 py-1 text-xs cursor-pointer', sel.has(d.id) ? 'bg-brand-primary/5' : 'hover:bg-background')}>
                                                                <input type="checkbox" className={checkCls} checked={sel.has(d.id)} onChange={e => marcar([d.id], e.target.checked)} />
                                                                <span className="flex-1 min-w-0 truncate text-brand-dark">{d.tipo_nombre || d.nombre_archivo}</span>
                                                                <span className="text-muted-foreground shrink-0">impreso {fmtFecha(d.fecha_descarga) || '—'}</span>
                                                            </label>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};
