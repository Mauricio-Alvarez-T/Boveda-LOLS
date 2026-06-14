# Rúbrica de revisión de diseño — Bóveda LOLS

Checklist para evaluar (y corregir) CUALQUIER pantalla antes de darla por terminada. Para cada punto:
PASA / FALLA + hallazgo concreto + fix. Es el "diseñador" que revisa con criterio.

## 1. Contraste / WCAG AA
- [ ] Texto < 24px ≥ **4.5:1**; texto ≥ 24px / íconos / bordes / anillos de foco / partes de gráfico ≥ **3:1**.
- [ ] Ningún significado depende SOLO del color (siempre acompañado de texto o ícono).
- [ ] Texto de botón primario (blanco sobre verde) y anillo de foco verde cumplen contraste.

## 2. Restraint / un solo acento
- [ ] El **verde** aparece SOLO en: acción primaria, foco, ítem activo/seleccionado, micro-delta positivo.
- [ ] **Ninguna** superficie grande (página, card, panel, hero, encabezado) está teñida de verde u otro color.
- [ ] No hay color decorativo (sin significado). Si un color no comunica estado/acción → quitarlo.

## 3. Integridad semántica
- [ ] Todo elemento con color comunica un rol: success(verde) / destructive(rojo) / warning(ámbar) / info(azul).
- [ ] Rojo SOLO en destructivo/error (eliminar, rechazar, vencido). **"Pendiente/por hacer" = ámbar/azul, no rojo.**
- [ ] Acciones constructivas (crear/guardar/aprobar) en verde; el contenido (nombres/datos/títulos) neutro.

## 4. Superficies / jerarquía
- [ ] Página vs card vs popover se distinguen por **borde y/o sombra** (claro) o **neutro más claro + borde
      translúcido** (oscuro) — **nunca por tinte de color**.
- [ ] Las cards NO "se pierden" contra el fondo (borde `border-border` visible o sombra sutil).
- [ ] Se prefiere borde/whitespace antes que sombras apiladas; máximo 1 nivel de elevación por contexto.

## 5. Paridad claro / oscuro
- [ ] Mismos tokens; en oscuro las cards son un neutro **más claro** que el fondo.
- [ ] Revisado a ojo en **ambos** modos (sin texto ilegible ni superficies que desaparecen).

## 6. Consistencia / alineación
- [ ] Solo **tokens** (cero hex crudo, cero `text-[Npx]`). Tipografía de la escala (display/headline/title/body/ui).
- [ ] Espaciado/radios/elevación consistentes; elementos alineados a la grilla.
- [ ] Botones/cards/inputs/badges usan las primitivas del DS (no `<button>` crudo).

## 7. Whitespace / aire (Apple)
- [ ] Respiración generosa entre secciones y dentro de las cards; jerarquía por tipografía + espacio.
- [ ] Sin densidad innecesaria ni decoración; el contenido es el protagonista.

## 8. Anti-patrones frecuentes (verificados en auditorías reales)
Errores que se cuelan una y otra vez. Revisar SIEMPRE con grep antes de cerrar una pantalla:

- ❌ **`text-warning` / `text-info` / `text-destructive` como color de TEXTO pequeño.** Esos tokens
  saturados (#FF9F0A, #147CE5, #FF3B30) se diseñaron como **relleno/ícono con texto oscuro encima**,
  NO como color de texto: sobre blanco/tinte dan **1.9–4.1:1** (fallan AA). Para texto con color usar
  la rampa accesible `text-{red,amber,blue,green}-700 dark:text-*-300` (patrón de `ui/Chip.tsx`).
  Excepción ámbar: sobre `bg-muted` usar **`amber-800`** (amber-700 ahí da 4.11:1).
- ❌ **`text-muted` / `bg-*` como color de texto o ícono.** `text-muted` apunta al token de
  **superficie** (#E8E8ED) → ~**1.2:1**, invisible. El color de texto tenue correcto es
  **`text-muted-foreground`**; para íconos también.
- ❌ **`bg-background` en tarjetas/filas internas.** En oscuro `--background` es **negro puro** y queda
  MÁS oscuro que la card → invierte la elevación. Para superficies internas estáticas usar **`bg-muted`**
  (en oscuro es más claro que la card). `hover:bg-background` (transitorio) sí es aceptable.
- ❌ **Hex crudo en gráficos recharts.** `stroke="#34C759"` no reacciona al tema → en modo oscuro la
  grilla/tooltip quedan claros. Usar `var(--border|muted-foreground|card|foreground|brand-accent)` en
  `stroke`/`fill`/`contentStyle` (recharts acepta strings CSS). El verde de la **serie de datos** sí se
  conserva (color con significado en data-viz), pero tokenizado.
- ❌ **Tokens inexistentes.** Verificar que la clase exista en `index.css` (p.ej. `text-brand-light` NO
  existe → el texto cae a herencia). Grep del token en `@theme`/`:root` antes de usarlo.
- ❌ **Significado por opacidad** (`text-destructive/80` vs `/100`): indistinguible. El rol se comunica
  con color + **texto/ícono**, no con grados de opacidad.
- ❌ **Títulos de panel con niveles tipográficos mezclados** (unos `h3 text-base`, otros `h4 text-sm`).
  Cards hermanas del mismo grid → un único nivel: **`<h3 className="text-sm font-semibold text-foreground">`**.

---
**Veredicto:** lista de FALLA con su fix concreto. Si todo PASA → la pantalla cumple el sistema.
