/**
 * QUESTIONS
 * @exports an express router
 * Questions are created by a User, and they are viewed and answered by Customers
 * Upvotes and downvotes are added to questions
 */
var _ = require("lodash"),
  router = require("express").Router(),
  mongoose = require('mongoose'),
  { CrudFactory, SendFunctions, Manipulate } = require("utilities_middleware");
  Questions = CrudFactory(mongoose.model("Question")),
  { sendData, sendOk } = SendFunctions,
  { setToAuthId, set } = Manipulate,
  { runIfRoles } = require("auth_module/middleware"),
  { adminAllClientSelf } = require(process.cwd() + '/utils/sequences');

/**
 * @function gets a question
 * role restrictions:
 * - admin can see all
 * - client sees questions they created
 * @param req.query.*     query by any key on document
 */
router.get(
  `/question`,
  runIfRoles(["client"],
  setToAuthId('query.auth')),
  Questions.read(),
  sendData);

/**
 * @function lists questions
 * role restrictions:
 * - admin can see all
 * - client sees questions they created
 * @param req.query.*     query by any key on document
 */
router.get(
  `/question/list`,
  runIfRoles(["client"], setToAuthId("query.auth")),
  runIfRoles(["client"], set('query.active', true)),
  Questions.list,
  sendData
);

/**
 * @function create question
 * role restrictions:
 * - admin can create anywhere
 * - client creates questions for their own account only
 * @param req.body.user     business that owns the question
 * @param req.body.question question to ask customers
 */
router.post(
  `/question`,
  adminAllClientSelf("body.auth"),
  Questions.create(),
  sendData
);

/**
 * @function change question
 * role restrictions:
 * - admin can change anything
 * - client can change own questions
 * @param req.query.*       query by any key
 * @param req.body.user     business that owns the question
 * @param req.body.question question to ask customers
 */
router.put(
  `/question`,
  adminAllClientSelf("query.auth"),
  Questions.update,
  sendData
);

/**
 * @function delete question
 * role restrictions:
 * - admin can see all
 * - client can delete own questions
 * @param req.query.*     query by any key on document
 */
router.delete(
  `/question`,
  adminAllClientSelf("query.auth"),
  set('body.active', false),
  Questions.update,
  sendOk
);

/**
 * @function delete question
 * role restrictions:
 * - admin can see all
 * - client can delete own questions
 * @param req.query.*     query by any key on document
 */
router.delete(
  `/question/all`,
  adminAllClientSelf("query.auth"),
  Questions.removeAll,
  sendOk
);

module.exports = function(app) {
  app.use(router);
};
