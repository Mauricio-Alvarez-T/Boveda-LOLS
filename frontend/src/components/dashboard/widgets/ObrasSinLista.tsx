import React from 'react';
import { ArrowRight } from 'lucide-react';
import { shareViaWhatsApp } from '../../../utils/whatsappShare';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { CabezaFicha, EnlaceFicha, Ficha, GrillaFichas, PieFicha } from './FichaInicio';
import { mensajeSinLista } from './mensajesWhatsApp';
import { cuando, queEPaso, textoUltima, type ObraSinLista, type SinListaData } from './resumenSinLista';

const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const iniciales = (nombre: string) => nombre.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').trim().split(/\s+/)
    .slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase() || '#';

interface Props {
    datos: SinListaData;
    /** Abre Asistencia en esa obra y ese día. */
    onPasarLista: (obra: ObraSinLista, fecha: string) => void;
}

/**
 * Apartado del detalle de Asistencia con las obras que no pasaron la lista en días hábiles anteriores (Marcos
 * 2026-11-18: «si uno pincha va abajo a un apartado y ve más información: cuál fue y qué pasó»). Una ficha por obra:
 * los días sin lista con lo que pasó cada uno (cada día abre Asistencia en ese día), a quién preguntar (encargado y
 * quién guardó la última) y pedir la lista por WhatsApp.
 */
export const ObrasSinLista: React.FC<Props> = ({ datos, onPasarLista }) => (
    <GrillaFichas>
        {datos.obras.map(o => (
            <Ficha key={o.obra_id}>
                <CabezaFicha circulo={iniciales(o.obra)} tonoCirculo="rojo" titulo={o.obra}
                    bajada={o.encargado ? `Encargado: ${o.encargado}` : `${o.dotacion} ${o.dotacion === 1 ? 'trabajador' : 'trabajadores'}`}
                    cifra={o.dias.length} etiqueta={o.dias.length === 1 ? 'día sin lista' : 'días sin lista'} tonoCifra="rojo" />
                <ul className="-mx-2 space-y-0.5" aria-label={`Días sin lista en ${o.obra}`}>
                    {o.dias.map(d => (
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
                <p className="text-xs text-muted-foreground">{textoUltima(o, datos.hoy)}</p>
                <PieFicha>
                    <EnlaceFicha apagado onClick={() => { void shareViaWhatsApp(mensajeSinLista(o.obra, [...o.dias].reverse().map(d => d.fecha))); }}
                        icono={<WhatsAppIcon className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" />}>
                        Pedir la lista
                    </EnlaceFicha>
                    <EnlaceFicha onClick={() => onPasarLista(o, o.dias[0].fecha)}>Pasar la lista</EnlaceFicha>
                </PieFicha>
            </Ficha>
        ))}
    </GrillaFichas>
);

export default ObrasSinLista;
