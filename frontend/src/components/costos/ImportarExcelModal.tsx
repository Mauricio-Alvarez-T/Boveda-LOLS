import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, Download, AlertTriangle, Loader2, Check } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormError } from '../ui/FormError';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { ETIQUETA, mensajeError } from './costosConfig';
import { Opciones, Aviso } from './piezas';
import { leerPresupuestoExcel, descargarPlantilla, type ResultadoLectura } from './excelPresupuesto';

interface Props {
    obraId: number;
    /** Partidas que ya tiene el presupuesto (si hay, se elige agregar o reemplazar). */
    partidasActuales: number;
    onClose: () => void;
    onImportado: () => void;
}

const MODOS = { agregar: 'Agregar a las actuales', reemplazar: 'Reemplazar todo' } as const;

const NOMBRE_CAMPO: Record<string, string> = {
    capitulo: 'Capítulo', codigo: 'Ítem', descripcion: 'Descripción', unidad: 'Unidad', cantidad: 'Cantidad', precio_unitario: 'Precio unitario',
};

/**
 * Importar el itemizado desde el Excel que ya usan. Se lee en el navegador (el
 * archivo no se sube): se muestra lo que se entendió ANTES de guardar, para que
 * nadie importe a ciegas un Excel con las columnas corridas.
 */
export const ImportarExcelModal: React.FC<Props> = ({ obraId, partidasActuales, onClose, onImportado }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [archivo, setArchivo] = useState<File | null>(null);
    const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
    const [leyendo, setLeyendo] = useState(false);
    const [modo, setModo] = useState<'agregar' | 'reemplazar'>('agregar');
    const [importando, setImportando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resumen = useMemo(() => {
        if (!lectura) return null;
        const caps = new Map<string, { n: number; total: number }>();
        let total = 0, sinPrecio = 0;
        for (const f of lectura.filas) {
            const t = Math.round(f.cantidad * f.precio_unitario);
            total += t;
            if (!f.precio_unitario || !f.cantidad) sinPrecio++;
            const c = caps.get(f.capitulo) || { n: 0, total: 0 };
            c.n++; c.total += t;
            caps.set(f.capitulo, c);
        }
        return { total, sinPrecio, capitulos: [...caps.entries()].map(([nombre, v]) => ({ nombre, ...v })) };
    }, [lectura]);

    const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setArchivo(f);
        setLectura(null);
        setError(null);
        if (!/\.xlsx$/i.test(f.name)) {
            setError(/\.xls$/i.test(f.name)
                ? 'Es un Excel antiguo (.xls). Ábrelo en Excel y usa "Guardar como" → "Libro de Excel (.xlsx)".'
                : 'Tiene que ser un archivo de Excel (.xlsx).');
            return;
        }
        setLeyendo(true);
        try {
            setLectura(await leerPresupuestoExcel(f));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo leer el Excel.');
        } finally {
            setLeyendo(false);
        }
    };

    const importar = async () => {
        if (!lectura) return;
        if (modo === 'reemplazar' && !window.confirm(`Se borran las ${partidasActuales} partidas actuales y quedan las ${lectura.filas.length} del Excel. ¿Seguir?`)) return;
        setImportando(true);
        setError(null);
        try {
            const res = await api.post<{ data: { importadas: number } }>(`/costos/obras/${obraId}/partidas/importar`, {
                modo: partidasActuales ? modo : 'agregar',
                partidas: lectura.filas,
            });
            toast.success(`${fmtNumber(res.data.data.importadas)} partidas importadas`);
            onImportado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo importar el presupuesto.'));
        } finally {
            setImportando(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="lg"
            icon={FileSpreadsheet}
            title="Importar presupuesto desde Excel"
            description="El archivo se lee en tu computador: antes de guardar ves lo que se entendió."
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    <Button variant="link" size="sm" onClick={() => { descargarPlantilla().catch(() => toast.error('No se pudo armar la plantilla')); }}
                        leftIcon={<Download className="h-4 w-4" />}>
                        Plantilla
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button onClick={importar} disabled={!lectura || importando} isLoading={importando}
                            leftIcon={!importando ? <Check className="h-4 w-4" /> : undefined}>
                            {lectura ? `Importar ${fmtNumber(lectura.filas.length)} partidas` : 'Importar'}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={elegir} />

                {/* eslint-disable-next-line no-restricted-syntax -- zona grande para elegir el archivo (ícono, título y ayuda); Button no soporta este layout */}
                <button type="button" onClick={() => inputRef.current?.click()} disabled={leyendo}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-card px-4 py-6 text-center transition-colors hover:border-brand-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                    {leyendo ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                    <span className="text-sm font-semibold text-brand-dark">{archivo ? archivo.name : 'Elegir el Excel del presupuesto'}</span>
                    <span className="text-caption text-muted-foreground">
                        {leyendo ? 'Leyendo…' : 'Con columnas como Ítem, Descripción, Unidad, Cantidad y Precio unitario. Los títulos de capítulo se reconocen solos.'}
                    </span>
                </button>

                {lectura && resumen && (
                    <>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                                <div className="text-caption text-muted-foreground">Partidas</div>
                                <div className="text-base font-bold text-brand-dark tabular-nums">{fmtNumber(lectura.filas.length)}</div>
                            </div>
                            <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                                <div className="text-caption text-muted-foreground">Capítulos</div>
                                <div className="text-base font-bold text-brand-dark tabular-nums">{fmtNumber(resumen.capitulos.length)}</div>
                            </div>
                            <div className="min-w-0 rounded-xl bg-muted/50 px-3 py-2.5">
                                <div className="text-caption text-muted-foreground">Costo directo</div>
                                <div className="text-base font-bold text-brand-dark tabular-nums break-all">{fmtMoney(resumen.total) || '$0'}</div>
                            </div>
                        </div>

                        <p className="text-caption text-muted-foreground">
                            Hoja «{lectura.hoja}». Columnas: {Object.entries(lectura.columnas).map(([k, v]) => `${NOMBRE_CAMPO[k] || k} = «${v}»`).join(' · ')}.
                            {lectura.descartadas > 0 && ` Se saltaron ${fmtNumber(lectura.descartadas)} filas vacías o de totales.`}
                        </p>

                        {lectura.advertencias.map(a => <Aviso key={a} icon={AlertTriangle}>{a}</Aviso>)}
                        {resumen.sinPrecio > 0 && (
                            <Aviso icon={AlertTriangle}>{fmtNumber(resumen.sinPrecio)} partida{resumen.sinPrecio === 1 ? '' : 's'} sin cantidad o sin precio: quedan en $0 y se completan después.</Aviso>
                        )}

                        {/* Muestra de lo que se va a guardar, por capítulo */}
                        <div className="overflow-hidden rounded-xl border border-border">
                            <div className="max-h-72 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-brand-primary text-white">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">Partida</th>
                                            <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Cant.</th>
                                            <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">P. unit.</th>
                                            <th className="px-3 py-2 text-right font-semibold">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resumen.capitulos.map(c => (
                                            <React.Fragment key={c.nombre}>
                                                <tr className="bg-muted/60">
                                                    <td className="px-3 py-1.5 font-semibold text-brand-dark" colSpan={2}>{c.nombre} <span className="font-normal text-muted-foreground">· {c.n}</span></td>
                                                    <td className="hidden sm:table-cell" />
                                                    <td className="px-3 py-1.5 text-right font-semibold text-brand-dark tabular-nums">{fmtMoney(c.total) || '$0'}</td>
                                                </tr>
                                                {lectura.filas.filter(f => f.capitulo === c.nombre).slice(0, 6).map((f, i) => (
                                                    <tr key={i} className="border-t border-border">
                                                        <td className="px-3 py-1.5 text-brand-dark">
                                                            {f.codigo && <span className="mr-1.5 text-muted-foreground tabular-nums">{f.codigo}</span>}
                                                            {f.descripcion}
                                                            <span className="block text-caption text-muted-foreground sm:hidden">{fmtNumber(f.cantidad)} {f.unidad || ''} × {fmtMoney(f.precio_unitario) || '$0'}</span>
                                                        </td>
                                                        <td className="hidden px-2 py-1.5 text-right text-muted-foreground tabular-nums sm:table-cell">{fmtNumber(f.cantidad)} {f.unidad || ''}</td>
                                                        <td className="hidden px-2 py-1.5 text-right text-muted-foreground tabular-nums sm:table-cell">{fmtMoney(f.precio_unitario) || '$0'}</td>
                                                        <td className="px-3 py-1.5 text-right text-brand-dark tabular-nums">{fmtMoney(Math.round(f.cantidad * f.precio_unitario)) || '$0'}</td>
                                                    </tr>
                                                ))}
                                                {c.n > 6 && (
                                                    <tr className="border-t border-border"><td colSpan={4} className="px-3 py-1 text-caption text-muted-foreground">… y {c.n - 6} más</td></tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {partidasActuales > 0 && (
                            <div>
                                <span className={ETIQUETA}>Este presupuesto ya tiene {fmtNumber(partidasActuales)} partidas</span>
                                <Opciones etiqueta="Qué hacer con las partidas actuales" valor={modo} opciones={MODOS} onChange={setModo} />
                                <p className="mt-1.5 text-caption text-muted-foreground">
                                    {modo === 'agregar'
                                        ? 'Las del Excel se suman a las que ya están.'
                                        : 'Se borran las actuales. Si alguna tiene gastos asignados, no se deja reemplazar (se perdería a qué partida iba cada factura).'}
                                </p>
                            </div>
                        )}
                    </>
                )}

                <FormError message={error} />
            </div>
        </Modal>
    );
};

export default ImportarExcelModal;
