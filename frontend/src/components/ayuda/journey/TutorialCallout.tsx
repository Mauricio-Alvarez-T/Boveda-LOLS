import React from 'react';
import { createPortal } from 'react-dom';
import { MousePointerClick } from 'lucide-react';
import { cn } from '../../../utils/cn';

/**
 * Globo de instrucción anclado al botón objetivo (portal a body, position fixed).
 * Se ubica arriba del botón si hay espacio, si no abajo; centrado y clampeado al
 * viewport (mobile-safe). `pointer-events: none` para no bloquear el clic al botón.
 */
export const TutorialCallout: React.FC<{ rect: DOMRect | null; children: React.ReactNode }> = ({ rect, children }) => {
    if (!rect) return null;
    const vw = window.innerWidth;
    const margin = 12;
    const W = Math.min(300, vw - margin * 2);
    const half = W / 2;
    const buttonCenterX = rect.left + rect.width / 2;
    const left = Math.max(margin + half, Math.min(vw - margin - half, buttonCenterX));
    const below = rect.top < 150; // poca altura arriba → ubicar abajo
    const top = below ? rect.bottom + 12 : rect.top - 12;
    const transform = below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
    const arrowLeft = Math.max(16, Math.min(W - 16, buttonCenterX - (left - half)));

    return createPortal(
        <div
            role="status"
            aria-live="polite"
            style={{ position: 'fixed', top, left, width: W, transform, zIndex: 70, pointerEvents: 'none' }}
        >
            <div className="relative rounded-xl border border-brand-primary/40 bg-card shadow-xl px-3 py-2.5">
                <div className="flex items-start gap-2 text-sm text-brand-dark">
                    <MousePointerClick className="h-4 w-4 mt-0.5 shrink-0 text-brand-primary" />
                    <span>{children}</span>
                </div>
                <div
                    className={cn(
                        'absolute h-3 w-3 rotate-45 bg-card border-brand-primary/40',
                        below ? 'border-l border-t' : 'border-r border-b',
                    )}
                    style={below ? { top: -6, left: arrowLeft, marginLeft: -6 } : { bottom: -6, left: arrowLeft, marginLeft: -6 }}
                />
            </div>
        </div>,
        document.body,
    );
};
