---
name: diseno-lols
description: >-
  Sistema de diseño de Bóveda LOLS (React + Tailwind v4). Úsalo SIEMPRE al crear o
  modificar UI: elegir colores/superficies, estilar componentes (botones, cards,
  tablas, inputs, badges, KPIs), o revisar el diseño de una pantalla. Basado en
  sistemas probados (shadcn/ui + Linear/Stripe + Atlassian/Fluent 2) y validado con
  investigación citada. Resuelve el problema de "no sé qué color/estilo usar":
  superficies neutras, verde SOLO para acciones, color = significado.
---

# Sistema de diseño — Bóveda LOLS

> **Norte:** simple y bello como apple.com, pero práctico para un dashboard B2B denso.
> **Modelo:** shadcn/ui (arquitectura de tokens) + restraint de Linear/Stripe + disciplina
> semántica de Atlassian/Fluent 2. Detalle + citas en `reference.md`. Checklist en `review-rubric.md`.

## Las 5 reglas de oro (si solo lees esto)

1. **Superficies NEUTRAS, no de color.** Página = gris muy claro (`bg-background` #F5F5F7); cards/paneles =
   **blancos** (`bg-card`) con **borde fino** (`border-border`). **PROHIBIDO** teñir cards/paneles/hero
   con verde u otro color de fondo. (El error que cometimos: "todo con fondo verde" diluye la jerarquía.)
2. **El verde (`#029E4D`) es SOLO para ACCIÓN** + **encabezados de subsección** (excepción). Botón
   primario, anillo de foco, ítem de nav activo, fila/elemento seleccionado, micro-indicadores
   positivos (delta ↑). **Nunca** como FONDO de superficies grandes ni como "tinte" decorativo.
   **EXCEPCIÓN (decisión usuario 2026-06-15):** el **texto** de los encabezados de columna de tabla
   (`<thead>`/`<th>`) y de los títulos de subsección (h2/h3/h4/span que titula card/sección/grupo) va
   en `text-brand-primary` en toda la app — solo el texto, los fondos siguen neutros. NO aplica al
   título principal de página (h1/PageHeader) ni a nombres de entidad (obra/ítem/trabajador = dato neutro).
3. **"Las cards se pierden" se arregla con ELEVACIÓN, no con tinte.** Claro: card blanca + `border-border`
   (+ `shadow-sm` solo si hace falta). Oscuro: card = gris **más claro** que el fondo + borde translúcido.
4. **El color SIEMPRE significa algo.** Si algo lleva color, comunica estado/acción. Lo demás es neutro:
   - **Verde** = éxito / acción primaria / constructivo (crear, guardar, aprobar, "al día", delta ↑).
   - **Rojo** (`destructive`) = **destructivo / error** (eliminar, rechazar, vencido, error). **NO** "pendiente".
   - **Ámbar** (`warning`) = precaución / **pendiente / por vencer**.  · **Azul** (`info`) = en progreso / informativo.
   - El **contenido** (nombres, datos, números) va **neutro** (`text-foreground`/`text-muted-foreground`).
     Salvedad: los **encabezados de subsección y de columna** van en `text-brand-primary` (ver regla 2).
5. **Sobriedad y aire.** Whitespace generoso (Apple). Un solo acento por vista. Prefiere borde/espacio antes
   que sombras apiladas. Jerarquía por tipografía (escala grande + tracking negativo), no por color.

## Tokens (ya existen en `frontend/src/index.css` `@theme`)
- Superficie: `bg-background` (página) · `bg-card` (cards/paneles, blanco) · `bg-popover` (flotantes).
- Texto: `text-foreground` (principal) · `text-muted-foreground` (secundario) · `-foreground` = texto sobre esa superficie.
- Bordes/UI: `border-border` · `border-input` · anillo de foco `ring-ring` (verde).
- Acción/marca: `bg-brand-primary` / `text-brand-primary` (= verde, SOLO acción).
- Semánticos (SOLO estado, con texto, nunca decoración): `success`(verde) · `destructive`(rojo) · `warning`(ámbar) · `info`(azul).
- No-color neutro: `bg-muted` / `bg-secondary` para chips/zonas neutras.

## Recetas de componente (resumen — ver `reference.md` para detalle)
- **Botón primario:** `bg-brand-primary text-white` (pill) — la única superficie verde permitida.
- **Botón secundario:** NEUTRO (`bg-muted`/borde), no verde. **Ghost:** transparente, hover `bg-muted`.
  **Destructivo:** `bg-destructive/10 text-destructive` (relleno rojo solo al hover) — solo borrar/irreversible.
- **Card/panel:** `bg-card border border-border rounded-card` (+ `shadow-sm` opcional). **Sin tinte.**
- **Input:** `bg-card border-input rounded-control`, foco `ring-2 ring-brand-primary/40`.
- **Tabla:** neutra; separar filas con borde fino o whitespace (no zebra ruidoso); estado vía **badge**, no tiñendo la fila.
- **Badge/StatusBadge:** color del **rol semántico** (success/destructive/warning/info), con ícono+texto; default neutro.
- **KPI:** card neutra (blanca + borde), **número grande neutro**, ícono pequeño neutro/de marca, delta con
  micro-color (verde ↑ / rojo ↓ solo si es realmente bueno/malo).

## Íconos
Prominentes pero **neutros por defecto** (`text-muted-foreground`); color solo si el ícono comunica un
estado (success/destructive/warning/info) o es la acción primaria (verde). Tile opcional `h-9 w-9 rounded-xl bg-muted`.

## Antes de dar por terminada cualquier pantalla
Pasa la **`review-rubric.md`** (contraste WCAG AA, un-solo-acento, integridad semántica, superficies por
borde/sombra (no tinte), paridad claro/oscuro, consistencia de tokens, whitespace). Reporta hallazgos
concretos y corrígelos.

## Qué NO hacer (anti-patrones que ya cometimos)
- ❌ Teñir cards/paneles/hero de verde (o cualquier color) de fondo.
- ❌ Usar verde decorativo en KPIs/superficies grandes o como FONDO. (El **texto** de encabezados de
  subsección/columna SÍ va verde — excepción de la regla 2; los fondos siguen neutros.)
- ❌ Rojo para "pendiente/por hacer" (eso es ámbar/azul; el rojo es destructivo/error).
- ❌ Hex crudo o `text-[Npx]` (usa tokens y la escala tipográfica).
- ❌ Emojis de color (🔴🟡) como indicadores.
