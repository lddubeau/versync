/* global require describe it process before after */
/* eslint-env mocha */
"use strict";

const exec = require("child_process").exec;
const sync = require("../");
const del = require("del");
let fs = require("fs-extra");
const path = require("path");
const mockery = require("mockery");
const Promise = require("bluebird");
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const assert = chai.assert;

fs = Promise.promisifyAll(fs);

function execAsync(command, options) {
  return new Promise((resolve, reject) => {
    exec(command, options, (err, stdout, stderr) => {
      if (err) {
        const newErr = new Error(`${command} failed`);
        newErr.originalError = err;
        newErr.stdout = stdout;
        newErr.stderr = stderr;
        reject(newErr);
      }
      resolve([stdout, stderr]);
    });
  });
}

function toFixture(filename) {
  return `fixtures/${filename}`;
}

let prevdir;
before(() => {
  prevdir = process.cwd();
  process.chdir("test");
});

after(() => process.chdir(prevdir));

describe("reads version numbers from ", () => {
  function test(name, filename, version) {
    it(name, () => assert.eventually.equal(
      sync.getVersion(toFixture(filename)).get("version"), version));
  }

  test("json", "package.json", "0.0.1");
  test("module.exports.version assignment", "assigned.js", "0.0.7");
  test("object literal returned from a module function", "literal.js",
       "0.10.29");
  test("object literal assigned to exports", "assigned-literal.js", "7.7.7");
  test("object literal assigned to exports in AMD-style module", "amd.js",
       "0.9.0");
  test("exports from TypeScript module", "tsmodule.ts", "0.0.1");

  describe("actual libraries", () => {
    test("topojson.js", "complete/topojson.js", "0.0.10");
    test("queue.js", "complete/queue.js", "1.0.0");
    test("d3.js", "complete/d3.js", "3.0.5");
  });
});

describe("version numbers come with line number information from", () => {
  function test(name, filename, line) {
    it(name, () => assert.eventually.equal(
      sync.getVersion(toFixture(filename)).get("line"), line));
  }

  test("json", "package.json", 4);
  test("topojson.js", "complete/topojson.js", 248);
  test("a TypeScript module", "tsmodule.ts", 10);
});


const tmpdir = "tmp";

function copyFixturesToTmp(files) {
  return Promise.map(files, (filename) => {
    const fullpath = toFixture(filename);
    const tmpfile = path.join(tmpdir, filename);
    return fs.copyAsync(fullpath, tmpfile).return(tmpfile);
  });
}

describe("sets version numbers", () => {
  const setVersionTmp = Promise.coroutine(function *setVersionTmp(
    files, version) {
    yield del([tmpdir]);
    yield fs.ensureDirAsync(tmpdir);
    const tmpfiles = yield copyFixturesToTmp(files);

    return sync.setVersion(tmpfiles, version).return(tmpfiles);
  });


  function test(name, files, version) {
    it(name, Promise.coroutine(function *_test() {
      const tmpfiles = yield setVersionTmp(files, version);
      assert.equal(tmpfiles.length, files.length);
      yield Promise.map(tmpfiles,
                        (file) => assert.eventually.equal(
                          sync.getVersion(file).get("version"),
                          version));
    }));
  }

  test("in json files", ["component.json", "package.json"],
      "0.0.5");
  test("topojson.js", ["complete/topojson.js"], "0.0.11");
  test("TypeScript module", ["tsmodule.ts"], "0.1.0");
});

it("fails when reading ts data without typescript", () => {
  mockery.enable({
    useCleanCache: true,
    warnOnUnregistered: false,
  });
  return Promise.try(() => {
    mockery.registerSubstitute("typescript", "nonexistent___");
    mockery.registerAllowable("..");
    const nots = require(".."); // eslint-disable-line global-require
    return assert.isRejected(
      nots.getVersion("fixtures/tsmodule.ts"),
      Error, "file fixtures/tsmodule.ts is a TypeScript file " +
        "but the package `typescript` is not available; " +
        "please install it.");
  }).finally(() => {
    mockery.disable();
  });
});


/* eslint-disable no-shadow */
it("commiting files and creating tag", Promise.coroutine(function *_test() {
  yield del([tmpdir]);
  yield fs.ensureDirAsync(tmpdir);
  yield copyFixturesToTmp(["package.json", "component.json"]);

  const prevdir = process.cwd();
  try {
    process.chdir("tmp");

    yield execAsync("git init");
    yield execAsync("git add .");
    yield execAsync("git commit -m'Initial commit.'");

    yield fs.writeFileAsync("test.txt", "");

    const versionedFiles = ["package.json", "component.json"];
    yield sync.setVersion(versionedFiles, "0.0.2");

    yield new Promise((resolve) => {
      sync.commitSourcesAndCreateTag(versionedFiles, "0.0.2", () => {
        resolve();
      });
    });

    let result = yield execAsync("git status -s");
    let stdout = result[0];

    const files = stdout.split("\n");
    assert.isTrue(files.length > 0);
    // Check that there are no uncommited files that matter to us.
    const noUnCommitted = !files.some(
      (file) => file.match(/(?:component|package)\.json/));
    assert.isTrue(noUnCommitted, "no staged or unstaged files");

    result = yield execAsync("git log -1 --pretty=%B");
    stdout = result[0];

    const commit = stdout.replace(/\n/g, "");
    assert.equal(commit, "v0.0.2", "commit correctly created");

    result = yield execAsync("git describe --abbrev=0 --tags");
    stdout = result[0];

    const tag = stdout.replace(/\n/g, "");
    assert.equal(tag, "v0.0.2", "tag correctly created");
  }
  finally {
    process.chdir(prevdir);
  }
}));

describe("running versync", () => {
  const options = { cwd: tmpdir };

  after(() => del([tmpdir]));

  beforeEach(() => del([tmpdir]).then(() => fs.ensureDirAsync(tmpdir)));

  it("success", Promise.coroutine(function *test() {
    yield copyFixturesToTmp(["package.json", "component.json"]);

    const result = yield execAsync("../../bin/versync -v", options);
    assert.equal(result[1], "");
    assert.equal(result[0].replace(/\033\[[0-9;]*m/g, ""),
                 "[OK] Everything is in sync, the version number is 0.0.1.\n");
  }));

  it("failure", Promise.coroutine(function *test() {
    yield copyFixturesToTmp(["package.json", "invalid.js", "invalid.ts"]);

    yield execAsync("../../bin/versync -v -s invalid.js", options).catch(err => {
      assert.equal(err.stdout.replace(/\033\[[0-9;]*m/g, ""),
                   "[ERROR] Missing or wrong semver number in " +
                   "invalid.js. Found: version\n");
    });
  }));
});
