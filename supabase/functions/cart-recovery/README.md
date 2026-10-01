# cart-recovery

Manda los mails de carrito abandonado. Corre cada hora por cron y se maneja
desde el panel (`vigi-admin`, sección **Carritos**).

| Paso | Cuándo (por defecto) | Qué dice |
|---|---|---|
| 1 | 2 h sin tocar el carrito | "Tu carrito sigue acá", con los productos |
| 2 | 24 h | Beneficios: tranquilidad, garantía, despacho en el día, pago protegido |
| 3 | 72 h | Cupón **personal** de un solo uso, válido 48 h |

Entre un mail y el siguiente pasan al menos 12 h. Si el cliente toca el
carrito, la secuencia arranca de cero. Si compra, se corta.

## El cupón

El porcentaje no es fijo: lo calcula `cart_recovery_quote()` (migración 0021)
contra el costo de lo que hay en el carrito, para que la ganancia neta después
del descuento y de la comisión de la pasarela no baje de
`min_net_margin_pct`. El tope es `max_discount_pct`. Si no llega a
`min_discount_pct`, o si hay productos sin costo cargado, el tercer mail no
sale.

El cupón queda atado al cliente (`coupons.customer_id`): para cualquier otro
es como si no existiera. Tiene un tope en pesos igual al descuento cotizado y
una compra mínima del 90% del carrito, así que sacar el producto con más
margen no deja aplicar el porcentaje a lo que queda. Un cliente recibe como
mucho un cupón de recupero cada `coupon_cooldown_days`.

## Cuota

Comparte la cuota diaria con las campañas (bloque "Proveedores y cuota",
copiado igual en las dos functions, y vista `email_quota_sends`). Además tiene su propio tope, `daily_limit`. Si no hay
cuota, los mails quedan para la próxima corrida.

## Desplegar

```bash
npx supabase functions deploy cart-recovery --project-ref gqpoxkuzmygrmhltubyp

# Usa los mismos secretos que marketing-send, más uno propio para el cron:
npx supabase secrets set CART_RECOVERY_SECRET=$(openssl rand -hex 24)
```

`marketing-send` también se tiene que volver a desplegar: ahora lee la cuota de
`email_quota_sends`. Las dos se pueden desplegar pegando su `index.ts` en el
dashboard: no dependen de ningún otro archivo.

## Cron

En el SQL editor de Supabase, con `pg_cron` y `pg_net` habilitados
(Database → Extensions). El secreto se guarda en Vault para no dejarlo
escrito en `cron.job`:

```sql
select vault.create_secret('<CART_RECOVERY_SECRET>', 'cart_recovery_secret');
select vault.create_secret('<ANON_KEY>',             'cart_recovery_anon_key');

select cron.schedule(
  'cart-recovery',
  '15 * * * *',   -- cada hora, a los 15 minutos
  $$
  select net.http_post(
    url     := 'https://gqpoxkuzmygrmhltubyp.supabase.co/functions/v1/cart-recovery',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cart_recovery_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cart_recovery_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

La anon key va en `Authorization` solo para pasar la verificación de JWT del
gateway de Supabase. Lo que autoriza la corrida es `x-cron-secret`.

El cron puede quedar corriendo con el recupero apagado: si
`cart_recovery_settings.is_active` es `false`, la function no manda nada.

## Llamadas desde el panel

| Body | Qué hace |
|---|---|
| `{ "action": "run" }` | lo mismo que el cron |
| `{ "action": "preview", "step": 1 }` | devuelve `{ subject, html }`, no manda nada |
| `{ "action": "test", "step": 3, "email": "..." }` | manda ese paso a una dirección, con un cupón de ejemplo que no existe |

La vista previa y la prueba usan el carrito abierto más caro, o uno de
ejemplo si no hay ninguno.
