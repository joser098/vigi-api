# Pendientes tras la migración a Postgres

La migración está completa: no queda ningún acceso a MongoDB en `src/`. Lo que
sigue son cabos sueltos, ordenados por lo que más duele.

## Bloquea la vuelta a producción

### El catálogo está vacío
`products`, `carrusel_images` y `categories` (más allá de las 5 sembradas) no
tienen datos. Sin catálogo no hay nada que vender.

Al cargar hay que respetar dos cosas:
- **`power_type` normalizado**: minúscula y sin acento. Cargar `"Batería"` hace
  que el facet devuelva vacío, sin ningún error.
- **`categories` primero**: `products.category` tiene foreign key.

### `search.routes.test.js` está atado a datos que ya no existen
Usa ObjectIds fijos (`659db95d1d04b9bcf9986030`), el modelo `"C1C"` y cantidades
esperadas de productos. Además espera que `getProduct?model=` devuelva un
**array**, cuando el código devuelve un objeto — esa expectativa quedó de una
implementación anterior a la actual, no la introdujo la migración.

Hay que reescribirlo una vez cargado el catálogo.

## Deuda menor

| Dónde | Qué |
|---|---|
| `services/zod_schemas/cart_addProduct.schema.js` | Sigue exigiendo `products_total` y `amount_to_pay`, que el repositorio ignora y calcula en SQL. Sacarlos del schema. |
| `services/zod_schemas/cart_addProduct.schema.js` | `id` se valida con `min(24)`, largo de un ObjectId. Debería ser chequeo de uuid. |
| `customers.has_order_active` | Se pone en `true` al crear una orden y nunca vuelve a `false`. `order_statuses.is_terminal` ya marca `entregado` como final: falta usarlo. |

## Entorno

`.env.test` todavía tiene las variables de Mongo y **no define `DATABASE_URL`**,
así que los tests caen a `.env` y corren contra la misma base que la app. Con la
base vacía el riesgo es bajo, pero conviene un proyecto o schema aparte para
tests antes de que haya datos reales.
