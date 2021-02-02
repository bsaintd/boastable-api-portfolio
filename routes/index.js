/**
 * @description registers all the mongoose models before routes are defined
 */
require('stripe_integration/model');
require('auth_module/model');
require("auth_module/passwordResetRequestModel")
require('user_module/model');
require('feedback_module/action');
require('feedback_module/answer');
require('feedback_module/customer');
require('feedback_module/question');
require('feedback_module/survey');
require('feedback_module/surveyTemplate');
/*=====================================
  Init
=======================================*/
 var routers = [
  require("auth_module/router"),
  require("./auth"),
  require("./user"),
  require("./membership"),
  require("./stripe"),
  require("./communication"),
  require("./feedback/actions"),
  require("./feedback/customers"),
  require("./feedback/questions"),
  require("./feedback/survey"),
  require("./feedback/answers"),
  require("./feedback/surveyTemplate"),
  require("./graphql")];

/*=====================================
   Exports
=======================================*/
/**
 * Routes Module
 * @param  {[app]}
 * @return  bundles routes to deliver to app
 */

module.exports = function(app) {
  routers.map(router => {
    router(app);
  });
}
