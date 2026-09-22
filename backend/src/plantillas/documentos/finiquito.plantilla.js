/**
 * FINIQUITO DE TRABAJADOR (plan Gestiones B5). Portado del molde en papel de LOLS / MAUA (una página:
 * comparecencia, cláusulas PRIMERO a CUARTO, cuadro de haberes con total en cifras y en letras, cierre
 * en dos ejemplares, declaración jurada Ley 21.389 y firmas empleador / trabajador). Los textos legales
 * son DATO reemplazable: RRHH los ajusta acá sin tocar lógica.
 *
 * Reglas:
 *  - Se emite SOLO a un trabajador desvinculado con una baja VIGENTE (fila abierta de
 *    `trabajador_desvinculaciones`, mig 112): `ctx.desvinculacion` la arma documentosLaborales.service.
 *    Es el único documento que exige `activo = 0`; el resto exige lo contrario.
 *  - RRHH digita los haberes (y descuentos si los hay) en `ctx.datos`; el sistema suma el total y lo
 *    escribe en letras. v1 NO calcula indemnizaciones ni feriado proporcional (decisión §2b del plan).
 *  - La causal impresa debe tener artículo del Código del Trabajo. Si la baja se registró con una causal
 *    operativa LOLS (sin artículo), quien emite elige la causal legal a imprimir (`datos.causal_codigo`);
 *    la registrada NUNCA se pisa: ambas quedan en `metadata`.
 *  - `detalle` de la desvinculación es antecedente interno: no se imprime ni entra en metadata.
 *  - `metadata` lleva montos → nunca sale por rutas con `documentos.ver` (regla del motor B2).
 */
const g = require('../../services/docGenerador.service');
const { montoEnLetras, capitalizar } = require('../../utils/numeroALetras');
const { getCausal } = require('../../config/causalesDesvinculacion');

const MAX_LINEAS = 10;
const LUGAR_DEFAULT = 'Santiago';
/** Tope de `numeroALetras` con margen: un total mayor es un error de tipeo, no un finiquito. */
const MAX_TOTAL = 999999999;

/** Fecha real (no solo la forma): '2026-13-45' pasa validateBody pero imprimiría "45 de undefined de 2026". */
const esYmd = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return false;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
};

/**
 * Líneas concepto/monto saneadas: concepto con texto y monto entero ≥ 0. Lo demás se ignora.
 * El monto solo se acepta como número o string de dígitos: Number('') y Number(true) darían 0 y 1 y
 * pasarían el filtro (validateBody 'integer' coerciona igual).
 */
function lineas(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .map(l => {
            const raw = l?.monto;
            const monto = (typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw.trim()))) ? Number(raw) : NaN;
            return { concepto: String(l?.concepto ?? '').trim(), monto };
        })
        .filter(l => l.concepto !== '' && Number.isInteger(l.monto) && l.monto >= 0);
}
const haberes = (ctx) => lineas(ctx.datos?.haberes);
const descuentos = (ctx) => lineas(ctx.datos?.descuentos);
const suma = (ls) => ls.reduce((acc, l) => acc + l.monto, 0);
const total = (ctx) => suma(haberes(ctx)) - suma(descuentos(ctx));

/**
 * Causal que se imprime, SIEMPRE con artículo. Si la registrada en la baja ya tiene artículo, manda ELLA
 * (`datos.causal_codigo` no puede pisarla: requiere() lo rechaza si difiere). Solo cuando la baja es
 * operativa LOLS / LEGADO (sin artículo) vale la elegida al emitir. null = no hay causal legal imprimible.
 */
function causalImpresa(ctx) {
    const r = ctx.desvinculacion?.causal;
    if (r && r.articulo) return r;
    const elegida = ctx.datos?.causal_codigo;
    if (elegida) {
        const c = getCausal(elegida);
        return c && c.articulo ? c : null;
    }
    return null;
}

const fechaInicio = (ctx) => ctx.desvinculacion?.fecha_ingreso_periodo || ctx.trabajador?.fecha_ingreso || null;
const fechaTermino = (ctx) => ctx.desvinculacion?.fecha_desvinculacion || null;
const fechaFiniquito = (ctx) => (esYmd(ctx.datos?.fecha_finiquito) ? ctx.datos.fecha_finiquito : ctx.hoy);
function lugarFirma(ctx) {
    const l = String(ctx.datos?.lugar_firma ?? '').trim();
    return l || LUGAR_DEFAULT;
}

function requiere(ctx) {
    const f = [];
    const e = ctx.empresa, t = ctx.trabajador || {}, d = ctx.desvinculacion;
    if (!e) f.push('empresa del trabajador');
    else {
        if (!e.representante_nombre) f.push('representante legal de la empresa (Configuración → Empresas)');
        if (!e.direccion) f.push('domicilio de la empresa');
        if (!e.rut) f.push('RUT de la empresa');
    }
    if (!t.rut) f.push('RUT del trabajador');
    if (!t.cargo_nombre) f.push('cargo del trabajador');

    if (!d) {
        // El service ya exigió activo = 0: si no hay fila abierta es una baja anterior al historial (mig 112)
        // o registrada sin fecha; "Desvincular" respondería YA_DESVINCULADO, así que no se manda ahí.
        f.push('baja vigente registrada en el historial de desvinculaciones (el finiquito se emite después de la baja; si el trabajador se dio de baja antes del registro de causales, pide a TI que la complete)');
    } else {
        if (!d.fecha_desvinculacion) f.push('fecha de desvinculación');
        if (!fechaInicio(ctx)) f.push('fecha de ingreso del período trabajado');
        // Se valida el valor EFECTIVO que imprime build() (con el default = hoy): una baja futura (hasta hoy+30)
        // sin fecha explícita imprimiría un finiquito firmado antes del término.
        const ff = ctx.datos?.fecha_finiquito;
        if (ff != null && !esYmd(ff)) f.push('fecha del finiquito válida (AAAA-MM-DD)');
        else if (d.fecha_desvinculacion && fechaFiniquito(ctx) < d.fecha_desvinculacion) {
            f.push(`fecha del finiquito igual o posterior a la desvinculación (${g.fechaCorta(d.fecha_desvinculacion)})`);
        }
        if (ctx.datos?.causal_codigo && d.causal?.articulo && ctx.datos.causal_codigo !== d.causal.codigo) {
            f.push(`causal coherente con la baja: la desvinculación ya tiene causal legal ("${d.causal.nombre}") y el finiquito imprime esa; no se reemplaza al emitir`);
        }
        if (!causalImpresa(ctx)) {
            const registrada = d.causal?.nombre || d.causal_codigo || 'sin causal';
            f.push(ctx.datos?.causal_codigo
                ? 'causal a imprimir válida (del catálogo y con artículo del Código del Trabajo)'
                : `causal legal a imprimir: la baja se registró como "${registrada}", que no tiene artículo del Código del Trabajo; elige la causal que va en el finiquito`);
        }
    }

    const h = haberes(ctx), ds = descuentos(ctx);
    if (!h.length) f.push('al menos una línea de haberes con concepto y monto (ej. "Días trabajados septiembre 2026")');
    // Un finiquito de $0 (el estado inicial del modal) no es un finiquito: "la suma de $0 (Cero pesos)".
    if (h.length && suma(h) <= 0) f.push('al menos un haber con monto mayor a cero');
    if (h.length > MAX_LINEAS || ds.length > MAX_LINEAS) f.push(`máximo ${MAX_LINEAS} líneas de haberes y ${MAX_LINEAS} de descuentos`);
    if (h.length && suma(ds) > suma(h)) f.push('descuentos que no superen los haberes (el total no puede ser negativo)');
    if (h.length && suma(h) > MAX_TOTAL) f.push('un total dentro del rango imprimible (revisa los montos)');
    return f;
}

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador;
    const esc = g.escapeHtml;
    // Sin el punto final de la razón social ("… Ltda."): varias frases le agregan el suyo y saldría "LTDA..".
    const razon = esc(g.sinPuntoFinal(String(e.razon_social || '').toUpperCase()));
    const nombre = esc(t.nombre);
    const causal = causalImpresa(ctx);
    const h = haberes(ctx), ds = descuentos(ctx);
    const tot = total(ctx);
    // montoEnLetras ya termina en "pesos": el molde traía "Son:( pesos)" y habría impreso "pesos pesos".
    const totLetras = esc(capitalizar(montoEnLetras(tot)));
    const fila = (l, resta) =>
        `<tr><td width="70%">${esc(l.concepto)}</td><td width="30%" style="text-align:right">${resta ? '&minus; ' : ''}${esc(g.fmtCLP(l.monto))}</td></tr>`;

    return (
        g.encabezado('FINIQUITO DE TRABAJADOR') +
        `<p style="margin-top:12pt">En ${esc(lugarFirma(ctx))}, a ${esc(g.fechaLarga(fechaFiniquito(ctx)))}, entre <b>${razon}</b>, RUT ${esc(e.rut)}, ` +
        `con domicilio en ${esc(e.direccion)}, y don(ña) <b>${nombre}</b>, RUT ${esc(t.rut)}, se acuerda el siguiente finiquito:</p>` +

        `<p><b>PRIMERO:</b> Don(ña) <b>${nombre}</b> declara haber prestado servicios a <b>${razon}</b>, en calidad de <b>${esc(t.cargo_nombre)}</b> ` +
        `y otros cargos asociados, desde el ${esc(g.fechaLarga(fechaInicio(ctx)))} y hasta el ${esc(g.fechaLarga(fechaTermino(ctx)))}. ` +
        `La causa de terminación del contrato es <b>${esc(causal.nombre)}</b>, en conformidad con el ${esc(causal.articulo_texto)}.</p>` +

        `<p><b>SEGUNDO:</b> Don(ña) <b>${nombre}</b> recibirá, a su entera satisfacción, de parte de <b>${razon}</b>, la suma de <b>${esc(g.fmtCLP(tot))}</b> ` +
        `(${totLetras}), según el siguiente detalle:</p>` +
        '<table class="grid" width="100%" style="margin:0 0 10pt">' +
        '<tr><th style="text-align:left">Concepto</th><th style="text-align:right">Monto</th></tr>' +
        h.map(l => fila(l, false)).join('') +
        (ds.length ? '<tr><td colspan="2" style="font-weight:bold">Descuentos</td></tr>' + ds.map(l => fila(l, true)).join('') : '') +
        `<tr><td style="font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">${esc(g.fmtCLP(tot))}</td></tr>` +
        '</table>' +
        `<p><b>Son:</b> ${totLetras}.</p>` +

        `<p><b>TERCERO:</b> Don(ña) <b>${nombre}</b> deja constancia de que durante todo el tiempo que prestó servicios a <b>${razon}</b> ` +
        'recibió de ésta, en forma correcta y oportuna, el total de las remuneraciones convenidas de acuerdo a su contrato de trabajo, clase de trabajo ejecutado, ' +
        'reajustes legales, pago de asignaciones familiares autorizadas por la respectiva institución de previsión, horas extraordinarias cuando las trabajó, ' +
        'feriados legales, gratificaciones o participaciones que en conformidad a la ley fueron procedentes; dejándose, además, expresa constancia de que tanto sus ' +
        'cotizaciones previsionales como de salud se encuentran totalmente pagadas y al día en las respectivas instituciones, y que por lo tanto nada se le adeuda ' +
        'por los conceptos antes indicados ni por algún otro concepto, sea de origen legal o contractual, derivado de la prestación de sus servicios; motivo por el cual, ' +
        `no teniendo reclamo alguno que formular en contra de <b>${razon}</b>, como tampoco de sus representantes, socios, accionistas, mandatarios, directivos, ` +
        'ejecutivos, profesionales, técnicos, empleados, dependientes, contratistas, sociedades matrices, coligadas o filiales y, en general, de ninguna persona natural o ' +
        'jurídica relacionada directa o indirectamente con dicha empresa, le otorga el más amplio y total finiquito, declaración que formula libre y espontáneamente, ' +
        'en perfecto y cabal conocimiento de cada uno y de todos sus derechos, declarando que con éste han sido resarcidos íntegra y oportunamente todos los perjuicios ' +
        'materiales o morales, directos o indirectos, previstos o imprevistos, daño emergente, lucro cesante, daño moral, enfermedades profesionales y cualquier otro daño ' +
        `o perjuicio, así como cualquier accidente laboral o enfermedad profesional ocurrido mientras estuvo vinculado(a) legal o contractualmente con <b>${razon}</b>.</p>` +

        `<p><b>CUARTO:</b> Don(ña) <b>${nombre}</b> declara asimismo que el pago de la cláusula segunda satisface sus pretensiones y, en consecuencia, renuncia a todo ` +
        `tipo de acciones que tuviere o pudiere tener en contra de <b>${razon}</b> y/o de sus empresas relacionadas, coligadas o filiales, contratistas, subcontratistas ` +
        'o empresas de servicios transitorios (EST), y de sus gerentes, ejecutivos, profesionales, dependientes y trabajadores, ya sean laborales —en especial por concepto ' +
        'de eventual vulneración de derechos fundamentales—, civiles, criminales, infraccionales o de cualquier otro tipo, o respecto de cualquier accidente laboral o ' +
        `enfermedad profesional ocasionada mientras estuvo vinculado(a) legal o contractualmente con <b>${razon}</b>, incluyendo expresamente aquellas que persigan el pago ` +
        'de indemnizaciones a cualquier título, ya sea daño moral, lucro cesante, daño emergente o cualquier otro daño o perjuicio que se haya originado, así como también ' +
        'renuncia a accionar por derechos fundamentales.</p>' +

        '<p>Para constancia firman las partes el presente finiquito en dos ejemplares, quedando uno de ellos en poder de cada parte.</p>' +

        `<p style="margin-top:14pt"><b>${razon}</b>, RUT ${esc(e.rut)}, representada legalmente por don(ña) ${esc(e.representante_nombre)}` +
        `${e.representante_rut ? `, RUT ${esc(e.representante_rut)}` : ''}, conforme a lo dispuesto en la Ley N° 21.389, declara juradamente que, respecto del trabajador(a) ` +
        `<b>${nombre}</b>, RUT ${esc(t.rut)}, no ha sido notificada por tribunal alguno de la obligación de practicar retención judicial sobre sus remuneraciones o indemnizaciones.</p>` +

        g.bloqueFirmas(
            { titulo: 'EMPLEADOR', lineas: [String(e.razon_social || '').toUpperCase(), `RUT: ${e.rut}`] },
            { titulo: 'TRABAJADOR', lineas: [String(t.nombre || '').toUpperCase(), `RUT: ${t.rut}`] },
            { margenTop: 50 }
        )
    );
}

function metadata(ctx) {
    const e = ctx.empresa, t = ctx.trabajador, d = ctx.desvinculacion, c = causalImpresa(ctx);
    return {
        empresa: { id: e.id, razon_social: e.razon_social, rut: e.rut, representante_nombre: e.representante_nombre, representante_rut: e.representante_rut, direccion: e.direccion },
        trabajador: { id: t.id, nombre: t.nombre, rut: t.rut, cargo: t.cargo_nombre, obra: t.obra_nombre },
        desvinculacion: {
            id: d.id,
            fecha_inicio: fechaInicio(ctx),
            fecha_desvinculacion: d.fecha_desvinculacion,
            causal_registrada: { codigo: d.causal_codigo, nombre: d.causal?.nombre ?? null },
            causal_impresa: { codigo: c.codigo, nombre: c.nombre, articulo_texto: c.articulo_texto },
        },
        finiquito: { fecha: fechaFiniquito(ctx), lugar_firma: lugarFirma(ctx), haberes: haberes(ctx), descuentos: descuentos(ctx), total: total(ctx) },
    };
}

module.exports = {
    codigo: 'FINIQUITO',
    version: '1.0',
    titulo: 'Finiquito de Trabajador',
    MAX_LINEAS,
    LUGAR_DEFAULT,
    requiere,
    nombreBase: (ctx) => `Finiquito_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata,
    /** Solo para tests. */
    _interno: { lineas, total, causalImpresa },
};
