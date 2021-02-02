const middleware = require('communication_module/middleware');
middleware.send = (req, res, next) => {
  next();
};
middleware.surveyEmail = () => (req, res, next) => {
  next();
};
module.exports = middleware;
