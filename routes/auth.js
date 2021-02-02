var mongoose = require("mongoose"),
  Auth = require("auth_module/middleware"),
  router = require("express").Router(),
  { Validations } = require(process.cwd() + '/utils'),
  Communications = require("communication_module/middleware"),
  { CrudFactory, SendFunctions, Manipulate } = require("utilities_middleware"),
  Auths = CrudFactory(mongoose.model('Auth')),
  PasswordResetRequests = CrudFactory(mongoose.model('PasswordResetRequest')),
  { sendData, sendOk } = SendFunctions,
  { move, clear } = Manipulate,
  { permitRoles } = require("auth_module/middleware");

/**
 * @function logs a user in
 */
router.post('/login',
    Auth.login,
    sendData);

/**
 * @function sends a reset password email to a user
 * @requires must be signed out, so role will be "guest"
 * @param req.query.email    must be a valid email address in our system
 */
router.post('/reset-password',
  permitRoles("guest"),
  PasswordResetRequests.create(),
  Communications.resetPasswordSetup,
  Communications.send,
  sendOk)

router.put('/reset-password',
  PasswordResetRequests.read(),
  clear('query'),
  move('data.email', 'query.email'),
  Validations.passwordRequirements('body.password'),
  Auths.updateBySave,
  sendData
);

/**
 * @function allows for the abitrary creation of an Auth document (admin only)
 * @param req.body.email
 * @param req.body.password
 * @param req.body.role
 */
router.post("/auth",
  permitRoles("admin"),
  Auths.create(),
  sendData);

/**
 * @function allows viewing Auth document details. A regular client has no
 * reason to do this, and it doesn't typically fit into the workflow of the app and is
 * restricted to admin only.
 * @param req.query._id
 */
router.get('/auth',
  permitRoles("admin"),
  Auths.read(),
  sendData);

/**
 * @function allows listing all the Auth documents. A regular client has no
 * reason to do this, and it typically fit into the workflow of the app and is
 * restricted to admin only.
 * @param query   able to query for anything in document (email, role, _id)
 */
router.get('/auth/list',
  permitRoles("admin"),
  Auths.list,
  sendData);

/**
 * @function updates an Auth document. Admin only
 * @param     req.query         query for email or _id, role or password won't be meaningful
 * @param     req.body          update email or password here
 */
router.put('/auth',
  permitRoles("admin"),
  Auths.update,
  sendData);

/**
 * @function deletes an Auth document. Admin only
 * @param   req.query     query for an _id or email
 */
router.delete('/auth',
  permitRoles("admin"),
  Auths.remove(),
  sendData);

module.exports = function (app) {
  app.use(router);
}