import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Bug, Table2, UserSearch, Users } from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useStandardHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PestanasElasticas } from '../components/ui/PestanasElasticas';
import { SearchBar } from '../components/ui/SearchBar';
import { Select } from '../components/ui/Select';
import { Skeleton, SkeletonFilas } from '../components/ui/Skeleton';
import { useAparecer } from '../hooks/useAparecer';
import { cn } from '../utils/cn';
import { esSuperAdmin } from '../components/dashboard/widgets/inventarioPerfil/perfil';
import { FichaPersona } from '../components/soporte/FichaPersona';
import { filtrarUsuarios, lugarUsuario, rolesDeLista, textoIngreso, type FichaSoporte, type UsuarioSoporte } from '../components/soporte/fichaUsuario';
import { fichaParaVerComo } from '../components/soporte/accesosPerfil';
import { PanoramaPermisos } from '../components/soporte/PanoramaPermisos';
import { ErroresSoporte } from '../components/soporte/ErroresSoporte';
import { useErroresSoporte } from '../hooks/useErroresSoporte';
import type { UsuarioPanorama } from '../components/soporte/panorama';
import type { RespuestaVerComo } from '../context/verComoSesion';

/**
 * «Soporte · usuarios» (Marcos 2026-10-23), solo para los Super Administradores (Marcos y Mauricio): cuando alguien
 * pregunta por un problema, se busca a la persona, se ve su ficha (rol, obra, bodega, qué ve y sus permisos con el
 * origen de cada uno) y, si hace falta, «Ver como esta persona» abre la app tal cual la ve ella, en solo lectura.
 * El servidor verifica el rol 1 en cada petición (/api/soporte); esta página solo evita mostrar algo inútil.
 * `?u=ID` abre la ficha de esa persona (así vuelve «Volver a mi cuenta»).
 * Dos vistas (Marcos 2026-10-26): «Personas» (lista + ficha) y «Panorama» (`?vista=panorama`: qué secciones del menú ve
 * cada persona, en una tabla; tocar a alguien abre su ficha y «atrás» vuelve al Panorama). El buscador y el filtro por
 * rol son los mismos en las dos.
 */
const mensajeError = (e: unknown, porDefecto: string): string =>
    (isAxiosError(e) && (e.response?.data as { error?: string } | undefined)?.error) || porDefecto;

type Vista = 'personas' | 'panorama' | 'errores';
const VISTAS: readonly { key: Vista; label: string; icono: React.ElementType }[] = [
    { key: 'personas', label: 'Personas', icono: Users },
    { key: 'panorama', label: 'Panorama', icono: Table2 },
    // Los avisos de error que manda la app de cada persona (mig 141).
    { key: 'errores', label: 'Errores', icono: Bug },
];

const SoportePage: React.FC = () => {
    const { user, entrarVerComo } = useAuth();
    const errores = useErroresSoporte();
    const superAdmin = esSuperAdmin(user);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    useStandardHeader({ title: 'Soporte · usuarios', icon: UserSearch });

    const [usuarios, setUsuarios] = useState<UsuarioSoporte[]>([]);
    const [cargando, setCargando] = useState(true);
    const aparece = useAparecer(cargando);
    const [texto, setTexto] = useState('');
    const [rolId, setRolId] = useState<number | null>(null);
    const idUrl = Number(searchParams.get('u'));
    const [seleccionId, setSeleccionId] = useState<number | null>(Number.isInteger(idUrl) && idUrl > 0 ? idUrl : null);
    const [verFichaMovil, setVerFichaMovil] = useState(seleccionId !== null);
    const [fichas, setFichas] = useState<Record<number, FichaSoporte>>({});
    // Las que no se pudieron cargar (para no reintentar en bucle; elegirla de nuevo no la reintenta en esta visita).
    const [fallidas, setFallidas] = useState<Record<number, true>>({});
    const [abriendo, setAbriendo] = useState(false);
    const fichaRef = useRef<HTMLDivElement>(null);
    // La vista sale de la URL: así «atrás» desde una ficha abierta en el Panorama vuelve al Panorama.
    const pedida = searchParams.get('vista');
    const vista: Vista = pedida === 'panorama' ? 'panorama' : pedida === 'errores' ? 'errores' : 'personas';
    // El Panorama se pide la primera vez que se abre (y queda en memoria mientras la página está abierta).
    const [panorama, setPanorama] = useState<UsuarioPanorama[] | null>(null);
    const [panoramaFallo, setPanoramaFallo] = useState(false);
    // La ficha abierta se tocó en el Panorama: en el celular, «Volver» regresa ahí (no a la lista).
    const [desdePanorama, setDesdePanorama] = useState(false);

    useEffect(() => {
        if (!superAdmin) return;
        let vivo = true;
        api.get<{ data: UsuarioSoporte[] }>('/soporte/usuarios')
            .then(res => { if (vivo) setUsuarios(res.data.data || []); })
            .catch(e => { if (vivo) toast.error(mensajeError(e, 'No se pudo cargar la lista de usuarios')); })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [superAdmin]);

    const visibles = useMemo(() => filtrarUsuarios(usuarios, texto, rolId), [usuarios, texto, rolId]);
    const roles = useMemo(() => rolesDeLista(usuarios), [usuarios]);

    // En el computador siempre hay una elegida si la lista tiene algo: la tocada o, si no, la primera.
    const idElegido = seleccionId ?? (!cargando && visibles.length ? visibles[0].id : null);

    useEffect(() => {
        if (!superAdmin || vista !== 'panorama' || panorama || panoramaFallo) return;
        let vivo = true;
        api.get<{ data: UsuarioPanorama[] }>('/soporte/panorama')
            .then(res => { if (vivo) setPanorama(res.data.data || []); })
            .catch(e => {
                if (!vivo) return;
                toast.error(mensajeError(e, 'No se pudo cargar el panorama'));
                setPanoramaFallo(true);
            });
        return () => { vivo = false; };
    }, [superAdmin, vista, panorama, panoramaFallo]);

    // La ficha de la elegida (una vez por persona; queda en memoria mientras la página está abierta). En el Panorama no
    // hace falta: se pide al abrir la ficha.
    useEffect(() => {
        if (!superAdmin || vista !== 'personas' || idElegido === null || fichas[idElegido] || fallidas[idElegido]) return;
        let vivo = true;
        api.get<{ data: FichaSoporte }>(`/soporte/usuarios/${idElegido}`)
            .then(res => { if (vivo) setFichas(f => ({ ...f, [idElegido]: res.data.data })); })
            .catch(e => {
                if (!vivo) return;
                toast.error(mensajeError(e, 'No se pudo cargar la ficha'));
                setFallidas(f => ({ ...f, [idElegido]: true }));
            });
        return () => { vivo = false; };
    }, [superAdmin, vista, idElegido, fichas, fallidas]);
    const cargandoFicha = idElegido !== null && !fichas[idElegido] && !fallidas[idElegido];

    // Celular: al abrir una ficha, se ve desde arriba.
    useEffect(() => {
        if (verFichaMovil) fichaRef.current?.scrollIntoView({ block: 'start' });
    }, [verFichaMovil, seleccionId]);

    const elegir = useCallback((id: number) => {
        setSeleccionId(id);
        setVerFichaMovil(true);
        setDesdePanorama(false);
        setSearchParams(p => { const q = new URLSearchParams(p); q.set('u', String(id)); return q; }, { replace: true });
    }, [setSearchParams]);

    const cambiarVista = useCallback((v: Vista) => {
        // En el celular, «Personas» muestra la lista (no la última ficha abierta).
        if (v === 'personas') setVerFichaMovil(false);
        setDesdePanorama(false);
        setSearchParams(p => {
            const q = new URLSearchParams(p);
            if (v === 'panorama' || v === 'errores') q.set('vista', v);
            else q.delete('vista');
            return q;
        }, { replace: true });
    }, [setSearchParams]);

    // Desde el Panorama: su ficha, la misma de «Personas». Sin `replace`: «atrás» (también el del teléfono) vuelve al Panorama.
    const abrirFicha = useCallback((id: number) => {
        setSeleccionId(id);
        setVerFichaMovil(true);
        setDesdePanorama(true);
        setSearchParams(p => { const q = new URLSearchParams(p); q.delete('vista'); q.set('u', String(id)); return q; });
    }, [setSearchParams]);

    const verComo = useCallback(async () => {
        if (idElegido === null || !entrarVerComo) return;
        setAbriendo(true);
        try {
            const res = await api.post<{ data: RespuestaVerComo }>(`/soporte/usuarios/${idElegido}/ver-como`);
            // Con su ficha (nombres y origen de sus permisos): el recuadro «Lo que puede usar…» de su Inicio la usa, porque
            // mientras se ve como ella no se puede pedir. Recarga la app como esa persona.
            const fichaElegida = fichas[idElegido];
            entrarVerComo(res.data.data, fichaElegida ? fichaParaVerComo(fichaElegida) : null);
        } catch (e) {
            // El 403 ya lo avisa el interceptor (api.ts); el resto, aquí.
            if (!(isAxiosError(e) && e.response?.status === 403)) toast.error(mensajeError(e, 'No se pudo abrir «ver como»'));
            setAbriendo(false);
        }
    }, [idElegido, entrarVerComo, fichas]);

    if (!superAdmin) {
        return <EmptyState icon={UserSearch} title="Solo para el Super Administrador" description="Esta sección es para revisar las cuentas de los demás cuando preguntan por un problema." />;
    }

    const ficha = idElegido !== null ? fichas[idElegido] : undefined;

    // El buscador y el filtro por rol: los mismos en las dos vistas (y el mismo estado).
    const filtros = (
        <>
            <SearchBar value={texto} onChange={setTexto} placeholder="Buscar persona, correo, obra…" />
            <Select
                aria-label="Filtrar por rol"
                value={rolId ?? ''}
                onChange={e => setRolId(e.target.value ? Number(e.target.value) : null)}
                options={[{ value: '', label: `Todos los roles (${usuarios.length})` }, ...roles.map(r => ({ value: r.id, label: `${r.nombre} (${r.n})` }))]}
                className="h-[42px] text-sm"
            />
        </>
    );

    const selector = (
        <div className="self-start rounded-2xl border border-border bg-card p-1">
            <PestanasElasticas opciones={VISTAS} activa={vista} onCambiar={cambiarVista} aria-label="Cómo ver a las personas" claseFila="gap-1"
                claseOpcion="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-medium whitespace-nowrap"
                claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                render={o => {
                    const Icono = o.icono;
                    return (
                        <>
                            <Icono aria-hidden className="h-4 w-4" />{o.label}
                            {o.key === 'errores' && errores.pendientes > 0 && (
                                <span aria-label={`${errores.pendientes} por revisar`} className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-label font-bold tabular-nums text-white">{errores.pendientes}</span>
                            )}
                        </>
                    );
                }} />
        </div>
    );

    if (vista === 'errores') {
        return (
            <div className="flex flex-col gap-4">
                {selector}
                <ErroresSoporte />
            </div>
        );
    }

    if (vista === 'panorama') {
        return (
            <div className="flex flex-col gap-4">
                {selector}
                {panoramaFallo ? (
                    <EmptyState icon={Table2} title="No se pudo cargar el panorama" description="Revisa la conexión y vuelve a intentarlo."
                        action={<Button variant="secondary" onClick={() => setPanoramaFallo(false)}>Reintentar</Button>} />
                ) : (
                    <PanoramaPermisos datos={panorama} texto={texto} rolId={rolId} filtros={filtros} onElegir={abrirFicha} />
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {selector}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
                {/* Lista */}
                <section aria-label="Usuarios" className={cn('rounded-card border border-border bg-card lg:sticky lg:top-2', verFichaMovil && 'hidden lg:block')}>
                    <div className="flex flex-col gap-2 border-b border-border p-3">
                        {filtros}
                    </div>
                    {cargando ? (
                        <SkeletonFilas filas={8} />
                    ) : !visibles.length ? (
                        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nadie con ese filtro.</p>
                    ) : (
                        <ul className={cn('flex flex-col gap-1 p-2 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto overscroll-contain', aparece)}>
                            {visibles.map(u => {
                                const activa = u.id === idElegido;
                                const lugar = lugarUsuario(u);
                                return (
                                    <li key={u.id}>
                                        {/* eslint-disable-next-line no-restricted-syntax -- fila de lista seleccionable (inicial, nombre y dos líneas); Button no soporta este layout */}
                                        <button type="button" onClick={() => elegir(u.id)} aria-current={activa ? 'true' : undefined}
                                            className={cn('flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                                activa ? 'border-brand-primary bg-brand-primary/5' : 'border-transparent hover:bg-background')}>
                                            <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                                                {u.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-baseline gap-2">
                                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-dark">{u.nombre}</span>
                                                    <span title="Último ingreso" className="shrink-0 text-caption tabular-nums text-muted-foreground">
                                                        {u.ultimo_ingreso ? `Entró ${textoIngreso(u.ultimo_ingreso)}` : 'Sin ingresos'}
                                                    </span>
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">{u.rol_nombre}{lugar ? ` · ${lugar}` : ''}</span>
                                                <span className="block truncate text-caption text-muted-foreground">{u.email}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
    
                {/* Ficha */}
                <div ref={fichaRef} className={cn('scroll-mt-2 min-w-0', !verFichaMovil && 'hidden lg:block')}>
                    {ficha ? (
                        <FichaPersona key={ficha.usuario.id} ficha={ficha} onVerComo={verComo} abriendo={abriendo}
                            onVolver={desdePanorama ? () => navigate(-1) : () => setVerFichaMovil(false)}
                            textoVolver={desdePanorama ? 'Volver al panorama' : undefined} />
                    ) : cargando || cargandoFicha ? (
                        <div className="flex flex-col gap-4" role="status">
                            <span className="sr-only">Cargando…</span>
                            <div className="rounded-card border border-border bg-card p-6"><Skeleton className="h-7 w-56" /><Skeleton className="mt-3 h-4 w-40" /></div>
                            <div className="h-40 rounded-card border border-border bg-card" />
                            <div className="h-72 rounded-card border border-border bg-card" />
                        </div>
                    ) : (
                        <EmptyState icon={UserSearch} title="Elige a una persona" description="Su ficha muestra qué ve y por qué; desde ahí puedes ver la app como ella." />
                    )}
                </div>
            </div>
        </div>
    );
};

export default SoportePage;
