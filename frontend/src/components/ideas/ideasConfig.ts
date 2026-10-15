import { Lightbulb, Hourglass, Bug, type LucideIcon } from 'lucide-react';
import type { ChipTone } from '../ui/Chip';
import type { IdeaTipo, IdeaEstado, IdeaMotivo, IdeaFrecuencia, IdeaAlcance, IdeaBeneficio, Idea } from '../../types/entities';

/**
 * Textos y reglas de presentación de Ideas para Bóveda (mig 120). Una sola fuente
 * para el formulario, "Mis ideas" y la bandeja de revisión.
 * Regla de producto: mejoras del sistema, no mañas (docs/reglas/ideas.md).
 */

/** Nombre del acceso en el menú lateral (una sola fuente: se cambia acá). */
export const ETIQUETA_BUZON_IDEAS = 'Buzón de ideas';

/**
 * Preguntas del formulario según el tipo. Sin mínimo de caracteres (Marcos 15-10:
 * "la persona tiene que escribir lo que siente"): basta con que no quede vacío.
 * "Tengo una idea" pregunta distinto que "Algo me cuesta": es algo NUEVO, no un
 * problema de algo que ya existe.
 */
export interface TextosFormulario {
    resumen: { label: string; placeholder: string };
    detalle: { label: string; placeholder: string };
    /** idea: cómo lo hace hoy (opcional) · falla: qué esperaba (obligatorio) · cuesta: no aplica. */
    esperado?: { label: string; placeholder: string; obligatorio: boolean };
    frecuencia?: string;
    alcance?: string;
    beneficio?: string;
    ejemplo?: { no: string; si: string };
    /** Para el medidor y el aviso junto al botón: "falta contarnos …". */
    falta: { resumen: string; detalle: string; esperado?: string; senales?: string; beneficio?: string };
}

export const FORMULARIOS: Record<IdeaTipo, TextosFormulario> = {
    idea: {
        resumen: { label: '¿Qué se te ocurre?', placeholder: 'Ej: Que Bóveda me avise cuando a un trabajador le vence un documento' },
        detalle: { label: '¿Cómo te lo imaginas?', placeholder: 'Dónde estaría, qué haría y qué verías en la pantalla.' },
        esperado: { label: '¿Cómo lo haces hoy, sin esto?', placeholder: 'Ej: Reviso a mano el Excel de documentos cada lunes', obligatorio: false },
        frecuencia: '¿Cada cuánto lo usarías?',
        alcance: '¿Quién lo usaría?',
        beneficio: '¿Qué ganaríamos?',
        ejemplo: {
            no: '"Que Bóveda sea más moderna."',
            si: '"Que al cerrar la asistencia me llegue un resumen por WhatsApp, para no tener que contarla a mano."',
        },
        falta: { resumen: 'qué se te ocurre', detalle: 'cómo te lo imaginas', senales: 'cada cuánto lo usarías y quién', beneficio: 'qué ganaríamos' },
    },
    cuesta: {
        resumen: { label: '¿Qué te gustaría que cambie?', placeholder: 'Ej: Que el botón Guardar quede siempre a la vista en el celular' },
        detalle: { label: '¿Qué te cuesta o qué no entiendes?', placeholder: 'Cuéntalo como si se lo explicaras a alguien que no ve tu pantalla.' },
        frecuencia: '¿Cada cuánto te pasa?',
        alcance: '¿A quién afecta?',
        beneficio: '¿Qué ganaríamos?',
        ejemplo: {
            no: '"Cambiar el botón de lugar."',
            si: '"En el celular el botón Guardar queda abajo y no se ve. Dos veces creí que había guardado y no se guardó."',
        },
        falta: { resumen: 'qué te gustaría que cambie', detalle: 'qué te cuesta', senales: 'cada cuánto te pasa y a quién afecta', beneficio: 'qué ganaríamos' },
    },
    falla: {
        resumen: { label: '¿Qué estabas haciendo?', placeholder: 'Ej: Estaba guardando la asistencia de la obra' },
        detalle: { label: '¿Qué pasó?', placeholder: 'Ej: Toqué Guardar, salió un error rojo y la lista quedó vacía.' },
        esperado: { label: '¿Qué esperabas que pasara?', placeholder: 'Ej: Que se guardara y quedara marcado en verde.', obligatorio: true },
        falta: { resumen: 'qué estabas haciendo', detalle: 'qué pasó', esperado: 'qué esperabas que pasara' },
    },
};

/** "¿Quién lo usaría?" en primera persona para una idea nueva. */
export const ALCANCES_IDEA: Record<IdeaAlcance, string> = {
    solo_yo: 'Solo yo',
    equipo: 'Mi equipo',
    obra: 'Toda la obra',
    todos: 'Todos',
};

export const TIPOS: Record<IdeaTipo, { label: string; ayuda: string; icon: LucideIcon; tone: ChipTone }> = {
    idea: { label: 'Tengo una idea', ayuda: 'Algo nuevo que haría mejor el trabajo', icon: Lightbulb, tone: 'neutral' },
    cuesta: { label: 'Algo me cuesta', ayuda: 'Funciona, pero toma más tiempo o pasos de los que debería', icon: Hourglass, tone: 'neutral' },
    falla: { label: 'Algo no funciona', ayuda: 'Un error: sale un mensaje, no guarda, se ve mal', icon: Bug, tone: 'danger' },
};

/** Color = significado: pendiente es ámbar (por hacer), aceptada azul (en curso), hecha verde, desechada neutra (no es un error). */
export const ESTADOS: Record<IdeaEstado, { label: string; labelAutor: string; tone: ChipTone }> = {
    pendiente: { label: 'Pendiente', labelAutor: 'Enviada', tone: 'warning' },
    aceptada: { label: 'Aceptada', labelAutor: 'Aceptada', tone: 'info' },
    hecha: { label: 'Hecha', labelAutor: 'Hecha', tone: 'success' },
    desechada: { label: 'Desechada', labelAutor: 'No por ahora', tone: 'neutral' },
};

export const MOTIVOS: Record<IdeaMotivo, { label: string; corto: string; sugerencia: string }> = {
    preferencia: {
        label: 'Es una preferencia personal, no un problema del sistema',
        corto: 'Preferencia personal',
        sugerencia: 'Gracias por proponerla. La revisamos y es más una preferencia que un problema del sistema, así que por ahora la dejamos como está.',
    },
    ya_existe: {
        label: 'Ya existe: Bóveda ya lo hace',
        corto: 'Ya existe',
        sugerencia: 'Bóveda ya lo hace: ',
    },
    regla_negocio: {
        label: 'Choca con una regla del negocio',
        corto: 'Regla del negocio',
        sugerencia: 'No la podemos hacer así porque choca con una regla de la empresa: ',
    },
    no_compensa: {
        label: 'No por ahora: cuesta mucho para lo que se gana',
        corto: 'No compensa',
        sugerencia: 'La revisamos y hoy cuesta mucho hacerla para lo que se ganaría. Si el problema crece, la volvemos a mirar.',
    },
    duplicada: {
        label: 'Ya la propuso alguien más',
        corto: 'Repetida',
        sugerencia: 'Alguien más propuso lo mismo y ya la estamos revisando. Gracias por sumarte.',
    },
};

export const FRECUENCIAS: Record<IdeaFrecuencia, string> = {
    diaria: 'Todos los días',
    semanal: 'Cada semana',
    ocasional: 'De vez en cuando',
};

export const ALCANCES: Record<IdeaAlcance, string> = {
    solo_yo: 'Solo a mí',
    equipo: 'A mi equipo',
    obra: 'A toda la obra',
    todos: 'A todos',
};

export const BENEFICIOS: Record<IdeaBeneficio, string> = {
    tiempo: 'Ahorra tiempo',
    errores: 'Evita errores',
    informacion: 'Información que hoy no tengo',
    otro: 'Otro',
};

/** Las cinco preguntas que se hacen igual a todas las ideas antes de decidir. */
export const CRITERIOS = [
    '¿Resuelve un problema real, o es una preferencia?',
    '¿Le sirve a más de una persona o rol?',
    '¿Ahorra tiempo, evita errores o da información para decidir?',
    '¿Respeta lo que otros usan y las reglas del negocio?',
    '¿Lo que cuesta hacerla se justifica con lo que se gana?',
];

/** Pantalla legible a partir de la ruta (se guarda junto a la idea). */
const PANTALLAS: Record<string, string> = {
    '': 'Inicio',
    asistencia: 'Asistencia',
    consultas: 'Gestiones',
    inventario: 'Inventario',
    vehiculos: 'Vehículos',
    'obras-finalizadas': 'Obras Finalizadas',
    ayuda: 'Ayuda',
    configuracion: 'Configuración',
    ideas: 'Ideas',
};

export function nombrePantalla(pathname: string, search = ''): string {
    const base = PANTALLAS[pathname.replace(/^\/+/, '').split('/')[0]] ?? 'Bóveda';
    const tab = new URLSearchParams(search).get('tab');
    return tab && tab !== 'inicio' ? `${base} · ${tab.replace(/[-_]/g, ' ')}` : base;
}

/**
 * Impacto estimado a partir de las señales: frecuencia × alcance. No decide nada:
 * ordena la conversación. "Solo a mí + de vez en cuando" se marca como posible
 * preferencia, que es justo lo que no se quiere construir.
 */
export function impacto(idea: Pick<Idea, 'tipo' | 'frecuencia' | 'alcance'>): { nivel: 'alto' | 'medio' | 'bajo' | null; posiblePreferencia: boolean } {
    if (idea.tipo === 'falla' || !idea.frecuencia || !idea.alcance) return { nivel: null, posiblePreferencia: false };
    const f = { diaria: 3, semanal: 2, ocasional: 1 }[idea.frecuencia];
    const a = { todos: 4, obra: 3, equipo: 2, solo_yo: 1 }[idea.alcance];
    const puntos = f * a;
    return {
        nivel: puntos >= 8 ? 'alto' : puntos >= 4 ? 'medio' : 'bajo',
        posiblePreferencia: idea.alcance === 'solo_yo' && idea.frecuencia === 'ocasional',
    };
}

/** "hace 3 días", "hoy", "ayer". */
export function hace(fecha: string | null | undefined): string {
    if (!fecha) return '';
    const d = new Date(String(fecha).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    if (dias < 30) return `hace ${dias} días`;
    const meses = Math.floor(dias / 30);
    return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}

/** dd/mm/aaaa, como el resto de Bóveda. */
export function fechaCorta(fecha: string | null | undefined): string {
    if (!fecha) return '';
    const d = new Date(String(fecha).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
}

export const primerNombre = (nombre?: string | null) => String(nombre || '').trim().split(/\s+/)[0] || '';
