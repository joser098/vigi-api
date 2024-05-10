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

app.disable("x-powered-by");
app.use(express.json());
app.use('/public', express.static(join(__dirname, '../uploads')))

//Router
app.use("/api", router);

module.exports = app;
