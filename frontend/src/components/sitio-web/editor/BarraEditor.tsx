import React, { useState } from 'react';
import { Eye, EyeOff, FlaskConical, Monitor, Plus, Redo2, Save, Send, SlidersHorizontal, Smartphone, Undo2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { useCierreExterno } from '../../../hooks/useCierreExterno';
import { cn } from '../../../utils/cn';
import { ESTADOS, ETIQUETA_ESTADO } from '../reglas';
import type { EstadoObra } from '../tipos';
import { REGLA_PRINCIPAL } from './borradorSitio';
import { ETIQUETA_REGLA, PAGINAS } from './protocolo';
import type { AnchoMarco } from './MarcoSitio';

/** Opciones de un toque (página, ancho): 44 px en el teléfono, 36 px con puntero fino. */
function Segmento<T extends string>({ valor, opciones, onChange, etiqueta }: {
    valor: T; opciones: { valor: T; texto: React.ReactNode; titulo?: string }[]; onChange: (v: T) => void; etiqueta: string;
}) {
    return (
        <div className="flex shrink-0 gap-1 rounded-full border border-border bg-card p-1" role="group" aria-label={etiqueta}>
            {opciones.map(o => (
                <Button key={o.valor} type="button" size="sm" variant={valor === o.valor ? 'primary' : 'ghost'} aria-pressed={valor === o.valor}
                    title={o.titulo} className="h-11 px-3 text-xs md:h-7" onClick={() => onChange(o.valor)}>
                    {o.texto}
                </Button>
            ))}
        </div>
    );
}

export interface PropsBarra {
    ruta: string;
    onRuta: (r: string) => void;
    ancho: AnchoMarco;
    onAncho: (a: AnchoMarco) => void;
    puedeDeshacer: boolean;
    puedeRehacer: boolean;
    onDeshacer: () => void;
    onRehacer: () => void;
    mirar: boolean;
    onMirar: (v: boolean) => void;
    /** Campos por guardar. */
    pendientes: number;
    onGuardar: () => void;
    puedeEditar: boolean;
    /** «Publicar cambios»: solo con `sitio_web.publicar` (y fuera de «ver como»). */
    puedePublicar: boolean;
    simulacion: boolean;
    onPublicar: () => void;
    /** Teléfono: abre la hoja con los datos de la obra tocada (undefined = no hay obra tocada). */
    onDatos?: () => void;
    /** «Nueva obra» (A2): se elige el estado y nace al final de esa lista, fuera del sitio. Sin permiso, undefined. */
    onNuevaObra?: (estado: EstadoObra) => void;
}

const paginas = PAGINAS.map(p => ({ valor: p.ruta, texto: p.etiqueta }));

const botonPublicar = (p: PropsBarra, clase?: string) => p.puedePublicar && (
    <Button variant="glass" onClick={p.onPublicar} disabled={p.pendientes > 0} className={cn('h-11 md:h-9', clase)}
        title={p.pendientes > 0 ? 'Guarda los cambios antes de publicar' : undefined}
        leftIcon={p.simulacion ? <FlaskConical className="h-4 w-4" /> : <Send className="h-4 w-4" />}>
        {p.simulacion ? 'Simular publicación' : 'Publicar cambios'}
    </Button>
);

const botonGuardar = (p: PropsBarra, clase?: string) => p.puedeEditar && (
    <Button onClick={p.onGuardar} disabled={p.pendientes === 0} leftIcon={<Save className="h-4 w-4" />} className={cn('h-11 md:h-9', clase)}
        aria-keyshortcuts="Control+S">
        Guardar{p.pendientes > 0 ? ` (${p.pendientes})` : ''}
    </Button>
);

const historia = (p: PropsBarra) => p.puedeEditar && (
    <>
        <IconButton aria-label="Deshacer" title="Deshacer (Ctrl+Z)" icon={<Undo2 className="h-4 w-4" />} onClick={p.onDeshacer} disabled={!p.puedeDeshacer} />
        <IconButton aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)" icon={<Redo2 className="h-4 w-4" />} onClick={p.onRehacer} disabled={!p.puedeRehacer} />
    </>
);

const visitante = (p: PropsBarra, soloIcono: boolean) => p.puedeEditar && (soloIcono ? (
    <IconButton aria-label={p.mirar ? 'Volver a editar' : 'Ver como visitante'} aria-pressed={p.mirar}
        icon={p.mirar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} onClick={() => p.onMirar(!p.mirar)} />
) : (
    <Button variant={p.mirar ? 'secondary' : 'ghost'} size="sm" aria-pressed={p.mirar} onClick={() => p.onMirar(!p.mirar)}
        leftIcon={p.mirar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} className="h-9">
        {p.mirar ? 'Volver a editar' : 'Ver como visitante'}
    </Button>
));

/**
 * «Nueva obra»: pregunta en qué estado está (cada uno es una lista del sitio). Escritorio: menú bajo el botón; teléfono:
 * hoja fija sobre la barra de abajo, opciones de 44 px. Se cierra al tocar fuera o con Esc (`useCierreExterno`).
 */
const MenuNuevaObra: React.FC<{ onElegir: (e: EstadoObra) => void; telefono?: boolean }> = ({ onElegir, telefono = false }) => {
    const [abierto, setAbierto] = useState(false);
    const ancla = useCierreExterno<HTMLDivElement>({ abierto, alCerrar: () => setAbierto(false), escape: true });
    return (
        <div ref={ancla} className="relative">
            {telefono ? (
                <IconButton aria-label="Nueva obra" title="Nueva obra" icon={<Plus className="h-4 w-4" />} aria-haspopup="menu" aria-expanded={abierto}
                    onClick={() => setAbierto(a => !a)} />
            ) : (
                <Button variant="secondary" size="sm" className="h-9" leftIcon={<Plus className="h-4 w-4" />} aria-haspopup="menu" aria-expanded={abierto}
                    onClick={() => setAbierto(a => !a)}>
                    Nueva obra
                </Button>
            )}
            {abierto && (
                <div role="menu" aria-label="Estado de la obra nueva"
                    className={cn('z-50 flex flex-col gap-0.5 rounded-xl border border-border bg-card p-1.5 shadow-lg',
                        telefono ? 'fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'absolute left-0 top-full mt-2 w-72')}>
                    <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">¿En qué estado está la obra?</p>
                    {ESTADOS.map(e => (
                        <Button key={e} role="menuitem" variant="ghost" className="h-11 w-full justify-start rounded-lg px-2.5 text-left md:h-10"
                            onClick={() => { setAbierto(false); onElegir(e); }}>
                            <span className="flex min-w-0 flex-col items-start">
                                <span className="text-sm font-medium text-brand-dark">{ETIQUETA_ESTADO[e]}</span>
                                <span className="text-caption text-muted-foreground">{ETIQUETA_REGLA[REGLA_PRINCIPAL[e]]}</span>
                            </span>
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Escritorio: una fila sobre la vista del sitio. */
export const BarraEditor: React.FC<PropsBarra> = (p) => (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Editor visual">
        <Segmento etiqueta="Página del sitio" valor={p.ruta} opciones={paginas} onChange={p.onRuta} />
        <Segmento etiqueta="Ancho de la vista" valor={p.ancho} onChange={p.onAncho} opciones={[
            { valor: 'computador', texto: <><Monitor className="h-3.5 w-3.5" /> Computador</>, titulo: 'Como se ve en un computador' },
            { valor: 'celular', texto: <><Smartphone className="h-3.5 w-3.5" /> Celular</>, titulo: 'Como se ve en un celular' },
        ]} />
        <div className="flex items-center gap-1">{historia(p)}</div>
        {p.puedeEditar && p.onNuevaObra && <MenuNuevaObra onElegir={p.onNuevaObra} />}
        {visitante(p, false)}
        <div className="ml-auto flex items-center gap-2">
            {p.pendientes > 0 && <span className="text-xs text-amber-800 dark:text-amber-300">Sin guardar</span>}
            {botonGuardar(p)}
            {botonPublicar(p)}
        </div>
    </div>
);

/** Teléfono, arriba de la vista: la página y publicar. */
export const BarraEditorArriba: React.FC<PropsBarra> = (p) => (
    <div className="flex items-center gap-2">
        <Segmento etiqueta="Página del sitio" valor={p.ruta} opciones={paginas} onChange={p.onRuta} />
        <div className="ml-auto">{botonPublicar(p, 'px-3 text-xs')}</div>
    </div>
);

/** Teléfono, fija abajo: deshacer, rehacer, ver como visitante y guardar (botones de 44 px). */
export const BarraEditorAbajo: React.FC<PropsBarra> = (p) => (
    p.puedeEditar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-1 border-t border-border bg-card px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-sm"
            role="toolbar" aria-label="Editor visual">
            {historia(p)}
            {visitante(p, true)}
            {p.onNuevaObra && <MenuNuevaObra onElegir={p.onNuevaObra} telefono />}
            {p.onDatos && <IconButton aria-label="Datos de la obra" title="Datos de la obra" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={p.onDatos} />}
            <div className="ml-auto">{botonGuardar(p, 'px-4')}</div>
        </div>
    ) : null
);

export default BarraEditor;
