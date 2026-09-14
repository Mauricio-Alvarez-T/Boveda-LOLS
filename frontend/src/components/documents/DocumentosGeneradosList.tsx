/**
 * Documentos generados por Bóveda para un trabajador (plan Gestiones B2/B5): kit de ingreso, amonestaciones,
 * ficha de solicitud y finiquito. Fuente: GET /documentos-laborales/trabajador/:id (sin metadata). Estado
 * con <StatusBadge domain="documentoEstado">; Descargar/Imprimir gateados por documentos.laborales.descargar;
 * Emitir kit / Amonestación / Finiquito por documentos.laborales.emitir. El finiquito es la ÚNICA acción
 * que aplica al trabajador desvinculado (las otras dos se apagan). B6 agrega acá "Registrar entrega".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Download, Printer, PackageOpen, FileWarning, FileSignature, Loader2, Lock } from 'lucide-react';

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
import { EmitirFiniquitoModal } from './EmitirFiniquitoModal';
import { abrirGenerado } from './abrirDocumentoGenerado';
import type { WorkerBasico } from './documentosLaborales';
import type { UltimaDesvinculacion } from '../workers/desvinculacionSchema';

interface Props {
    trabajadorId: number;
    worker: WorkerBasico | null;
    /** Cambia para forzar recarga desde el padre. */
    refreshKey?: number;
    /** Se avisa al padre cuando se emite algo (para refrescar contadores). */
    onCambio?: () => void;
    /**
     * Baja vigente del trabajador (resumen de la ficha) para el finiquito. `undefined` = el modal la pide
     * al resumen; `null` = no hay baja registrada.
     */
    ultimaDesvinculacion?: UltimaDesvinculacion | null;
    className?: string;
}

export const DocumentosGeneradosList: React.FC<Props> = ({ trabajadorId, worker, refreshKey = 0, onCambio, ultimaDesvinculacion, className }) => {
    const { hasPermission } = useAuth();
    const puedeEmitir = hasPermission('documentos.laborales.emitir');
    const puedeDescargar = hasPermission('documentos.laborales.descargar');
    const puedeVer = hasPermission('documentos.ver');
    const [docs, setDocs] = useState<Documento[]>([]);
    const [loading, setLoading] = useState(false);
    const [local, setLocal] = useState(0);
    const [modal, setModal] = useState<'kit' | 'amonestacion' | 'finiquito' | null>(null);
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
    const conFiniquito = ultimaDesvinculacion?.finiquito_documento_id != null;
    const tituloFiniquito = !puedeEmitir ? 'Requiere "Emitir Documentos Laborales"' : conFiniquito ? 'Ya hay un finiquito emitido para esta baja; puedes reemitirlo' : undefined;

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-brand-dark flex items-center gap-2">
                    <Lock className="h-4 w-4 text-brand-primary" /> Documentos laborales (Bóveda)
                </h4>
                <div className="flex flex-wrap gap-2">
                    {/* Finiquito (B5): condición INVERSA a las demás — solo tiene sentido con el trabajador desvinculado. */}
                    {inactivo && (
                        <Button size="sm" variant={conFiniquito ? 'outline' : 'primary'} leftIcon={<FileSignature className="h-4 w-4" />} disabled={!puedeEmitir} title={tituloFiniquito}
                            onClick={() => setModal('finiquito')}>{conFiniquito ? 'Reemitir finiquito' : 'Finiquito'}</Button>
                    )}
                    <Button size="sm" variant="outline" leftIcon={<FileWarning className="h-4 w-4" />} disabled={!puedeEmitir || inactivo} title={tituloAccion}
                        onClick={() => setModal('amonestacion')}>Amonestación</Button>
                    <Button size="sm" variant={inactivo ? 'outline' : 'primary'} leftIcon={<PackageOpen className="h-4 w-4" />} disabled={!puedeEmitir || inactivo} title={tituloAccion}
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
                        {!puedeEmitir ? 'Los emite RRHH desde esta ficha.' : inactivo ? 'Trabajador desvinculado: emite el finiquito; queda aquí con su estado.' : 'Emite el kit de ingreso o una carta; quedan aquí con su estado.'}
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
                                    {/* Custodia (B6): con quién está el papel / cuándo volvió firmado. */}
                                    {d.estado === 'en_terreno' && d.portador_nombre ? ` · con ${d.portador_nombre}${d.lote_retirado_en ? ` desde ${fmtFechaHora(d.lote_retirado_en)}` : ''}` : ''}
                                    {d.estado === 'descargado' && d.lote_id ? ' · en lote por confirmar' : ''}
                                    {d.estado === 'firmado' && d.fecha_firmado ? ` · firmado ${fmtFechaHora(d.fecha_firmado)}` : ''}
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
            <EmitirFiniquitoModal isOpen={modal === 'finiquito'} onClose={() => setModal(null)} worker={worker} desvinculacion={ultimaDesvinculacion} onEmitido={emitido} />
        </div>
    );
};
