import React, { useRef, useState } from 'react';
import { AlertTriangle, DownloadCloud, FileArchive, X } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { FormError } from '../ui/FormError';
import { MarcaEstado } from '../ui/MarcaEstado';
import { Aviso } from '../costos/piezas';
import { formatearTamano } from '../../utils/archivos';
import { ListaObras } from './piezas';
import { TIMEOUT_PUBLICAR_MS, datosError, mensajeError } from './sitioWebConfig';
import type { ModoSitio, ResultadoImportar } from './tipos';

const MAX_ZIP = 40 * 1024 * 1024;

/**
 * «Importar obras del sitio» (plan 4.11, `sitio_web.publicar`): las obras que hoy tiene lols.cl pasan a la Bóveda,
 * con su foto como portada ya aprobada (revisar que nadie sea reconocible) y su texto publicado tal cual. Una vez y sin
 * repetir: las que ya están se saltan. Con el sitio real se leen directo del repositorio; en simulación (staging), de
 * un ZIP del repositorio («Code → Download ZIP» en GitHub). Después de la primera publicación real ya no se importa:
 * el camino es Resincronizar.
 */
export const ImportarObrasModal: React.FC<{ modo: ModoSitio; repo: string; onClose: () => void; onImportado: () => void }> = ({ modo, repo, onClose, onImportado }) => {
    const archivoRef = useRef<HTMLInputElement>(null);
    const [zip, setZip] = useState<File | null>(null);
    const [importando, setImportando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [problemas, setProblemas] = useState<string[]>([]);
    const [resultado, setResultado] = useState<ResultadoImportar | null>(null);
    const simulacion = modo !== 'publicar';

    const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setError(null);
        if (!/\.zip$/i.test(f.name)) { setError('Tiene que ser un archivo .zip del repositorio lols.cl.'); return; }
        if (f.size > MAX_ZIP) { setError('El ZIP pasa de 40 MB: usa el de GitHub (Code → Download ZIP, pesa unos 15 MB) o comprime solo las carpetas src/content/obras y public/proyectos.'); return; }
        setZip(f);
    };

    const importar = async () => {
        setImportando(true);
        setError(null);
        setProblemas([]);
        try {
            // Con el sitio real no va archivo (el servidor rechaza un ZIP: lee el repositorio).
            let cuerpo: FormData | Record<string, never> = {};
            if (simulacion && zip) {
                cuerpo = new FormData();
                cuerpo.append('paquete', zip, 'lols-cl.zip');
            }
            const res = await api.post<{ data: ResultadoImportar }>('/sitio-web/publicaciones/importar', cuerpo, { timeout: TIMEOUT_PUBLICAR_MS });
            setResultado(res.data.data);
            onImportado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudieron importar las obras.'));
            const p = datosError<string[]>(e, 'problemas');
            if (Array.isArray(p)) setProblemas(p);
        } finally {
            setImportando(false);
        }
    };

    return (
        <Modal isOpen onClose={importando ? () => { /* espera la respuesta */ } : onClose} size="md" icon={DownloadCloud}
            title="Importar obras del sitio"
            description={simulacion ? 'Simulación: desde un ZIP del repositorio' : `Desde ${repo}`}
            footer={resultado ? (
                <div className="flex w-full justify-end"><Button onClick={onClose}>Listo</Button></div>
            ) : (
                <div className="flex w-full justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={importando}>Cancelar</Button>
                    <Button onClick={importar} isLoading={importando} disabled={simulacion && !zip} leftIcon={<DownloadCloud className="h-4 w-4" />}>Importar</Button>
                </div>
            )}>
            {resultado ? (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <MarcaEstado estado="listo" tamano="md" />
                        <div>
                            <p className="text-base font-semibold text-brand-dark">
                                {resultado.importadas.length ? `${resultado.importadas.length} obra${resultado.importadas.length === 1 ? '' : 's'} importada${resultado.importadas.length === 1 ? '' : 's'}` : 'No había obras nuevas'}
                            </p>
                            {resultado.ya_estaban > 0 && <p className="text-sm text-muted-foreground">{resultado.ya_estaban} ya estaban en la Bóveda y no se tocaron.</p>}
                        </div>
                    </div>
                    {resultado.importadas.length > 0 && (
                        <Aviso icon={AlertTriangle}>
                            Sus fotos quedaron como portada aprobada porque ya estaban publicadas: <strong>revisa en cada obra que nadie sea reconocible</strong>.
                        </Aviso>
                    )}
                    {resultado.avisos.length > 0 && (
                        <Aviso icon={AlertTriangle}><ul className="list-disc pl-4">{resultado.avisos.map(a => <li key={a}>{a}</li>)}</ul></Aviso>
                    )}
                    <ListaObras titulo="Importadas" obras={resultado.importadas} />
                </div>
            ) : (
                <div className="flex flex-col gap-4 text-sm text-brand-dark">
                    <p>
                        Trae a la Bóveda las obras que hoy muestra el sitio, con su texto tal cual y su foto como portada. Se hace una vez:
                        las que ya están aquí no se repiten. Después, las obras se editan solo en la Bóveda.
                    </p>
                    {simulacion ? (
                        <div className="flex flex-col gap-2">
                            <p className="text-muted-foreground">
                                Este entorno no lee el repositorio: descarga el ZIP de <strong>{repo}</strong> en GitHub («Code → Download ZIP») y súbelo aquí.
                                Solo se leen las obras y sus fotos.
                            </p>
                            <input ref={archivoRef} type="file" accept=".zip,application/zip" className="hidden" onChange={elegir} />
                            {zip ? (
                                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                                    <FileArchive className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate text-sm">{zip.name}</span>
                                    <span className="text-caption text-muted-foreground tabular-nums">{formatearTamano(zip.size)}</span>
                                    <IconButton icon={<X className="h-4 w-4" />} variant="danger" aria-label="Quitar el ZIP" onClick={() => setZip(null)} disabled={importando} />
                                </div>
                            ) : (
                                <Button variant="glass" onClick={() => archivoRef.current?.click()} leftIcon={<FileArchive className="h-4 w-4" />} className="self-start">
                                    Elegir el ZIP
                                </Button>
                            )}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">Se leen directo de la rama principal del repositorio. Puede tardar un minuto.</p>
                    )}
                    <FormError message={error} />
                    {problemas.length > 0 && (
                        <ul className="list-disc pl-5 text-xs text-muted-foreground">{problemas.map(p => <li key={p}>{p}</li>)}</ul>
                    )}
                </div>
            )}
        </Modal>
    );
};

export default ImportarObrasModal;
