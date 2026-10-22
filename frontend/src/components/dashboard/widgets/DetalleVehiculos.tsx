import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, RotateCcw, Truck } from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { cn } from '../../../utils/cn';
import { shareViaWhatsApp } from '../../../utils/whatsappShare';
import { Button } from '../../ui/Button';
import { SkeletonText } from '../../ui/Skeleton';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { CabezaFicha, EnlaceFicha, Ficha, GrillaFichas, Pildora, PieFicha, RotuloFichas } from './FichaInicio';
import { CUADRO, plural } from './fichasInicio';
import {
    abreFormulario, ariaSemaforo, bajadaVehiculo, fichasVehiculos, fraseVehiculo, mensajeWhatsApp, ordenSemaforo, PAPELES_META, pildora,
    rutaSubir, textoAvisar, tituloVehiculo, tonoCelda, tonoFicha, type PapelApi, type PapelesFlotaApi, type TonoCelda,
} from './fichasVehiculosInicio';

/** Caja del error y del «todo al día»: misma piel que las fichas (y que el detalle de Inventario). */
const CAJA = 'rounded-[20px] bg-card p-5 text-foreground shadow-[var(--shadow-sm)]';
/** Fichas a la vista; el resto con «Ver los N». */
const VISIBLES = 9;

/** Cuadro del semáforo; sin registro = punteado, como los días que faltan en el mini calendario de Asistencia. */
const CELDA: Record<TonoCelda, string> = {
    rojo: CUADRO.rojo,
    ambar: CUADRO.ambar,
    neutro: CUADRO.neutro,
    punteado: 'border border-dashed border-border bg-card',
};

const CORTO = Object.fromEntries(PAPELES_META.map(m => [m.clave, m.corto]));

/** Los cinco papeles del vehículo: etiqueta corta y un cuadro (rojo vencido, ámbar por vencer, gris al día). */
const SemaforoPapeles: React.FC<{ papeles: PapelApi[] }> = ({ papeles }) => (
    <div role="img" aria-label={ariaSemaforo(papeles)} className="grid shrink-0 grid-cols-[auto_16px] items-center gap-x-2 gap-y-1">
        {ordenSemaforo(papeles).map(p => {
            const fuerte = p.estado === 'vencido' || p.estado === 'por_vencer';
            return (
                <React.Fragment key={p.clave}>
                    <span className={cn('text-right text-micro', fuerte ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')} aria-hidden>
                        {CORTO[p.clave]}
                    </span>
                    <span className={cn('box-border h-4 w-4 rounded', CELDA[tonoCelda(p.estado)])} aria-hidden />
                </React.Fragment>
            );
        })}
    </div>
);

type Resultado = { version: unknown; intento: number } & ({ ok: true; data: PapelesFlotaApi } | { ok: false });

/**
 * Detalle «Vehículos» del Inicio, opción A «Fichas por vehículo» (Marcos 2026-10-22): una ficha por vehículo
 * con papeles vencidos o por vencer (los que avisan), el semáforo de sus cinco papeles, «Avisar a {conductor}»
 * por WhatsApp (sin número: no hay teléfono del conductor; la persona elige el contacto) y «Subir el nuevo»,
 * que abre Vehículos en ese vehículo y papel. Pide `GET /vehiculos/papeles` al abrirse y cuando cambia
 * `version` («Actualizar» del Inicio); la tarjeta de arriba sigue con el contador del menú.
 */
const DetalleVehiculos: React.FC<{ version?: unknown }> = ({ version }) => {
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const puede = { editar: hasPermission('vehiculos.editar'), crear: hasPermission('vehiculos.crear') };
    const [intento, setIntento] = useState(0);
    const [res, setRes] = useState<Resultado | null>(null);
    const [todos, setTodos] = useState(false);

    useEffect(() => {
        let vigente = true;
        api.get<{ data: PapelesFlotaApi }>('/vehiculos/papeles?dias=30')
            .then(r => { if (vigente) setRes({ version, intento, ok: true, data: r.data.data }); })
            .catch(() => { if (vigente) setRes({ version, intento, ok: false }); });
        return () => { vigente = false; };
    }, [version, intento]);

    const data = res?.ok ? res.data : null;
    const fichas = useMemo(() => fichasVehiculos(data), [data]);
    // Al actualizar se siguen viendo las fichas de antes hasta que llegan las nuevas (sin parpadeo).
    const pendiente = !res || !Object.is(res.version, version) || res.intento !== intento;
    const dias = data?.dias ?? 30;
    const visibles = todos ? fichas : fichas.slice(0, VISIBLES);

    return (
        <section className="space-y-3" aria-busy={pendiente}>
            <RotuloFichas titulo="Requiere acción · papeles vencidos y por vencer"
                nota={`Próximos ${dias} días · el cuadro de la derecha son sus cinco papeles`} />
            {!data && pendiente ? (
                <GrillaFichas>
                    {[0, 1, 2].map(i => <Ficha key={i}><SkeletonText lines={5} /></Ficha>)}
                </GrillaFichas>
            ) : !data ? (
                <div className={cn(CAJA, 'flex flex-wrap items-center justify-between gap-3')}>
                    <p className="text-sm text-muted-foreground">No se pudieron cargar los papeles de la flota.</p>
                    <Button variant="secondary" size="sm" onClick={() => setIntento(n => n + 1)}
                        leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}>
                        Reintentar
                    </Button>
                </div>
            ) : fichas.length === 0 ? (
                <p className={cn(CAJA, 'flex items-center gap-2 text-sm text-muted-foreground')}>
                    <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" aria-hidden />
                    Ningún aviso de papeles vencidos ni por vencer en los próximos {dias} días.
                </p>
            ) : (
                <>
                    <GrillaFichas>
                        {visibles.map(({ v, urg }) => {
                            const tono = tonoFicha(v);
                            return (
                                <Ficha key={v.vehiculo_id}>
                                    <CabezaFicha circulo={<Truck className="h-4 w-4" />} tonoCirculo={tono}
                                        titulo={tituloVehiculo(v)} bajada={bajadaVehiculo(v)}
                                        cifra={v.requiere_accion} etiqueta={plural(v.requiere_accion, 'papel', 'papeles')} tonoCifra={tono} />
                                    <div className="flex items-start gap-4">
                                        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                                            <p className="text-section leading-snug text-zinc-700 dark:text-zinc-300">{fraseVehiculo(urg)}</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {urg.map((u, i) => {
                                                    const p = pildora(u);
                                                    return <Pildora key={`${u.clave ?? u.nombre}-${i}`} tono={p.tono}>{p.texto}</Pildora>;
                                                })}
                                            </div>
                                        </div>
                                        <SemaforoPapeles papeles={v.papeles} />
                                    </div>
                                    <PieFicha>
                                        <EnlaceFicha apagado onClick={() => { void shareViaWhatsApp(mensajeWhatsApp(v, urg)); }}
                                            icono={<WhatsAppIcon className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" />}>
                                            {textoAvisar(v)}
                                        </EnlaceFicha>
                                        <EnlaceFicha onClick={() => navigate(rutaSubir(v, urg))}>
                                            {abreFormulario(v, urg, puede) ? 'Subir el nuevo' : 'Ver vehículo'}
                                        </EnlaceFicha>
                                    </PieFicha>
                                </Ficha>
                            );
                        })}
                    </GrillaFichas>
                    {fichas.length > visibles.length && (
                        <div className="flex justify-center">
                            <EnlaceFicha apagado onClick={() => setTodos(true)} icono={<ChevronDown className="h-4 w-4" aria-hidden />}>
                                Ver los {fichas.length}
                            </EnlaceFicha>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default DetalleVehiculos;
