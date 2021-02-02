const _ = require('lodash');
const { Service } = require("utilities_middleware");
const { model, integration } = require("stripe_integration");
const MembershipService = Service(model);
const StripeService = integration;

module.exports.MembershipResetSMS = function() {
  let basicUpdate = MembershipService.batchUpdate({ planType: 'basic', status: 'active' },
    { smsRemaining: 1000 })
    .then(() => {
      console.log('Reset basic member SMS limit completed');
      return;
    });

  let proUpdate = MembershipService.batchUpdate({ planType: 'pro', status: 'active' },
    { smsRemaining: 10000 })
    .then(() => {
      console.log('Reset pro member SMS limit completed');
      return;
    });

  return Promise.all([basicUpdate, proUpdate])
    .then(() => {
      console.log('All SMS resets complete');
    })
    .catch(reason => {
      console.log('Error reseting SMS remaining');
      return Promise.reject(reason);
    });
}


/**
 * Verify membership status
 * @function Make sure there's no problem with memberships, update status if necessary.
 *
 * Algorithm:
 * 1. get all memberships from stripe
 * 2. make sure has an active membership
 * 3. if not, update auth active to false
 */
module.exports.verifyMembershipStatus = function() {
  StripeService.list("subscriptions")
    .then(list => {
      var filteredSubs = list.map(sub => {
        const status = "active" === sub.status || "trialing" === sub.status;
        return {
          auth: sub.metadata.auth,
          status: (status) ? 'active' : 'canceled'
        }
      });
      // updates the User with the newly created stripe customer ID
      // active
      var activeSubs = filteredSubs
         .filter(({ status }) =>  status === 'active')
         .map(({ auth }) => auth);

      // inactive
      var inactiveSubs = filteredSubs
        .filter(({ status }) => status === 'canceled')
        .map(({ auth }) => auth);

      var hasActiveSubs = !_.isEmpty(activeSubs);
      var hasInactiveSubs = !_.isEmpty(inactiveSubs);

      if (hasActiveSubs) {
        var query = { _id: { $in: activeSubs }};
        var body = { status: 'active' };
        MembershipService.batchUpdate(query, body);
      }

      if (hasInactiveSubs) {
        var query = { _id: { $in: inactiveSubs }};
        var body = { status: 'canceled' };
        MembershipService.batchUpdate(query, body);
      }
    });
}
