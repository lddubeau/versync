/* global require exports */
"use strict";
const exec = require("child_process").exec;
const Promise = require("bluebird");
const fs = require("fs-extra");
const path = require("path");
const patterns = require("./patterns");
const semver = require("semver");
const EventEmitter = require("events").EventEmitter;
require("colors");

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

exports.version = "3.1.1";

class InvalidVersionError extends Error {
  constructor(message) {
    super(message);
    this.message = message;
    this.name = "InvalidVersionError";
  }
}

exports.InvalidVersionError = InvalidVersionError;


class ExecutionError extends Error {
  constructor(message, originalError, stderr, stdout) {
    super(message);
    this.message = message;
    this.originalError = originalError;
    this.stderr = stderr;
    this.stdout = stdout;
    this.name = "ExecutionError";
  }
}

function execAsync(command, options) {
  return new Promise((resolve, reject) => {
    exec(command, options, (err, stdout, stderr) => {
      if (err) {
        reject(new ExecutionError(`${command} failed`, err, stderr, stdout));
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}


/**
 * Get a list of sources to process. This list includes by default
 * ``package.json``, ``component.json`` and ``bower.json``. It also includes the
 * files specified by the ``versionedSources`` key in ``package.json``.
 *
 * @param {Array.<string>} extraSources An array of additional sources to
 * include.
 *
 * @returns {Promise<Array.<string>>} The sources. Duplicates are automatically
 * removed.
 */
exports.getSources = function getSources(extraSources) {
  // We support both bower variants and do not add these unless they exist.
  return Promise.filter(["component.json", "bower.json"],
                        source => fs.stat(source).catch(() => false))
    .then(sources => ["package.json"].concat(sources))
    .then(sources => ((extraSources && extraSources.length) ?
          sources.concat(extraSources) : sources))
    .then(sources =>
          fs.readFile("package.json", "utf-8").then((data) => {
            const pkg = JSON.parse(data);
            const versionedSources = pkg.versionedSources;
            if (versionedSources) {
              if (versionedSources instanceof Array) {
                sources = sources.concat(versionedSources);
              }
              else {
                if (versionedSources.indexOf(",") !== -1) {
                  console.warn( // eslint-disable-line no-console
                    "WARNING: the use of comma in versionedSources is " +
                      "deprecated.");
                }
                sources = sources.concat(versionedSources.split(","));
              }
            }

            return sources;
          }))
  // We filter out any duplicates from the srcs array to prevent confusion
  // in the output.
    .then(sources => sources.filter(
      (val, idx, arr) => arr.indexOf(val) === idx));
};

/**
 * @typedef {Object} VersionInfo
 * @property {string} version The version number.
 * @property {Number} line The line number where the version was found.
 */

/**
 * Get a version from a file.
 *
 * @param {string} filename The name of the file from which to extract a
 * version.
 *
 * @return {Promise<VersionInfo|undefined>} The version information or
 * ``undefined`` if no version can be found.
 *
 * @throws {Error} If ``filename`` is a TypeScript file but the optional
 * TypeScript support is not available.
 */
exports.getVersion = Promise.method((filename) => {
  const ext = path.extname(filename).slice(1); // Slice: remove the leading dot.
  if (["js", "json", "ts"].indexOf(ext) === -1) {
    throw new Error(`unsupported extension ${ext}`);
  }

  if (ext === "ts" && !tspatterns) {
    throw new Error(`file ${filename} is a TypeScript file but ` +
                    "the package `typescript` is not available; " +
                    "please install it.");
  }

  return fs.readFile(filename, DEFAULT_ENCODING).then((data) => {
    if (ext === "json" || ext === "js") {
      if (ext === "json") {
        data = `(${data})`;
      }
      return patterns.parse(data);
    }

    if (ext === "ts") {
      return tspatterns.parse(filename, data);
    }

    throw new Error("should not get here!!");
  });
});

/**
 * Get a valid version from a file.
 *
 * @param {string} filename The name of the file from which to extract a
 * version.
 *
 * @return {VersionInfo} The version information.
 *
 * @throws {InvalidVersionError} If the version is not a valid semver version.
 */
exports.getValidVersion = function getValidVersion(filename) {
  return exports.getVersion(filename).then((current) => {
    const version = current && current.version;
    if (!version) {
      throw new InvalidVersionError(`Missing version number in ${filename}.`);
    }

    if (!semver.valid(version)) {
      throw new InvalidVersionError(
        `Invalid semver number in ${filename}. Found: ${version}`);
    }

    return current;
  });
};


/**
 * Verify that the version numbers in a set of files are all equal to an
 * expected version number. Files fail the verification if:
 *
 * - They do not contain a version number.
 *
 * - The version number is not a valid semver number.
 *
 * - The version number is not the expected version.
 *
 * @param {Array.<string>} filenames The files whose version number must be
 * verified.
 *
 * @param {string} expectedVersion The version we expect to find in the files.
 *
 * @returns {Promise<Array.<string> >} The files whose version numbers are not
 * the expected version. This promise will be rejected if any file does not
 * contain a version number or the version number is not a valid semver number.
 */
exports.verify = function verify(filenames, expectedVersion) {
  return Promise.filter(filenames,
    source => exports.getValidVersion(source)
                        .then(current => current.version !== expectedVersion));
};


/**
 * Sets the version number of a set of files. The files must already contain
 * version numbers that can be extracted with ``getVersion``.
 *
 * @param {Array.<string>} filenames The files whose version must be set.
 *
 * @param {string} version The version number to which the files must be set.
 *
 * @returns {Promise} A promise that resolves once the operation is completed.
 */
exports.setVersion = function setVersion(filenames, version) {
  return Promise.all(Promise.map(filenames, filename =>
    exports.getVersion(filename).then(
      current => fs.readFile(filename, DEFAULT_ENCODING).then((data) => {
        if (!current) {
          throw new Error(`Missing version number in ${filename}.`);
        }
        const lines = data.split(DEFAULT_SEPARATOR);
        const ix = current.line - 1;
        lines[ix] = lines[ix].replace(current.version, version);
        return fs.writeFile(filename, lines.join(DEFAULT_SEPARATOR),
                            DEFAULT_ENCODING);
      }))));
};

/**
 * A valid semver, or one of the values ``"major"``, ``"minor"``, ``"patch"``.
 * @typedef {string} BumpSpecification
 *
 * A bump specification is used to specify how to bump a version number, which
 * we shall name ``version`` here. If the specification is a valid semver higher
 * than ``version`` then the value of the specification becomes the new
 * version. If the specification is one of ``"major"``, ``"minor"``,
 * ``"patch"``, then ``version`` is bumped by incrementing the relevant part.
 */

/**
 * Compute a "bumped" version number.
 *
 * @param {string} version The version to bump.
 *
 * @param {BumpSpecification} bump How to bump it.
 *
 * @returns {string} The bumped up version number.
 *
 * @throws {Error} If ``bump`` is not one of the values described above.
 */
exports.bumpVersion = function bumpVersion(version, bump) {
  if (!semver.valid(version)) {
    throw new Error("The version number is not a valid semver number.");
  }

  if (semver.valid(bump) && semver.gt(bump, version)) {
    version = bump;
  }
  else if (["major", "minor", "patch"].indexOf(bump) !== -1) {
    version = semver.inc(version, bump);
  }
  else {
    throw new Error(`Invalid bump specification, please use \
${"major, minor, patch".bold}, or specify a custom version that is higher \
than the current one.`);
  }

  return version;
};

class Runner {
  /**
   * A ``Runner`` orchestrates the operations to be performed on a package. The
   * ``options`` param determines what operations to run.
   *
   * As it runs, the runner will emit ``message`` events that contain
   * information meant for the end user. Errors are not reported through
   * ``message`` events but by rejection of the promises returned by the various
   * methods of this class.
   *
   * @param {Object} options The new ``Runner``'s options.
   *
   * @param {Array.<string>} [options.sources] Additional sources to
   * process. ``package.json`` is always processed. ``component.json`` and
   * ``bower.json`` are processed if they exist.
   *
   * @param {boolean} [options.verify] Whether to verify the version
   * number in the sources.
   *
   * @param {BumpSpecification} [options.bump] If set, bump the version
   * number. The value specifies how to bump it. Setting this option will cause
   * a verification to happen even if ``options.verify`` is not true.
   *
   * @param {boolean} [options.tag] If set, then after bumping the version
   * number, run ``git`` to commit the sources and create a tag that has for
   * name the new version number, preceded by ``v``. Setting this option
   * requires that ``options.bump`` be set to a valid value.
   *
   * @param {Function|Array.<Function>} [options.onMessage] One or more
   * functions to be immediately passed to the ``onMessage`` method.
   *
   */
  constructor(options) {
    this._options = options || {};
    this._emitter = new EventEmitter();
    this._cachedSources = undefined;
    this._cachedCurrent = undefined;

    let onMessage = this._options.onMessage;
    if (onMessage) {
      if (typeof onMessage === "function") {
        onMessage = [onMessage];
      }

      for (const listener of onMessage) {
        this.onMessage(listener);
      }
    }
  }

  _emitMessage(message) {
    this._emitter.emit("message", message);
  }

  /**
   * Install a listener that will receive all ``message`` events.
   *
   * @param {Function} listener The listener to install.
   */
  onMessage(listener) {
    this._emitter.on("message", listener);
  }

  /**
   * Verify the sources.
   *
   * @returns {Promise} A promise that will be rejected if there is any error,
   * or will be resolved if the verification is successful.
   */
  verify() {
    return Promise.join(
      this.getCurrent(),
      this.getSources(),
      (current, sources) => {
        const version = current.version;
        return exports.verify(sources, version).then((errSources) => {
          if (errSources.length > 0) {
            throw new Error(`Version number is out of sync in \
${errSources.join(", ").red}.`);
          }
          else {
            this._emitMessage(`Everything is in sync, the version number is \
${version.bold.green}.`);
          }
        });
      });
  }

  /**
   * Get the sources known to this ``Runner`` instance.  These include by
   * default ``package.json``, ``component.json`` and ``bower.json``. It also
   * includes the files specified by the ``versionedSources`` key in
   * ``package.json``, and anything passed in ``options.sources`` when this
   * instance was created.
   *
   * @returns {Promise<Array.<string> >} The sources. Duplicates are
   * automatically removed.
   */
  getSources() {
    if (this._cachedSources) {
      return this._cachedSources;
    }

    const sources = this._cachedSources =
            exports.getSources(this._options.sources);
    return sources;
  }

  /**
   * Get the current version number information from ``package.json``.
   *
   * @returns {Promise<VersionInfo>} The version. The promise will be rejected
   * if the version is not considered valid. (See ``getValidVersion``.)
   */
  getCurrent() {
    if (this._cachedCurrent) {
      return this._cachedCurrent;
    }

    const current = this._cachedCurrent =
            exports.getValidVersion("package.json");
    return current;
  }

  /**
   * Set the version number in the sources.
   *
   * @returns {Promise} A promise that is resolved once the operation is
   * done. This promise will be rejected if any error occurs during the
   * operation.
   */
  setVersion(version) {
    return this.getSources().then(
      sources => exports.setVersion(sources, version).then(() => {
        this._emitMessage(`Version number was updated to ${version.bold.green} \
in ${sources.join(", ").bold}.`);
      }));
  }

  _commitSourcesAndCreateTag(version) {
    return this.getSources().then(
      sources => Promise.each(sources, file => execAsync(`git add ${file}`)))
      .then(() => execAsync(`git commit -m 'v${version}'`))
      .then(() => execAsync(`git tag v${version}`))
      .then(() => this._emitMessage(`Files have been committed and tag \
${`v${version}`.bold.green} was created.`));
  }

  /**
   * Run the operations that were specified by the options passed to this
   * instance's constructor.
   *
   * @returns {Promise} A promise that resolves once the operations are
   * successful, or rejects if they are not.
   */
  run() {
    const options = this._options;
    const bump = options.bump;
    const tag = options.tag;
    return Promise
      .try(() => ((options.verify || bump || tag) ? this.verify() : undefined))
      .then(() => this.getCurrent())
      .get("version")
      .then((version) => {
        if (!(bump || tag)) {
          return undefined;
        }

        version = exports.bumpVersion(version, bump);

        return this.setVersion(version).then(
          () => (tag ? this._commitSourcesAndCreateTag(version) : undefined));
      });
  }
}

exports.Runner = Runner;

exports.run = function run(options) {
  return new Runner(options).run();
};
