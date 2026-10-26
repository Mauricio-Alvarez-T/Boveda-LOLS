import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { UserSearch } from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useStandardHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchBar } from '../components/ui/SearchBar';
import { Select } from '../components/ui/Select';
import { Skeleton, SkeletonFilas } from '../components/ui/Skeleton';
import { useAparecer } from '../hooks/useAparecer';
import { cn } from '../utils/cn';
import { esSuperAdmin } from '../components/dashboard/widgets/inventarioPerfil/perfil';
import { FichaPersona } from '../components/soporte/FichaPersona';
import { filtrarUsuarios, lugarUsuario, rolesDeLista, type FichaSoporte, type UsuarioSoporte } from '../components/soporte/fichaUsuario';
import type { RespuestaVerComo } from '../context/verComoSesion';

/**
 * «Soporte · usuarios» (Marcos 2026-10-23), solo para los Super Administradores (Marcos y Mauricio): cuando alguien
 * pregunta por un problema, se busca a la persona, se ve su ficha (rol, obra, bodega, qué ve y sus permisos con el
 * origen de cada uno) y, si hace falta, «Ver como esta persona» abre la app tal cual la ve ella, en solo lectura.
 * El servidor verifica el rol 1 en cada petición (/api/soporte); esta página solo evita mostrar algo inútil.
 * `?u=ID` abre la ficha de esa persona (así vuelve «Volver a mi cuenta»).
 */
const mensajeError = (e: unknown, porDefecto: string): string =>
    (isAxiosError(e) && (e.response?.data as { error?: string } | undefined)?.error) || porDefecto;

const SoportePage: React.FC = () => {
    const { user, entrarVerComo } = useAuth();
    const superAdmin = esSuperAdmin(user);
    const [searchParams, setSearchParams] = useSearchParams();

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

    // La ficha de la elegida (una vez por persona; queda en memoria mientras la página está abierta).
    useEffect(() => {
        if (!superAdmin || idElegido === null || fichas[idElegido] || fallidas[idElegido]) return;
        let vivo = true;
        api.get<{ data: FichaSoporte }>(`/soporte/usuarios/${idElegido}`)
            .then(res => { if (vivo) setFichas(f => ({ ...f, [idElegido]: res.data.data })); })
            .catch(e => {
                if (!vivo) return;
                toast.error(mensajeError(e, 'No se pudo cargar la ficha'));
                setFallidas(f => ({ ...f, [idElegido]: true }));
            });
        return () => { vivo = false; };
    }, [superAdmin, idElegido, fichas, fallidas]);
    const cargandoFicha = idElegido !== null && !fichas[idElegido] && !fallidas[idElegido];

    // Celular: al abrir una ficha, se ve desde arriba.
    useEffect(() => {
        if (verFichaMovil) fichaRef.current?.scrollIntoView({ block: 'start' });
    }, [verFichaMovil, seleccionId]);

    const elegir = useCallback((id: number) => {
        setSeleccionId(id);
        setVerFichaMovil(true);
        setSearchParams(p => { const q = new URLSearchParams(p); q.set('u', String(id)); return q; }, { replace: true });
    }, [setSearchParams]);

    const verComo = useCallback(async () => {
        if (idElegido === null || !entrarVerComo) return;
        setAbriendo(true);
        try {
            const res = await api.post<{ data: RespuestaVerComo }>(`/soporte/usuarios/${idElegido}/ver-como`);
            entrarVerComo(res.data.data); // recarga la app como esa persona
        } catch (e) {
            // El 403 ya lo avisa el interceptor (api.ts); el resto, aquí.
            if (!(isAxiosError(e) && e.response?.status === 403)) toast.error(mensajeError(e, 'No se pudo abrir «ver como»'));
            setAbriendo(false);
        }
    }, [idElegido, entrarVerComo]);

    if (!superAdmin) {
        return <EmptyState icon={UserSearch} title="Solo para el Super Administrador" description="Esta sección es para revisar las cuentas de los demás cuando preguntan por un problema." />;
    }

    const ficha = idElegido !== null ? fichas[idElegido] : undefined;

    return (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
            {/* Lista */}
            <section aria-label="Usuarios" className={cn('rounded-card border border-border bg-card lg:sticky lg:top-2', verFichaMovil && 'hidden lg:block')}>
                <div className="flex flex-col gap-2 border-b border-border p-3">
                    <SearchBar value={texto} onChange={setTexto} placeholder="Buscar persona, correo, obra…" />
                    <Select
                        aria-label="Filtrar por rol"
                        value={rolId ?? ''}
                        onChange={e => setRolId(e.target.value ? Number(e.target.value) : null)}
                        options={[{ value: '', label: `Todos los roles (${usuarios.length})` }, ...roles.map(r => ({ value: r.id, label: `${r.nombre} (${r.n})` }))]}
                        className="h-[42px] text-sm"
                    />
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
                                            <span className="block truncate text-sm font-semibold text-brand-dark">{u.nombre}</span>
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
                    <FichaPersona key={ficha.usuario.id} ficha={ficha} onVerComo={verComo} abriendo={abriendo} onVolver={() => setVerFichaMovil(false)} />
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
    );
};

export default SoportePage;
