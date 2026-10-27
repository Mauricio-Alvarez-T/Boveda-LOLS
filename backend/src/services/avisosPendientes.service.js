const db = require('../config/db');
const permisosService = require('./permisos.service');
const transferenciaService = require('./transferencia.service');
const inicioGerencia = require('./inicioGerencia.service');
const avisosCelular = require('./avisosCelular.service');

/**
 * Recordatorios de pendientes al celular (Marcos 2026-10-27, decisión de don Luis; docs/reglas/seguridad-rbac.md
 * § Avisos al celular). De lunes a viernes, sin feriados, a las horas de cada persona. **Solo si tiene algo
 * pendiente de su cargo**: si está al día, no le llega nada. El mensaje va en «usted» y dice cuántos días lleva.
 *
 * Lo pendiente sale de lo MISMO que la persona ve en su Inicio (nada inventado aparte):
 *   · Inventario (`transferenciaService.inicioPerfil`, su alcance): quien aprueba → por aprobar + diferencias por
 *     resolver; «Ver diferencias» → diferencias por revisar; la obra (recibe) → aprobadas o en camino por recibir.
 *   · Fichas de ingreso por aprobar (`trabajadores.solicitud.aprobar`).
 *   · Papeles laborales atrasados y contratos vencidos o por vencer (bloques del Inicio de gerencia), para quien
 *     emite documentos laborales / edita trabajadores (RR.HH).
 *   · Asistencia de hoy sin registrar en su obra (a las 12:00 en adelante), para quien guarda asistencia.
 *   · Don Luis (`inicio.gerencia`): un solo resumen con los temas que esperan su decisión.
 * Lo corre el cron (scripts/avisos_programados.js); cada envío queda en `avisos_celular_envios` (uno por persona,
 * día y hora: el cron puede pasar dos veces sin repetir el aviso).
 */

/**
 * Quién y a qué horas (horas de Chile). Por correo: si la persona no existe en ese entorno, se salta.
 * `computador`: trabaja casi siempre en el computador (Marcos 2026-10-27) → también se le piden los avisos ahí. El
 * recordatorio llega SIEMPRE al celular; al computador solo si no tiene Bóveda abierto al frente (ya está ahí).
 */
const HORARIO = [
    { email: 'paulamartinez@lols.cl', horas: [8, 14], computador: true },
    { email: 'leonardolopez@lols.cl', horas: [8, 12] },
    { email: 'hectorgomez@lols.cl', horas: [8, 12] },
    { email: 'matiasmillanao@lols.cl', horas: [8, 12], computador: true },
    { email: 'daphnelazcano@lols.cl', horas: [8, 12], computador: true },
    { email: 'hectorherrera@lols.cl', horas: [8, 12], computador: true },
    { email: 'luislazcano@lols.cl', horas: [12], computador: true },
    { email: 'francogutierrez@lols.cl', horas: [8, 12] },
    { email: 'alfonsocastilla@lols.cl', horas: [8, 12] },
    { email: 'jhoanvasquez@lols.cl', horas: [8, 12] },
];
const HORAS = [...new Set(HORARIO.flatMap(h => h.horas))].sort((a, b) => a - b);
/** Minutos después de la hora en que todavía se manda (el cron pasa cada 5 min; si se cayó un rato, igual sale). */
const VENTANA_MIN = 30;

const plural = (n, uno, varios) => (n === 1 ? uno : varios);
const dias = (d) => Math.max(0, Math.trunc(Number(d)) || 0);

/** «lleva 3 días» / «lleva 1 día» / «desde hoy». */
function textoDias(d) {
    const n = dias(d);
    if (n === 0) return 'desde hoy';
    return `lleva ${n} ${plural(n, 'día', 'días')}`;
}

/** ¿Está en el horario de recordatorios? (para pedirle que active los avisos). */
function estaEnHorario(email) {
    const e = String(email || '').toLowerCase();
    return HORARIO.some(h => h.email === e);
}

/** ¿Se le piden también en el computador? (los que trabajan casi siempre ahí). */
function debeActivarComputador(email) {
    const e = String(email || '').toLowerCase();
    return HORARIO.some(h => h.email === e && h.computador);
}

/** Lo pendiente de una persona. Cada ítem: { clave, n, texto, dias, url }. */
async function pendientesDe(usuario, hora) {
    const p = await permisosService.getPermisosEfectivos(usuario.id, usuario.rol_id);
    const tiene = (k) => p.includes(k);
    const user = { id: usuario.id, rol_id: usuario.rol_id, obra_id: usuario.obra_id, bodega_id: usuario.bodega_id, p };
    const items = [];

    // Don Luis: un solo resumen (los temas de su Inicio de gerencia).
    if (tiene('inicio.gerencia')) {
        const g = await inicioGerencia.getGerencia(p);
        const temas = [];
        const sumar = (n, uno, varios) => { if (n > 0) temas.push(`${n} ${plural(n, uno, varios)}`); };
        sumar(g.solicitudes?.total || 0, 'solicitud trabada', 'solicitudes trabadas');
        sumar((g.contratos?.vencidos || 0) + (g.contratos?.por_vencer || 0), 'contrato vencido o por vencer', 'contratos vencidos o por vencer');
        sumar((g.documentos?.vencidos || 0), 'documento de trabajador vencido', 'documentos de trabajadores vencidos');
        sumar(g.papeles?.total || 0, 'papel laboral atrasado', 'papeles laborales atrasados');
        sumar((g.vehiculos?.total_vehiculos || 0), 'vehículo con papeles vencidos o por vencer', 'vehículos con papeles vencidos o por vencer');
        sumar(g.perdidas?.n || 0, 'pérdida en Inventario', 'pérdidas en Inventario');
        sumar(g.faltas?.total || 0, 'trabajador con faltas reiteradas', 'trabajadores con faltas reiteradas');
        if (temas.length) {
            return [{ clave: 'gerencia', n: temas.length, texto: temas.join(', '), dias: null, url: '/', gerencia: true }];
        }
        return [];
    }

    // Inventario: lo de su cargo según su Inicio.
    if (tiene('inventario.ver')) {
        const r = await transferenciaService.inicioPerfil(user);
        const c = r?.circuito || {};
        const puede = r?.puede || {};
        if (puede.aprobar && c.pedida?.total > 0) {
            items.push({ clave: 'aprobar', n: c.pedida.total, texto: `${c.pedida.total} ${plural(c.pedida.total, 'solicitud por aprobar', 'solicitudes por aprobar')}`, dias: c.pedida.dias, url: '/inventario?tab=transferencias' });
        }
        if ((puede.aprobar || puede.ver_diferencias) && c.diferencias?.total > 0) {
            const verbo = puede.aprobar ? 'por resolver' : 'por revisar';
            items.push({ clave: 'diferencias', n: c.diferencias.total, texto: `${c.diferencias.total} ${plural(c.diferencias.total, `diferencia ${verbo}`, `diferencias ${verbo}`)}`, dias: c.diferencias.dias, url: '/inventario?tab=transferencias' });
        }
        if (!puede.aprobar && !puede.ver_diferencias && puede.recibir) {
            const n = (c.aprobada?.total || 0) + (c.despachada?.total || 0);
            const d = Math.max(dias(c.aprobada?.dias), dias(c.despachada?.dias));
            if (n > 0) items.push({ clave: 'recibir', n, texto: `${n} ${plural(n, 'solicitud aprobada por recibir', 'solicitudes aprobadas por recibir')}`, dias: d, url: '/inventario?tab=transferencias' });
        }
    }

    // Fichas de ingreso por aprobar.
    if (tiene('trabajadores.solicitud.aprobar')) {
        const [[f]] = await db.query(
            `SELECT COUNT(*) AS n, MAX(DATEDIFF(CURDATE(), s.fecha_solicitud)) AS dias
               FROM solicitudes_ingreso s
              WHERE s.estado = 'pendiente'
                AND (s.obra_id IS NULL OR s.obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1))`
        );
        const n = Number(f?.n) || 0;
        if (n > 0) items.push({ clave: 'fichas', n, texto: `${n} ${plural(n, 'ficha de ingreso por aprobar', 'fichas de ingreso por aprobar')}`, dias: f.dias, url: '/consultas?tab=solicitudes' });
    }

    // RR.HH: papeles laborales atrasados y contratos.
    if (tiene('documentos.laborales.emitir') || tiene('trabajadores.editar')) {
        const papeles = tiene('documentos.ver') ? await inicioGerencia._internal.papeles().catch(() => null) : null;
        if (papeles?.total > 0) {
            const d = Math.max(0, ...(papeles.lista || []).map(i => dias(i.dias)));
            items.push({ clave: 'papeles', n: papeles.total, texto: `${papeles.total} ${plural(papeles.total, 'papel laboral atrasado', 'papeles laborales atrasados')}`, dias: d, url: '/consultas' });
        }
        const contratos = tiene('trabajadores.ver') ? await inicioGerencia._internal.contratos().catch(() => null) : null;
        if (contratos && (contratos.vencidos > 0 || contratos.por_vencer > 0)) {
            const partes = [];
            if (contratos.vencidos > 0) partes.push(`${contratos.vencidos} ${plural(contratos.vencidos, 'contrato vencido', 'contratos vencidos')}`);
            if (contratos.por_vencer > 0) partes.push(`${contratos.por_vencer} por vencer`);
            items.push({ clave: 'contratos', n: contratos.vencidos + contratos.por_vencer, texto: partes.join(' y '), dias: null, url: '/' });
        }
    }

    // Asistencia de hoy sin registrar en su obra (desde el mediodía).
    if (hora >= 12 && tiene('asistencia.guardar') && usuario.obra_id) {
        const [[a]] = await db.query(
            `SELECT o.nombre AS obra, o.activa, o.finalizada,
                    (SELECT COUNT(*) FROM asistencias x WHERE x.obra_id = o.id AND x.fecha = CURDATE()) AS n
               FROM obras o WHERE o.id = ?`,
            [usuario.obra_id]
        );
        if (a && Number(a.activa) === 1 && Number(a.finalizada) !== 1 && Number(a.n) === 0) {
            items.push({ clave: 'asistencia', n: 1, texto: `la asistencia de hoy en ${a.obra} sin registrar`, dias: 0, url: '/asistencia' });
        }
    }

    // Lo más antiguo primero.
    return items.sort((x, y) => dias(y.dias) - dias(x.dias));
}

/** El aviso (título y texto, en «usted») para esos pendientes; null si no hay nada. */
function mensajeDe(items) {
    if (!items || !items.length) return null;
    if (items[0].gerencia) {
        const n = items[0].n;
        return {
            titulo: `${n} ${plural(n, 'tema espera', 'temas esperan')} su decisión`,
            cuerpo: `${items[0].texto.charAt(0).toUpperCase()}${items[0].texto.slice(1)}. Revíselos en Bóveda.`,
            url: '/',
        };
    }
    if (items.length === 1) {
        const i = items[0];
        if (i.clave === 'asistencia') {
            return { titulo: 'Asistencia de hoy pendiente', cuerpo: `Tiene ${i.texto}. Regístrela en Bóveda.`, url: i.url };
        }
        const cuando = i.dias == null ? '' : dias(i.dias) === 0 ? 'Llegó hoy. ' : `${i.n > 1 ? 'La más antigua lleva' : 'Lleva'} ${dias(i.dias)} ${plural(dias(i.dias), 'día', 'días')} esperando. `;
        return { titulo: `Tiene ${i.texto}`, cuerpo: `${cuando}Revise en Bóveda.`, url: i.url };
    }
    const partes = items.map(i => (i.dias == null || i.clave === 'asistencia' ? i.texto : `${i.texto} (${textoDias(i.dias)})`));
    return { titulo: `Tiene ${items.length} pendientes en Bóveda`, cuerpo: `${partes.join(' · ')}. Revise en Bóveda.`, url: items[0].url };
}

/**
 * La ronda de una hora: a cada persona de esa hora le manda su aviso (si tiene pendientes y no se le mandó ya).
 * Devuelve un resumen para el log del cron.
 */
async function enviarRonda(hora, fecha) {
    const personas = HORARIO.filter(h => h.horas.includes(hora));
    await avisosCelular.limpiarMensajes();
    let avisados = 0;
    let alDia = 0;
    let sinCelular = 0;
    let yaEnviados = 0;
    for (const h of personas) {
        const [[u]] = await db.query('SELECT id, nombre, rol_id, obra_id, bodega_id FROM usuarios WHERE email = ? AND activo = 1', [h.email]);
        if (!u) continue;
        // Reservar el envío de hoy a esta hora (si dos pasadas del cron se cruzan, solo una sigue).
        const [r] = await db.query('INSERT IGNORE INTO avisos_celular_envios (usuario_id, fecha, hora) VALUES (?, ?, ?)', [u.id, fecha, hora]);
        if (!r.affectedRows) { yaEnviados++; continue; }
        let items = [];
        try { items = await pendientesDe(u, hora); } catch (e) { items = []; }
        const m = mensajeDe(items);
        let enviados = 0;
        if (m) {
            const res = await avisosCelular.enviarA([u.id], { ...m, etiqueta: `pendientes-${hora}`, tipo: `recordatorio ${hora}:00`, computadorSoloSiNoEsta: true });
            enviados = res.enviados;
            if (enviados) {
                avisados++;
            } else {
                // Tiene pendientes pero ningún celular activo todavía: se libera la reserva para que las pasadas
                // siguientes de la ventana (30 min) lo vuelvan a intentar, por si los activa en ese rato.
                sinCelular++;
                await db.query('DELETE FROM avisos_celular_envios WHERE usuario_id = ? AND fecha = ? AND hora = ?', [u.id, fecha, hora]);
                continue;
            }
        } else {
            alDia++;
        }
        await db.query(
            'UPDATE avisos_celular_envios SET pendientes = ?, enviados = ?, resumen = ? WHERE usuario_id = ? AND fecha = ? AND hora = ?',
            [items.length, enviados, m ? `${m.titulo} — ${m.cuerpo}`.slice(0, 255) : 'al día', u.id, fecha, hora]
        );
    }
    return `recordatorios de las ${hora}:00 → ${avisados} avisado(s), ${alDia} al día, ${sinCelular} sin celular activo, ${yaEnviados} ya enviado(s)`;
}

/** Fecha, minuto y día de la semana en Chile. */
function ahoraChile(d = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(d);
    const g = (t) => p.find(x => x.type === t).value;
    return { fecha: `${g('year')}-${g('month')}-${g('day')}`, minutos: (Number(g('hour')) % 24) * 60 + Number(g('minute')), dia: g('weekday') };
}

/** ¿Hay ronda ahora? → la hora, o null (fin de semana, feriado o fuera de las ventanas). */
async function horaDeRonda(ahora = ahoraChile()) {
    if (ahora.dia === 'Sat' || ahora.dia === 'Sun') return null;
    const hora = HORAS.find(hh => ahora.minutos >= hh * 60 && ahora.minutos <= hh * 60 + VENTANA_MIN);
    if (hora === undefined) return null;
    const [[f]] = await db.query("SELECT COUNT(*) AS n FROM feriados WHERE fecha = ? AND activo = 1 AND tipo <> 'obra'", [ahora.fecha]);
    if (Number(f?.n) > 0) return null;
    return hora;
}

module.exports = { HORARIO, HORAS, VENTANA_MIN, estaEnHorario, debeActivarComputador, pendientesDe, mensajeDe, enviarRonda, ahoraChile, horaDeRonda, textoDias };
