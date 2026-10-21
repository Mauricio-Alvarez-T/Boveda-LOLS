# Reglas — Ideas para Bóveda (buzón de mejoras)

Módulo creado el 2026-10-14 a pedido de Marcos y Mauricio (mig `120_ideas.sql`). Cualquier usuario
propone una mejora del sistema desde cualquier pantalla; les llega a ellos dos con nombre y contexto,
y la revisan una a una cuando tienen tiempo.

## Reglas de producto (decididas por Marcos, 2026-10-14)

- **Con nombre, nunca anónimas.** La idea queda atada al usuario logueado (`ideas.usuario_id`); el
  formulario lo dice a la vista ("Se enviará con tu nombre: …").
- **Formulario corto: el tipo, UN texto y el pantallazo** (Marcos 20-10: "es muy largo… la persona
  no se motiva si tiene que completar un formulario tan largo"). **Sin mínimo de caracteres**
  (Marcos 15-10: "la persona tiene que escribir lo que siente") pero **no vacío**
  (`IDEA_DETALLE_VACIO`). Lo que filtra las mañas es la revisión (cinco criterios), no el formulario.
  Una pregunta por tipo (`FORMULARIOS` en `ideasConfig.ts`):

  | Tipo | Pregunta (`detalle`) | Pantallazo |
  |---|---|---|
  | `idea` (algo nuevo) | ¿Qué se te ocurre? | De la pantalla donde te gustaría que estuviera |
  | `cuesta` (algo que ya existe) | ¿Qué te cuesta? | De la parte que te cuesta o que no entiendes |
  | `falla` | ¿Qué pasó? | Del error o de lo que salió mal |

  - **El título (`resumen`) lo saca el servidor** de la primera línea del texto, cortada en una
    palabra si pasa de 120 caracteres (`tituloDe`). Si un cliente lo manda, se respeta.
  - **Ya no se piden** `esperado` ni las señales (`frecuencia`, `alcance`, `beneficio`); las columnas
    siguen para las ideas de antes del 20-10 y, si llegan, se guardan. Por eso la bandeja ya no
    tiene "impacto" ni "¿preferencia?" en las ideas nuevas: se decide leyendo.
  - **Un texto o dos:** `unSoloTexto()` (mismo criterio en `ideas.service.js` e `ideasConfig.ts`)
    detecta si el título es el comienzo del texto. Así la bandeja y el correo muestran un solo
    bloque en las nuevas y los dos campos de antes en las viejas.
  - Historia: 14-10 pedía ≥10 y ≥40 caracteres; 15-10 sin mínimos, pero con cinco preguntas, señales y
    ejemplos "así no / así sí"; 20-10 una sola casilla.
- **"Algo no funciona" (`falla`)** avisa **al tiro por correo** a los revisores (`sendSystemEmail`,
  sin `await`: un SMTP caído nunca hace fallar el envío), con el texto y el pantallazo adjunto.
- **Pegar el pantallazo:** en el computador, una imagen pegada con **Ctrl+V** en cualquier parte del
  formulario queda como pantallazo (si lo pegado no es imagen, se pega el texto normal).
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
("Idea de Paula R."). **Sacado del formulario el 20-10-2026** (Marcos: no le interesa); el endpoint
sigue en el backend por si se quiere volver a mostrar en otro lugar.

## UI

- **Un solo botón para quien revisa** (Marcos, 20-10: él y Mauricio reciben las ideas, no las mandan):
  con `ideas.revisar` el menú muestra solo **"Revisar ideas"** (la bandeja) y no "Comparte tu idea"; si
  quieren proponer algo, la bandeja tiene **"Proponer una idea"** en la cabecera (abre el mismo modal).
- **"Comparte tu idea"** (antes «Buzón de ideas», renombrado el 21-10): último ítem del menú lateral, bajo Configuración (Marcos, 15-10), para todos los
  que no revisan.
  No es una página: abre `ProponerMejoraModal`; con novedades lleva un número ámbar y abre directo en
  "Mis ideas". El nombre vive en una sola constante, `ETIQUETA_BUZON_IDEAS` (`ideasConfig.ts`).
- **Tres columnas desde 1024 px** (Marcos, 20-10): a la izquierda un panel con los tres tipos, uno debajo
  del otro; al lado, **Proponer** y **Mis ideas** como dos columnas, cada una con su propio scroll. El tipo se
  cambia en el panel (no hay "Cambiar tipo") y Enviar va al pie de la columna Proponer. Más angosto
  (celular, tablet) siguen las pestañas Proponer / Mis ideas. «Algo no funciona» usa el ícono de
  herramientas (`Wrench`), no el bicho.
- **Recuadro del pantallazo** (Marcos, 20-10): punteado, «Arrastra aquí tu pantallazo», con el botón
  «Subir pantallazo» adentro. Se suelta un archivo (computador, o arrastrando desde Fotos en el iPhone) o se
  pega con Ctrl+V; una imagen soltada fuera del recuadro no hace que el navegador la abra encima del
  formulario.
- Ítem **"Revisar ideas"** solo para revisores (la bandeja `/ideas`), con número ámbar de pendientes
  (`useIdeasPendientes`, store compartido). Se llama distinto del buzón para no confundirlos.
- Bandeja (`pages/Ideas.tsx`): pendientes primero y de la más antigua; al decidir una pendiente
  **salta sola a la siguiente**. Muestra "impacto" (frecuencia × alcance) y marca "¿preferencia?"
  cuando es *solo a mí + de vez en cuando*. "Antes de decidir": 5 criterios fijos, no se guardan.
  "También desde X": otras ideas de la misma pantalla, para detectar repetidas.
- Metadatos con `<Meta>` (minúsculas, neutro) y no con `<Chip>` (mayúsculas, para estados).

## Gotcha encontrado al construirlo

`cn()` (tailwind-merge sin configurar) **borraba los tamaños propios** (`text-micro`, `text-caption`,
`text-label`…) cuando había un color `text-*` en la misma llamada: los trataba como color. El módulo
evitó `cn()` en esos casos (`<Meta>` y las píldoras siguen con clases fijas). Afectaba también a
`<Chip>` en toda la app. **Arreglado el 2026-10-16**: `utils/cn.ts` registra los tamaños propios con
`extendTailwindMerge` (test en `utils/cn.test.ts`); ver `diseno.md` §1.

## Tests

`backend/tests/ideas.test.js` (formulario corto: solo tipo + texto, título desde la primera línea,
sin mínimos pero nada vacío, la idea guarda "cómo lo hace hoy" si llega, correo de falla de un solo
texto, correo que no rompe el alta, foto (formato, peso, quién la ve), Mis ideas sin nota interna, crédito, transiciones y motivo, gates 401/403).
`backend/tests/permisos_hierarchy_sync.test.js` cubre que `ideas.revisar` esté en la jerarquía.
