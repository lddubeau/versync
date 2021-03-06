"use strict";

const { execFile } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const semver = require("semver");
const { EventEmitter } = require("events");
const patterns = require("./patterns");
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
  tspatterns = require("./tspatterns"); // eslint-disable-line global-require
}

const DEFAULT_SEPARATOR = "\n";
const DEFAULT_ENCODING = "utf-8";

exports.name = "versync";

exports.version = "5.0.0";

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

exports.ExecutionError = ExecutionError;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, stdout, stderr) => {
      if (err) {
        reject(new ExecutionError(`${command} ${args.join(" ")} failed`, err,
                                  stderr, stdout));
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

async function delay(timeout) {
  await new Promise(resolve => setTimeout(resolve, timeout));
}

//
// This function tries to execute a git command a certain number of times if it
// fails in a way that indicates that there was a race condition.
//
async function execGit(args) {
  let remaining = 5; // We arbitrarily try 5 times.
  async function attempt() {
    try {
      return execFileAsync("git", args);
    }
    catch (err) {
      //
      // We check for code 128. Some git errors other than a lock file result in
      // an 128 exit code so we *may* be retrying for nothing. However, when a
      // lock file error occurs, the error code is 128. This allows us to not
      // retry for everything.
      //
      if (!(err instanceof ExecutionError) || err.originalError.code !== 128 ||
          --remaining === 0) {
        throw err;
      }

      // Wait a bit before the next try.
      await delay(100);

      return attempt();
    }
  }

  return attempt();
}

/**
 * Get a list of sources to process. This list includes by default
 * ``package.json``. It also includes the files specified by the
 * ``versionedSources`` key in ``package.json``.
 *
 * @param {Array.<string>} extraSources An array of additional sources to
 * include.
 *
 * @returns {Promise<Array.<string>>} The sources. Duplicates are automatically
 * removed.
 */
exports.getSources = async function getSources(extraSources) {
  let sources = ["package.json"].concat(extraSources || []);
  const data = await fs.readFile("package.json", "utf-8");

  const pkg = JSON.parse(data);
  const { versionedSources } = pkg;
  if (versionedSources) {
    if (!(versionedSources instanceof Array ||
          typeof versionedSources === "string")) {
      throw new Error("versionedSources must be an array or a string");
    }

    sources = sources.concat(versionedSources instanceof Array ?
                             versionedSources : [versionedSources]);
  }

  // We filter out any duplicates from the srcs array to prevent confusion
  // in the output.
  return sources.filter((val, idx, arr) => arr.indexOf(val) === idx);
};

/**
 * @typedef {Object} VersionInfo
 * @property {string} version The version number.
 * @property {string} source The file in which the version was found.
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
exports.getVersion = async function getVersion(filename) {
  const ext = path.extname(filename).slice(1); // Slice: remove the leading dot.
  if (["js", "json", "ts"].indexOf(ext) === -1) {
    throw new Error(`unsupported extension ${ext}`);
  }

  if (ext === "ts" && !tspatterns) {
    throw new Error(`file ${filename} is a TypeScript file but the package ` +
                    "`typescript` is not available; please install it.");
  }

  let data = await fs.readFile(filename, DEFAULT_ENCODING);
  let fetched;
  if (ext === "json" || ext === "js") {
    if (ext === "json") {
      data = `(${data})`;
    }
    fetched = patterns.parse(data);
  }
  else if (ext === "ts") {
    fetched = tspatterns.parse(filename, data);
  }
  else {
    throw new Error("should not get here!!");
  }

  return fetched && {
    version: fetched.version,
    line: fetched.line,
    source: filename,
  };
};

/**
 * Get a valid version from a file.
 *
 * @param {string} filename The name of the file from which to extract a
 * version.
 *
 * @return {Promise<VersionInfo>} The version information.
 *
 * @throws {InvalidVersionError} If the version is not a valid semver version.
 */
exports.getValidVersion = async function getValidVersion(filename) {
  const current = await exports.getVersion(filename);
  const version = current && current.version;
  if (!version) {
    throw new InvalidVersionError(`Missing version number in ${filename}.`);
  }

  if (!semver.valid(version)) {
    throw new InvalidVersionError(
      `Invalid semver number in ${filename}. Found: ${version}`);
  }

  return current;
};

/**
 * @typedef {Object} VerifyResult
 * @property {boolean} consistent Whether the version numbers are consistent.
 * @property {Array.<VersionInfo>} versions An array of versions obtained.
 */

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
 * @returns {Promise<VerifyResult>}
 */
exports.verify = async function verify(filenames) {
  if (filenames.length === 0) {
    throw Error("tried to call verify with an empty array");
  }
  const versions =
        await Promise.all(filenames
                          .map(source => exports.getValidVersion(source)));
  const firstVersion = versions[0].version;
  for (const { version } of versions.slice(1)) {
    if (version !== firstVersion) {
      return { consistent: false, versions };
    }
  }

  return { consistent: true, versions };
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
exports.setVersion =
  (filenames, version) => Promise.all(filenames.map(async filename => {
    const current = await exports.getVersion(filename);
    const data = await fs.readFile(filename, DEFAULT_ENCODING);

    if (!current) {
      throw new Error(`Missing version number in ${filename}.`);
    }
    const lines = data.split(DEFAULT_SEPARATOR);
    const ix = current.line - 1;
    lines[ix] = lines[ix].replace(current.version, version);
    return fs.writeFile(filename, lines.join(DEFAULT_SEPARATOR),
                        DEFAULT_ENCODING);
  }));

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

/**
 * A valid semver, or one of the values ``"major"``, ``"minor"``, ``"patch"``,
 * or ``"sync"``.
 * @typedef {string} BumpRequest.
 *
 * A bump request is used to specify how to bump a version number, which we
 * shall name ``version`` here. If the requests is a valid semver higher than
 * ``version`` then the value of the specification becomes the new version. If
 * the request is one of ``"major"``, ``"minor"``, ``"patch"``, then ``version``
 * is bumped by incrementing the relevant part. If the request is ``"sync"``,
 * then ``version`` is changed to the value of the ``version`` field in
 * ``package.json``.
 */

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
   * process. ``package.json`` is always processed.
   *
   * @param {BumpRequest} [options.bump] If set, bump the version
   * number. The value specifies how to bump it.
   *
   * @param {boolean} [options.add] If set, run ``git add`` on the modified
   * files.
   *
   * @param {boolean} [options.tag] If set, then after bumping the version
   * number, run ``git`` to commit the sources and create a tag that has for
   * name the new version number, preceded by ``v``. Setting this option
   * requires that ``options.bump`` be set to a valid value. (Note that this
   * option implies the option ``add``. If this option is set, then setting
   * ``add`` does nothing.)
   *
   * @param {Function|Array.<Function>} [options.onMessage] One or more
   * functions to be immediately passed to the ``onMessage`` method.
   *
   */
  constructor(options) {
    this._options = options || {};
    this._emitter = new EventEmitter();
    this._cachedSources = undefined;
    this._cachedSourcesToModify = undefined;
    this._cachedCurrent = undefined;
    this._sync = this._options.bump === "sync";

    let { onMessage } = this._options;
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
   * @returns {Promise<string>} The current version in the files.
   */
  async verify() {
    const { consistent, versions } =
          await exports.verify(await this.getSourcesToModify());

    if (!consistent) {
      let message = "Version numbers are inconsistent:\n";
      for (const { source, version, line } of versions) {
        message += `${source}:${line}: ${version.red}\n`;
      }
      throw new Error(message);
    }

    const currentVersion = versions[0].version;
    this._emitMessage(
      `${this._sync ? "Version number in files to be synced is" :
                          "Everything is in sync, the version number is"}\
 ${currentVersion.bold.green}.`);
    return currentVersion;
  }

  /**
   * Get the sources known to this ``Runner`` instance.  These include by
   * default ``package.json``. It also includes the files specified by the
   * ``versionedSources`` key in ``package.json``, and anything passed in
   * ``options.sources`` when this instance was created.
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
   * Get the sources known to this ``Runner`` instance, but only those that will
   * need to be modified. If the runner was started with a ``bump`` option
   * different from ``"sync"``, this method returns the same as {@link
   * Runner#getSources getSources}. Otherwise, the returned list is the same
   * except that it excludes ``package.json``, since it won't be modified.
   *
   * @returns {Promise<Array.<string> >} The sources. Duplicates are
   * automatically removed.
   */
  async getSourcesToModify() {
    if (!this._cachedSourcesToModify) {
      let sources = await this.getSources();

      if (this._sync) {
        sources = sources.filter(x => x !== "package.json");
      }

      this._cachedSourcesToModify = sources;
    }

    return this._cachedSourcesToModify;
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
  async setVersion(version) {
    const sources = await this.getSourcesToModify();
    await exports.setVersion(sources, version);
    this._emitMessage(`Version number was updated to ${version.bold.green} \
in ${sources.join(", ").bold}.`);
  }

  async _addSources() {
    const sources = await this.getSources();
    for (const source of sources) {
      // We do not want to run these adds in parallel.
      // eslint-disable-next-line no-await-in-loop
      await execGit(["add", source]);
    }
  }

  async _commitSourcesAndCreateTag(version) {
    await this._addSources();
    await execGit(["commit", "-m", `v${version}`]);
    await execGit(["tag", `v${version}`]);
    this._emitMessage(`Files have been committed and tag \
${`v${version}`.bold.green} was created.`);
  }

  /**
   * Run the operations that were specified by the options passed to this
   * instance's constructor.
   *
   * @returns {Promise} A promise that resolves once the operations are
   * successful, or rejects if they are not.
   */
  async run() {
    const { bump, tag, add } = this._options;
    const [common, current] =
          await Promise.all([this.verify(),
                             this.getCurrent().then(v => v.version)]);

    if (!(bump || tag || add)) {
      return undefined;
    }

    const sources = await this.getSourcesToModify();

    // This may happen if the user is doing a sync and there is no other
    // file than package.json.
    if (sources.length === 0) {
      return undefined;
    }

    let version;
    if (this._sync) {
      if (semver.lt(current, common)) {
        throw new Error(`Version in package.json (${current}) is \
lower than the version found in other files (${common})`);
      }
      version = current;
    }
    else {
      version = exports.bumpVersion(current, bump);
    }

    await this.setVersion(version);

    if (tag) {
      return this._commitSourcesAndCreateTag(version);
    }

    if (add) {
      return this._addSources();
    }

    return undefined;
  }
}

exports.Runner = Runner;

exports.run = options => new Runner(options).run();
