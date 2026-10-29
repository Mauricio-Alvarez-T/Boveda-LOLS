import React from 'react';
import { useInView } from 'react-intersection-observer';
import { ImageOff, Image as ImageIcon, Building2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';
import { Skeleton, SkeletonCirculo, Cargando } from '../ui/Skeleton';
import { useFotoUrl, type AnchoFoto } from './useFotoUrl';
import type { EstadoObra } from './tipos';

/**
 * Piezas chicas del Sitio web (mig 147): miniatura de la portada, casilla de confirmación de 44 px y el modal de
 * confirmar (nunca `window.confirm`: plan 4.8). Los avisos en línea y las opciones de un toque son los de Costos
 * (`costos/piezas.tsx`: `Aviso`, `Opciones`).
 */

/**
 * La portada de una obra en chico. Con foto aprobada, la imagen (se baja al aparecer en pantalla); sin foto, qué
 * muestra el sitio en su lugar: la imagen referencial o, en una obra en proyecto, el recuadro «render por recibir».
 */
export const Miniatura: React.FC<{
    fotoId: number | null;
    referencia: string | null;
    estado: EstadoObra;
    ancho?: AnchoFoto;
    className?: string;
    alt?: string;
}> = ({ fotoId, referencia, estado, ancho = 800, className, alt = '' }) => {
    const { ref, inView } = useInView({ triggerOnce: true, rootMargin: '200px' });
    const { url, error } = useFotoUrl(fotoId, ancho, inView);
    const base = cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted', className);
    if (fotoId) {
        return (
            <span ref={ref} className={cn(base, !url && !error && 'silueta')}>
                {url ? <img src={url} alt={alt} className="h-full w-full object-cover" draggable={false} />
                    : error ? <ImageOff className="h-5 w-5 text-muted-foreground" aria-label="No se pudo cargar la foto" /> : null}
            </span>
        );
    }
    const texto = referencia ? 'Referencial' : estado === 'contratado' ? 'Render por recibir' : 'Sin portada';
    const Icono = referencia ? ImageIcon : estado === 'contratado' ? Building2 : ImageOff;
    return (
        <span ref={ref} className={cn(base, 'flex-col gap-0.5 px-1 text-center')} title={referencia ? `Imagen referencial del sitio (${referencia})` : texto}>
            <Icono className="h-4 w-4 text-muted-foreground" />
            <span className="text-micro font-semibold leading-tight text-muted-foreground">{texto}</span>
        </span>
    );
};

/** Casilla con su texto, toda la fila tocable (44 px en el teléfono). */
export const Casilla: React.FC<{
    checked: boolean;
    onChange: (v: boolean) => void;
    children: React.ReactNode;
    disabled?: boolean;
    nota?: React.ReactNode;
    className?: string;
    id?: string;
}> = ({ checked, onChange, children, disabled, nota, className, id }) => (
    <label className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5',
        disabled && 'cursor-not-allowed opacity-60', className)}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand-primary" />
        <span className="min-w-0">
            <span className="block text-sm font-semibold text-brand-dark">{children}</span>
            {nota && <span className="mt-0.5 block text-xs text-muted-foreground">{nota}</span>}
        </span>
    </label>
);

/** Ámbar = quitar o anular algo que se puede deshacer (diseno.md §3: CTA de archivado, tinte warning). */
const CTA_AVISO = 'bg-warning/10 text-warning hover:bg-warning hover:text-warning-foreground active:bg-warning';

/**
 * Confirmar una acción. El color del botón dice qué es (DS: verde = constructivo): `accion` (verde: incluir,
 * confirmar), `aviso` (ámbar: quitar del sitio, quitar una confirmación; se puede deshacer) o `peligro` (rojo:
 * borrar, rechazar, salir sin guardar). `peligro` suelto = `tono="peligro"`.
 */
export const ConfirmarModal: React.FC<{
    titulo: string;
    children: React.ReactNode;
    textoAccion: string;
    onConfirmar: () => void;
    onClose: () => void;
    cargando?: boolean;
    peligro?: boolean;
    tono?: 'accion' | 'aviso' | 'peligro';
    /** El botón de la acción, apagado (falta marcar algo). */
    deshabilitado?: boolean;
    icon?: React.ElementType;
}> = ({ titulo, children, textoAccion, onConfirmar, onClose, cargando, peligro, tono, deshabilitado, icon }) => {
    const t = tono ?? (peligro ? 'peligro' : 'accion');
    return (
        <Modal isOpen onClose={onClose} size="sm" title={titulo} icon={icon}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={cargando}>Cancelar</Button>
                    <Button variant={t === 'peligro' ? 'destructive' : t === 'aviso' ? 'secondary' : 'primary'} className={t === 'aviso' ? CTA_AVISO : undefined}
                        onClick={onConfirmar} isLoading={cargando} disabled={deshabilitado}>{textoAccion}</Button>
                </div>
            }>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-brand-dark">{children}</div>
        </Modal>
    );
};

/** Lista corta de obras con un rótulo («Nuevas», «Se retiran»…); nada si está vacía. */
export const ListaObras: React.FC<{
    titulo: string;
    obras: { id?: number | null; slug: string; nombre: string | null; nota?: string | null }[];
    tono?: 'neutro' | 'aviso' | 'peligro';
}> = ({ titulo, obras, tono = 'neutro' }) => {
    if (!obras.length) return null;
    return (
        <div className="flex flex-col gap-1.5">
            <span className={cn('text-xs font-bold uppercase tracking-wider',
                tono === 'peligro' ? 'text-red-700 dark:text-red-300' : tono === 'aviso' ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>
                {titulo} · {obras.length}
            </span>
            <ul className="flex flex-col gap-1">
                {obras.map(o => (
                    <li key={`${o.id ?? ''}-${o.slug}`} className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-brand-dark">
                        <span className="font-medium">{o.nombre || o.slug}</span>
                        {o.nota && <span className="block text-xs text-muted-foreground">{o.nota}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
};

/*
 * Siluetas de carga del módulo (diseno.md §9.17): la forma de lo que va a llegar, con el brillo de `ui/Skeleton`.
 * Cada una imita su componente real y trae su `role="status"` (vía `Cargando`).
 */

/** Las tarjetas de `ListaObrasSitio`: portada, nombre, comuna y estado. `conBarra` agrega pestañas y botón (página entera). */
export const SiluetaObras: React.FC<{ conBarra?: boolean }> = ({ conBarra }) => (
    <Cargando que="las obras del sitio" className="flex flex-col gap-4">
        {conBarra && (
            <div className="flex flex-wrap items-center justify-between gap-2" aria-hidden="true">
                <Skeleton className="h-10 w-56 max-w-full rounded-full" />
                <Skeleton className="h-10 w-32 rounded-full" />
            </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map(i => (
                <div key={i} className="flex items-start gap-3 rounded-card border border-border bg-card p-3">
                    <Skeleton className="h-16 w-20 shrink-0 rounded-xl" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                        <Skeleton className={cn('h-4', i === 1 ? 'w-2/5' : 'w-3/5')} />
                        <Skeleton className="h-3 w-1/3" />
                        <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    </Cargando>
);

/** Las filas de `PublicacionesSitio`: insignias, fecha y resumen. */
export const SiluetaPublicaciones: React.FC = () => (
    <Cargando que="las publicaciones" className="flex flex-col gap-2">
        {[0, 1, 2].map(i => (
            <div key={i} className="flex flex-col gap-2 rounded-card border border-border bg-card p-4" aria-hidden="true">
                <div className="flex flex-wrap items-center gap-1.5">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className={cn('h-3.5', i === 1 ? 'w-1/2' : 'w-3/4')} />
            </div>
        ))}
    </Cargando>
);

/** Los pasos de `EstadoPublicacion`: marca redonda, título y una línea. */
export const SiluetaPasos: React.FC<{ que?: string }> = ({ que = 'el estado de la publicación' }) => (
    <Cargando que={que} className="flex flex-col gap-4">
        {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex gap-3" aria-hidden="true">
                <SkeletonCirculo className="mt-0.5 h-5 w-5" />
                <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className={cn('h-3.5', i % 2 ? 'w-1/3' : 'w-2/5')} />
                    <Skeleton className="h-3 w-3/5" />
                </div>
            </div>
        ))}
    </Cargando>
);

/** Lo que va a cambiar en `PublicarModal`: el recuadro del total y la lista de obras. */
export const SiluetaPrevia: React.FC = () => (
    <Cargando que="lo que va a cambiar" className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-9 rounded-xl" />)}
        </div>
    </Cargando>
);
