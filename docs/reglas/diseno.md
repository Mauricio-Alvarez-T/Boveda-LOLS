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

Superficie única: `formatCLP`/`fmtMoney` (dinero CLP), `fmtNumber` (miles sin $),
y re-exporta las fechas de `fechas.ts` (`fmtFecha`, `fmtFechaCorta`, `formatDuracion`…).

**Regla:** no redefinir `fmtMoney`/`fmtDate`/`fmtFecha` locales — importar de
`utils/format`. `formatCLP` redondea y descarta NaN/null (los duplicados locales no).

## 6. Reglas ESLint y política de migración

`frontend/eslint.config.js` (+ regla local `eslint-local/no-arbitrary-text-size.js`):
- `no-restricted-syntax` → prohíbe `<button>` crudo.
- `ds/no-arbitrary-text-size` → prohíbe `text-[Npx]` en className.

Severidad **`warn`** durante F2 (hay cientos de casos existentes); **flip a `error`
al cerrar F2**. Lint NO está en el gate de deploy (gate = `tsc` + `npm test` + `build`).

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
3. **Restraint cromático — el verde LOLS (`#029E4D`) es el ÚNICO acento de acción**
   (botones primary, links, focus). Azul (`info`) solo para datos informativos.
   Neutro dominante: una pantalla debe leerse en blanco/negro/gris + un toque verde.
   Color = dato; decoración = neutra (ver §3).
4. **Botones.** Acción = **pill** con acento verde sólido (`<Button variant="primary">`,
   ya `rounded-full`). Navegación/secundario sutil = `<Button variant="link">` (texto
   verde + chevron `›`, estilo "Más información ›"). El press oscurece a verde, **nunca
   azul**.
5. **Interacción sutil.** Hover = cambio de **brillo/opacidad**, NO `scale`. Transición
   `duration-200 ease-apple`. Reveals suaves solo en heros/headers, respetando
   `prefers-reduced-motion` (ver `Login.tsx`).
6. **Bordes y sombras casi invisibles.** Preferir **borde hairline** (`border-border`)
   a sombras marcadas. Sombra sutil solo en hover/elevación real (modales). No acumular
   borde + sombra + gradiente en la misma card.
7. **Radios.** `rounded-card` (20px) en cards/secciones, `rounded-control` (12px) en
   inputs/selects, `rounded-pill` en botones de acción.

**Referencia canónica del look:** `frontend/src/pages/Login.tsx` (hero a pantalla
dividida) — úsalo como ancla al migrar otras pantallas en F5.
