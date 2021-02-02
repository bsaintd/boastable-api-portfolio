require('../app');

var
  { configureStripePlan } = require('../utils/validations'),
  Validations = require('../utils/validations'),
  subscriptionUpdate = require('../testData/subscriptionUpdateHook.json'),
  httpMocks = require('node-mocks-http');


describe("inbound headless query ", () => {
  it("should work with boastable names", (done)=>{
    let req = httpMocks.createRequest({
      body: {
        Body: 'abc',
        From: '+15615236863'
      }
    });
    let res = httpMocks.createResponse();
    Validations.shapeInboundQuery(req, res, (err) => {
      expect(err).toBeUndefined();
      expect(req.boastableClient).toEqual({ boastable_name: 'abc' });
      expect(req.customerQuery).toEqual({ phone: '+15615236863' });
      done();
    })
  })

  it("should work with phone numbers", (done)=>{
    let req = httpMocks.createRequest({
      body: {
        Body: '+15617326340',
        From: '+15615236863'
      }
    });
    let res = httpMocks.createResponse();
    Validations.shapeInboundQuery(req, res, (err) => {
      expect(err).toBeUndefined();
      expect(req.boastableClient).toEqual({ phone: '+15615236863' });
      done();
    })
  })
})
xdescribe("accepting the webhook to update a membership", () => {
  it("should grab WHO it needs to update, and to what", (done) =>{
    let req = httpMocks.createRequest({
      body: subscriptionUpdate
    });
    expect(Validations.membershipWebhook).toBeDefined();
    Validations.membershipWebhook(req, null, (err) => {
      expect(req.membershipUpdate.query.auth).toBeDefined();
      expect(req.membershipUpdate.body.status).toBeDefined();
      done();
    });
  });
});

xdescribe("configure stripe plan", () => {
  it("should work fine with nothing entered", (done)=> {
    let req = httpMocks.createRequest({});
    configureStripePlan(req, null, (err)=>{
      expect(req.body.plan).toBeTruthy();
      done();
    });
  })
})

describe("extract membership status", () => {
  it("should default to canceled", (done)=>{
    var status = Validations.extractMembershipStatus({});
    expect(status).toBe('canceled');
    done()
  });

  it("should reply trial for trialing", (done)=>{
    var status = Validations.extractMembershipStatus({
      subscriptions:{
        data: [
          {
            status: 'trialing'
          }
        ]
      }
    });
    expect(status).toBe('trial');
    done()
  })

  it("should reply active for active", (done)=>{
    var status = Validations.extractMembershipStatus({
      subscriptions:{
        data: [
          {
            status: 'active'
          }
        ]
      }
    });
    expect(status).toBe('active');
    done()
  })

  it("membership status update middleware", (done)=>{
    let req = httpMocks.createRequest({
      stripeObj: {
        subscriptions:{
          data: [
            {
              status: 'active'
            }
          ]
        }
      }
    });
    var testFunc = Validations.prepareMembershipStatusUpdate('stripeObj');
    testFunc(req, null, (err) => {
      expect(req.body.status).toBe('active');
      done();
    })
  })
});

describe("phone email test", ()=>{
  it("should recognize a phone number", (done) => {
    let req = httpMocks.createRequest({
      params: {
        input: '5615236863'
      }
    });
    let res = httpMocks.createResponse();
    let testFunction = Validations.isPhoneOrEmail('params.input', 'testOut');
    testFunction(req, res, (err) => {
      expect(req.testOut).toEqual({
        phone: '+15615236863'
      });
      done();
    });
  })
  it("should recognize an email", (done) => {
    let req = httpMocks.createRequest({
      params: {
        input: 'rtcx86@gmail.com'
      }
    });
    let res = httpMocks.createResponse();
    let testFunction = Validations.isPhoneOrEmail('params.input', 'testOut');
    testFunction(req, res, (err) => {
      expect(req.testOut).toEqual({
        email: 'rtcx86@gmail.com'
      });
      done();
    });
  })
  it("should reject empty objects", (done) => {
    let req = httpMocks.createRequest({
      params: {
      }
    });
    let res = httpMocks.createResponse();
    let testFunction = Validations.isPhoneOrEmail('params.input', 'testOut');
    testFunction(req, res, (err) => {
      expect(res.statusCode).toBe(404);
      done();
    });
  });
  it("should reject empty objects", (done) => {
    let req = httpMocks.createRequest({
      params: {
        input: 'nonsense'
      }
    });
    let res = httpMocks.createResponse();
    let testFunction = Validations.isPhoneOrEmail('params.input', 'testOut');
    testFunction(req, res, (err) => {
      expect(res.statusCode).toBe(400);
      done();
    });
  });
})