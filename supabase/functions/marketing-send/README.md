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
  MARKETING_FROM="VIGI <novedades@tu-dominio.com>" \
  CLIENT_URL=https://www.vigi.cam
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya las inyecta
Supabase sola.

**El dominio de `MARKETING_FROM` tiene que estar verificado en Resend.** Sin eso
Resend rechaza el envío. Conviene que sea un dominio o subdominio distinto del
transaccional (`EMAIL_DOMAIN` de la API): si una campaña de marketing se gana
una mala reputación, no se lleva puestos los mails de confirmación de compra.

## Cómo decide a quién le manda

1. Todos los `marketing_contacts` con `is_subscribed = true`.
2. Menos los que ya tienen una fila en `marketing_sends` para esa campaña.

Ese segundo filtro es lo que hace que reintentar una campaña que falló a la
mitad sea seguro: los que ya la recibieron no la reciben de nuevo.

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
