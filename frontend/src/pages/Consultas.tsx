/**
 * Página "Gestiones" (etiqueta visible desde 2026-09-11; antes "Consultas", antes "Nómina & Reportes").
 * Mapa de nombres — NO renombrar sin leer docs/DEUDA_TECNICA.md § Drift de nombres:
 *   UI "Gestiones" = URL /consultas = pages/Consultas.tsx + components/consultas/ + hooks/consultas/
 *   = backend fiscalizacion.routes/service = permisos reportes.* / documentos.*
 * Rename solo de etiqueta (precedentes 33a9fcb, 59fd108): los deep-links /consultas?… del Dashboard
 * y el test por path tutorialLabels.test.ts dependen de estos identificadores.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    Mail,
    ArrowLeft,
    FileDown,
    SearchCheck,
    X,
    Trash2,
    Plus,
    Eraser,
    CalendarClock,
    CalendarPlus,
    ClipboardList,
    FileSignature,
    FlaskConical,
    AlertTriangle,
    Save,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { WorkerForm } from '../components/workers/WorkerForm';
import { EmpresaForm } from '../components/settings/EmpresaForm';
import { ObraForm } from '../components/settings/ObraForm';
import { CargoForm } from '../components/settings/CargoForm';
import { TipoDocumentoForm } from '../components/settings/TipoDocumentoForm';
import type { Trabajador } from '../types/entities';
import { cn } from '../utils/cn';
import EnvioEmailModal from '../components/workers/EnvioEmailModal';
import ActividadesSemana from '../components/dashboard/widgets/ActividadesSemana';
import WorkerQuickView from '../components/workers/WorkerQuickView';
import { DesvincularModal } from '../components/workers/DesvincularModal';
import { ReactivarModal } from '../components/workers/ReactivarModal';
import { EmitirAmonestacionModal } from '../components/documents/EmitirAmonestacionModal';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useAuth } from '../context/AuthContext';
import { FilterPanel } from '../components/consultas/FilterPanel';
import { CreatePanel } from '../components/consultas/CreatePanel';
import { SolicitudIngresoForm } from '../components/consultas/SolicitudIngresoForm';
import { SolicitudesIngresoPanel } from '../components/consultas/SolicitudesIngresoPanel';
import { useSolicitudesIngreso } from '../hooks/useSolicitudesIngreso';
import { DocumentosFisicosPanel } from '../components/documentos-fisicos/DocumentosFisicosPanel';
import { useLotesPendientes } from '../hooks/useLotesPendientes';
import { useDocumentosAlertas } from '../hooks/useDocumentosAlertas';
import { useSeccionGestiones } from '../hooks/consultas/useSeccionGestiones';
import { GestionesInicio } from '../components/consultas/GestionesInicio';
import { SECCION_LABEL, type SeccionGestiones } from '../components/consultas/gestionesNav';
import { TrabajadoresGrilla } from '../components/consultas/TrabajadoresGrilla';
import { BuscadorTrabajadores } from '../components/consultas/BuscadorTrabajadores';
import { indexar, tokenizar, coincide, ranking } from '../utils/busquedaTrabajadores';
import { FiltrosRapidos, type FiltroRapido } from '../components/consultas/FiltrosRapidos';
import { mesEnCurso, ultimosDias } from '../components/consultas/rangosFecha';
import { FiltrosRail } from '../components/consultas/FiltrosRail';
import { BotonFiltros } from '../components/consultas/BotonFiltros';
import {
    contarPorGrupo, gruposIniciales, leerRailAbierto, guardarRailAbierto,
    type GrupoFiltroId, type ValoresFiltros,
} from '../components/consultas/filtrosPanel';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useObra } from '../context/ObraContext';

import {
    useConsultasFilters,
    useConsultasData,
    useConsultasSelection,
    useConsultasExport,
    useConsultasActions,
} from '../hooks/consultas';

/** Un solo id para el panel de filtros (rail o hoja): el botón lo referencia con `aria-controls`. */
const ID_PANEL_FILTROS = 'panel-filtros-trabajadores';

// DATE de MySQL llega como 'YYYY-MM-DD' (o ISO datetime) → DD/MM/YYYY legible.
const formatFechaIngreso = (f?: string | null): string | null => {
    if (!f) return null;
    const [y, m, d] = String(f).slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : null;
};

/**
 * @param seccionFija Solo para los tutoriales de Ayuda: fija la sección e ignora URL y memoria (plan Gestiones B8).
 */
const ConsultasPage: React.FC<{ seccionFija?: SeccionGestiones }> = ({ seccionFija }) => {
    const { hasPermission, user } = useAuth();
    // Ficha de ingreso digital: terreno solicita, oficina aprueba. Gestiones es visible con cualquiera de
    // estos permisos (ver Sidebar), así que puede no haber grilla: la sección la decide useSeccionGestiones.
    const puedeVerTrabajadores = hasPermission('trabajadores.ver');
    const verSolicitudes = hasPermission('trabajadores.solicitud.crear') || hasPermission('trabajadores.solicitud.aprobar');
    // Documentos físicos (plan Gestiones B6): RRHH arma lotes; el portador (encargado de obra) confirma los suyos.
    const verFisicos = hasPermission('documentos.entrega.registrar') || hasPermission('documentos.entrega.portar');
    // Sección actual (plan Gestiones B8): portada con tarjetas, o trabajadores | solicitudes | fisicos.
    // La URL (?tab=) es la fuente de verdad; sin tab se abre lo último que usó esta persona (o la portada).
    const permisosGestiones = useMemo(() => ({ trabajadores: puedeVerTrabajadores, solicitudes: verSolicitudes, fisicos: verFisicos }),
        [puedeVerTrabajadores, verSolicitudes, verFisicos]);
    const { seccion, irA, disponibles } = useSeccionGestiones({ permisos: permisosGestiones, userId: user?.id, seccionFija });
    const esGrilla = seccion === 'trabajadores';
    // Con una sola sección no hay portada ni switcher (se entra directo, como antes).
    // Con ≥2 secciones el título «Gestiones» es la casa (vuelve a la portada); el cambio de sección se hace desde ahí.
    const conSwitcher = disponibles.length >= 2 && !seccionFija;
    const conCrear = esGrilla;

    // --- Custom Hooks ---
    // 1. Filtros
    const {
        busquedaDiferida, resetBusqueda, publicarBusqueda, leerBusquedaInicial,
        filterObra, setFilterObra,
        filterEmpresa, setFilterEmpresa,
        filterCargo, setFilterCargo,
        filterCategoria, setFilterCategoria,
        filterActivo, setFilterActivo,
        filterCompletitud, setFilterCompletitud,
        filterAusentes, setFilterAusentes,
        filterAniversario10m, setFilterAniversario10m, clearAniversario10m,
        filterIngresoDesde, setFilterIngresoDesde,
        filterIngresoHasta, setFilterIngresoHasta,
        filterFaltaDato, setFilterFaltaDato,
        filterDocTipoFalta, setFilterDocTipoFalta,
        filterDocVigencia, setFilterDocVigencia,
        filterSalidaDesde, setFilterSalidaDesde,
        filterSalidaHasta, setFilterSalidaHasta,
        filterNoRecontratar, setFilterNoRecontratar,
        filterFiniquito, setFilterFiniquito,
        filterSoloPrueba, setFilterSoloPrueba,
        handleClearFilters,
        activeFilterCount
    } = useConsultasFilters();

    // 2. Data & Paginación
    const {
        empresas, obras, cargos, tiposObligatorios, fetchCatalogs,
        workers, loading, performSearch
    } = useConsultasData({
        filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterCompletitud, filterAusentes, filterAniversario10m, filterIngresoDesde, filterIngresoHasta,
        filterFaltaDato, filterDocTipoFalta, filterDocVigencia, filterSalidaDesde, filterSalidaHasta,
        filterNoRecontratar, filterFiniquito, filterSoloPrueba
    }, puedeVerTrabajadores && esGrilla);

    // Búsqueda por texto: se filtra EN EL CLIENTE (2026-09-17). El backend ya devuelve el set completo de
    // los demás filtros —no pagina— y son menos de 500 personas, así que teclear no necesita red y el
    // resultado aparece en el mismo frame; el índice se arma UNA vez por carga y cada tecla solo hace
    // `indexOf`. `useDeferredValue` deja que el input se pinte primero y la lista se recalcule en un
    // render de baja prioridad que React puede interrumpir si llega otra tecla — sin el `React.memo` de
    // TrabajadoresGrilla no serviría de nada: los dos van juntos.
    // `incluirObra`: acá sí, porque la grilla puede mostrar varias obras a la vez y buscar por obra es
    // útil. En Asistencia va apagado — ver el porqué en `OpcionesIndice`.
    const indice = useMemo(() => workers.map(w => ({ w, idx: indexar(w, { incluirObra: true }) })), [workers]);
    const workersVisibles = useMemo(() => {
        const tokens = tokenizar(busquedaDiferida);
        if (!tokens.length) return workers;
        // El rango se calcula UNA vez por fila, no dentro del comparador: ahí se evaluaría O(n log n)
        // veces y cada evaluación vuelve a normalizar el mismo texto.
        return indice
            .filter(({ idx }) => coincide(idx, tokens))
            .map(x => ({ ...x, rango: ranking(x.idx, busquedaDiferida) }))
            .sort((a, b) => a.rango - b.rango)
            .map(({ w }) => w);
    }, [indice, workers, busquedaDiferida]);

    // Etiqueta legible (MM/AAAA) del filtro de aniversario, si está activo.
    const aniversario10mLabel = useMemo(() => {
        const m = /^(\d{4})-(\d{1,2})$/.exec(filterAniversario10m);
        return m ? `${m[2].padStart(2, '0')}/${m[1]}` : '';
    }, [filterAniversario10m]);

    // ids memoizados: evita recrear el array en cada render (dep del hook de selección).
    // Son los VISIBLES, no los que trajo el servidor: con texto escrito la lista ya está filtrada acá.
    const workerIds = useMemo(() => workersVisibles.map(w => w.id), [workersVisibles]);

    // El export Excel es de ASISTENCIA y solo entiende 6 filtros (obra, empresa, cargo, categoría,
    // estado y búsqueda). Con cualquier otro activo se mandan los ids visibles para que el archivo
    // coincida con la lista en pantalla (el backend no pagina, workers = set completo).
    //
    // La búsqueda por texto entró a la lista (2026-09-17): como ya no viaja como `q`, la única forma de
    // que el Excel y el correo digan lo mismo que la pantalla es mandar los ids visibles.
    // Se usa `busquedaDiferida` y no `search` a propósito: así esto cambia al mismo ritmo que
    // `workersVisibles` —en el render de baja prioridad— y la tecla recién pulsada no arrastra consigo
    // una recomposición del header.
    const exportIds = useMemo(
        () => (busquedaDiferida || filterIngresoDesde || filterIngresoHasta || filterCompletitud || filterAusentes
            || filterAniversario10m || filterFaltaDato || filterDocTipoFalta || filterDocVigencia
            || filterSalidaDesde || filterSalidaHasta || filterNoRecontratar || filterFiniquito
            || filterSoloPrueba) ? workerIds : undefined,
        [busquedaDiferida, filterIngresoDesde, filterIngresoHasta, filterCompletitud, filterAusentes, filterAniversario10m,
            filterFaltaDato, filterDocTipoFalta, filterDocVigencia, filterSalidaDesde, filterSalidaHasta,
            filterNoRecontratar, filterFiniquito, filterSoloPrueba, workerIds]
    );

    /**
     * Atajos de un clic. Cada uno responde una pregunta de negocio, no expone un campo: es el patrón
     * que el producto ya tenía con "cumplen 10 meses" (lo encendía una alerta del Inicio) y que acá se
     * hace visible. Los que fijan más de un filtro lo declaran en su nota, para que nadie vea una lista
     * recortada sin saber por qué.
     */
    const filtrosRapidos = useMemo<FiltroRapido[]>(() => {
        const mes = mesEnCurso();
        const ult60 = ultimosDias(60);
        return [
            {
                id: 'ingresos-mes', label: 'Ingresos de este mes', icon: CalendarPlus,
                activo: filterIngresoDesde === mes.desde && filterIngresoHasta === mes.hasta,
                encender: () => { setFilterIngresoDesde(mes.desde); setFilterIngresoHasta(mes.hasta); },
                apagar: () => { setFilterIngresoDesde(''); setFilterIngresoHasta(''); },
            },
            {
                id: 'aniv10m', label: 'Cumplen 10 meses', icon: CalendarClock,
                // El mes objetivo lo fija la alerta del Inicio y puede no ser el actual: va en el tooltip
                // (antes lo decía un banner propio que ocupaba una fila entera de la lista).
                nota: aniversario10mLabel ? 'Cumplen 10 meses de contrato en ' + aniversario10mLabel : undefined,
                activo: filterAniversario10m === mes.mes,
                encender: () => setFilterAniversario10m(mes.mes),
                apagar: clearAniversario10m,
            },
            {
                id: 'finiquito', label: 'Finiquito pendiente', icon: FileSignature, tono: 'aviso',
                nota: 'Muestra desvinculados de los últimos 60 días sin finiquito emitido',
                activo: filterFiniquito === 'pendiente',
                encender: () => {
                    setFilterFiniquito('pendiente');
                    setFilterActivo('false');                       // son bajas: con "Solo activos" saldría vacío
                    setFilterSalidaDesde(ult60.desde); setFilterSalidaHasta(ult60.hasta);
                },
                apagar: () => { setFilterFiniquito(''); setFilterSalidaDesde(''); setFilterSalidaHasta(''); },
            },
            {
                id: 'no-recontratar', label: 'No recontratar', icon: AlertTriangle, tono: 'peligro',
                nota: 'Incluye desvinculados: la marca se conserva entre períodos',
                activo: filterNoRecontratar,
                encender: () => { setFilterNoRecontratar(true); setFilterActivo(''); },
                apagar: () => setFilterNoRecontratar(false),
            },
            {
                id: 'prueba', label: 'Fichas de prueba', icon: FlaskConical, tono: 'aviso',
                activo: filterSoloPrueba,
                encender: () => setFilterSoloPrueba(true),
                apagar: () => setFilterSoloPrueba(false),
            },
        ];
    }, [filterIngresoDesde, filterIngresoHasta, filterAniversario10m, aniversario10mLabel, filterFiniquito, filterNoRecontratar,
        filterSoloPrueba, setFilterIngresoDesde, setFilterIngresoHasta, setFilterAniversario10m,
        clearAniversario10m, setFilterFiniquito, setFilterActivo, setFilterSalidaDesde, setFilterSalidaHasta,
        setFilterNoRecontratar, setFilterSoloPrueba]);

    // Opciones de filtros memoizadas: identidad estable hacia FilterPanel (react-select).
    const obraOptions = useMemo(() => obras.map(o => ({ value: o.value, label: o.label })), [obras]);
    const empresaOptions = useMemo(() => empresas.map(e => ({ value: e.value, label: e.label })), [empresas]);
    const cargoOptions = useMemo(() => cargos.map(c => ({ value: c.value, label: c.label })), [cargos]);

    // ── Rail de filtros: agrupación y contador por grupo (lógica pura en filtrosPanel.ts) ──
    // La obra del selector global no cuenta como filtro elegido, igual que en activeFilterCount.
    const { selectedObra } = useObra();
    const obraContexto = selectedObra ? String(selectedObra.id) : '';
    const valoresPanel = useMemo<ValoresFiltros>(() => ({
        obra: filterObra, empresa: filterEmpresa, cargo: filterCargo, categoria: filterCategoria,
        activo: filterActivo, ausentes: filterAusentes,
        completitud: filterCompletitud, docTipoFalta: filterDocTipoFalta, docVigencia: filterDocVigencia,
        faltaDato: filterFaltaDato,
        ingresoDesde: filterIngresoDesde, ingresoHasta: filterIngresoHasta,
        salidaDesde: filterSalidaDesde, salidaHasta: filterSalidaHasta,
    }), [filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterAusentes,
        filterCompletitud, filterDocTipoFalta, filterDocVigencia, filterFaltaDato,
        filterIngresoDesde, filterIngresoHasta, filterSalidaDesde, filterSalidaHasta]);
    const conteosGrupo = useMemo(() => contarPorGrupo(valoresPanel, { obraContexto }), [valoresPanel, obraContexto]);
    // Al montar se despliegan los dos primeros grupos, más el que traiga un deep-link
    // (la alerta "Documentos Vencidos" del Inicio entra con doc_vigencia y debe verse su control).
    const [gruposAbiertos, setGruposAbiertos] = useState<GrupoFiltroId[]>(() => gruposIniciales(valoresPanel, { obraContexto }));
    const toggleGrupo = useCallback((id: GrupoFiltroId) => {
        setGruposAbiertos(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
    }, []);

    // 3. Selección
    const {
        selectedWorkers,
        handleSelectWorker,
        clearSelection
    } = useConsultasSelection();

    // 4. Exportación
    const {
        exporting,
        handleExportExcel
    } = useConsultasExport(useMemo(() => ({
        obra_id: filterObra,
        empresa_id: filterEmpresa,
        cargo_id: filterCargo,
        categoria_reporte: filterCategoria,
        activo: filterActivo,
        // SIN `q` (2026-09-17). Dos razones: (1) el texto ya no se filtra en el servidor, así que mandarlo
        // sería una segunda implementación de la misma regla, y el Excel podría no coincidir con la
        // pantalla — para eso está `exportIds`, que manda los ids que se ven; (2) si `q` entrara acá,
        // `handleExportExcel` cambiaría de identidad en cada tecla y, como la grilla lo recibe por prop,
        // su `React.memo` no podría saltarse ni un render. Con la lista vacía los botones van disabled.
    }), [filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo]));

    // 5. Acciones CRUD (Eliminar/Reactivar)
    const {
        modalType, setModalType,
        selectedWorkerForAction, setSelectedWorkerForAction,
        handleDelete, handleReactivate, handleAccionCompletada,
        handleDepurar, confirmDepurar,
        depurarConfirmationRut, setDepurarConfirmationRut
    } = useConsultasActions(() => performSearch(true));

    // Estados Locales UI Varios
    const [quickViewId, setQuickViewId] = useState<number | null>(null);
    const [constanciaWorker, setConstanciaWorker] = useState<Trabajador | null>(null);
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    // Informe de asistencia a actividades sugeridas (mismo bloque que el Inicio, en modal).
    const [informeModalOpen, setInformeModalOpen] = useState(false);
    // Rail de filtros (2026-09-16). Tres presentaciones del mismo panel, elegidas por ancho:
    //  ≥1280 columna en flujo que empuja la grilla · 768-1279 el mismo rail flotando sobre ella ·
    //  <768 la hoja de abajo de siempre. Se elige por matchMedia y NO por clases hidden/md:block:
    //  dos ramas CSS montarían los 12 controles dos veces (ver el comentario de ui/Modal.tsx).
    const railInline = useMediaQuery('(min-width: 1280px)');
    const conRail = useMediaQuery('(min-width: 768px)');
    const [showFilters, setShowFilters] = useState(() =>
        !seccionFija
        && typeof window !== 'undefined' && !!window.matchMedia
        && window.matchMedia('(min-width: 768px)').matches
        && leerRailAbierto(user?.id)
    );
    const [showCreatePanel, setShowCreatePanel] = useState(false);

    // ── Props estables para la grilla memoizada (2026-09-17) ───────────────────────────────────────
    // `React.memo` compara por identidad: una arrow inline o un elemento JSX creados en el JSX son
    // objetos nuevos en cada render, así que la grilla se volvería a renderizar en cada tecla y la
    // memoización no serviría de nada. `hasPermission`, `handleSelectWorker` y `clearSelection` ya
    // vienen estables de sus hooks.
    const abrirEdicion = useCallback((w: Trabajador) => {
        setSelectedWorkerForAction(w);
        setModalType('form');
    }, [setSelectedWorkerForAction, setModalType]);
    const abrirEnvioEmail = useCallback(() => setEmailModalOpen(true), []);
    const alternarFiltros = useCallback(() => {
        setShowFilters(prev => !prev);
        setShowCreatePanel(false);
    }, []);
    const botonFiltros = useMemo(() => (
        <BotonFiltros
            abierto={showFilters}
            onToggle={alternarFiltros}
            activos={activeFilterCount}
            modo={conRail ? 'lateral' : 'hoja'}
            controla={ID_PANEL_FILTROS}
        />
    ), [showFilters, alternarFiltros, activeFilterCount, conRail]);
    const chipsAtajos = useMemo(() => <FiltrosRapidos filtros={filtrosRapidos} />, [filtrosRapidos]);

    // Memoria del rail por usuario (solo desktop: en el teléfono la hoja siempre arranca cerrada).
    // Solo se guarda estando en la grilla: salir a otra sección cierra el rail, y eso no es una
    // decisión del usuario que haya que recordar.
    useEffect(() => {
        if (!seccionFija && conRail && esGrilla) guardarRailAbierto(user?.id, showFilters);
    }, [showFilters, conRail, esGrilla, user?.id, seccionFija]);
    
    // ── Contadores de las secciones (stores de módulo compartidos con el Sidebar y la Bandeja) ──
    const solicitudes = useSolicitudesIngreso();
    const [solicitudesVersion, setSolicitudesVersion] = useState(0);
    const lotes = useLotesPendientes();
    const alertasDocs = useDocumentosAlertas();
    const irASeccion = useCallback((s: SeccionGestiones, extra?: Record<string, string>) => {
        setShowFilters(false);
        setShowCreatePanel(false);
        irA(s, extra);
    }, [irA]);
    // Modificando Header Global
    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Volver (B8, ajuste 2026-09-15 tras prueba con usuarios): dentro de una sección hay un botón
                explícito «← Gestiones» que vuelve a la portada; el nombre de la sección es el título. El título
                clickeable anterior no se reconocía como botón. Con una sola sección no hay portada: título fijo. */}
            <div className="flex items-center gap-2 md:gap-3 shrink-0 min-w-0">
                {conSwitcher && seccion && seccion !== 'inicio' ? (<>
                    <Button variant="outline" size="sm" onClick={() => irASeccion('inicio')} title="Volver a la portada de Gestiones"
                        leftIcon={<ArrowLeft className="h-4 w-4" />}
                        className="h-9 px-3 rounded-xl font-semibold gap-1.5 bg-card shadow-sm">
                        Gestiones
                    </Button>
                    <h1 className="text-sm md:text-lg font-bold text-brand-dark truncate" aria-current="page">{SECCION_LABEL[seccion]}</h1>
                </>) : (<>
                    <SearchCheck className="h-5 w-5 md:h-6 md:w-6 text-brand-primary shrink-0" />
                    <h1 className="text-sm md:text-lg font-bold text-brand-dark truncate">Gestiones</h1>
                </>)}
            </div>

            {/* Buscador de escritorio, integrado en la zona del título (solo en la grilla).
                `search` NO va en las deps de este useMemo a propósito: este elemento viaja al header por
                `useSetPageHeader`, que lo guarda en un estado de contexto DESDE UN EFECTO. Si cambiara en
                cada tecla, el `value` del input llegaría un ciclo de render tarde y se perderían letras
                —el bug del 2026-09-17—. El texto lo maneja el propio BuscadorTrabajadores. */}
            {esGrilla && conRail && (
                <BuscadorTrabajadores
                    key={resetBusqueda}
                    obtenerValorInicial={leerBusquedaInicial}
                    onCambio={publicarBusqueda}
                    compacto
                    className="relative max-w-md w-full ml-4"
                />
            )}
        </div>
    ), [seccion, conSwitcher, esGrilla, conRail, irASeccion, resetBusqueda, leerBusquedaInicial, publicarBusqueda]);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-1.5 md:gap-2">
            {/* Desktop Desktop Actions */}
            <div className="hidden md:flex items-center gap-2">
                {/* CREAR: solo en la grilla. La portada tiene el mosaico Crear; Solicitudes y Documentos físicos traen su propio botón (Nuevo ingreso / Nuevo lote). */}
                {conCrear && (
                <Button
                    variant={showCreatePanel ? 'primary' : 'outline'}
                    size="sm" 
                    onClick={() => {
                        setShowCreatePanel(prev => !prev);
                        setShowFilters(false);
                    }}
                    leftIcon={<Plus className={cn("h-4 w-4 transition-transform duration-300 ease-out", showCreatePanel ? "rotate-45 scale-110" : "")} />}
                    className={cn(
                        "h-9 px-4 rounded-xl font-bold transition-all duration-300 shadow-sm border-border",
                        showCreatePanel 
                            ? "bg-brand-primary text-white border-transparent" 
                            : "bg-card text-brand-dark hover:bg-background"
                    )}
                >
                    {showCreatePanel ? 'CERRAR' : 'CREAR'}
                </Button>
                )}
                {/* Exportar / Limpiar son de la grilla: en las otras secciones no aplican. El botón
                    Filtros se mudó a la barra de la grilla (2026-09-16), pegado al borde por donde sale
                    el panel: acá arriba estaba a casi mil píxeles de su efecto. */}
                {esGrilla && (<>
                {/* Enviar sobre el resultado completo del filtro: es lo que antes se conseguía con
                    «Seleccionar todos» + Enviar. Sin selección manda `exportIds` —los que están a la
                    vista— y solo cuando tampoco hay filtros de esos va `undefined` y el backend arma el
                    Excel con la query. */}
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEmailModalOpen(true)}
                    disabled={workersVisibles.length === 0 || !hasPermission('reportes.enviar_email')}
                    leftIcon={<Mail className="h-3.5 w-3.5 text-brand-primary" />}
                    className={cn(
                        "h-9 px-4 rounded-xl shadow-sm border-border",
                        hasPermission('reportes.enviar_email') ? "bg-card hover:bg-background" : "opacity-40 grayscale pointer-events-none"
                    )}
                >
                    <span>Enviar</span>
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportExcel(exportIds)}
                    isLoading={exporting}
                    disabled={workersVisibles.length === 0 || !hasPermission('reportes.exportar')}
                    leftIcon={<FileDown className="h-3.5 w-3.5 text-brand-primary" />}
                    className={cn(
                        "h-9 px-4 rounded-xl shadow-sm border-border",
                        hasPermission('reportes.exportar') ? "bg-card hover:bg-background" : "opacity-40 grayscale pointer-events-none"
                    )}
                >
                    <span>Exportar</span>
                </Button>

                {/* Informe de actividades sugeridas: resumen por cargo de la semana + Excel.
                    No depende de la grilla ni de los filtros — es el mismo bloque del Inicio. */}
                {hasPermission('asistencia.actividades_sugeridas.informe') && (
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInformeModalOpen(true)}
                    leftIcon={<ClipboardList className="h-3.5 w-3.5 text-brand-primary" />}
                    className="h-9 px-4 rounded-xl shadow-sm border-border bg-card hover:bg-background"
                >
                    <span>Informe actividades</span>
                </Button>
                )}

                </>)}
            </div>

            {/* Mobile Actions — icon-buttons del DS: gris idle → verde hover, sin
                relleno activo. El estado se indica por el icono (Plus rota, Filter↔X,
                Filter↔X) y el badge, no por el color de fondo. */}
            <div className="md:hidden flex items-center gap-2">
                {conCrear && (
                <IconButton
                    variant="ghost"
                    aria-label="Crear"
                    onClick={() => { setShowCreatePanel(prev => !prev); setShowFilters(false); }}
                    className="rounded-xl border border-border shadow-sm"
                    icon={<Plus className={cn("h-4 w-4 transition-transform duration-300 ease-out", showCreatePanel ? "rotate-45 scale-110" : "")} />}
                />
                )}
                {esGrilla && (<>
                <IconButton
                    variant="ghost"
                    aria-label="Enviar por correo"
                    onClick={() => setEmailModalOpen(true)}
                    disabled={workersVisibles.length === 0 || !hasPermission('reportes.enviar_email')}
                    className="rounded-xl border border-border shadow-sm"
                    icon={<Mail className="h-4 w-4" />}
                />
                {/* Export Excel — paridad con desktop. Mismo gating de permiso/data. */}
                <IconButton
                    variant="ghost"
                    aria-label="Exportar Excel"
                    onClick={() => handleExportExcel(exportIds)}
                    disabled={workersVisibles.length === 0 || !hasPermission('reportes.exportar') || exporting}
                    className={cn("rounded-xl border border-border shadow-sm", exporting && "opacity-60")}
                    icon={<FileDown className={cn("h-4 w-4", exporting && "animate-pulse")} />}
                />
                {hasPermission('asistencia.actividades_sugeridas.informe') && (
                <IconButton
                    variant="ghost"
                    aria-label="Informe de actividades sugeridas"
                    onClick={() => setInformeModalOpen(true)}
                    className="rounded-xl border border-border shadow-sm"
                    icon={<ClipboardList className="h-4 w-4" />}
                />
                )}
                </>)}
            </div>
        </div>
    ), [workersVisibles.length, exporting, showCreatePanel, exportIds,
        esGrilla, conCrear, hasPermission, handleExportExcel]);

    useSetPageHeader(headerTitle, headerActions);

    // Los mismos controles para el rail (desktop) y la hoja (móvil): se instancian UNA vez y se montan
    // en el sitio que corresponda al ancho. Nunca los dos a la vez (antes sí, y duplicaba aria-labels).
    const panelFiltros = (
        <FilterPanel
            obras={obraOptions}
            empresas={empresaOptions}
            cargos={cargoOptions}
            filterObra={filterObra}
            setFilterObra={setFilterObra}
            filterEmpresa={filterEmpresa}
            setFilterEmpresa={setFilterEmpresa}
            filterCargo={filterCargo}
            setFilterCargo={setFilterCargo}
            filterCategoria={filterCategoria}
            setFilterCategoria={setFilterCategoria}
            filterActivo={filterActivo}
            setFilterActivo={setFilterActivo}
            filterCompletitud={filterCompletitud}
            setFilterCompletitud={setFilterCompletitud}
            filterAusentes={filterAusentes}
            setFilterAusentes={setFilterAusentes}
            filterIngresoDesde={filterIngresoDesde}
            setFilterIngresoDesde={setFilterIngresoDesde}
            filterIngresoHasta={filterIngresoHasta}
            setFilterIngresoHasta={setFilterIngresoHasta}
            tiposObligatorios={tiposObligatorios}
            filterFaltaDato={filterFaltaDato}
            setFilterFaltaDato={setFilterFaltaDato}
            filterDocTipoFalta={filterDocTipoFalta}
            setFilterDocTipoFalta={setFilterDocTipoFalta}
            filterDocVigencia={filterDocVigencia}
            setFilterDocVigencia={setFilterDocVigencia}
            filterSalidaDesde={filterSalidaDesde}
            setFilterSalidaDesde={setFilterSalidaDesde}
            filterSalidaHasta={filterSalidaHasta}
            setFilterSalidaHasta={setFilterSalidaHasta}
            abiertos={gruposAbiertos}
            onToggleGrupo={toggleGrupo}
            conteos={conteosGrupo}
        />
    );

    // Componentes extraídos al directorio components/consultas/...

    return (
        // Alto sin números mágicos (2026-09-16): el padre ya es un flex column con alto definido
        // (MainLayout), así que `flex-1 min-h-0` calcula lo que antes intentaba un calc() a mano — que
        // ignoraba la franja de "Entorno de pruebas" y se pasaba 4px en móvil.
        <div className="flex-1 min-h-0 flex flex-col gap-2 p-0 overflow-hidden w-full">
            {/* Buscador móvil. Se renderiza SOLO acá o SOLO en el header, nunca en los dos (regla §8.3):
                dos instancias tendrían dos textos locales y se desincronizarían al girar el teléfono. */}
            {esGrilla && !conRail && (
                <BuscadorTrabajadores
                    key={resetBusqueda}
                    obtenerValorInicial={leerBusquedaInicial}
                    onCambio={publicarBusqueda}
                    className="relative shrink-0"
                />
            )}

            {/* Panel Crear. Los filtros ya no viven acá: se fueron al rail lateral, que no le quita alto
                a la lista. Sin el <div> contenedor de antes, que sumaba un gap permanente aunque no
                hubiera panel abierto (AnimatePresence vacío no pinta nada). */}
            <AnimatePresence mode="wait">
                {showCreatePanel && (
                    <motion.div
                        key="create"
                        initial={{ height: 0, opacity: 0, y: -10 }}
                        animate={{ height: 'auto', opacity: 1, y: 0 }}
                        exit={{ height: 0, opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="relative shrink-0"
                    >
                        <CreatePanel
                            hasPermission={hasPermission}
                            setModalType={setModalType as any}
                            setSelectedWorkerForAction={setSelectedWorkerForAction}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Los Atajos ya no tienen fila propia: se pasan a la cabecera de la grilla, que tenía el
                centro vacío (ver TrabajadoresGrilla). Con eso y el banner de "10 meses" —que decía lo
                mismo que su chip— la lista recupera dos filas enteras. */}

            {/* Vista por sección (B8). Al aprobar una solicitud el trabajador ya existe → recargar la grilla. */}
            {seccion === 'inicio' ? (
                <GestionesInicio
                    permisos={permisosGestiones}
                    hasPermission={hasPermission}
                    solicitudesPendientes={solicitudes.pendientes}
                    lotes={lotes.pendientes}
                    lotesBadge={lotes.badge}
                    alertas={alertasDocs.alertas}
                    onIr={irASeccion}
                    setModalType={setModalType}
                    setSelectedWorkerForAction={setSelectedWorkerForAction}
                />
            ) : seccion === 'fisicos' ? (
                <DocumentosFisicosPanel />
            ) : seccion === 'solicitudes' ? (
                <SolicitudesIngresoPanel
                    refreshKey={solicitudesVersion}
                    onAprobada={() => performSearch(true)}
                    onNuevoIngreso={() => setModalType('solicitud')}
                />
            ) : (
            /* Grilla y rail son HERMANOS en una fila: abrir los filtros le quita ancho a la lista,
               nunca alto. `relative` porque en 768-1279px el rail flota acá dentro. */
            <div className="flex-1 min-h-0 flex gap-2 relative">
                <AnimatePresence initial={false}>
                    {showFilters && conRail && (
                        <FiltrosRail
                            key="rail"
                            id={ID_PANEL_FILTROS}
                            modo={railInline ? 'inline' : 'overlay'}
                            activeFilterCount={activeFilterCount}
                            onLimpiar={handleClearFilters}
                            onCerrar={() => setShowFilters(false)}
                        >
                            {panelFiltros}
                        </FiltrosRail>
                    )}
                </AnimatePresence>
                {/* La grilla está memoizada (React.memo): para que sirva, TODO lo que recibe tiene que ser
                    estable entre teclas — de ahí los useCallback y los useMemo de arriba. */}
                <TrabajadoresGrilla
                    workers={workersVisibles}
                    loading={loading}
                    activeFilterCount={activeFilterCount}
                    hasPermission={hasPermission}
                    selected={selectedWorkers}
                    onToggle={handleSelectWorker}
                    onClearSelection={clearSelection}
                    onOpen={setQuickViewId}
                    onEditar={abrirEdicion}
                    onConstancia={setConstanciaWorker}
                    onDesvincular={handleDelete}
                    onReactivar={handleReactivate}
                    onDepurar={handleDepurar}
                    onEnviar={abrirEnvioEmail}
                    onExportar={handleExportExcel}
                    exporting={exporting}
                    onClearFilters={handleClearFilters}
                    formatFecha={formatFechaIngreso}
                    filtros={botonFiltros}
                    atajos={chipsAtajos}
                />
            </div>
            )}

            {/* Modals */}
            <Modal
                isOpen={informeModalOpen}
                onClose={() => setInformeModalOpen(false)}
                title="Asistencia a actividades sugeridas"
                size="lg"
            >
                {informeModalOpen && <ActividadesSemana />}
            </Modal>

            <EnvioEmailModal
                isOpen={emailModalOpen}
                onClose={() => setEmailModalOpen(false)}
                destinatarioEmail=""
                filters={{
                    obra_id: filterObra,
                    empresa_id: filterEmpresa,
                    cargo_id: filterCargo,
                    categoria_reporte: filterCategoria,
                    activo: filterActivo,
                    // Sin `q`: el texto se filtra en el cliente y lo que viaja son los ids visibles
                    // (`trabajador_ids`), que por construcción son lo que se ve en pantalla.
                }}
                // SOLO la selección explícita: `trabajador_ids` no elige únicamente las filas del Excel —
                // en `fiscalizacion.routes.js` también dispara `zipService.createZip(...)`, que adjunta
                // los DOCUMENTOS de cada id. Mandar acá los ids visibles enviaría por correo los papeles
                // de cientos de personas sin que nadie lo haya pedido.
                trabajador_ids={selectedWorkers.size > 0 ? Array.from(selectedWorkers) : undefined}
            />

            {/* Worker Form Modal (Create/Edit) */}
            <Modal
                isOpen={modalType === 'form'}
                onClose={() => setModalType(null)}
                title={selectedWorkerForAction ? "Editar Trabajador" : "Registrar Nuevo Trabajador"}
                size="md"
                headerAction={
                    modalType === 'form' ? (
                        <Button
                            type="submit"
                            form="worker-form"
                            size="sm"
                            leftIcon={<Save className="h-3.5 w-3.5" />}
                        >
                            Guardar
                        </Button>
                    ) : undefined
                }
            >
                {modalType === 'form' && (
                    <WorkerForm
                        initialData={selectedWorkerForAction}
                        onCancel={() => setModalType(null)}
                        onSuccess={() => {
                            setModalType(null);
                            performSearch(true);
                        }}
                    />
                )}
            </Modal>

            {/* Solicitud de ingreso (ficha digital): terreno la envía, la oficina la revisa en la pestaña Solicitudes */}
            <Modal
                isOpen={modalType === 'solicitud'}
                onClose={() => setModalType(null)}
                title="Nuevo ingreso · Ficha de solicitud"
                size="lg"
            >
                {modalType === 'solicitud' && (
                    <SolicitudIngresoForm
                        onCancel={() => setModalType(null)}
                        onEnviada={() => {
                            // La solicitud ya existe: refrescar badge y lista aunque el usuario
                            // cierre el modal con la X en vez de "Cerrar".
                            solicitudes.refetch();
                            setSolicitudesVersion(v => v + 1);
                        }}
                        onClose={() => setModalType(null)}
                    />
                )}
            </Modal>

            {/* Desvincular / Reactivar (plan Gestiones B4): causal obligatoria + historial; la marca solo advierte */}
            <DesvincularModal
                isOpen={modalType === 'finiquito'}
                worker={selectedWorkerForAction}
                onClose={() => setModalType(null)}
                onDone={handleAccionCompletada}
            />
            <ReactivarModal
                isOpen={modalType === 'reactivar'}
                worker={selectedWorkerForAction}
                onClose={() => setModalType(null)}
                onDone={handleAccionCompletada}
            />

            {/* Depurar Modal */}
            {modalType === 'depurar' && selectedWorkerForAction && (
                <Modal isOpen={true} onClose={() => setModalType(null)} title="Depurar Registro de Trabajador">
                    <div className="p-6">
                        <div className="bg-amber-50 dark:bg-amber-500/10 text-amber-950 dark:text-amber-200 p-5 rounded-2xl border border-amber-200 dark:border-amber-800/60 mb-6 flex items-start gap-4">
                            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0 text-amber-700 dark:text-amber-300">
                                <Eraser className="h-6 w-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-amber-900 dark:text-amber-200 mb-1">Confirmar Limpieza de Registro</h4>
                                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                                    Estás a punto de eliminar definitivamente a <strong className="text-amber-950 dark:text-amber-100 font-black">{selectedWorkerForAction.nombres} {selectedWorkerForAction.apellido_paterno}</strong> de la base de datos.
                                    Esta acción es **irreversible** y borrará todos sus documentos y registros de asistencia.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm text-brand-dark font-medium">
                                Para confirmar esta acción, escribe el RUT del trabajador: <strong className="select-none font-semibold text-foreground">{selectedWorkerForAction.rut}</strong>
                            </p>
                            <Input
                                placeholder="Escribe el RUT para confirmar"
                                value={depurarConfirmationRut}
                                onChange={(e) => setDepurarConfirmationRut(e.target.value)}
                                className="h-12 text-lg font-mono text-center tracking-widest text-brand-dark font-black bg-muted border-2 border-border focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
                            />
                        </div>

                        <div className="flex gap-3 pt-6 mt-6 border-t border-border">
                            <Button variant="outline" onClick={() => setModalType(null)} className="flex-1">Cancelar</Button>
                            <Button
                                variant="destructive"
                                className="flex-1 font-bold"
                                disabled={depurarConfirmationRut !== selectedWorkerForAction.rut}
                                onClick={confirmDepurar}
                                leftIcon={<Trash2 className="h-4 w-4" />}
                            >
                                Depurar Definitivamente
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Other Create Modals */}
            <Modal
                isOpen={modalType === 'empresa'}
                onClose={() => setModalType(null)}
                title="Nueva Empresa"
                size="md"
                headerAction={
                    modalType === 'empresa' ? (
                        <Button type="submit" form="empresa-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Guardar
                        </Button>
                    ) : undefined
                }
            >
                <EmpresaForm
                    hideActions
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                        fetchCatalogs();
                    }}
                />
            </Modal>

            <Modal
                isOpen={modalType === 'obra'}
                onClose={() => setModalType(null)}
                title="Nueva Obra / Proyecto"
                size="md"
                headerAction={
                    modalType === 'obra' ? (
                        <Button type="submit" form="obra-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Guardar
                        </Button>
                    ) : undefined
                }
            >
                <ObraForm
                    hideActions
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                        fetchCatalogs();
                    }}
                />
            </Modal>

            {/* Hoja de filtros en teléfono (<768px). Arriba de ese ancho el mismo panel vive en el rail
                lateral: se elige por matchMedia, nunca las dos ramas montadas a la vez. */}
            <AnimatePresence>
                {showFilters && !conRail && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowFilters(false)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[1000]"
                        />
                        
                        {/* Sheet */}
                        <motion.div
                            drag="y"
                            dragConstraints={{ top: 0 }}
                            dragElastic={0.1}
                            onDragEnd={(_, info) => {
                                if (info.offset.y > 150 || info.velocity.y > 500) {
                                    setShowFilters(false);
                                }
                            }}
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            id={ID_PANEL_FILTROS}
                            className="fixed bottom-0 left-0 right-0 w-full max-h-[85dvh] bg-card rounded-t-[32px] shadow-2xl z-[1001] flex flex-col overflow-hidden"
                        >
                            {/* Drag Handle */}
                            <div className="pt-3 pb-2 flex justify-center shrink-0" onClick={() => setShowFilters(false)}>
                                <div className="w-12 h-1.5 rounded-full bg-muted" />
                            </div>

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 pb-4 pt-1 shrink-0">
                                <h3 className="text-lg font-bold text-brand-dark">Filtros de Búsqueda</h3>
                                <IconButton
                                    variant="ghost"
                                    aria-label="Cerrar filtros"
                                    onClick={() => setShowFilters(false)}
                                    className="bg-muted"
                                    icon={<X className="h-5 w-5" />}
                                />
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto px-5 pb-8 custom-scrollbar">
                                {panelFiltros}
                                {activeFilterCount > 0 && (
                                    <Button
                                        variant="destructive"
                                        onClick={handleClearFilters}
                                        className="w-full mt-6 font-bold uppercase tracking-widest text-label h-11 rounded-xl"
                                    >
                                        Limpiar Selecciones
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <Modal
                isOpen={modalType === 'cargo'}
                onClose={() => setModalType(null)}
                title="Nuevo Cargo"
                size="md"
                headerAction={
                    modalType === 'cargo' ? (
                        <Button type="submit" form="cargo-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Crear
                        </Button>
                    ) : undefined
                }
            >
                <CargoForm
                    hideActions
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                        fetchCatalogs();
                    }}
                />
            </Modal>

            <Modal
                isOpen={modalType === 'tipodoc'}
                onClose={() => setModalType(null)}
                title="Nuevo Tipo de Documento"
                size="md"
                headerAction={
                    modalType === 'tipodoc' ? (
                        <Button type="submit" form="tipodoc-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Guardar
                        </Button>
                    ) : undefined
                }
            >
                <TipoDocumentoForm
                    hideActions
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                    }}
                />
            </Modal>

            {quickViewId && (
                <WorkerQuickView
                    workerId={quickViewId}
                    onClose={() => setQuickViewId(null)}
                    onUpdate={() => performSearch(true)}
                />
            )}

            <EmitirAmonestacionModal
                isOpen={!!constanciaWorker}
                onClose={() => setConstanciaWorker(null)}
                worker={constanciaWorker}
            />
        </div>
    );
};

export default ConsultasPage;
