const mongoose = require('mongoose');
const Users = mongoose.model('User');
const Auths = mongoose.model('Auth');
const Questions = mongoose.model('Question');
const Answers = mongoose.model('Answer');
const SurveyTemplates = mongoose.model('SurveyTemplate');
const Membership = mongoose.model('Stripe');
const { buildSchema } = require('graphql');
const graphQL = require('express-graphql');
const { integration: Stripe } = require('stripe_integration');
const _ = require('lodash');

// Construct a schema, using GraphQL schema language
var schema = buildSchema(`

  type Answer{
    question: ID!
    questionText: String
    value: Boolean
    survey: ID
    auth: ID
  }
  
  type Customer{
    _id: ID
    auth: ID
    phone: String
    email: String
  }

  type Survey{
    auth: ID
    customer: ID
    answers: [Answer]
    questions: [Question]
  }

  type Membership{
    auth: ID!
    customerId: String
    cards: [Card]
    subscriptions: [Subscription]
  }

  type Subscription{
    planId: String
    type: String
    status: String
    price: Float
  }

  type Question{
    id: ID
    auth: String
    questionText: String
    upvoteCount: Int
    downvoteCount: Int
  }

  type QuestionData{
    auth: ID!
    activeCount: Int
    activeQuestions: [Question]
  }

  type User{
    _id: ID!
    auth: ID
    description: String
    first_name: String
    last_name: String
    company_name: String
    phone: String
    logo: String
    tags: [String]
    google_business_name: String
    google_place_id: String
    hide_place_id_reminder: Boolean
    sms_remaining: Int
    boastable_name: String
  }

  type Auth{
    id: ID!
    email: String!
    role: String
    user: User
    membership: Membership
    questionData: QuestionData
  }

  type Address{
    line1: String
    line2: String
    city: String
    state: String
    zip: String
    country: String
  }

  type Card{
    cardName: String
    brand: String
    last4: String
    address: Address
  }

  type Query {
    user(auth: ID!): User
    auth(email: String!): Auth
  }

  input RegistrationInputs{
    email: String!
    first_name: String!
    last_name: String!
    password: String!
    company_name: String!
    phone: String!
  }
  type Mutation{
    registration: RegistrationMutations
  }

  type RegistrationMutations{
    createUser(inputs: RegistrationInputs!): User!
  }
  
  `);
  
const adminSchema = `
  type Mutation{
    admin: AdminMutations
  }

  type AdminMutations{
    removeAllRecords(email: String!): Boolean
  }
`;

/**
 * Mutation classes
 */

class Mutation{
  constructor(){}
  createUser(){}
  upvoteQuestion(){}
  downvoteQuestion(){}
  editQuestion(){}
  deleteQuestion(){}
  addCustomer(){}
  deleteCustomer(){}
}

/**
 * Query classes
 */
class Customer{
  constructor(auth, email, phone){
    this.auth = auth
    this.email = email
    this.phone = phone
  }
  async email(){
    const customer = await Customers.findOne({auth: this.auth, email: this.email}).exec()
    return customer
  }
  async phone(){
    const customer = await Customers.findOne({auth: this.auth, phone: this.phone}).exec()
    return customer 
  }
  async allCustomers(){
    const customers = await Customers.find({auth: this.auth}).exec()
    return customers
  }
}
class MembershipData{

  constructor({ customerId, auth }){
    this.auth = auth;
    this.customerId = customerId; 
  }

  async subscriptions(){
    if(!_.isEmpty(this.subscriptionData))
      return this.subscriptionData;

    if(_.isEmpty(this.rawData))
      this.rawData = await Stripe.read("customers", this.customerId);
  
    let rawSubscriptions = _.get(this.rawData, 'subscriptions.data');
    this.subscriptionData = rawSubscriptions.map(this.filterSubscription);
    
    return this.subscriptionData;
  }
  
  async cards(){
    if(!_.isEmpty(this.cardData))
      return this.cardData;
    
    if(_.isEmpty(this.rawData))
      this.rawData = await Stripe.read("customers", this.customerId);
    
    let rawCardData = _.get(this.rawData, 'sources.data');
    this.cardData = rawCardData.map(this.filterCard);

    return this.cardData;

  }

  filterSubscription(s){
    let planId = _.get(s, 'plan.id');
    let type = _.get(s, 'plan.nickname');
    let status = _.get(s, 'status');
    let price = parseInt(_.get(s, 'plan.amount')) / 100.00;
    return {planId, type, status, price};
  }

  filterCard(c){
    let brand = _.get(c, 'brand');
    let last4 = _.get(c, 'last4');
    let cardName = _.get(c, 'name');
    let address = {
      line1: _.get(c, 'addres_line1'), 
      line2: _.get(c, 'line2'),
      city: _.get(c, 'address_city'),
      state: _.get(c, 'address_state'),
      zip: _.get(c, 'address_zip'),
      country: _.get(c, 'address_country')
    };
    return {
      cardName, brand, last4, address
    }
  }
}

class Question{
  // instantiated witha  question document from the database
  constructor({_id, question, auth, active}){
    this.id = _id;
    this.questionText = question;
    this.auth = auth;
    this.active = active;
  }
  
  async upvoteCount(){
    let question = this.id;
    let result = await Answers.aggregate([
      {$match: {question, value: true}}, 
      {$group:{_id: null, count: {$sum: 1}}}
    ]);
    return _.get(result, '[0].count', 0);
  }
  async downvoteCount(){
    let question = this.id;
    let result = await Answers.aggregate([
      {$match: {question, value: false}}, 
      {$group:{_id: null, count: {$sum: 1}}}
    ]);
    return _.get(result, '[0].count', 0);
  }
}

class QuestionData{
  constructor(auth){
    this.auth = auth;
  }
  async activeCount(){
    let [{count}] = await Questions.aggregate([{$match: {auth: this.auth, active: true}}, 
      {$group: {_id: null, count: {$sum: 1}}}]).exec();
    return count;
  }
  async activeQuestions(){
    let questions = await Questions.find({auth: this.auth, active: true}).exec();
    questions = questions.map((questionDoc)=>{
      return new Question(questionDoc);
    })
    return questions;
  }
}

class Auth {
  constructor(email){
    this.email = email;
  }
  async id(){
    let email = this.email;
    let {_id} = await Auths.findOne({email}).exec()
    return _id;
  }
  async role(){
    let email = this.email;
    let {role} = await Auths.findOne({email}).exec()
    return role;
  }
  async user(){
    let auth = await this.id();
    let user = await Users.findOne({auth}).exec();
    return user;
  }

  async membership(){
    let auth = await this.id();
    let membershipDoc = await Membership.findOne({auth}).exec();
    let membership = new MembershipData(membershipDoc);
    return membership;
  }

  async questionData(){
    let auth = await this.id();
    let questionData = new QuestionData(auth);
    return questionData;
  }
}


async function createUser({inputs}){
  const {
    email,
    first_name, 
    last_name, 
    password, 
    company_name, 
    phone
  } = inputs;
  
  const {_id: auth} = await new Auths({email, password, role: "client"}).save();
  const { id: customerId} = await Stripe.create("customers", {
    metadata: {
      auth: auth.toString()
    }
  });

  let surveyTemplate = new SurveyTemplates({auth}).save();
  let membership = new Membership({auth, customerId}).save();
  let questions = Questions.create( [
    {
        auth,
        question: "Did your experience go well?"
    },
    {
        auth,
        question: "Have you been here before?"
    },
    {
        auth,
        question: "Would you recommend us?"
    }
  ]);
  await Promise.all([surveyTemplate, membership, questions]);

  let user = await new Users({auth, first_name, last_name, company_name, phone }).save();
  return user;
}

async function removeAllRecords({email}){
  let authDoc = await Auths.findOne({email}).exec();
  if( authDoc == null ) return false;
  let auth = authDoc._id;
  let membership = await Membership.findOne({auth}).exec();
  if( membership == null ) return false;
  let { customerId } = membership;
  await Promise.all([
    Auths.find({_id: auth}).remove().exec(),
    Users.find({auth}).remove().exec(),
    SurveyTemplates.find({auth}).remove().exec(),
    Questions.find({auth}).remove().exec(),
    Answers.find({auth}).remove().exec(),
    Membership.find({auth}).remove().exec(),
    Stripe.remove("customers", customerId)
  ]);
  return true;
}

const admin = {
  removeAllRecords
}

const registration = {
  createUser
}

const user = ({auth}) => {
  return Users.findOne({auth}).exec();
}
const auth = ({ email }) => {
  let thing = new Auth(email);
  return thing;
}

const root = {
  user,
  auth,
  registration
};

module.exports = function (app) {
    app.use('/graphql', graphQL({
        schema: schema,
        rootValue: root,
        graphiql: false,
    }));
};