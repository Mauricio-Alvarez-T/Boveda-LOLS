import { useEffect, useRef, useState } from 'react';

/**
 * Resalta el botón que se debe presionar en cada paso del tutorial, SIN tocar los
 * componentes reales: busca dentro de `containerRef` el primer `<button>` cuyo texto
 * coincida (en orden de prioridad) con `labels`, le agrega la clase de pulso si está
 * habilitado, lo trae a la vista al cambiar, y expone su `rect` para anclar el globo.
 * Se re-evalúa ante mutaciones del DOM (abrir/cerrar formularios, habilitar botones),
 * scroll y resize.
 */
export interface SpotlightTarget {
    rect: DOMRect | null;
    label: string | null;
    enabled: boolean;
}

const norm = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();

const sameRect = (a: DOMRect | null, b: DOMRect | null) => {
    if (!a || !b) return a === b;
    return Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1
        && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
};

export function useTutorialSpotlight(
    containerRef: React.RefObject<HTMLElement | null>,
    labels: string[],
): SpotlightTarget {
    const [target, setTarget] = useState<SpotlightTarget>({ rect: null, label: null, enabled: false });
    const pulsed = useRef<HTMLButtonElement | null>(null);
    const lastEl = useRef<HTMLButtonElement | null>(null);
    const stateRef = useRef<SpotlightTarget>(target);
    const labelsKey = labels.join('|');

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let raf = 0;
        let scheduled = false;

        const find = (): { el: HTMLButtonElement | null; label: string | null } => {
            const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
            const visible = buttons.filter(b => b.getClientRects().length > 0);
            for (const lbl of labels) {
                const match = visible.find(b => norm(b.textContent).includes(lbl));
                if (match) return { el: match, label: lbl };
            }
            return { el: null, label: null };
        };

        const apply = () => {
            scheduled = false;
            const { el, label } = find();
            const enabled = !!el && !el.disabled;

            // Pulso solo en el objetivo habilitado.
            if (pulsed.current && pulsed.current !== el) {
                pulsed.current.classList.remove('tutorial-pulse');
                pulsed.current = null;
            }
            if (el && enabled) {
                if (pulsed.current !== el) { el.classList.add('tutorial-pulse'); pulsed.current = el; }
            } else if (pulsed.current) {
                pulsed.current.classList.remove('tutorial-pulse');
                pulsed.current = null;
            }

            // Auto-scroll cuando cambia el objetivo y está fuera de la vista.
            if (el && el !== lastEl.current) {
                const r = el.getBoundingClientRect();
                if (r.top < 80 || r.bottom > window.innerHeight - 80) {
                    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
            }
            lastEl.current = el;

            const next: SpotlightTarget = { rect: el ? el.getBoundingClientRect() : null, label, enabled };
            const prev = stateRef.current;
            if (prev.label !== next.label || prev.enabled !== next.enabled || !sameRect(prev.rect, next.rect)) {
                stateRef.current = next;
                setTarget(next);
            }
        };

        const schedule = () => { if (!scheduled) { scheduled = true; raf = requestAnimationFrame(apply); } };

        apply();
        const mo = new MutationObserver(schedule);
        mo.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class', 'style'] });
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        const interval = window.setInterval(schedule, 400);

        return () => {
            cancelAnimationFrame(raf);
            mo.disconnect();
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
            window.clearInterval(interval);
            if (pulsed.current) { pulsed.current.classList.remove('tutorial-pulse'); pulsed.current = null; }
            lastEl.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerRef, labelsKey]);

    return target;
}
