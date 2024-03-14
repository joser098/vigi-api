const express = require("express");
const cors = require("cors");
const router = require("./routes/index");
const whitelist = require("./utils/whitelist");

//Server
const app = express();

//Middlewares
app.use(cors({origin: "*"}));
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
app.disable("x-powered-by");
app.use(express.json());

//Router
app.use("/api", router);

module.exports = app;
