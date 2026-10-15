# Reglas — Ideas para Bóveda (buzón de mejoras)

Módulo creado el 2026-10-14 a pedido de Marcos y Mauricio (mig `120_ideas.sql`). Cualquier usuario
propone una mejora del sistema desde cualquier pantalla; les llega a ellos dos con nombre y contexto,
y la revisan una a una cuando tienen tiempo.

## Reglas de producto (decididas por Marcos, 2026-10-14)

- **Con nombre, nunca anónimas.** La idea queda atada al usuario logueado (`ideas.usuario_id`); el
  formulario lo dice a la vista ("Se enviará con tu nombre: …").
- **Mejoras del sistema, no mañas.** Nada "porque sí": una idea (`idea`/`cuesta`) no entra sin
  - qué cambiar (≥ 10 caracteres),
  - **el problema de hoy** (≥ 40 caracteres, con ejemplo "así no / así sí" en el formulario),
  - cada cuánto pasa (`frecuencia`), a quién afecta (`alcance`) y qué se ganaría (`beneficio`).
  Mismos mínimos en el frontend (`ideasConfig.ts`: `MIN_RESUMEN`, `MIN_DETALLE`) y en el backend
  (`ideas.service.js`), que es quien manda (400 con `code` `IDEA_*`).
- **"Algo no funciona" (`falla`)** pide qué estaba haciendo, qué pasó y qué esperaba; no lleva
  señales. Avisa **al tiro por correo** a los revisores (`sendSystemEmail`, sin `await`: un SMTP
  caído nunca hace fallar el envío).
- **Foto opcional, miniatura de ~5 KB** (mig 121, Marcos 15-10: "tenemos poca memoria"; el 14-10 se
  había decidido sin adjuntos por lo mismo). Se comprime **en el teléfono** antes de subir
  (`comprimirMiniatura` en `utils/compressImage.ts`: busca el lado más grande que entre en 5 KB, WEBP o
  JPEG — Safari no codifica WEBP —, y si no entra devuelve la más liviana). Viaja en el mismo POST como
  data URL y se guarda en la fila (`ideas.foto` BLOB, `foto_mime`, `foto_bytes`), no en `uploads/`.
  El servidor rechaza > **12 KB** (`IDEA_FOTO_PESADA`) y verifica la firma real de los bytes
  (`IDEA_FOTO_FORMATO`). La foto **nunca** viaja en los listados (`tiene_foto`); se pide a
  `GET /api/ideas/:id/foto`, solo autor o `ideas.revisar`. En una falla va **adjunta al correo**.
  En el formulario se llama **"Pantallazo"** (de la parte que cuesta, de dónde iría lo nuevo, o del error)
  y muestra la miniatura tal cual se enviará, con su peso y el aviso de que no sirve para
  leer letra chica. 1.000 ideas con foto ≈ 5 MB de BD.
- **Sin plazos.** Se revisan cuando hay tiempo; el autor ve el estado en "Mis ideas" y un punto de
  novedad en el menú cuando cambia.
- **El jefe no participa dentro del sistema.** Si una idea necesita su visto bueno, se conversa por fuera.

## Contexto que se captura solo

`pantalla` (ruta + query), `pantalla_nombre` (legible, `nombrePantalla()`), `obra_id` (obra
seleccionada en ese momento), `dispositivo` (celular/computador por ancho) y `navegador`
(user-agent, solo revisores). El usuario no escribe nada de eso.

## Estados y transiciones (`ideas.service.TRANSICIONES`)

| Desde | Puede pasar a |
|---|---|
| `pendiente` | `aceptada`, `desechada` |
| `aceptada` | `hecha`, `desechada`, `pendiente` |
| `desechada` | `pendiente` (reabrir) |
| `hecha` | `aceptada` (deshacer) |

- **Desechar exige motivo**: `preferencia` · `ya_existe` · `regla_negocio` · `no_compensa` ·
  `duplicada`. La UI propone un texto de respuesta por motivo (editable).
- Cada cambio de estado, o una respuesta nueva, deja `visto_por_autor = 0` → novedad para el autor.
  Editar solo la **nota interna** no genera novedad.
- `nota_interna` **nunca** sale en "Mis ideas" (`aVistaAutor` la quita, junto con navegador y
  revisor_id). `respuesta` es lo que el autor lee.
- Color = significado: pendiente ámbar, aceptada azul, hecha verde, **desechada neutra** (no es un
  error). El botón "Confirmar: desechar" es neutro, no verde.

## Permisos

- **Proponer, "Mis ideas" y "Hecho gracias a sus ideas": sin permiso**, basta estar logueado.
- **`ideas.revisar`** (Sistema, mig 120): bandeja `/ideas`, `GET /api/ideas`, contador del menú y
  `PATCH /api/ideas/:id`. Se asigna **por usuario** a Marcos y Mauricio en Permisos personalizados.
  El Super Administrador (rol 1) la recibe como todas las claves: si otro admin no debe ver la
  bandeja, se le pone un **"denegar"** por usuario. Tras asignarla, re-login.
- Revisores efectivos para el correo de fallas: mismo SQL que los portadores de documentos (rol con
  la clave o grant, sin deny; rol 1 siempre salvo deny).

## Crédito público

`GET /api/ideas/hechas`: las últimas ideas `hecha`, con **nombre de pila + inicial** del autor
("Idea de Paula R."). Se muestra en el formulario, bajo los tipos. Es lo que mantiene viva la
participación; si algún día no se quiere, se quita el componente `HechasRecientes`.

## UI

- **"Buzón de ideas"**: último ítem del menú lateral, bajo Configuración (Marcos, 15-10), para todos.
  No es una página: abre `ProponerMejoraModal`; con novedades lleva un número ámbar y abre directo en
  "Mis ideas". El nombre vive en una sola constante, `ETIQUETA_BUZON_IDEAS` (`ideasConfig.ts`).
- Ítem **"Revisar ideas"** solo para revisores (la bandeja `/ideas`), con número ámbar de pendientes
  (`useIdeasPendientes`, store compartido). Se llama distinto del buzón para no confundirlos.
- Bandeja (`pages/Ideas.tsx`): pendientes primero y de la más antigua; al decidir una pendiente
  **salta sola a la siguiente**. Muestra "impacto" (frecuencia × alcance) y marca "¿preferencia?"
  cuando es *solo a mí + de vez en cuando*. "Antes de decidir": 5 criterios fijos, no se guardan.
  "También desde X": otras ideas de la misma pantalla, para detectar repetidas.
- Metadatos con `<Meta>` (minúsculas, neutro) y no con `<Chip>` (mayúsculas, para estados).

## Gotcha encontrado al construirlo

`cn()` (tailwind-merge sin configurar) **borra los tamaños propios** (`text-micro`, `text-caption`,
`text-label`…) cuando hay un color `text-*` en la misma llamada: los trata como color. El módulo
evita `cn()` en esos casos. Afecta también a `<Chip>` en toda la app (pendiente de arreglar en
`utils/cn.ts` con `extendTailwindMerge`).

## Tests

`backend/tests/ideas.test.js` (mínimos contra mañas, falla sin "qué esperabas", correo que no
rompe el alta, Mis ideas sin nota interna, crédito, transiciones y motivo, gates 401/403).
`backend/tests/permisos_hierarchy_sync.test.js` cubre que `ideas.revisar` esté en la jerarquía.
