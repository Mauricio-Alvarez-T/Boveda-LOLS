import React from 'react';
import {
    avanzarFaena, teclaFaena, pisosObra, horaFaena, momentoFaena, posicionChispa,
    FAENA_INICIAL, TIC_MS, ALTO_PISO, SUELO_Y, CIELO_ESCRITORIO, CIELO_CELULAR,
} from './faena';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface FondoFaenaProps {
    /** El formulario de inicio de sesión: cada tecla escrita en él sube la obra. */
    formulario: React.RefObject<HTMLFormElement | null>;
    /** El dibujo de la obra (sin el cielo): el login mide si está a la vista antes de demorar el isotipo. */
    escena?: React.Ref<SVGSVGElement>;
    /** Se está entrando: la faena corre al amanecer. */
    entrando: boolean;
    /** «Reducir movimiento»: la escena queda quieta, a medio hacer. */
    quieto?: boolean;
}

/** Avance fijo con «reducir movimiento»: de noche, con la obra a medias. */
const AVANCE_QUIETO = 0.35;

/** Desde aquí la obra va de lado a lado detrás del formulario (el `lg` de Tailwind). */
const ESCRITORIO = '(min-width: 1024px)';

/** Ancho de la maqueta de la obra, en unidades de la escena. */
const ANCHO_ESCENA = 634;
/**
 * En escritorio el dibujo mide 634 / 0,44 de ancho: la obra de la maqueta llena el 44 % de la izquierda (debajo
 * del titular, como el panel de antes) y la ciudad sigue hasta el borde derecho, detrás del formulario.
 */
const ANCHO_ESCRITORIO = 1441;

/** Estrellas en una pantalla de 1440×720; se ubican en % para cualquier tamaño. */
const ESTRELLAS: [number, number][] = [
    [40, 90], [120, 40], [210, 120], [300, 60], [380, 150], [460, 80], [540, 30], [600, 130], [260, 200],
    [500, 220], [90, 230], [420, 260], [330, 30], [570, 300], [700, 60], [780, 180], [860, 40], [940, 250],
    [1010, 110], [1100, 30], [1180, 200], [1260, 90], [1340, 170], [1400, 50], [1220, 300], [980, 330],
    [1120, 420], [760, 380], [1380, 400],
];

/**
 * Edificios: x, ancho y altura del techo. Los de x < 0 y x > 634 quedan fuera del dibujo de la maqueta: los de la
 * izquierda solo asoman en la tablet (escena al centro); los de la derecha, en la tablet y en escritorio.
 */
const EDIFICIOS = [
    { x: -270, w: 74, top: 548 }, { x: -192, w: 92, top: 505 }, { x: -96, w: 92, top: 578 },
    { x: 0, w: 66, top: 560 }, { x: 64, w: 54, top: 520 }, { x: 122, w: 92, top: 590 },
    { x: 326, w: 64, top: 470 }, { x: 396, w: 110, top: 540 }, { x: 588, w: 60, top: 575 },
    { x: 652, w: 84, top: 522 }, { x: 742, w: 64, top: 566 }, { x: 812, w: 100, top: 498 }, { x: 918, w: 86, top: 584 },
];
/** La ciudad que sigue hasta el borde derecho en escritorio (hasta x = 1441). */
const EDIFICIOS_LEJOS = [
    { x: 1012, w: 96, top: 470 }, { x: 1114, w: 64, top: 580 }, { x: 1184, w: 120, top: 520 },
    { x: 1310, w: 70, top: 556 }, { x: 1386, w: 60, top: 600 },
];

/** Líneas de losa del edificio en estructura (el de la derecha). */
const LOSAS_ESTRUCTURA = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => SUELO_Y - ALTO_PISO * k + 0.5);

const VERDE = '129,215,66';

/**
 * Fondo «Faena de madrugada» del inicio de sesión (Marcos 2026-10-30, diseno.md §9.19): una obra de noche con
 * grúas que giran y cargas que se mecen; el edificio del centro sube piso a piso mientras avanza la hora
 * (05:30 → 07:15). Cada tecla escrita lo empuja y saca una chispa; al entrar amanece. Los giros y balizas son
 * CSS (compositor); React solo mueve la hora cada 100 ms. Es decorativo: `aria-hidden`.
 *
 * Desde el 02-11 (opción 2 de «Login · colores de fondo»: «la obra de lado a lado») ocupa TODA la pantalla, fija
 * detrás del logo, el titular y la tarjeta de vidrio del formulario: el mismo cielo de punta a punta, sin el corte
 * entre un panel oscuro y el formulario claro. `--suelo` (alto del suelo, en px de pantalla) lo pone el login,
 * que también lo usa para dejar su pie sobre tierra.
 * - Escritorio: la escena escala con el ANCHO (viewBox de 1441, `xMinYMax`): la obra queda a la izquierda y la
 *   ciudad, con dos grúas más, sigue hasta el borde derecho.
 * - Celular y tablet: la escena se para abajo y al centro (`xMidYMax meet`, alto topado); si la pantalla es más
 *   ancha que la escena, la ciudad sigue a los lados con los edificios de afuera.
 */
export const FondoFaena: React.FC<FondoFaenaProps> = ({ formulario, escena, entrando, quieto = false }) => {
    const [estado, setEstado] = React.useState(FAENA_INICIAL);
    const ancha = useMediaQuery(ESCRITORIO);

    React.useEffect(() => {
        if (quieto) return;
        const reloj = window.setInterval(() => {
            if (document.hidden) return;
            setEstado((e) => avanzarFaena(e, entrando));
        }, TIC_MS);
        return () => window.clearInterval(reloj);
    }, [quieto, entrando]);

    React.useEffect(() => {
        const form = formulario.current;
        if (quieto || !form) return;
        const alEscribir = () => setEstado(teclaFaena);
        form.addEventListener('input', alEscribir);
        return () => form.removeEventListener('input', alEscribir);
    }, [formulario, quieto]);

    const avance = quieto ? AVANCE_QUIETO : estado.avance;
    const amanecio = avance >= 1;
    const pisos = pisosObra(avance);
    const luz = 0.75 * (1 - avance);
    const chispa = posicionChispa(estado.chispas, pisos);
    const edificios = ancha ? [...EDIFICIOS, ...EDIFICIOS_LEJOS] : EDIFICIOS;

    return (
        <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 overflow-hidden"
            style={{ background: ancha ? CIELO_ESCRITORIO : CIELO_CELULAR }}
        >
            {/* Resplandor del amanecer, desde el horizonte (sobre el suelo) */}
            <div
                className="absolute inset-0 transition-opacity duration-1000"
                style={{
                    opacity: 0.15 + avance * 0.85,
                    background: `radial-gradient(${ancha ? '85% 55% at 50%' : '110% 32% at 55%'} calc(100% - var(--suelo)), rgba(${VERDE},0.5), rgba(2,158,77,0.2) 45%, rgba(2,158,77,0) 78%)`,
                }}
            />

            {/* Estrellas: se apagan con el día */}
            <div className="absolute inset-0 transition-opacity duration-1000" style={{ opacity: 1 - avance }}>
                {ESTRELLAS.map(([x, y], i) => (
                    <span
                        key={i}
                        className="faena-titila absolute h-0.5 w-0.5 rounded-full bg-[#D8F5C8] opacity-60"
                        style={{ left: `${(x / 1440) * 100}%`, top: `${(y / 720) * 100}%`, animationDelay: `${-(i * 0.37).toFixed(2)}s` }}
                    />
                ))}
            </div>

            {/* La faena, parada sobre el suelo */}
            <svg
                ref={escena}
                viewBox={`0 230 ${ancha ? ANCHO_ESCRITORIO : ANCHO_ESCENA} ${SUELO_Y - 230}`}
                preserveAspectRatio={ancha ? 'xMinYMax meet' : 'xMidYMax meet'}
                className="absolute inset-x-0 bottom-[var(--suelo)] h-[min(70vw,38dvh,420px)] w-full lg:h-auto"
            >
                <defs>
                    <radialGradient id="faena-sol">
                        <stop offset="0" stopColor="rgb(220,255,190)" stopOpacity="0.95" />
                        <stop offset="0.6" stopColor={`rgb(${VERDE})`} stopOpacity="0.5" />
                        <stop offset="1" stopColor={`rgb(${VERDE})`} stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="faena-chispa">
                        <stop offset="0" stopColor="#FFFFFF" />
                        <stop offset="0.5" stopColor={`rgb(${VERDE})`} stopOpacity="0.8" />
                        <stop offset="1" stopColor={`rgb(${VERDE})`} stopOpacity="0" />
                    </radialGradient>
                    <pattern id="faena-ventanas" width="12" height="14" x="4" y="6" patternUnits="userSpaceOnUse">
                        <circle cx="6" cy="7" r="1.3" fill={`rgb(${VERDE})`} />
                    </pattern>
                    <pattern id="faena-celosia-v" width="6" height="9" patternUnits="userSpaceOnUse">
                        <rect width="6" height="9" fill="#141c17" />
                        <rect width="6" height="2" fill="#2a3b31" />
                    </pattern>
                    <pattern id="faena-celosia-h" width="9" height="6" patternUnits="userSpaceOnUse">
                        <rect width="9" height="6" fill="#141c17" />
                        <rect width="2" height="6" fill="#2a3b31" />
                    </pattern>
                </defs>

                {/* El sol asoma sobre los techos al amanecer, entre las dos grúas grandes */}
                <circle
                    cx="452" cy="530" r="60" fill="url(#faena-sol)"
                    style={{
                        opacity: amanecio ? 1 : 0,
                        transform: amanecio ? 'none' : 'translateY(160px)',
                        transition: 'transform 1.6s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 1s',
                    }}
                />

                {/* Grúa chica del fondo */}
                <g opacity="0.7">
                    <rect x="150" y="420" width="4" height="232" fill="#1a241e" />
                    <g transform="translate(152 420)">
                        <g className="faena-gira-3">
                            <rect x="0" y="-2" width="90" height="4" fill="#1a241e" />
                            <g transform="translate(77 2)">
                                <g className="faena-pendulo">
                                    <rect x="-0.5" y="0" width="1" height="40" fill={`rgba(${VERDE},0.5)`} />
                                    <rect x="-5" y="40" width="10" height="6" fill="#22302a" />
                                </g>
                            </g>
                        </g>
                    </g>
                </g>

                {/* Ciudad: las ventanas se apagan cuando amanece */}
                {edificios.map((b) => (
                    <g key={b.x}>
                        <rect x={b.x} y={b.top} width={b.w} height={SUELO_Y - b.top} fill="#0c110e" />
                        <rect
                            x={b.x} y={b.top} width={b.w} height={SUELO_Y - b.top} fill="url(#faena-ventanas)"
                            className="transition-opacity duration-700" style={{ opacity: luz }}
                        />
                        <rect x={b.x} y={b.top} width={b.w} height="1" fill="rgba(2,158,77,0.35)" />
                    </g>
                ))}

                {/* Grúas de la ciudad del fondo, detrás del formulario: solo en escritorio */}
                {ancha && (
                    <>
                        <rect x="1086" y="300" width="6" height="352" fill="url(#faena-celosia-v)" />
                        <g className="faena-baliza" style={{ animationDelay: '-0.4s' }}>
                            <circle cx="1089" cy="294" r="8" fill="#FF453A" opacity="0.3" />
                            <circle cx="1089" cy="294" r="4" fill="#FF453A" />
                        </g>
                        <g transform="translate(1089 302)">
                            <g className="faena-gira-4">
                                <rect x="0" y="-3" width="190" height="6" fill="url(#faena-celosia-h)" />
                                <g transform="translate(159 3)">
                                    <g className="faena-pendulo" style={{ animationDelay: '-0.4s' }}>
                                        <rect x="-0.5" y="0" width="1" height="90" fill={`rgba(${VERDE},0.6)`} />
                                        <rect x="-12.5" y="90.5" width="25" height="7" fill="#22302a" stroke={`rgb(${VERDE})`} />
                                    </g>
                                </g>
                            </g>
                        </g>
                        <g opacity="0.7">
                            <rect x="1376" y="380" width="6" height="272" fill="url(#faena-celosia-v)" />
                            <g className="faena-baliza" style={{ animationDelay: '-1s' }}>
                                <circle cx="1379" cy="374" r="8" fill="#FF453A" opacity="0.3" />
                                <circle cx="1379" cy="374" r="4" fill="#FF453A" />
                            </g>
                            <g transform="translate(1379 382)">
                                <g className="faena-gira-3" style={{ animationDelay: '-11s' }}>
                                    <rect x="0" y="-3" width="120" height="6" fill="url(#faena-celosia-h)" />
                                    <g transform="translate(89 3)">
                                        <g className="faena-pendulo" style={{ animationDelay: '-1s' }}>
                                            <rect x="-0.5" y="0" width="1" height="60" fill={`rgba(${VERDE},0.6)`} />
                                            <rect x="-12.5" y="60.5" width="25" height="7" fill="#22302a" stroke={`rgb(${VERDE})`} />
                                        </g>
                                    </g>
                                </g>
                            </g>
                        </g>
                    </>
                )}

                {/* El edificio en obra: sube un piso cada tanto; el de arriba está a medio hacer */}
                {Array.from({ length: pisos }, (_, k) => {
                    const enObra = k === pisos - 1 && !amanecio;
                    const y = SUELO_Y - (k + 1) * ALTO_PISO;
                    const borde = `rgba(${VERDE},${enObra ? 0.9 : 0.45})`;
                    return (
                        <g key={k} className="faena-sube">
                            <rect x="222.5" y={y + 0.5} width="95" height={ALTO_PISO - 1} fill={enObra ? 'none' : '#0e1411'} stroke={borde} />
                            <rect x="222" y={y + ALTO_PISO - 3} width="96" height="3" fill={borde} />
                        </g>
                    );
                })}
                {estado.chispas > 0 && !quieto && (
                    <circle key={estado.chispas} className="faena-chispa" cx={chispa.x} cy={chispa.y} r="7" fill="url(#faena-chispa)" />
                )}

                {/* Edificio en estructura, a la derecha */}
                <rect x="512.5" y="430.5" width="69" height={SUELO_Y - 431} fill="none" stroke={`rgba(${VERDE},0.45)`} />
                {LOSAS_ESTRUCTURA.filter((y) => y > 431).map((y) => (
                    <rect key={y} x="513" y={y - 0.5} width="68" height="1" fill={`rgba(${VERDE},0.35)`} />
                ))}

                {/* Grúa grande, con la carga verde */}
                <rect x="338" y="300" width="6" height="352" fill="url(#faena-celosia-v)" />
                <g className="faena-baliza">
                    <circle cx="341" cy="294" r="8" fill="#FF453A" opacity="0.3" />
                    <circle cx="341" cy="294" r="4" fill="#FF453A" />
                </g>
                <g transform="translate(341 302)">
                    <g className="faena-gira-1">
                        <rect x="0" y="-3" width="200" height="6" fill="url(#faena-celosia-h)" />
                        <g transform="translate(163 3)">
                            <g className="faena-pendulo">
                                <rect x="-0.5" y="0" width="1" height="80" fill={`rgba(${VERDE},0.6)`} />
                                <rect x="-15" y="80" width="30" height="9" fill="#029E4D" />
                            </g>
                        </g>
                    </g>
                </g>

                {/* Grúa de la derecha */}
                <rect x="596" y="250" width="6" height="402" fill="url(#faena-celosia-v)" />
                <g className="faena-baliza" style={{ animationDelay: '-0.7s' }}>
                    <circle cx="599" cy="244" r="8" fill="#FF453A" opacity="0.3" />
                    <circle cx="599" cy="244" r="4" fill="#FF453A" />
                </g>
                <g transform="translate(599 252)">
                    <g className="faena-gira-2">
                        <rect x="0" y="-3" width="170" height="6" fill="url(#faena-celosia-h)" />
                        <g transform="translate(142 3)">
                            <g className="faena-pendulo" style={{ animationDelay: '-1.2s' }}>
                                <rect x="-0.5" y="0" width="1" height="110" fill={`rgba(${VERDE},0.6)`} />
                                <rect x="-11.5" y="110.5" width="23" height="7" fill="#22302a" stroke={`rgb(${VERDE})`} />
                            </g>
                        </g>
                    </g>
                </g>
            </svg>

            {/* El suelo no escala: alcanza para que el pie del login quede sobre tierra, sin edificios detrás */}
            <div className="absolute inset-x-0 bottom-0 h-[var(--suelo)] border-t-2 border-[#22302a] bg-[#070908]" />

            {/* La hora: en celular y tablet arriba, a la altura del logo (en uno angosto, sin el momento, para no
                pisar el logo); en escritorio en el suelo, a la derecha */}
            <p
                className="absolute right-5 top-9 text-section font-semibold tracking-[0.04em] tabular-nums sm:right-8 sm:top-[55px] lg:bottom-5 lg:top-auto"
                style={{ color: `rgba(${VERDE},0.85)` }}
            >
                {horaFaena(avance)}<span className="max-[369px]:hidden"> · {momentoFaena(avance)}</span>
            </p>
        </div>
    );
};
