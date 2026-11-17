import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { esHolaDelSitio, leerMensaje, msgIniciar, urlMarco, type MensajeBoveda, type MensajePuente, type MsgHola } from './protocolo';

/** Cómo se le habla al puente: SOLO por el puerto del canal (nunca por `window.postMessage` después del saludo). */
export type Enviar = (msg: MensajeBoveda, transferir?: Transferable[]) => void;
export type EstadoMarco = 'cargando' | 'listo' | 'sin_puente';
export type AnchoMarco = 'computador' | 'celular';

/** Si el puente no saluda en este tiempo, la página no se puede editar (docs/editor-visual.md § 4 Saludo, punto 4). */
export const ESPERA_HOLA_MS = 4000;
const ESPERA_CARGA_MS = 20000;
const ANCHO: Record<AnchoMarco, number> = { computador: 1280, celular: 390 };

interface Props {
    urlSitio: string;
    ruta: string;
    ancho: AnchoMarco;
    /** Sube = recargar el iframe (navegar, después de publicar). */
    recarga: number;
    /** Después de CADA saludo (cada página que carga): mandar el borrador, el modo y las fotos. */
    onListo: (enviar: Enviar, hola: MsgHola) => void;
    /** Lo que llega por el puerto, ya validado con zod (sin el `hola`). */
    onMensaje: (m: MensajePuente) => void;
    onEstado: (e: EstadoMarco) => void;
}

/**
 * El sitio real dentro de la Bóveda (editor visual). Cross-origin y con `sandbox="allow-scripts allow-same-origin"`
 * (sin formularios, ventanas nuevas ni navegar la página de arriba). El saludo, exacto al contrato:
 *   1. el puente manda `hola` a la ventana de arriba;
 *   2. se acepta solo si `e.origin` es el origen del sitio y `e.source` es ESTE iframe;
 *   3. se crea un `MessageChannel`, se le manda `iniciar` con el puerto 2 (al origen del sitio, nunca '*') y desde ahí
 *      todo va por el puerto 1.
 * Cada carga del iframe saluda de nuevo (el puerto anterior se cierra). Sin saludo 4 s después de cargar →
 * `sin_puente`. Navegar (`navegar` del puente, la barra) monta un iframe nuevo y vuelve a esperar el saludo.
 * Ancho: Computador = 1280 px escalado con `transform` para caber; Celular = 390 px (escalado solo si no cabe).
 */
export const MarcoSitio: React.FC<Props> = ({ urlSitio, ruta, ancho, recarga, onListo, onMensaje, onEstado }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const portRef = useRef<MessagePort | null>(null);
    const caja = useRef<HTMLDivElement>(null);
    const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
    const origen = new URL(urlSitio).origin;
    const src = urlMarco(urlSitio, ruta);

    // Los callbacks cambian en cada render: el listener lee siempre los últimos sin volver a registrarse.
    const cb = useRef({ onListo, onMensaje, onEstado });
    useLayoutEffect(() => { cb.current = { onListo, onMensaje, onEstado }; });

    // ── Espera del saludo ──
    // Los 4 s corren desde que la página terminó de cargar (`load`) sin haber saludado: una red lenta no se confunde
    // con un sitio sin puente. Si `load` nunca llega (la red se colgó), a los 20 s tampoco se puede editar.
    const timer = useRef<number | null>(null);
    const conectado = useRef(false);
    const parar = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
    const esperar = useCallback((ms: number) => {
        parar();
        timer.current = window.setTimeout(() => {
            timer.current = null;
            portRef.current?.close();
            portRef.current = null;
            cb.current.onEstado('sin_puente');
        }, ms);
    }, []);

    // Cada iframe nuevo (otra ruta o una recarga): a esperar su saludo.
    useEffect(() => {
        conectado.current = false;
        cb.current.onEstado('cargando');
        esperar(ESPERA_CARGA_MS);
        return () => {
            parar();
            portRef.current?.close();
            portRef.current = null;
        };
    }, [src, recarga, esperar]);

    const alCargar = () => {
        // El puente puede saludar antes o después del `load` de su página; si ya saludó, no hay nada que esperar.
        if (!conectado.current) esperar(ESPERA_HOLA_MS);
    };

    useEffect(() => {
        const alMensaje = (e: MessageEvent) => {
            const ventana = iframeRef.current?.contentWindow ?? null;
            const m = esHolaDelSitio(e, origen, ventana);
            if (!m || !ventana) return;
            parar();
            conectado.current = true;
            portRef.current?.close();
            const canal = new MessageChannel();
            canal.port1.onmessage = (ev: MessageEvent) => {
                const x = leerMensaje(ev.data);
                if (x && x.tipo !== 'hola') cb.current.onMensaje(x);
            };
            portRef.current = canal.port1;
            ventana.postMessage(msgIniciar('editar'), origen, [canal.port2]);
            const puerto = canal.port1;
            const enviar: Enviar = (msg, transferir = []) => {
                // Un puerto viejo (otra página) ya no recibe nada.
                if (portRef.current !== puerto) return;
                puerto.postMessage(msg, transferir);
            };
            cb.current.onEstado('listo');
            cb.current.onListo(enviar, m);
        };
        window.addEventListener('message', alMensaje);
        return () => window.removeEventListener('message', alMensaje);
    }, [origen]);

    // ── Tamaño disponible ──
    useEffect(() => {
        const el = caja.current;
        if (!el) return;
        const medir = () => setMedida({ ancho: el.clientWidth, alto: el.clientHeight });
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const base = ANCHO[ancho];
    const escala = medida.ancho > 0 ? Math.min(1, medida.ancho / base) : 1;
    const alto = medida.alto > 0 ? medida.alto / escala : 800;

    return (
        <div ref={caja} className="relative h-full w-full overflow-hidden">
            <div className="absolute top-0" style={{ left: Math.max(0, (medida.ancho - base * escala) / 2), width: base * escala, height: medida.alto }}>
                <iframe
                    key={`${src}#${recarga}`}
                    ref={iframeRef}
                    src={src}
                    title="El sitio lols.cl para editar"
                    sandbox="allow-scripts allow-same-origin"
                    referrerPolicy="origin"
                    onLoad={alCargar}
                    className="block border-0 bg-white"
                    style={{ width: base, height: alto, transform: `scale(${escala})`, transformOrigin: 'top left' }}
                />
            </div>
        </div>
    );
};

export default MarcoSitio;
