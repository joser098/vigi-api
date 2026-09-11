# marketing-send

Envía una campaña de email marketing a los contactos suscriptos, vía Resend.

La llama el panel (`vigi-admin`, sección **Email**). Corre en servidor porque la
API key de Resend no puede estar en el bundle del navegador — el mismo motivo
que `product-images` y `meli-price`.

## Desplegar

```bash
npx supabase functions deploy marketing-send --project-ref gqpoxkuzmygrmhltubyp

npx supabase secrets set \
  RESEND_API_KEY=re_xxx \
  MARKETING_FROM="marketing@notification.vigi.com.ar" \
  CLIENT_URL=https://vigi.com.ar
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya las inyecta
Supabase sola.

**El dominio de `MARKETING_FROM` tiene que estar verificado en Resend.** Sin eso
Resend rechaza el envío. Conviene que sea un dominio o subdominio distinto del
transaccional (`EMAIL_DOMAIN` de la API): si una campaña de marketing se gana
una mala reputación, no se lleva puestos los mails de confirmación de compra.

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
3. De esos, los primeros `limit` (85 si el panel no dice otra cosa), y nunca más
   de los que quedan de la cuota del día.

El segundo filtro es lo que hace que reintentar una campaña que falló a la mitad
sea seguro, y lo que sostiene el envío por tandas: los que ya la recibieron no
la reciben de nuevo, ni hoy ni mañana.

Las dos consultas van **por páginas de mil**. PostgREST corta ahí y no avisa:
con 1200 contactos, una consulta común devuelve 1000 y parece completa. Serían
dos cosas silenciosas y feas —no mandarle nunca a la cola de la lista, y leer
una lista incompleta de "ya enviados" y escribirle dos veces a la misma gente—.

## Tandas y cuota diaria

El plan gratuito de Resend son **100 mails por día**, y los comparte con los
transaccionales de `vigi-api`, que salen con la misma `RESEND_API_KEY`. Por eso:

- La tanda por defecto son **85**. Los 15 que quedan son el colchón para las
  confirmaciones de compra del día y para las pruebas, que también descuentan de
  la cuota y no dejan fila en `marketing_sends`.
- Antes de mandar, la function cuenta los `marketing_sends` con `status = 'sent'`
  desde la medianoche **UTC**, que es cuando Resend reinicia la cuenta, y recorta
  la tanda a lo que quede. Con la cuota agotada devuelve 409 con cuántos faltan.
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
