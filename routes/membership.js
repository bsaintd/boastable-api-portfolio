var _ = require("lodash"),
  router = require("express").Router(),
  mongoose = require('mongoose'),
  { Validations, Sequences } = require(process.cwd() + '/utils'),
  // module specific middleware
  Stripe = require("stripe_integration/middleware"),
  Communication = require("communication_module/middleware"),
  { Middleware: Auth } = require('auth_module'),
  { permitRoles, runIfRoles }   = Auth,
  { adminAllClientSelf } = Sequences,
  // database transaction middleware
  { CrudFactory, SendFunctions, Manipulate }  = require("utilities_middleware"),
  { sendData, send, sendOk } = SendFunctions,
  { clear, move, setToAuthId, set } = Manipulate,
  Auths             = CrudFactory(mongoose.model('Auth')),
  Users             = CrudFactory(mongoose.model('User')),
  Membership        = CrudFactory(mongoose.model('Stripe')),
  Questions         = CrudFactory(mongoose.model('Question')),
  Answers           = CrudFactory(mongoose.model('Answer')),
  Customers         = CrudFactory(mongoose.model('Customer')),
  Surveys           = CrudFactory(mongoose.model('Survey')),
  SurveyTemplates   = CrudFactory(mongoose.model('SurveyTemplate'));

/**
 * @function registers a user
 * @description this function creates:
 * 1. the auth document
 * 2. a membership document
 * 3. a stripe customer
 */
router.post(
  "/register",
  permitRoles("guest"),
  [
    move("body.email", "query.email"),
    Auths.readTo("duplicateUser"),
    Validations.duplicateCheck("duplicateUser",
    "Cannot use this email address, already exists."),
  ],
  set("body.role", "client"),
  move("body.email", "login.email"),
  move("body.password", "login.password"),
  Validations.passwordRequirements("login.password"),
  Auth.createTo("auth"),
  // needs to know where the relevant auth ID is
  Validations.setupDefaultQuestions("auth._id"),
  Questions.createTo("questions"),
  clear("body"),
  move("auth._id", "body.auth"),
  Users.createTo("userData"),
  SurveyTemplates.createTo("surveyTemplate"),
  Membership.create(),
  Stripe.shapeCustomerPayload,
  Stripe.create("customers", "data"),
  Stripe.updateLocalMembership,
  Membership.update,
  clear("body"),
  move("login.email", "body.email"),
  move("login.password", "body.password"),
  Auth.login,
  // TODO: fix addition to the drip campaign
  // Communication.addToDripCampaign("body.email"),
  send("data")
);

/**
 * @function checks to see if the email address in the route is
 * already being used by a boastable user
 */
router.get("/new-email/:email",
    Sequences.duplicateEmailCheck("params.email"),
    send("isNew"),
);

/**
 * @function checks to see if the phone number in the route is
 * already being used by a boastable user
 */
router.get("/new-phone/:phone",
    Sequences.duplicatePhoneCheck("params.phone"),
    send("isNew"),
);

/**
 * @function accepts a stripe token and then both attaches the card to that
 * user's stripe customer document, and it also subscribes that user to the
 * platform's default plan
 */
router.post(
    "/subscription",
    permitRoles("client"),
    setToAuthId("auth"),
    Membership.read("auth", "membership"),
    Validations.subscriptionInactive,
    Validations.runIfTrue("body.source", [
        Stripe.attachCard("body.source", "membership.customerId"),
        set("membershipUpdate.body.hasCard", true),
    ]),
    Validations.configureStripePlan,
    Stripe.shapeSubscriptionPayload,
    Stripe.createSubscription("body"),
    Membership.updateFromTo("membershipUpdate", "membership"),
    sendOk);

/**
 * @function gets the requested membership
 * @param query.auth (admin only) view any membership
 * @returns the membership document and the Stripe customer data
 * will be included in this response.
 */
router.get("/membership",
    adminAllClientSelf("query.auth"),
    Membership.read("query.auth", "membership"),
    Stripe.readCustomer("membership.customerId", "membership.customer"),
    send("membership"));


/**
 * @function gets the client's default credit card
 * @param query.auth (administrator only)
 * @description will sift through the client's Stripe information to
 * find their default credit card
 */
router.get("/card",
    adminAllClientSelf("query.auth"),
    Membership.readTo("membership"),
    Stripe.readCustomer("membership.customerId", "customer"),
    Validations.hasCardSequence("customer"),
    // add a filter to sort this down
    send("card"));

/**
 * @function allows for an administrator to see all of the membership documents
 * for all users. Clients cannot see these routes
 */
router.get("/membership/list",
    permitRoles("admin"),
    Membership.list,
    sendData);

/**
 * @function creates the membership document and a Stripe customer.
 * assumes req.body is {user: ObjectId, email: String}
 * if it has a stripe customer in the metadata,
 * it stops the sequence and  responds,
 * if it doesn't, it creates one and updates the user's membership
 *
 * @deprecated because /register now accomplishes the creation
 * of the Stripe customer. Now an admin only endpoint.
 */
router.post("/membership",
    permitRoles("admin"),
    Membership.create(),
    Stripe.shapeCustomerPayload,
    Stripe.create("customers"),
    Stripe.updateLocalMembership,
    Membership.update,
    sendData);

/**
 * @function directly creates a subscription for a user that has
 * - a stripe customer ID
 * - an attached payment source
 * @description the plan is already set at the configuration level
 * @param query.auth  our ID for the user's login document
 */
router.post("/renew/subscription",
    permitRoles("client"),
    setToAuthId("auth"),
    Membership.read("auth", "membership"),
    Validations.configureStripePlan,
    Stripe.shapeSubscriptionPayload,
    Stripe.createSubscription("body"),
    /**
     * @description a "membershipUpdate" key is added to the
     * request inside of the shapeSubscriptionPayload function
     */
    Membership.updateFromTo("membershipUpdate", "membership"),
    sendOk);

/**
 * @function attaches a payment source to a stripe customer
 * @param body.source is the incoming parameter that is a Stripe token
 */
router.post("/stripe/change-card",
    Validations.stripeTokenRequired,
    adminAllClientSelf("query.auth"),
    Membership.readTo("membership"),
    [
        Stripe.attachCard("body.source", "membership.customerId"),
        setToAuthId("membershipUpdate.query.auth"),
        set("membershipUpdate.body.hasCard", true),
        Validations.trialIncreaseSMS,
        Membership.updateFromTo("membershipUpdate", "membership"),
    ],
    move("attachCard.id", "customerUpdate.default_source"),
    Stripe.updateCustomer("membership.customerId", "customerUpdate"),
    sendOk);

/**
 * @function deletes the user's subscription in stripe. Nothing else
 * is changed internally in our system.
 * @param query.auth  (only accessible to admin, otherwise user's auth ID)
 */
router.delete("/membership",
    adminAllClientSelf("query.auth"),
    Membership.readTo("membership"),
    Stripe.readCustomer("membership.customerId"),
    Stripe.removeSubscription("readCustomer.subscriptions.data[0].id"),
    move("membership.auth", "membershipUpdate.query.auth"),
    set("membershipUpdate.body.status", "canceled"),
    Membership.updateFromTo("membershipUpdate", "data"),
    sendData);

/**
 * @function removes a user entirely and all their associated data
 */
router.delete("/membership/all",
    permitRoles("admin"),
    Membership.readTo("membership"),
    Stripe.removeCustomer("membership.customerId"),
    Membership.remove("membership._id"),
    sendData);

/**
 * @function removes a user entirely and all their associated data
 */
router.delete("/membership/permanent/:email",
    permitRoles("admin"),
    Validations.requireEmailParam,
    Auth.read("params", "Auth"),
    Validations.continueIfTrue("Auth", "No auth document found", 404),
    move("Auth._id", "query.auth"),
    Auth.remove("Auth._id"),
    Membership.read("query.auth", "membership"),
    Stripe.removeCustomer("membership.customerId"),
    Membership.remove("query.auth"),
    SurveyTemplates.remove("query.auth"),
    Users.remove("query.auth"),
    Questions.removeAll,
    Answers.removeAll,
    Customers.removeAll,
    Surveys.removeAll,
    sendOk);

module.exports = function (app) {
    app.use(router);
}