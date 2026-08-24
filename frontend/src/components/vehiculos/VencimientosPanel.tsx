import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, FileText, Wrench, ShieldCheck, ScrollText, IdCard, ChevronRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';
import { textoVencimiento } from '../../utils/vencimientos';
import type { VehiculoVencimiento, VehiculoVencimientosResumen } from '../../types/entities';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    resumen: VehiculoVencimientosResumen;
    loading?: boolean;
}

/** Etiqueta e ícono por origen del vencimiento. */
const META: Record<VehiculoVencimiento['categoria'], { label: string; Icon: React.ElementType }> = {
    documento:  { label: 'Documento',            Icon: FileText },
    revision:   { label: 'Revisión',             Icon: ScrollText },
    mantencion: { label: 'Mantención',           Icon: Wrench },
    seguro:     { label: 'Seguro',               Icon: ShieldCheck },
    permiso:    { label: 'Permiso de circulación', Icon: ScrollText },
    licencia:   { label: 'Licencia de conducir', Icon: IdCard },
};

/** Nombres legibles de los subtipos que se guardan en clave (documentos y revisiones). */
const SUBTIPOS: Record<string, string> = {
    permiso_circulacion: 'Permiso de circulación',
    seguro_terceros: 'Seguro contra terceros',
    primera_inscripcion: 'Primera inscripción',
    poliza: 'Póliza',
    tecnica: 'Revisión técnica',
    gases: 'Revisión de gases',
    mecanica: 'Revisión mecánica',
};

const fmtFecha = (s: string) => String(s).split('T')[0].split('-').reverse().join('/');

const Fila: React.FC<{ v: VehiculoVencimiento; onIr: () => void }> = ({ v, onIr }) => {
    const { label, Icon } = META[v.categoria] ?? META.documento;
    const vencido = Number(v.dias_restantes) < 0;
    // Licencias: no hay patente, el nombre del conductor viaja en `marca`.
    const titulo = v.patente || v.marca || 'Sin identificar';
    const detalle = [SUBTIPOS[v.subtipo || ''] || v.subtipo || label, v.patente ? [v.marca, v.modelo].filter(Boolean).join(' ') : null]
        .filter(Boolean).join(' · ');

    return (
        /* eslint-disable-next-line no-restricted-syntax -- fila clickeable que lleva al módulo */
        <button type="button" onClick={onIr}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card text-left transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/[0.03]">
            <div className={cn('h-9 w-9 shrink-0 rounded-xl flex items-center justify-center',
                vencido ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300')}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-brand-dark truncate">{titulo}</div>
                <div className="text-caption text-muted-foreground truncate">{detalle}</div>
            </div>
            <div className="shrink-0 text-right">
                <div className={cn('text-label font-bold', vencido ? 'text-destructive' : 'text-amber-700 dark:text-amber-300')}>
                    {textoVencimiento(Number(v.dias_restantes))}
                </div>
                <div className="text-micro text-muted-foreground">{fmtFecha(v.fecha_vencimiento)}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
        </button>
    );
};

/**
 * Panel que se abre al hacer clic en el número del menú: qué venció y qué está
 * por vencer, lo más urgente arriba. Reemplaza al aviso por correo de los
 * documentos (decisión usuario 2026-08-24): el aviso se ve en la app.
 */
export const VencimientosPanel: React.FC<Props> = ({ isOpen, onClose, resumen, loading }) => {
    const navigate = useNavigate();
    const ir = () => { onClose(); navigate('/vehiculos'); };

    const vencidos = resumen.items.filter(i => Number(i.dias_restantes) < 0);
    const porVencer = resumen.items.filter(i => Number(i.dias_restantes) >= 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md"
            title={<span className="inline-flex items-center gap-2">Vencimientos
                <span className="text-xs font-normal text-muted-foreground">próximos {resumen.dias} días</span>
            </span>}>
            {loading && resumen.total === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Cargando…</p>
            ) : resumen.total === 0 ? (
                <div className="py-10 text-center">
                    <ShieldCheck className="h-10 w-10 mx-auto text-brand-primary/30 mb-3" />
                    <p className="text-sm font-medium text-brand-dark">Todo al día</p>
                    <p className="text-xs mt-1 text-muted-foreground">No hay documentos, revisiones ni licencias por vencer.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {vencidos.length > 0 && (
                        <section className="space-y-1.5">
                            <h3 className="text-xs font-black text-destructive uppercase tracking-widest flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" /> Vencidos ({vencidos.length})
                            </h3>
                            {vencidos.map(v => <Fila key={`${v.categoria}_${v.id}`} v={v} onIr={ir} />)}
                        </section>
                    )}
                    {porVencer.length > 0 && (
                        <section className="space-y-1.5">
                            <h3 className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" /> Por vencer ({porVencer.length})
                            </h3>
                            {porVencer.map(v => <Fila key={`${v.categoria}_${v.id}`} v={v} onIr={ir} />)}
                        </section>
                    )}
                </div>
            )}
        </Modal>
    );
};
