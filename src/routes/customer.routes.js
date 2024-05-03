const multer = require("multer");
const fs = require("fs");
const registerCustomer = require("../handlers/Customer/registerCustomer.handler");
const getCustomer = require("../handlers/Customer/getCustomer.handler");
const login = require("../handlers/Customer/login.handler");
const updateCustomer = require("../handlers/Customer/updateCustomer.handler");

const userAuth = require("../middlewares/userAuth");
const uploadProfileImage = require("../handlers/Customer/uploadProfileImage.handler");
const updateFavorite = require("../handlers/Customer/updateFavorite.handler");
const getFavorites = require("../handlers/Customer/getFavorites.handler");
const validateCustomerEmail = require("../handlers/Customer/validateCustomerEmail.handler");
const forgorPassword = require("../handlers/Customer/forgotPassword.handler");
const newPassword = require("../handlers/Customer/newPassword.handler");

const customerRouter = require("express").Router();

//Multer Config
const mimetypes = ['image/png', 'image/jpeg', 'image/jpg']
const fileFilterfn = (req, file, cb) => {
  if(mimetypes.includes(file.mimetype)){
    return cb(null, true)
  } else {
    cb(`Error:Only ${mimetypes.join(" ")} mimetypes are allowed`, false)
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadFolder = "uploads";

    if (!fs.existsSync(uploadFolder)) {
      fs.mkdirSync(uploadFolder);
    }

    cb(null, uploadFolder);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname.split(" ").join(""));
  },
});

const upload = multer({ storage: storage, fileFilter: fileFilterfn });

customerRouter.post("/", registerCustomer);
customerRouter.get("/", userAuth, getCustomer);
customerRouter.post("/login", login);
customerRouter.patch("/", userAuth, updateCustomer);
customerRouter.put("/favorite",userAuth, updateFavorite);
customerRouter.get("/favorite", userAuth, getFavorites);
customerRouter.get("/verification/:hash", validateCustomerEmail);
customerRouter.post("/forgot-password", forgorPassword);
customerRouter.patch("/new-password/:hash", newPassword);



customerRouter.post("/image", userAuth, upload.single("file"), uploadProfileImage);

module.exports = customerRouter;
