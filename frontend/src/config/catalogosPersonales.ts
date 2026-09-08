/**
 * Catálogos estáticos de los "Datos personales" de la ficha de ingreso
 * (comuna / AFP / salud). Decisión del dueño (2026-09-08): dropdowns en vez de
 * texto libre; comunas SOLO Región Metropolitana; salud = FONASA + cada isapre.
 *
 * El backend NO valida estos valores como enum a propósito: fichas y
 * trabajadores guardados antes (texto libre) deben seguir siendo editables.
 * `toSelectOptions` conserva ese valor legado como opción extra del select.
 */
/** Misma forma que `SelectOption` de ui/Select (sin importar .tsx: jest del front corre sin --jsx). */
export interface CatalogoOption { value: string; label: string }

/** 52 comunas de la Región Metropolitana de Santiago (orden alfabético). */
export const COMUNAS_RM: readonly string[] = [
    'Alhué', 'Buin', 'Calera de Tango', 'Cerrillos', 'Cerro Navia', 'Colina',
    'Conchalí', 'Curacaví', 'El Bosque', 'El Monte', 'Estación Central',
    'Huechuraba', 'Independencia', 'Isla de Maipo', 'La Cisterna', 'La Florida',
    'La Granja', 'La Pintana', 'La Reina', 'Lampa', 'Las Condes', 'Lo Barnechea',
    'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'María Pinto', 'Melipilla',
    'Ñuñoa', 'Padre Hurtado', 'Paine', 'Pedro Aguirre Cerda', 'Peñaflor',
    'Peñalolén', 'Pirque', 'Providencia', 'Pudahuel', 'Puente Alto', 'Quilicura',
    'Quinta Normal', 'Recoleta', 'Renca', 'San Bernardo', 'San Joaquín',
    'San José de Maipo', 'San Miguel', 'San Pedro', 'San Ramón', 'Santiago',
    'Talagante', 'Tiltil', 'Vitacura',
];

/** AFP vigentes en Chile. */
export const AFP_OPTIONS: readonly string[] = [
    'Capital', 'Cuprum', 'Habitat', 'Modelo', 'PlanVital', 'Provida', 'Uno',
];

/** Previsión de salud: FONASA + isapres abiertas. */
export const SALUD_OPTIONS: readonly string[] = [
    'FONASA', 'Banmédica', 'Colmena', 'Consalud', 'Cruz Blanca',
    'Nueva Masvida', 'Vida Tres', 'Esencial', 'Isalud',
];

/** Tallas de ropa (ficha completa, 2026-09-08). Como strings: así las entrega `register()`. */
const rango = (a: number, b: number): readonly string[] => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
export const TALLAS_CALZADO: readonly string[] = rango(35, 47);
export const TALLAS_PANTALON: readonly string[] = rango(38, 50);
export const TALLAS_POLERA: readonly string[] = ['S', 'M', 'L', 'XL', 'XXL'];

/** Pago de remuneraciones. Con cuenta RUT = Sí el backend fija BancoEstado / vista / RUT sin DV. */
export const BANCO_CUENTA_RUT = 'BancoEstado';
export const BANCOS_CHILE: readonly string[] = [
    'BancoEstado', 'Banco de Chile', 'Banco Santander', 'BCI', 'Scotiabank', 'Banco Itaú',
    'Banco Falabella', 'Banco Ripley', 'Banco Security', 'Banco BICE', 'Banco Internacional',
    'Banco Consorcio', 'HSBC', 'Coopeuch', 'Tenpo', 'Mercado Pago', 'Otro',
];
export const TIPOS_CUENTA: readonly { value: 'vista' | 'corriente'; label: string }[] = [
    { value: 'vista', label: 'Cuenta vista' },
    { value: 'corriente', label: 'Cuenta corriente' },
];
export const CUENTA_RUT_OPTIONS: readonly { value: 'si' | 'no'; label: string }[] = [
    { value: 'si', label: 'Sí' },
    { value: 'no', label: 'No' },
];

/**
 * Lista → opciones de select. Si `actual` trae un valor que no está en la
 * lista (dato legado en texto libre), se agrega al final para que el select
 * lo muestre y no se pierda al re-guardar.
 */
export function toSelectOptions(lista: readonly string[], actual?: string | null): CatalogoOption[] {
    const opts: CatalogoOption[] = lista.map(v => ({ value: v, label: v }));
    const legado = (actual ?? '').trim();
    if (legado && !lista.includes(legado)) opts.push({ value: legado, label: legado });
    return opts;
}
