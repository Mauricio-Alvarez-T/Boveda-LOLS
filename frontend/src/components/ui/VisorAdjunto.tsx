import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, FileText, ExternalLink, Download, Paperclip, AlertTriangle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Modal } from './Modal';
import { IconButton } from './IconButton';
import { cn } from '../../utils/cn';
import { navegadorMuestraPdf, formatearTamano } from '../../utils/archivos';

interface Props {
    /** URL (blob u object URL) del archivo; `null` mientras carga. */
    url: string | null;
    mime: string;
    nombre: string;
    size?: number;
    /** Línea bajo el título: de qué período/documento se trata. */
    descripcion?: React.ReactNode;
    cargando?: boolean;
    error?: string | null;
    onClose: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_PASO = 1.25;
const ZOOM_DOBLE_TOQUE = 2.5;

const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * Visor de un adjunto (foto o PDF) en un modal, con zoom para la imagen.
 *
 * Nació para los justificativos de ausencia: ahí van recetas y certificados
 * médicos, y hay que poder leer la letra chica. Zoom = 1 es "ajustado a la
 * ventana"; de ahí hacia arriba la imagen crece y el contenedor se desplaza
 * (arrastrando con el dedo o el mouse). Entradas: botones +/−/ajustar, rueda
 * del mouse, doble clic/doble toque, y pellizco en el teléfono. `touch-action:
 * pan-x pan-y` le quita al navegador el pellizco para que no agrande la página
 * entera.
 *
 * El PDF se embebe donde el navegador sabe pintarlo y, donde no (Chrome
 * Android), queda la ficha con Abrir / Descargar, igual que en vehículos.
 */
export const VisorAdjunto: React.FC<Props> = ({ url, mime, nombre, size = 0, descripcion, cargando = false, error = null, onClose }) => {
    const [zoom, setZoom] = useState(1);
    const contenedorRef = useRef<HTMLDivElement>(null);
    const pellizcoRef = useRef<{ distancia: number; zoom: number } | null>(null);
    const arrastreRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
    const ultimoToqueRef = useRef(0);

    const esImagen = mime.startsWith('image/');
    const esPdf = mime === 'application/pdf';

    const ajustar = useCallback(() => setZoom(1), []);
    const acercar = useCallback(() => setZoom(z => clamp(z * ZOOM_PASO)), []);
    const alejar = useCallback(() => setZoom(z => clamp(z / ZOOM_PASO)), []);
    const alternar = useCallback(() => setZoom(z => (z > 1 ? 1 : ZOOM_DOBLE_TOQUE)), []);

    // Rueda del mouse: React registra onWheel como pasivo y no deja preventDefault,
    // así que el listener va nativo para que la rueda haga zoom y no desplace la página.
    useEffect(() => {
        const el = contenedorRef.current;
        if (!el || !esImagen) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            setZoom(z => clamp(e.deltaY < 0 ? z * ZOOM_PASO : z / ZOOM_PASO));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [esImagen, url]);

    // Pellizco con dos dedos: la distancia entre ellos, relativa a la del inicio, es el factor.
    const distancia = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            pellizcoRef.current = { distancia: distancia(e.touches), zoom };
            return;
        }
        if (e.touches.length === 1) {
            const ahora = Date.now();
            if (ahora - ultimoToqueRef.current < 300) alternar();   // doble toque
            ultimoToqueRef.current = ahora;
        }
    };
    const onTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && pellizcoRef.current) {
            const factor = distancia(e.touches) / pellizcoRef.current.distancia;
            setZoom(clamp(pellizcoRef.current.zoom * factor));
        }
    };
    const onTouchEnd = () => { pellizcoRef.current = null; };

    // Arrastre con el mouse cuando hay zoom: mueve el scroll del contenedor.
    const onMouseDown = (e: React.MouseEvent) => {
        const el = contenedorRef.current;
        if (!el || zoom <= 1) return;
        arrastreRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        e.preventDefault();
    };
    const onMouseMove = (e: React.MouseEvent) => {
        const el = contenedorRef.current;
        const a = arrastreRef.current;
        if (!el || !a) return;
        el.scrollLeft = a.left - (e.clientX - a.x);
        el.scrollTop = a.top - (e.clientY - a.y);
    };
    const onMouseUp = () => { arrastreRef.current = null; };

    const porcentaje = `${Math.round(zoom * 100)} %`;

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="xl"
            icon={Paperclip}
            title={nombre}
            description={
                <span>
                    {descripcion}
                    {descripcion && size > 0 && <span className="mx-1.5 opacity-40">·</span>}
                    {size > 0 && <span className="text-muted-foreground">{formatearTamano(size)}</span>}
                </span>
            }
            footer={
                url && !error ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <a href={url} target="_blank" rel="noopener noreferrer"
                            className={cn('inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full',
                                'text-sm font-medium transition-all duration-200 ease-apple',
                                'bg-muted text-brand-dark hover:bg-border')}>
                            <ExternalLink className="h-4 w-4" />
                            Abrir aparte
                        </a>
                        <a href={url} download={nombre}
                            className={cn('inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full',
                                'text-sm font-medium transition-all duration-200 ease-apple',
                                'bg-brand-primary text-white shadow-sm hover:bg-[#027A3B]')}>
                            <Download className="h-4 w-4" />
                            Descargar
                        </a>
                    </div>
                ) : undefined
            }
        >
            <div className="relative rounded-xl overflow-hidden bg-muted/40">
                {cargando ? (
                    <div className="h-[60dvh] flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="h-[40dvh] flex flex-col items-center justify-center gap-2 px-6 text-center">
                        <AlertTriangle className="h-6 w-6 text-amber-700 dark:text-amber-300" />
                        <p className="text-sm text-muted-foreground">{error}</p>
                    </div>
                ) : url && esImagen ? (
                    <>
                        {/* Controles de zoom, flotando sobre la imagen */}
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-card/90 backdrop-blur border border-border px-1.5 py-1 shadow-sm">
                            <IconButton size="sm" onClick={alejar} disabled={zoom <= ZOOM_MIN} aria-label="Alejar" title="Alejar" icon={<ZoomOut className="h-4 w-4" />} />
                            <span className="text-caption font-bold text-brand-dark tabular-nums min-w-[3.5rem] text-center">{porcentaje}</span>
                            <IconButton size="sm" onClick={acercar} disabled={zoom >= ZOOM_MAX} aria-label="Acercar" title="Acercar" icon={<ZoomIn className="h-4 w-4" />} />
                            <IconButton size="sm" onClick={ajustar} disabled={zoom === 1} aria-label="Ajustar a la ventana" title="Ajustar a la ventana" icon={<Maximize2 className="h-4 w-4" />} />
                        </div>
                        <div
                            ref={contenedorRef}
                            className={cn(
                                'h-[70dvh] md:h-[72vh] overflow-auto select-none',
                                zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'flex items-center justify-center'
                            )}
                            style={{ touchAction: 'pan-x pan-y' }}
                            onTouchStart={onTouchStart}
                            onTouchMove={onTouchMove}
                            onTouchEnd={onTouchEnd}
                            onMouseDown={onMouseDown}
                            onMouseMove={onMouseMove}
                            onMouseUp={onMouseUp}
                            onMouseLeave={onMouseUp}
                            onDoubleClick={alternar}
                        >
                            <img
                                src={url}
                                alt={nombre}
                                draggable={false}
                                title={zoom > 1 ? 'Doble clic para ajustar' : 'Doble clic o rueda para acercar'}
                                className={cn(zoom > 1 ? 'block max-w-none' : 'max-w-full max-h-full object-contain cursor-zoom-in')}
                                style={zoom > 1 ? { width: `${zoom * 100}%` } : undefined}
                            />
                        </div>
                        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-card/90 backdrop-blur border border-border px-3 py-1 text-micro text-muted-foreground pointer-events-none">
                            Rueda, doble clic o pellizco para acercar · arrastra para moverte
                        </p>
                    </>
                ) : url && esPdf && navegadorMuestraPdf() ? (
                    <iframe src={url} title={nombre} className="w-full h-[70dvh] md:h-[72vh] border-0 bg-white" />
                ) : url ? (
                    /* Móvil con PDF (o un tipo que el navegador no pinta): ficha con los
                       dos botones del pie, que sí funcionan en el teléfono. */
                    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                        </span>
                        <p className="text-sm font-semibold text-brand-dark break-all">{nombre}</p>
                        <p className="text-caption text-muted-foreground max-w-xs">
                            Este teléfono no muestra los PDF dentro de la página. Ábrelo con el visor del
                            teléfono o descárgalo con los botones de abajo.
                        </p>
                    </div>
                ) : null}
            </div>
        </Modal>
    );
};

export default VisorAdjunto;
