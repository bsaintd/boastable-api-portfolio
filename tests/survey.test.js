var path = require('path');
var request = require('supertest');
var app = require(path.join('../app.js'))
let adminToken, token;

const testEmail = 'tester@gmail.com';
const testPassword = '123qweQWE';
const boastableName = 'supertest';

beforeEach(() => {
  let establishAdmin = request(app)
    .post('/login')
    .send({
      email: "ryan@fueledonbacon.com",
      password: "123qweQWE"
    })
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(function({ body }){
      adminToken = `bearer ${body.token}`;
      return adminToken;
    });

  let registerNewUser = () => request(app)
    .post('/register')
    .send({
      email: testEmail,
      password: testPassword
    })
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .then(({ body }) => {
      token = `bearer ${body.token}`;
      return expect(body.token).toBeDefined();
    });

  let subscribeNewUser = () => request(app)
    .post('/subscription')
    .send({})
    .set('Authorization', token)
    .set('Accept', 'application/json')
    .expect(200);

  let assignBoastableName = () => request(app)
    .put('/user')
    .send({
      boastable_name: boastableName,
      phone: '+15617326340'
    })
    .set('Authorization', token)
    .set('Accept', 'application/json')
    .expect(200);

  return establishAdmin
  .then(registerNewUser)
  .then(subscribeNewUser)
  .then(assignBoastableName);
});

xdescribe("surveys", () =>  {
  it("should send a test survey", (done) => {
    return request(app)
      .post('/survey')
      .set('Authorization', token)
      .then(({ body }) => {
        let { test } = body;
        expect(test).toBe(true);
        expect(body).toBeDefined();
        done();
      });
  });

  it("should send an SMS survey", () => {
    return request(app)
      .post('/survey')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .send({ phone: '+15615236863' })
      .expect(200);
  });

  it("should send an email survey", () => {
    return request(app)
      .post('/survey')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .send({
        email: 'sendto@gmail.com'
      })
      .expect(200);
  });

  it("should decrement smsRemaining after each send", () => {
    const sendSurvey = () => request(app)
      .post('/survey')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .send({ phone: '+15615236863' })
      .expect(200);

    const getMembership = () => request(app)
      .get('/membership')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .then(({ body }) => expect(body.smsRemaining).toBe(9));

      return sendSurvey().then(getMembership);
  });

  it("should only let no-card trial users send 10", () => {
    let aggregatePromise;
    const sendARequest = () => request(app)
      .post('/survey')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .send({ phone: '+15615236863' })
      .expect(200);

    aggregatePromise = sendARequest();
    for(var i = 0; i < 9; i++){
      aggregatePromise = aggregatePromise.then(sendARequest);
    }
    // this is the 11th sms
    return aggregatePromise.then(() => request(app)
      .post('/survey')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .send({ phone: '+15615236863' })
      .expect(401));
  });


  it("should not send if membership status is 'canceled'", () => {
    const cancelMembership = () => request(app)
      .delete('/membership')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(200);

    const sendSurvey = () => request(app)
      .post('/survey')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .send({ phone: '+15615236863' })
      .expect(401);

    return cancelMembership().then(sendSurvey);
  });
});

describe("headless survey", () => {
  it("recognizes a keyphrase to respond with a survey to a random number", () => {
    return request(app)
      .post('/twilio/inbound')
      .send({
        From: '+15615236863',
        Body: boastableName
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it("rejects if business not found", () => {
    return request(app)
      .post('/twilio/inbound')
      .send({
        From: '+15615236863',
        Body: 'random'
      })
      .set('Accept', 'application/json')
      .expect(404);
  });

  it("recognizes a valid number", () => {
    return request(app)
      .post('/twilio/inbound')
      .send({
        From: '+15617326340',
        Body: '+15615236863'
      })
      .set('Accept', 'application/json')
      .expect(200);
  });
})

xdescribe("demo survey", () => {
  it("rejects a empty string", () => {
    return request(app).get('/demo/')
      .expect(404);
  });
  it("should accept a phone number with no authentication", () => {
    return request(app).get('/demo/5615236863')
      .expect(200);
  });
  it("should reject invalid phone numbers", () => {
    return request(app).get('/demo/5555555555')
      .expect(400);
  });
  it("send a survey to an email if requested", () => {
    return request(app).get('/demo/rtcx86@gmail.com')
      .expect(200);
  });
  it("rejects a nonsense string", () => {
    return request(app).get('/demo/asdf')
      .expect(400);
  });
  xit("have rate limiting", () => {});
});

describe("batch surveys", () => {
  xit("sends if you have a pro plan", () => {});
  xit("does not send if you have a basic plan", () => {});
  xit("accepts an array of phone numbers and email addresses", () => {});
});

describe("survey model", () => {
  xit("should have a timeToSend field", () => {});
});

afterEach(() => {
  /**
   * @function tears down the user that was just created
   */
  return request(app)
    .delete(`/membership/permanent/${testEmail}`)
    .set('Accept', 'application/json')
    .set('Authorization', adminToken)
    .expect(200);
});