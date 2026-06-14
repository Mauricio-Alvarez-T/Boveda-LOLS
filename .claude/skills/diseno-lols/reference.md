# Referencia — Sistema de diseño Bóveda LOLS (fundamentado)

Síntesis de investigación citada (shadcn/ui, Stripe, Atlassian, Microsoft Fluent 2, WCAG, Tailwind v4).
24/25 afirmaciones confirmadas con verificación adversarial. Esta es la **autoridad** del sistema — no
preferencia personal.

## 1. Norte visual
**shadcn/ui** como arquitectura de tokens copiable (pares `background`/`foreground`, modelo de superficies
base→card→popover, OKLCH), reforzado por el **restraint cromático de Linear/Stripe** y la **disciplina
semántica de Atlassian/Fluent 2**. Encaja con un dashboard B2B de marca verde porque es neutral-dominante
y mete la marca solo en acciones.

## 2. Color — modelo neutral-dominante
- **Fundación neutra:** superficies blanco/gris, texto casi-negro, bordes gris claro. Secondary/muted/accent
  son neutros (sin croma). El **único color de marca** entra en `--primary`/`--ring` (verde `#029E4D`).
- **Regla de oro (Fluent 2, verbatim):** *"Avoid overusing brand colors or using them on large surfaces as
  they can dilute a hierarchy and make an experience difficult to navigate."* → verde solo en acciones.
- **Modelo de superficies (3 niveles):** `background` (página) → `card` (paneles elevados) → `popover`
  (flotantes: dropdowns/modales). Cada uno con su par `-foreground`.
- **Fix "cards se pierden" (shadcn + Atlassian):** NO teñir. **Claro:** card blanca separada por **borde
  y/o sombra sutil**. **Oscuro:** card = neutro **más claro** que el fondo (p.ej. L 0.205 vs 0.145) + borde
  translúcido (`oklch(1 0 0 / 10%)`), inputs `/15%`. Las sombras se perciben mal en oscuro → se aclara la
  superficie. **Prefiere borde/whitespace antes que sombras** (Atlassian: "a border is the default").
- **Un acento, con moderación (60-30-10 / Linear):** verde solo en botón primario, foco, nav activo,
  selección. Nunca página/card/encabezado.

### Tokens (modelo shadcn → mapeados a los del repo en `index.css`)
Claro `:root`: background ≈ blanco/gris muy claro · card blanco · foreground casi-negro · border gris claro ·
muted neutro · **primary = verde #029E4D** · primary-foreground blanco · ring = verde · destructive = rojo.
Oscuro `.dark`: background casi-negro · **card un neutro más claro que el fondo** · border translúcido
blanco · foreground casi-blanco · primary = verde (un punto más claro para oscuro).
(OKLCH recomendado para nuevas definiciones; #029E4D ≈ `oklch(0.60 0.15 158)` — verificar con herramienta y
contraste 4.5:1 de `primary` vs `primary-foreground` en texto de botón, y 3:1 del anillo de foco.)

## 3. Tipografía / espaciado / radios / elevación
- Tipografía: escala grande con tracking negativo en titulares (ya en `index.css`: display/headline/title/
  body/ui). Jerarquía por tamaño+peso, no por color.
- Espaciado: base 4px (escala Tailwind). Whitespace generoso.
- Radios: `rounded-card` (cards), `rounded-control` (inputs), `rounded-pill` (botones de acción).
- Elevación = **superficie + sombra emparejadas**; usar con moderación. Borde por defecto; sombra solo
  cuando un borde se perdería (UI pequeña, tablas).

## 4. Recetas de componente (color/elevación)
- **Botón primario:** `bg-brand-primary text-white` pill. **Secundario:** neutro (`bg-muted`/borde). **Ghost:**
  transparente, hover `bg-muted`. **Destructivo:** `bg-destructive/10 text-destructive`, relleno al hover.
- **Card/panel:** `bg-card border border-border rounded-card` (+ `shadow-sm` opcional). Sin tinte de color.
- **Input/Select:** `bg-card border-input rounded-control`, foco `ring-2 ring-brand-primary/40`.
- **Tabla:** neutra; bordes finos o whitespace separan filas; estado vía **badge** (no tiñendo la fila).
- **Badge/StatusBadge:** color del rol (success/destructive/warning/info) con ícono+texto; default neutro.
- **KPI stat card:** card neutra, número grande neutro, ícono pequeño, **un** micro-indicador de delta
  (verde ↑ bueno / rojo ↓ malo) — el resto neutro.

## 5. Convención de color de TEXTO (estado/acción) — validada y corregida
- **Verde** = constructivo/éxito/hecho (crear, guardar, aprobar, "al día", delta positivo).
- **Rojo** (`destructive`) = **destructivo/error** (eliminar, rechazar, vencido, error). 
- **Ámbar** (`warning`) = precaución / **pendiente / por vencer / "sin registro" / por hacer**.
- **Azul** (`info`) = en progreso / informativo.
- **Neutro** = todo el contenido (nombres, títulos, datos, labels). **El contenido no se colorea.**
- **Corrección clave (Atlassian/Fluent 2):** el ROL mapea al color (success→verde, danger→rojo); el color
  SIEMPRE debe significar algo. *"Pendiente/por hacer" NO es rojo* — es ámbar (precaución) o azul (en
  progreso). El rojo se reserva para destructivo/error.

## 6. Accesibilidad (umbrales WCAG AA — obligatorios)
- Texto < 24px: **≥ 4.5:1**. · Texto ≥ 24px (o ~19px bold), íconos, bordes, anillos de foco, partes de
  gráficos: **≥ 3:1**. · **Nunca** depender solo del color (acompañar con texto/ícono).

## Fuentes (primarias)
- shadcn/ui theming — https://ui.shadcn.com/docs/theming · tailwind-v4 — https://ui.shadcn.com/docs/tailwind-v4
- Microsoft Fluent 2 color — https://fluent2.microsoft.design/color
- Atlassian color — https://atlassian.design/foundations/color · elevation — https://atlassian.design/foundations/elevation
- Stripe accessible color — https://stripe.com/blog/accessible-color-systems
- WCAG 1.4.11 Non-text Contrast — https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
- Tailwind v4 @theme — https://tailwindcss.com/docs/adding-custom-styles
