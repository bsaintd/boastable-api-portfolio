require('dotenv').load();
require('../db');
const { CrudFactory }  = require("utilities_middleware");
const { model } = require('stripe_integration');
const Memberships = CrudFactory(model);
const httpMocks = require('node-mocks-http');
let id;
beforeEach((done)=>{
  let req = httpMocks.createRequest({
    member: {
      auth: '5bd38883005480acffb1f424',
      smsRemaining: 10,
    }
  });
  let res = httpMocks.createResponse();
  let testFunction = Memberships.create('member', 'created');
  testFunction(req, res, (err)=>{
    expect(err).toBeUndefined();
    id = req.created._id;
    done();
  })
})
describe("memberships", ()=>{
  it("should decrement the membership", (done) => {
    let req = httpMocks.createRequest({
      query: {_id: id},
      body: {
        smsRemaining: -1,
      }
    });
    let res = httpMocks.createResponse();
    Memberships.increment(req, res, (err)=>{
      expect(err).toBeUndefined();
      expect(req.data.smsRemaining).toBe(9);
      done()
    })
  })
})

afterEach((done)=>{
  let req = httpMocks.createRequest({
    stuff: { _id: id }
  });
  let res = httpMocks.createResponse();
  let testFunction = Memberships.remove('stuff');
  testFunction(req, res, (err)=>{
    expect(err).toBeUndefined();
    done();
  })
});