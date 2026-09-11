/**
 * Documentos generados por Bóveda para un trabajador (plan Gestiones B2): kit de ingreso, amonestaciones,
 * ficha de solicitud (y en B5 contrato/finiquito). Fuente: GET /documentos-laborales/trabajador/:id (sin
 * metadata). Estado con <StatusBadge domain="documentoEstado">; Descargar/Imprimir gateados por
 * documentos.laborales.descargar; Emitir kit / Amonestación por documentos.laborales.emitir.
 * B6 agrega acá "Registrar entrega".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Download, Printer, PackageOpen, FileWarning, Loader2, Lock } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Documento } from '../../types/entities';
import { fmtFechaHora } from '../../utils/fechas';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { StatusBadge } from '../ui/StatusBadge';
import { EmitirAmonestacionModal } from './EmitirAmonestacionModal';
import { EmitirKitModal } from './EmitirKitModal';
import { abrirGenerado } from './abrirDocumentoGenerado';
import type { WorkerBasico } from './documentosLaborales';

interface Props {
    trabajadorId: number;
    worker: WorkerBasico | null;
    /** Cambia para forzar recarga desde el padre. */
    refreshKey?: number;
    /** Se avisa al padre cuando se emite algo (para refrescar contadores). */
    onCambio?: () => void;
    className?: string;
}

export const DocumentosGeneradosList: React.FC<Props> = ({ trabajadorId, worker, refreshKey = 0, onCambio, className }) => {
    const { hasPermission } = useAuth();
    const puedeEmitir = hasPermission('documentos.laborales.emitir');
    const puedeDescargar = hasPermission('documentos.laborales.descargar');
    const puedeVer = hasPermission('documentos.ver');
    const [docs, setDocs] = useState<Documento[]>([]);
    const [loading, setLoading] = useState(false);
    const [local, setLocal] = useState(0);
    const [modal, setModal] = useState<'kit' | 'amonestacion' | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        if (!puedeVer) return;
        setLoading(true);
        try {
            const res = await api.get<{ data: Documento[] }>(`/documentos-laborales/trabajador/${trabajadorId}`);
            const d = (res.data as { data?: Documento[] }).data ?? (res.data as unknown as Documento[]);
            setDocs(Array.isArray(d) ? d : []);
        } catch {
            setDocs([]);
        } finally {
            setLoading(false);
        }
    }, [trabajadorId, puedeVer]);

    useEffect(() => { cargar(); }, [cargar, refreshKey, local]);

    const emitido = () => { setLocal(n => n + 1); onCambio?.(); };
    const abrir = async (d: Documento, modo: 'download' | 'print') => {
        setOcupado(`${d.id}-${modo}`);
        try {
            await abrirGenerado(d.id, d.nombre_archivo, modo);
            setLocal(n => n + 1); // el estado pasa a "Descargado"
        } finally { setOcupado(null); }
    };

    const inactivo = worker?.activo === false;
    const tituloAccion = !puedeEmitir ? 'Requiere "Emitir Documentos Laborales"' : inactivo ? 'Trabajador desvinculado' : undefined;

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-brand-dark flex items-center gap-2">
                    <Lock className="h-4 w-4 text-brand-primary" /> Documentos laborales (Bóveda)
                </h4>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" leftIcon={<FileWarning className="h-4 w-4" />} disabled={!puedeEmitir || inactivo} title={tituloAccion}
                        onClick={() => setModal('amonestacion')}>Amonestación</Button>
                    <Button size="sm" leftIcon={<PackageOpen className="h-4 w-4" />} disabled={!puedeEmitir || inactivo} title={tituloAccion}
                        onClick={() => setModal('kit')}>Emitir kit</Button>
                </div>
            </div>

            {loading && docs.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
            ) : docs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background px-4 py-5 text-center">
                    <FileText className="h-6 w-6 mx-auto text-muted-foreground" />
                    <p className="text-sm font-semibold text-brand-dark mt-2">Sin documentos generados</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {puedeEmitir ? 'Emite el kit de ingreso o una carta; quedan aquí con su estado.' : 'Los emite RRHH desde esta ficha.'}
                    </p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {docs.map(d => (
                        <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-brand-dark truncate" title={d.nombre_archivo}>{d.tipo_nombre || d.nombre_archivo}</p>
                                <p className="text-caption text-muted-foreground truncate">
                                    {d.fecha_generacion ? fmtFechaHora(d.fecha_generacion) : ''}
                                    {d.generado_por_nombre ? ` · por ${d.generado_por_nombre}` : ''}
                                </p>
                            </div>
                            <StatusBadge domain="documentoEstado" status={d.estado || 'generado'} showIcon />
                            <div className="flex gap-1 shrink-0">
                                <IconButton size="sm" variant="ghost" aria-label="Imprimir" title={puedeDescargar ? 'Imprimir' : 'Solo oficina (Descargar / Imprimir Documentos Laborales)'}
                                    disabled={!puedeDescargar || ocupado === `${d.id}-print`} onClick={() => abrir(d, 'print')}
                                    icon={ocupado === `${d.id}-print` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} />
                                <IconButton size="sm" variant="ghost" aria-label="Descargar Word" title={puedeDescargar ? 'Descargar Word' : 'Solo oficina (Descargar / Imprimir Documentos Laborales)'}
                                    disabled={!puedeDescargar || ocupado === `${d.id}-download`} onClick={() => abrir(d, 'download')}
                                    icon={ocupado === `${d.id}-download` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* onFichaActualizada: el modal pudo completar datos personales del trabajador (B2b). */}
            <EmitirKitModal isOpen={modal === 'kit'} onClose={() => setModal(null)} worker={worker} onEmitido={emitido} onFichaActualizada={onCambio} />
            <EmitirAmonestacionModal isOpen={modal === 'amonestacion'} onClose={() => setModal(null)} worker={worker} onEmitido={emitido} />
        </div>
    );
};
