import React, { useEffect, useState } from 'react';
import { FileWarning, FileCheck2, ArrowLeft, Download, ChevronRight } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { downloadWord } from '../../utils/downloadWord';

interface ConstanciaWorker {
    id: number;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
    rut?: string | null;
    cargo_nombre?: string | null;
    obra_nombre?: string | null;
    empresa_nombre?: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: ConstanciaWorker | null;
}

type Formato = 'amonestacion' | 'acta';

const hoy = () => new Date().toISOString().split('T')[0];
const nombreDe = (w: ConstanciaWorker) =>
    `${w.apellido_paterno} ${w.apellido_materno || ''} ${w.nombres}`.replace(/\s+/g, ' ').trim();

const FORMATOS: Record<Formato, { titulo: string; icon: React.ElementType; cuerpoBase: string }> = {
    amonestacion: {
        titulo: 'Carta de Amonestación',
        icon: FileWarning,
        // ⚠️ Texto PROVISIONAL — se reemplaza con la plantilla real del usuario.
        cuerpoBase:
            'Por medio de la presente, la empresa deja constancia y amonesta formalmente al trabajador individualizado, por los siguientes hechos: [describir el motivo].\n\n' +
            'Se le recuerda que el cumplimiento de sus obligaciones es fundamental, y que la reiteración de esta conducta podrá dar lugar a las medidas que correspondan conforme al Código del Trabajo y al Reglamento Interno de la empresa.',
    },
    acta: {
        titulo: 'Acta de Consentimiento',
        icon: FileCheck2,
        cuerpoBase:
            'Por medio de la presente, el trabajador individualizado declara conocer y aceptar lo siguiente: [describir].\n\n' +
            'Firma este documento en señal de aceptación y conformidad con lo expuesto.',
    },
};

const fmtFechaLarga = (iso: string) => {
    try {
        const d = new Date(iso + 'T12:00:00');
        return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
};

export const ConstanciaModal: React.FC<Props> = ({ isOpen, onClose, worker }) => {
    const [formato, setFormato] = useState<Formato | null>(null);
    const [lugar, setLugar] = useState('');
    const [fecha, setFecha] = useState(hoy());
    const [cuerpo, setCuerpo] = useState('');

    useEffect(() => {
        if (isOpen) { setFormato(null); setLugar(''); setFecha(hoy()); setCuerpo(''); }
    }, [isOpen]);

    if (!worker) return null;

    const elegir = (f: Formato) => { setFormato(f); setCuerpo(FORMATOS[f].cuerpoBase); };

    const descargar = () => {
        if (!formato) return;
        const cfg = FORMATOS[formato];
        const nombre = nombreDe(worker);
        const cabeceraFecha = `${lugar ? lugar + ', ' : ''}${fmtFechaLarga(fecha)}`;
        const parrafos = cuerpo.split(/\n+/).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('');

        const html =
            (worker.empresa_nombre ? `<h1>${escapeHtml(worker.empresa_nombre)}</h1>` : '') +
            `<h2>${cfg.titulo.toUpperCase()}</h2>` +
            `<p style="text-align:right">${escapeHtml(cabeceraFecha)}</p>` +
            `<table class="datos"><tbody>` +
            `<tr><td><b>Trabajador:</b></td><td>${escapeHtml(nombre)}</td></tr>` +
            `<tr><td><b>RUT:</b></td><td>${escapeHtml(worker.rut || '')}</td></tr>` +
            `<tr><td><b>Cargo:</b></td><td>${escapeHtml(worker.cargo_nombre || '')}</td></tr>` +
            `<tr><td><b>Obra / Faena:</b></td><td>${escapeHtml(worker.obra_nombre || '')}</td></tr>` +
            `</tbody></table>` +
            parrafos +
            `<table class="firmas" width="100%"><tbody><tr>` +
            `<td width="45%">Firma del Trabajador</td><td width="10%"></td>` +
            `<td width="45%">Representante de la Empresa</td>` +
            `</tr></tbody></table>`;

        const safe = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
        const base = formato === 'amonestacion' ? 'Amonestacion' : 'Acta_Consentimiento';
        downloadWord(`${base}_${safe(worker.apellido_paterno)}_${safe(worker.nombres)}_${fecha}`, html);
    };

    const footer = formato ? (
        <>
            <Button variant="ghost" onClick={() => setFormato(null)} leftIcon={<ArrowLeft className="h-4 w-4" />} className="w-full sm:w-auto">
                Volver
            </Button>
            <Button onClick={descargar} leftIcon={<Download className="h-4 w-4" />} className="w-full sm:w-auto">
                Descargar Word
            </Button>
        </>
    ) : undefined;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Constancia" size="md" footer={footer}>
            {!formato ? (
                /* Paso 1: elegir formato */
                <div className="space-y-3">
                    <div className="bg-background rounded-2xl p-3 border border-border">
                        <p className="text-sm font-bold text-brand-dark">{nombreDe(worker)}</p>
                        <p className="text-xs text-muted-foreground">{worker.rut}{worker.cargo_nombre ? ` · ${worker.cargo_nombre}` : ''}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">Elige el formato a generar:</p>
                    {(Object.keys(FORMATOS) as Formato[]).map(f => {
                        const Icon = FORMATOS[f].icon;
                        return (
                            <button
                                key={f}
                                onClick={() => elegir(f)}
                                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-background hover:bg-muted border border-border transition-colors text-left"
                            >
                                <div className="h-10 w-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
                                    <Icon className="h-5 w-5 text-brand-primary" />
                                </div>
                                <span className="flex-1 text-sm font-semibold text-brand-dark">{FORMATOS[f].titulo}</span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            </button>
                        );
                    })}
                </div>
            ) : (
                /* Paso 2: completar y descargar */
                <div className="space-y-4">
                    {/* Datos autocompletados del trabajador */}
                    <div className="bg-background rounded-2xl p-4 border border-border text-sm">
                        <p className="font-bold text-brand-dark">{nombreDe(worker)}</p>
                        <div className="mt-1 grid grid-cols-1 gap-0.5 text-xs text-muted-foreground">
                            {worker.rut && <span>RUT: {worker.rut}</span>}
                            {worker.cargo_nombre && <span>Cargo: {worker.cargo_nombre}</span>}
                            {worker.obra_nombre && <span>Obra: {worker.obra_nombre}</span>}
                            {worker.empresa_nombre && <span>Empresa: {worker.empresa_nombre}</span>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-brand-dark mb-1">Lugar</label>
                            <input
                                type="text"
                                value={lugar}
                                onChange={(e) => setLugar(e.target.value)}
                                placeholder="Ej: Santiago"
                                className="w-full h-11 px-3 rounded-xl border border-border bg-card text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-brand-dark mb-1">Fecha</label>
                            <input
                                type="date"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className="w-full h-11 px-3 rounded-xl border border-border bg-card text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-brand-dark mb-1">Contenido</label>
                        <textarea
                            value={cuerpo}
                            onChange={(e) => setCuerpo(e.target.value)}
                            rows={10}
                            className="w-full p-3 rounded-xl border border-border bg-card text-brand-dark text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Texto provisional — se reemplazará con tu plantilla oficial. Al descargar, los datos del trabajador van autocompletados arriba.
                        </p>
                    </div>
                </div>
            )}
        </Modal>
    );
};

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
