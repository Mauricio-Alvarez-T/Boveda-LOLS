import React, { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';

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

// Motivos predefinidos (ajustables a la lista oficial del usuario).
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

// Membrete LOLS como TEXTO (el SVG no renderiza bien en Word). Para el logo
// gráfico se puede incrustar un PNG en base64 cuando esté disponible.
const LOGO_HEADER = `<div style="font-size:13pt;font-weight:bold;color:#029E4D">LOLS INGENIERÍA</div>`;

// ── Plantilla única: CARTA DE AMONESTACIÓN ──
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
    const [fechaCarta, setFechaCarta] = useState(hoy());
    const [fechaInfraccion, setFechaInfraccion] = useState('');
    const [motivo, setMotivo] = useState('');

    useEffect(() => {
        if (isOpen) { setFechaCarta(hoy()); setFechaInfraccion(''); setMotivo(''); }
    }, [isOpen]);

    if (!worker) return null;

    const html = () => buildCartaHtml(worker, { fechaCarta, fechaInfraccion, motivo });
    const nombreArchivo = () => {
        const safe = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
        return `Amonestacion_${safe(worker.apellido_paterno)}_${safe(worker.nombres)}_${hoy()}`;
    };
    const descargar = () => downloadWord(nombreArchivo(), html());
    const imprimir = () => printDoc(html(), 'Carta de Amonestación');

    // Acciones arriba, al lado de la X (solo ícono + tooltip).
    const headerAction = (
        <div className="flex items-center gap-1">
            <button onClick={imprimir} title="Imprimir"
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-brand-primary hover:bg-background transition-colors">
                <Printer className="h-4 w-4" />
            </button>
            <button onClick={descargar} title="Descargar Word"
                className="h-8 w-8 rounded-full flex items-center justify-center bg-brand-primary text-white hover:bg-[#027A3B] transition-colors shadow-sm">
                <Download className="h-4 w-4" />
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Carta de Amonestación" size="md" headerAction={headerAction}>
            <div className="space-y-4">
                {/* Datos autocompletados del trabajador */}
                <div className="bg-background rounded-2xl p-4 border border-border text-sm">
                    <p className="font-bold text-brand-dark">{nombreDe(worker)}</p>
                    <div className="mt-1 grid grid-cols-1 gap-0.5 text-xs text-muted-foreground">
                        {worker.rut && <span>RUT: {worker.rut}</span>}
                        {worker.cargo_nombre && <span>Cargo: {worker.cargo_nombre}</span>}
                        {worker.obra_nombre && <span>Sucursal: {worker.obra_nombre}</span>}
                        {worker.empresa_nombre && <span>Empresa: {worker.empresa_nombre}</span>}
                    </div>
                    <p className="text-[11px] text-brand-primary font-semibold mt-2">Estos datos se autocompletan en el documento.</p>
                </div>

                {/* Formulario con opciones (sin escribir) */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-brand-dark mb-1">Fecha de la carta</label>
                        <input type="date" value={fechaCarta} onChange={(e) => setFechaCarta(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-brand-dark mb-1">Día de la infracción</label>
                        <input type="date" value={fechaInfraccion} onChange={(e) => setFechaInfraccion(e.target.value)} className={inputCls} />
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

                <p className="text-[11px] text-muted-foreground">
                    Completa con las opciones. Usa <strong>Imprimir</strong> o <strong>Descargar Word</strong> (arriba) para emitir la carta lista.
                    Lo que dejes sin elegir queda como línea en blanco para llenar a mano.
                </p>
            </div>
        </Modal>
    );
};
