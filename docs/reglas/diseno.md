# Diseño — Design System (Fase 2)

Reglas del design system de Bóveda LOLS. Fundación creada en **F2.1**; la migración
de páginas ocurre en F2.2+. Objetivo F2: 0 `text-[Npx]` arbitrarios, 0 `<button>`
crudos, 1 fuente de formato, 1 fuente de estados. Ver `docs/ARQUITECTURA.md` (F2).

---

## 1. Tipografía

Escala semántica en `frontend/src/index.css` (bloque `@theme`). Tailwind v4 genera
la utilidad `text-<n>` desde `--text-<n>`.

| Token | Tamaño | Uso |
|---|---|---|
| `text-micro` | 9px | micro-etiquetas, badges muy chicos |
| `text-caption` | 10px | captions, pills, metadata |
| `text-label` | 11px | labels de campos, chips |
| `text-section` | 13px | títulos de sección/card |
| `text-xs`…`text-lg` (Tailwind) | 12px+ | cuerpo y títulos normales |

**Regla:** nunca uses `text-[Npx]` arbitrario. Mapa de migración:

| Arbitrario | → |
|---|---|
| `text-[7px]` / `text-[8px]` / `text-[9px]` | `text-micro` (7/8 redondean a 9) |
| `text-[10px]` | `text-caption` |
| `text-[11px]` | `text-label` |
| `text-[12px]` | `text-xs` (Tailwind, ya = 12px) |
| `text-[13px]` | `text-section` |
| `text-[14px]` | `text-sm` (Tailwind) |

Los tokens usan **nombres propios** (no `xs/sm/base/lg`) para NO pisar la escala de
Tailwind y evitar un desplazamiento global.

### Escala GRANDE — jerarquía de página (F5, espíritu Apple)
Para heros, encabezados, títulos de card/sección, leads y texto base **cómodo**. La
escala diminuta de arriba queda para metadata terciaria. Tracking negativo obligatorio
en `display`/`headline`/`title` (da el look SF Pro).

| Token | Tamaño / tracking | Uso |
|---|---|---|
| `text-display` | 56px / `tracking-display` | hero (login, marketing) |
| `text-display-sm` | 44px | hero móvil/secundario |
| `text-headline` | 32px / `tracking-headline` | título de página (PageHeader) |
| `text-title` | 24px / `tracking-title` | título de card/sección |
| `text-title-sm` | 20px | subtítulo de bloque |
| `text-body-lg` | 19px | lead/intro |
| `text-body` | 17px | cuerpo en superficies que respiran |
| `text-ui` | 15px | **texto base cómodo** de app/tablas/inputs |

Tracking: `tracking-display` (-0.03em), `tracking-headline` (-0.022em), `tracking-title`
(-0.018em), `tracking-tight` (-0.01em). Siguen siendo tokens → **nunca `text-[Npx]`**.

### `cn()` conoce los tamaños propios (2026-10-16)
`utils/cn.ts` registra las dos escalas en tailwind-merge (`extendTailwindMerge`, escala `text`
del tema; lista `TAMANOS_TEXTO_PROPIOS`). Antes no las conocía: tomaba `text-caption` & cía.
por **colores** y las borraba si después venía un `text-<color>` en la misma llamada
(`cn('text-caption', 'text-muted-foreground')` → solo el color; la etiqueta heredaba 16px).
Ahora un tamaño y un color conviven, y entre dos tamaños gana el último, igual que con
`text-xs`/`text-sm`. Consecuencias:
- Lo que se veía a 16px por el borrado (`<Chip>`, `<StatusBadge>`, pills, contadores,
  cifras de `GestionesInicio`…) toma el tamaño que el código siempre pidió.
- Donde 16px era el aspecto querido se fijó `text-base` explícito: pestañas de Inventario
  (`PestanasElasticas` + `BodegaVirtualToggle`), de Configuración y la de Asistencia móvil;
  y, por decisión del dueño tras verlo en staging, los controles de cada fila de Asistencia
  diaria (nº, A/F/JI/TO, Detalle, horas extra; los tres layouts) y los filtros de estado de
  Solicitudes (`StatusFilterBar`).
- Ojo con `leading-*`: en tailwind-merge un tamaño borra el `leading-*` que venga **antes**
  en la misma llamada (`cn('leading-none', 'text-caption')` → solo `text-caption`). Pon el
  `leading-*` después del tamaño (al 2026-10-16 no hay ningún caso así).
- **Token nuevo en `index.css` (`--text-<n>`) ⇒ sumarlo a `TAMANOS_TEXTO_PROPIOS`**;
  `cn.test.ts` falla si las dos listas no calzan.

## 2. Colores

Tokens en `index.css` (`@theme inline` + `:root`/`.dark`): `brand-primary`,
`brand-dark`, `brand-accent`, `muted`, `card`, `border`, `destructive`,
`success`/`warning`/`info` (+ `-foreground`). Dark mode vía clase `.dark`.

**Regla:** no hardcodear hex en JSX; usar tokens (`bg-card`, `text-muted-foreground`,
`border-border`, …). La paleta de pills de estado vive en `statusConfig.ts` (§4).

## 3. Catálogo de primitivas — `frontend/src/components/ui/`

| Componente | Cuándo usar | Props clave |
|---|---|---|
| `Button` | acción con texto (submit, CTA) | variant, size, leftIcon, isLoading |
| `IconButton` | botón **solo-icono** (cerrar, editar, toggle) | icon, variant, size, **`aria-label` requerido** |
| `Chip` | etiqueta/tag genérico estático | label, icon, tone |
| `StatusBadge` | estado de **dominio** (transferencia, obra, stock…) | `domain`+`status`+`showIcon`, o `tone`+`label` |
| `EmptyState` | listado/grid sin datos | icon, title, description, action |
| `Section` | card con título + cuerpo | title, action, children |
| `Input`/`Select`/`SearchableSelect`/`Modal`/`SearchBar`/`PageHeader` | (existentes) | — |

**Anti-pattern:** `<button>` crudo. Usar `Button` (texto) o `IconButton` (icono).
Excepción legítima rara → `// eslint-disable-next-line no-restricted-syntax` + comentario.

### Regla de iconos (botones-icono)
**TODOS los botones-icono van GRISES en reposo** (`text-muted-foreground`) y solo
cambian a su color **al hover**. **Sin relleno persistente** — ni los toggles
activos ni los CTA conservan color de fondo; el estado activo se indica por el
panel abierto / un badge / el cambio de icono (ej. Plus rota, Filter↔X), nunca por
el color del botón. Implementado en `IconButton`:
- `variant="ghost"` → gris → **verde** (brand-primary) al hover · acciones neutras
  (calendario, ver, editar, constancia, reactivar, crear, filtros, exportar, cerrar).
- `variant="danger"` → gris → **rojo** (destructive) al hover · eliminar / depurar / baja.
- `variant="primary"` (relleno) **NO** se usa para icon-buttons (rompe la regla);
  reservado para casos no-icono excepcionales.
No usar `<Button size="icon">` con color idle (ej. `text-brand-primary`/`text-destructive`):
migrar a `IconButton`. Las páginas ya migradas heredan la regla del primitivo.

**Tercer color de hover permitido — ámbar (warning):** acciones de *archivar* o
*destacar* (finalizar obra, plantilla predeterminada) pueden hacer hover
gris→ámbar (`hover:text-warning hover:bg-warning/10` o equivalente). Sigue
aplicando gris en reposo.

**Excepción de marca — WhatsApp (verde persistente):** los botones-icono de *compartir por
WhatsApp* conservan un tinte **verde persistente** (no gris-idle) por reconocibilidad de marca y
porque en mobile no hay hover — análogo a las excepciones de encabezados verdes/tabs/toasts. Tokens
de la escala `green` (ej. `bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300`),
nunca hex. Aplicado en el detalle de transferencia (`TransferenciaActionsMenu`); patrón replicable a
los WhatsApp de asistencia/actividades sugeridas.

### CTAs destructivas y decoración (F2.9)
- **CTA destructiva** (confirmar finiquito / depurar / borrar): `<Button
  variant="destructive">` — tinte `bg-destructive/10 text-destructive`, relleno
  solo al hover. **Prohibido** `bg-destructive` sólido en reposo. CTA de
  *archivado* (reversible, ej. finalizar obra): tinte warning
  (`bg-warning/10 text-warning hover:bg-warning hover:text-warning-foreground`).
- **Decoración = paleta neutra.** Todo color fuera de verde/blanco/negro/gris
  debe representar un DATO (estado de dominio, criticidad, advertencia de
  consecuencia). Iconos de saludo, tiles de acción, gradientes y badges de
  categoría (ej. verbos de permisos) van en `brand-*`/`muted`. Lo semántico se
  escribe con **tokens** (`destructive`/`warning`/`success`), nunca
  rose/amber/purple/yellow hardcodeados.

## 4. statusConfig — `frontend/src/utils/statusConfig.ts`

Mapas de estado tipados por dominio. Shape:

```ts
interface StatusConfigEntry { label: string; classes: string; icon?: ElementType; borderLeft?: string; }
```

Dominios: `transferencia`, `tipoFlujo`, `discrepancia`, `movimiento`, `stock`,
`asistencia`, `obra`, `vehiculoRevision`. Consumidos por `<StatusBadge domain=... />`.

**⚠️ Tailwind JIT:** cada `classes` debe ser un **literal estático completo**.
NUNCA concatenar (`'bg-' + color`) — el JIT no genera la clase y el pill queda sin
color.

## 5. Helpers de formato — `frontend/src/utils/format.ts`

Superficie única: `formatCLP`/`fmtMoney` (dinero CLP), `fmtMoneyExacto`,
`fmtMoneyCompacto`, `fmtNumber` (miles sin $), y re-exporta las fechas de
`fechas.ts` (`fmtFecha`, `fmtFechaCorta`, `formatDuracion`…).

| Helper | Salida | Cuándo |
|---|---|---|
| `fmtMoney` | `$14.901.523.456` | **Default para TODO monto visible** (KPIs, tablas, listas, tooltips, Excel). Redondea. |
| `fmtMoneyExacto` | `$1.234,56` | Precios unitarios / montos de factura, donde redondear alteraría el dato del documento. |
| `fmtMoneyCompacto` | `$14.902M` · `$40,7M` | **SOLO ticks de eje en gráficos**, donde el ancho es físicamente insuficiente. |

**Regla:** no redefinir `fmtMoney`/`fmtDate`/`fmtFecha` locales — importar de
`utils/format`. `formatCLP` redondea y descarta NaN/null (los duplicados locales no).

**Regla de abreviación:** nunca abreviar montos fuera de un eje de gráfico, y
jamás con `toFixed` — en Chile el punto es separador de MILES, así que
`(n/1e6).toFixed(1)` producía `$14901.5M`, ilegible (bug real del Resumen
Ejecutivo). Si un monto completo no cabe, se agranda el contenedor o se baja el
tamaño de fuente (ver el `value.length` adaptativo de `KpiCard`), no se abrevia.
Cubierto por `frontend/src/utils/format.test.ts`.

## 6. Reglas ESLint y política de migración

`frontend/eslint.config.js` (+ regla local `eslint-local/no-arbitrary-text-size.js`):
- `no-restricted-syntax` → prohíbe `<button>` crudo.
- `ds/no-arbitrary-text-size` → prohíbe `text-[Npx]` en className.

Severidad **`error`** desde el **cierre de F2 (2026-06-15)**: los ~326 `<button>` crudos y
~568 `text-[Npx]` originales fueron migrados a primitivas/tokens o conservados con
`eslint-disable-next-line no-restricted-syntax -- <razón>` justificado → **0 violaciones** de
ambas reglas. Lint NO está en el gate de deploy (gate = `tsc` + `npm test` + `build`); las reglas
en `error` son guía local anti-regresión. Al introducir un `<button>` denso legítimo, añade el
disable con razón en la línea inmediatamente superior.

### Checklist de migración por-página (F2.2+)
1. `text-[Npx]` → token (§1).
2. `<button>` crudo → `Button` (texto) / `IconButton` (icono, +`aria-label`).
3. `fmtMoney`/`fmtDate` local → import de `utils/format`.
4. Estado inline / mapa local → `<StatusBadge>` + entrada en `statusConfig.ts`.
5. `tsc --noEmit` + `npm run build` + eyeball en claro **y** oscuro (los pills tienen `dark:`).

---

## 7. Espíritu Apple — guía visual (F5, rediseño)

El norte es apple.com: **simplicidad y belleza**. Recuperar eso de forma integral.
Principios y reglas concretas:

1. **Jerarquía tipográfica fuerte.** Titulares grandes con tracking negativo (escala
   §1 "GRANDE"); cuerpo regular. La jerarquía se logra por **escala + peso**, no por
   color. Texto base cómodo (`text-ui` 15px); evitar las tallas diminutas (9–11px)
   salvo metadata terciaria real.
2. **Whitespace generoso.** Dejar respirar. Contenedores `max-w-marketing` (960px) /
   centrados en superficies de lectura; gutters amplios. "Minimalismo en todo": las
   superficies de datos también respiran (filas altas, padding cómodo), conservando
   función (orden/filtros/paginación).
3. **PALETA — neutral-dominante + verde SOLO para ACCIÓN (sistema validado).** Fuente única de verdad:
   la skill **`.claude/skills/diseno-lols/`** (fundamentada con investigación citada: shadcn/ui +
   Linear/Stripe + Atlassian/Fluent 2 + WCAG). Resumen:
   - **Superficies NEUTRAS:** página gris muy claro, cards/paneles **blancos** (`bg-card`) con **borde
     fino** (`border-border`). Se separan por **borde/sombra** (claro) o neutro más claro (oscuro),
     **NUNCA por tinte de color**. (El "fondo verde uniforme" previo se revierte: usar color de marca en
     superficies grandes diluye la jerarquía — Fluent 2.)
   - **Verde `#029E4D` = SOLO acción** (botón primario, anillo de foco, nav activo, selección, delta ↑).
     Nunca como **fondo** de superficies grandes (cards/heros/paneles).
   - **EXCEPCIÓN (decisión usuario 2026-06-15): encabezados con FONDO verde.** Los encabezados de
     columna de tabla (`<thead>`/`<th>`) y las **barras de sección que ya tienen contenedor** (cabeceras
     de card, botones colapsables, barras de grupo) llevan **`bg-brand-primary` + texto `text-white`**
     (mismo patrón que el tab activo). NO aplica a: título PRINCIPAL de página (PageHeader/h1), nombres
     de **entidad** (obra/ítem/trabajador = dato neutro), ni **títulos de subsección sueltos** (sin
     contenedor: h2/h3/h4/span dentro de la card sin barra propia) → esos quedan en su color neutro
     (`text-brand-dark`/`text-muted-foreground`). Es la única excepción al "verde solo para acción".
     (Nota contraste: white/#029E4D ≈ 3.5:1, aceptado por consistencia con tabs/toasts del sistema.)
   - **Color = significado:** verde = éxito/constructivo · rojo (`destructive`) = **destructivo/error** ·
     ámbar (`warning`) = precaución / **pendiente / por hacer / por vencer / "sin registro"** · azul
     (`info`) = en progreso. **El contenido va neutro** (nombres/títulos/datos).
   - Contraste **WCAG AA** (4.5:1 texto <24px; 3:1 texto grande/íconos/bordes/foco). Solo **tokens** (cero
     hex, cero `text-[Npx]`). Sin emojis de color.
   **Invocar la skill `diseno-lols` al diseñar o revisar UI; pasar `review-rubric.md` antes de cerrar una
   pantalla.** (Propagar a `statusConfig.ts` y a las pantallas en el rollout.)
4. **Botones.** Acción = **pill** con acento verde sólido (`<Button variant="primary">`,
   ya `rounded-full`). Navegación/secundario sutil = `<Button variant="link">` (texto
   verde + chevron `›`, estilo "Más información ›"). El press oscurece a verde, **nunca
   azul**.
5. **Interacción sutil.** Hover = cambio de **brillo/opacidad**, NO `scale`. Transición
   `duration-200 ease-apple`. Reveals suaves solo en heros/headers, respetando
   `prefers-reduced-motion` (ver §9 y `Login.tsx`).
6. **Bordes y sombras casi invisibles.** Preferir **borde hairline** (`border-border`)
   a sombras marcadas. Sombra sutil solo en hover/elevación real (modales). No acumular
   borde + sombra + gradiente en la misma card.
7. **Radios.** `rounded-card` (20px) en cards/secciones, `rounded-control` (12px) en
   inputs/selects, `rounded-pill` en botones de acción.

**Referencia canónica del look:** `frontend/src/pages/Login.tsx` (hero a pantalla
dividida) — úsalo como ancla al migrar otras pantallas en F5.

---

## 8. Paneles laterales y filtros (2026-09-16)

1. **Los filtros de una lista larga van en un rail vertical, no en una banda horizontal.** Una pantalla
   de datos se lee en vertical: cada fila es un registro. Si el panel de filtros se abre **encima** de la
   lista dentro de un contenedor de alto fijo, no la desplaza: le quita filas justo cuando el usuario
   quiere ver el resultado de lo que está filtrando. El rail le quita **ancho**, que sobra.
   (Coincide con Baymard, Pencil & Paper y Helios: el sidebar escala en vertical, persiste mientras se
   recorre el resultado y no esconde tipos de filtro detrás de un "ver más".)
   Implementación de referencia: `components/consultas/FiltrosRail.tsx` + `FilterPanel.tsx`.
2. **Tres presentaciones del mismo panel, por ancho:** ≥1280 columna en flujo que empuja el contenido ·
   768–1279 la misma columna flotando sobre él, con backdrop · <768 hoja inferior arrastrable.
3. **Elegir la presentación con `useMediaQuery` (`hooks/useMediaQuery.ts`), NUNCA con
   `hidden md:block` / `md:hidden`.** Las dos ramas CSS montan los hijos **dos veces** en el DOM: ids de
   formulario duplicados (el caso de `ui/Modal.tsx`) o `aria-label` duplicados (el caso de los filtros).
4. **Más de ~8 controles → grupos plegables con contador**, con los grupos más usados abiertos y los que
   traen un valor por deep-link desplegados solos. La estructura y el conteo van en un `.ts` puro con
   test (el jest del front solo corre `*.test.ts` sin JSX).
5. **Un popover dentro de un contenedor con scroll va en portal con `position: fixed`.** Un `absolute`
   queda recortado por el `overflow` del panel. Cierra con click fuera, `Escape` y scroll.
6. **Filtrado instantáneo** (sin botón "Aplicar") mientras el conjunto sea chico. "Limpiar" siempre
   visible en la cabecera del panel cuando haya algo puesto. El debounce que pedía esta regla vale para
   los controles que van al servidor; el buscador de texto **no lo lleva** — ver la regla 13.
7. **El disparador vive donde ocurre el efecto.** El botón que abre un panel lateral va pegado al borde
   por el que el panel aparece, no en el header global: si el panel entra por la izquierda de una tabla,
   el botón va en el extremo izquierdo de la cabecera de esa tabla. Referencia:
   `components/consultas/BotonFiltros.tsx`.
8. **Nada de morph con `layoutId` desde un control que vive dentro de un contenedor `overflow-hidden`
   hacia un panel que está fuera de él**: al cerrar, el elemento arranca con el tamaño del panel y esa
   misma card lo rebana durante casi toda la animación. Lo que sí funciona es una **estela** que barre
   hacia el borde por donde entra el panel — ahí el recorte juega a favor: la estela se mete por la
   ranura y el panel toma la posta.
9. **Nunca animar `width`/`height`/`margin` de un contenedor que comparte fila con una tabla grande.**
   Cada frame obliga al navegador a rehacer el layout, y una tabla de ancho automático vuelve a medir
   todas las celdas de todas las filas: con 40 filas ya se nota el tirón, con 250 es inusable. El panel
   toma su ancho **de una vez** (un solo reflow) y lo que se anima es `transform`/`opacity`. Por la misma
   razón, nada de `backdrop-blur` sobre una tabla mientras algo se mueve encima.
10. **Una lista flotante nunca se cierra por «un scroll cualquiera».** `scroll` no burbujea, pero un
    listener en `window` con `capture: true` **sí** recibe el de la propia lista, así que cerrar ahí la
    vuelve inusable: un tic de rueda y desaparece (pasó el 2026-09-16 con `FilterSelect`). El handler
    debe: (1) ignorar el scroll originado dentro del popover; (2) ante el de un ancestro, **reposicionar**
    —amortiguado con `requestAnimationFrame`, como `useTutorialSpotlight`— en vez de cerrar; (3) cerrar
    solo si el disparador salió de la pantalla. Y la lista lleva `overscroll-contain`, para que al llegar
    al final la rueda no siga scrolleando lo de atrás.
    **Nada de esto se vuelve a escribir a mano:** el cableado es `hooks/usePosicionFlotante.ts` y la
    aritmética `components/ui/popoverPos.ts` (puro, con test). El hook devuelve `disparadorRef`,
    `flotanteRef` (el que deja ignorar el scroll propio), `estilo` y `medir()`; se llama `medir()` en el
    mismo handler que abre, **antes** del `setOpen(true)`, porque medir dentro de un efecto es un
    `setState` en efecto y además parpadea. La variante (`'lista'` / `'hoja'` / `'tooltip'`) elige qué
    parte del cálculo llega al `style`: un menú que ya fija su ancho por CSS —los de asistencia son
    `fixed left-3 right-3` en mobile— pide `'hoja'` y recibe solo la vertical, porque un `left`/`width`
    en línea pisaría esas clases. (2026-09-16: los menús móviles de asistencia y el tooltip de
    `StockBadge` medían una vez al abrir y se quedaban clavados al viewport al scrollear.)
11. **La animación no puede mentir sobre la dirección.** El icono dice de dónde viene el panel
   (`PanelLeftOpen`/`PanelLeftClose` para un lateral, `SlidersHorizontal` para una hoja inferior) y el
   panel se despliega **desde el borde del disparador**: un panel en flujo que anima su ancho debe anclar
   su contenido al lado que toca el botón (`justify-end` cuando el botón queda a la derecha del panel),
   o se revelará por el lado contrario y el gesto se leerá al revés. Con `prefers-reduced-motion`, solo
   fundido (`useReducedMotion`, precedente en `ui/Modal.tsx`).
12. **El listener que cierra un menú va gateado por «abierto», y vive en `hooks/useCierreExterno.ts`.**
    Registrarlo con deps `[]` —como hacían `ObraSelector`, `NotificationBell` y el overflow del header de
    asistencia— significa que cada `mousedown` y cada `touchstart` de la aplicación entera, en cualquier
    pantalla y con todo cerrado, entra al handler y dispara un `setOpen(false)` inútil. El hook no
    registra nada mientras `abierto` sea falso. Dos detalles que se pagan caro si se reimplementan: un
    popover **en portal no cuelga del ancla**, así que hay que pasarle el ref del flotante en `extras` o
    el menú se cerrará al tocar sus propias opciones (de ahí `hooks/cierreExterno.ts`, puro y con test); y
    `alCerrar` es un callback libre, no un `setOpen`, porque hay menús que al cerrarse pliegan además su
    detalle (la campana). Un menú `absolute` dentro de un `relative` necesita **solo** este hook, no el
    de colocación.
13. **Un buscador que filtra una lista ya cargada no va al servidor, y el debounce no es lo que arregla
    que se pierdan letras.** (2026-09-17, Gestiones → Trabajadores.) Con menos de ~1.000 registros y un
    índice pre-normalizado, filtrar cuesta microsegundos: pedirle al servidor una vez por tecla solo
    agrega latencia, y un debounce agrega más. Lo que sí traba el input es el **render**. Tres reglas:
    - **El texto vive en el componente del input.** Nunca en un estado de arriba que se lo reinyecte —y
      muchísimo menos viajando por un contexto que lo guarda **desde un efecto**, como hace
      `PageHeaderContext`: ahí el `value` llega un ciclo de render tarde, React le devuelve al nodo DOM
      el valor viejo al cerrar el evento y las pulsaciones rápidas se pierden. Ese fue el bug exacto de
      Gestiones, y por eso `BuscadorTrabajadores` es dueño de su texto y publica hacia arriba. Para
      resetearlo desde afuera se le cambia la `key`; pasarle el valor lo devolvería al principio. Y el
      valor inicial entra como **getter estable**, no como string: un buscador que vive en el header
      **se desmonta** al salir de la sección o al cruzar el breakpoint, y si al volver leyera un valor
      viejo, la caja aparecería vacía sobre una lista filtrada. El getter es además lo que permite que
      el elemento no dependa del texto y el header no se recomponga por tecla.
    - **Lo que se deriva del texto usa el valor diferido, no el inmediato** — la lista, el contador de
      filtros activos, los ids de exportación. Si alguno usa el inmediato, cambia en el render urgente
      y esa sola prop distinta basta para que la lista memoizada se renderice igual.
    - **`useDeferredValue` y `React.memo` van juntos o no van.** El primero baja de prioridad el render
      de la lista; el segundo permite que la lista se lo salte. Uno sin el otro no hace nada. React
      Compiler **no** está instalado en este repo y, aunque lo estuviera, no reemplaza al primero.
    - **La aritmética del match vive en un `.ts` puro con test** (`utils/busquedaTrabajadores.ts`, usado
      por Asistencia y por Gestiones): normalizar con `NFD` una sola vez al cargar, no por tecla; el RUT
      indexado en sus tres escrituras; multi-token con AND; y la empresa por **alias**, no por substring.
      Nada de librerías de fuzzy: sobre un RUT, dos dígitos distintos están a una edición de distancia.

    Por encima de ~2.000 registros esto deja de aplicar y hay que volver al servidor con paginación.

---

## 9. Movimiento (2026-10-15, corte React Bits)

1. **Base única.** `main.tsx` envuelve la app en `<MotionConfig reducedMotion="user">` (framer-motion).
   Si el sistema pide «reducir movimiento», framer apaga transform y layout y deja solo la opacidad.
   **No cubre** `pathLength`, `filter`, el `animate()` imperativo, los keyframes CSS ni recharts. Esos
   casos chequean `useReducedMotion()`, van bajo `@media (prefers-reduced-motion: no-preference)` o usan
   `motion-safe:` / `motion-reduce:`. Referencias: `ui/Skeleton` y el punto de «Esperando rotación» de
   `MainLayout` (`motion-safe:animate-pulse`), `AttendanceTrend` (`isAnimationActive={!reduce}` en
   **cada** hijo animado de recharts: `Area`/`Bar`/`Line`/`Pie` y también `Tooltip`, que si no se desliza
   400 ms entre puntos; 600 ms) y `ui/MarcaEstado` (`useReducedMotion`). Los `useReducedMotion` que ya
   existían (`Login`, `Modal`, `BotonFiltros`, `FiltrosRail`) se mantienen. Quedan ~70 `animate-*` sin
   `motion-safe:` heredados; se migran al tocar cada archivo. Un loop infinito va en CSS (no corre dentro
   de un `display:none` y va en el compositor), nunca con `repeat: Infinity` de framer, que en `rotate`
   y similares es un loop JS que despierta cada frame aunque el elemento esté oculto (ver `.gira-telefono`).
2. **El movimiento informa o no va.** Se permite solo cuando confirma una acción (guardó, falló, llegó),
   dice hacia dónde cambió algo (la cifra sube o baja, el paso avanza o retrocede) o revela contenido
   oculto (borde de scroll). Nada decorativo: sin fondos animados, brillos, partículas, texto que se
   desordena ni loops infinitos sobre etiquetas. El hover sigue sin escalar (§7.5): por eso salieron
   `whileHover={{ scale: 1.05 }}` de `ui/IconButton` y `hover:scale-110` de `VencimientosBadge`; el
   `whileTap` sí se queda, porque confirma el toque.
3. **Nunca retrasar la lectura.** Cada animación de feedback dura 250 ms o menos y ninguna tapa un dato
   mientras corre. El cambio de ruta (`MainLayout`) dura ≈0,37 s en total: salida 0,12 s solo opacidad +
   entrada 0,25 s con 8 px de `y` (antes ≈0,6 s, con `scale` en la salida). No hay reveals por scroll en
   pantallas de datos, ni fundido de skeleton a contenido, ni stagger sobre filas de datos.
   Única excepción: el indicador de `ui/PestanasElasticas` (§9.12), ≈0,6 s, pedido del dueño; no
   tapa nada porque el contenido de la pestaña cambia de inmediato.
4. **Cifras: `ui/NumeroRodante`** (CSS puro, `React.memo`). La cifra nueva entra desde abajo si subió y
   desde arriba si bajó, en 160 ms (keyframes `numero-sube` / `numero-baja` de `index.css`, que existen
   solo sin reduce-motion: con «reducir movimiento» el número cambia en seco). **Prohibido el count-up**
   (contar pasando por valores intermedios) y **prohibido animar dinero**: solo conteos enteros y
   porcentajes (el `%` va fuera del componente). El primer valor siempre aparece estático. Mientras carga
   se muestra «—», nunca un 0 falso (`Cifra` de `GestionesInicio` recibe `n: number | null`; un store que
   arranca en 0 expone `cargado`, como `useSolicitudesIngreso`; la `StatCard` de Bombas recibe «—» hasta
   la primera respuesta y tras un error). Siempre
   `fmtNumber`, sin prop de formato, para que el memo siga sirviendo. Referencias: chips y totales de
   `AttendanceSummaryRow`, `GestionesInicio`, `ActividadesSemana`, `VencimientosBadge` y la `StatCard` de
   `BombasHormigonTab` (los conteos `number` ruedan; «Costo Total» llega como string y queda quieto).
5. **Resultado de una acción: `ui/MarcaEstado`** (`cargando` gira; `listo` dibuja un check; `fallo`
   dibuja una cruz, cada trazo en 240 ms). `tamano="sm"` es el glifo suelto (botón, banner, línea) y
   toma el color de `currentColor`; `tamano="md"` lo mete en un círculo de 48 px con tokens `success` /
   `destructive`, para pantallas de confirmación. Siempre `aria-hidden`: el texto lo anuncian sonner, el
   `role="status"` o el título. Con reduce-motion el glifo aparece ya completo (`initial={false}`) y el
   spinner queda quieto (`motion-safe:animate-spin`). Un `pathLength: 0` con `strokeLinecap="round"`
   igual pinta un punto, así que cada trazo arranca con opacidad 0 hasta su retardo.
   **Referencia: el botón Guardar de asistencia.** `useAttendanceActions` expone `saveStatus`
   (`'idle' | 'cargando' | 'listo' | 'fallo'`), que vuelve a `idle` tras 1,6 s si salió bien o 2,5 s si
   falló; el timer se limpia al desmontar y al empezar otro guardado. El resultado queda **atado a la
   fecha y obra guardadas** (se deriva en render): si el capataz cambia de día antes de que vuelva a
   `idle`, el Guardar del otro día no muestra un check ajeno ni pierde su gris de deshabilitado. `AttendanceHeaderActions` ya no
   pasa `isLoading` al `Button` (lo cambiaría por su propio `Loader2` y taparía la marca) y, mientras
   `saveStatus !== 'idle'`, no aplica el gris de deshabilitado y suma `disabled:opacity-100`: el refetch
   posterior al guardado pone `loading=true` y, sin eso, el botón se agrisaría justo mientras dibuja el
   check. Otros usos: confirmación de `SolicitudIngresoForm` (`md`), banner de `EmitirKitModal` y recap
   de `JourneyRunner`. **Nunca por fila**: en una lista se repetiría en cada registro y taparía el dato.
6. **Bordes de scroll horizontal: `hooks/useBordesScroll` + `ui/BordeScroll`.** Es un degradado de una
   sola capa (`w-6`, `from-card`), del color de la superficie, que se apaga al llegar al extremo (umbral
   de 4 px para el redondeo subpíxel). Úsalo solo sobre padres `bg-card`. El hook mide amortiguado con
   `requestAnimationFrame` y solo cambia estado cuando un booleano se da vuelta (scrollear no
   re-renderiza por frame); la medición inicial la hace el `ResizeObserver`, que observa el contenedor
   **y cada hijo directo** (un chip que pasa de 9 a 10 o la fuente web que llega tarde no cambian el
   tamaño del contenedor). `medirCuando` es la identidad del contenido (los ids de los chips, no la
   cantidad) y vuelve a cablear el observer para los hijos nuevos. Referencia: la franja de chips mobile de
   `AttendanceSummaryRow`. Prohibido apilar `backdrop-filter` o usar `mask-image` (§8.9).
7. **Wizards:** el conector se llena con `scale-x` desde `origin-left` en 200 ms (al volver se vacía
   hacia la izquierda; nunca `width`). El paso entra ±12 px desde el lado hacia el que se avanza, en
   150 ms, con UN solo `motion.div` con `key={paso}`, sin `AnimatePresence`, sin `exit`, sin
   `mode="wait"` y sin animar el alto. Los 12 px caben en el padding de los dos hosts (`p-6` del `Modal`,
   `p-4` de la card del tutorial), así que no aparece una barra de scroll horizontal pasajera.
   Referencia: `WizardStepper` + `NuevoMovimientoWizardView`. El primer montaje es estático (dir 0): por
   eso `NuevoMovimientoWizard` resetea el motor también al cerrar, para que la vista no reabra
   "deslizando" desde el paso donde quedó. El tutorial (`JourneyRunner`) usa el mismo
   `WizardStepper`; ya no tiene un stepper propio.
8. **La aritmética del movimiento** (dirección del cambio, bordes de scroll, recorrido del indicador
   elástico y teclas de pestañas) vive en `utils/movimiento.ts` (`direccionCambio`, `calcBordes`,
   `planElastico`, `indicePorTecla`), con test en `utils/movimiento.test.ts`.
9. **Al cambiar una prop, el estado previo se ajusta durante el render**
   (`if (value !== previo) { setPrevio(value); ... }`), nunca en un efecto: el efecto llega un frame
   tarde y rompe la regla set-state-in-effect. Si el valor puede ser `NaN`, comparar con `Object.is`
   (`NaN !== NaN` re-renderizaría en bucle). Referencias: `NumeroRodante` y `NuevoMovimientoWizardView`.
10. **Tomar cosas de React Bits.** Solo del repo público o de reactbits.dev (MIT + Commons Clause), jamás
    de pro.reactbits.dev. Se reescribe la idea con framer-motion o CSS, no se copia: sus componentes
    traen textos en inglés, colores hex, tema oscuro, `@hugeicons` e imports `motion/react` (aquí es
    `'framer-motion'`). Prohibido sumar `gsap`, `ogl`, `three`, `motion` o `@hugeicons`. Cada archivo
    derivado lleva en el encabezado la línea de procedencia
    `// Idea: <Componente> de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.`
    (hoy: `MarcaEstado`, `NumeroRodante`, `useBordesScroll`, `BordeScroll`, `PestanasElasticas`, `NovedadesModal`,
    `AvisoPendiente`, y como comentario junto al
    conector de `WizardStepper` y al panel de `NuevoMovimientoWizardView`). Si alguna vez se copia
    código, el archivo lleva en el encabezado «Copyright (c) 2026 David Haz» con el texto de permiso, y
    se agrega una entrada en `frontend/THIRD_PARTY_NOTICES.md` (hoy no existe porque no se copió nada).
11. **Descartados el 2026-10-15** (no volver a proponerlos sin un hecho nuevo): CountUp; BlurText/SplitText
    en Login; PillNav/GooeyNav/Dock/StaggeredMenu/BranchedMenu; FadeContent/AnimatedContent;
    GradualBlur, Counter, Stepper y StatusMark tal como vienen; FuseButton, HoldButton, SlideCommit y
    SwipeRow (gestos escondidos, guantes); WarmTooltip; ShinyText, LatticeLoader y CallChip; los textos
    que se desordenan; todos los Backgrounds; AnimatedList y Masonry; SpringCheck, SquishSwitch,
    GlideSelect, JellyRadio, BellToggle y CodeSlots; los efectos de hover (Spotlight, Glare, Tilt,
    Magnet, bordes eléctricos).
    RubberSegment salió de esta lista el 2026-10-16 porque el dueño lo pidió para las pestañas de
    Inventario (§9.12), sin el arrastre del indicador.
    **Sumados el 2026-10-20** (revisión del catálogo completo de reactbits.dev con Marcos):
    - **Carousel → `novedades/NovedadesModal`**: «Novedades de Bóveda», lo nuevo de cada entrega en
      tarjetas que se pasan con el dedo, las flechas o los puntos. Se abre sola UNA vez por persona y
      entrega al entrar al Inicio (marca en `localStorage`: comodidad, no registro). Sin avance automático;
      la tarjeta entra 24 px desde el lado al que se avanza, en 200 ms (como §9.7). El contenido vive en
      `config/novedades.ts`: solo lo que ya está en el ambiente donde se muestra, escrito para quien usa
      Bóveda; una tarjeta con `permiso` la ve solo quien lo tiene.
    - **Star Border → `ui/AvisoPendiente`**: el Guardar de Asistencia avisa cuando falta guardar (el día de
      la obra sin registros guardados, o cambios desde la última carga; en «Todas las obras» no). Una luz
      ámbar da dos vueltas al borde (`.luz-pendiente`, 2,4 s, CSS) y queda un punto ámbar mientras siga
      pendiente; las vueltas se repiten solo al pasar de «al día» a «pendiente». Ámbar = pendiente.
      Con «reducir movimiento», solo el punto.
12. **Pestañas de sección: `ui/PestanasElasticas`** (idea: RubberSegment). Al cambiar de pestaña el
    indicador verde se estira en 190 ms (ease-out) hasta cubrir su posición actual y la pestaña de
    destino: el borde de adelante queda ya en su lugar. A los 150 ms el borde de atrás lo sigue con un
    resorte de 300 ms, se pasa 3 px (aplaste) y se suelta en 160 ms. El origen es la posición ACTUAL
    del indicador, no la pestaña anterior: si un clic interrumpe un viaje, no sigue estirándose hacia la
    pestaña que se dejó (el resorte del borde de adelante corrige ese caso) y, si ya cubre el destino,
    se asienta de inmediato, sin los 150 ms de pausa. Así se ve hacia dónde se
    fue, también cuando el salto viene de otro panel (la tarjeta «Por aprobar» del Ejecutivo abre
    Solicitudes). El indicador es una copia de la fila en blanco sobre
    `bg-brand-primary` recortada con `clip-path`: el texto cambia de color justo en el borde y una
    pestaña intermedia nunca queda gris sobre verde. Por eso `claseOpcion` y `claseFila` se aplican
    igual a la fila de botones y a la copia (si difieren, el texto blanco no calza), y se juntan con
    `clsx`, **no con `cn()`**: las dos filas tienen que llevar exactamente las mismas clases, y
    `cn()` podría resolverlas distinto (nació así cuando tailwind-merge borraba
    `text-caption`/`text-micro` junto a un color `text-*`; desde el 2026-10-16 `cn()` ya los
    conoce, §1). Las barras de Inventario usan `text-base` porque 16 px es lo que siempre se vio
    (esos tamaños propios nunca llegaban a aplicarse). En alto contraste de Windows el indicador toma
    `Highlight`/`HighlightText`. El recorte se come
    las sombras: el indicador no lleva `shadow`. Mide con `getBoundingClientRect` (subpíxel) al montar,
    con `ResizeObserver` sobre la fila y cada opción, y cuando llega la fuente web; dentro de un
    `display:none` mide 0 y el indicador no se ve hasta que la barra aparece. Mide en coordenadas
    propias de la fila (corrige por `caja.width / offsetWidth`), así un `Modal` que abre con `scale`
    no lo deja desfasado. Si una opción cambia de ancho a medio viaje (un conteo que aparece), el viaje
    sigue hacia la medida nueva en vez de cortarse. Si la fila hace scroll horizontal, la opción nueva
    se trae a la vista (scroll suave, o en seco con «reducir movimiento»): en el teléfono, «Por
    aprobar» → Solicitudes ya no viaja a una pestaña fuera de la pantalla. Cada cambio sube un
    «turno» y cancela el anterior, así que varios clics rápidos no se pisan. Con «reducir movimiento» o
    con la barra oculta salta en seco. Teclado: `role="tablist"`/`"tab"`, `aria-selected`, flechas con
    vuelta, Inicio y Fin (activación inmediata), en `indicePorTecla`; el recorrido se calcula en
    `planElastico` (ambos en `utils/movimiento.ts`, con test). Sin arrastre: en el teléfono la fila
    hace scroll horizontal y el gesto quedaría escondido. Referencias: las dos barras de
    `pages/Inventario.tsx`; en `pages/Settings.tsx`, las categorías (teléfono y escritorio) y las
    sub-pestañas del teléfono; las pestañas Asistencia / Actividades del teléfono (`Attendance.tsx`);
    los filtros de estado de Solicitudes de ingreso y los carriles del teléfono de Documentos físicos
    (Gestiones), y la fila de estado de Revisar ideas (`Ideas.tsx`, `radio={18}` por `rounded-full`).
    Un conteo dentro de la opción usa `render(op, sobreIndicador)` para su versión sobre el verde
    (pastilla blanca con el número en su color, o `bg-white/25 text-white` si es neutro). Si la opción
    activa se elige sola al cargar (el primer carril con lotes de Documentos físicos), se elige dentro
    de la misma carga y la fila se remonta con `key`, para que aparezca quieta y no viaje sin que nadie
    toque nada.
13. **Formato único de menús de opciones (dueño 2026-10-16, «buscar cohesión»).** Todo menú donde se
    elige UNA opción de varias (pestañas, sub-pestañas, filtros de estado, categorías, vista
    Cards/Tabla) es `ui/PestanasElasticas`: una pista **rectangular** (`rounded-2xl`; `bg-card` con
    borde sobre fondo gris, `bg-muted` dentro de una tarjeta) con opciones `rounded-xl` y el indicador
    relleno. **Prohibidas las pastillas ovaladas** (`rounded-full`) y la pastilla blanca con borde
    verde para elegir. Verde por defecto; otro color solo si el color es el significado
    (`claseIndicador`: rojo en «Diferencias» de Inventario y en la lista de diferencias;
    `colorIndicador`: el color de cada empresa en los chips de Vehículos, que además parten sin
    ninguna elegida, `activa={null}`). Una sola fila: si no cabe, scroll horizontal (el indicador no
    admite dos líneas). Aplicado: Inventario (barra, Maestro Ítems/Stock y Cards/Tabla, filtro de
    Solicitudes, Diferencias, categorías y Catálogo/Otros del pedido), Configuración (todas sus
    barras), Asistencia, Gestiones (Solicitudes de ingreso, Documentos físicos), ficha rápida del
    trabajador, Revisar ideas (estado y tipo), Buzón de ideas (Proponer/Mis ideas), Centro de ayuda y
    Vehículos. Los filtros donde se encienden **varios** a la vez (atajos de la grilla de
    Trabajadores en Gestiones, acciones del historial de actividad) usan la misma pista y opciones
    `rounded-xl`, cada opción encendida en relleno (verde; ámbar o rojo si el atajo es un aviso),
    sin indicador elástico. **No** aplica a respuestas de formulario ni a controles por fila
    (A/F/JI/TO, Asistió/No, Conceder/Denegar, Firmado/Sin firma, preguntas de una idea), a menús
    verticales ni al selector de tema (íconos, ya rectangular). Opciones de ancho parejo: `flex-1` en `claseOpcion` y `w-full` en
    `claseFila`. Si la lista cambia entera (las sub-pestañas cambian al cambiar de categoría), el
    componente se remonta con `key`: así aparece quieto en la nueva lista en vez de «viajar» desde una
    posición de la lista anterior. Las sub-pestañas de escritorio de Configuración también lo usan desde la regla 13.

14. **Inicio por módulos (dueño 2026-10-20; reemplaza al Inicio «Marca LOLS» del 2026-10-16).**
    Arriba, **una tarjeta por apartado** —Asistencia, Gestiones, Inventario, Vehículos— y, debajo, el
    **detalle del módulo elegido**. Cada tarjeta es la puerta: cifra grande, **lo primero (3 filas)** y el
    botón **«Ver más ↓»** (`BotonVerMas`); el detalle se despliega bajo las cuatro (`DetalleModulo`, una
    sección a la vez) con la lista completa y el resto del módulo —listas, gráficos— que se irá sumando.
    **Al entrar no hay nada abajo**: el detalle se abre al pinchar una tarjeta (toda la tarjeta es
    pinchable; sus filas y botones mandan sobre ella) o su «Ver más», y se cierra pinchándola de nuevo
    («Ocultar ↑»). **La tarjeta abierta se pinta entera de verde LOLS** (`.tarjeta-activa`: green-700,
    oscuro green-900, letra blanca; redefine los tokens neutros adentro). Sobre verde el rojo y el verde
    no se leen: el círculo pasa a **blanco con el ícono en su color** (el significado sigue ahí) y las
    cifras que avisan (rojo/ámbar) pasan a **amarillo claro** (`yellow-300`); las demás, blancas
    (contexto `TarjetaActiva` en `tarjetaActiva.ts`). **El amarillo sobre green-700 mide 3,8:1**: solo para
    cifras ≥ 19 px en negrita; un texto chico de aviso va en blanco. Los chips conservan su fondo claro. Ya **no hay tarjeta
    verde** (la excepción de superficie grande verde se fue con ella) ni bloques fijos debajo («Otros
    pendientes», tendencia, acciones rápidas): todo vive en el detalle de su módulo. «Actualizar» y la
    fecha pasan al encabezado de la página. **El encabezado global no tiene marco** (toda la app, idea de la
    propuesta L del lienzo): mismo fondo que la página, sin borde ni sombra, alineado con el contenido.
    - **Asistencia** (`AsistenciaInicio`, «Pulso del día» + tira del mes; elegida por el dueño en el
      lienzo de bocetos el 2026-10-20): barra «N de M obras guardaron hoy» (un segmento por obra hasta 24;
      «Faltan X e Y»), dos cifras —**ausentes hoy** con su desglose «5 F · 4 LM · 3 otros» y **faltas
      reiteradas** del mes (Art. 160 N°3)— y los 3 reiterados más urgentes (2 seguidos primero,
      `ordenarReiterados`), cada uno con **solo su nombre y su regla principal** en una píldora chica en
      minúsculas (fiel al boceto B: la tira por trabajador saturaba la tarjeta, dueño 2026-10-20). La
      **`TiraMes`** (una barra por día del mes, faltas en rojo, rayita bajo los lunes, anillo en hoy)
      vive solo en la tabla del detalle. Las cifras abren el
      detalle en su sección. Detalle «Por urgencia» (`DetalleAsistencia`), sin fila de números clave
      (repetían la tarjeta, dueño 2026-10-20): **Requiere acción** (tabla de reiterados
      con RUT, obra, reglas, tira y «Ver en asistencia») → **Hoy** (ausentes en barra apilada por motivo:
      F rojo, LM azul, V gris, PSG ámbar; obras sin guardar) junto a **Próximos 14 días** (empiezan o
      terminan licencias/vacaciones —«vuelve el lun 26 oct»— y feriados) → **Este mes** (descuentos por
      trabajador y horas extra por obra, cada uno con su permiso; los descuentos avisan que el cálculo
      oficial es el Excel) → **Tendencia y obras** (fase 3: ausentismo de 6 meses en área azul con las
      faltas F en línea roja punteada y la diferencia en puntos con el mes anterior —ámbar si sube, verde
      si baja—, faltas del mes por obra en barras rojas; luego actividades sugeridas y ranking. La tendencia de
      7 días se quitó: la cubre la de 6 meses). Bajo la tabla de reiterados, un aviso ámbar desplegable de **faltas pegadas al fin de
      semana** (no es causal del Art. 160). Las fases 2 y 3 se piden al abrir el detalle
      (`GET /api/dashboard/asistencia`). Las cifras usan
      `NumeroRodante` (sin count-up, §9.4).
    - **Gestiones**: para quien registra entregas, `DocumentosInicio` (documentos físicos fuera de plazo,
      críticos, etapas, «dónde están ahora»); sin ese permiso, `TarjetaPendientes` con sus pendientes
      (solicitudes, documentos por vencer, contratos, sin documentos, lotes del portador). Detalle:
      documentos atrasados por etapa (`DocumentosAtrasadosLista`) + «Otros pendientes» (bandeja).
    - **Inventario** (`InventarioInicio`, `GET /api/transferencias/inicio`): lo que le toca según el
      perfil —por aprobar y diferencias (aprobador), por despachar / por recibir (bodega), sus solicitudes
      en curso—; cada fila abre Inventario → Solicitudes con su filtro (`?tab=transferencias&estado=`).
      Detalle: todos los grupos + alertas de transferencias.
    - **Vehículos** (`VehicleExpiries`, 3 filas en la tarjeta): sin cambios de contenido; detalle con
      todos los vencimientos de 30 días.
    Piel común: **tarjetas blancas sin borde** (`rounded-3xl`, sombra `--shadow-md`) con
    `EncabezadoTarjeta` (**círculo de color sólido** + título `text-base`) y `CifraTarjeta` (número grande
    en el mismo color, rampa 700/300). Tonos: rojo = vencido o grave, ámbar = pendiente, azul =
    informativo, verde = al día, neutro = solo dato. Las cuatro van **en una sola línea desde 1280 px**
    (`xl`), 2×2 en tablet y una bajo otra en celular (`COLUMNAS` según cuántas ve el perfil). Lógica pura
    con test: `resumenFaltasMes.ts`,
    `resumenDocumentosInicio.ts`, `resumenInventarioInicio.ts`.
