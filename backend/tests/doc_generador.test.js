/**
 * Motor Word (plan Gestiones B2) — módulos PUROS, sin BD:
 *  - docGenerador: HTML con namespaces de Office, BOM en el archivo y sin BOM para imprimir,
 *    logo wordmark con la proporción del PNG (450×198 → 150×66), escape de HTML.
 *  - numeroALetras: montos en letras para contrato/finiquito.
 *  - plantillas: requiere() detecta datos faltantes; build() imprime lo que debe y escapa lo que no.
 */
const fs = require('fs');
const g = require('../src/services/docGenerador.service');
const { numeroALetras, montoEnLetras, capitalizar } = require('../src/utils/numeroALetras');
const { PLANTILLAS, KIT_INGRESO, EMITIBLES, getPlantilla } = require('../src/plantillas/documentos');

describe('docGenerador.service', () => {
    test('wrapHtml: documento Office completo, título escapado, body dentro', () => {
        const html = g.wrapHtml('Contrato <x>', '<p>hola</p>');
        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(html).toContain('urn:schemas-microsoft-com:office:word');
        expect(html).toContain('urn:schemas-microsoft-com:office:office');
        expect(html).toContain('<meta charset="utf-8">');
        expect(html).toContain('<title>Contrato &lt;x&gt;</title>');
        expect(html).toContain('<body><p>hola</p></body>');
        expect(html).toContain('@page { size: A4; margin: 2.5cm; }');
    });

    test('toDocBuffer lleva BOM UTF-8; sinBom lo quita (el iframe de impresión no debe recibirlo)', () => {
        const buf = g.toDocBuffer('<!DOCTYPE html><html></html>');
        expect([...buf.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
        const texto = buf.toString('utf8');
        expect(texto.charCodeAt(0)).toBe(0xFEFF);
        expect(g.sinBom(texto).startsWith('<!DOCTYPE')).toBe(true);
        expect(g.sinBom('<p>sin bom</p>')).toBe('<p>sin bom</p>');
    });

    test('logo: el PNG existe, es 450×198 y se incrusta como data URI con proporción 150×66', () => {
        expect(fs.existsSync(g.LOGO_PATH)).toBe(true);
        const png = fs.readFileSync(g.LOGO_PATH);
        // Cabecera PNG: ancho/alto big-endian en los bytes 16-23 del chunk IHDR.
        expect(png.readUInt32BE(16)).toBe(450);
        expect(png.readUInt32BE(20)).toBe(198);
        expect(Math.round((g.LOGO_W / g.LOGO_H) * 100)).toBe(Math.round((450 / 198) * 100));
        const uri = g.logoDataUri();
        expect(uri.startsWith('data:image/png;base64,')).toBe(true);
        expect(g.logoHtml()).toContain(`width="${g.LOGO_W}" height="${g.LOGO_H}"`);
    });

    test('escapeHtml / oLinea / fechas / CLP', () => {
        expect(g.escapeHtml('<b>&"x"</b>')).toBe('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
        expect(g.oLinea('  ', 5)).toBe('_____');
        expect(g.oLinea('Casado')).toBe('Casado');
        expect(g.fechaLarga('2026-09-02')).toBe('02 de septiembre de 2026');
        expect(g.fechaLarga(null)).toBe('');
        expect(g.fechaCorta('2026-09-02')).toBe('02/09/2026');
        expect(g.fechaCorta('')).toBe('___/___/______');
        expect(g.fmtCLP(553553)).toBe('$553.553');
        expect(g.fmtCLP(0)).toBe('$0');
        expect(g.slug('Pérez Ñuñoa')).toBe('Perez_Nunoa');
        // La razón social viene con y sin punto en la BD: las frases que agregan el suyo no deben imprimir 'LTDA..'.
        expect(g.sinPuntoFinal('LOLS Ingeniería Ltda.')).toBe('LOLS Ingeniería Ltda');
        expect(g.sinPuntoFinal('MIGUEL ANGEL URRUTIA AGUILERA..')).toBe('MIGUEL ANGEL URRUTIA AGUILERA');
        expect(g.sinPuntoFinal('Constructora SpA')).toBe('Constructora SpA');
        expect(g.stamp(new Date(2026, 8, 11, 15, 42, 3))).toBe('20260911-154203');
    });

    test('bloqueFirmas / firmaTrabajador escapan y llevan los rótulos', () => {
        const f = g.bloqueFirmas({ titulo: 'EMPLEADOR', lineas: ['LOLS <Ltda>'] }, { titulo: 'TRABAJADOR', lineas: [] });
        expect(f).toContain('<b>EMPLEADOR</b>');
        expect(f).toContain('LOLS &lt;Ltda&gt;');
        const ft = g.firmaTrabajador('Juan Pérez', '12.345.678-5', '2026-09-11', { conHuella: true });
        expect(ft).toContain('NOMBRE DEL TRABAJADOR');
        expect(ft).toContain('RUT 12.345.678-5');
        expect(ft).toContain('Huella');
        expect(ft).toContain('En Santiago, 11 de septiembre de 2026');
    });
});

describe('numeroALetras', () => {
    test.each([
        [0, 'cero'], [1, 'uno'], [15, 'quince'], [21, 'veintiuno'], [30, 'treinta'], [31, 'treinta y uno'],
        [100, 'cien'], [101, 'ciento uno'], [500, 'quinientos'], [1000, 'mil'], [1001, 'mil uno'],
        [21000, 'veintiún mil'], [31000, 'treinta y un mil'],
        [553553, 'quinientos cincuenta y tres mil quinientos cincuenta y tres'],
        [600000, 'seiscientos mil'], [1000000, 'un millón'], [2100000, 'dos millones cien mil'],
        [1234567, 'un millón doscientos treinta y cuatro mil quinientos sesenta y siete'],
        // Apócope del 'uno' final ante sustantivo masculino (millones).  no separa 'veinti|uno'.
        [21000000, 'veintiún millones'], [21500000, 'veintiún millones quinientos mil'], [121000000, 'ciento veintiún millones'],
        [31000000, 'treinta y un millones'], [101000000, 'ciento un millones'],
    ])('%i → %s', (n, esperado) => {
        expect(numeroALetras(n)).toBe(esperado);
    });

    test('montoEnLetras: pesos, "de pesos" en millones exactos, singular', () => {
        expect(montoEnLetras(553553)).toBe('quinientos cincuenta y tres mil quinientos cincuenta y tres pesos');
        expect(montoEnLetras(1000000)).toBe('un millón de pesos');
        expect(montoEnLetras(2500000)).toBe('dos millones quinientos mil pesos');
        expect(montoEnLetras(1)).toBe('un peso');
        expect(capitalizar(montoEnLetras(600000))).toBe('Seiscientos mil pesos');

        // El monto va seguido de 'pesos': el 'uno' final se apocopa (≈10% de los sueldos termina en 1).
        expect(montoEnLetras(553551)).toBe('quinientos cincuenta y tres mil quinientos cincuenta y un pesos');
        expect(montoEnLetras(553521)).toBe('quinientos cincuenta y tres mil quinientos veintiún pesos');
        expect(montoEnLetras(480031)).toBe('cuatrocientos ochenta mil treinta y un pesos');
        expect(montoEnLetras(500001)).toBe('quinientos mil un pesos');
        expect(montoEnLetras(21)).toBe('veintiún pesos');
        expect(montoEnLetras(21000000)).toBe('veintiún millones de pesos');
    });

    test('rechaza fuera de rango', () => {
        expect(() => numeroALetras(1e12)).toThrow(/rango/);
    });
});

describe('plantillas de documentos', () => {
    const empresa = { id: 1, rut: '77.085.560-8', razon_social: 'LOLS Empresas de Ingeniería Ltda.', direccion: 'El Mirador 150, Cerrillos', representante_nombre: 'Luis Lazcano Silva', representante_rut: '7.907.220-6' };
    const trabajador = {
        id: 5, rut: '12.345.678-5', nombres: 'Juan Andrés', apellido_paterno: 'Pérez', apellido_materno: '<Soto>', nombre: 'Juan Andrés Pérez <Soto>',
        activo: true, nacionalidad: 'chilena', estado_civil: 'casado', fecha_nacimiento: '1995-12-03', direccion: 'Av. España 505', comuna: 'Santiago',
        fecha_ingreso: '2026-08-31', cargo_id: 2, cargo_nombre: 'Jornal', obra_nombre: 'Edificio Central',
    };
    const base = { hoy: '2026-09-11', empresa, trabajador, datos: {}, remuneracion: { sueldo_base: 553553, fuente: 'cargo_sueldos' } };

    test('catálogo: kit de 6 + amonestación; cada plantilla cumple el contrato', () => {
        expect(KIT_INGRESO).toEqual(['CONTRATO', 'ODI_D40', 'DAS', 'PTS_ALTURA', 'EPP_RECEPCION', 'RI_RECEPCION']);
        expect(EMITIBLES).toEqual([...KIT_INGRESO, 'AMONESTACION']);
        for (const [codigo, p] of Object.entries(PLANTILLAS)) {
            expect(p.codigo).toBe(codigo);
            expect(p.version).toMatch(/^\d+\.\d+$/);
            for (const fn of ['requiere', 'nombreBase', 'build', 'metadata']) expect(typeof p[fn]).toBe('function');
        }
        expect(getPlantilla('NADA')).toBeNull();
    });

    test('CONTRATO: exige representante, cargo, fecha de ingreso y sueldo; imprime monto en cifras y letras, plazo default 15', () => {
        const p = getPlantilla('CONTRATO');
        expect(p.requiere(base)).toEqual([]);
        expect(p.requiere({ ...base, empresa: { ...empresa, representante_nombre: null } })).toEqual(expect.arrayContaining([expect.stringMatching(/representante legal/)]));
        expect(p.requiere({ ...base, remuneracion: null })).toEqual(expect.arrayContaining([expect.stringMatching(/sueldo base del cargo Jornal/)]));
        expect(p.requiere({ ...base, trabajador: { ...trabajador, cargo_nombre: null, fecha_ingreso: null } })).toHaveLength(2);

        const html = p.build(base);
        expect(html).toContain('CONTRATO DE TRABAJO');
        expect(html).toContain('<b>$553.553</b>');
        expect(html).toContain('(Quinientos cincuenta y tres mil quinientos cincuenta y tres pesos)');
        expect(html).toContain('duración de <b>15 días</b>');
        expect(html).toContain('gratificación del 25%');
        expect(html).toContain('día 05 del mes siguiente');
        expect(html).toContain('Luis Lazcano Silva');
        expect(html).toContain('ingresó al servicio el día 31 de agosto de 2026');
        expect(html).not.toContain('LTDA..');
        expect(html).toContain('Juan Andrés Pérez &lt;Soto&gt;');   // escapado
        expect(html).not.toContain('<Soto>');
        expect(p.build({ ...base, datos: { dias_plazo: 30 } })).toContain('duración de <b>30 días</b>');
        expect(p.metadata(base)).toMatchObject({ remuneracion: { sueldo_base: 553553, fuente: 'cargo_sueldos' }, contrato: { tipo: 'plazo_fijo', dias_plazo: 15 } });
        expect(p.nombreBase(base)).toBe('Contrato_Perez_Juan_Andres');
    });

    test('ODI_D40: 27 riesgos en tabla, cabecera con cargo/ubicación/duración, firma con huella', () => {
        const p = getPlantilla('ODI_D40');
        expect(p.requiere(base)).toEqual([]);
        const html = p.build({ ...base, datos: { duracion_charla: '45 minutos' } });
        expect(html).toContain('OBLIGACIÓN DE INFORMAR LOS RIESGOS LABORALES');
        expect(html).toContain('27.- LEY 20.096');
        expect(html).toContain('1.- TRABAJOS EN ALTURA');
        expect(html).toContain('Edificio Central');
        expect(html).toContain('45 minutos');
        expect(html).toContain('Huella');
        expect((html.match(/<li /g) || []).length).toBeGreaterThanOrEqual(60);
    });

    test('DAS / PTS_ALTURA / RI_RECEPCION / EPP_RECEPCION: empleador y firma; EPP con lista default o editada', () => {
        for (const c of ['DAS', 'PTS_ALTURA', 'RI_RECEPCION', 'EPP_RECEPCION']) {
            const p = getPlantilla(c);
            expect(p.requiere(base)).toEqual([]);
            expect(p.requiere({ ...base, empresa: null })).toEqual(['empresa del trabajador']);
            const html = p.build(base);
            expect(html).toContain('NOMBRE DEL TRABAJADOR');
            expect(html).toContain('RUT 12.345.678-5');
            expect(html).toContain('En Santiago, 11 de septiembre de 2026');
        }
        const epp = getPlantilla('EPP_RECEPCION');
        expect(epp.build(base)).toContain('<li>ANTIPARRAS</li>');
        expect(epp.build({ ...base, datos: { epp_items: ['casco', 'bloqueador <solar>'] } })).toContain('<li>BLOQUEADOR &lt;SOLAR&gt;</li>');
        expect(epp.metadata({ ...base, datos: { epp_items: ['casco'] } }).implementos).toEqual(['casco']);
        // Sin punto duplicado: la razón social ya termina en punto y la frase agrega el suyo.
        expect(getPlantilla('RI_RECEPCION').build(base)).toContain('SEGURIDAD DE LOLS EMPRESAS DE INGENIERÍA LTDA.</p>');
        expect(getPlantilla('RI_RECEPCION').build(base)).not.toContain('LTDA..');
    });

    test('AMONESTACION: exige fecha de la carta; motivo + detalle o líneas en blanco; empresa desde la BD', () => {
        const p = getPlantilla('AMONESTACION');
        expect(p.requiere({ ...base, datos: {} })).toEqual(['fecha de la carta']);
        const html = p.build({ ...base, datos: { fecha_carta: '2026-09-11', fecha_infraccion: '2026-09-10', motivo: 'Inasistencia injustificada', detalle: 'Faltó <lunes>' } });
        expect(html).toContain('CARTA DE AMONESTACIÓN');
        expect(html).toContain('Fecha: 11/09/2026');
        expect(html).toContain('el día 10 de septiembre de 2026');
        expect(html).toContain('<p>Inasistencia injustificada</p><p>Faltó &lt;lunes&gt;</p>');
        expect(html).toContain('Administración de LOLS EMPRESAS DE INGENIERÍA LTDA.');
        const vacio = p.build({ ...base, datos: { fecha_carta: '2026-09-11' } });
        expect(vacio).toContain('_______________________________________________');
        expect(p.MOTIVOS.length).toBeGreaterThanOrEqual(8);
    });

    test('SOLICITUD_INGRESO: imprime la ficha completa y el estado', () => {
        const p = getPlantilla('SOLICITUD_INGRESO');
        const solicitud = {
            id: 41, estado: 'aprobada', rut: '12.345.678-5', nombres: 'Ana María', apellido_paterno: 'Soto', apellido_materno: 'Ruiz',
            fecha_solicitud: '2026-09-08 10:00:00', fecha_resolucion: '2026-09-09 09:00:00', solicitante_nombre: 'Pedro Terreno', resuelto_por_nombre: 'RRHH',
            empresa_nombre: 'LOLS', obra_nombre: 'Obra 1', cargo_nombre: 'Jornal', fecha_ingreso: '2026-09-08', afp: 'Modelo', salud: 'Fonasa',
            cargas_familiares: 2, talla_calzado: '42', cuenta_rut: 1, banco: 'Estado', tipo_cuenta: 'Cuenta RUT', numero_cuenta: '12345678', observaciones: '<script>',
        };
        expect(p.requiere({ hoy: '2026-09-11', solicitud })).toEqual([]);
        const html = p.build({ hoy: '2026-09-11', solicitud, datos: {} });
        expect(html).toContain('Solicitud N° 41');
        expect(html).toContain('Aprobada');
        expect(html).toContain('Ana María Soto Ruiz');
        expect(html).toContain('Pedro Terreno');
        expect(html).toContain('&lt;script&gt;');
        expect(p.nombreBase({ solicitud })).toBe('Solicitud_Ingreso_Soto_Ana_Maria');
    });

    test('SOLICITUD_INGRESO: un DATETIME de mysql2 (Date local) no corre el día', () => {
        // mysql2 entrega los DATETIME como Date en hora local; con toISOString() una solicitud de las
        // 22:30 en Chile (UTC-3) se imprimía con la fecha del día siguiente.
        const p = getPlantilla('SOLICITUD_INGRESO');
        const solicitud = {
            id: 41, estado: 'pendiente', rut: '12.345.678-5', nombres: 'Ana', apellido_paterno: 'Soto', apellido_materno: null,
            fecha_solicitud: new Date(2026, 8, 8, 22, 30), fecha_resolucion: new Date(2026, 8, 9, 23, 45),
        };
        const html = p.build({ hoy: '2026-09-11', solicitud, datos: {} });
        expect(html).toContain('Fecha: 08/09/2026');        // 22:30 del 8, no el 9
        expect(html).toContain('Resuelta el 09/09/2026');   // 23:45 del 9, no el 10
        expect(html).not.toContain('10/09/2026');
    });

    test('docGenerador: fechaCorta/fechaLarga leen un Date en hora local', () => {
        expect(g.fechaCorta(new Date(2026, 8, 8, 22, 30))).toBe('08/09/2026');
        expect(g.fechaLarga(new Date(2026, 8, 8, 23, 59))).toBe('08 de septiembre de 2026');
    });
});
