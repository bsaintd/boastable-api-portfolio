/**
 * ANSWERS routes
 * @exports an express router
 * Answers wrap Questions and are linked to a particular Customer and a particular User
 */
var _ = require("lodash"),
  router = require("express").Router(),
  mongoose = require('mongoose'),
  { CrudFactory,
    Manipulate,
    SendFunctions }     = require("utilities_middleware"),
  Answers               = CrudFactory(mongoose.model('Answer')),
  Questions             = CrudFactory(mongoose.model('Question')),
  Surveys               = CrudFactory(mongoose.model('Survey')),
  { sendData, sendOk }  = SendFunctions,
  { move, clear }       = Manipulate,
  { permitRoles } = require("auth_module/middleware"),
  { adminAllClientSelf } = require(process.cwd() + '/utils/sequences'),
  Validations = require(process.cwd() + '/utils/validations');

/**
 * @function get a customer's answer to a particular question
 * Role restrictions:
 * - admin can search all answers
 * - client can search answers directed at their business only
 * @param req.query     customer, user, question are ids in the answer document, all searchable
 */
router.get(
  `/answer`,
  adminAllClientSelf("query.auth"),
  Answers.read(),
  sendData
);

/**
 * @function queries a list of answers
 * Role restrictions:
 * - admin can search all answers
 * - client can search answers directed at their business only
 * @param req.query     customer, user, question are ids in the answer document, all searchable
 */
router.get(
  `/answer/list`,
  adminAllClientSelf("query.auth"),
  Answers.list,
  sendData
);

/**
 * @function create an answer to a question, and upvotes that question
 * Role restrictions:
 * - guests are the only user type who create question answers
 * @param req.body.question the id of the question being asked
 * @param req.body.survey   the survey it's associated with (shortid string)
 * @param req.body.auth     the business allowed to see the answer
 * @param req.body.answer   a boolean value
 */
router.post(
  `/answer`,
  permitRoles("admin"),
  Answers.createTo('answer'),
  move("body.survey", "query.shortid"),
  clear('body'),
  move("answer._id", "body.answers"),
  Surveys.addToSet,
  move("answer.question", "query._id"),
  (req, res, next) => {
    if (req.answer.value) {
      req.body = { upvotes: 1 };
    } else {
      req.body = { downvotes: 1 };
    }
    next();
  },
  Questions.increment,
  sendOk
);

/**
 * @function updating answers
 * Role restrictions:
 * - admin only because once an answer is created it doesn't seem to make sense to modify it
 * @param req.query         the id of the answer, or the customer and question
 * @param req.body.question the id of the question being asked
 * @param req.body.customer the customer who created it
 * @param req.body.user     the business allowed to see the answer
 * @param req.body.answer   a boolean value
 */
router.put(
  `/answer`,
  Answers.readTo('answer'),
  Validations.stopIfTrue((req) => req.answer.value === true || req.answer.value === false, null, 208),
  Answers.update,
  clear("query"),
  move("data.question", "query._id"),
  Validations.incrementVotes,
  Questions.increment,
  sendOk
);

/**
 * @function delete answer
 * Role restrictions:
 * - admin only because it doesn't make sense to delete answers in regular scenarios
 * @param req.query         the id of the answer, or the customer and question
 */
router.delete(`/answer`,
  permitRoles("admin"),
  Answers.remove(),
  sendData);

module.exports = function(app) {
  app.use(router);
};
