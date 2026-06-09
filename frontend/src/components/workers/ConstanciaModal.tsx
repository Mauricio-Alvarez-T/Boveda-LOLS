import React, { useEffect, useState } from 'react';
import { FileWarning, FileCheck2, ArrowLeft, Download, Printer, ChevronRight } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { downloadWord, printDoc } from '../../utils/downloadWord';

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

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLargaDel = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return `${String(d.getDate()).padStart(2, '0')} de ${MESES[d.getMonth()]} del ${d.getFullYear()}`;
};
const fechaCorta = (iso: string) => {
    if (!iso) return '___/___/______';
    const d = new Date(iso + 'T12:00:00');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Motivos predefinidos para la Carta de Amonestación (ajustables).
const MOTIVOS = [
    'Atraso reiterado en el ingreso',
    'Inasistencia injustificada',
    'Abandono de funciones durante la jornada',
    'No uso de elementos de protección personal (EPP)',
    'Incumplimiento de normas de seguridad',
    'Incumplimiento de instrucciones de la jefatura',
    'Uso indebido de equipos o herramientas',
    'Conducta inapropiada en el lugar de trabajo',
];
const OTRO = 'Otro (completar en el documento)';

function escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const LINEA = '____________________________';

// Membrete LOLS como TEXTO (el SVG no renderiza bien en Word). Si más adelante
// se quiere el logo gráfico, se incrusta un PNG en base64.
const LOGO_HEADER = `<div style="font-size:13pt;font-weight:bold;color:#029E4D">LOLS INGENIERÍA</div>`;

// ── Plantilla: ACTA DE CONSENTIMIENTO ──
function buildActaHtml(w: ConstanciaWorker, f: { fechaActa: string; fechaHecho: string }): string {
    const enc = `Santiago, ${f.fechaActa ? fechaLargaDel(f.fechaActa) : LINEA}.`;
    const dia = f.fechaHecho ? fechaLargaDel(f.fechaHecho) : LINEA;
    return (
        `<table width="100%" style="margin-bottom:8pt"><tr>` +
        `<td style="vertical-align:top">${LOGO_HEADER}</td>` +
        `<td style="text-align:right;vertical-align:top;font-size:11pt">${escapeHtml(enc)}</td>` +
        `</tr></table>` +
        `<div style="text-align:center;font-size:14pt;font-weight:bold;margin:8pt 0 18pt">Acta de Consentimiento</div>` +
        `<p style="text-align:left;margin:0 0 2pt"><b>Nombre del Trabajador:</b> ${escapeHtml(nombreDe(w))}</p>` +
        `<p style="text-align:left;margin:0 0 2pt"><b>Rut:</b> ${escapeHtml(w.rut || '')}</p>` +
        `<p style="text-align:left;margin:0 0 2pt"><b>Cargo:</b> ${escapeHtml(w.cargo_nombre || '')}</p>` +
        `<p style="text-align:left;margin:0 0 2pt"><b>Obra:</b> ${escapeHtml(w.obra_nombre || '')}</p>` +
        `<p style="text-align:left;margin:18pt 0 8pt"><u><b>PRESENTE</b></u></p>` +
        `<ol>` +
        `<li>El día ${escapeHtml(dia)}, mi firma quedo registrada en el libro de asistencia de la empresa</li>` +
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
function buildCartaHtml(w: ConstanciaWorker, f: { fechaCarta: string; fechaInfraccion: string; motivo: string }): string {
    const fInfra = f.fechaInfraccion ? fechaLargaDel(f.fechaInfraccion) : '…………………………………………………………';
    const motivoValido = f.motivo && f.motivo !== OTRO;
    const faltaHtml = motivoValido
        ? `<p>${escapeHtml(f.motivo)}</p>`
        : '<p>_______________________________________________</p>'.repeat(4);
    return (
        `<table width="100%"><tr>` +
        `<td width="40%" style="vertical-align:top">${LOGO_HEADER}</td>` +
        `<td style="text-align:center;vertical-align:top">` +
        `<div style="font-size:14pt;font-weight:bold">CARTA AMONESTACION</div>` +
        `<div style="margin-top:6pt">Fecha: ${escapeHtml(fechaCorta(f.fechaCarta))}</div>` +
        `</td></tr></table>` +
        `<p style="margin:14pt 0 0;text-align:left"><b>NOMBRE:</b> ${escapeHtml(nombreDe(w))}</p>` +
        `<p style="margin:0;text-align:left"><b>SUCURSAL:</b> ${escapeHtml(w.obra_nombre || '')}</p>` +
        `<p style="margin:0;text-align:left"><b>CARGO:</b> ${escapeHtml(w.cargo_nombre || '')}</p>` +
        `<p style="margin:0;text-align:left"><b>RUT:</b> ${escapeHtml(w.rut || '')}</p>` +
        `<p style="margin:8pt 0 0;text-align:left">Señor: ${escapeHtml(nombreDe(w))}</p>` +
        `<p style="margin:0;text-align:left">Presente.</p>` +
        `<p style="margin:14pt 0 0">De nuestra consideración:</p>` +
        `<p>Ponemos en su conocimiento, que la Administración de LOLS INGENIERÍA LTDA. Ha determinado sancionarlo con una amonestación escrita.</p>` +
        `<p>La infracción fue cometida por usted el día ${escapeHtml(fInfra)}</p>` +
        `<p>La falta es la siguiente:</p>` +
        faltaHtml +
        `<p style="margin-top:14pt">Le recordamos a usted que las infracciones de forma recurrente pueden generar el termino de Contrato.</p>` +
        `<p style="margin-top:10pt">Sin otro particular, Atentamente</p>` +
        `<table width="100%" style="margin-top:54pt"><tr>` +
        `<td width="50%"><b>Empleador</b></td>` +
        `<td width="50%" style="text-align:right"><b>Trabajador.</b></td>` +
        `</tr></table>` +
        `<p style="margin-top:20pt;text-align:left">c.c.: Inspección del Trabajo<br>` +
        `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Archivo de personal<br>` +
        `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Archivo</p>`
    );
}

const inputCls = "w-full h-11 px-3 rounded-xl border border-border bg-card text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/40";

export const ConstanciaModal: React.FC<Props> = ({ isOpen, onClose, worker }) => {
    const [formato, setFormato] = useState<Formato | null>(null);
    const [fechaDoc, setFechaDoc] = useState(hoy());   // fecha del acta / de la carta
    const [fechaHecho, setFechaHecho] = useState('');  // acta: día punto 1 / carta: día de la infracción
    const [motivo, setMotivo] = useState('');          // solo carta (select)

    useEffect(() => {
        if (isOpen) { setFormato(null); setFechaDoc(hoy()); setFechaHecho(''); setMotivo(''); }
    }, [isOpen]);

    if (!worker) return null;

    const buildHtml = (): string =>
        formato === 'acta'
            ? buildActaHtml(worker, { fechaActa: fechaDoc, fechaHecho })
            : buildCartaHtml(worker, { fechaCarta: fechaDoc, fechaInfraccion: fechaHecho, motivo });

    const nombreArchivo = () => {
        const safe = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
        const base = formato === 'acta' ? 'Acta_Consentimiento' : 'Amonestacion';
        return `${base}_${safe(worker.apellido_paterno)}_${safe(worker.nombres)}_${hoy()}`;
    };

    const descargar = () => { if (formato) downloadWord(nombreArchivo(), buildHtml()); };
    const imprimir = () => { if (formato) printDoc(buildHtml(), formato === 'acta' ? 'Acta de Consentimiento' : 'Carta de Amonestación'); };

    // Acciones arriba, al lado de la X (solo ícono + tooltip). Solo en el paso 2.
    const headerAction = formato ? (
        <div className="flex items-center gap-1">
            <button onClick={() => setFormato(null)} title="Volver"
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-brand-dark hover:bg-background transition-colors">
                <ArrowLeft className="h-4 w-4" />
            </button>
            <button onClick={imprimir} title="Imprimir"
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-brand-primary hover:bg-background transition-colors">
                <Printer className="h-4 w-4" />
            </button>
            <button onClick={descargar} title="Descargar Word"
                className="h-8 w-8 rounded-full flex items-center justify-center bg-brand-primary text-white hover:bg-[#027A3B] transition-colors shadow-sm">
                <Download className="h-4 w-4" />
            </button>
        </div>
    ) : undefined;

    const opciones: { key: Formato; titulo: string; icon: React.ElementType }[] = [
        { key: 'amonestacion', titulo: 'Carta de Amonestación', icon: FileWarning },
        { key: 'acta', titulo: 'Acta de Consentimiento', icon: FileCheck2 },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Constancia" size="md" headerAction={headerAction}>
            {!formato ? (
                /* Paso 1: Motivo (elegir tipo) */
                <div className="space-y-3">
                    <div className="bg-background rounded-2xl p-3 border border-border">
                        <p className="text-sm font-bold text-brand-dark">{nombreDe(worker)}</p>
                        <p className="text-xs text-muted-foreground">{worker.rut}{worker.cargo_nombre ? ` · ${worker.cargo_nombre}` : ''}</p>
                    </div>
                    <p className="text-sm font-semibold text-brand-dark">Motivo</p>
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
                /* Paso 2: formulario con opciones (sin escribir) */
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

                    {formato === 'acta' ? (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-brand-dark mb-1">Fecha del acta</label>
                                <input type="date" value={fechaDoc} onChange={(e) => setFechaDoc(e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-brand-dark mb-1">Día del hecho</label>
                                <input type="date" value={fechaHecho} onChange={(e) => setFechaHecho(e.target.value)} className={inputCls} />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-brand-dark mb-1">Fecha de la carta</label>
                                    <input type="date" value={fechaDoc} onChange={(e) => setFechaDoc(e.target.value)} className={inputCls} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-brand-dark mb-1">Día de la infracción</label>
                                    <input type="date" value={fechaHecho} onChange={(e) => setFechaHecho(e.target.value)} className={inputCls} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-brand-dark mb-1">Motivo de la falta</label>
                                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls}>
                                    <option value="">Selecciona un motivo…</option>
                                    {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                                    <option value={OTRO}>{OTRO}</option>
                                </select>
                            </div>
                        </>
                    )}

                    <p className="text-[11px] text-muted-foreground">
                        Completa con las opciones. Lo que elijas saldrá en el documento; lo que dejes sin elegir queda como línea en blanco para llenar a mano.
                    </p>
                </div>
            )}
        </Modal>
    );
};
