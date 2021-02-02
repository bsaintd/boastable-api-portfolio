/**
 * SURVEY ROUTES
 * @exports an express router
 * Surveys are created any time a Client user sends out survey
 * It's a simple data model that links to the Client that created it and contains
 * the customer's answers and when it was created
 */
var
  router = require("express").Router(),
  mongoose = require('mongoose'),
  { CrudFactory,
    SendFunctions,
    Manipulate }  = require("utilities_middleware"),
  Auths           =  CrudFactory(mongoose.model('Auth')),
  Memberships     =  CrudFactory(mongoose.model('Stripe')),
  Customers       =  CrudFactory(mongoose.model('Customer')),
  Answers         =  CrudFactory(mongoose.model('Answer')),
  Users           =  CrudFactory(mongoose.model('User')),
  Questions       =  CrudFactory(mongoose.model('Question')),
  Surveys         =  CrudFactory(mongoose.model('Survey')),
  SurveyTemplates =  CrudFactory(mongoose.model('SurveyTemplate')),
  Communications  = require('communication_module/middleware'),
  Twilios         = require('communication_module/twilio'),
  { send, sendOk }      = SendFunctions,
  { assign, merge, copy, clear, set } = Manipulate,
  { runIfRoles, permitRoles } = require("auth_module/middleware"),
  { Sequences, Validations } = require(process.cwd() + '/utils'),
  { adminAllClientSelf } = Sequences,
  _ = require('lodash');

var populateAnswersQuestions = {
  path: "answers",
  populate: {
    path: "question"
  }
};
/**
 * @function gets a survey document
 */
router.get(
  "/survey",
  adminAllClientSelf("query.auth"),
  Surveys.readTo("survey"),
  // Customers.populateFrom('survey', 'customer', 'survey'),
  send('survey')
);
/**
 * @function gets all surveys, used in the Answers area of the app
 */
router.get(
  "/survey/list",
  adminAllClientSelf("query.auth"),
  runIfRoles("client", assign('query.test', () => ({$not: {$eq: true}}) )),
  Surveys.listTo("surveys"),
  /* protection from the case that there are no surveys yet */
  Validations.stopIfTrue((req) => _.isEmpty(req.surveys), [], 200),
  // Customers.populateFrom("surveys", "customer", "surveys"),
  // Answers.populateFrom("surveys", populateAnswersQuestions, "surveys"),
  // Auths.populateFrom("surveys", "sender", "surveys"),
  send("surveys")
);

router.get('/survey/:shortid',
  copy('params.shortid', 'query.shortid'),
  Surveys.readToPopulate('data.survey', populateAnswersQuestions),
  Customers.readId('data.survey.customer', 'data.customer'),
  Users.read('data.survey.auth', 'data.company'),
  SurveyTemplates.read('data.survey.auth','data.settings'),
  send('data')
);

router.put('/customer-message',
  Surveys.readTo('survey'),
  Validations.stopIfTrue((req) => req.survey.customer_message, null, 208),
  assign('body', (req) => ({ customer_message: req.body.customer_message }) ),
  Surveys.update,
  sendOk
);

router.get("/survey/test",
  permitRoles("client"),
  // check for active membership, if not stop
  Memberships.readAuth('user.sub', 'membership'),
  copy("body", "customerBody"),
  copy("membership.auth", "customerBody.auth"),
  // if no email, then it's a test survey, goes to Client
  copy('user.email', 'customerBody.email'),
  set('isTest', true),
  set('surveyBody.test', true),
  /**
   * @description at this point, req.customerBody is shaped like:
   * {
   *  auth: '[Object ID]',
   *  [phone]: '5615236863',
   *  [email]: 'example@guy.com'
   * }
   */
  Customers.read('customerBody','customer'),
  // if there is no customer there, create a customer
  Validations.runIfTrue((req) => _.isEmpty(req.customer),
  Customers.create("customerBody", "customer")),
  // only want active questions in the survey
  assign('query', (req) => ({
    auth: req.membership.auth,
    active: true
  })),
  Questions.list,
  // if Questions.list returns [], create default questions
  Validations.runIfFalse((req) => _.isEmpty(req.data), [
    Validations.prepareAnswerArray("data"),
    Answers.create('surveyBody.answers', 'surveyBody.answers'),
  ]),
  merge('surveyBody', (req) => ({
    auth: req.membership.auth.toString(),
    sender: req.membership.auth.toString(),
    customer: req.customer._id.toString()
  })),
  Surveys.create('surveyBody', 'survey'),
  Users.readAuth('survey.auth', 'business'),
  // sends an email survey
  Communications.surveyEmail('customerBody.email', 'business.company_name', 'survey.shortid'),
  // sends an sms survey
  sendOk
);

router.post("/survey",
  runIfRoles("client", [
    // check for active membership, if not stop
    Memberships.readAuth('user.sub', 'membership'),
    Validations.stopIfFalse((req) => _.get(req, 'membership.status') === 'active' || _.get(req, 'membership.status') === 'trial',
      'Your subscription is inactive, update payment information in account settings to send surveys.', 401),
    copy("body", "customerBody"),
    copy("membership.auth", "customerBody.auth")
  ]),
  // if no email, then it's a test survey, goes to Client
  Validations.runIfTrue((req) => _.isEmpty(req.body.phone) && _.isEmpty(req.body.email), [
    copy('user.email', 'customerBody.email'),
    set('isTest', true),
    set('surveyBody.test', true)
  ]),
  /**
   * @description at this point, req.customerBody is shaped like:
   * {
   *  auth: '[Object ID]',
   *  [phone]: '5615236863',
   *  [email]: 'example@guy.com'
   * }
   */
  Customers.read('customerBody','customer'),
  // if there is no customer there, create a customer
  Validations.runIfTrue((req) => _.isEmpty(req.customer),
  Customers.create("customerBody", "customer")),
  // only want active questions in the survey
  assign('query', (req) => ({
    auth: req.membership.auth,
    active: true
  })),
  Questions.list,
  // if Questions.list returns [], create default questions
  Validations.runIfFalse((req) => _.isEmpty(req.data), [
    Validations.prepareAnswerArray("data"),
    Answers.create('surveyBody.answers', 'surveyBody.answers'),
  ]),
  merge('surveyBody', (req) => ({
    auth: req.membership.auth.toString(),
    sender: req.membership.auth.toString(),
    customer: req.customer._id.toString()
  })),
  SurveyTemplates.readAuth('membership.auth', 'surveyBody.settings'),
  Users.readAuth('membership.auth', 'surveyBody.business'),
  Surveys.create('surveyBody', 'survey'),
  Validations.runIfTrue('isTest', send('survey')),
  // sends an email survey
  Communications.surveyEmail('customerBody.email', 'survey.business.company_name', 'survey.shortid'),
  // sends an sms survey
  Validations.runIfTrue('customerBody.phone', [
    // check to see if user has more messages available
    Validations.stopIfFalse((req) => {
      const { smsRemaining } = _.get(req, 'membership');
      return smsRemaining && Number(smsRemaining) > 0;
    }, 'SMS limit for the month reached', 401),
    Twilios.sendSurveyTo('customer.phone', 'survey.business.company_name', 'survey.shortid'),
    Memberships.incrementAuth('membership.auth', { smsRemaining: -1 })
  ]),
  sendOk
);

router.post("/twilio/inbound",
  Validations.shapeInboundQuery,
  clear("query"),
  clear("body"),
  Users.read("boastableClient", "business"),
  Validations.stopIfTrue((req) => _.isEmpty(req.business), 'No matching boastable account found.', 404),
  copy("business.auth", "customerBody.auth"),
  copy("business.auth", "customerQuery.auth"),
  // check for active membership, if not stop
  Memberships.readAuth('business.auth', 'membership'),
  Validations.stopIfFalse((req) => {
    let status = _.get(req, 'membership.status');
    return status === 'active' || status === 'trial';
  },
    'Subscription is inactive, update payment information in account settings to send surveys.', 401),
  // check for existing customer
  Customers.read('customerQuery','customer'),
  // if there is no customer there, create a customer
  Validations.runIfTrue((req) => _.isEmpty(req.customer),
  Customers.create("customerBody", "customer")),
  // only want active questions in the survey
  assign('query', (req) => ({
    auth: req.business.auth,
    active: true
  })),
  Questions.list,
  // if Questions.list returns [], create default questions
  Validations.runIfFalse((req) => _.isEmpty(req.data), [
    Validations.prepareAnswerArray("data"),
    Answers.create('surveyBody.answers', 'surveyBody.answers'),
  ]),
  merge('surveyBody', (req) => ({
    auth: req.business.auth,
    sender: req.business.auth,
    customer: req.customer._id
  })),
  Surveys.create('surveyBody', 'survey'),
  Validations.stopIfFalse((req) => {
    const smsRemaining = _.get(req, 'membership.smsRemaining');
    return smsRemaining && Number(smsRemaining) > 0;
  }, 'SMS limit for the month reached', 401),
  Twilios.sendSurveyTo('customer.phone', 'business.company_name', 'survey.shortid'),
  Memberships.incrementAuth('membership.auth', { smsRemaining: -1 }),
  // ]),
  sendOk
);


/**
 * @function sends a demo survey
 */
router.get(["/demo/:phoneOrEmail", "/demo/", "/demo"],
  Validations.isPhoneOrEmail("params.phoneOrEmail", "customerBody"),
  set('authQuery.email', 'hello@boastable.co'),
  Auths.read('authQuery', 'boastableAccount'),
  Validations.stopIfTrue((req) => _.isEmpty(req.boastableAccount), 'Demo Boastable account not configured', 404),
  Users.readAuth('boastableAccount._id', 'business'),
  copy('business.auth', 'customerBody.auth'),
  // check for existing customer
  Customers.read("customerBody", "customer"),
  // if there is no customer there, create one
  Validations.runIfTrue((req) => _.isEmpty(req.customer),
  Customers.create("customerBody", "customer")),
  // only want active questions in the survey
  assign('query', (req) => ({
    auth: req.business.auth,
    active: true
  })),
  Questions.list,
  // if Questions.list returns [], don't make answers
  Validations.runIfFalse((req) => _.isEmpty(req.data), [
    Validations.prepareAnswerArray("data"),
    // Validations.stopIfTrue((req) => true, 'test', 200),
    Answers.create('surveyBody.answers', 'surveyBody.answers'),
  ]),
  merge('surveyBody', (req) => ({
    auth: req.business.auth,
    sender: req.business.auth,
    customer: req.customer._id,
    demo: true
  })),
  SurveyTemplates.readAuth('business.auth', 'surveyBody.settings'),
  copy('business', 'surveyBody.business'),
  Surveys.create('surveyBody', 'survey'),
  // sends an email survey
  Communications.surveyEmail('customer.email', 'business.company_name', 'survey.shortid'),
  // sends an sms survey
  Twilios.sendDemoSurveyTo('customer.phone', 'business.company_name', 'survey.shortid'),
  sendOk
);

module.exports = function(app){
  app.use(router);
}
