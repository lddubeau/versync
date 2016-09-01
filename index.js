/* global require module */
"use strict";
var exec = require("child_process").exec;
var fs = require("fs");
var path = require("path");
var patterns = require("./patterns");

// We separate require("typescript") and require("./tspatterns") so that errors
// with the latter are not disguised as problems with the typescript package.
var typescript;
try {
  typescript = require("typescript"); // eslint-disable-line global-require
}
catch (ex) {} // eslint-disable-line no-empty

var tspatterns;
if (typescript) {
  tspatterns = require("./tspatterns");  // eslint-disable-line global-require
}

var DEFAULT_SEPARATOR = "\n";
var DEFAULT_ENCODING = "utf-8";

module.exports = { name: "versync" };

module.exports.version = "2.0.0";

module.exports.getVersion = function getVersion(filename) {
  var ext = path.extname(filename).slice(1); // Slice to remove the leading dot.
  var result;

  if (!~["js", "json", "ts"].indexOf(ext)) {
    throw new Error("unsupported extension " + ext);
  }

  var data = fs.readFileSync(filename, DEFAULT_ENCODING);
  if (ext === "json") {
    data = "(" + data + ")";
  }

  if (ext === "json" || ext === "js") {
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

module.exports.setVersion = function setVersion(arr, version) {
  arr.forEach(function each(filename) {
    var current = module.exports.getVersion(filename);
    var lines = fs.readFileSync(filename, DEFAULT_ENCODING)
          .split(DEFAULT_SEPARATOR);
    lines[current.line - 1] = lines[current.line - 1].replace(current.version,
                                                              version);
    fs.writeFileSync(filename, lines.join(DEFAULT_SEPARATOR), DEFAULT_ENCODING);
  });
};

module.exports.commitSourcesAndCreateTag = function commitSourcesAndCreateTag(
  arr, version, callback, options) {
  // eslint-disable-next-line no-shadow
  function addSources(callback) {
    var file = arr.shift();
    if (!file) {
      callback();
      return;
    }

    exec("git add " + file, options, function execDone(error, stdout, stderr) {
      if (stderr) {
        // eslint-disable-next-line no-console
        console.log(stderr);
      }

      if (error !== null) throw error;
      addSources(callback);
    });
  }

  // eslint-disable-next-line no-shadow
  function commitSources(callback) {
    exec("git commit -m 'v" + version + "'", options,
         function execDone(error, stdout, stderr) {
           if (stderr) {
             // eslint-disable-next-line no-console
             console.log(stderr);
           }

           if (error !== null) {
             throw error;
           }

           callback();
         });
  }

  // eslint-disable-next-line no-shadow
  function createTag(callback) {
    exec("git tag v" + version, options,
         function execDone(error, stdout, stderr) {
           if (stderr) {
             // eslint-disable-next-line no-console
             console.log(stderr);
           }

           if (error !== null) {
             throw error;
           }
           callback();
         });
  }

  addSources(commitSources.bind(undefined, createTag.bind(undefined, callback)));
};
