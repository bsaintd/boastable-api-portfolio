#!/usr/bin/env node

/*=====================================
  Init
=======================================*/
const router = require("express").Router();
const _ = require("lodash");
const mongoose = require('mongoose');
const { permitRoles, runIfCondition } = require("auth_module/middleware");
const { CrudFactory, Service, Manipulate, SendFunctions } = require("utilities_middleware");
  // integrations
const { middleware: Stripe, model } = require("stripe_integration");
const Memberships = CrudFactory(model);
const AuthService = Service(mongoose.model('Auth'));
const { Validations } = require(process.cwd() + '/utils');
const { move, clear } = Manipulate;
const { sendData, send, sendOk } = SendFunctions;

router.post('/stripe/membership-updated',
  Validations.membershipWebhook,
  runIfCondition("membershipUpdate", [
    Memberships.updateFromTo("membershipUpdate", "membership")
  ]),
  sendOk
);
/**
* @function assumes req.body is {user: ObjectId, email: String}
* if it has a stripe customer in the metadata, it stops the sequence and responds,
* if it doesn't, it creates one and updates the user's membership
*/
router.get('/stripe/:model/query',
  permitRoles(["client"]),
  move('user.sub', 'query.auth'),
  Memberships.readTo('membership'),
  clear('query'),
  move('membership.customerId', 'query.customer'),
  (req, res, next) => {
    console.log(req.query);
    next();
  },
  Stripe.listQuery(),
  (req, res, next) => {
    let invoices = req.data;
    let filteredInvoices = invoices.map((invoice) => {
      return {
        id: invoice.id,
        amount_due: invoice.amount_due/100,
        amount_paid: invoice.amount_paid/100,
        created_at: new Date(invoice.date),
        paid: invoice.closed
      };
    });
    req.data = filteredInvoices;
    next();
  },
  // updates the User with the newly created stripe customer ID
  sendData);

/**
* @function gets a list of all of a certain type of stripe data.
*/
router.get('/stripe/subscriptions/filtered',
permitRoles("admin"),
Stripe.list("subscriptions"),
// updates the User with the newly created stripe customer ID
(req, res, next) => {
  req.filteredSubs = req.data.map(sub => {
    return {
      auth: sub.metadata.auth,
      active: sub.status == "active"
    };
  });
  // active
  req.activeSubs = req.filteredSubs
    .filter(sub => {
      return sub.active;
    })
    .map(sub => {
      return sub.auth;
    });
  // inactive
  req.inactiveSubs = req.filteredSubs
    .filter(sub => {
      return !sub.active;
    })
    .map(sub => {
      return sub.auth;
    });
  req.hasActiveSubs = !_.isEmpty(req.activeSubs);
  req.hasInactiveSubs = !_.isEmpty(req.inactiveSubs);
  console.log('hasActiveSubs', req.hasActiveSubs);
  // get an array of the matching auths... update all
  next();
},
runIfCondition("hasActiveSubs", [
  (req, res, next) => {
    req.query = {_id: {$in: req.activeSubs}};
    req.body = {active: true};
    AuthService.batchUpdate(req.query, req.body);
    next();
  },
]),
runIfCondition("hasInactiveSubs", [
  (req, res, next) => {
    req.query = {_id: {$in: req.inactiveSubs}};
    req.body = {active: false};
    AuthService.batchUpdate(req.query, req.body);
    next();
  },
]),
send("filteredSubs"));

/**
* @function gets a list of all of a certain type of stripe data.
*/
router.get('/stripe/:model/list',
  permitRoles("admin"),
  Stripe.list(),
  // updates the User with the newly created stripe customer ID
  sendData);


/**
* @function assumes req.body is {user: ObjectId, email: String}
* if it has a stripe customer in the metadata, it stops the sequence and responds,
* if it doesn't, it creates one and updates the user's membership
*/
router.post("/stripe/subscriptionItem",
  permitRoles(["admin"]),
  /**
   * @param req.body.user
   * @param req.body.product
   * Steps:
   * 1. read the plan (with user)
   * 2. get the stripe subscription id from that
   * 3. read the product
   * 4. get the stripe plan id from that (with user)
   * 5. create the subscription item
   */
  (req, res, next) => {
    let subscriptionItem = {
      subscription: req.plan.metadata.stripe.subscription,
      plan: req.product.metadata.stripe.plan,
      quantity: 1
    };
    req.body = subscriptionItem;
    next();
  },
  Stripe.create("subscriptionItems"),
  sendData);

/**
* @function assumes req.body is {user: ObjectId, email: String}
* if it has a stripe customer in the metadata, it stops the sequence and responds,
* if it doesn't, it creates one and updates the user's membership
*/
router.get('/stripe/:model',
  permitRoles(["admin"]),
  Stripe.read(),
  // updates the User with the newly created stripe customer ID
  sendData);


module.exports = function (app) {
  app.use(router);
}