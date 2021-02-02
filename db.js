#!/usr/bin/env node
const { MONGODB } = process.env;

if(!MONGODB){
  throw new Error('MONGODB connection string is not defined in the environment');
}
/*=====================================
  Init
=======================================*/
const mongoose = require('mongoose');

/* - Overwrite mongoose promises with native promises - */
mongoose.Promise = Promise;

/*=====================================
   Exports
=======================================*/
/**
 * Mongoose-Connect  Connects to mongo database
 * @param  {[obj]} err Captures error states
 * @return  returns active connection stream
 */

mongoose.connect(MONGODB, { useNewUrlParser: true, autoReconnect: true });

mongoose.connection.on('connected', function () {
  console.log(`Mongoose connected to ${MONGODB}`);
});

mongoose.connection.on('error', function (err) {
  console.log('Mongoose error', err);
});

mongoose.connection.on('disconnected', function () {
  console.log('disconnected');
  console.log(`Connection string: ${MONGODB}`);
});
// If the Node process ends, close the Mongoose connection
process.on('SIGINT', function () {
  mongoose.connection.close(function () {
    console.log('Mongoose disconnected via app termination');
    process.exit(0);
  });
});

exports.mongoose = mongoose;