const express = require("express");
const cors = require("cors");
const { join } = require('path');
const router = require("./routes/index");
const whitelist = require("./utils/whitelist");

//Server
const app = express();

//Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      if (whitelist.includes(origin) || !origin) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    }
  })
);

app.options('/api*', cors());

// Colapsa las barras repetidas ANTES del router.
//
// No es cosmética: `MP_BACK_URL` tenía una barra al final, así que las URLs
// quedaron como `//api/payment/webhook` y Express devolvía 404 en cada
// notificación de Mercado Pago. El armado de URLs ya está arreglado
// (utils/urls.js), pero las preferencias que YA salieron llevan la URL vieja
// congelada adentro y van a seguir golpeando acá por meses. Esto las atiende.
app.use((req, _res, next) => {
  const [ruta, query] = req.url.split("?");
  const limpia = ruta.replace(/\/{2,}/g, "/");

  if (limpia !== ruta) {
    console.warn(`[url] barras repetidas: ${ruta} -> ${limpia}`);
    req.url = query ? `${limpia}?${query}` : limpia;
  }

  next();
});

app.disable("x-powered-by");
app.use(express.json());
app.use('/public', express.static(join(__dirname, '../uploads')))

//Router
app.use("/api", router);

module.exports = app;
