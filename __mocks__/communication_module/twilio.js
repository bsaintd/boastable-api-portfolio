const twilio = require('communication_module/twilio');
twilio.sendSMS = (req, res, next) => {
  next();
};
twilio.sendSurveyTo = () =>  (req, res, next) => {
  next();
};
twilio.sendDemoSurveyTo = () =>  (req, res, next) => {
  next();
};
module.exports = twilio;