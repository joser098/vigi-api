const express = require("express");
const cors = require("cors");
const router = require("./routes/index");
const whitelist = require("./utils/whitelist");

//Server
const app = express();

//Middlewares
// app.use(
//   cors({
//     origin: (origin, callback) => {
//       if (whitelist.includes(origin) || !origin) {
//         return callback(null, true);
//       }

//       return callback(new Error("Not allowed by CORS"));
//     },
//   })
// );

// app.options('/api', cors());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (whitelist.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  next();
});


app.disable("x-powered-by");
app.use(express.json());

//Router
app.use("/api", router);

module.exports = app;
