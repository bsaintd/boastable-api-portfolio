var
    _ = require('lodash'),
    router = require('express').Router(),
    twilio = require('communication_module/twilio'),
    Communications = require("communication_module/middleware"),
    { sendData, sendOk } = require('utilities_middleware/send'),
    { permitRoles } = require('auth_module/middleware');


/**
 * @function sends a client comment to the boastable support email address
 * @param req.query.email    must be a valid email address in our system
 */
router.post('/comment',
  permitRoles("client"),
  Communications.commentEmailSetup,
  Communications.send,
  sendOk);

/**
 * @function sends an SMS from the configured twilio phone number
 * @param req.body.message       a string of message text
 * @param req.body.to            the receiving phone number
 */
router.post('/sms',
  permitRoles(["admin", "client"]),
  twilio.sendSMS,
  sendData);

module.exports = function(app){
  app.use(router);
}
