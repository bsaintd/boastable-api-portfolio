const mongoose = require('mongoose');
const _ = require('lodash');
const Validations = require("./validations");
const  { permitRoles, runIfRoles } = require("auth_module/middleware");
const  { CrudFactory, Manipulate } = require("utilities_middleware");
const  { setToAuthId, move, copy } = Manipulate;
const  Users = CrudFactory(mongoose.model('User'));
const  Auths = CrudFactory(mongoose.model('Auth'));

module.exports.adminAllClientSelf = target => {
  return [
    permitRoles(["admin", "client"]),
    runIfRoles(["client"], setToAuthId(target))
  ];
};

module.exports.duplicatePhoneCheck = (phonePath) => {
  return [
    move(phonePath, "secondaryQuery.phone"),
    Users.readFromTo("secondaryQuery", 'userData'),
    Validations.newIfEmpty('userData'),
  ];
};

module.exports.duplicateEmailCheck = (emailPath) => {
  return [
    move(emailPath, "emailQuery.email"),
    Auths.readFromTo('emailQuery', 'auth'),
    Validations.newIfEmpty('auth'),
  ];
};

module.exports.stopIfDuplicatePhone = (phonePath) => {
  return [
    move(phonePath, "phoneQuery.phone"),
    Users.readFromTo("phoneQuery", 'userData'),
    Validations.newIfEmpty('userData'),
    Validations.continueIfTrue('isNew.new', "Can't use that phone number, it's associated with another account.", 400),
  ];
};

module.exports.noDuplicatePhone = (phonePath) => {
  return Validations.runIfTrue(phonePath, [
    copy(phonePath, "phoneQuery.phone"),
    Users.read("phoneQuery", "userData"),
    Validations.stopIfFalse((req) => _.isEmpty(req.userData), "That phone number is already associated with another account", 400)
  ]);
};

module.exports.noDuplicateEmail = (emailPath) => {
  return Validations.runIfTrue(emailPath, [
    copy(emailPath, "emailQuery.email"),
    Auths.read("emailQuery", "authData"),
    Validations.stopIfFalse((req) => _.isEmpty(req.authData), "That email is already associated with another account", 400)
  ]);
};

module.exports.noDuplicateBoastableName = (boastableNamePath) => {
  return Validations.runIfTrue(boastableNamePath, [
    copy(boastableNamePath, "boastableNameQuery.boastable_name"),
    Users.read("boastableNameQuery", "userData"),
    Validations.stopIfFalse((req) => _.isEmpty(req.userData), "That Boastable name is already associated with another account", 400)
  ]);
};

module.exports.stopIfDuplicateEmail = (emailPath) => {
  return [
    move(emailPath, "secondaryQuery.email"),
    Auths.readFromTo("secondaryQuery", 'authData'),
    Validations.newIfEmpty('authData'),
    Validations.continueIfTrue('isNew.new', "Can't use that email address, it's associated with another account.", 400),
  ];
};

module.exports.stopIfDuplicateBoastableName = (boastableNamePath) => {
  return [
    copy(boastableNamePath, "boastableNameQuery.boastable_name"),
    Users.read("boastableNameQuery", 'userData'),
    Validations.stopIfFalse((req) => _.isEmpty(req.userData), "Can't use that Boastable name, it's associated with another account.", 400),
  ];
};