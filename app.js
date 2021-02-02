const { PORT, NODE_ENV } = process.env;
if(!PORT){
  throw new Error('PORT not defined');
}
if(!NODE_ENV){
  throw new Error('NODE_ENV not defined');
}
/*=====================================
Init
=======================================*/
/* ----- Dependencies ----- */
const path = require("path");

const express = require("express");
const app = express();
const cors = require("cors");
const bodyParser = require("body-parser");
const routes = require(path.resolve(__dirname, "routes"));
const expressValidator = require("express-validator");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const swaggerDocument = YAML.load(path.resolve(__dirname, "swagger.yaml"));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// establish connection with mongo
require(path.resolve(__dirname, "db"));

/*=====================================
  Setup
=======================================*/

app.use(cors());
app.use(bodyParser.json());
app.use(expressValidator());
app.use(bodyParser.urlencoded({ extended: true }));

routes(app);

/**
 * start all the repetitive tasks
 */
require(path.resolve(__dirname, "cronjobs"));

/**
 * declare the location of the frontend app to be a static directory
 * to be tried after all other routes
 */
app.get("/", (req, res) => {
  res.json({message: "Boastable API responding successfully"});
})

app.use(function(err, req, res, next) {
  res.status(res.statusCode || 500).json({ message: err.message });
});

app.use(function(req, res, next) {
  res.status(404).json({ message: "Not found" });
});

if (NODE_ENV !== "test") {
  app.listen(PORT, function() {
    console.log(`App listenting on port ${PORT}`);
  });
}

module.exports = app;
