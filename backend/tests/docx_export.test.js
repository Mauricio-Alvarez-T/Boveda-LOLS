/**
 * Word REAL (.docx) desde el HTML del motor de documentos (jefatura 2026-10-26: el .doc-HTML no se veía en
 * el celular). Módulo puro salvo la lectura del archivo: se valida el ZIP resultante (Office Open XML) y
 * las correcciones que el conversor necesita para que el Word se parezca a lo que imprime el navegador.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const g = require('../src/services/docGenerador.service');
const docx = require('../src/services/docxExport.service');
const { getPlantilla } = require('../src/plantillas/documentos');
const { getCausal } = require('../src/config/causalesDesvinculacion');

const empresa = { id: 1, rut: '77.085.560-8', razon_social: 'LOLS Empresas de Ingeniería Ltda.', direccion: 'El Mirador 150, Cerrillos', representante_nombre: 'Luis Lazcano Silva', representante_rut: '7.907.220-6' };
const trabajador = {
    id: 5, rut: '12.345.678-5', nombres: 'Juan Andrés', apellido_paterno: 'Pérez', apellido_materno: 'Soto', nombre: 'Juan Andrés Pérez Soto',
    activo: true, nacionalidad: 'chilena', estado_civil: 'casado', fecha_nacimiento: '1995-12-03', direccion: 'Av. España 505', comuna: 'Santiago',
    fecha_ingreso: '2026-08-31', cargo_id: 2, cargo_nombre: 'Jornal', obra_nombre: 'Edificio Central',
};
const c = getCausal('VENCIMIENTO_PLAZO');
const ctx = {
    hoy: '2026-09-11', empresa, trabajador, remuneracion: { sueldo_base: 553553, fuente: 'cargo_sueldos' },
    datos: { fecha_carta: '2026-09-11', motivo: 'Atraso', haberes: [{ concepto: 'Días trabajados', monto: 450000 }] },
    desvinculacion: { fecha_desvinculacion: '2026-09-10', fecha_ingreso_periodo: '2026-08-31', causal_codigo: c.codigo,
        causal: { codigo: c.codigo, nombre: c.nombre, articulo: c.articulo, inciso: c.inciso, articulo_texto: c.articulo_texto } },
    solicitud: { id: 41, estado: 'pendiente', rut: '12.345.678-5', nombres: 'Ana', apellido_paterno: 'Soto', apellido_materno: null,
        fecha_solicitud: '2026-09-08 10:00:00', fecha_ingreso: '2026-09-10', obra_nombre: 'Edificio Central', cargo_nombre: 'Jornal', solicitante_nombre: 'Terreno' },
};

const htmlDe = (codigo) => {
    const p = getPlantilla(codigo);
    return g.wrapHtml(p.titulo, p.build(ctx), p.pagina);
};
async function abrir(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    return {
        doc: await zip.file('word/document.xml').async('string'),
        styles: await zip.file('word/styles.xml').async('string'),
    };
}
const texto = (xml) => (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');

describe('htmlADocx — Word real desde el HTML del motor', () => {
    const CODIGOS = ['CONTRATO', 'ODI_D40', 'DAS', 'PTS_ALTURA', 'EPP_RECEPCION', 'RI_RECEPCION', 'AMONESTACION', 'FINIQUITO', 'SOLICITUD_INGRESO'];

    test.each(CODIGOS)('%s: ZIP de Office válido, con su texto y sin celdas que terminen en tabla (Word lo da por dañado)', async (codigo) => {
        const buf = await docx.htmlADocx(htmlDe(codigo), { titulo: codigo });
        expect(buf.slice(0, 2).toString()).toBe('PK');
        const { doc } = await abrir(buf);
        expect(doc).toContain('<w:body>');
        expect(doc).not.toMatch(/<\/w:tbl>\s*<\/w:tc>/);
        expect(texto(doc).length).toBeGreaterThan(200);
    });

    test('el contrato conserva cláusulas, logo y líneas de firma (celda con borde superior)', async () => {
        const { doc } = await abrir(await docx.htmlADocx(htmlDe('CONTRATO')));
        const t = texto(doc);
        expect(t).toContain('CONTRATO DE TRABAJO');
        expect(t).toContain('$553.553');
        expect(t).toContain('EMPLEADOR');
        expect(doc).toContain('<w:drawing>');
        expect(doc).toMatch(/<w:tcBorders>[\s\S]*?<w:top /);
    });

    test('el título del encabezado (div dentro de div en una celda) no se pierde', async () => {
        const { doc } = await abrir(await docx.htmlADocx(htmlDe('DAS')));
        expect(texto(doc)).toContain('DECLARACIÓN DE RECIBIR EL DERECHO A SABER');
    });

    test('ODI: hoja carta con sus márgenes, letra Tahoma 9, anchos de columna reales e interlineado exacto', async () => {
        const { doc, styles } = await abrir(await docx.htmlADocx(htmlDe('ODI_D40')));
        expect(doc).toMatch(/<w:pgSz w:w="12240" w:h="15840"/);
        expect(doc).toMatch(/<w:pgMar w:top="255" w:right="850" w:bottom="255" w:left="850"/);
        expect(styles).toMatch(/<w:rFonts w:ascii="Tahoma"/);
        expect(styles).toMatch(/<w:pPrDefault>\s*<w:pPr>\s*<w:spacing w:before="0" w:after="0"/);
        // Los % del HTML pasan a twips (el conversor los dejaba en 0 y Word repartía parejo).
        expect(doc).not.toMatch(/<w:tcW w:w="0"/);
        // 1,05 × 6 pt = 6,3 pt = 126 twips EXACTOS (no «0,5 líneas» ni el sencillo de Word).
        expect(doc).toContain('<w:spacing w:line="126" w:after="0" w:lineRule="exact"/>');
    });

    test('párrafo justificado con <br> se parte en líneas (Word estiraba la línea del salto manual)', async () => {
        const html = g.wrapHtml('t', '<p><b>3.-</b> La jornada será la siguiente:<br/>Lunes a jueves<br/>Viernes</p>');
        const { doc } = await abrir(await docx.htmlADocx(html));
        expect((doc.match(/<w:jc w:val="both"\/>/g) || []).length).toBe(3);
        expect(doc).not.toContain('<w:br/>');
    });

    test('A4 y Times 12 cuando el documento no trae página propia', async () => {
        const { doc, styles } = await abrir(await docx.htmlADocx(g.wrapHtml('t', '<p>hola</p>')));
        expect(doc).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
        expect(styles).toMatch(/<w:rFonts w:ascii="Times New Roman"/);
        expect(styles).toMatch(/<w:sz w:val="24"\/>/);
    });

    test('el logo no queda con interlineado exacto (lo recortaría)', async () => {
        const { doc } = await abrir(await docx.htmlADocx(htmlDe('EPP_RECEPCION')));
        const conLogo = (doc.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [^>]*>[\s\S]*?<\/w:p>/g) || []).filter(p => p.includes('<w:drawing'));
        expect(conLogo.length).toBeGreaterThan(0);
        for (const p of conLogo) expect(p).not.toContain('lineRule="exact"');
    });
});

describe('deploy: dep del conversor aún sin instalar (heal-deps lo instala en la pasada siguiente)', () => {
    test('el módulo carga igual y la descarga entrega el .doc de siempre (null → fallback)', async () => {
        let mod;
        jest.isolateModules(() => {
            jest.doMock('@turbodocx/html-to-docx', () => { throw new Error("Cannot find module '@turbodocx/html-to-docx'"); });
            mod = require('../src/services/docxExport.service');
        });
        expect(typeof mod.enviarDescarga).toBe('function');
        expect(await mod.docxDeHtml(htmlDe('DAS'), 'DAS.doc')).toBeNull();
        jest.dontMock('@turbodocx/html-to-docx');
    });
});

describe('descarga: .doc generado → .docx; lo demás tal cual', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('esDocGenerado: HTML con BOM y extensión .doc sí; Word binario, PDF u otra extensión no', () => {
        expect(docx.esDocGenerado('﻿<!DOCTYPE html><html>', 'Contrato.doc')).toBe(true);
        expect(docx.esDocGenerado('<html xmlns:o="urn:x">', 'x.DOC')).toBe(true);
        expect(docx.esDocGenerado('ÐÏ\u0011àbinario', 'subido.doc')).toBe(false);
        expect(docx.esDocGenerado('<!DOCTYPE html>', 'x.html')).toBe(false);
        expect(docx.esDocGenerado('%PDF-1.7', 'x.pdf')).toBe(false);
    });

    test('docxDeArchivo: el .doc generado vuelve como .docx con su MIME; un .doc subido devuelve null', async () => {
        const generado = path.join(dir, 'Contrato_Perez_20260911-101010.doc');
        fs.writeFileSync(generado, g.toDocBuffer(htmlDe('CONTRATO')));
        const r = await docx.docxDeArchivo(generado, 'Contrato_Perez_20260911-101010.doc', { titulo: 'Contrato' });
        expect(r.fileName).toBe('Contrato_Perez_20260911-101010.docx');
        expect(r.mime).toBe(docx.MIME_DOCX);
        expect(r.buffer.slice(0, 2).toString()).toBe('PK');

        const binario = path.join(dir, 'subido.doc');
        fs.writeFileSync(binario, Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]));
        expect(await docx.docxDeArchivo(binario, 'subido.doc')).toBeNull();
        expect(await docx.docxDeArchivo(path.join(dir, 'no-existe.doc'), 'no-existe.doc')).toBeNull();
    });

    test('agregarAZip: el generado entra como .docx (append); un PDF entra como archivo', async () => {
        const generado = path.join(dir, 'DAS.doc');
        fs.writeFileSync(generado, g.toDocBuffer(htmlDe('DAS')));
        const pdf = path.join(dir, 'cedula.pdf');
        fs.writeFileSync(pdf, '%PDF-1.7');
        const archive = { append: jest.fn(), file: jest.fn() };
        await docx.agregarAZip(archive, generado, 'Juan/DAS_12.doc');
        await docx.agregarAZip(archive, pdf, 'Juan/Cedula_13.pdf');
        expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'Juan/DAS_12.docx' });
        expect(archive.file).toHaveBeenCalledWith(pdf, { name: 'Juan/Cedula_13.pdf' });
    });

    test('enviarDescarga: generado → attachment .docx; si no, res.download con el MIME original', async () => {
        const generado = path.join(dir, 'RI.doc');
        fs.writeFileSync(generado, g.toDocBuffer(htmlDe('RI_RECEPCION')));
        const res = { attachment: jest.fn(), type: jest.fn(), send: jest.fn(), download: jest.fn() };
        await docx.enviarDescarga(res, { fullPath: generado, fileName: 'RI.doc', mimeOriginal: 'application/msword' });
        expect(res.attachment).toHaveBeenCalledWith('RI.docx');
        expect(res.type).toHaveBeenCalledWith(docx.MIME_DOCX);
        expect(res.download).not.toHaveBeenCalled();

        const res2 = { attachment: jest.fn(), type: jest.fn(), send: jest.fn(), download: jest.fn() };
        const pdf = path.join(dir, 'x.pdf');
        fs.writeFileSync(pdf, '%PDF-1.7');
        await docx.enviarDescarga(res2, { fullPath: pdf, fileName: 'x.pdf' });
        expect(res2.download).toHaveBeenCalledWith(pdf, 'x.pdf');
        expect(res2.send).not.toHaveBeenCalled();
    });
});
