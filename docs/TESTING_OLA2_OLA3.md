# Testing Strategy: Ola 2 Fase 2 + Ola 3 (Items & Stock)

Guía completa para probar las nuevas características construidas en:
- **Ola 2 Fase 2**: 4 flujos nuevos de transferencias (intra_obra, orden_gerencia, rechazo_recepción, cancelación_post_despacho)
- **Ola 3 Items**: Bulk edit de items de inventario
- **Ola 3 Stock**: Bulk edit de stock por ubicación

---

## Índice

1. [Backend Unit Testing](#backend-unit-testing)
2. [Frontend Component Testing (Local)](#frontend-component-testing-local)
3. [Integration Testing (Staging)](#integration-testing-staging)
4. [End-to-End Scenarios](#end-to-end-scenarios)
5. [Checklist de Verification](#checklist-de-verification)

---

## Backend Unit Testing

Estado actual: **132 tests pasando** (113 existentes + 4 Fase 2 + 15 nuevos Ola 3).

### 1. Ola 2 Fase 2 — Transfer Flows (4 nuevos)

#### Test 1.1: `intraObra()` crea transferencia pendiente

**Archivo**: `backend/tests/transferencia_flujos.test.js`

**Qué probar**:
- ✅ Crea transferencia con `tipo_flujo='intra_obra'`, estado `'pendiente'`
- ✅ Valida stock en obra origen (SELECT ubicaciones_stock)
- ✅ Rechaza si no hay stock suficiente
- ✅ Setea `origen_obra_id` y `destino_obra_id`
- ✅ Las dos obras deben ser distintas (validación)
- ✅ Inserta splits en `transferencia_item_origenes`
- ✅ Despacha correctamente después de aprobar
- ✅ Stock se mueve en `recibir()` desde obra origen a obra destino

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="intraObra"
```

---

#### Test 1.2: `ordenGerencia()` crea directamente en en_transito

**Qué probar**:
- ✅ Requiere `motivo` (validación)
- ✅ Sin motivo → rechaza error "motivo requerido"
- ✅ Con motivo → crea `tipo_flujo='orden_gerencia'`, estado `'en_transito'`
- ✅ `aprobador_id = userId`
- ✅ `transportista_id = userId`
- ✅ `fecha_aprobacion` y `fecha_despacho` seteados al crear (no NULL)
- ✅ Inserta splits en `transferencia_item_origenes` con origen_bodega_id o origen_obra_id
- ✅ Receptor puede `recibir()` directamente (sin ciclo pendiente → aprobada)
- ✅ Válida con cualquier combinación origen/destino (bodega↔bodega, bodega↔obra, obra↔bodega, obra↔obra)

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="ordenGerencia"
```

---

#### Test 1.3: `rechazar()` desde en_transito

**Qué probar (régimen nuevo - stock_reconciliado=TRUE)**:
- ✅ Transferencia `en_transito` → acepta rechazar
- ✅ Pasa a estado `'rechazada'`
- ✅ NO modifica ubicaciones_stock (nada había sido descontado)
- ✅ Registra motivo de rechazo

**Qué probar (régimen legacy - stock_reconciliado=FALSE)**:
- ✅ Transferencia `en_transito` que ya había descontado stock
- ✅ Llama `_reversarStockAprobada` → revierte el descontar
- ✅ Stock vuelve a ubicación origen

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="rechazar.*en_transito"
```

---

#### Test 1.4: `cancelar()` desde en_transito

**Qué probar (régimen nuevo)**:
- ✅ Transferencia `en_transito` → acepta cancelar
- ✅ Pasa a estado `'cancelada'`
- ✅ NO modifica ubicaciones_stock

**Qué probar (régimen legacy)**:
- ✅ Si había descontado stock, revierte vía `_reversarStockAprobada`

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="cancelar.*en_transito"
```

---

### 2. Ola 3 Items — Bulk Edit (8 tests nuevos)

**Archivo**: `backend/tests/item_inventario_bulk.test.js`

#### Test 2.1-2.3: Happy path, validación, y rollback

**Qué probar**:
- ✅ PUT /api/inventario/items/bulk con array válido de updates → actualiza descripcion, unidad, es_consumible, propietario
- ✅ Retorna `{ actualizado: N }` donde N es count de updates
- ✅ Rechazo si item_id no existe → error antes de transacción
- ✅ Rechazo si campo `es_consumible` inválido (no boolean) → validación de tipo
- ✅ Si segundo UPDATE falla → rollback, primer UPDATE se revierte
- ✅ No toca campos fuera del allowedFields (ej: `cantidad`)

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="itemInventarioBulk|itemBulk"
```

---

### 3. Ola 3 Stock — Bulk Edit (5 tests nuevos)

**Archivo**: `backend/tests/stock_bulk.test.js`

#### Test 3.1: Happy path mixto (1 update + 1 insert)

**Qué probar**:
- ✅ UPDATE ubicaciones_stock existente → cantidad cambia
- ✅ INSERT ubicaciones_stock nuevo → ubicacion_stock_id se genera
- ✅ Retorna `{ updated: 1, created: 1, diff: [...] }`
- ✅ diff[0].action = 'update', diff[0].changed.cantidad = { from: X, to: Y }
- ✅ diff[1].action = 'create', diff[1].stock_id = insertId

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="stock.*happy|mixto"
```

---

#### Test 3.2: Cap 413 (MAX_ITEMS overflow)

**Qué probar**:
- ✅ Array con > 500 items → rechaza con status 413 sin tocar DB
- ✅ No llama `db.getConnection` (validación temprana)
- ✅ Respuesta incluye `maxItems: 500`

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="413|MAX_ITEMS"
```

---

#### Test 3.3: Validación de duplicados (XOR)

**Qué probar**:
- ✅ Array con item+bodega duplicada dos veces → rechaza "duplicado"
- ✅ Array con ambos obra_id y bodega_id en mismo ajuste → rechaza "no puede tener ambos"
- ✅ Array vacío o sin ubicación → rechaza

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="duplicado|XOR"
```

---

#### Test 3.4-3.5: Rollback y edge cases

**Qué probar**:
- ✅ Si SELECT falla → rollback, error
- ✅ Si UPDATE ejecuta pero retorna affectedRows=0 → rollback
- ✅ Null-safe comparison: cantidad null vs 0 tratados correctamente

**Cómo correr**:
```bash
cd backend
npm test -- --testNamePattern="rollback|affectedRows"
```

---

### Correr todos los tests

```bash
cd backend
npm test
# Output esperado: 132 passing
```

Si alguno falla, check:
1. ¿Hay un `.mockRejectedValueOnce()` esperado que falta?
2. ¿El SQL en el código coincide con el del mock?
3. ¿Hay cambios recientes no commiteados?

---

## Frontend Component Testing (Local)

### Setup

```bash
cd frontend
npm run dev
# http://localhost:5173/inventario
```

Loguéate con usuario que tenga:
- `inventario.crear`
- `inventario.editar`
- `inventario.aprobar`

O prueba cada permiso por separado en diferentes usuarios.

---

### 1. Ola 2 Fase 2 — Transferencias

#### 1.1: Crear intra_obra

1. Click en "Nueva transferencia"
2. En `NewMovimientoModal`, selecciona **intra_obra**
3. Forma debe mostrar:
   - `Origen`: selector con obras (incluidas bodega-first)
   - `Destino`: selector con obras (excluir origen)
   - `Items`: multi-select con cantidad
   - Button: "Crear intra_obra"
4. Submit sin seleccionar ambas obras → error
5. Submit sin items → error
6. Submit válido → transferencia creada en estado `'pendiente'` en lista
7. Otro usuario (con inventario.aprobar) entra → verá botón "Aprobar"
8. Click "Aprobar" → transición a `'aprobada'`
9. Mismo usuario → click "Despachar" → `'en_transito'`
10. Receptor (con inventario.editar) → click "Recibir" → `'recibida'`
    - Stock: origen obra baja, destino obra sube ✅

**Checklist**:
- [ ] Form tiene validaciones en tiempo real
- [ ] Submit deshabilitado sin obra origen/destino
- [ ] Estados transicionan correctamente
- [ ] Stock se mueve correctamente

---

#### 1.2: Crear orden_gerencia

1. Click en "Nueva transferencia"
2. Selecciona **orden_gerencia**
3. Forma debe mostrar:
   - `Origen`: bodega u obra
   - `Destino`: bodega u obra
   - `Items`: multi-select con cantidad
   - `Motivo`: textarea REQUERIDO (asterisco rojo)
4. Submit sin motivo → error "Motivo requerido"
5. Submit con motivo vacío (solo espacios) → error
6. Submit válido → transferencia aparece en lista directamente en estado `'en_transito'` (no pasa por pendiente)
7. Receptor → click "Recibir" → `'recibida'`

**Checklist**:
- [ ] Motivo es OBLIGATORIO y validado
- [ ] Estado inicial es `'en_transito'`, no `'pendiente'`
- [ ] No hay botones "Aprobar" o "Despachar" visibles (ya hecho)
- [ ] Stock se mueve al recibir

---

#### 1.3: Rechazar recepción desde en_transito

1. Crear una orden_gerencia cualquiera
2. Despachar (o llega en_transito directamente si es orden_gerencia)
3. Abrir el detalle de la transferencia
4. Busca botón "Rechazar recepción" (rojo, diferente del botón "Rechazar" del aprobador)
   - Visible si: estado = `'en_transito'` && hasPermission('inventario.editar')
5. Click → abre textarea con placeholder "Motivo del rechazo..."
6. Sin motivo → error
7. Con motivo → confirma → transición a `'rechazada'`
8. Stock NO se mueve (régimen nuevo)

**Checklist**:
- [ ] Botón solo visible en en_transito
- [ ] Botón solo visible con inventario.editar
- [ ] Motivo es requerido
- [ ] Transición a rechazada

---

#### 1.4: Cancelar desde en_transito

1. Crear una orden_gerencia cualquiera
2. No despachar (o está en en_transito)
3. Abrir detalle
4. Busca botón "Cancelar" (gris)
   - **Ahora visible en en_transito** (antes solo en pendiente|aprobada)
5. Click → confirma "¿Cancelar transferencia?"
6. Confirma → transición a `'cancelada'`
7. Stock NO se mueve

**Checklist**:
- [ ] Botón "Cancelar" visible en en_transito (cambio nuevo)
- [ ] Confirmación necesaria
- [ ] Transición correcta

---

### 2. Ola 3 — Items Maestro (Bulk Edit)

#### 2.1: Abrir tab Maestro → sub-tab Ítems

1. En page Inventario, click tab **Maestro**
2. Sub-tabs aparecen: "Ítems" y "Stock por ubicación"
3. Click "Ítems" → carga grid con todas las items

**Checklist**:
- [ ] Tab Maestro existe
- [ ] Sub-tabs renderean
- [ ] Grid muestra items (nro_item, descripcion, categoría, unidad, es_consumible, propietario)

---

#### 2.2: Editar item (inline)

1. En grid, localiza una fila con item
2. Columnas editables:
   - `Descripción` (texto)
   - `Unidad` (texto)
   - `Es consumible` (checkbox)
   - `Propietario` (selector / texto)
3. Click en celda → editable inline
4. Cambiar valor → fila se marca como "dirty" (ej: fondo color diferente)
5. Cambiar otro valor en la misma fila → sigue dirty
6. Revertir valor a original → fila deja de ser dirty

**Checklist**:
- [ ] Edición inline funciona
- [ ] Dirty state se marca visualmente
- [ ] Revertir a valor original elimina dirty state

---

#### 2.3: Guardar cambios (Ctrl+S o botón)

1. Edita 3 items diferentes
2. Botón "Guardar cambios (3)" aparece abajo
3. Presiona **Ctrl+S** (o Cmd+S en Mac)
   - POST a `/api/inventario/items/bulk` con array de updates
   - Toast: "3 items actualizados"
4. Grid se actualiza, dirty state se limpia
5. Refresh página → cambios persisten en DB ✅

**Checklist**:
- [ ] Contador dinámico en botón (N cambios)
- [ ] Ctrl+S envía bulk request
- [ ] Toast de éxito
- [ ] Cambios persistidos en DB

---

#### 2.4: Revertir cambios sin guardar

1. Edita 2 items
2. Click botón "Revertir" (undo icon)
3. Confirma "¿Descartar 2 cambios?"
4. Todos los valores vuelven a originales
5. Dirty state se limpia

**Checklist**:
- [ ] Revertir limpia todos los cambios
- [ ] Confirmación necesaria

---

#### 2.5: Cambiar de ubicación con cambios pendientes

1. (Solo aplicable si hay selectores de ubicación — check si Ítems tiene)
2. Edita un item
3. Intenta navegar o cambiar tab
4. Toast: "Hay X cambios sin guardar. ¿Descartar?" → requiere confirmación

**Checklist**:
- [ ] beforeunload warning si hay cambios pendientes

---

### 3. Ola 3 — Stock Maestro (Bulk Edit)

#### 3.1: Abrir tab Maestro → sub-tab Stock por ubicación

1. En page Inventario, click tab **Maestro**
2. Click sub-tab "Stock por ubicación"
3. Grid vacío con selector "— Elige ubicación —"

**Checklist**:
- [ ] Sub-tab carga correctamente
- [ ] Selector de ubicación visible

---

#### 3.2: Seleccionar bodega o obra

1. Click en selector
2. Dropdown lista:
   - 🏢 Bodegas (primero)
   - 🏗️ Obras
3. Selecciona una bodega
4. Grid carga con items de esa bodega + cantidades actuales

**Checklist**:
- [ ] Bodegas listed first
- [ ] Obras listed second
- [ ] Grid carga para ubicación seleccionada

---

#### 3.3: Editar cantidades

1. Grid muestra columnas:
   - Nº | Descripción | Categoría | Unidad | Actual | Nueva cant. | Δ
2. Localiza fila
3. Click en "Nueva cant." → input editable
4. Cambia cantidad (ej: 10 → 15)
5. Fila se marca dirty (background amber/naranja)
6. Columna Δ (delta) muestra "+5" (verde si positivo, rojo si negativo)

**Checklist**:
- [ ] Input editable con min=0
- [ ] Dirty state visual
- [ ] Delta calcula correctamente

---

#### 3.4: Buscar items

1. Campo "Buscar ítem..." aparece en toolbar
2. Empieza a escribir: ej "hormigon"
3. Grid filtra en tiempo real (por nro_item, descripcion, categoria)
4. Muestra "X de Y ítems"

**Checklist**:
- [ ] Búsqueda funciona
- [ ] Contador dinámico

---

#### 3.5: Cambiar de ubicación con cambios pendientes

1. Edita 2 cantidades
2. Intenta seleccionar otra bodega/obra
3. Confirma: "Hay 2 cambios sin guardar. ¿Descartar?"
4. Si sí → carga nueva ubicación
5. Si no → sigue en ubicación actual

**Checklist**:
- [ ] Confirmación antes de cambiar
- [ ] Dirty state se preserva

---

#### 3.6: Guardar ajustes (Ctrl+S)

1. Edita 3 cantidades en una bodega
2. Botón "Guardar ajustes (3)" aparece
3. Presiona **Ctrl+S**
   - PUT a `/api/inventario/stock/bulk`
   - Toast: "Stock ajustado: 3 actualizados"
4. Grid se actualiza, dirty state se limpia
5. Cambios visibles en DB ✅

**Checklist**:
- [ ] Ctrl+S envía bulk PUT
- [ ] Toast de éxito
- [ ] Cambios persistidos
- [ ] Contador limpiado

---

#### 3.7: Revertir ajustes

1. Edita 2 cantidades
2. Click "Revertir"
3. Confirma
4. Cantidades vuelven a originales

**Checklist**:
- [ ] Revertir funciona

---

#### 3.8: Validación XOR (obra_id vs bodega_id)

Este es un test backend más que frontend, pero verifica:
1. Edita stock en una obra
2. Guardar debe enviar `{ item_id: X, obra_id: 5, cantidad: Y }` (NO bodega_id)
3. Edita stock en una bodega
4. Guardar debe enviar `{ item_id: X, bodega_id: 3, cantidad: Y }` (NO obra_id)

**Checklist**:
- [ ] Network inspector muestra payloads correctos
- [ ] Sin ambigüedad de ubicación

---

### 4. Permisos (Role-based)

Crea usuarios con distintos permisos y verifica visibilidad:

#### 4.1: Sin inventario.editar

- Maestro → Ítems: grid read-only (sin inputs)
- Maestro → Stock: "Sin permiso" message
- Transferencias: solo lectura

**Checklist**:
- [ ] No hay inputs en Ítems
- [ ] Stock muestra alerta
- [ ] Botones Rechazar/Cancelar ocultos

---

#### 4.2: Sin inventario.crear

- Nueva transferencia: botones intra_obra, push_directo ocultos (requieren crear)
- Transferencias listadas

**Checklist**:
- [ ] No hay opción crear movimiento
- [ ] Otras acciones disponibles

---

#### 4.3: Sin inventario.aprobar

- Nueva transferencia: orden_gerencia oculta
- Botón "Aprobar" oculto en transferencias en `pendiente`

**Checklist**:
- [ ] No puede crear orden_gerencia
- [ ] No puede aprobar

---

---

## Integration Testing (Staging)

Deploy a `develop` ya ejecutó CI/CD. Ahora prueba en staging live.

### URL
- **Staging**: https://test.boveda.lols.cl/inventario

### Setup
1. Loguéate con usuario con todos los permisos (admin o inventario completo)
2. Abre DevTools (F12) → Console y Network tabs
3. Ten dos navegadores abiertos (o tabs incógnito) para simular múltiples usuarios

---

### 1. Ola 2 Fase 2 — E2E Transfer Flows

#### 1.1: Intra Obra — Happy Path Completo

**Usuarios**:
- User A: inventario.crear, inventario.editar
- User B: inventario.aprobar, inventario.editar

**Steps** (User A):
1. Click "Nueva transferencia" → intra_obra
2. Obra origen: "Obra A", Destino: "Obra B"
3. Items: Selecciona 2 items con cantidades
4. Click "Crear intra_obra"
5. Toast: "Transferencia creada"
6. Abierto en estado `pendiente`
7. Botón "Aprobar" disabled (no tienes permiso)

**Steps** (User B, mismo navegador o refresh):
1. Abre Inventario
2. Click en la transferencia recién creada (status: pendiente)
3. Click "Aprobar"
4. Modal: "¿Aprobar transferencia?" + textarea "Observación"
5. Escribe algo y confirma
6. Estado → `aprobada`
7. Botón "Despachar" visible
8. Click "Despachar" + transportista selector
9. Estado → `en_transito`

**Steps** (User A, receptor):
1. Abre transferencia nuevamente
2. Botón "Recibir" visible
3. Click → confirma
4. Estado → `recibida`

**Verificar en DB**:
```sql
SELECT * FROM ubicaciones_stock 
WHERE (ubicacion_type='obra' AND ubicacion_id IN (obra_a_id, obra_b_id))
AND item_id IN (los 2 items);
```
- Obra A: cantidad baja por lo que se movió
- Obra B: cantidad sube por lo que se recibió ✅

**Checklist**:
- [ ] Creación successful
- [ ] Estados transicionan correcto
- [ ] Stock se mueve correctamente
- [ ] DB refleja cambios

---

#### 1.2: Orden Gerencia — Nace en en_transito

**User A** (inventario.aprobar):
1. Nueva transferencia → orden_gerencia
2. Origen: bodega u obra, Destino: otra ubicación
3. Items: selecciona 1 item
4. Motivo: (vacío) → click submit → error "Motivo requerido"
5. Motivo: "Reposición de emergencia"
6. Click submit
7. Transferencia aparece en lista con estado `en_transito` (NO pendiente)
8. Botones "Aprobar" y "Despachar" NO existen (ya fue aprobada y despachada)

**User B** (receptor):
1. Abre la transferencia
2. Botón "Recibir" visible
3. Click → estado → `recibida`
4. Stock se movió ✅

**Checklist**:
- [ ] Motivo obligatorio
- [ ] Estado inicial es en_transito
- [ ] No hay ciclo de aprobación
- [ ] Receptor puede recibir directo

---

#### 1.3: Rechazo Recepción

**User A** (crea orden_gerencia):
1. Nueva orden_gerencia (cualquier origen/destino)
2. Estado pasa a en_transito

**User B** (receptor):
1. Abre la transferencia en en_transito
2. Botón "Rechazar recepción" visible (rojo, diferente al botón de rechazar del aprobador)
3. Click → textarea "Motivo del rechazo..."
4. Sin texto → error
5. Texto: "Items dañados"
6. Click confirmar
7. Estado → `rechazada`
8. Botón "Rechazar recepción" desaparece
9. Consulta DB: ubicaciones_stock NO cambió (stock no se movió)

**Checklist**:
- [ ] Botón visible solo en en_transito con permiso inventario.editar
- [ ] Motivo requerido
- [ ] Stock NO se revierte (régimen nuevo)

---

#### 1.4: Cancelación Post Despacho

**User A** (crea orden_gerencia):
1. Crea orden_gerencia
2. En estado en_transito

**User A o B** (con inventario.editar):
1. Abre transferencia
2. Botón "Cancelar" visible (gris) — **NUEVO**: ahora disponible en en_transito
3. Click → confirma "¿Cancelar transferencia?"
4. Estado → `cancelada`
5. Botón "Cancelar" desaparece
6. Stock NO cambió

**Checklist**:
- [ ] Botón "Cancelar" visible en en_transito (cambio)
- [ ] Stock no se revierte

---

### 2. Ola 3 Items — Bulk Edit Real

**URL**: https://test.boveda.lols.cl/inventario → Tab "Maestro" → Sub-tab "Ítems"

1. Grid carga con todas las items
2. Localiza 3 items diferentes
3. Edita:
   - Item 1: Descripción "Nuevo nombre"
   - Item 2: Es consumible = true
   - Item 3: Propietario = "Nuevo propietario"
4. Fila dirty (background diferente)
5. Botón "Guardar cambios (3)" visible abajo
6. Presiona **Ctrl+S** (o Cmd+S)
7. Network tab muestra PUT `/api/inventario/items/bulk` con payload:
   ```json
   {
     "items": [
       { "id": id1, "descripcion": "Nuevo nombre" },
       { "id": id2, "es_consumible": true },
       { "id": id3, "propietario": "Nuevo propietario" }
     ]
   }
   ```
8. Toast: "3 items actualizados"
9. Dirty state limpio
10. Refresh página → cambios persisten

**Verificar en DB**:
```sql
SELECT id, descripcion, es_consumible, propietario 
FROM items_inventario 
WHERE id IN (id1, id2, id3);
```
- Descripción, es_consumible, propietario actualizados ✅

**Checklist**:
- [ ] Edición inline funciona
- [ ] Dirty state correcto
- [ ] Ctrl+S envía bulk request
- [ ] Toast de éxito
- [ ] DB actualizado

---

### 3. Ola 3 Stock — Bulk Edit Real

**URL**: https://test.boveda.lols.cl/inventario → Tab "Maestro" → Sub-tab "Stock por ubicación"

1. Selector: elige una bodega
2. Grid carga con items de esa bodega
3. Localiza 4 items
4. Edita cantidad en cada uno:
   - Item A: 10 → 15 (delta: +5)
   - Item B: 5 → 3 (delta: -2)
   - Item C: 0 → 8 (delta: +8)
   - Item D: 20 → 20 (sin cambio, dirty limpiado al revertir)
5. Botón "Guardar ajustes (3)" visible
6. Presiona **Ctrl+S**
7. Network tab muestra PUT `/api/inventario/stock/bulk` con payload:
   ```json
   {
     "adjustments": [
       { "item_id": A, "bodega_id": bodega_id, "cantidad": 15 },
       { "item_id": B, "bodega_id": bodega_id, "cantidad": 3 },
       { "item_id": C, "bodega_id": bodega_id, "cantidad": 8 }
     ]
   }
   ```
8. Toast: "Stock ajustado: 3 actualizados"
9. Grid se actualiza
10. Refresh página → cambios persisten

**Verificar en DB**:
```sql
SELECT item_id, cantidad FROM ubicaciones_stock 
WHERE ubicacion_type='bodega' AND ubicacion_id=bodega_id 
AND item_id IN (A, B, C);
```
- Cantidades actualizado ✅

**Checklist**:
- [ ] Selector funciona
- [ ] Edición inline
- [ ] Delta calcula correcto
- [ ] Guardar con Ctrl+S
- [ ] Toast de éxito
- [ ] DB actualizado

---

### 4. Performance & Edge Cases

#### 4.1: Bulk stock con 500 items (cap)

1. Bodega/obra con muchos items
2. Edita 500 items (presiona Ctrl+S)
3. Request se envía, toast de éxito
4. Edita 501 items
5. Presiona Ctrl+S → error 413 "Demasiados ajustes: máximo 500"

**Checklist**:
- [ ] 500 items ok
- [ ] 501 items rechazado

---

#### 4.2: Cambio de ubicación con dirty state

1. Stock: Bodega A seleccionada, edita 2 cantidades
2. Intenta seleccionar Bodega B
3. Confirma "¿Descartar 2 cambios?"
4. Si no → sigue en Bodega A
5. Si sí → carga Bodega B, dirty limpio

**Checklist**:
- [ ] Confirmación necesaria

---

#### 4.3: Keyboard shortcuts

- **Ctrl+S** (o Cmd+S): Guardar cambios
- **Esc**: Podría cerrar modal si aplica

Test ambos en Ítems y Stock.

**Checklist**:
- [ ] Ctrl+S funciona
- [ ] Esc funciona (si aplica)

---

#### 4.4: beforeunload warning

1. Items: edita 1 item, intenta cerrar tab
2. Browser muestra warning: "Cambios sin guardar"
3. Si refrescas con cambios en Stock: same warning

**Checklist**:
- [ ] Warning aparece con cambios pendientes
- [ ] Warning NO aparece sin cambios

---

---

## End-to-End Scenarios

### Escenario 1: Flujo Completo Intra Obra

**Objetivo**: Simular transferencia de herramientas entre dos obras con aprobación del jefe.

**Preparación**:
- 2 obras con stock inicial
- 3 usuarios: Almacenero (crear), Jefe Obra B (aprobar), Receptor

**Pasos**:

1. **Almacenero crea intra_obra**:
   - Obra A → Obra B
   - Items: Taladro (1), Manguera (5m)
   - Estado: `pendiente`

2. **Jefe Obra B aprueba**:
   - Ve transferencia pendiente
   - Revisa items y cantidad
   - Aprueba con observación: "OK, recibimos"
   - Estado: `aprobada`

3. **Almacenero despacha**:
   - Click "Despachar"
   - Selecciona transportista (él mismo)
   - Estado: `en_transito`
   - DB: `ubicaciones_stock` Obra A baja

4. **Jefe Obra B recibe**:
   - Click "Recibir"
   - Estado: `recibida`
   - DB: `ubicaciones_stock` Obra B sube

5. **Verificación final**:
   - Stock Obra A: Taladro y Manguera bajaron
   - Stock Obra B: Taladro y Manguera subieron
   - Transferencia en historial como `recibida`

---

### Escenario 2: Orden Gerencia Emergencia

**Objetivo**: Gerencia ordena transferencia directa sin ciclo de aprobación.

**Preparación**:
- Bodega Central con stock
- Obra C en emergencia

**Pasos**:

1. **Gerente crea orden_gerencia**:
   - Bodega Central → Obra C
   - Items: Cemento (50 bolsas), Arena (5m³)
   - Motivo: "Emergencia de abastecimiento por falta de stock en obra"
   - Estado: `en_transito` (directo, no pendiente)

2. **Receptor en Obra C recibe**:
   - Transferencia visible en lista como `en_transito`
   - Click "Recibir" → `recibida`
   - Stock: Bodega baja, Obra C sube

3. **Verificación**:
   - No hay pasos de aprobación (bypass)
   - Stock se movió correctamente

---

### Escenario 3: Rechazo en Tránsito

**Objetivo**: Material dañado llega a destino, receptor rechaza.

**Preparación**:
- Transferencia en `en_transito` (ej: orden_gerencia)

**Pasos**:

1. **Receptor abre transferencia en tránsito**:
   - Ve materiales esperados
   - Al recibir, detecta: items dañados

2. **Rechaza con botón "Rechazar recepción"**:
   - Motivo: "Cajas 3 y 5 con daño en esquinas, inutilizables"
   - Estado: `rechazada`

3. **Verificación**:
   - Stock NO se revierte (régimen nuevo)
   - Transferencia marcada como rechazada
   - Gerencia verá transferencia fallida en dashboard

---

### Escenario 4: Bulk Edit Items + Transfer

**Objetivo**: Actualizar propiedades de items en lote, luego usarlos en transferencia.

**Pasos**:

1. **Maestro → Ítems**:
   - Edita 10 items:
     - Descripción mejorada
     - Es consumible = true (para algunos)
   - Guardar con Ctrl+S
   - Toast: "10 items actualizados"

2. **Inventario → Resumen**:
   - Verifica que items se muestren con nuevas descripciones
   - Consumibles marcados correctamente

3. **Nueva transferencia**:
   - Usa los items recién actualizados
   - Items muestran descripción nueva
   - Flujo completo exitoso

---

### Escenario 5: Bulk Stock Adjust + Reconciliation

**Objetivo**: Ajustar stock masivamente (ej: después de inventario físico).

**Preparación**:
- Bodega con stock actual en DB

**Pasos**:

1. **Maestro → Stock por ubicación**:
   - Bodega: "Almacén Central"
   - Grid carga stock actual

2. **Ajusta 15 cantidades** (simulando resultados de conteo físico):
   - Item A: 100 → 98 (faltaban 2)
   - Item B: 50 → 55 (había 5 extra)
   - ... (13 más)

3. **Guardar con Ctrl+S**:
   - Request `/api/inventario/stock/bulk` con 15 ajustes
   - Toast: "Stock ajustado: 15 actualizados"

4. **Verificación DB**:
   ```sql
   SELECT item_id, cantidad FROM ubicaciones_stock 
   WHERE ubicacion_type='bodega' AND ubicacion_id=almacen_central_id;
   ```
   - 15 items con cantidades nuevas ✅

5. **Impacto downstream**:
   - Transferencias futuras usan stock correcto
   - Reportes de inventario reflejan cambios

---

---

## Checklist de Verification

### ✅ Backend Tests

- [ ] `npm test` → 132 passing
  - [ ] 4 tests Ola 2 Fase 2 (intra_obra, orden_gerencia, rechazar, cancelar)
  - [ ] 8 tests Ola 3 Items (CRUD bulk)
  - [ ] 5 tests Ola 3 Stock (mixed updates/inserts, 413, XOR)
- [ ] Todos los tests pasan en CI/CD
- [ ] No hay warnings o deprecations en output

---

### ✅ Frontend Components (Local Dev)

**Ola 2 Fase 2**:
- [ ] Nueva transferencia → intra_obra opción disponible
- [ ] intra_obra form: validaciones, creación, ciclo completo
- [ ] Nueva transferencia → orden_gerencia opción disponible
- [ ] orden_gerencia form: motivo obligatorio, estado en_transito
- [ ] Botón "Rechazar recepción" en transferencias en_transito
- [ ] Botón "Cancelar" visible en transferencias en_transito

**Ola 3 Items**:
- [ ] Tab Maestro → sub-tab Ítems funciona
- [ ] Grid editable para descripcion, unidad, es_consumible, propietario
- [ ] Dirty state visual
- [ ] Ctrl+S envía bulk request
- [ ] Revertir limpia cambios
- [ ] beforeunload warning con cambios pendientes

**Ola 3 Stock**:
- [ ] Tab Maestro → sub-tab Stock por ubicación funciona
- [ ] Selector bodega/obra funciona
- [ ] Grid editable para cantidad
- [ ] Delta calcula correcto
- [ ] Búsqueda funciona
- [ ] Ctrl+S envía bulk request
- [ ] Cambio de ubicación con confirmación
- [ ] beforeunload warning

**Permisos**:
- [ ] Sin inventario.editar: Stock muestra alerta, Ítems read-only
- [ ] Sin inventario.crear: Nueva transferencia oculta (crear)
- [ ] Sin inventario.aprobar: orden_gerencia oculta, botón Aprobar oculto

---

### ✅ Integration Testing (Staging)

**URL**: https://test.boveda.lols.cl/inventario

**Ola 2 Fase 2 E2E**:
- [ ] Intra Obra: creación → aprobación → despacho → recepción → stock correcto
- [ ] Orden Gerencia: creación sin pendiente → recepción → stock correcto
- [ ] Rechazo recepción en en_transito: botón visible → estado rechazada → stock sin cambios
- [ ] Cancelación en en_transito: botón visible → estado cancelada → stock sin cambios

**Ola 3 Items**:
- [ ] Edita 3 items en Maestro → Ítems
- [ ] Guarda con Ctrl+S
- [ ] DB verifica cambios
- [ ] Cambios persisten en refresh

**Ola 3 Stock**:
- [ ] Bodega seleccionada → grid carga
- [ ] Edita 4 cantidades
- [ ] Guarda con Ctrl+S
- [ ] DB verifica cambios (ubicaciones_stock)
- [ ] Cambios persisten en refresh

**Caps & Validation**:
- [ ] Stock bulk: 500 items ok, 501 rechazado (413)
- [ ] Items bulk: validación XOR, duplicados rechazados
- [ ] Cambio de ubicación con confirmación

**Keyboard & UX**:
- [ ] Ctrl+S (o Cmd+S) funciona en Ítems y Stock
- [ ] beforeunload warning con cambios pendientes
- [ ] Permisos bloqueados correctamente

---

### ✅ End-to-End Scenarios

- [ ] Intra Obra completo: 2 obras, aprobación, despacho, recepción
- [ ] Orden Gerencia emergencia: sin ciclo aprobación, directo a recepción
- [ ] Rechazo material dañado: en_transito → rechazada, stock no se revierte
- [ ] Bulk Items + Transfer: edita items → usa en nueva transferencia
- [ ] Bulk Stock Reconciliation: ajusta 15 cantidades, verifica DB

---

### ✅ Post-Deploy

- [ ] Branch `develop` con todos los cambios
- [ ] CI/CD verde (all tests passing)
- [ ] Deploy automático a https://test.boveda.lols.cl/
- [ ] Staging environment disponible y funcional
- [ ] Sin errores en console (DevTools → Console tab)
- [ ] Sin network errors (DevTools → Network tab)

---

## Comandos Rápidos

```bash
# Backend tests
cd backend && npm test

# Frontend TypeScript check
cd frontend && npx tsc --noEmit

# Frontend build
cd frontend && npm run build

# Local dev
cd frontend && npm run dev    # http://localhost:5173/inventario
cd backend && npm run dev     # http://localhost:3000

# Staging URL
https://test.boveda.lols.cl/inventario

# Run specific test
npm test -- --testNamePattern="intraObra|ordenGerencia"
```

---

## Notas Finales

- **Régimen nuevo vs legacy**: El código detecta `stock_reconciliado` para determinar si revertir stock en rechazo/cancelación desde `en_transito`. En régimen nuevo (TRUE), no hay revert. En legacy (FALSE), hay revert via `_reversarStockAprobada`.
- **XOR constraint**: Stock bulk valida que cada ajuste tenga `obra_id` XOR `bodega_id`, nunca ambos.
- **Dirty state**: Buffer en React que marca cambios sin enviar inmediatamente. Ctrl+S envía, Revertir limpia, beforeunload advierte.
- **Splits**: Transferencias persisten splits en `transferencia_item_origenes` para multi-origen (ej: orden_gerencia usa esto).

---

**Próximos pasos después de verificación exitosa**:
1. Merge `develop` → `main` (si todo es green)
2. Deploy automático a producción
3. Documentar cualquier issue encontrada
4. Considerar Ola 4 (arriendo) o Ola 5 (calidad)

