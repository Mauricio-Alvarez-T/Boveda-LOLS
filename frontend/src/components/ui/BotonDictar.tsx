// Idea: Voice Pill de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './Button';
import { cn } from '../../utils/cn';

/**
 * «Dictar»: hablar en vez de escribir (2026-10-20, pensado para la obra: guantes, pantalla chica).
 * Usa el reconocimiento de voz del propio navegador (Web Speech API: Chrome/Android y Safari/iPhone
 * recientes); si el navegador no lo tiene, el botón NO aparece. El audio lo procesa el servicio del
 * navegador (Google en Chrome, Apple en Safari), no Bóveda.
 *
 * Mientras escucha, el botón se ensancha: cuatro barras que se mueven (en CSS, `ecualizador` de
 * index.css; quietas con «reducir movimiento»), el tiempo que lleva y «Detener». Cada frase que el
 * navegador da por terminada llega por `onTexto`; lo que va entendiendo en el momento, por `onParcial`
 * (para mostrarlo en gris bajo el campo). Se detiene solo cuando la persona deja de hablar.
 */

type ResultadoVoz = { isFinal: boolean; 0: { transcript: string } };
interface Reconocedor {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((e: { resultIndex: number; results: ArrayLike<ResultadoVoz> }) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}
type ConstructorReconocedor = new () => Reconocedor;

const constructorVoz = (): ConstructorReconocedor | null => {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Tope de seguridad: si nadie lo detiene ni el navegador corta, a los 2 minutos se detiene solo. */
const TOPE_SEGUNDOS = 120;

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Props {
    /** Frase terminada (ya sin espacios sobrantes). */
    onTexto: (texto: string) => void;
    /** Lo que va entendiendo mientras se habla; '' al terminar. */
    onParcial?: (texto: string) => void;
    className?: string;
}

export const BotonDictar: React.FC<Props> = ({ onTexto, onParcial, className }) => {
    const [Ctor] = useState(constructorVoz);
    const [escuchando, setEscuchando] = useState(false);
    const [segundos, setSegundos] = useState(0);
    const rec = useRef<Reconocedor | null>(null);

    // Reloj mientras escucha (y tope de seguridad).
    useEffect(() => {
        if (!escuchando) return;
        const t = window.setInterval(() => setSegundos(s => {
            if (s + 1 >= TOPE_SEGUNDOS) rec.current?.stop();
            return s + 1;
        }), 1000);
        return () => window.clearInterval(t);
    }, [escuchando]);

    // Al desmontar (se cerró el formulario), soltar el micrófono.
    useEffect(() => () => { rec.current?.abort(); }, []);

    if (!Ctor) return null;

    const empezar = () => {
        const r = new Ctor();
        r.lang = 'es-CL';
        // Una frase por toque: en Android el modo continuo repite frases; si quiere seguir, vuelve a tocar.
        r.continuous = false;
        r.interimResults = true;
        r.onresult = (e) => {
            let final = '';
            let parcial = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += t; else parcial += t;
            }
            if (final.trim()) onTexto(final.trim());
            onParcial?.(parcial.trim());
        };
        r.onerror = (e) => {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                toast.error('Bóveda no tiene permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.');
            } else if (e.error === 'no-speech') {
                toast.info('No te escuché. Vuelve a tocar «Dictar» y habla cerca del teléfono.');
            } else if (e.error !== 'aborted') {
                toast.error('No se pudo dictar. Escríbelo, por favor.');
            }
        };
        r.onend = () => {
            setEscuchando(false);
            onParcial?.('');
            rec.current = null;
        };
        rec.current = r;
        setSegundos(0);
        setEscuchando(true);
        try {
            r.start();
        } catch {
            setEscuchando(false);
            rec.current = null;
        }
    };

    const detener = () => rec.current?.stop();

    return (
        <Button
            type="button"
            size="sm"
            variant={escuchando ? 'primary' : 'secondary'}
            onClick={escuchando ? detener : empezar}
            aria-pressed={escuchando}
            aria-label={escuchando ? `Escuchando, ${reloj(segundos)}. Detener el dictado` : 'Dictar: hablar en vez de escribir'}
            leftIcon={escuchando ? undefined : <Mic className="h-4 w-4" />}
            className={cn('transition-[padding] duration-200', escuchando && 'pl-3 pr-3.5', className)}
        >
            {escuchando ? (
                <span className="inline-flex items-center gap-2">
                    <span className="ecualizador inline-flex h-4 items-end gap-[3px]" aria-hidden>
                        {[0, 1, 2, 3].map(i => <span key={i} className="w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 0.12}s` }} />)}
                    </span>
                    <span className="tabular-nums">{reloj(segundos)}</span>
                    <span className="inline-flex items-center gap-1 opacity-90"><Square className="h-3 w-3 fill-current" aria-hidden /> Detener</span>
                </span>
            ) : 'Dictar'}
        </Button>
    );
};

export default BotonDictar;
