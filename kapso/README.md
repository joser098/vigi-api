# WhatsApp (Kapso)

Atención por WhatsApp de VIGI en el +54 9 11 2603-9243 (proyecto "ORA Studio"
de Kapso, cuenta josejaramillo098@gmail.com).

Es un canal de **confianza y soporte, no de ventas**: no hay agente de IA, al
cliente siempre se le dan opciones, y toda compra se hace en la web.

| Carpeta | Qué es |
|---|---|
| `workflows/vigi-atencion/workflow.js` | El workflow. `definition.json` y `workflow.yaml` se generan con `kapso build`: no editarlos a mano |
| `functions/vigi-entrada` | Primer paso: menú, consulta desde la ficha de un producto, o botón de una charla anterior |
| `functions/vigi-ruteo` | Decide de cada pregunta: lee el botón tocado y devuelve el camino |
| `functions/vigi-recomendar` | "Ayuda para elegir": mismo asistente que el home, vía `/api/search/recommend` |
| `functions/vigi-acordar` | "Acordar envío de compra": valida el número de pedido con `/api/order/acordar/:id` y pasa a una persona |

Los textos (envíos, pagos, garantía, pedidos) salen de `vigi-app`: preguntas
frecuentes, "Formas de entrega" y `/legales/devoluciones`. **Si cambia una
política en la web, cambia acá.**

## Comandos

```bash
npm install
npx kapso login          # con la cuenta de VIGI, no la de CUT
npx kapso link --project 196cc507-2bfa-43e1-95ce-08cffea5324a
npx kapso build          # workflow.js → definition.json (valida)
npx kapso push --dry-run
npx kapso push
```

El workflow está **activo**. `status` en `workflow.js` tiene que coincidir con
el del panel: si lo activás o pausás allá, cambialo acá. Antes de un push, si
`kapso push` dice que el remoto cambió, revisá con `kapso pull --diff`: el
panel reescribe el JSON con valores por defecto aunque no se haya tocado nada.

## Acordar el envío

Cuando el cliente elige "acordar el envío" en el checkout, paga solo los
productos y tiene que escribir acá: menú → "Acordar envío de compra" → número
de pedido. Si el pedido es de acordar, la charla pasa a una persona (handoff
`acordar_envio`) para coordinar punto, día y horario en CABA. El mail de
compra trae un link que manda `Hola! Quiero acordar el envío de mi pedido <id>`
(`vigi-api/src/utils/whatsapp.js`) y `vigi-entrada` lo lleva directo a la
validación. Condiciones: `vigi-app` `/legales/envios#acordar`.

## Consultas desde la web

`vigi-entrada` reconoce el mensaje armado `Hola! Tengo una consulta sobre el
producto <modelo>` y responde con el nombre, el precio y el link. El botón de
WhatsApp de la ficha en `vigi-app` tiene que mandar exactamente ese texto.
