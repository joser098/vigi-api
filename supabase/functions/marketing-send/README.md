# marketing-send

Envía una campaña de email marketing a los contactos suscriptos, vía Unitpost
(con Resend de desborde).

La llama el panel (`vigi-admin`, sección **Email**). Corre en servidor porque las
API keys no pueden estar en el bundle del navegador — el mismo motivo
que `product-images` y `meli-price`.

## Desplegar

```bash
npx supabase functions deploy marketing-send --project-ref gqpoxkuzmygrmhltubyp

npx supabase secrets set \
  UNITPOST_API_KEY=up_xxx \
  RESEND_API_KEY=re_xxx \
  MARKETING_FROM="hola@novedades.vigi.com.ar" \
  RESEND_MARKETING_FROM="novedades@notification.vigi.com.ar" \
  CLIENT_URL=https://vigi.com.ar
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya las inyecta
Supabase sola.

**El dominio de `MARKETING_FROM` tiene que estar verificado en Unitpost.** Los
mails que desbordan a Resend salen desde `RESEND_MARKETING_FROM` (por ejemplo
`novedades@notification.vigi.com.ar`), que tiene que ser del dominio verificado
en Resend: el plan gratuito admite uno solo. Sin ese secreto se usa
`MARKETING_FROM`, y Resend rechaza el envío si ese dominio no es el suyo.

Por eso el marketing de Unitpost sale de un subdominio propio
(`novedades.vigi.com.ar`), distinto del transaccional (`notification.`): si una
campaña se gana una mala reputación, no se lleva puestos los mails de
confirmación de compra.

## El nombre del remitente

`MARKETING_FROM` puede ser la dirección sola o venir con nombre
(`Vigi <marketing@…>`). **El nombre para mostrar lo pone la campaña**, en
`from_name`, y la function arma la cabecera:

```
"Vigi" <marketing@notification.vigi.com.ar>
```

Importa: sin nombre, la bandeja de entrada muestra la parte de antes del arroba
—**marketing**—, que no le dice nada a quien lo recibe. El orden es
`from_name` de la campaña → el nombre que traiga el secreto → `Vigi`.

## Cómo decide a quién le manda

1. Todos los `marketing_contacts` con `is_subscribed = true`.
2. Menos los que ya tienen una fila en `marketing_sends` para esa campaña.
3. De esos, los primeros `limit` (todo lo que entre hoy si el panel no dice otra
   cosa), y nunca más de los que quedan de la cuota del día.

El segundo filtro es lo que hace que reintentar una campaña que falló a la mitad
sea seguro, y lo que sostiene el envío por tandas: los que ya la recibieron no
la reciben de nuevo, ni hoy ni mañana.

Las dos consultas van **por páginas de mil**. PostgREST corta ahí y no avisa:
con 1200 contactos, una consulta común devuelve 1000 y parece completa. Serían
dos cosas silenciosas y feas —no mandarle nunca a la cola de la lista, y leer
una lista incompleta de "ya enviados" y escribirle dos veces a la misma gente—.

## Proveedores y cuotas

El marketing sale por **Unitpost** y usa **Resend** solo como desborde. Resend
queda para lo transaccional de `vigi-api` (confirmaciones de compra), que sale
con la misma `RESEND_API_KEY`.

| | Plan gratuito | Lo que usan las campañas |
|---|---|---|
| Unitpost | 200/día, 5000/mes, corte duro | 195/día (5 de colchón para pruebas), hasta 4995/mes |
| Resend | 100/día, 3000/mes | 60/día; los otros 40 quedan para los mails de compra |

Son unos **255 mails de campaña por día**. En cada tanda salen primero por
Unitpost y, cuando se le acaba el cupo del día (o del mes), el resto por Resend.

- Cada fila de `marketing_sends` guarda `provider`. La function cuenta los
  `sent` por proveedor desde la medianoche **UTC** (y desde el primer día del
  mes, en Unitpost) y recorta la tanda a lo que quede. Sin cupo devuelve 429.
- Las pruebas salen por Unitpost y no dejan fila: para eso es el colchón.
- El plan gratuito de Unitpost agrega su marca en el pie de los mails.
- Sin `UNITPOST_API_KEY` todo sale por Resend, con el tope de 60 por día.
- Una campaña a medio mandar queda en **`sending`**, no en `sent`, y sin
  `sent_at`. Si se marcara como enviada, la tanda de mañana no tendría dónde
  volver. Pasa a `sent` recién cuando no queda nadie pendiente.

La respuesta trae `sent`, `failed`, `remaining`, `done` y `sent_today`: es lo que
el panel usa para pintar cuántos faltan.

## Autorización

Con el token del usuario, no con `service_role`: la consulta a `admin_users`
pasa por RLS y la whitelist sigue siendo la única fuente de verdad. Sin sesión
de admin devuelve 403.

La `service_role` se usa solo para escribir `marketing_sends` y los contadores
de la campaña, que el panel no puede escribir a propósito: si pudiera marcar una
campaña como "enviada" sin haber mandado nada, el registro no serviría.

## Modo prueba

Con `test_email` manda una sola copia a esa dirección y no toca ni la lista ni
el estado de la campaña. El panel obliga a hacerlo antes de habilitar el envío
real: un HTML que se ve bien en la preview se puede ver roto en Gmail, y del
otro lado hay gente real.

## Baja

Cada mail lleva un link de baja con un token propio del contacto
(`unsubscribe_token`), no el email en la query string — una URL con el mail
adentro se filtra en logs, referers y proxies.

Si el HTML trae `{{unsubscribe}}` el link va ahí; si no, se agrega un pie al
final. **Una campaña sin forma de darse de baja no se manda.**

El link va a `/baja` en la tienda, que muestra un botón de confirmación y recién
ahí pega contra `POST /api/marketing/unsubscribe`. Es a propósito: los
antivirus y los prefetchers de los clientes de correo siguen los links de un
mail, y con una baja por GET terminarías dando de baja a gente que nunca hizo
clic.

La baja no borra la fila, la marca. Un contacto borrado volvería a entrar en la
próxima importación y recibiría justo lo que pidió no recibir.
