import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Camera, LifeBuoy, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { BotonDictar } from '../ui/BotonDictar';
import { EVENTO_AVISO_SOPORTE, type DetalleAvisoSoporte } from '../../services/reporteErrores';

/**
 * Lo que ve la persona cuando su app le avisó a Soporte un error (mig 141; services/reporteErrores.ts):
 *   · un aviso corto debajo del error: «Le avisamos a soporte con una foto de esta pantalla» (o sin foto, o «…que te
 *     falta un permiso»), con «Contar qué pasó»;
 *   · la ventana «Cuéntale a soporte qué pasó»: la foto que se mandó (con «Quitar»), el texto (o dictarlo) y Enviar.
 * Va montado una vez en MainLayout. Solo falla, pantalla rota y permiso llegan acá; lo demás no molesta a la persona.
 */

const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';

const textoAviso = (d: DetalleAvisoSoporte) => {
    if (d.categoria === 'permiso') return 'Le avisamos a soporte que te falta un permiso.';
    return d.foto ? 'Le avisamos a soporte con una foto de esta pantalla.' : 'Le avisamos a soporte.';
};

export const AvisoSoporte: React.FC = () => {
    const [abierto, setAbierto] = useState<DetalleAvisoSoporte | null>(null);
    const [texto, setTexto] = useState('');
    const [parcial, setParcial] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [quitando, setQuitando] = useState(false);

    const abrir = useCallback((d: DetalleAvisoSoporte) => {
        setTexto('');
        setParcial('');
        setAbierto(d);
    }, []);

    useEffect(() => {
        const alAvisar = (e: Event) => {
            const d = (e as CustomEvent<DetalleAvisoSoporte>).detail;
            if (!d?.id) return;
            toast(textoAviso(d), {
                icon: d.foto ? <Camera className="h-4 w-4" /> : <LifeBuoy className="h-4 w-4" />,
                duration: 12_000,
                action: { label: 'Contar qué pasó', onClick: () => abrir(d) },
            });
        };
        window.addEventListener(EVENTO_AVISO_SOPORTE, alAvisar);
        return () => window.removeEventListener(EVENTO_AVISO_SOPORTE, alAvisar);
    }, [abrir]);

    const cerrar = () => { if (!enviando) setAbierto(null); };

    const sumarDictado = (frase: string) => setTexto(t => {
        const base = t.replace(/\s+$/, '');
        const nueva = base ? frase : frase.charAt(0).toUpperCase() + frase.slice(1);
        return base ? `${base} ${nueva}` : nueva;
    });

    const quitarFoto = async () => {
        if (!abierto) return;
        setQuitando(true);
        try {
            await api.delete(`/soporte/errores/${abierto.id}/foto`);
            setAbierto({ ...abierto, foto: null });
            toast.success('Listo: la foto se borró.');
        } catch {
            toast.error('No se pudo quitar la foto. Intenta de nuevo.');
        } finally {
            setQuitando(false);
        }
    };

    const enviar = async () => {
        if (!abierto || !texto.trim()) return;
        setEnviando(true);
        try {
            await api.patch(`/soporte/errores/${abierto.id}/descripcion`, { descripcion: texto.trim() });
            setAbierto(null);
            toast.success('Gracias: soporte ya tiene tu mensaje.');
        } catch {
            toast.error('No se pudo enviar. Intenta de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Modal
            isOpen={!!abierto}
            onClose={cerrar}
            title="Cuéntale a soporte qué pasó"
            description="Lo ven solo Marcos y Mauricio"
            icon={LifeBuoy}
            size="md"
            footer={(
                <div className="flex w-full gap-2 sm:justify-end">
                    <Button variant="ghost" className="flex-1 sm:flex-none" onClick={cerrar} disabled={enviando}>Ahora no</Button>
                    <Button className="flex-1 sm:flex-none" onClick={enviar} isLoading={enviando} disabled={!texto.trim()}>Enviar</Button>
                </div>
            )}
        >
            <div className="space-y-4">
                {abierto?.foto ? (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2">
                        <img src={abierto.foto} alt="Foto de la pantalla que se mandó a soporte" className="h-20 w-14 shrink-0 rounded-lg border border-border object-cover object-top" />
                        <div className="min-w-0 flex-1 text-xs">
                            <p className="font-semibold text-foreground">Foto de esta pantalla</p>
                            <p className="text-muted-foreground">Ya se envió. Se borra sola en 30 días.</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={quitarFoto} isLoading={quitando} leftIcon={<Trash2 className="h-3.5 w-3.5" />}>Quitar</Button>
                    </div>
                ) : abierto?.categoria === 'permiso' ? (
                    <p className="text-sm text-muted-foreground">Soporte ya sabe qué permiso te faltó y en qué pantalla.</p>
                ) : null}
                <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <label htmlFor="aviso-soporte-texto" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">¿Qué estabas haciendo?</label>
                        <BotonDictar onTexto={sumarDictado} onParcial={setParcial} />
                    </div>
                    <textarea
                        id="aviso-soporte-texto"
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        rows={4}
                        maxLength={1000}
                        placeholder="Ej.: estaba recibiendo los materiales de la solicitud 41 y al tocar Confirmar salió el error."
                        className={CAMPO}
                    />
                    {parcial && <p className="mt-1.5 text-caption italic text-muted-foreground" aria-live="polite">…{parcial}</p>}
                </div>
            </div>
        </Modal>
    );
};

export default AvisoSoporte;
