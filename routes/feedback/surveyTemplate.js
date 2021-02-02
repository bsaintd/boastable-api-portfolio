/**
 * SURVEY TEMPLATE
 * @exports an express router
 * For each client there is 1 survey template.
 * It indicates the client's preferences about how they would like
 * surveys to be conducted.
 */
var router = require("express").Router(),
  mongoose = require("mongoose"),
  { CrudFactory, SendFunctions } = require("utilities_middleware"),
  { permitRoles } = require("auth_module/middleware"),
  SurveyTemplates = CrudFactory(mongoose.model("SurveyTemplate")),
  { send, sendOk } = SendFunctions,
  { adminAllClientSelf } = require(process.cwd() + '/utils/sequences'),
  _ = require('lodash');

router.get(
  "/survey-template",
  adminAllClientSelf("query.auth"),
  SurveyTemplates.readTo("surveyTemplate"),
  send('surveyTemplate')
);

router.post(
  "/survey-template",
  adminAllClientSelf("body.auth"),
  SurveyTemplates.create(),
  send("data")
);

router.put(
  "/survey-template",
  adminAllClientSelf("query.auth"),
  SurveyTemplates.update,
  sendOk
);

router.delete(
  "/survey-template",
  permitRoles('admin'),
  SurveyTemplates.remove(),
  sendOk
);

module.exports = function(app){
  app.use(router);
}