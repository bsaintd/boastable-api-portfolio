/**
 * CUSTOMERS
 * @exports an express router
 * Customers are created any time a User sends out a review request
 * It's a simple data model that links to the User that created them and contains
 * the customer's phone number or email address
 */
var router = require("express").Router(),
  mongoose = require('mongoose'),
  { CrudFactory, SendFunctions } = require("utilities_middleware"),
  Customers = CrudFactory(mongoose.model("Customer")),
  { sendData } = SendFunctions,
  { adminAllClientSelf } = require(process.cwd() + '/utils/sequences');

/**
 * @function retrieves a customer document
 * role restrictions:
 * - admin can see all
 * - client can see own customers (customer where user set to client)
 * @param req.query    find by any key on the document
 */
router.get(`/customer`,
  adminAllClientSelf("query.auth"),
  Customers.read(),
  sendData);

/**
 * @function retrieves a list of customers
 * role restrictions:
 * - admin can see all
 * - client can see own customers (customer where user set to client)
 * @param req.query    query by any key on the document
 */
router.get(`/customer/list`,
  adminAllClientSelf("query.auth"),
  Customers.list,
  sendData);

/**
 * @function create customer
 * role restrictions:
 * - admin can see all
 * - client can only create customers for their business
 * @param req.body.phone   the phone number of the customer
 * @param req.body.user    the business associated with the customer
 */
router.post(`/customer`,
  adminAllClientSelf("body.auth"),
  Customers.create(),
  sendData);

/**
 * @function change a customer document
 * role restrictions:
 * - admin modify all
 * - client can modify own customers (customer where user set to client)
 * @param req.query.*    find by any key on the customer document
 * @param req.body.*     change any key on the document
 */
router.put(`/customer`,
  adminAllClientSelf("query.auth"),
  Customers.update,
  sendData);

/**
 * @function deletes a customer document
 * role restrictions:
 * - admin delete all
 * - client only delete own customers (customer where user set to client)
 * @param req.query.*    find by any key on the document
 */
router.delete(`/customer`,
  adminAllClientSelf("query.auth"),
  Customers.remove(),
  sendData);

module.exports = function(app) {
  app.use(router);
};
