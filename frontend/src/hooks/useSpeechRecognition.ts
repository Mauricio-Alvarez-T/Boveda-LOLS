import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wrapper mínimo de la Web Speech API (gratis, en el navegador).
 * - Funciona bien en Chrome de Android/desktop.
 * - En Safari/iOS el soporte es poco confiable → `supported` será false y la UI
 *   simplemente oculta el botón de micrófono (el textarea sigue funcionando).
 *
 * Entrega cada frase final al callback `onFinal` para que el consumidor la
 * agregue a su textarea. No mantiene el texto acumulado (eso lo maneja la UI).
 */
function getRecognitionCtor(): any | null {
    if (typeof window === 'undefined') return null;
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

interface Options {
    lang?: string;
    onFinal?: (text: string) => void;
}

export function useSpeechRecognition({ lang = 'es-CL', onFinal }: Options = {}) {
    const Ctor = getRecognitionCtor();
    const supported = !!Ctor;
    const [listening, setListening] = useState(false);

    const recRef = useRef<any>(null);
    const onFinalRef = useRef(onFinal);
    onFinalRef.current = onFinal;

    useEffect(() => {
        return () => { try { recRef.current?.stop(); } catch { /* noop */ } };
    }, []);

    const stop = useCallback(() => {
        try { recRef.current?.stop(); } catch { /* noop */ }
        setListening(false);
    }, []);

    const start = useCallback(() => {
        if (!Ctor) return;
        try { recRef.current?.stop(); } catch { /* noop */ }

        const rec = new Ctor();
        rec.lang = lang;
        rec.continuous = true;
        rec.interimResults = false; // solo frases finales → se agregan al texto

        rec.onresult = (e: any) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                if (r.isFinal) {
                    const t = (r[0]?.transcript || '').trim();
                    if (t) onFinalRef.current?.(t);
                }
            }
        };
        rec.onend = () => setListening(false);
        rec.onerror = () => setListening(false);

        recRef.current = rec;
        try { rec.start(); setListening(true); } catch { setListening(false); }
    }, [Ctor, lang]);

    return { supported, listening, start, stop };
}
