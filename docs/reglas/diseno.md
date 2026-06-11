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
