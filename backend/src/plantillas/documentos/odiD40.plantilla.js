/**
 * ODI — Obligación de Informar los Riesgos Laborales (DS 44; ex D.S. 40, Ley 16.744).
 *
 * UNA SOLA HOJA, calcando el formato en papel de LOLS (pedido de RRHH 2026-10-01): hoja carta, márgenes
 * mínimos, Tahoma; logo + título en una línea, tabla de datos del trabajador, el texto legal en un
 * recuadro, los 27 riesgos en una grilla de dos columnas a 6 pt (dato en odiRiesgos.js) y la tabla de
 * firmas instructor / trabajador con casilla de huella. La versión 1.0 usaba la página estándar
 * (A4, 2,5 cm, Times 12) y se estiraba a tres hojas.
 *
 * Si se agrega texto o riesgos, comprobar que siga en una hoja: abrir el .doc en Word (la prueba del
 * plan fue Word COM → ComputeStatistics(páginas) = 1).
 */
const g = require('../../services/docGenerador.service');
const RIESGOS = require('./odiRiesgos');

/** Hoja carta como el original (21,6 × 27,9; arriba 0,44 / abajo 0,32 / lados 1,5 cm), con un poco más de
 *  aire abajo (0,45) para que la impresora no corte la tabla de firmas. */
const PAGINA = Object.freeze({
    papel: g.PAPEL_CARTA,
    margen: '0.45cm 1.5cm 0.45cm 1.5cm',
    fuente: 'Tahoma, Verdana, sans-serif',
    tamano: '9pt',
    interlineado: 1.1,
});

function requiere(ctx) {
    const f = [];
    if (!ctx.empresa) f.push('empresa del trabajador');
    if (!ctx.trabajador.cargo_nombre) f.push('cargo del trabajador');
    return f;
}

const esc = g.escapeHtml;
const MAY = (v) => String(v ?? '').toLocaleUpperCase('es-CL');
const BORDE = 'border:1px solid #000';
const P0 = 'margin:0;text-align:left';

/** Celda de un riesgo: título en negrita y viñetas "*" a 6 pt (como el papel). */
function bloqueRiesgo(r) {
    return `<p style="${P0};font-size:6pt;line-height:1.05"><b>${r.n}.- ${esc(r.titulo)}</b></p>` +
        r.bullets.map(x => `<p style="${P0};font-size:6pt;line-height:1.05;padding-left:3pt">* ${esc(x)}</p>`).join('');
}

/** Pares (1|2), (3|4)…; con un número impar el último va debajo del de la derecha (26 y 27, como el papel). */
function filasRiesgos() {
    const filas = [];
    for (let i = 0; i < RIESGOS.length; i += 2) filas.push([RIESGOS[i], RIESGOS[i + 1] ? [RIESGOS[i + 1]] : []]);
    const ultima = filas[filas.length - 1];
    if (ultima[1].length === 0 && filas.length > 1) {
        filas.pop();
        filas[filas.length - 1][1].push(ultima[0]);
    }
    const td = `style="${BORDE};padding:0 3pt;vertical-align:top" width="50%"`;
    return filas.map(([izq, der]) => `<tr><td ${td}>${bloqueRiesgo(izq)}</td><td ${td}>${der.map(bloqueRiesgo).join('')}</td></tr>`).join('');
}

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador, d = ctx.datos || {};
    const fecha = d.fecha_documento || ctx.hoy;
    const razon = MAY(e.razon_social);
    // Celdas con borde. `attrs` = width/colspan; `css` se suma al estilo (un solo atributo style).
    const lbl = (txt, attrs = '', css = '') => `<td style="${BORDE};padding:0 4pt;white-space:nowrap;${css}"${attrs}><b>${txt}</b></td>`;
    const val = (txt, attrs = '', css = '') => `<td style="${BORDE};padding:0 4pt;${css}"${attrs}>${esc(txt)}</td>`;
    const parrafo = `${P0};text-align:justify;font-size:8.5pt;line-height:1.05`;

    return (
        // Logo + título en una línea.
        '<table width="100%" style="margin:0 0 4pt"><tr>' +
        `<td style="vertical-align:middle;padding:0 8pt 0 0" width="1%">${g.logoHtml(ctx.empresa, { alto: 40 })}</td>` +
        // El título cabe en una línea junto al logo de LOLS; con el de MAUA (más ancho) baja a dos, y hay aire.
        '<td style="vertical-align:middle"><p style="margin:0;text-align:left;font-size:11.5pt"><b>OBLIGACIÓN DE INFORMAR LOS RIESGOS LABORALES DECRETO SUPREMO N°44</b></p></td>' +
        '</tr></table>' +

        // Datos del trabajador.
        '<table width="100%" style="font-size:9pt">' +
        `<tr>${lbl('NOMBRE DEL TRABAJADOR', ' width="24%"')}${val(MAY(t.nombre), ' colspan="3"')}</tr>` +
        `<tr>${lbl('CARGO')}${val(MAY(t.cargo_nombre), ' width="36%"')}${lbl('RUT', ' width="24%"')}${val(t.rut, ' width="16%"')}</tr>` +
        `<tr>${lbl('DIVISIÓN')}${val(MAY(d.division || 'CONSTRUCCIÓN'), ' colspan="3"')}</tr>` +
        `<tr>${lbl('FECHA')}${val(g.fechaCorta(fecha), ' colspan="3"')}</tr>` +
        `<tr>${lbl('UBICACIÓN')}${val(MAY(d.ubicacion || t.obra_nombre || ''))}${lbl('DURACIÓN DE LA CHARLA')}${val(d.duracion_charla || '30 minutos')}</tr>` +
        '</table>' +

        // Texto legal en recuadro.
        `<table width="100%" style="margin-top:3pt"><tr><td style="${BORDE};padding:1pt 4pt">` +
        `<p style="${parrafo}">${esc(razon)}, en cumplimiento a lo dispuesto en el Decreto N° 40 de la Ley 16.744 y las modificaciones introducidas por el Decreto N° 50 de 1988 del Ministerio del Trabajo y Previsión Social, Título VI "DE LA OBLIGACIÓN DE INFORMAR DE LOS RIESGOS LABORALES", artículos 21, 22, 23 y 24, ha publicado para conocimiento de todos sus trabajadores los riesgos generales más representativos de la construcción y, además, a través de la presente capacitación al trabajador abajo firmante, éste declara conocer los riesgos potenciales de accidente que conllevan las labores que ejecuta y las medidas preventivas que debe respetar, empleando métodos de trabajo correctos o seguros para evitar cometer acciones inseguras, comprometiéndose a cumplir con todas las instrucciones de la jefatura superior.</p>` +
        `<p style="${parrafo}">Aquellos riesgos o dudas específicas que se presenten en los lugares donde trabajo o en la forma de efectuarlo, deberé informarlos oportunamente a la jefatura directa, para que los analice y establezca los procedimientos y métodos que deberé adoptar para ejecutar en forma segura tales labores. Esta capacitación será realizada por mi supervisión y, por medio del presente registro, quedará constancia de ella.</p>` +
        '</td></tr></table>' +

        // Los 27 riesgos.
        `<table width="100%" style="margin-top:3pt">${filasRiesgos()}</table>` +

        // Firmas: instructor | trabajador | huella.
        '<table width="100%" style="margin-top:5pt;font-size:9pt">' +
        `<tr>${lbl('INSTRUCTOR', ' colspan="2"')}${lbl('TRABAJADOR', ' colspan="2"')}` +
        `<td rowspan="4" width="14%" style="${BORDE};vertical-align:bottom;text-align:center;padding:2pt"><b>Huella</b></td></tr>` +
        `<tr>${val('NOMBRE', ' width="9%"')}${val('', ' width="26%"')}${val('NOMBRE', ' width="9%"')}${val(MAY(t.nombre), ' width="42%"', 'font-size:8pt')}</tr>` +
        `<tr>${val('RUT')}${val('')}${val('RUT')}${val(t.rut)}</tr>` +
        `<tr style="height:20pt">${val('FIRMA')}${val('')}${val('FIRMA')}${val('')}</tr>` +
        '</table>'
    );
}

module.exports = {
    codigo: 'ODI_D40',
    version: '1.1',
    pagina: PAGINA,
    titulo: 'ODI – Obligación de Informar (DS 44)',
    requiere,
    nombreBase: (ctx) => `ODI_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata: (ctx) => ({
        empresa: { id: ctx.empresa.id, razon_social: ctx.empresa.razon_social },
        trabajador: { id: ctx.trabajador.id, nombre: ctx.trabajador.nombre, rut: ctx.trabajador.rut, cargo: ctx.trabajador.cargo_nombre },
        charla: { fecha: ctx.datos?.fecha_documento || ctx.hoy, ubicacion: ctx.datos?.ubicacion || ctx.trabajador.obra_nombre || null, duracion: ctx.datos?.duracion_charla || '30 minutos' },
    }),
};
