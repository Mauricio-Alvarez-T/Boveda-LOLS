import { parseErrorBlob, mensajeDescargaDenegada, modoApertura, mimePorExtension, nombreDesdeDisposition, extensionDe } from './descargaErrores';

describe('descargaErrores (plan Gestiones B2)', () => {
    it('parseErrorBlob: JSON del backend con required; texto plano; basura larga → fallback', () => {
        expect(parseErrorBlob('{"error":"Documento laboral: descarga solo desde oficina","required":["documentos.laborales.descargar"]}'))
            .toEqual({ error: 'Documento laboral: descarga solo desde oficina', required: ['documentos.laborales.descargar'], code: undefined });
        expect(parseErrorBlob('{"error":"x","code":"TIPO_SISTEMA"}').code).toBe('TIPO_SISTEMA');
        expect(parseErrorBlob('Not found')).toEqual({ error: 'Not found' });
        expect(parseErrorBlob('<html>'.repeat(100))).toEqual({ error: 'No se pudo descargar el archivo' });
        expect(parseErrorBlob('{"otra":1}').error).toBe('No se pudo descargar el archivo');
    });

    it('mensajeDescargaDenegada traduce la clave a su nombre', () => {
        expect(mensajeDescargaDenegada(['documentos.laborales.descargar'])).toMatch(/"Descargar \/ Imprimir Documentos Laborales" \(solo oficina\)/);
        expect(mensajeDescargaDenegada(['x.y'])).toMatch(/"x.y"/);
        expect(mensajeDescargaDenegada([])).toBeUndefined();
        expect(mensajeDescargaDenegada(undefined)).toBeUndefined();
    });

    it('modoApertura: PDF/imagen/txt en pestaña; Word/ZIP/otros se descargan', () => {
        expect(modoApertura('a.pdf')).toBe('preview');
        expect(modoApertura('foto.JPG')).toBe('preview');
        expect(modoApertura('Contrato_Perez_20260911-100000.doc')).toBe('download');
        expect(modoApertura('x.docx')).toBe('download');
        expect(modoApertura('Documentos.zip')).toBe('download');
        expect(modoApertura(null)).toBe('download');
        expect(extensionDe('a.b.PDF')).toBe('pdf');
    });

    it('mimePorExtension', () => {
        expect(mimePorExtension('a.pdf')).toBe('application/pdf');
        expect(mimePorExtension('a.doc')).toBe('application/msword');
        expect(mimePorExtension('a.bin')).toBe('application/octet-stream');
    });

    it('nombreDesdeDisposition: simple, con comillas y UTF-8', () => {
        expect(nombreDesdeDisposition('attachment; filename="Solicitud_Ingreso_Soto_Ana.doc"')).toBe('Solicitud_Ingreso_Soto_Ana.doc');
        expect(nombreDesdeDisposition('attachment; filename=x.zip')).toBe('x.zip');
        expect(nombreDesdeDisposition("attachment; filename*=UTF-8''P%C3%A9rez.doc")).toBe('Pérez.doc');
        expect(nombreDesdeDisposition(undefined)).toBeNull();
    });
});
