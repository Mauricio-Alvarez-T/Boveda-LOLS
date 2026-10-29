import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    Camera, Check, CheckCircle2, ImagePlus, Maximize2, Pencil, ShieldAlert, ShieldCheck, ShieldOff, Trash2, Upload, X, XCircle,
} from 'lucide-react';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { StatusBadge } from '../ui/StatusBadge';
import { FormError } from '../ui/FormError';
import { VisorAdjunto } from '../ui/VisorAdjunto';
import { Aviso } from '../costos/piezas';
import { compressImage } from '../../utils/compressImage';
import { formatearTamano } from '../../utils/archivos';
import { fmtFecha } from '../../utils/format';
import { cn } from '../../utils/cn';
import { recargarPendientesSitioWeb } from '../../hooks/useSitioWebPendientes';
import { Casilla, ConfirmarModal, Miniatura } from './piezas';
import { useFotoUrl } from './useFotoUrl';
import { REGLA_NADIE_RECONOCIBLE, TEXTO_CONFIRMA_SIN_PERSONAS, mensajeError } from './sitioWebConfig';
import { ALT_MIN, LARGOS, MAX_BYTES_FOTO, MIN_ANCHO_FOTO } from './reglas';
import type { EstadoObra, FotoSitio } from './tipos';

interface Props {
    obraId: number;
    nombreObra: string;
    estado: EstadoObra;
    fotos: FotoSitio[];
    referencia: string | null;
    puedeEditar: boolean;
    puedePublicar: boolean;
    /** Después de cada acción: vuelve a pedir la obra. */
    onCambio: () => void;
}

const FORMATOS = ['image/jpeg', 'image/png', 'image/webp'];

type Accion =
    | { tipo: 'revisar'; foto: FotoSitio }
    | { tipo: 'rechazar'; foto: FotoSitio }
    | { tipo: 'borrar'; foto: FotoSitio }
    | { tipo: 'quitar_confirmacion'; foto: FotoSitio }
    | { tipo: 'confirmar'; foto: FotoSitio }
    | null;

const leerAncho = (archivo: File): Promise<{ ancho: number; alto: number }> => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { resolve({ ancho: img.naturalWidth, alto: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error('no se pudo leer')); URL.revokeObjectURL(url); };
    img.src = url;
});

/**
 * La foto de portada de una obra del sitio (plan 4.6 y 4.8). «Nadie reconocible» con dos llaves atadas a los bytes:
 *   1. quien sube marca «Confirmo que en la foto no se reconoce a ninguna persona» y describe la foto;
 *   2. quien tiene `sitio_web.publicar` la revisa con zoom y la aprueba (D4, 28-10: puede ser la misma persona).
 * Una subida siempre es una foto nueva que espera aprobación; al aprobarla reemplaza a la anterior. «Rechazar» es el
 * bloqueo de emergencia: esa foto no vuelve a salir. El servidor quita los metadatos (GPS, cámara) y arma las
 * versiones de 800 y 1600 px; aquí la foto solo se achica para que suba rápido.
 */
export const FotoPortada: React.FC<Props> = ({ obraId, nombreObra, estado, fotos, referencia, puedeEditar, puedePublicar, onCambio }) => {
    const vigente = fotos.find(f => f.vigente) || null;
    const otras = fotos.filter(f => !f.vigente);
    const [accion, setAccion] = useState<Accion>(null);
    const [trabajando, setTrabajando] = useState(false);

    const despues = () => { setAccion(null); onCambio(); recargarPendientesSitioWeb(); };
    const ejecutar = async (fn: () => Promise<unknown>, ok: string, falla: string) => {
        setTrabajando(true);
        try {
            await fn();
            toast.success(ok);
            despues();
        } catch (e) {
            toast.error(mensajeError(e, falla));
        } finally {
            setTrabajando(false);
        }
    };

    const aprobar = (f: FotoSitio) => ejecutar(() => api.post(`/sitio-web/fotos/${f.id}/aprobar`),
        'Foto aprobada: es la portada desde la próxima publicación.', 'No se pudo aprobar la foto.');
    const rechazar = (f: FotoSitio) => ejecutar(() => api.post(`/sitio-web/fotos/${f.id}/rechazar`),
        f.vigente ? 'Foto rechazada: la próxima publicación la saca del sitio.' : 'Foto rechazada: no va a salir al sitio.', 'No se pudo rechazar la foto.');
    const borrar = (f: FotoSitio) => ejecutar(() => api.delete(`/sitio-web/fotos/${f.id}`), 'Foto borrada.', 'No se pudo borrar la foto.');
    const cambiarConfirmacion = (f: FotoSitio, v: boolean) => ejecutar(() => api.put(`/sitio-web/fotos/${f.id}`, { sin_personas_confirmado: v }),
        v ? 'Confirmación guardada.' : 'Confirmación quitada: la foto tiene que volver a aprobarse.', 'No se pudo cambiar la confirmación.');

    return (
        <div className="flex flex-col gap-5">
            <Aviso icon={ShieldAlert}>
                <p className="font-semibold">{REGLA_NADIE_RECONOCIBLE}</p>
                <p>Lo que se publica queda para siempre en el historial público del sitio. Si dudas, no la subas.</p>
            </Aviso>

            {/* ── Portada actual ── */}
            <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 md:p-5">
                <h3 className="text-sm font-semibold text-foreground">Portada actual</h3>
                {vigente ? (
                    <FilaFoto foto={vigente} grande puedeEditar={puedeEditar} puedePublicar={puedePublicar} onAccion={setAccion} onCambio={despues} />
                ) : (
                    <div className="flex items-center gap-3">
                        <Miniatura fotoId={null} referencia={referencia} estado={estado} className="h-16 w-24" />
                        <p className="text-sm text-muted-foreground">
                            {referencia
                                ? 'Sin foto propia: el sitio muestra una imagen referencial. Al aprobarse una foto, la reemplaza.'
                                : estado === 'contratado'
                                    ? 'Sin portada: el sitio muestra el recuadro «render por recibir». Una obra en proyecto puede salir así.'
                                    : 'Sin portada todavía: una obra en construcción o terminada necesita una foto aprobada para salir al sitio.'}
                        </p>
                    </div>
                )}
            </section>

            {puedeEditar && <SubirPortada obraId={obraId} puedePublicar={puedePublicar} onSubida={despues} />}

            {otras.length > 0 && (
                <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 md:p-5">
                    <h3 className="text-sm font-semibold text-foreground">Otras fotos</h3>
                    <ul className="flex flex-col divide-y divide-border">
                        {otras.map(f => (
                            <li key={f.id} className="py-3 first:pt-0 last:pb-0">
                                <FilaFoto foto={f} puedeEditar={puedeEditar} puedePublicar={puedePublicar} onAccion={setAccion} onCambio={despues} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {accion?.tipo === 'revisar' && (
                <RevisarFoto foto={accion.foto} nombreObra={nombreObra} puedePublicar={puedePublicar} trabajando={trabajando}
                    onAprobar={() => aprobar(accion.foto)} onRechazar={() => setAccion({ tipo: 'rechazar', foto: accion.foto })} onClose={() => setAccion(null)} />
            )}
            {accion?.tipo === 'rechazar' && (
                <ConfirmarModal titulo="Rechazar la foto" textoAccion="Rechazar" peligro icon={XCircle} cargando={trabajando}
                    onConfirmar={() => rechazar(accion.foto)} onClose={() => setAccion(null)}>
                    <p>Rechazar es el bloqueo de emergencia: <strong>esta foto no vuelve a salir al sitio</strong>, ni aunque alguien la confirme o la suba de nuevo. Queda registrada (no se puede borrar) para que eso se cumpla.</p>
                    {accion.foto.vigente
                        ? <p>Hoy es la portada: la próxima publicación la saca del sitio. Si la obra se queda sin portada, sale del sitio hasta tener otra aprobada.</p>
                        : <p>No está publicada: solo queda descartada.</p>}
                    {accion.foto.heredada && <p className="text-muted-foreground">Es la foto que traía el sitio. Si también aparece en «Han confiado en nosotros», la publicación avisa y Mauricio la saca de ahí.</p>}
                </ConfirmarModal>
            )}
            {accion?.tipo === 'borrar' && (
                <ConfirmarModal titulo="Borrar la foto" textoAccion="Borrar" peligro icon={Trash2} cargando={trabajando}
                    onConfirmar={() => borrar(accion.foto)} onClose={() => setAccion(null)}>
                    <p>Se borra de la Bóveda. Queda anotado en el historial de la obra.</p>
                    {accion.foto.vigente && <p>Es la portada aprobada, pero todavía no está en el sitio: sin ella, la próxima publicación no la usa.</p>}
                </ConfirmarModal>
            )}
            {accion?.tipo === 'quitar_confirmacion' && (
                <ConfirmarModal titulo="Quitar la confirmación" textoAccion="Quitar confirmación" tono="aviso" icon={ShieldOff} cargando={trabajando}
                    onConfirmar={() => cambiarConfirmacion(accion.foto, false)} onClose={() => setAccion(null)}>
                    <p>La foto deja de estar aprobada: para volver a usarla, alguien tiene que confirmarla y aprobarla de nuevo.</p>
                    {accion.foto.publicada && (
                        <p>Ojo: lo ya publicado <strong>sigue en el sitio</strong>. Si en la foto se reconoce a alguien, {puedePublicar ? 'usa «Rechazar» y publica' : 'avisa a quien publica para que la rechace y publique'}.</p>
                    )}
                </ConfirmarModal>
            )}
            {accion?.tipo === 'confirmar' && (
                <ConfirmarSinPersonas foto={accion.foto} nombreObra={nombreObra} cargando={trabajando}
                    onConfirmar={() => cambiarConfirmacion(accion.foto, true)} onClose={() => setAccion(null)} />
            )}
        </div>
    );
};

/* ──────────────── una foto ──────────────── */

const FilaFoto: React.FC<{
    foto: FotoSitio;
    grande?: boolean;
    puedeEditar: boolean;
    puedePublicar: boolean;
    onAccion: (a: Accion) => void;
    onCambio: () => void;
}> = ({ foto: f, grande, puedeEditar, puedePublicar, onAccion, onCambio }) => {
    const [editandoAlt, setEditandoAlt] = useState(false);
    const [alt, setAlt] = useState(f.alt || '');
    const [guardandoAlt, setGuardandoAlt] = useState(false);
    const rechazada = f.estado === 'rechazada';
    const porAprobar = f.estado === 'por_aprobar' || f.estado === 'sin_confirmar';

    const guardarAlt = async () => {
        setGuardandoAlt(true);
        try {
            await api.put(`/sitio-web/fotos/${f.id}`, { alt: alt.trim() });
            toast.success('Descripción guardada');
            setEditandoAlt(false);
            onCambio();
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudo guardar la descripción.'));
        } finally {
            setGuardandoAlt(false);
        }
    };

    const quien = [
        f.heredada ? 'Importada del sitio: revisa que nadie sea reconocible' : f.subido_por_nombre ? `Subió ${f.subido_por_nombre} el ${fmtFecha(f.created_at)}` : `Subida el ${fmtFecha(f.created_at)}`,
        f.sin_personas_confirmado && f.confirmado_por_nombre && !f.heredada ? `Confirmó que no se reconoce a nadie: ${f.confirmado_por_nombre}` : null,
        f.aprobada_por_nombre && f.aprobada_at ? `Aprobó ${f.aprobada_por_nombre} el ${fmtFecha(f.aprobada_at)}` : null,
        rechazada && f.rechazada_at ? `Rechazó ${f.rechazada_por_nombre || 'alguien'} el ${fmtFecha(f.rechazada_at)}` : null,
        !f.sin_personas_confirmado && !rechazada ? 'Falta confirmar que no se reconoce a nadie' : null,
    ].filter(Boolean) as string[];

    return (
        <div className={cn('flex gap-3', grande ? 'flex-col sm:flex-row' : 'items-start')}>
            {/* eslint-disable-next-line no-restricted-syntax -- la miniatura entera abre el visor con zoom; Button no envuelve media */}
            <button type="button" onClick={() => onAccion({ tipo: 'revisar', foto: f })} title="Ver con zoom"
                className={cn('group relative shrink-0 cursor-zoom-in overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                    grande ? 'aspect-[4/3] w-full sm:w-72' : 'h-16 w-24', rechazada && 'opacity-60')}>
                <Miniatura fotoId={f.id} referencia={null} estado="terminado" ancho={grande ? 1600 : 800} alt={f.alt || ''} className="h-full w-full" />
                <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-0.5 text-micro font-semibold text-brand-dark">
                    <Maximize2 className="h-3 w-3" /> {grande ? 'Ver con zoom' : 'Ver'}
                </span>
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge domain="sitioWebFoto" status={f.estado} showIcon />
                    {f.heredada && <StatusBadge tone="neutral" label="Del sitio" />}
                    <span className="text-caption text-muted-foreground tabular-nums">{f.ancho}×{f.alto}{f.tamano_bytes ? ` · ${formatearTamano(f.tamano_bytes)}` : ''}</span>
                </div>
                {editandoAlt ? (
                    <div className="flex flex-col gap-2">
                        <Input value={alt} onChange={e => setAlt(e.target.value)} maxLength={LARGOS.alt} aria-label="Descripción de la foto" autoFocus />
                        <div className="flex gap-2">
                            <Button size="sm" className="h-11 md:h-9" onClick={guardarAlt} isLoading={guardandoAlt} disabled={alt.trim().length < ALT_MIN} leftIcon={<Check className="h-4 w-4" />}>Guardar</Button>
                            <Button size="sm" className="h-11 md:h-9" variant="ghost" onClick={() => { setAlt(f.alt || ''); setEditandoAlt(false); }}>Cancelar</Button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-brand-dark">{f.alt || <span className="text-muted-foreground">Sin descripción</span>}</p>
                )}
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {quien.map(q => <li key={q}>{q}</li>)}
                </ul>
                {!rechazada && (puedeEditar || puedePublicar) && !editandoAlt && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {puedePublicar && porAprobar && (
                            <Button size="sm" className="h-11 md:h-9" onClick={() => onAccion({ tipo: 'revisar', foto: f })} leftIcon={<CheckCircle2 className="h-4 w-4" />}>Revisar y aprobar</Button>
                        )}
                        {puedeEditar && !f.sin_personas_confirmado && (
                            <Button size="sm" className="h-11 md:h-9" variant="secondary" onClick={() => onAccion({ tipo: 'confirmar', foto: f })} leftIcon={<ShieldCheck className="h-4 w-4" />}>Confirmar</Button>
                        )}
                        {puedeEditar && (
                            <Button size="sm" className="h-11 md:h-9" variant="ghost" onClick={() => setEditandoAlt(true)} leftIcon={<Pencil className="h-4 w-4" />}>Descripción</Button>
                        )}
                        {puedeEditar && f.sin_personas_confirmado && !f.heredada && (
                            <Button size="sm" className="h-11 md:h-9" variant="ghost" onClick={() => onAccion({ tipo: 'quitar_confirmacion', foto: f })} leftIcon={<ShieldOff className="h-4 w-4" />}>Quitar confirmación</Button>
                        )}
                        {puedePublicar && (
                            <Button size="sm" className="h-11 md:h-9" variant="destructive" onClick={() => onAccion({ tipo: 'rechazar', foto: f })} leftIcon={<XCircle className="h-4 w-4" />}>Rechazar</Button>
                        )}
                        {/* La que el sitio muestra no se borra (borrarla no la saca de ahí): se rechaza y se publica. */}
                        {puedeEditar && !f.publicada && (
                            <IconButton icon={<Trash2 className="h-4 w-4" />} variant="danger" aria-label="Borrar la foto" title="Borrar la foto" onClick={() => onAccion({ tipo: 'borrar', foto: f })} />
                        )}
                    </div>
                )}
                {!rechazada && f.publicada && puedeEditar && !puedePublicar && (
                    <p className="text-xs text-muted-foreground">Está en el sitio: si hay que sacarla, avisa a quien publica para que la rechace y publique.</p>
                )}
                {rechazada && (
                    <p className="text-xs text-muted-foreground">
                        Queda registrada para que nunca vuelva a salir (no se borra).{f.publicada ? ' La próxima publicación la saca del sitio.' : ''}
                    </p>
                )}
            </div>
        </div>
    );
};

/* ──────────────── revisar con zoom (y aprobar) ──────────────── */

const RevisarFoto: React.FC<{
    foto: FotoSitio;
    nombreObra: string;
    puedePublicar: boolean;
    trabajando: boolean;
    onAprobar: () => void;
    onRechazar: () => void;
    onClose: () => void;
}> = ({ foto: f, nombreObra, puedePublicar, trabajando, onAprobar, onRechazar, onClose }) => {
    // La maestra (hasta 2400 px): la más grande, para buscar caras, nombres en cascos y patentes.
    const { url, error, cargando } = useFotoUrl(f.id, 'maestra');
    const porAprobar = f.estado === 'por_aprobar' || f.estado === 'sin_confirmar';
    const sinConfirmar = !f.sin_personas_confirmado;
    const pie = puedePublicar && f.estado !== 'rechazada' ? (
        <div className="flex w-full flex-col gap-2">
            {porAprobar && (
                <p className={cn('text-xs', sinConfirmar || error ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>
                    {sinConfirmar
                        ? 'Falta que alguien confirme que no se reconoce a nadie: sin eso no se puede aprobar.'
                        : error ? 'No se puede aprobar sin haberla visto: vuelve a abrirla.'
                            : 'Acerca la foto y revisa caras, nombres en cascos o chalecos y patentes antes de aprobar.'}
                </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="destructive" onClick={onRechazar} disabled={trabajando} leftIcon={<XCircle className="h-4 w-4" />}>Rechazar</Button>
                {porAprobar && (
                    // Se aprueba mirando: mientras la foto no se ve (cargando o falló), el botón queda apagado.
                    <Button onClick={onAprobar} isLoading={trabajando} disabled={sinConfirmar || !url} leftIcon={<CheckCircle2 className="h-4 w-4" />}>Aprobar foto</Button>
                )}
            </div>
        </div>
    ) : undefined;
    return (
        <VisorAdjunto url={url} mime="image/jpeg" nombre={`Portada de ${nombreObra}`} cargando={cargando} onClose={onClose}
            error={error ? 'No se pudo abrir la foto. Vuelve a intentarlo.' : null}
            descripcion={<span>{f.alt || 'Sin descripción'} · {f.ancho}×{f.alto}</span>} pie={pie} />
    );
};

/* ──────────────── confirmar «sin personas» de una foto ya subida ──────────────── */

const ConfirmarSinPersonas: React.FC<{ foto: FotoSitio; nombreObra: string; cargando: boolean; onConfirmar: () => void; onClose: () => void }> = ({ foto, nombreObra, cargando, onConfirmar, onClose }) => {
    const [marcado, setMarcado] = useState(false);
    const [verFoto, setVerFoto] = useState(false);
    return (
        <>
            <ConfirmarModal titulo="Confirmar la foto" textoAccion="Confirmar" icon={ShieldCheck} cargando={cargando} deshabilitado={!marcado}
                onConfirmar={() => { if (marcado) onConfirmar(); }} onClose={onClose}>
                <p>{REGLA_NADIE_RECONOCIBLE}</p>
                <Button variant="link" size="sm" className="self-start font-semibold text-green-700 dark:text-green-300" onClick={() => setVerFoto(true)}>Mirar la foto con zoom</Button>
                <Casilla checked={marcado} onChange={setMarcado}>{TEXTO_CONFIRMA_SIN_PERSONAS}</Casilla>
                {!marcado && <p className="text-xs text-muted-foreground">Marca la casilla para confirmar.</p>}
            </ConfirmarModal>
            {verFoto && <RevisarFoto foto={foto} nombreObra={nombreObra} puedePublicar={false} trabajando={false} onAprobar={() => {}} onRechazar={() => {}} onClose={() => setVerFoto(false)} />}
        </>
    );
};

/* ──────────────── subir una portada nueva ──────────────── */

const SubirPortada: React.FC<{ obraId: number; puedePublicar: boolean; onSubida: () => void }> = ({ obraId, puedePublicar, onSubida }) => {
    const camaraRef = useRef<HTMLInputElement>(null);
    const galeriaRef = useRef<HTMLInputElement>(null);
    const [archivo, setArchivo] = useState<File | null>(null);
    const [medidas, setMedidas] = useState<{ ancho: number; alto: number } | null>(null);
    const [previa, setPrevia] = useState<string | null>(null);
    const [alt, setAlt] = useState('');
    const [confirma, setConfirma] = useState(false);
    const [preparando, setPreparando] = useState(false);
    const [subiendo, setSubiendo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verGrande, setVerGrande] = useState(false);
    const [arrastrando, setArrastrando] = useState(false);

    useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

    // Una imagen soltada fuera del recuadro no la abre el navegador encima del formulario.
    useEffect(() => {
        const sinAbrir = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
        window.addEventListener('dragover', sinAbrir);
        window.addEventListener('drop', sinAbrir);
        return () => { window.removeEventListener('dragover', sinAbrir); window.removeEventListener('drop', sinAbrir); };
    }, []);

    const cargar = async (f: File) => {
        setError(null);
        if (!f.type.startsWith('image/')) { setError('Tiene que ser una foto (JPG, PNG o WEBP).'); return; }
        setPreparando(true);
        // Solo para que suba rápido: hasta 2.400 px (lo que guarda el servidor) y nunca menos de 1.600.
        const listo = await compressImage(f, { maxDim: 2400, minDim: 1600, maxBytes: 2.5 * 1024 * 1024 }).catch(() => f);
        try {
            if (!FORMATOS.includes(listo.type)) { setError('Formato no permitido: sube una foto JPG, PNG o WEBP.'); return; }
            if (listo.size > MAX_BYTES_FOTO) { setError('La foto pesa más de 10 MB.'); return; }
            const m = await leerAncho(listo).catch(() => null);
            if (m && m.ancho < MIN_ANCHO_FOTO) {
                setError(`La foto es muy chica (${m.ancho} px de ancho): tiene que tener al menos ${MIN_ANCHO_FOTO} px para verse bien en el sitio.`);
                return;
            }
            setArchivo(listo);
            setMedidas(m);
            setConfirma(false);
            setPrevia(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(listo); });
        } finally {
            setPreparando(false);
        }
    };
    const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) cargar(f);
    };
    const soltar = (e: React.DragEvent) => {
        e.preventDefault();
        setArrastrando(false);
        const f = Array.from(e.dataTransfer.files).find(x => x.type.startsWith('image/'));
        if (f) cargar(f);
        else if (e.dataTransfer.files.length) setError('Eso no es una foto. Suelta un JPG, PNG o WEBP.');
    };
    const quitar = () => {
        setArchivo(null);
        setMedidas(null);
        setConfirma(false);
        setPrevia(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };

    const altOk = alt.trim().length >= ALT_MIN;
    const listo = !!archivo && altOk && confirma;

    const subir = async () => {
        if (!archivo || !listo) return;
        setSubiendo(true);
        setError(null);
        try {
            const fd = new FormData();
            // Nombre fijo: el del teléfono puede traer el nombre de una persona (el servidor igual lo descarta).
            const ext = archivo.type === 'image/png' ? 'png' : archivo.type === 'image/webp' ? 'webp' : 'jpg';
            fd.append('foto', archivo, `portada.${ext}`);
            fd.append('alt', alt.trim());
            fd.append('sin_personas', 'true');
            await api.post(`/sitio-web/obras/${obraId}/fotos`, fd);
            toast.success(puedePublicar ? 'Foto subida. Revísala con zoom y apruébala para que sea la portada.' : 'Foto subida. Espera la aprobación de quien publica.');
            quitar();
            setAlt('');
            onSubida();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo subir la foto.'));
        } finally {
            setSubiendo(false);
        }
    };

    return (
        <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 md:p-5">
            <div>
                <h3 className="text-sm font-semibold text-foreground">Subir una portada nueva</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Queda esperando aprobación; al aprobarse reemplaza a la actual. Mínimo {MIN_ANCHO_FOTO} px de ancho, hasta 10 MB.</p>
            </div>
            <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegir} />
            <input ref={galeriaRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={elegir} />

            {archivo && previa ? (
                <div className="overflow-hidden rounded-xl border border-border">
                    {/* eslint-disable-next-line no-restricted-syntax -- la imagen entera abre el visor; Button no envuelve media */}
                    <button type="button" onClick={() => setVerGrande(true)} title="Ver con zoom" className="relative block w-full cursor-zoom-in bg-muted/40">
                        <img src={previa} alt="Vista previa de la foto elegida" className="block max-h-72 w-full object-contain" />
                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-1 text-micro font-semibold text-brand-dark shadow-sm">
                            <Maximize2 className="h-3 w-3" /> Ver con zoom
                        </span>
                    </button>
                    <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                        <span className="min-w-0 flex-1 text-xs text-muted-foreground tabular-nums">
                            {medidas ? `${medidas.ancho}×${medidas.alto} px · ` : ''}{formatearTamano(archivo.size)}
                        </span>
                        <IconButton icon={<X className="h-4 w-4" />} variant="danger" aria-label="Quitar la foto elegida" onClick={quitar} />
                    </div>
                </div>
            ) : (
                <div
                    onDragEnter={e => { e.preventDefault(); setArrastrando(true); }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!arrastrando) setArrastrando(true); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false); }}
                    onDrop={soltar}
                    className={cn('flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-3 py-5 text-center transition-colors',
                        arrastrando ? 'border-brand-primary bg-brand-primary/5' : 'border-border bg-muted/40')}>
                    <span className="flex flex-col items-center gap-1">
                        <ImagePlus className={cn('h-6 w-6', arrastrando ? 'text-brand-primary' : 'text-muted-foreground')} />
                        <span className="text-sm font-semibold text-brand-dark">{arrastrando ? 'Suéltala aquí' : 'Arrastra aquí la foto'}</span>
                        <span className="text-caption text-muted-foreground">o elígela con los botones</span>
                    </span>
                    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                        <Button variant="glass" size="sm" className="h-11 md:h-9" onClick={() => camaraRef.current?.click()} disabled={preparando} isLoading={preparando}
                            leftIcon={<Camera className="h-4 w-4" />}>Tomar foto</Button>
                        <Button variant="glass" size="sm" className="h-11 md:h-9" onClick={() => galeriaRef.current?.click()} disabled={preparando}
                            leftIcon={<ImagePlus className="h-4 w-4" />}>Elegir foto</Button>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-1.5">
                <Input label="Qué se ve en la foto *" value={alt} onChange={e => setAlt(e.target.value)} maxLength={LARGOS.alt}
                    placeholder="Ej.: Fachada del edificio terminado, vista desde la esquina"
                    helperText={`Para quien no puede ver la imagen (entre ${ALT_MIN} y ${LARGOS.alt} letras).`} />
            </div>

            <Casilla checked={confirma} onChange={setConfirma} disabled={!archivo} nota={REGLA_NADIE_RECONOCIBLE}>
                {TEXTO_CONFIRMA_SIN_PERSONAS}
            </Casilla>

            <FormError message={error} />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                {!listo && (
                    <span className="text-xs text-muted-foreground sm:mr-auto">
                        {!archivo ? 'Elige una foto.' : !altOk ? 'Escribe qué se ve en la foto.' : 'Marca la confirmación.'}
                    </span>
                )}
                <Button onClick={subir} isLoading={subiendo} disabled={!listo} leftIcon={<Upload className="h-4 w-4" />}>Subir foto</Button>
            </div>

            {verGrande && archivo && previa && (
                <VisorAdjunto url={previa} mime={archivo.type} nombre="Foto elegida" size={archivo.size}
                    descripcion="Todavía no se sube: revisa que no se reconozca a nadie" onClose={() => setVerGrande(false)} />
            )}
        </section>
    );
};

export default FotoPortada;
