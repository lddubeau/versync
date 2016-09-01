/* global require exports */
"use strict";
const exec = require("child_process").exec;
const fs = require("fs");
const path = require("path");
const patterns = require("./patterns");

// We separate require("typescript") and require("./tspatterns") so that errors
// with the latter are not disguised as problems with the typescript package.
let typescript;
try {
  typescript = require("typescript"); // eslint-disable-line global-require
}
catch (ex) {} // eslint-disable-line no-empty

let tspatterns;
if (typescript) {
  tspatterns = require("./tspatterns");  // eslint-disable-line global-require
}

const DEFAULT_SEPARATOR = "\n";
const DEFAULT_ENCODING = "utf-8";

exports.name = "versync";

exports.version = "2.0.0";

/**
 * The exists function provided by fs has been deprecated. Hence this.
 *
 * @param {string} filePath The file we want to check.
 *
 * @returns {boolean} ``true`` if the file exists, ``false`` if not.
 */
exports.existsSync = function existsSync(filePath) {
  try {
    fs.statSync(filePath);
    return true;
  }
  catch (ex) {
    return false;
  }
};

exports.getVersion = function getVersion(filename) {
  const ext = path.extname(filename).slice(1); // Slice to remove the leading dot.
  let result;

  if (["js", "json", "ts"].indexOf(ext) === -1) {
    throw new Error(`unsupported extension ${ext}`);
  }

  let data = fs.readFileSync(filename, DEFAULT_ENCODING);
  if (ext === "json" || ext === "js") {
    if (ext === "json") {
      data = `(${data})`;
    }
    result = patterns.parse(data);
  }
  else if (ext === "ts") {
    if (!tspatterns) {
      throw new Error(`file ${filename} is a TypeScript file but ` +
                      "the package `typescript` is not available; " +
                      "please install it.");
    }
    result = tspatterns.parse(filename, data);
  }

  return result;
};

exports.setVersion = function setVersion(arr, version) {
  arr.forEach((filename) => {
    const current = exports.getVersion(filename);
    const lines = fs.readFileSync(filename, DEFAULT_ENCODING)
          .split(DEFAULT_SEPARATOR);
    lines[current.line - 1] = lines[current.line - 1].replace(current.version,
                                                              version);
    fs.writeFileSync(filename, lines.join(DEFAULT_SEPARATOR), DEFAULT_ENCODING);
  });
};

exports.commitSourcesAndCreateTag = function commitSourcesAndCreateTag(
  arr, version, callback, options) {
  // eslint-disable-next-line no-shadow
  function addSources(callback) {
    const file = arr.shift();
    if (!file) {
      callback();
      return;
    }

    exec(`git add ${file}`, options, (error, stdout, stderr) => {
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
    exec(`git commit -m 'v${version}'`, options, (error, stdout, stderr) => {
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
    exec(`git tag v${version}`, options, (error, stdout, stderr) => {
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
