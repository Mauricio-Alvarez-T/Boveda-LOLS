import React from 'react';
import { ArrowLeft, Image as ImageIcon, CheckCircle2, AlertTriangle, Clock, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Guia, GuiaPaso } from './guiasData';

/**
 * Vista de detalle de una guía del Centro de ayuda: cabecera + secciones paso a
 * paso. In-page (no modal) → en móvil ocupa toda la pantalla y el botón "Volver"
 * regresa al catálogo. Estilo "lo más visual posible": pasos numerados con espacio
 * reservado para captura por paso.
 */

const Captura: React.FC<{ paso: GuiaPaso }> = ({ paso }) => {
    if (!paso.captura) return null;
    // Imagen real ya disponible → se muestra; si no, marcador con la descripción.
    if (paso.capturaLista) {
        return (
            <img
                src={paso.captura}
                alt={paso.titulo}
                className="mt-2 w-full rounded-xl border border-border"
                loading="lazy"
            />
        );
    }
    return (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5 text-caption text-muted-foreground">
            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <span><span className="font-semibold">Captura:</span> {paso.captura}</span>
        </div>
    );
};

export const GuiaDetalle: React.FC<{ guia: Guia; onBack: () => void }> = ({ guia, onBack }) => {
    const Icon = guia.icon;
    return (
        <div className="space-y-5">
            <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Volver al centro de ayuda
            </Button>

            {/* Cabecera de la guía */}
            <div className="flex items-start gap-4">
                <div className="h-12 w-12 shrink-0 rounded-2xl bg-muted flex items-center justify-center">
                    <Icon className="h-6 w-6 text-brand-primary" />
                </div>
                <div className="min-w-0">
                    <p className="text-caption font-bold uppercase tracking-widest text-muted-foreground">{guia.modulo}</p>
                    <h1 className="text-title font-bold text-brand-dark leading-tight">{guia.titulo}</h1>
                    <p className="text-body text-muted-foreground mt-1">{guia.descripcion}</p>
                    {guia.duracion && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" /> {guia.duracion} de lectura
                        </p>
                    )}
                </div>
            </div>

            {/* Secciones */}
            {(guia.secciones || []).map((sec) => (
                <section key={sec.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                    {/* Barra de sección — fondo verde corporativo (excepción aprobada) */}
                    <div className="bg-brand-primary px-5 py-3">
                        <h2 className="text-section font-bold text-white">{sec.titulo}</h2>
                    </div>

                    <div className="p-5 space-y-4">
                        {sec.intro && <p className="text-body text-brand-dark">{sec.intro}</p>}

                        {sec.quien && (
                            <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                                <UserRound className="h-3.5 w-3.5 shrink-0" /> {sec.quien}
                            </p>
                        )}

                        {/* Pasos numerados */}
                        <ol className="space-y-3">
                            {sec.pasos.map((paso, i) => (
                                <li key={i} className="flex gap-3">
                                    <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-brand-primary/10 text-brand-primary text-sm font-bold flex items-center justify-center">
                                        {i + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-body text-brand-dark font-medium">{paso.titulo}</p>
                                        {paso.detalle && <p className="text-caption text-muted-foreground mt-0.5">{paso.detalle}</p>}
                                        <Captura paso={paso} />
                                    </div>
                                </li>
                            ))}
                        </ol>

                        {/* Resultado */}
                        {sec.resultado && (
                            <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2.5">
                                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-success" />
                                <p className="text-caption text-brand-dark"><span className="font-bold">Resultado:</span> {sec.resultado}</p>
                            </div>
                        )}

                        {/* Errores posibles */}
                        {sec.errores && sec.errores.length > 0 && (
                            <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5">
                                <p className="flex items-center gap-1.5 text-caption font-bold text-brand-dark mb-1">
                                    <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Si algo falla
                                </p>
                                <ul className="ml-5 space-y-1 list-disc text-caption text-muted-foreground">
                                    {sec.errores.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                </section>
            ))}
        </div>
    );
};
