const {
  STRIPE_ENTERPRISE_PLAN_ID,
  STRIPE_PRO_PLAN_ID,
  PRO_SMS_REMAINING
} = process.env;

if(!PRO_SMS_REMAINING) {
  throw new Error('PRO_SMS_REMAINING not in configuration');
}

if(!STRIPE_ENTERPRISE_PLAN_ID || !STRIPE_PRO_PLAN_ID){
  throw new Error('At least one essential stripe plan is not defined in the environment');
}

const _ = require('lodash');
const { CrudFactory, Manipulate } = require("utilities_middleware");
const { clear, move, set } = Manipulate;
const { model } = require("stripe_integration");
const Memberships = CrudFactory(model);
const ConnectSequence = require('connect-sequence');
const Twilio = require('communication_module/twilio');
const { isEmail } = require('validator');
const { parseNumber, formatNumber } = require('libphonenumber-js');


module.exports.stopIfTrue = (callback, payload, status) => {
  return (req, res, next) => {
    if (callback(req)) {
      let body = payload;
      if(typeof payload === 'string')
        body = { message: payload };
      res.status(status || 400).json(body || null);
    } else {
        next();
    }
  };
};


module.exports.stopIfFalse = (callback, payload, status) => {
  return (req, res, next) => {
      if (!callback(req)) {
        let body = payload;
        if(typeof payload === 'string')
          body = { message: payload };
        res.status(status || 400).json(body || null);
      } else {
          next();
      }
  };
};
/**
 * @description SMS related validations and helper functions
 */

module.exports.hasMoreSMS = [
  Memberships.readAuth('user.sub', 'membership'),
  exports.stopIfFalse((req) => {
    const smsRemaining  = _.get(req, 'membership.smsRemaining');
    return smsRemaining && smsRemaining > 0;
  }, 'SMS limit for the month reached', 401)
];

/**
 * @description Membership related validations
 */

/**
 * @function sets membership status body
 * @param req.membership      {Object}    a Stripe customer document
 * @returns req.body.active   {Boolean}   true if "active" or "trialing"
 */
module.exports.prepareMembershipStatusUpdate = (stripeCustomerPath) => {
  return (req, res, next) => {
    // checks to see if the client's membership is active
    const stripeCustomer = _.get(req, stripeCustomerPath);
    _.set(req, 'body.status', exports.extractMembershipStatus(stripeCustomer));
    next();
  };
}

/**
 * @function is a pure function that accepts a stripe customer object
 * and extracts a simple Boolean value based on whether the current
 * membership status is "active" or "trialing"
 */
module.exports.extractMembershipStatus = (stripeCustomerObj) => {
  let result;
  const stripeStatusString = _.get(stripeCustomerObj, 'subscriptions.data[0].status', "canceled");

  switch(stripeStatusString) {
    case 'trialing':
      result = 'trial';
      break;
    case 'active':
      result = 'active';
      break;
    default:
      result = 'canceled';
      break;
  }
  return result;
};

/**
 * @description General functions
 */

/**
 * @function is used for duplicate checking, mainly.
 * @param path is the path on the request object being checked for emptiness
 * @returns req.isNew {Object} of form { new: Boolean }
 */
module.exports.newIfEmpty = (path) => {
  return (req, res, next) => {
    req.isNew = { new: _.isEmpty(_.get(req, path)) };
    next();
  };
}

module.exports.duplicateCheck = (testPath, failMessage) => {
  return(req, res, next) => {
    const isTrue = _.isEmpty(_.get(req, testPath));
    if (isTrue){
      next();
    } else {
      res.status(400).json({
          message: failMessage
      });
    }
  };
};

/**
 * @function only continues middleware sequence if condition is satisfied
 * @param testPath path to the test flag on the request object
 * @param failMessage
 * @param statusCode the HTTP status code you want to return, default is 400
 */
module.exports.continueIfTrue = (testPath, failMessage, statusCode) => {
  return(req, res, next) => {
    const isTrue = _.get(req, testPath);
    if (isTrue){
      next();
    } else {
      res.status(statusCode || 400).json({
          message: failMessage
      });
    }
  };
};

/**
 * @function takes the id of the stripeCustomer's default credit card
 * and then finds the associated source object with billing info
 * and attaches it to req.card
 * @returns req.card for use later in the chain
 */
module.exports.continueIfCardFound = (cardPath) => {
  return (req, res, next) => {
    const { sources } = req;
    const card = _.get(req, cardPath);
    if(!card) {
        _.set(req, 'memberUpdate.hasCard', false);
    } else {
      req.card = sources.find(source => {
          return source.id === card;
      });
    }
    next();
  };
};

/**
 * @description this middleware chain parses the default credit card
 * from the Stripe customer object.
 * @param customerObjPath the path on the request object
 */
module.exports.hasCardSequence = (customerObjPath) =>{
  return [
    move(`${customerObjPath}.default_source`, 'card'),
    move(`${customerObjPath}.sources.data`, 'sources'),
    exports.continueIfCardFound('card'),
    exports.runIfFalse((req) => _.isEmpty(req.memberUpdate), Memberships.updateAuth(`${customerObjPath}.metadata.auth`, 'memberUpdate')),
  ];
}

/**
 * @function validates the incoming password against the application's
 * passowrd requirements
 */
module.exports.passwordRequirements = (passwordPath) => {
  return (req, res, next) => {
    const testPassword = _.get(req, passwordPath);
    const validPassword = (v) => /(?!^[0-9]*$)(?!^[a-zA-Z!@#$%^&*()_+=<>?]*$)^([a-zA-Z!@#$%^&*()_+=<>?0-9]{6,20})$/.test(v);
    if (validPassword(testPassword)) {
      next();
    } else {
      res.status(400).json({ message: 'Password at least 6 characters, and must contain at least 1 number. Special characters allowed.' });
    }
  };
};

/**
 * @function adds default questions to be created on register
 */
module.exports.setupDefaultQuestions = (authIdPath) => {
  return (req, res, next) => {
    req.body = [
        {
            auth: _.get(req, authIdPath),
            question: "Did your experience go well?"
        },
        {
            auth: _.get(req, authIdPath),
            question: "Have you been here before?"
        },
        {
            auth: _.get(req, authIdPath),
            question: "Would you recommend us?"
        }
    ];
    next();
  };
}

/**
 * @function filters through the data that comes from a subscription update webhook
 */
module.exports.membershipWebhook = (req, res, next) => {
  let membershipUpdate = req.body;

  let auth = _.get(membershipUpdate, 'data.object.metadata.auth');
  let status = _.get(membershipUpdate, 'data.object.status');

  if(!auth) {
    next(new Error('No auth found in metadata'));
    return;
  }
  if(!status){
    next(new Error('no status update found'));
    return;
  }

  if(status == "past_due" || status == "unpaid" || status == "canceled") {
    status = 'canceled';
    _.set(req, 'membershipUpdate', {
      query: { auth },
      body: { status }
    });
  }

  next();
}

/**
 * @function makes sure the client does NOT have an active subscription
 * to avoid a case where a users has 2 subscriptions.
 * In order to get past this middleware, a user's membershipStatus must be
 * 'inactive' or 'canceled'
 * @param req.membershipStatus {String} Must be 'inactive' or canceled
 */
module.exports.subscriptionInactive = (req, res, next) => {
  // verifies user is in either a canceled or inactive state
  if(_.includes(['inactive', 'canceled'], req.membership.status)){
    next();
  }else{
    res.status(408).json({ message: 'Member already has subscription, cannot have more than 1 subscription per account'});
    return;
  }
};

module.exports.stripeTokenRequired = (req, res, next)=> {
  if(!_.get(req, 'body.source')){
      res.status(400).json('No card token given');
      return;
  } else {
      next();
  }
}

module.exports.configureStripePlan = (req, res, next) => {

  let chosenPlan = _.get(req, "body.plan") || _.get(req, "membership.plan");

  switch(chosenPlan) {
      case 'enterprise':
      _.set(req, "body.plan", STRIPE_ENTERPRISE_PLAN_ID);
      _.set(req, "membershipUpdate.body.smsRemaining", 10000);
      _.set(req, "membershipUpdate.body.planType", 'enterprise');
      break;
      case 'pro':
      _.set(req, "body.plan", STRIPE_PRO_PLAN_ID);
      _.set(req, "membershipUpdate.body.smsRemaining", PRO_SMS_REMAINING);
      _.set(req, "membershipUpdate.body.planType", 'pro');
      break;
      case 'basic':
      default:
      _.set(req, "body.plan", STRIPE_PRO_PLAN_ID);
      _.set(req, "membershipUpdate.body.smsRemaining", PRO_SMS_REMAINING);
      _.set(req, "membershipUpdate.body.planType", 'pro');
      break;
  }
  next();
}

module.exports.trialIncreaseSMS = (req, res, next) => {
  if(req.membership.hasCard === false && req.membership.status === 'trial'){
      _.set(req, 'membershipUpdate.body.smsRemaining', 100);
  }
  next();
};

module.exports.requireEmailParam = (req, res, next) => {
  if(!_.get(req, 'params.email')) {
      res.status(400).json({message: 'No email specified'});
      return;
  } else {
      next();
  }
};

module.exports.verifyClientAccount = (req, res, next) => {
  const isEmpty = _.isEmpty(req.maybeUser);
  if(isEmpty) {
    res.status(200).send("Looks like you don't have Boastable yet... Signup here if you want to get feedback from YOUR customers. https://app.boastable.co/signup");
  } else {
    next();
  }
}

/**
 * @function checks to see if the signed in user's role is within the array of roles passed in
 * @param {Array} roles         an array of strings. example: ["client", "admin"]
 * @param {*} middleware        an array of middleware
 */
module.exports.runIfTrue = (callback, middleware) => {
  return (req, res, next) => {
      let test;
      if (typeof callback === 'string'){
        test = _.get(req, callback);
      } else {
        test = callback(req);
      }
      if (test) {
          if (_.isArray(middleware)) {
              var seq = new ConnectSequence(req, res, next);
              seq.append(...middleware).run();
          } else {
              middleware(req, res, next);
          }
      } else {
          next();
      }
  };
};

/**
* @function allows for the API to run a specific middleware function if a certain condition is met
* @param {Boolean} flag                  this is the 'flag' to check for on the request object.
* example: "isPineapple" would be req.isPineapple (assuming that flag was set in a previous middleware)
* @param {Array} middlewareArray       an array of middleware, self explanatory
*/
module.exports.runIfFalse = (callback, middleware) => {
  return (req, res, next) => {
      let test;
      if (typeof callback === 'string'){
        test = _.get(req, callback);
      } else {
        test = callback(req);
      }
      if (!test) {
        if (_.isArray(middleware)) {
          var seq = new ConnectSequence(req, res, next);
          seq.append(...middleware).run();
        } else {
            middleware(req, res, next);
        }
      } else {
          next();
      }
  };
};

/**
 * @function checks to see if the signed in user's role is within the array of roles passed in
 * @param {Array} roles         an array of strings. example: ["client", "admin"]
 * @param {*} middleware        an array of middleware
 */


module.exports.prepareAnswerArray = (questionsArrayPath, customerIdPath) => {
  return (req, res, next) => {
  const questionsArray = _.get(req, questionsArrayPath);
  const customerId = _.get(req, customerIdPath) || _.get(req, 'customer._id');
  if(!questionsArray){
    next(new Error('No questions to build answers from'));
    return;
  }
  if(!customerId){
    next(new Error('No customer to assign answers to'));
    return;
  }
  let list = questionsArray.map(({_id, auth}) => {
    return {
      auth: auth.toString(),
      customer: customerId.toString(),
      question: _id.toString()
    };
  });
  _.set(req, 'surveyBody.answers', list);
  next();
};
}
module.exports.smsSurveyBody = (req, res, next) => {
  req.body = {
    to: req.customer.phone,
    company_name: req.business.company_name,
    shortid: req.survey.shortid
  }
  next();
}

module.exports.emailSurveyBody = (req, res, next) => {
  req.body = {
    email: req.customer.email,
    company_name: req.business.company_name,
    shortid: req.survey.shortid
  }
  next();
}

module.exports.incrementVotes = (req, res, next) => {
  if (req.data.value) {
    req.body = { upvotes: 1 };
  } else {
    req.body = { downvotes: 1 };
  }
  next();
};

module.exports.isPhoneOrEmail = (inputPath, explicitOutputPath) => {
  return (req, res, next) => {
    const input = _.get(req, inputPath);
    const outputPath = explicitOutputPath || 'body';
    let type, output;
    if(_.isEmpty(input)) {
      res.status(404);
      next(new Error('No phone or email not given in URL'));
      return;
    }

    const validPhoneNumber = Twilio.validatePhoneNumber(input);

    if(isEmail(input)) {
      type = 'email';
      output = input;
    } else if(validPhoneNumber) {
      type = 'phone';
      output = validPhoneNumber;
    } else {
      res.status(400);
      next(new Error('Supplied input is invalid'));
      return;
    }
    /**
     * @description this will either yield something like
     * ex: { customerPath: { email: 'example@email.com' } }
     * or
     * ex: { customerPath: { phone: '+13215555555' } }
     * All phone numbers will be in E.164 format
     */
    _.set(req, `${outputPath}.${type}`, output);
    next();
  }
}
/**
 * @description validates a phone number by passing it through parsing
 * and formatting twice, this eliminates the possibility of most fake numbers.
 */
module.exports.validatePhoneNumber = (testString) => {
  let parsedInput = parseNumber(testString, 'US');
  if (_.isEmpty(parsedInput) || parsedInput.valid === false) {
    return false;
  } else {
    let round2 = formatNumber(parsedInput, 'E.164');
    let round3 = parseNumber(round2, 'US');
    if (_.isEmpty(round3) || round3.valid === false) {
      return false;
    } else {
      return formatNumber(round3, 'E.164');
    }
  }
}

exports.isArrayOfPhoneNumbers = (inputString) => {
  let testArray = inputString.split(',');
  testArray = testArray.map(item => {
    return exports.validatePhoneNumber(item);
  })
  .filter(item => item);
  if(testArray.length > 1)
    return testArray;
  else
    return false;
}

exports.isBoastableName = (inputString) => {
  const testString = inputString.toLowerCase();
  const theMatch = testString.match(/^[a-z0-9]{3,20}$/);
  if(theMatch){
    return theMatch[0];
  } else {
    return false;
  }
}

/**
 * @function validates the incoming phone number and prepares the body and query
 * to relay a review request on to a user. Used in our twilio inbound webhook
 * @param {String} req.body.From    E.164 formatted phone number
 *                                  twilio reports the incoming phone number here
 * @param {String} req.body.Body    We expect this to be an unformatted phone number
 */
module.exports.shapeInboundQuery = (req, res, next) => {
  const { body: incomingSMS } = req;
  const { From: phone, Body: rawInput } = incomingSMS;

  if(!phone) {
    res.status(404);
    next(new Error('No phone number associated with incoming SMS (body.From)'));
    return;
  }

  if(!rawInput) {
    res.status(404);
    next(new Error('No message attached to incoming SMS (body.Body)'));
    return;
  }

  const validPhoneNumber = exports.validatePhoneNumber(rawInput);
  const testBoastableName = exports.isBoastableName(rawInput);
  // const testPhoneArray = exports.isArrayOfPhoneNumbers(rawInput);

  if (validPhoneNumber) {
    /**
     * set query so we can check our list of businesses for a match
     */
    _.set(req, 'boastableClient', { phone: phone });
    /**
     * set body so we're ready to send a message
     */
    _.set(req, 'customerQuery', { phone: validPhoneNumber });
    _.set(req, 'customerBody', { phone: validPhoneNumber });
    next();
  }

  // else if (testPhoneArray) {
  //   _.set(req, 'boastableClient', { phone: rawBusinessNumber });
  //   _.set(req, 'customerQuery', { phone: { $in: testPhoneArray } });
  //   let customers = testPhoneArray.map(customerPhone => {
  //     return {
  //       phone: customerPhone
  //     };
  //   });
  //   _.set(req, 'customerBody', customers);
  //   next();
  // }

  else if (testBoastableName) {
    /**
     * set query so we can check our list of businesses for a match
     */
    _.set(req, 'boastableClient', { boastable_name: testBoastableName });
    /**
     * set body so we're ready to send a message
     */
    _.set(req, 'customerQuery', { phone: phone });
    _.set(req, 'customerBody', { phone: phone });
    next();
  }

  else {
    res.status(400);
    next(new Error('Invalid query. Requires a phone number, list of phone numbers, or boastable business name.'));
    return;
  }
};