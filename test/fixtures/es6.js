// This is actually only partially es6. We'd normally export the version number
// using `export const version...` but there are some cases where we have to
// write code that is not quite ES6 yet. This file models that.
let exports = module.exports = {};

exports.version = '0.0.7';
