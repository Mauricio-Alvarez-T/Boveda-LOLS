const db = require('../config/db');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// Modelo gratuito de Google. La clave se lee de process.env.GEMINI_API_KEY
// (se setea en el .env del servidor, igual que MAIL_PASS — NO va al repo).
const GEMINI_MODEL = 'gemini-2.0-flash';

const amonestacionService = {
    /** Trae los datos del trabajador necesarios para encabezar la carta. */
    async getTrabajador(id) {
        const [rows] = await db.query(
            `SELECT t.id, t.rut, t.nombres, t.apellido_paterno, t.apellido_materno,
                    e.razon_social AS empresa_nombre,
                    o.nombre AS obra_nombre,
                    c.nombre AS cargo_nombre
             FROM trabajadores t
             LEFT JOIN empresas e ON t.empresa_id = e.id
             LEFT JOIN obras o ON t.obra_id = o.id
             LEFT JOIN cargos c ON t.cargo_id = c.id
             WHERE t.id = ?`,
            [id]
        );
        return rows[0] || null;
    },

    /**
     * Llama a Google Gemini para redactar la carta formal a partir de la
     * frase corta dictada/escrita por el jefe de obra. Usa fetch() nativo
     * (mismo patrón que feriados.service.js). Errores con statusCode para
     * que errorHandler los devuelva con un mensaje claro al usuario.
     */
    async generarTexto({ trabajador, fecha, textoLibre }) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw Object.assign(
                new Error('La IA no está configurada (falta GEMINI_API_KEY en el servidor). Puedes escribir la carta manualmente y descargarla igual.'),
                { statusCode: 503 }
            );
        }

        const nombre = [trabajador.nombres, trabajador.apellido_paterno, trabajador.apellido_materno]
            .filter(Boolean).join(' ');

        const prompt = `Eres un asistente de Recursos Humanos de una empresa constructora chilena. Redacta una CARTA DE AMONESTACIÓN formal en español de Chile, con tono profesional, respetuoso pero firme, lista para imprimir y firmar.

Datos:
- Trabajador: ${nombre} (RUT ${trabajador.rut || 's/i'})
- Cargo: ${trabajador.cargo_nombre || 's/i'}
- Obra / Faena: ${trabajador.obra_nombre || 's/i'}
- Empresa: ${trabajador.empresa_nombre || 's/i'}
- Fecha de la carta: ${fecha}

Hecho o motivo descrito por el jefe de obra (puede venir informal o dictado por voz):
"${textoLibre}"

Instrucciones estrictas:
- Desarrolla el motivo con redacción formal y clara. NO inventes hechos, fechas ni cifras que no estén en el motivo descrito.
- Estructura: lugar y fecha; identificación del trabajador (nombre, RUT, cargo, obra); descripción del hecho que motiva la amonestación; mención de que constituye una falta y que su reiteración podrá dar lugar a medidas mayores conforme al Código del Trabajo y al reglamento interno de la empresa; párrafo de cierre.
- NO incluyas líneas de firma (se agregan aparte automáticamente).
- NO uses markdown, asteriscos, ni viñetas. Devuelve SOLO el texto de la carta en párrafos planos separados por una línea en blanco.
- Máximo una página.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.4, maxOutputTokens: 1200 }
                })
            });
        } catch (err) {
            throw Object.assign(
                new Error('No se pudo conectar con la IA. Revisa la conexión a internet e intenta de nuevo (o escribe la carta manualmente).'),
                { statusCode: 502 }
            );
        }

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            const msg = response.status === 429
                ? 'Se alcanzó el límite de uso gratuito de la IA. Intenta nuevamente en unos minutos.'
                : 'La IA rechazó la solicitud. Intenta de nuevo más tarde o escribe la carta manualmente.';
            throw Object.assign(new Error(msg), { statusCode: 502, detail });
        }

        const data = await response.json();
        const texto = (data?.candidates?.[0]?.content?.parts || [])
            .map(p => p.text || '').join('').trim();

        if (!texto) {
            throw Object.assign(
                new Error('La IA no devolvió contenido. Intenta de nuevo o escribe la carta manualmente.'),
                { statusCode: 502 }
            );
        }
        return texto;
    },

    /**
     * Genera el PDF de la carta (pdf-lib). Reutiliza el patrón word-wrap de
     * pdf.service.js. Devuelve un Buffer listo para enviar al navegador.
     */
    async generarPdf({ cartaTexto, trabajador, fecha }) {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

        const margin = 56;
        const ink = rgb(0.1, 0.1, 0.1);

        let page = pdfDoc.addPage(); // Carta por defecto (612x792)
        const { width, height } = page.getSize();
        const maxWidth = width - margin * 2;
        let y = height - margin;

        const ensureSpace = () => {
            if (y < margin) { page = pdfDoc.addPage(); y = page.getSize().height - margin; }
        };

        const draw = (text, f, size, gap = 5) => {
            const paragraphs = String(text).split(/\r?\n/);
            for (const para of paragraphs) {
                if (para.trim() === '') { y -= size + gap; ensureSpace(); continue; }
                const words = para.split(' ');
                let line = '';
                for (const word of words) {
                    const test = line ? line + ' ' + word : word;
                    if (f.widthOfTextAtSize(test, size) > maxWidth) {
                        ensureSpace();
                        page.drawText(line, { x: margin, y, size, font: f, color: ink });
                        y -= size + gap;
                        line = word;
                    } else {
                        line = test;
                    }
                }
                if (line) {
                    ensureSpace();
                    page.drawText(line, { x: margin, y, size, font: f, color: ink });
                    y -= size + gap;
                }
            }
        };

        // Encabezado
        if (trabajador.empresa_nombre) { draw(trabajador.empresa_nombre.toUpperCase(), fontBold, 13); y -= 2; }
        draw('CARTA DE AMONESTACIÓN', fontBold, 12);
        y -= 10;

        // Cuerpo (texto de la IA, posiblemente editado por el jefe)
        draw(cartaTexto, font, 11, 5);

        // Bloque de firmas
        y -= 36; ensureSpace();
        draw('_______________________________', font, 11, 3);
        draw('Firma del Trabajador', font, 9, 14);
        draw('_______________________________', font, 11, 3);
        draw('Representante de la Empresa', font, 9, 5);

        const bytes = await pdfDoc.save();
        return Buffer.from(bytes);
    }
};

module.exports = amonestacionService;
