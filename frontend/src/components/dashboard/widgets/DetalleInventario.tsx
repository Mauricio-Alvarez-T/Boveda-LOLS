import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Package, PackageCheck, RotateCcw } from 'lucide-react';
import api from '../../../services/api';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton, SkeletonText } from '../../ui/Skeleton';
import { CabezaFicha, EnlaceFicha, Ficha, FiltroFichas, GrillaFichas, Pildora, PieFicha, RotuloFichas } from './FichaInicio';
import { CIFRA, iniciales, plural } from './fichasInicio';
import {
    ariaCamino, bajadaFicha, cantidadDiferencia, cantidadItem, filtrarYOrdenar, fraseFicha, opcionesFiltro, pasosCamino,
    pildorasFicha, PASOS_CAMINO, rutaFicha, rutaLista, textoAccion, textoDesplegar, tituloFicha, tonoEdad,
    type EstadoPaso, type EtapaFicha, type FichaInventarioApi, type FichasInventarioApi, type FiltroFicha,
} from './fichasInventarioInicio';

/** Fichas a la vista; el resto con «Ver las N» (como el lienzo). */
const VISIBLES = 9;

/** Clases literales por paso del camino (JIT de Tailwind). */
const PUNTO: Record<Exclude<EstadoPaso, 'en_curso'>, string> = {
    hecho: 'bg-zinc-700 dark:bg-zinc-300',
    con_diferencias: 'bg-red-600 dark:bg-red-500',
    falta: 'border border-dashed border-border bg-card',
};

/**
 * Camino P·A·D·R de la solicitud (del lienzo): hecho relleno, el paso en curso como anillo (azul en tránsito,
 * ámbar en el resto), lo que falta punteado y, en diferencias, la R en rojo. Unos 94 px de ancho fijo.
 */
const CaminoSolicitud: React.FC<{ etapa: EtapaFicha; tipoFlujo: string | null }> = ({ etapa, tipoFlujo }) => {
    const pasos = pasosCamino(etapa, tipoFlujo);
    const anillo = etapa === 'por_recibir' ? 'border-blue-500' : 'border-amber-500';
    return (
        <div role="img" aria-label={ariaCamino(pasos)} className="shrink-0">
            <div className="grid grid-cols-[16px_10px_16px_10px_16px_10px_16px] items-center" aria-hidden>
                {PASOS_CAMINO.map((p, i) => {
                    const e = pasos[i];
                    return (
                        <React.Fragment key={p.letra}>
                            {i > 0 && <span className={cn('h-0.5', e === 'falta' ? 'bg-border' : 'bg-zinc-400 dark:bg-zinc-500')} />}
                            <span className={cn('box-border h-4 w-4 rounded-full', e === 'en_curso' ? cn('border-2 bg-card', anillo) : PUNTO[e])} />
                        </React.Fragment>
                    );
                })}
            </div>
            <div className="mt-1 grid grid-cols-[16px_10px_16px_10px_16px_10px_16px]" aria-hidden>
                {PASOS_CAMINO.map((p, i) => (
                    <React.Fragment key={p.letra}>
                        {i > 0 && <span />}
                        <span className={cn('text-center text-micro',
                            pasos[i] === 'en_curso' || pasos[i] === 'con_diferencias' ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>
                            {p.letra}
                        </span>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

const FILA_LISTA = 'flex items-start justify-between gap-3 border-t border-border py-1.5 text-section first:border-t-0';

/** Lo que se despliega dentro de la ficha: los ítems pedidos o, en diferencias, qué llegó de cada uno. */
const ListaFicha: React.FC<{ f: FichaInventarioApi }> = ({ f }) => (
    <ul className="rounded-xl bg-muted/60 px-3 py-2">
        {f.etapa === 'discrepancias'
            ? f.diferencias.map(d => (
                <li key={d.id} className={FILA_LISTA}>
                    <span className="min-w-0 break-words">{d.nombre}</span>
                    <span className={cn('shrink-0 font-semibold tabular-nums', CIFRA[d.diferencia > 0 ? 'rojo' : 'ambar'])}>{cantidadDiferencia(d)}</span>
                </li>
            ))
            // Ítems de catálogo y custom vienen de tablas distintas: el nombre evita que dos ids iguales choquen.
            : f.items.map(i => (
                <li key={`${i.id}-${i.nombre}`} className={FILA_LISTA}>
                    <span className="min-w-0 break-words">{i.nombre}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{cantidadItem(i)}</span>
                </li>
            ))}
    </ul>
);

/** Ficha de una solicitud: quién pide, hacia dónde, cuántos días espera, en qué paso va y qué le toca a quien mira. */
const FichaSolicitud: React.FC<{ f: FichaInventarioApi; onAccion: () => void }> = ({ f, onAccion }) => {
    const [abierta, setAbierta] = useState(false);
    const edad = tonoEdad(f.dias);
    const ini = f.solicitante_nombre ? iniciales(f.solicitante_nombre) : '';
    const desplegar = textoDesplegar(f, abierta);
    return (
        <Ficha>
            <CabezaFicha circulo={ini || <Package className="h-4 w-4" />} tonoCirculo={edad === 'rojo' ? 'rojo' : 'neutro'}
                titulo={tituloFicha(f)} bajada={bajadaFicha(f)}
                cifra={f.dias} etiqueta={plural(f.dias, 'día esperando', 'días esperando')} tonoCifra={edad} />
            <div className="flex items-start gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <p className="text-section leading-snug text-zinc-700 dark:text-zinc-300">{fraseFicha(f)}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {pildorasFicha(f).map(p => <Pildora key={p.texto} tono={p.tono}>{p.texto}</Pildora>)}
                    </div>
                </div>
                <CaminoSolicitud etapa={f.etapa} tipoFlujo={f.tipo_flujo} />
            </div>
            {abierta && <ListaFicha f={f} />}
            <PieFicha>
                {desplegar ? (
                    <EnlaceFicha apagado aria-expanded={abierta} onClick={() => setAbierta(a => !a)}
                        icono={<ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', abierta && 'rotate-180')} aria-hidden />}>
                        {desplegar}
                    </EnlaceFicha>
                ) : <span />}
                <EnlaceFicha onClick={onAccion}>{textoAccion(f)}</EnlaceFicha>
            </PieFicha>
        </Ficha>
    );
};

/** Fichas grises mientras llega la lista (misma forma que las de verdad, para que no salte la pantalla). */
const FichasCargando: React.FC = () => (
    <>
        <span className="sr-only" role="status">Cargando solicitudes…</span>
        <GrillaFichas>
            {[0, 1, 2].map(n => (
                <Ficha key={n}>
                    <div className="flex items-center gap-3" aria-hidden>
                        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-2/3" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="h-8 w-8" />
                    </div>
                    <SkeletonText lines={2} />
                    <Skeleton className="h-9 w-full" />
                </Ficha>
            ))}
        </GrillaFichas>
    </>
);

const CAJA = 'rounded-[20px] bg-card text-foreground shadow-[var(--shadow-sm)]';

interface Carga {
    version: unknown;
    intento: number;
    datos: FichasInventarioApi | null;
    error: boolean;
}

/**
 * Detalle «Inventario · fichas por solicitud» del Inicio (2026-10-22, opción A del lienzo). Va sin `Panel`
 * alrededor (las fichas son la superficie, como DetalleAsistencia) y trae sus datos de
 * GET /transferencias/inicio/fichas al montar y cada vez que cambia `version` (p. ej. el `lastUpdated` de
 * «Actualizar»; tiene que ser un valor estable, no un objeto nuevo en cada render). Mientras recarga deja lo que
 * ya se veía. Cada ficha lleva a Inventario con esa solicitud abierta: aprobar, recibir o resolver piden un
 * formulario (orígenes, cantidades, simulación), así que no se hacen desde el Inicio.
 */
const DetalleInventario: React.FC<{ version?: unknown }> = ({ version }) => {
    const navigate = useNavigate();
    const [intento, setIntento] = useState(0);
    const [carga, setCarga] = useState<Carga | null>(null);
    const [filtro, setFiltro] = useState<FiltroFicha>('todas');
    const [verTodas, setVerTodas] = useState(false);

    useEffect(() => {
        let vigente = true;
        api.get<{ data: FichasInventarioApi }>('/transferencias/inicio/fichas')
            .then(res => { if (vigente) setCarga({ version, intento, datos: res.data.data, error: false }); })
            // Si falla una recarga se queda lo que ya se veía; sin nada que mostrar sale el error con «Reintentar».
            .catch(() => { if (vigente) setCarga(c => ({ version, intento, datos: c?.datos ?? null, error: true })); });
        return () => { vigente = false; };
    }, [version, intento]);

    const datos = carga?.datos ?? null;
    const enCurso = !carga || !Object.is(carga.version, version) || carga.intento !== intento;
    const opciones = useMemo(() => opcionesFiltro(datos?.conteos ?? null), [datos]);
    // Si el grupo elegido ya no viene (otro perfil, otra respuesta), vuelve a «Todas».
    const activa: FiltroFicha = opciones.some(o => o.key === filtro) ? filtro : 'todas';
    const lista = useMemo(() => filtrarYOrdenar(datos?.fichas ?? [], activa), [datos, activa]);
    const visibles = verTodas ? lista : lista.slice(0, VISIBLES);
    const opcion = opciones.find(o => o.key === activa);
    // La tarjeta cuenta todo; el servidor manda un máximo por etapa: si hay más, el resto se ve en Inventario.
    const total = opcion?.n ?? 0;
    const hayMasEnInventario = total > lista.length;

    const rotulo = <RotuloFichas titulo="Requiere acción · solicitudes que te tocan" nota="Primero las que llevan más días esperando" />;

    if (!datos) {
        return (
            <section className="space-y-3" aria-busy={enCurso}>
                {rotulo}
                {enCurso ? <FichasCargando /> : (
                    <div className={cn(CAJA, 'flex flex-wrap items-center justify-between gap-3 p-5')}>
                        <p className="text-sm text-muted-foreground">No se pudieron cargar las solicitudes.</p>
                        <Button variant="secondary" size="sm" onClick={() => setIntento(n => n + 1)} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
                            Reintentar
                        </Button>
                    </div>
                )}
            </section>
        );
    }

    // Las solicitudes propias no van en fichas (no le toca actuar): se cuentan aparte para que no se pierdan
    // (la tarjeta las mostraba como «Tus solicitudes en curso» y en el celular no hay tarjeta).
    const mias = datos.conteos?.mis_solicitudes?.total ?? 0;
    const textoMias = `${mias} ${plural(mias, 'solicitud tuya', 'solicitudes tuyas')} en curso`;

    if ((datos.fichas ?? []).length === 0) {
        return (
            <section className="space-y-3">
                <RotuloFichas titulo="Requiere acción · solicitudes que te tocan" />
                <div className={CAJA}>
                    <EmptyState icon={PackageCheck} title="Nada pendiente en solicitudes."
                        description={mias > 0
                            ? `Tienes ${textoMias}. Cuando una solicitud necesite algo de ti, va a aparecer aquí.`
                            : 'Cuando una solicitud necesite algo de ti, va a aparecer aquí.'} className="py-10"
                        action={opciones[0].n > 0 || mias > 0 ? (
                            <EnlaceFicha onClick={() => navigate(rutaLista('todas'))}>{mias > 0 ? 'Ver tus solicitudes' : 'Ver todas en Inventario'}</EnlaceFicha>
                        ) : undefined} />
                </div>
            </section>
        );
    }

    return (
        <section className="space-y-3">
            {rotulo}
            {/* Con un solo grupo, «Todas» y ese grupo serían lo mismo: el filtro sobra. */}
            {opciones.length > 2 && (
                <FiltroFichas opciones={opciones} activa={activa} etiqueta="Filtrar por estado"
                    onCambiar={k => { setFiltro(k); setVerTodas(false); }} />
            )}
            {lista.length === 0 ? (
                <p className={cn(CAJA, 'p-5 text-sm text-muted-foreground')}>Nada en «{opcion?.texto}» por ahora.</p>
            ) : (
                <GrillaFichas>
                    {visibles.map(f => <FichaSolicitud key={f.id} f={f} onAccion={() => navigate(rutaFicha(f))} />)}
                </GrillaFichas>
            )}
            {lista.length > visibles.length && (
                <div className="flex justify-center">
                    <EnlaceFicha apagado onClick={() => setVerTodas(true)} icono={<ChevronDown className="h-4 w-4" aria-hidden />}>
                        Ver las {lista.length}
                    </EnlaceFicha>
                </div>
            )}
            {lista.length === visibles.length && hayMasEnInventario && (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                    {lista.length > 0 && <span className="text-xs text-muted-foreground">Mostrando {lista.length} de {total}.</span>}
                    <EnlaceFicha onClick={() => navigate(rutaLista(activa))}>Ver todas en Inventario</EnlaceFicha>
                </div>
            )}
            {mias > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                    <span className="text-xs text-muted-foreground">Además tienes {textoMias}.</span>
                    <EnlaceFicha apagado onClick={() => navigate(rutaLista('todas'))}>Ver tus solicitudes</EnlaceFicha>
                </div>
            )}
        </section>
    );
};

export default DetalleInventario;
