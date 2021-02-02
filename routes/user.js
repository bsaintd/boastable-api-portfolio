var mongoose = require('mongoose'),
  router = require("express").Router(),
  { CrudFactory, SendFunctions } = require("utilities_middleware"),
  Users = CrudFactory(mongoose.model('User')),
  { sendData, sendOk } = SendFunctions,
  { permitRoles, runIfCondition } = require("auth_module/middleware"),
  { Sequences } = require(process.cwd() + "/utils"),
  { adminAllClientSelf } = Sequences;

/**
 * @function gets a business profile.
 * Role restrictions:
 * - admin can view any user
 * - client can only view their own profile
 * @param req.query         any key on the document can be used
 */
router.get('/user',
    adminAllClientSelf("query.auth"),
    Users.readAuth("query.auth"),
    sendData);

/**
 * @function checks for duplicate boastable_name
 */
router.get('/new-boastable-name/:name',
    Sequences.stopIfDuplicateBoastableName("params.name"),
    sendOk);

/**
 * @function lists all users (businesses) matching the query
 * Role restrictions:
 * - admin only
 * @param   req.query       any key on the user object
 */
router.get("/user/list",
    permitRoles("admin"),
    Users.list,
    sendData);

/**
 * @function creates a user profile
 * Role restrictions:
 * - admin only (client user created at registration)
 * @param req.body          payload contains user
 */
router.post('/user',
    permitRoles("admin"),
    Sequences.noDuplicatePhone("body.phone"),
    Sequences.noDuplicateBoastableName("body.boastable_name"),
    Users.create(),
    sendData);

/**
 * @function allows updates to user (business) profile
 * Role restrictions:
 * - admin can change any profile
 * - client can only change their own profile
 * @param req.query    _id or any key on the business profile
 * @param req.body     the updates to apply
 */
router.put("/user",
    adminAllClientSelf("query.auth"),
    Sequences.noDuplicatePhone("body.phone"),
    Sequences.noDuplicateBoastableName("body.boastable_name"),
    Users.update,
    sendData);

/**
 * @function deletes a user profile
 * Role restrictions:
 * - admin can delete anyone
 * - client can only delete self
 * @param req.query _id or any key on the document
 */
router.delete("/user",
    adminAllClientSelf("query.auth"),
    Users.remove(),
    sendData);

module.exports = function (app) {
    app.use(router);
}