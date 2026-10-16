/**
 * Lectura del itemizado desde Excel en el navegador (Costos de obra, mig 122).
 *
 * Cada constructora arma su Excel distinto, así que no se exige una plantilla: se
 * busca la fila de encabezados por nombre (Ítem, Descripción/Partida, Unidad,
 * Cantidad, Precio unitario, Capítulo…). Si no hay columna de capítulo, se usa la
 * convención más común: una fila con texto pero SIN cantidad ni precio es el título
 * del capítulo que sigue ("OBRA GRUESA", "2. TERMINACIONES"). Las filas de totales
 * ("Total", "Subtotal", "Costo directo", "IVA"…) se descartan.
 *
 * ExcelJS se carga recién al importar (import dinámico) para no engordar la pantalla.
 */

export interface FilaImportada {
    capitulo: string;
    codigo: string | null;
    descripcion: string;
    unidad: string | null;
    cantidad: number;
    precio_unitario: number;
}

export interface ResultadoLectura {
    filas: FilaImportada[];
    hoja: string;
    columnas: Record<string, string>;   // campo → encabezado encontrado
    descartadas: number;
    advertencias: string[];
}

const SINONIMOS: Record<string, string[]> = {
    capitulo: ['capitulo', 'capítulo', 'familia', 'grupo', 'seccion', 'sección'],
    codigo: ['item', 'ítem', 'cod', 'codigo', 'código', 'n°', 'nº', 'no'],
    descripcion: ['descripcion', 'descripción', 'partida', 'designacion', 'designación', 'detalle', 'glosa'],
    unidad: ['unidad', 'un', 'und', 'ud', 'u', 'unid'],
    cantidad: ['cantidad', 'cant', 'cubicacion', 'cubicación', 'metrado'],
    precio_unitario: ['precio unitario', 'p.u.', 'pu', 'p. unitario', 'precio unit', 'valor unitario', 'v. unitario', 'precio', 'unitario'],
};

const TOTALES = /^(sub\s*total|total|costo\s+directo|gastos\s+generales|utilidad|imprevistos|neto|iva|valor\s+total)\b/i;

const normalizar = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Valor de una celda de ExcelJS (número, texto, fórmula con resultado, texto enriquecido). */
function valor(c: unknown): unknown {
    if (c === null || c === undefined) return null;
    if (typeof c === 'object') {
        const o = c as { result?: unknown; richText?: { text: string }[]; text?: string };
        if ('result' in o) return o.result ?? null;
        if (Array.isArray(o.richText)) return o.richText.map(r => r.text).join('');
        if (typeof o.text === 'string') return o.text;
    }
    return c;
}

/** Número desde una celda: ya numérico, o texto en formato chileno ("1.234,5", "$ 45.000"). */
export function aNumero(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

export async function leerPresupuestoExcel(archivo: File): Promise<ResultadoLectura> {
    const ExcelJS = (await import('exceljs')).default;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await archivo.arrayBuffer());
    const hoja = libro.worksheets.find(h => h.rowCount > 0);
    if (!hoja) throw new Error('El archivo no tiene hojas con datos.');

    // Filas como arreglos de valores (1-indexado en ExcelJS → 0-indexado acá).
    const filas: unknown[][] = [];
    hoja.eachRow({ includeEmpty: false }, fila => {
        const vals = (fila.values as unknown[]).slice(1).map(valor);
        filas.push(vals);
    });

    // Encabezados: la primera fila (de las 30 primeras) donde aparezcan al menos
    // descripción y (cantidad o precio).
    let filaEnc = -1;
    let mapa: Record<string, number> = {};
    for (let i = 0; i < Math.min(30, filas.length) && filaEnc < 0; i++) {
        const m: Record<string, number> = {};
        filas[i].forEach((c, j) => {
            const t = normalizar(c);
            if (!t) return;
            for (const [campo, lista] of Object.entries(SINONIMOS)) {
                if (m[campo] !== undefined) continue;
                if (lista.some(s => t === s || (s.length > 3 && t.startsWith(s)))) { m[campo] = j; break; }
            }
        });
        if (m.descripcion !== undefined && (m.cantidad !== undefined || m.precio_unitario !== undefined)) { filaEnc = i; mapa = m; }
    }
    if (filaEnc < 0) {
        throw new Error('No encontré la fila de encabezados. El Excel tiene que tener columnas como "Descripción" o "Partida", "Cantidad" y "Precio unitario".');
    }

    const encabezados = filas[filaEnc];
    const columnas: Record<string, string> = {};
    for (const [campo, j] of Object.entries(mapa)) columnas[campo] = String(encabezados[j] ?? '');

    const advertencias: string[] = [];
    if (mapa.precio_unitario === undefined) advertencias.push('No encontré la columna de precio unitario: las partidas quedan en $0 y se pueden completar después.');
    if (mapa.cantidad === undefined) advertencias.push('No encontré la columna de cantidad: las partidas quedan en 0 y se pueden completar después.');

    const resultado: FilaImportada[] = [];
    let capituloActual = 'General';
    let descartadas = 0;
    for (const f of filas.slice(filaEnc + 1)) {
        const desc = String(f[mapa.descripcion] ?? '').trim();
        const cant = mapa.cantidad !== undefined ? aNumero(f[mapa.cantidad]) : null;
        const pu = mapa.precio_unitario !== undefined ? aNumero(f[mapa.precio_unitario]) : null;
        const cap = mapa.capitulo !== undefined ? String(f[mapa.capitulo] ?? '').trim() : '';
        const cod = mapa.codigo !== undefined ? String(f[mapa.codigo] ?? '').trim() : '';

        if (!desc) { if (cap) capituloActual = cap; else descartadas++; continue; }
        if (TOTALES.test(normalizar(desc))) { descartadas++; continue; }
        // Fila de título de capítulo: con texto pero sin cantidad ni precio.
        if (mapa.capitulo === undefined && cant === null && pu === null) {
            capituloActual = desc.replace(/^[\d.]+\s*[-.)]?\s*/, '').trim() || desc;
            continue;
        }
        resultado.push({
            capitulo: (cap || capituloActual).slice(0, 150),
            codigo: cod ? cod.slice(0, 30) : null,
            descripcion: desc.slice(0, 300),
            unidad: mapa.unidad !== undefined ? (String(f[mapa.unidad] ?? '').trim().slice(0, 20) || null) : null,
            cantidad: cant ?? 0,
            precio_unitario: pu ?? 0,
        });
    }
    if (!resultado.length) throw new Error('Encontré los encabezados, pero ninguna partida debajo.');
    return { filas: resultado, hoja: hoja.name, columnas, descartadas, advertencias };
}

/** Plantilla vacía con el formato que se lee mejor, para quien no tenga su propio Excel. */
export async function descargarPlantilla(): Promise<void> {
    const ExcelJS = (await import('exceljs')).default;
    const { saveAs } = await import('file-saver');
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Presupuesto');
    hoja.columns = [
        { header: 'Capítulo', key: 'capitulo', width: 22 },
        { header: 'Ítem', key: 'codigo', width: 8 },
        { header: 'Descripción', key: 'descripcion', width: 46 },
        { header: 'Unidad', key: 'unidad', width: 9 },
        { header: 'Cantidad', key: 'cantidad', width: 11 },
        { header: 'Precio unitario', key: 'pu', width: 16 },
        { header: 'Total', key: 'total', width: 16 },
    ];
    const ejemplo = [
        ['Obras preliminares', '1.1', 'Instalación de faenas', 'gl', 1, 1500000],
        ['Obra gruesa', '2.1', 'Excavación de fundaciones', 'm3', 60, 9500],
        ['Obra gruesa', '2.2', 'Hormigón H-25 fundaciones', 'm3', 42, 138000],
        ['Obra gruesa', '2.3', 'Enfierradura A630', 'kg', 3800, 1450],
        ['Terminaciones', '3.1', 'Cerámica de piso 60×60', 'm2', 210, 15390],
    ];
    ejemplo.forEach((e, i) => {
        const fila = hoja.addRow(e);
        fila.getCell(7).value = { formula: `E${i + 2}*F${i + 2}` };
    });
    hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF029E4D' } };
    ['F', 'G'].forEach(c => { hoja.getColumn(c).numFmt = '"$"#,##0'; });
    const buf = await libro.xlsx.writeBuffer();
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'plantilla-presupuesto-obra.xlsx');
}
