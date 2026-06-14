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

---
**Veredicto:** lista de FALLA con su fix concreto. Si todo PASA → la pantalla cumple el sistema.
