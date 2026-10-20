// Idea: Carousel de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { ULTIMAS_NOVEDADES } from '../../config/novedades';

const llave = (id: string) => `boveda-novedades-vistas:${id}`;
const yaVista = (id: string) => { try { return localStorage.getItem(llave(id)) === '1'; } catch { return false; } };
const marcarVista = (id: string) => { try { localStorage.setItem(llave(id), '1'); } catch { /* sin almacenamiento: se vuelve a mostrar, no es grave */ } };

/**
 * «Novedades de Bóveda» (2026-10-20): lo nuevo de la última entrega en tarjetas que se pasan con el dedo,
 * con las flechas o con los puntos (idea: Carousel de React Bits). Se abre sola UNA vez por persona y
 * entrega al entrar al Inicio (la marca vive en este navegador: es una comodidad, no un registro).
 * Sin avance automático: cada uno lee a su ritmo. Cambio de tarjeta como los pasos de un wizard
 * (diseno.md §9.7): entra 24 px desde el lado hacia el que se avanza, en 200 ms.
 *
 * `abierto`/`onCerrar` opcionales: sin ellos se maneja sola (Inicio); con ellos, la abre quien la monta.
 */
export const NovedadesModal: React.FC<{ abierto?: boolean; onCerrar?: () => void }> = ({ abierto, onCerrar }) => {
    const { hasPermission } = useAuth();
    const entrega = ULTIMAS_NOVEDADES;
    const tarjetas = useMemo(() => entrega.tarjetas.filter(t => !t.permiso || hasPermission(t.permiso)), [entrega, hasPermission]);
    const controlada = abierto !== undefined;
    const [solo, setSolo] = useState(false);
    const [i, setI] = useState(0);
    const [dir, setDir] = useState(0);

    // Sola: se abre un momento después de entrar, si esta entrega no se ha visto en este navegador.
    useEffect(() => {
        if (controlada || !tarjetas.length || yaVista(entrega.id)) return;
        const t = window.setTimeout(() => setSolo(true), 700);
        return () => window.clearTimeout(t);
    }, [controlada, tarjetas.length, entrega.id]);

    const visible = controlada ? !!abierto : solo;
    if (!tarjetas.length) return null;

    const cerrar = () => {
        marcarVista(entrega.id);
        setSolo(false);
        onCerrar?.();
        window.setTimeout(() => { setI(0); setDir(0); }, 250);
    };
    const ir = (n: number) => {
        if (n < 0 || n >= tarjetas.length || n === i) return;
        setDir(n > i ? 1 : -1);
        setI(n);
    };
    const t = tarjetas[i];
    const Icono = t.icon;
    const ultima = i === tarjetas.length - 1;

    return (
        <Modal isOpen={visible} onClose={cerrar} size="sm" icon={Sparkles} title="Novedades de Bóveda"
            description={`${i + 1} de ${tarjetas.length}`}
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    <Button variant="ghost" size="sm" onClick={() => ir(i - 1)} disabled={i === 0} leftIcon={<ChevronLeft className="h-4 w-4" />}>
                        Anterior
                    </Button>
                    {ultima
                        ? <Button size="sm" onClick={cerrar}>Entendido</Button>
                        : <Button size="sm" onClick={() => ir(i + 1)} rightIcon={<ChevronRight className="h-4 w-4" />}>Siguiente</Button>}
                </div>
            }
        >
            <div className="flex flex-col items-center gap-5 py-2 text-center">
                <motion.div
                    key={i}
                    initial={dir === 0 ? false : { opacity: 0, x: dir * 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.25}
                    onDragEnd={(_, info) => {
                        if (info.offset.x < -60) ir(i + 1);
                        else if (info.offset.x > 60) ir(i - 1);
                    }}
                    className="flex w-full cursor-grab touch-pan-y flex-col items-center gap-4 active:cursor-grabbing"
                >
                    <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-primary/10 text-brand-primary">
                        <Icono className="h-9 w-9" aria-hidden />
                    </span>
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold tracking-tight text-brand-dark">{t.titulo}</h3>
                        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">{t.texto}</p>
                    </div>
                </motion.div>
                <div className="flex items-center gap-2" role="group" aria-label="Elegir novedad">
                    {tarjetas.map((x, n) => (
                        // eslint-disable-next-line no-restricted-syntax -- punto de navegación del carrusel (8 px visibles, área de toque de 32 px); Button no soporta este tamaño
                        <button key={x.titulo} type="button" onClick={() => ir(n)} aria-label={`Ver «${x.titulo}»`} aria-current={n === i}
                            className="flex h-8 w-8 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                            <span className={cn('block h-2 rounded-full transition-all duration-200', n === i ? 'w-5 bg-brand-primary' : 'w-2 bg-border')} />
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

export default NovedadesModal;
