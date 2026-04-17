# Plan: Fix bugs en Configuración → Inventario → Ítems

## Context

En staging (`test.boveda.lols.cl/configuracion` → tab Inventario → Ítems) hay 3 bugs abiertos tras el despliegue del commit `9b4a678`:

1. **DELETE**: tras confirmar "Eliminar Ítem", el toast dice "Ítem eliminado" pero la fila sigue apareciendo en la tabla. Solo desaparece al recargar.
2. **EDIT**: al abrir el modal de edición, `Valor Compra` se muestra como `14,00000` en vez de `14` (o `$14`). Al guardar valores como "14.000" (intención: catorce mil pesos) el backend almacena `14` porque JS parsea "14.000" como el número 14.
3. **Formato CLP**: los inputs monetarios son `type="number"` puros — no muestran prefijo `$` ni separador de miles. El usuario quiere ver moneda chilena formateada tanto en la tabla (ya OK con `toLocaleString('es-CL')`) como **dentro de los inputs** del formulario.

Bug crítico: el #2+#3 causan pérdida silenciosa de datos (el usuario cree que guardó $14.000 pero quedó $14). Hay que atacarlos juntos con un input de moneda que parsee y formatee bien.

Existe un bug adicional latente (no reportado pero idéntica causa raíz): las tablas `bodegas`, `categorias_inventario` y `obras` tampoco filtran soft-deletes porque ninguna tiene `useSoftDelete: true` en [backend/index.js](backend/index.js:136). Lo dejo fuera del alcance — solo arreglo `items_inventario` ahora; mencionarlo al usuario para priorizar.

---

## Diagnóstico (por bug)

### Bug #1 — Delete no refresca

- [frontend/src/components/ui/CrudTable.tsx:104-114](frontend/src/components/ui/CrudTable.tsx#L104-L114) — `handleDelete` llama `api.delete(...)` y luego `fetchData()`. **Eso funciona bien.**
- [backend/src/controllers/crud.controller.js:33-37](backend/src/controllers/crud.controller.js#L33-L37) — `remove` → `service.softDelete` que hace `UPDATE items_inventario SET activo = FALSE`. **La fila NO se borra de la DB.**
- [backend/src/services/crud.service.js:24-36](backend/src/services/crud.service.js#L24-L36) — `getAll` solo filtra `activo = 1` si `options.useSoftDelete === true`.
- [backend/index.js:147-161](backend/index.js#L147-L161) — la config de `items-inventario` **NO tiene** `useSoftDelete: true`. Entonces el siguiente GET devuelve la fila con `activo = 0` y el frontend la vuelve a mostrar.

### Bug #2 — "14,00000" y pérdida de datos al editar

- MySQL `DECIMAL(10,2)` / `DECIMAL(10,5)` → node-mysql2 lo entrega como **string** (`"14.00000"`).
- [frontend/src/components/settings/ItemInventarioForm.tsx:45-53](frontend/src/components/settings/ItemInventarioForm.tsx#L45-L53) — `defaultValues.valor_compra = initialData?.valor_compra ?? 0`. Se pasa el string al input `type="number"`; Chrome con locale es-CL lo muestra con coma → `14,00000`.
- Cuando el usuario tipea `"14.000"` (pensando en miles chilenos) y el form hace `z.coerce.number()` → `Number("14.000") = 14`. Se guarda `14` en DB.

### Bug #3 — Sin formato CLP en inputs

- No existe helper `formatCLP` en el codebase. Se usa `toLocaleString('es-CL')` ad-hoc en 7 archivos (ver [Settings.tsx:573-574](frontend/src/pages/Settings.tsx#L573-L574), [ResumenMensualTable.tsx](frontend/src/components/inventario/ResumenMensualTable.tsx), etc.).
- Los inputs del form son `type="number"` — no aceptan prefijo `$` ni separador de miles.

---

## Cambios propuestos

### 1. Backend (1 línea)

**[backend/index.js:147](backend/index.js#L147)** — agregar `useSoftDelete: true` a la config de `items-inventario`:

```js
app.use('/api/items-inventario', createCrudRoutes(invPerms, 'items_inventario', {
    searchFields: ['descripcion'],
    joins: 'LEFT JOIN categorias_inventario c ON items_inventario.categoria_id = c.id',
    selectFields: 'items_inventario.*, c.nombre as categoria_nombre',
    allowedFilters: ['categoria_id'],
    useSoftDelete: true,  // ← NUEVO: filtra activo=1 por defecto en GET
    orderBy: 'items_inventario.nro_item ASC',
    allowedFields: [...],
    beforeCreate: async (safeData, db) => { ... }  // ya existe
}));
```

Esto corrige el bug #1. **No requiere migración.**

### 2. Nuevo helper de moneda

**Archivo nuevo: `frontend/src/utils/currency.ts`**

```ts
// Pesos chilenos: sin decimales. $14.000 (punto miles, prefijo $).
export const formatCLP = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined || value === '') return '';
    const n = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(n)) return '';
    return `$${Math.round(n).toLocaleString('es-CL')}`;
};

// Acepta "$14.000", "14.000", "14000" → 14000. Strip todo lo no-dígito.
export const parseCLP = (str: string): number => {
    const digits = str.replace(/[^\d]/g, '');
    return digits ? Number(digits) : 0;
};
```

**Justificación**: CLP no usa decimales en la práctica (centavos no existen). Tratar como entero evita el bug de "14.000 → 14". El helper se podrá reusar en [ResumenMensualTable.tsx](frontend/src/components/inventario/ResumenMensualTable.tsx), [StockUbicacionTable.tsx](frontend/src/components/inventario/StockUbicacionTable.tsx), etc. en un PR separado (fuera de alcance).

### 3. Nuevo componente `<CurrencyInput>`

**Archivo nuevo: `frontend/src/components/ui/CurrencyInput.tsx`**

Un input controlado que:
- Recibe `value: number` del form y muestra `formatCLP(value)` formateado.
- En `onChange` llama `parseCLP(e.target.value)` y devuelve número al form.
- Compatible con `react-hook-form` vía `Controller` (no con `register` plano).
- API similar al `<Input>` existente: `label`, `error`, `placeholder`.

Esto reemplaza los dos inputs `type="number"` de Valor Compra/Arriendo. M2 (moldajes) sigue siendo decimal común — dejar como está pero coercionar initialData a Number.

### 4. Arreglar `ItemInventarioForm.tsx`

**[frontend/src/components/settings/ItemInventarioForm.tsx](frontend/src/components/settings/ItemInventarioForm.tsx):**

- Cambiar `valor_compra`/`valor_arriendo` en schema Zod a `z.coerce.number().int().min(0)` (entero, sin decimales).
- `defaultValues`: coercionar explícitamente `initialData` a Number:
  ```ts
  valor_compra: initialData?.valor_compra != null ? Number(initialData.valor_compra) : 0,
  valor_arriendo: initialData?.valor_arriendo != null ? Number(initialData.valor_arriendo) : 0,
  m2: initialData?.m2 != null ? Number(initialData.m2) : null,
  ```
- Reemplazar los dos inputs monetarios por `<CurrencyInput>` usando `Controller` de react-hook-form.

---

## Archivos tocados

| Archivo | Acción |
|---|---|
| `backend/index.js` | edit (1 línea) |
| `frontend/src/utils/currency.ts` | crear |
| `frontend/src/components/ui/CurrencyInput.tsx` | crear |
| `frontend/src/components/settings/ItemInventarioForm.tsx` | edit (schema, defaultValues, inputs monetarios) |

No hay migración. No se toca `crud.service.js` (ya tiene la lógica de `useSoftDelete`).

---

## Verificación end-to-end

1. `cd frontend && npx tsc --noEmit` debe pasar limpio.
2. `cd backend && npm test` debe seguir en 89/89.
3. Push a `develop` → GitHub Actions deploya a `test.boveda.lols.cl`.
4. En staging, tab Configuración → Inventario → Ítems:
   - Crear ítem con Valor Compra `$14.000` → verificar en la tabla que muestra `$14.000` (no `$14`).
   - Editar ese ítem → el input debe mostrar `$14.000` (no `14,00000` ni `14`).
   - Cambiar a `$25.500` y guardar → verificar persistencia refrescando la página.
   - Eliminar otro ítem → la fila debe desaparecer inmediatamente sin recargar.
5. Revisar Network tab en DevTools: el PUT debe enviar `valor_compra: 14000` (número entero), no `"14.000"` string.

---

## Continuidad cross-máquina

El usuario pidió subir el plan a GitHub para retomar en otra máquina. Al aprobar y salir de plan mode, primer paso de la ejecución será:

1. Copiar este archivo a `docs/plans/2026-04-17-inventario-items-bugs.md` dentro del repo.
2. Commit con mensaje `docs: plan de fix para bugs de items inventario` directamente en `develop` (branch habitual del workflow).
3. Push a `origin/develop` para que esté disponible al abrir la otra máquina.
4. Luego ejecutar los 4 cambios arriba, test, commit, push.

---

## Fuera de alcance (mencionar al usuario)

- El mismo bug #1 afecta `bodegas`, `categorias-inventario`, `obras`, `empresas`, etc. — ninguna tiene `useSoftDelete: true`. Soft-deletes quedan visibles en sus listas. Debería abordarse en PR separado con testing de cada módulo.
- Los otros archivos con `toLocaleString('es-CL')` ad-hoc podrían migrarse a `formatCLP()` una vez creado — refactor de calidad, no bloqueante.
