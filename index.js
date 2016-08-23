var exec = require('child_process').exec
  , fs = require('fs')
  , semver = require('semver')
  , patterns = require('./patterns');

// We separate require("typescript") and require("./tspatterns") so that errors
// with the latter are not disguised as problems with the typescript package.
var typescript;
try {
  typescript = require("typescript");
}
catch (ex) {}

var tspatterns;
if (typescript) {
  tspatterns = require("./tspatterns");
}

var DEFAULT_SEPARATOR = '\n'
  , DEFAULT_ENCODING = 'utf-8';

var exports = module.exports = { name: 'versync' };

module.exports.version = '2.0.0';

var getExtension = function (filename) {
  var parts = filename.split('.');
  return parts.length > 1 ? parts.pop() : '';
};

var count = 0;

module.exports.getVersion = function (filename) {
	var ext = getExtension(filename)
    , result;

  if (!~['js', 'json', 'ts'].indexOf(ext)) {
    throw new Error('unsupported extension ' + ext);
  }

  var data = fs.readFileSync(filename, DEFAULT_ENCODING);
  if (ext === 'json') {
    data = '(' + data + ')';
  }

  if (ext === 'json' || ext === 'js') {
    result = patterns.parse(data);
  }
  else if (ext === "ts") {
    if (!tspatterns) {
      throw new Error("file " + filename + " is a TypeScript file but " +
                      "the package `typescript` is not available; " +
                      "please install it.");
    }
    result = tspatterns.parse(filename, data);
  }

  return result;
};

module.exports.setVersion = function (arr, version) {
  arr.forEach(function (filename) {
    var current = module.exports.getVersion(filename);
    var lines = fs.readFileSync(filename, DEFAULT_ENCODING).split(DEFAULT_SEPARATOR);
    lines[current.line - 1] = lines[current.line - 1].replace(current.version, version);
    fs.writeFileSync(filename, lines.join(DEFAULT_SEPARATOR), DEFAULT_ENCODING);
  });
};

module.exports.commitSourcesAndCreateTag = function (arr, version, callback, options) {
  var addSources = function(callback) {
    var file;
    if (!(file = arr.shift())) return callback();

    exec('git add ' + file, options, function(error, stdout, stderr) {
      if (stderr) console.log(stderr);
      if (error !== null) throw error;
      addSources(callback);
    });
  };

  var commitSources = function(callback) {
    exec('git commit -m "v' + version + '"', options, function(error, stdout, stderr) {
      if (stderr) console.log(stderr);
      if (error !== null) throw error;
      callback();
    });
  };

  var createTag = function(callback) {
    exec('git tag v' + version, options, function(error, stdout, stderr) {
      if (stderr) console.log(stderr);
      if (error !== null) throw error;
      callback();
    });
  };

  addSources(function() {
    commitSources(function() {
      createTag(callback);
    });
  });
};
