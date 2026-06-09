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

function escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Logo LOLS (réplica del componente Logo, verde oficial) — inline SVG para el membrete.
const LOGO_SVG =
    `<svg width="160" height="71" viewBox="0 0 540 240" xmlns="http://www.w3.org/2000/svg"><g fill="#029E4D">` +
    `<rect x="20" y="20" width="500" height="12"/><rect x="20" y="208" width="500" height="12"/>` +
    `<rect x="20" y="48" width="75" height="144"/>` +
    `<rect x="119" y="52" width="77" height="32" fill="transparent" stroke="#029E4D" stroke-width="8"/>` +
    `<rect x="119" y="104" width="77" height="32" fill="transparent" stroke="#029E4D" stroke-width="8"/>` +
    `<rect x="115" y="152" width="85" height="40"/>` +
    `<text x="220" y="134" font-family="Arial, sans-serif" font-weight="700" font-size="115">LOLS</text>` +
    `<rect x="220" y="148" width="300" height="6"/>` +
    `<text x="225" y="192" font-family="Arial, sans-serif" font-weight="700" font-size="42">INGENIERIA</text>` +
    `</g></svg>`;

// Espacios en blanco para completar a mano EN EL WORD (fechas / motivo).
const LINEA = '____________________________';

// ── Plantilla: ACTA DE CONSENTIMIENTO ──
function buildActaHtml(w: ConstanciaWorker): string {
    return (
        `<table width="100%" style="margin-bottom:8pt"><tr>` +
        `<td style="vertical-align:top">${LOGO_SVG}</td>` +
        `<td style="text-align:right;vertical-align:top;font-size:11pt">Santiago, ${LINEA}.</td>` +
        `</tr></table>` +
        `<div style="text-align:center;font-size:14pt;font-weight:bold;margin:8pt 0 18pt">Acta de Consentimiento</div>` +
        `<p style="text-align:left;margin:0 0 2pt"><b>Nombre del Trabajador:</b> ${escapeHtml(nombreDe(w))}</p>` +
        `<p style="text-align:left;margin:0 0 2pt"><b>Rut:</b> ${escapeHtml(w.rut || '')}</p>` +
        `<p style="text-align:left;margin:0 0 2pt"><b>Cargo:</b> ${escapeHtml(w.cargo_nombre || '')}</p>` +
        `<p style="text-align:left;margin:0 0 2pt"><b>Obra:</b> ${escapeHtml(w.obra_nombre || '')}</p>` +
        `<p style="text-align:left;margin:18pt 0 8pt"><u><b>PRESENTE</b></u></p>` +
        `<ol>` +
        `<li>El día ${LINEA}, mi firma quedo registrada en el libro de asistencia de la empresa</li>` +
        `<li>Reconozco que ese día no me presente a laborar</li>` +
        `<li>Declaro que mi firma fue puesta de manera voluntaria.</li>` +
        `<li>Autorizo a mi empresa a registrar esta manifestación como aclaración sobre lo ocurrido</li>` +
        `<li>Declaro que realizo esta firma sin coacción y en pleno uso de mis facultades</li>` +
        `</ol>` +
        `<p style="margin:18pt 0 0">Saluda atentamente.</p>` +
        `<div style="margin-top:64pt;text-align:center">_____________________________<br>Firma del Trabajador</div>`
    );
}

// ── Plantilla: CARTA DE AMONESTACIÓN ──
function buildCartaHtml(w: ConstanciaWorker): string {
    const lineasFalta = '<p>_______________________________________________</p>'.repeat(4);
    return (
        `<table width="100%"><tr>` +
        `<td width="40%" style="vertical-align:top">${LOGO_SVG}</td>` +
        `<td style="text-align:center;vertical-align:top">` +
        `<div style="font-size:14pt;font-weight:bold">CARTA AMONESTACION</div>` +
        `<div style="margin-top:6pt">Fecha: ___/___/______</div>` +
        `</td></tr></table>` +
        `<p style="margin:14pt 0 0"><b>NOMBRE:</b> ${escapeHtml(nombreDe(w))}</p>` +
        `<p style="margin:0"><b>DIVISIÓN:</b> ${escapeHtml(w.obra_nombre || '')}</p>` +
        `<p style="margin:0"><b>CARGO:</b> ${escapeHtml(w.cargo_nombre || '')}</p>` +
        `<p style="margin:8pt 0 0">Señor: ${escapeHtml(nombreDe(w))}</p>` +
        `<p style="margin:0">Presente.</p>` +
        `<p style="margin:14pt 0 0">De nuestra consideración:</p>` +
        `<p>Ponemos en su conocimiento, que la Administración de LOLS INGENIERÍA LTDA. Ha determinado sancionarlo con una amonestación escrita.</p>` +
        `<p>La infracción fue cometida por usted el día …………………………………………………………</p>` +
        `<p>La falta es la siguiente:</p>` +
        lineasFalta +
        `<p style="margin-top:14pt">Le recordamos a usted que las infracciones de forma recurrente pueden generar el termino de Contrato.</p>` +
        `<p style="margin-top:10pt">Sin otro particular, Atentamente</p>` +
        `<table width="100%" style="margin-top:54pt"><tr>` +
        `<td width="50%"><b>Empleador</b></td>` +
        `<td width="50%" style="text-align:right"><b>Trabajador.</b></td>` +
        `</tr></table>` +
        `<p style="margin-top:20pt">c.c.: Inspección del Trabajo<br>` +
        `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Archivo de personal<br>` +
        `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Archivo</p>`
    );
}

export const ConstanciaModal: React.FC<Props> = ({ isOpen, onClose, worker }) => {
    const [formato, setFormato] = useState<Formato | null>(null);

    useEffect(() => {
        if (isOpen) setFormato(null);
    }, [isOpen]);

    if (!worker) return null;

    const descargar = () => {
        if (!formato) return;
        const safe = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
        const sufijo = `${safe(worker.apellido_paterno)}_${safe(worker.nombres)}_${hoy()}`;
        if (formato === 'acta') {
            downloadWord(`Acta_Consentimiento_${sufijo}`, buildActaHtml(worker));
        } else {
            downloadWord(`Amonestacion_${sufijo}`, buildCartaHtml(worker));
        }
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

    const opciones: { key: Formato; titulo: string; icon: React.ElementType }[] = [
        { key: 'amonestacion', titulo: 'Carta de Amonestación', icon: FileWarning },
        { key: 'acta', titulo: 'Acta de Consentimiento', icon: FileCheck2 },
    ];

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
                    {opciones.map(({ key, titulo, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setFormato(key)}
                            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-background hover:bg-muted border border-border transition-colors text-left"
                        >
                            <div className="h-10 w-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
                                <Icon className="h-5 w-5 text-brand-primary" />
                            </div>
                            <span className="flex-1 text-sm font-semibold text-brand-dark">{titulo}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                    ))}
                </div>
            ) : (
                /* Paso 2: solo datos autocompletados + descargar (fechas y motivo se llenan en el Word) */
                <div className="space-y-4">
                    <div className="bg-background rounded-2xl p-4 border border-border text-sm">
                        <p className="font-bold text-brand-dark">{nombreDe(worker)}</p>
                        <div className="mt-1 grid grid-cols-1 gap-0.5 text-xs text-muted-foreground">
                            {worker.rut && <span>RUT: {worker.rut}</span>}
                            {worker.cargo_nombre && <span>Cargo: {worker.cargo_nombre}</span>}
                            {worker.obra_nombre && <span>Obra: {worker.obra_nombre}</span>}
                            {worker.empresa_nombre && <span>Empresa: {worker.empresa_nombre}</span>}
                        </div>
                        <p className="text-[11px] text-brand-primary font-semibold mt-2">Estos datos se autocompletan en el documento.</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        El documento <strong>{formato === 'acta' ? 'Acta de Consentimiento' : 'Carta de Amonestación'}</strong> se descargará en Word con los datos del trabajador ya puestos.
                        Las <strong>fechas y el motivo</strong> los completas directamente en el Word.
                    </p>
                </div>
            )}
        </Modal>
    );
};
