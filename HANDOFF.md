# HANDOFF — Continuar trabajo en otra máquina

> Archivo temporal de traspaso de sesión. Bórralo cuando ya no haga falta.
> **Primer paso en la nueva máquina:** lee `CLAUDE.md`, luego este archivo.

---

## Setup en la máquina nueva

1. Instala **Git**, **Node.js** y **Claude Code**.
2. Clona y posiciónate en `develop`:
   ```bash
   git clone https://github.com/Mauricio-Alvarez-T/Boveda-LOLS
   cd Boveda-LOLS
   git checkout develop
   git pull origin develop
   cd frontend && npm install
   ```
3. Abre Claude Code en la carpeta del repo. Este archivo ya estará presente.

**Verificación** (allá SÍ tendrás Node, acá no lo había):
```bash
cd frontend && npx tsc --noEmit     # type check
cd backend && npm test              # tests
```

---

## TAREA ACTIVA — Modo oscuro / claro (Fase B)

**Estado: código completo y desplegado en staging. Falta solo QA visual + ajustes finos.**

- **Branch:** `develop`. Desplegado y verde en **test.boveda.lols.cl** (CI Deploy Staging #342 success, Backend Tests #338 success).
- El toggle **funciona** (confirmado por el usuario con capturas en oscuro).

### Arquitectura
- **Tailwind v4** con config inline (sin `tailwind.config.js`). Todo en `frontend/src/index.css`:
  - `@custom-variant dark (&:where(.dark, .dark *))`
  - `@theme inline { --color-x: var(--x) }` + `:root { --x: claro }` + `.dark { --x: oscuro }`
  - Esto hace que las utilidades de token (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, etc.) **cambien solas** al alternar tema.
- **Archivos nuevos:**
  - `frontend/src/context/ThemeContext.tsx` — estado `light/dark/system`, listener `matchMedia`, persistencia en `localStorage['sgdl_theme']`, aplica `.dark` en `document.documentElement`.
  - `frontend/src/components/ui/ThemeToggle.tsx` — segmented control Sol / Luna / Monitor.
- **Infra modificada:** `index.css`, `index.html` (script anti-FOUC), `main.tsx` (ThemeProvider + Toaster con `theme={resolvedTheme}`), `Sidebar.tsx` (toggle en el footer).

### Tabla de tokens (claro → oscuro)
| Token | Claro | Oscuro |
|---|---|---|
| `background` | `#F5F5F7` | `#000000` |
| `card` / `popover` | `#FFFFFF` | `#1C1C1E` |
| `foreground` / `brand-dark` | `#1D1D1F` | `#F5F5F7` |
| `muted` | `#E8E8ED` | `#2C2C2E` |
| `muted-foreground` | `#5E5E62` | `#98989D` |
| `border` / `input` | `#D2D2D7` | `#38383A` |
| `success` | `#029E4D` | `#30D158` |
| `warning` | `#FF9F0A` | `#FF9F0A` |
| `info` | `#147CE5` | `#0A84FF` |
| `border-hover` | `#B0B0B5` | `#48484A` |

### Refactor ya aplicado (Fases 0–5, ~570 colores hardcodeados → tokens)
- `bg-white` → `bg-card`; `bg-white/{80,90,95}` → `bg-card/{...}`
- grises claros (`#F5F5F7`, `#F9F9FB`, `#E8E8ED`, …) → `bg-muted`
- bordes hex → `border-border`; `divide-[#…]` → `divide-border`
- textos grises (`#86868B`, `#8E8E93`, `#64748B`, …) → `text-muted-foreground`
- `hover:border-[#…]` → `hover:border-[var(--border-hover)]`
- tints pastel: verdes → `bg-success/10`, amarillos → `bg-warning/10`, azules → `bg-info/10`

### PENDIENTE — QA fino (NO empezado; esperar review visual del usuario)
1. **Overlays `bg-white/≤60`** — se dejaron como están; algunos pueden ser superficies que deberían oscurecerse.
2. **Parches de degradado claro** (`to-[#F0F1F5]`, `from-[#F8F9FC]`) que se vean como manchas claras en oscuro.
3. **Colores de gráficos recharts** en Inventario — van como props JSX (no clases), aún **no reaccionan al tema**. Hay que leer los tokens vía JS/variables CSS.
4. **Contraste** de las tarjetas tint nuevas (`bg-success/10` etc.) y su texto en oscuro (WCAG AA).

### INTOCABLE (no refactorizar — es intencional)
- `text-white` sobre rellenos de color (botones/badges).
- Backdrops de modales `bg-black/XX`.
- Hovers verde corporativo (`#027A3B`, `#1EBE5B`), `active:bg-[#006ACC]`.
- Acentos iOS morado/púrpura (`#5856D6`, `#AF52DE`), verde WhatsApp (`#25D366`), overlay MainLayout (`#1D1D1F`).

### Plan completo
El plan detallado está en `~/.claude/plans/abundant-twirling-dragonfly.md` (archivo local, **no** viaja por Git). Cópialo aparte si lo quieres íntegro; lo esencial ya está resumido arriba.

---

## TAREA EN PAUSA — Validación RRHH (Fase A)

- **NO retomar sin confirmación explícita del usuario.** Se espera el feedback completo del Excel de RRHH.
- Los archivos `Validacion_Sistema_Asistencia.xlsx` y `Validacion_Sistema_Inventario.xlsx` están **sin trackear a propósito** — no commitearlos.

---

## Notas de entorno / flujo
- **Repo público:** github.com/Mauricio-Alvarez-T/Boveda-LOLS. Prefijo de localStorage: `sgdl_`.
- Deploy automático vía GitHub Actions al hacer push a `develop` (staging) o `main` (prod). Probar siempre en staging primero.
- Si trabajas en worktree: `git push origin claude/BRANCH:develop` (ver `CLAUDE.md`).
- Antes de tocar DB / migraciones / deploy: leer `docs/RUNBOOK.md`.
- **Importante de Tailwind:** las clases inválidas se purgan en silencio (no rompen el build) → el QA visual es obligatorio.
