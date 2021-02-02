var path = require('path');
var request = require('supertest');
var app = require(path.join('../app.js'))
let adminToken, token;

const testEmail = 'mike@gmail.com';
const testPassword = '123qweQWE';

beforeAll((done) => {
  return request(app)
    .post('/login')
    .send({
      email: "ryan@fueledonbacon.com",
      password: "123qweQWE"
    })
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200)
    .then(function(response){
      adminToken = 'bearer '+response.body.token;
      done();
    });
});

xdescribe("registration", () => {
  it("should have an adminToken and user token cleanup before testing", () => {
    expect(adminToken).toBeTruthy();
  });

  it("create a user", ()=> {
    return request(app)
      .post('/register')
      .send({
        email: testEmail,
        password: testPassword
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .then(response => {
        token = response.body.token;
        return expect(response.body.token).toBeDefined();
      });
  });

  it("should be able to login with the new user", ()=> {
    return request(app)
      .post('/login')
      .send({
        email: testEmail,
        password: testPassword
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(function(response){
        token = 'bearer '+response.body.token;
        return expect(response.body.token).toBeTruthy();
      });
  });

  it("should have a user document", ()=> {
    return request(app)
      .get('/user')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .then((response) => {
        return expect(Object.keys(response.body).length).toBeGreaterThan(1);
      });
  });

  it("should not allow regular user to access admin route", ()=> {
    return request(app)
      .get('/auth?email=ryan@fueledonbacon.com')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(401)
      .then(({ body }) => {
        return expect(body.message).toMatch(/Not authorized/);
      });
  });

  it("should have a membership(stripe) document", ()=> {
    return request(app)
      .get('/membership')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(200)
      .then((response) => {
        let {status} = response.body;
        expect(status).toBe('inactive');
        return expect(response.body.customer).toBeTruthy();
      });
  });

  it("should have a default question documents", ()=> {
    return request(app)
      .get('/question/list')
      .set('Accept', 'application/json')
      .set('Authorization', token)
      .expect(200)
      .then((response) => {
        return expect(response.body.length).toBe(3);
      });
  });

  it("should have a survey template document", () => {
    return request(app)
      .get('/survey-template')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(200)
      .then((response) => {
        return expect(Object.keys(response.body).length).toBeTruthy();
      });
  });

  it("should be able to subscribe a new user without credit card", () => {
    // will need a fresh user every time to test this one
    let createSubscription = request(app)
      .post('/subscription')
      .send({})
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(200);

    return createSubscription
      .then(() => {
        return request(app)
          .get('/membership')
          .set('Authorization', token)
          .set('Accept', 'application/json')
          .expect(200);
      })
      .then((response) => {
        let {status, hasCard, smsRemaining, planType} = response.body;
        expect(hasCard).toBe(false);
        expect(smsRemaining).toBe(10);
        expect(planType).toBe('basic');
        return expect(status).toBe('trial');
      });
  });

  it("a new user should have a valid membership status", () => {
    return request(app)
      .get('/membership')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(200)
      .then(({body: membership}) => {
        let {status, hasCard} = membership;
        expect(hasCard).toBe(false);
        return expect(status).toMatch(/inactive|trial|active|canceled/);
      });
  });

  it("returns bad request if no card token given", () => {
    return request(app)
      .post('/stripe/change-card')
      .send({
      })
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(400);
  })

  it("trial - attach credit card, add 100 SMS", () => {

    let proveNoCard = request(app)
      .get('/card')
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(404);
    let changeCard = request(app)
      .post('/stripe/change-card')
      .send({
        source: 'tok_visa'
      })
      .set('Authorization', token)
      .set('Accept', 'application/json')
      .expect(200);

    return proveNoCard
      .then(() => changeCard)
      .then(() => {
        return request(app)
          .get('/membership')
          .set('Authorization', token)
          .set('Accept', 'application/json')
      })
      .then(({body: membership}) => {
        let { status, hasCard, smsRemaining } = membership;
        expect(smsRemaining).toBe(100);
        expect(hasCard).toBe(true);
        return expect(status).toBe('trial');
      })

  });

  it("should be able to cancel (with card attached)", () => {
      return request(app)
        .delete('/membership')
        .set('Authorization', token)
        .set('Accept', 'application/json')
        .expect(200)
        .then(({ body: membership }) => {
          let { status, hasCard } = membership;
          expect(hasCard).toBe(true);
          return expect(status).toBe('canceled');
        });
  });

  it("should be able to renew with a pro membership", () => {
    const renew = request(app)
      .post('/renew/subscription')
      .send({
        plan: 'pro'
      })
      .set('Authorization', token)
      .expect(200);

    const checkMembership = () => request(app)
      .get('/membership')
      .set('Authorization', token)
      .expect(200)
      .then(({ body: membership }) => {
        let { status, hasCard, planType, smsRemaining } = membership;
        expect(planType).toBe('pro');
        expect(smsRemaining).toBe(10000);
        expect(hasCard).toBe(true);
        return expect(status).toBe('active');
      });

    return renew.then(checkMembership);
  });

  it("a basic user should have a 1000 survey monthly recurring limit", () => {
    const cancel = request(app)
        .delete('/membership')
        .set('Authorization', token)
        .set('Accept', 'application/json')
        .expect(200);

    const renew = () => request(app)
        .post('/renew/subscription')
        .send({
          plan: 'basic'
        })
        .set('Authorization', token)
        .expect(200);

    const checkMembership = () => request(app)
        .get('/membership')
        .set('Authorization', token)
        .expect(200)
        .then(({ body: membership }) => {
          let { status, hasCard, planType, smsRemaining } = membership;
          expect(planType).toBe('basic');
          expect(smsRemaining).toBe(1000);
          expect(hasCard).toBe(true);
          return expect(status).toBe('active');
        });
    return cancel.then(renew).then(checkMembership);
  });
});

describe("pro registration", () => {

})

afterAll(() => {
  /**
   * @function tears down the user that was just created
   * delete any documents that were created
   * delete auth
   * delete user
   * delete delete membership associated with auth
   * delete questions associated with auth
   */
  return request(app)
    .delete(`/membership/permanent/${testEmail}`)
    .set('Accept', 'application/json')
    .set('Authorization', adminToken)
    .then((res)=>{
      if(res.status == 200)
        console.log("teardown complete")
      else
        console.log("nothing to teardown")
      return;
    });
})