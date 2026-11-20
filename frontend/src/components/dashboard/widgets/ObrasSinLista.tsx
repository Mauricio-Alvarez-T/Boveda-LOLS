import React, { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Pencil } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useAuth } from '../../../context/AuthContext';
import { diaCerradoPara } from '../../../utils/fechaChile';
import { shareViaWhatsApp } from '../../../utils/whatsappShare';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { EditorAsistenciaObra } from '../../settings/EditorAsistenciaObra';
import { CabezaFicha, EnlaceFicha, Ficha, GrillaFichas, PieFicha } from './FichaInicio';
import { fechaLarga, mensajeSinLista } from './mensajesWhatsApp';
import {
    calendarioMes, cuando, queEPaso, textoUltima, tramoMes,
    type CeldaMes, type EstadoDia, type ObraSinLista, type SinListaData,
} from './resumenSinLista';

const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const iniciales = (nombre: string) => nombre.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').trim().split(/\s+/)
    .slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase() || '#';

/** Días de la lista que se ven sin desplegar (los más recientes). */
const VISIBLES = 3;
const SEMANA = ['L', 'M', 'M', 'J', 'V'];

/**
 * Cómo se ve cada día del calendario (Marcos 2026-11-19: «los días que sí pasan que queden en verde y solo los días que
 * faltan aparezcan en rojo»). Sin lista = rojo SÓLIDO; guardada = verde SUAVE (tinte + número verde): además del tono
 * se distinguen por la intensidad, así no se confunden con daltonismo. Lo que no correspondía va con borde punteado.
 */
const CELDA: Record<EstadoDia, string> = {
    // Mismo rojo en claro y oscuro: con red-500 el número blanco no llega a 4,5:1.
    falta: 'bg-red-600 text-white hover:bg-red-700',
    guardada: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300',
    feriado: 'border border-dashed border-border text-muted-foreground',
    no_aplica: 'border border-dashed border-border text-muted-foreground',
    antes: 'border border-dashed border-border text-muted-foreground',
    hoy: 'border border-foreground/40 text-foreground',
};

function textoCelda(c: CeldaMes): string {
    const dia = mayuscula(fechaLarga(c.fecha));
    switch (c.estado) {
        case 'falta': return `${dia}: ${c.motivo ? queEPaso(c.motivo) : 'Nadie pasó la lista'}. Abrir Asistencia en ese día`;
        case 'guardada': return `${dia}: lista guardada`;
        case 'feriado': return `${dia}: feriado`;
        case 'no_aplica': return `${dia}: no correspondía (la obra no tenía trabajadores)`;
        case 'antes': return `${dia}: la obra todavía no pasaba lista`;
        case 'hoy': return `${dia}: hoy (se revisa a partir de mañana)`;
    }
}

/** Calendario del último mes de la obra, de lunes a viernes (Marcos 2026-11-18: «guardar el último mes»). */
const CalendarioMes: React.FC<{ datos: SinListaData; obra: ObraSinLista; onDia: (fecha: string) => void }> = ({ datos, obra, onDia }) => {
    const semanas = calendarioMes(datos, obra);
    if (semanas.length === 0) return null;
    return (
        <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Último mes · {tramoMes(datos)}</p>
            <div className="grid max-w-64 grid-cols-5 gap-1.5" role="group" aria-label={`Último mes de ${obra.obra}, de lunes a viernes`}>
                {SEMANA.map((d, i) => (
                    <span key={i} className="text-center text-label font-semibold text-muted-foreground" aria-hidden>{d}</span>
                ))}
                {semanas.flat().map((c, i) => {
                    if (!c) return <span key={`v${i}`} aria-hidden />;
                    const clase = cn('flex h-8 items-center justify-center rounded-md text-xs font-semibold tabular-nums', CELDA[c.estado]);
                    return c.estado === 'falta' ? (
                        // eslint-disable-next-line no-restricted-syntax -- día del calendario (abre Asistencia en ese día)
                        <button key={c.fecha} type="button" onClick={() => onDia(c.fecha)} title={textoCelda(c)} aria-label={textoCelda(c)}
                            className={cn(clase, 'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus-visible:ring-offset-1')}>
                            {c.dia}
                        </button>
                    ) : (
                        <span key={c.fecha} title={textoCelda(c)} className={clase}>
                            {c.dia}<span className="sr-only">, {textoCelda(c)}</span>
                        </span>
                    );
                })}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-label text-muted-foreground" aria-label="Leyenda">
                <li className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden />Sin lista</li>
                <li className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-green-100 ring-1 ring-green-300 dark:bg-green-500/20 dark:ring-green-700" aria-hidden />Guardada</li>
                <li className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-muted-foreground/60" aria-hidden />Antes de empezar o feriado</li>
            </ul>
            <InicioLista obra={obra} />
        </div>
    );
};

/**
 * «Pasa lista desde el lunes 16 de noviembre · Cambiar» (Marcos 2026-11-20, mig 156): desde qué día cuenta la obra;
 * quien puede editar obras lo corrige aquí mismo con las tres opciones de Configuración → Obras.
 */
const InicioLista: React.FC<{ obra: ObraSinLista }> = ({ obra }) => {
    const { hasPermission } = useAuth();
    const desde = (obra.asistencia_desde ?? '').slice(0, 10);
    if (!desde) return null;
    return (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-start gap-1.5">
                <Check className="mt-px h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden />
                Pasa lista desde el {fechaLarga(desde)}
            </span>
            {hasPermission('obras.editar') && (
                <EditorAsistenciaObra obraId={obra.obra_id} obraNombre={obra.obra} inicial={{ estado: 'desde', fecha: desde }}
                    title="Cambiar desde qué día pasa lista esta obra"
                    claseDisparador="inline-flex min-h-8 items-center gap-1 rounded-md font-semibold text-green-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:text-green-300">
                    <Pencil className="h-3 w-3" aria-hidden />Cambiar
                </EditorAsistenciaObra>
            )}
        </p>
    );
};

const FichaObra: React.FC<{ datos: SinListaData; o: ObraSinLista; onPasarLista: Props['onPasarLista'] }> = ({ datos, o, onPasarLista }) => {
    const [todos, setTodos] = useState(false);
    // Un día que ya pasó lo marca RR.HH. (cualquiera) o el jefe de obra (del mes en curso): si no puede marcar el más
    // reciente, la ficha queda sin «Pasar la lista» (igual puede abrir cada día para verlo).
    const { hasPermission } = useAuth();
    const puedeMarcar = !diaCerradoPara(o.dias[0].fecha, hasPermission).cerrado;
    const dias = todos ? o.dias : o.dias.slice(0, VISIBLES);
    const ocultos = o.dias.length - VISIBLES;
    return (
        <Ficha>
            <CabezaFicha circulo={iniciales(o.obra)} tonoCirculo="rojo" titulo={o.obra}
                bajada={o.encargado ? `Encargado: ${o.encargado}` : `${o.dotacion} ${o.dotacion === 1 ? 'trabajador' : 'trabajadores'}`}
                cifra={o.dias.length} etiqueta={o.dias.length === 1 ? 'día sin lista' : 'días sin lista'} tonoCifra="rojo" />
            <CalendarioMes datos={datos} obra={o} onDia={f => onPasarLista(o, f)} />
            <div>
                <ul className="-mx-2 space-y-0.5" aria-label={`Días sin lista en ${o.obra}`}>
                    {dias.map(d => (
                        <li key={d.fecha}>
                            {/* eslint-disable-next-line no-restricted-syntax -- fila de lista (toda la fila navega) */}
                            <button type="button" onClick={() => onPasarLista(o, d.fecha)}
                                title="Abrir Asistencia en esta obra y este día"
                                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600 dark:bg-red-500" aria-hidden />
                                <span className="min-w-0 flex-1 text-sm">
                                    <span className="font-semibold text-foreground">{mayuscula(cuando(d.fecha, datos.hoy))}</span>
                                    <span className="text-muted-foreground"> · {queEPaso(d)}</span>
                                </span>
                                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
                {ocultos > 0 && (
                    // eslint-disable-next-line no-restricted-syntax -- desplegar la lista de la ficha
                    <button type="button" onClick={() => setTodos(v => !v)} aria-expanded={todos}
                        className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-0 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                        {todos ? 'Ver menos' : `Ver ${ocultos === 1 ? 'el otro día' : `los otros ${ocultos} días`}`}
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', todos && 'rotate-180')} aria-hidden />
                    </button>
                )}
            </div>
            <p className="text-xs text-muted-foreground">{textoUltima(o, datos.hoy)}</p>
            <PieFicha>
                <EnlaceFicha apagado onClick={() => { void shareViaWhatsApp(mensajeSinLista(o.obra, [...o.dias].reverse().map(d => d.fecha))); }}
                    icono={<WhatsAppIcon className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" />}>
                    Pedir la lista
                </EnlaceFicha>
                {puedeMarcar && <EnlaceFicha onClick={() => onPasarLista(o, o.dias[0].fecha)}>Pasar la lista</EnlaceFicha>}
            </PieFicha>
        </Ficha>
    );
};

interface Props {
    datos: SinListaData;
    /** Abre Asistencia en esa obra y ese día. */
    onPasarLista: (obra: ObraSinLista, fecha: string) => void;
}

/**
 * Apartado del detalle de Asistencia con las obras que no pasaron la lista en el último mes (Marcos 2026-11-18: «si
 * uno pincha va abajo a un apartado y ve más información: cuál fue y qué pasó»; «me pidieron que guarde el último mes
 * para controlar si algún día faltó pasar lista»). Una ficha por obra: el calendario del mes (cada día sin lista abre
 * Asistencia en ese día), los días con lo que pasó (los 3 más recientes; el resto al desplegar), a quién preguntar
 * (encargado y quién guardó la última) y pedir la lista por WhatsApp.
 */
export const ObrasSinLista: React.FC<Props> = ({ datos, onPasarLista }) => (
    <GrillaFichas>
        {datos.obras.map(o => <FichaObra key={o.obra_id} datos={datos} o={o} onPasarLista={onPasarLista} />)}
    </GrillaFichas>
);

export default ObrasSinLista;
