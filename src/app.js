const express = require("express");
// const cors = require("cors");
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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});

app.disable("x-powered-by");
app.use(express.json());

//Router
app.use("/api", router);

module.exports = app;
