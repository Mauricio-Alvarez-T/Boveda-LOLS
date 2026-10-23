import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RotateCcw, X } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { ObraContext } from '../../../../context/ObraContext';
import { useTransferencias } from '../../../../hooks/inventario/useTransferencias';
import type { Transferencia } from '../../../../types/entities';
import { flagOff } from '../../../../utils/flags';
import TransferenciaDetail from '../../../inventario/TransferenciaDetail';
import { Button } from '../../../ui/Button';
import { IconButton } from '../../../ui/IconButton';
import { SkeletonText } from '../../../ui/Skeleton';
import { ROTULO_FICHAS } from '../fichasInicio';
import { ROTULO_RESOLVER, type AccionResuelta } from './leonardo.modelo';

/**
 * «Aprobar o rechazar» AQUÍ, bajo la fila de VistaLeonardo (el dueño 2026-10-23: «te abra en el mismo lugar como un
 * despliegue sobre ese pendiente para resolver enseguida y no me lleve hasta Inventario»).
 *
 * Es un envoltorio chico: el detalle y las acciones son los REALES de Inventario → Solicitudes. Carga la solicitud con
 * `useTransferencias().fetchById` (GET /transferencias/:id) y monta `TransferenciaDetail` tal cual, con «Revisar y
 * aprobar» (AprobarForm: de dónde sale cada ítem, stock, auto-completar, faltante) y «Rechazar» (motivo), y todo lo que
 * valida (permisos y SoD en `useTransferenciaDetail`; el servidor vuelve a validar). Lo único propio son los callbacks,
 * los mismos que TransferenciasPanel: llaman al hook (que da el mismo aviso que Inventario) y, si salió bien, piden la
 * solicitud fresca para el resumen con WhatsApp y avisan con `onResuelta` (VistaLeonardo cierra el despliegue, abre el
 * resumen y vuelve a pedir el Inicio). Arriba: «Abrir en Inventario» y la X para cerrar.
 * Inventario no cambia: TransferenciaDetail, AprobarForm y los hooks no se tocaron.
 */

type PropsDetalle = React.ComponentProps<typeof TransferenciaDetail>;

interface Props {
    id: number;
    /** «Abrir en Inventario»: esta solicitud en Inventario → Solicitudes (`rutaSolicitud`). */
    ruta: string;
    /** Nota chica bajo el rótulo (Ver como del Super Administrador: queda a su nombre). */
    nota?: string | null;
    onCerrar: () => void;
    /** Salió bien una acción: `t` = la solicitud fresca (para el resumen de aprobar o recibir), o null. */
    onResuelta: (accion: AccionResuelta, t: Transferencia | null) => void;
    /** Algo más cambió sin cerrar nada (la solicitud nueva por el faltante, tras aprobar): vuelve a pedir el Inicio. */
    onCambio: () => void;
}

/** Enlace del despliegue (44 px en el celular, 36 desde 768 px). */
const ENLACE = 'inline-flex min-h-11 items-center gap-1 rounded-lg px-1.5 text-section font-semibold text-green-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-green-300 md:min-h-9';

const ResolverSolicitud: React.FC<Props> = ({ id, ruta, nota, onCerrar, onResuelta, onCambio }) => {
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    // Las obras para «traer de otra obra» (ítems fuera del catálogo): las mismas que Inventario usa mientras carga.
    const obrasCtx = useContext(ObraContext)?.obras;
    const obras = useMemo(() => (obrasCtx ?? [])
        .filter(o => !flagOff(o.participa_inventario))
        .map(o => ({ id: o.id, nombre: o.nombre })), [obrasCtx]);
    const trf = useTransferencias();
    const { fetchById } = trf;
    // Resultado de la carga, marcado con el intento que la pidió («Reintentar» vuelve a «cargando» sin tocar el estado).
    const [intento, setIntento] = useState(0);
    const [res, setRes] = useState<{ intento: number; ok: boolean } | null>(null);
    const carga = res?.intento !== intento ? 'cargando' : res.ok ? 'lista' : 'error';
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        let vigente = true;
        void fetchById(id).then(t => { if (vigente) setRes({ intento, ok: !!t }); });
        return () => { vigente = false; };
    }, [id, intento, fetchById]);

    // ── Los callbacks de TransferenciasPanel, con este `id` ──
    /** Salió bien: con la solicitud fresca si va el resumen (como `refreshAll` antes del modal en Inventario). */
    const listo = async (accion: AccionResuelta, fresca: boolean) => {
        onResuelta(accion, fresca ? await fetchById(id) : null);
    };
    const conCarga = async <T,>(hacer: () => Promise<T>, exito: (r: T) => boolean, despues: (r: T) => Promise<void>): Promise<T> => {
        setActionLoading(true);
        const r = await hacer();
        if (exito(r)) await despues(r);
        setActionLoading(false);
        return r;
    };
    const onAprobar: PropsDetalle['onAprobar'] = data =>
        conCarga(() => trf.aprobar(id, data), ok => ok, () => listo('aprobar', true));
    // Tras aprobar con faltante, AprobarForm crea la solicitud nueva (ya cerrado el despliegue): el Inicio se vuelve a pedir.
    const onCrearFaltante: PropsDetalle['onCrearFaltante'] = async transferenciaId => {
        const r = await trf.crearFaltante(transferenciaId);
        if (r) onCambio();
        return r;
    };
    const onRechazar: PropsDetalle['onRechazar'] = motivo =>
        conCarga(() => trf.rechazar(id, motivo), ok => ok, () => listo('rechazar', false));
    // Lo demás que ofrece el detalle según el estado y los permisos (si otra persona la aprobó mientras tanto, «Registrar
    // lo que llegó»; con permiso, «Cancelar» o «Eliminar»): lo mismo que en Inventario.
    const onRecibir: PropsDetalle['onRecibir'] = (items, tipo = 'total', observacion, itemsCustom) =>
        conCarga(() => trf.recibir(id, items, tipo, observacion, itemsCustom), r => r != null,
            () => listo(tipo === 'parcial' ? 'recibir_parcial' : 'recibir_total', true));
    const onRechazarRecepcion: PropsDetalle['onRechazarRecepcion'] = motivo =>
        conCarga(() => trf.rechazarRecepcion(id, motivo), ok => ok, () => listo('rechazar_recepcion', false));
    const onCancelar: PropsDetalle['onCancelar'] = () =>
        conCarga(() => trf.cancelar(id), ok => ok, () => listo('cancelar', false));
    const onEliminar: PropsDetalle['onEliminar'] = async () => {
        const ok = await trf.eliminar(id);
        if (ok) onResuelta('eliminar', null);
        return ok;
    };

    const t = carga === 'lista' ? trf.selected : null;
    // «Solicitud de materiales» (solo ítems fuera del catálogo): su detalle ya trae su propia X (y «Volver» en el celular).
    const conX = !(t && (t.items?.length ?? 0) === 0);

    return (
        <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pt-2 md:px-6 md:pt-3">
                <div className="min-w-0">
                    <p className={ROTULO_FICHAS}>{ROTULO_RESOLVER}</p>
                    {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
                </div>
                <div className="flex items-center gap-1">
                    {/* eslint-disable-next-line no-restricted-syntax -- enlace del despliegue (navega a Inventario) */}
                    <button type="button" onClick={() => navigate(ruta)} className={ENLACE}>
                        Abrir en Inventario<ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    {conX && <IconButton aria-label="Cerrar" title="Cerrar" onClick={onCerrar} icon={<X className="h-4 w-4" />} />}
                </div>
            </div>
            {carga === 'error' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-4 md:px-6">
                    <p className="text-sm text-muted-foreground">No se pudo abrir la solicitud aquí.</p>
                    <Button variant="secondary" size="sm" onClick={() => setIntento(n => n + 1)}
                        leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}>
                        Reintentar
                    </Button>
                </div>
            ) : t ? (
                // El detalle trae su propio relleno (el del panel de Inventario): desde 768 px se sube un poco hacia el rótulo.
                <div className="md:-mt-3">
                    <TransferenciaDetail
                        transferencia={t}
                        obras={obras}
                        actionLoading={actionLoading}
                        hasPermission={hasPermission}
                        userId={user?.id || 0}
                        onBack={onCerrar}
                        onFetchStock={trf.fetchStockPorItems}
                        onAprobar={onAprobar}
                        onCrearFaltante={onCrearFaltante}
                        onRecibir={onRecibir}
                        onUploadFotoRecepcion={trf.uploadFotoRecepcion}
                        onFetchRecepciones={trf.fetchRecepciones}
                        onRechazar={onRechazar}
                        onRechazarRecepcion={onRechazarRecepcion}
                        onCancelar={onCancelar}
                        onEliminar={onEliminar}
                    />
                </div>
            ) : (
                <div className="px-3 py-4 md:px-6" aria-busy="true">
                    <SkeletonText lines={5} />
                </div>
            )}
        </div>
    );
};

export default ResolverSolicitud;
