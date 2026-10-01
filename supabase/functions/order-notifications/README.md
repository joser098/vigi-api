# order-notifications

Cambia el estado de un pedido y le manda el mail al cliente. La usa el
detalle de la orden en `vigi-admin`: al elegir un estado se abre un modal de
confirmación con la casilla **"Mandarle un mail al cliente"** y un botón para
ver el mail. Al confirmar, esta function cambia el estado y manda el mail en
el momento. Sin cron ni cola: el modal es la protección contra un error.

| Estado | Mail |
|---|---|
| En preparación | no: ya sale la confirmación de compra de vigi-api |
| **En camino** (`enviado`) | empresa y número de seguimiento, botón "Seguir mi envío" si hay link, plazos |
| **Entregado** | gracias, garantía, ayuda por WhatsApp |
| **Cancelado** | aviso, y que la devolución se avisa aparte |
| **Reembolsado** | monto reintegrado y plazos del banco |

Cada mail queda en `order_notifications` (migración `0025`), con el error si
falló. Si el mail falla, el estado igual cambia: el panel avisa y deja
reenviarlo.

Sale por Resend, como la confirmación de compra: es transaccional y usa la
reserva diaria que el marketing deja libre (ver `cart-recovery`).

## Desplegar

```bash
npx supabase functions deploy order-notifications --project-ref gqpoxkuzmygrmhltubyp
npx supabase secrets set ORDER_EMAIL_FROM='Vigi <noreply@notification.vigi.com.ar>'
```

`RESEND_API_KEY` y `CLIENT_URL` ya existen (los usan las otras functions).
`ORDER_EMAIL_FROM` tiene que ser de un dominio verificado en Resend.

## Acciones

Todas con el token de un admin.

| Body | Qué hace |
|---|---|
| `{ "action": "change_status", "order_id", "status", "notify": true }` | cambia el estado y, si corresponde, manda el mail. Con el mismo estado sirve para reenviarlo |
| `{ "action": "preview", "status", "order_id"? }` | devuelve `{ subject, html }`, no manda nada |
| `{ "action": "test", "status", "email", "order_id"? }` | lo manda a esa dirección, con `[Prueba]` en el asunto |

Sin `order_id`, `preview` y `test` usan un pedido de ejemplo.
