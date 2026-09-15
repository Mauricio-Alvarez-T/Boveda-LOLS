/**
 * Configuración → Alertas de Documentos (plan Gestiones B7, mig 115). Una card por categoría (tipo de
 * documento o lote) con días de aviso (ámbar) y crítico (rojo) + encendido. Las categorías son fijas
 * (seed); solo se editan etiqueta, días y activo. Regla cruzada crítico ≥ aviso (el backend la repite).
 * Las alertas son SOLO in-app (Bandeja del Día + Documentos físicos): no envían correo.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Power, PowerOff, FileWarning, Truck } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { EmptyState } from '../ui/EmptyState';
import { showApiError } from '../../utils/toastUtils';
import { cn } from '../../utils/cn';
import { esCategoriaLote, validarUmbrales, type AlertaConfig } from '../documentos-fisicos/documentosAlertas';

const PERMISO = 'sistema.alertas_documentos.gestionar';

export const AlertasDocumentosPanel: React.FC = () => {
    const { hasPermission } = useAuth();
    const puedeGestionar = hasPermission(PERMISO);
    const [reglas, setReglas] = useState<AlertaConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [errores, setErrores] = useState<Record<number, string>>({});

    const cargar = async () => {
        setLoading(true);
        try {
            const r = await api.get<{ data: AlertaConfig[] }>('/documentos-alertas/config?activo=all&limit=100');
            setReglas(r.data.data || []);
        } catch (err) {
            showApiError(err, 'No se pudo cargar la configuración de alertas');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        // Diferido: el lint del React Compiler no permite setState sincrónico dentro del efecto.
        const t = window.setTimeout(() => { void cargar(); }, 0);
        return () => window.clearTimeout(t);
    }, []);

    const guardar = async (r: AlertaConfig, cambios: Partial<Pick<AlertaConfig, 'activo' | 'dias_aviso' | 'dias_critico'>>) => {
        const nuevo = { ...r, ...cambios };
        const error = validarUmbrales(nuevo.dias_aviso, nuevo.dias_critico);
        if (error) { setErrores(prev => ({ ...prev, [r.id]: error })); return; }
        setErrores(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setReglas(prev => prev.map(x => (x.id === r.id ? nuevo : x)));   // optimista
        try {
            await api.put(`/documentos-alertas/config/${r.id}`, cambios);
        } catch (err) {
            showApiError(err, 'No se pudo guardar el cambio');
            void cargar();
        }
    };

    const onDiasBlur = (r: AlertaConfig, campo: 'dias_aviso' | 'dias_critico', valor: string) => {
        const n = Math.max(0, Math.trunc(Number(valor)) || 0);
        if (n !== r[campo]) void guardar(r, { [campo]: n });
    };

    if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div>;
    if (!reglas.length) {
        return <EmptyState icon={FileWarning} title="Sin categorías de alerta" description="La migración 115 crea las categorías por tipo de documento y por lote. Avisa a TI si sigue vacío tras el deploy." />;
    }

    const documentos = reglas.filter(r => !esCategoriaLote(r.categoria));
    const lotes = reglas.filter(r => esCategoriaLote(r.categoria));

    const Card: React.FC<{ r: AlertaConfig }> = ({ r }) => {
        const activo = !!r.activo;
        return (
            <div className={cn('bg-card rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3', activo ? 'border-border' : 'border-border opacity-60')}>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand-dark">{r.etiqueta}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Aparece en la Bandeja desde el día <b>{r.dias_aviso}</b>; se marca crítico desde el día <b>{r.dias_critico}</b>.
                        {esCategoriaLote(r.categoria) ? '' : ' Cuenta desde la emisión del documento.'}
                    </p>
                    {errores[r.id] && <p className="text-xs text-destructive mt-1">{errores[r.id]}</p>}
                </div>
                <div className="flex items-end gap-2 shrink-0">
                    <div className="w-24">
                        <Input label="Aviso" type="number" min={0} max={3650} defaultValue={r.dias_aviso} disabled={!puedeGestionar}
                            onBlur={e => onDiasBlur(r, 'dias_aviso', e.target.value)} aria-label={`Días de aviso · ${r.etiqueta}`} />
                    </div>
                    <div className="w-24">
                        <Input label="Crítico" type="number" min={0} max={3650} defaultValue={r.dias_critico} disabled={!puedeGestionar}
                            onBlur={e => onDiasBlur(r, 'dias_critico', e.target.value)} aria-label={`Días para crítico · ${r.etiqueta}`} />
                    </div>
                    <IconButton disabled={!puedeGestionar} onClick={() => void guardar(r, { activo: !activo })}
                        aria-label={activo ? 'Desactivar alerta' : 'Activar alerta'} title={activo ? 'Desactivar' : 'Activar'} className="h-11 w-11"
                        icon={activo ? <Power className="h-4 w-4 text-brand-primary" /> : <PowerOff className="h-4 w-4" />} />
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <p className="text-sm text-muted-foreground">
                Aparecen en la <b>Bandeja del Día</b> y en <b>Gestiones → Documentos físicos</b> para quien registra entregas. No envían correo.
                Los días de un documento se cuentan desde que se emitió (volver a imprimirlo no reinicia el aviso); los de un lote, desde que
                se creó (sin confirmar) o desde que el portador lo retiró (en terreno).
            </p>
            <div className="space-y-3">
                <h4 className="text-xs font-black text-brand-dark/60 uppercase tracking-widest flex items-center gap-1.5">
                    <FileWarning className="h-3.5 w-3.5 text-brand-primary" /> Documentos sin firmar
                </h4>
                {documentos.map(r => <Card key={r.id} r={r} />)}
            </div>
            {lotes.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-xs font-black text-brand-dark/60 uppercase tracking-widest flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-brand-primary" /> Lotes de custodia
                    </h4>
                    {lotes.map(r => <Card key={r.id} r={r} />)}
                </div>
            )}
            {!puedeGestionar && <p className="text-xs text-muted-foreground">Solo lectura: requiere "Configurar Alertas de Documentos".</p>}
        </div>
    );
};

export default AlertasDocumentosPanel;
