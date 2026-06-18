# Suite de pruebas E2E — Inventario → Transferencias

> Pruebas manuales / para agente de navegador (Chrome AI) sobre el módulo Transferencias.
> Validado 2026-06-17 en staging con usuario Super Admin (Bypass SoD): **100% PASA**.
> Textos entre comillas = literales de la UI (úsalos para localizar botones/campos).

## 0. Contexto y setup

- **URL:** `https://test.boveda.lols.cl` · Usuario de prueba con permisos completos + **Bypass SoD** (un mismo usuario puede solicitar→aprobar→despachar→recibir la misma TRF; normalmente la app lo prohíbe por "Separación de funciones").
- **Llegar al panel:** Login → menú **"Inventario"** → tab **"TRANSF."**. El detalle se abre con click en una tarjeta de la lista (izquierda); en móvil hay botón **"Volver"**.
- **Responsive:** en escritorio los selects de origen/destino/obra son comboboxes con búsqueda (click para abrir, click en la opción); en móvil son `<select>` nativos.
- **Estado** vía badge: **Pendiente · Aprobada · En Tránsito · Entrega en curso · Recibida · Rechazada · Cancelada**. Stepper: Solicitada → Aprobada → En tránsito → Recibida.
- **Reporte:** por test anota PASA/FALLA + screenshot + errores de consola (F12) / red. Botón esperado que no aparece = FALLA.

---

## BLOQUE A — Creación (wizard "Pedir" / "Mover")

Barra de Transferencias: botones **"Pedir"** (verde, +) y **"Mover"** (borde). Wizard de 3 pasos; **infiere el tipo de flujo** según origen/destino (banner "Será una **{tipo}**: origen → destino"). Avanzar con **"Siguiente"**.

| Test | Flujo | Pasos | Resultado esperado |
|---|---|---|---|
| **A1** | Solicitud normal (bodega→obra) | "Pedir" → "Nueva solicitud" → select **"¿Para qué obra?"** → Ítems (catálogo, control − [n] +) → **"Crear solicitud"** | Toast "Solicitud {código} creada", detalle, badge **Pendiente** |
| **A2** | Solicitud de Materiales | "Pedir" → obra → ítems **personalizados / "otros materiales"** (nombre+cant+unidad libre) → "Crear solicitud" | Toast "Solicitud de materiales … creada"; layout sin "En tránsito" |
| **A3** | Push Directo (bodega→obra) | "Mover" → "Mover stock" → Ruta: **Bodega → Obra** (banner "Envío directo") → ítems → **"Crear movimiento"** | Toast "Push directo … creado"; nace **En Tránsito** |
| **A4** | Devolución (obra→bodega) | "Mover" → **Obra → Bodega** (banner "Devolución") | Toast "Devolución … creada", **Pendiente** |
| **A5** | Traslado entre obras | "Mover" → **Obra A → Obra B** (banner "Traslado entre obras") | Toast "Traslado intra-obra … creado", **Pendiente** |
| **A6** | Intra-bodega | "Mover" → **Bodega A → Bodega B** (banner "Movimiento entre bodegas") | Toast "…intra-bodega … pendiente de aprobación" |
| **A7** | Orden de Gerencia | "Mover" → activar **toggle gerencia** → ruta → "Crear movimiento" (**motivo obligatorio**) | Toast "Orden de gerencia … emitida"; nace En Tránsito |
| **A8** | Validaciones (deben BLOQUEAR) | (1) Siguiente sin ítems; (2) mismo origen=destino → "El origen y el destino no pueden ser el mismo"; (3) cantidad > stock → "Hay ítems con cantidad mayor al stock disponible" | Cada caso bloquea; no se crea nada |

---

## BLOQUE B — Ciclo de vida (acciones del detalle)

Acciones primarias = botones verdes; secundarias (Rechazar/Cancelar) en botón directo o menú **"Acciones ▾"**.

| Test | Acción | Pasos | Resultado esperado |
|---|---|---|---|
| **B1** | Aprobar | TRF Pendiente → **"Revisar y aprobar"** → modal (asignar origen) → confirmar | Badge **Aprobada** |
| **B2** | Recepción total | TRF Aprobada → **"Registrar lo que llegó"** → quick-fill **"todo"** → **"Esta es toda la entrega"** | Badge **Recibida**, "Historial de recepciones (1)" |
| **B3** | Parcial / multi-viaje | Recibir menos que lo enviado → **"Faltan más viajes"** (→ "Entrega en curso" + "Avance · Viaje 2") → reabrir → completar → "Esta es toda la entrega" | Recibida con N viajes |
| **B4** | Merma (discrepancia) | Recibir menos + checkbox **"Esta es la entrega final"** → "Esta es toda la entrega" → modal **"¿Cerrar transferencia?"** → **"Sí, cerrar igual"** | Recibida + se crea **discrepancia** (sube el contador) |
| **B5** | Rechazar Recepción (En Tránsito) | TRF En Tránsito (A3) → **"Acciones ▾"** → **"Rechazar Recepción"** + motivo | Badge **Rechazada** |
| **B6** | Rechazar (pendiente) | TRF Pendiente → **"Rechazar"** → modal "Rechazar Transferencia" + motivo | **Rechazada** (motivo en timeline) |
| **B7** | Cancelar | TRF Pendiente / Aprobada → **"Cancelar"** → toast **"¿Cancelar la transferencia {código}?"** → **"Sí, cancelar"** | **Cancelada** |
| **B8** | Cancelar en Tránsito | TRF En Tránsito → **"Cancelar"** (requiere permiso "Cancelar en Tránsito") | **Cancelada**, sin 403 |
| **B9** | WhatsApp | TRF en **cualquier** estado (incl. rechazada/cancelada) → icono WhatsApp (tooltip "Notificar/Enviar por WhatsApp") | Toast "¡Mensaje listo!" + **"ENVIAR AHORA"**; NO cambia estado. **Contenido (respaldo fiel):** la cantidad de cada ítem = la columna real del estado; un `0` recibido o un ítem cortado a 0 al aprobar **se muestran como 0** (con la discrepancia anotada), NO la cantidad anterior; los custom quitados se omiten; rechazo muestra **motivo + quién**, cancelación muestra **quién**. Spec en `docs/reglas/inventario-transferencias.md §Respaldo por WhatsApp`; anti-regresión en `frontend/src/utils/transferenciaWhatsApp.test.ts`. |

---

## BLOQUE C — Filtros, búsqueda y discrepancias

| Test | Pasos | Resultado esperado |
|---|---|---|
| **C1** | Chips **Todas/Pendientes/Aprobadas/Recibidas** | Filtran correctamente; chip activo resaltado |
| **C2** | Chip **"Discrepancias"** (badge rojo) → sub-filtros **Pendientes/Resueltas/Descartadas**; abrir una → **Enviado/Recibido/Merma** | **"Resolver"** (nota obligatoria) → pasa a Resueltas y baja el badge; **"Descartar"** → Descartadas. Buscador "Buscar por código TRF" |
| **C3** | Lupa → **"Buscar código..."** → escribir código | Filtra a esa TRF; cerrable |

---

## BLOQUE D — Invariante de stock (regla clave)

1. Anota el stock de un ítem en una bodega (tab **"OBRA/BOD."** o "RESUMEN").
2. Crea A3 push directo (o A1 + aprobar) moviendo N unidades de esa bodega.
3. Mientras esté **Pendiente / Aprobada / En Tránsito** → el stock de origen **NO cambia**.
4. Recibir total → recién ahí origen **baja N** y destino **sube** lo recibido.
5. Rechazadas/Canceladas **nunca** mueven stock.

---

## BLOQUE E — Solicitud de Materiales (ciclo completo)

1. **Aprobar (A2):** "Revisar y aprobar" → modal **"Revisar y aprobar materiales"** → ajustar cantidad/unidad + **"Comprar"** o **"Traer de obra/bodega"** (si "Traer" aparece select "¿De qué obra se trae?") → **"Confirmar Aprobación"**. Chips "Comprar"/"Traer de {obra}".
2. **Recibir:** "Registrar lo que llegó" → modal **"Registrar entrega"** (textarea de observación, sin tabla de cantidades) → **"Cerrar entrega (total)"** → **Recibida** + "Historial de entregas".

---

## Acciones no obvias (documentadas)

1. **En Tránsito:** el detalle **no tiene "Despachar"**. Solo se llega vía **Push Directo** u **Orden de Gerencia** (nacen en tránsito). El flujo normal solicitud→aprobar→**recibir** salta "En Tránsito".
2. **Cierre con faltante** (sin marcar "entrega final") o con **sobrante** → dispara el modal "¿Cerrar transferencia?" → crea discrepancia.
3. **Bypass SoD:** este usuario puede aprobar/recibir lo que él creó. Un usuario sin bypass vería un banner "SoD activo: …" y los botones ocultos → para probar el bloqueo SoD se necesitan 2 usuarios.
4. **Quick-fill recepción:** enlaces **"todo"** / **"nada"** rellenan/vacían todas las cantidades.
5. **Orden de Gerencia** exige **motivo** (bloquea "Crear movimiento" hasta llenarlo).

## Limpieza (opcional)
Es entorno de prueba. Para dejar prolijo: **Cancela** las TRF que queden Pendiente/Aprobada/En Tránsito. No hay borrado duro (quedan Canceladas).

---

## Historial de UX corregido (a partir de la corrida del 2026-06-17)
- **QtyStepper "Llegó este viaje"** concatenaba dígitos al reescribir y no respondía a clicks rápidos → corregido (borrador de texto local + select-on-focus).
- **Toast de confirmación "¿Cancelar?"** salía abajo y se autocerraba → ahora **top-center** y **sin auto-cierre** (espera la decisión).
