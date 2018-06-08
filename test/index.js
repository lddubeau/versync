/* global require describe it process before beforeEach after */
/* eslint-env mocha */

"use strict";

const { exec } = require("child_process");
const sync = require("../");
const del = require("del");
const fs = require("fs-extra");
const path = require("path");
const mockery = require("mockery");
const Promise = require("bluebird");
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);
const { assert } = chai;

function execAsync(command, options) {
  options = options || {};
  const { silentFailure } = options;
  delete options.silentFailure;

  return new Promise((resolve, reject) => {
    exec(command, options, (err, stdout, stderr) => {
      if (err) {
        const newErr = new Error(`${command} failed`);
        newErr.originalError = err;
        newErr.stdout = stdout;
        newErr.stderr = stderr;
        if (!silentFailure) {
          /* eslint-disable no-console */
          console.log(stdout);
          console.log(stderr);
          /* eslint-enable no-console */
        }
        reject(newErr);
      }
      resolve({
        stdout,
        stderr,
      });
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

describe("getVersion", () => {
  describe("reads version numbers from ", () => {
    function test(name, filename, version) {
      it(name, () => assert.eventually.equal(
        sync.getVersion(toFixture(filename)).get("version"), version));
    }

    test("json", "package.json", "0.0.1");
    test("exports.version assignment", "assigned.js", "0.0.7");
    test("module.exports.version assignment", "assigned-module-exports.js",
         "0.0.7");
    test("object literal returned from a module function", "literal.js",
         "0.10.29");
    test("object literal assigned to exports", "assigned-literal.js", "7.7.7");
    test("object literal assigned to exports in AMD-style module", "amd.js",
         "0.9.0");
    test("es6 file", "es6.js", "0.0.7");
    test("export from es6 file", "es6-export.js", "0.0.7");
    test("exports from TypeScript module", "tsmodule.ts", "0.0.1");

    describe("actual libraries", () => {
      test("topojson.js", "complete/topojson.js", "0.0.10");
      test("queue.js", "complete/queue.js", "1.0.0");
      test("d3.js", "complete/d3.js", "3.0.5");
    });
  });

  describe("returns line number information from", () => {
    function test(name, filename, line) {
      it(name, () => assert.eventually.equal(
        sync.getVersion(toFixture(filename)).get("line"), line));
    }

    test("json", "package.json", 4);
    test("topojson.js", "complete/topojson.js", 248);
    test("a TypeScript module", "tsmodule.ts", 10);
    test("export from es6 file", "es6-export.js", 3);
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
});

describe("getValidVersion", () => {
  it("resolves to a version number when the version is valid",
     () => assert.eventually.equal(
       sync.getValidVersion(toFixture("package.json")).get("version"), "0.0.1"));

  it("rejects if the version is invalid",
     () => assert.isRejected(sync.getValidVersion(toFixture("invalid.js"))));
});


const tmpdir = "tmp";

function copyFixturesToTmp(files) {
  return Promise.map(files, (filename) => {
    const fullpath = toFixture(filename);
    const tmpfile = path.join(tmpdir, filename);
    return fs.copy(fullpath, tmpfile).then(() => tmpfile);
  });
}

describe("setVersion sets version numbers in", () => {
  const setVersionTmp = Promise.coroutine(function *setVersionTmp(
    files, version) {
    yield del([tmpdir]);
    yield fs.ensureDir(tmpdir);
    const tmpfiles = yield copyFixturesToTmp(files);

    return sync.setVersion(tmpfiles, version).return(tmpfiles);
  });


  function test(name, files, version) {
    it(name, Promise.coroutine(function *_test() {
      const tmpfiles = yield setVersionTmp(files, version);
      assert.equal(tmpfiles.length, files.length);
      yield Promise.map(tmpfiles,
                        file => assert.eventually.equal(
                          sync.getVersion(file).get("version"),
                          version));
    }));
  }

  test("json files", ["component.json", "package.json"], "0.0.5");
  test("topojson.js", ["complete/topojson.js"], "0.0.11");
  test("TypeScript module", ["tsmodule.ts"], "0.1.0");
  test("an es6 file", ["es6-export.js"], "0.1.0");
});

function setVersionedSources(value) {
  return fs.readFile("package.json").then((data) => {
    const fixture = JSON.parse(data);
    if (fixture.name === "versync") {
      throw new Error("looks like you are trying to modify versync's own " +
                      "package.json");
    }
    fixture.versionedSources = value;
    return fs.writeFile("package.json", JSON.stringify(fixture));
  });
}

describe("getSources", () => {
  after(() => del([tmpdir]));

  beforeEach(() => del([tmpdir]).then(() => fs.ensureDir(tmpdir)));

  // versionedSources is an optional value we can use to alter
  // the versionedSources value in the package.json file.
  function makeTest(name, fixtures, versionedSources) {
    it(name, Promise.coroutine(function *_test() {
      yield copyFixturesToTmp(fixtures);

      const prevdir = process.cwd(); // eslint-disable-line no-shadow
      try {
        process.chdir("tmp");
        if (versionedSources) {
          yield setVersionedSources(versionedSources);
        }
        yield assert.eventually.sameMembers(sync.getSources(), fixtures);
      }
      finally {
        process.chdir(prevdir);
      }
    }));
  }

  makeTest("package.json without optional files", ["package.json"]);
  makeTest("package.json and component.json", ["package.json",
                                               "component.json"]);
  makeTest("package.json and bower.json", ["package.json", "bower.json"]);

  describe("reads versionedSources as", () => {
    makeTest("a single string", ["package.json", "literal.js"], "literal.js");
    makeTest("an array", ["package.json", "literal.js", "tsmodule.ts"],
             ["literal.js", "tsmodule.ts"]);
  });
});

describe("verify", () => {
  function makeTest(name, fixtures, expected) {
    it(name, () =>
       (expected ?
        assert.eventually.deepEqual(sync.verify(fixtures.map(toFixture)),
                                    expected) :
        assert.eventually.isFalse(sync.verify(fixtures.map(toFixture)))));
  }

  it("empty array", () => {
    assert.isRejected(sync.verify([]),
                      Error, "tried to call verify with an empty array");
  });

  makeTest("no error", ["package.json", "tsmodule.ts"], {
    consistent: true,
    versions: [{
      source: "fixtures/package.json",
      version: "0.0.1",
      line: 4,
    }, {
      source: "fixtures/tsmodule.ts",
      version: "0.0.1",
      line: 10,
    }],
  });
  makeTest("inconsistent versions", ["package.json", "amd.js"], {
    consistent: false,
    versions: [{
      source: "fixtures/package.json",
      version: "0.0.1",
      line: 4,
    }, {
      source: "fixtures/amd.js",
      version: "0.9.0",
      line: 2,
    }],
  });

  it("bad version", () => assert.isRejected(sync.verify(["invalid.js"]),
                                            Error));
});

describe("bumpVersion", () => {
  it("takes a version number", () =>
     assert.equal(sync.bumpVersion("0.0.1", "1.0.0"), "1.0.0"));
  it("takes 'major'", () =>
     assert.equal(sync.bumpVersion("0.0.1", "major"), "1.0.0"));
  it("takes 'minor'", () =>
     assert.equal(sync.bumpVersion("0.0.1", "minor"), "0.1.0"));
  it("takes 'patch'", () =>
     assert.equal(sync.bumpVersion("0.0.1", "patch"), "0.0.2"));
  it("raises an error on garbage", () =>
     assert.throws(sync.bumpVersion.bind(null, "0.0.1", "garbage"),
                   Error,
                   /^Invalid bump specification.*/));
  it("raises an error if the new version is not greater", () =>
     assert.throws(sync.bumpVersion.bind(null, "0.0.1", "0.0.1"),
                   Error,
                   /^Invalid bump specification.*/));
  it("raises an error if the old version is garbage", () =>
     assert.throws(sync.bumpVersion.bind(null, "gerbage", "0.0.1"),
                   Error,
                   "The version number is not a valid semver number."));
});

describe("commiting files and creating tag", () => {
  after(() => del([tmpdir]));

  beforeEach(() => del([tmpdir]).then(() => fs.ensureDir(tmpdir)));

  function makeTest(name, fn) {
    const fixtures = ["package.json", "component.json"];
    it(name, Promise.coroutine(function *_test() {
      yield copyFixturesToTmp(fixtures);

      const prevdir = process.cwd(); // eslint-disable-line no-shadow
      try {
        process.chdir("tmp");

        yield execAsync("git init");
        yield execAsync("git config user.email 'you@example.com'");
        yield execAsync("git config user.name YourName");
        yield execAsync("git add .");
        yield execAsync("git commit -m'Initial commit.'");

        yield fs.writeFile("test.txt", "");

        yield sync.setVersion(fixtures, "0.0.2");

        yield fn(fixtures);
      }
      finally {
        process.chdir(prevdir);
      }
    }));
  }

  makeTest("works", Promise.coroutine(function *_test() {
    const runner = new sync.Runner();
    yield runner._commitSourcesAndCreateTag("0.0.2");
    let { stdout } = yield execAsync("git status -s");

    const files = stdout.split("\n");
    assert.isTrue(files.length > 0);
    // Check that there are no uncommited files that matter to us.
    const noUnCommitted = !files.some(
      file => file.match(/(?:component|package)\.json/));
    assert.isTrue(noUnCommitted, "no staged or unstaged files");

    ({ stdout } = yield execAsync("git log -1 --pretty=%B"));

    const commit = stdout.replace(/\n/g, "");
    assert.equal(commit, "v0.0.2", "commit correctly created");

    ({ stdout } = yield execAsync("git describe --abbrev=0 --tags"));

    const tag = stdout.replace(/\n/g, "");
    assert.equal(tag, "v0.0.2", "tag correctly created");
  }));

  makeTest("reports failures properly", Promise.coroutine(function *_test() {
    const runner = new sync.Runner();
    // We need to add a non-existent file for this test.
    yield setVersionedSources("foo.txt");
    yield assert.isRejected(
      runner._commitSourcesAndCreateTag("0.0.2"),
      Error,
      "git add foo.txt failed");
  }));
});

function cleanOutput(output) {
  return output.replace(/\033\[[0-9;]*m/g, "");
}

describe("Runner", () => {
  after(() => del([tmpdir]));

  beforeEach(() => del([tmpdir]).then(() => fs.ensureDir(tmpdir)));

  describe("getSources", () => {
    function makeTest(name, fixtures, versionedSources, options) {
      it(name, Promise.coroutine(function *_test() {
        const runner = new sync.Runner(options);
        yield copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            yield setVersionedSources(versionedSources);
          }
          yield assert.eventually.sameMembers(runner.getSources(),
                                              fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      }));
    }


    makeTest("includes package.json by default", ["package.json"]);
    makeTest("includes component.json if present", ["package.json",
                                                    "component.json"]);
    makeTest("includes bower.json if present", ["package.json", "bower.json"]);
    makeTest("includes files in versionedSources",
             ["package.json", "tsmodule.ts"], ["tsmodule.ts"]);
    makeTest("includes files in options",
             ["package.json", "tsmodule.ts"], undefined, {
               sources: ["tsmodule.ts"],
             });
    makeTest("does not duplicate files",
             ["package.json", "tsmodule.ts"], ["tsmodule.ts"], {
               sources: ["tsmodule.ts"],
             });
  });

  describe("getSourcesToModify", () => {
    function _makeTest(name, fixtures, versionedSources, options) {
      it(name, Promise.coroutine(function *_test() {
        const runner = new sync.Runner(options);
        yield copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            yield setVersionedSources(versionedSources);
          }
          yield assert.eventually.sameMembers(
            runner.getSourcesToModify(),
            options.bump === "sync" ?
              fixtures.filter(x => x !== "package.json") :
              fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      }));
    }

    function makeTest(name, fixtures, versionedSources, options) {
      options = options || {};
      _makeTest(`${name} (not-sync)`, fixtures, versionedSources, options);
      _makeTest(`${name} (sync)`, fixtures, versionedSources,
                { ...options, bump: "sync" });
    }

    makeTest("includes package.json by default", ["package.json"]);
    makeTest("includes component.json if present", ["package.json",
                                                    "component.json"]);
    makeTest("includes bower.json if present", ["package.json", "bower.json"]);
    makeTest("includes files in versionedSources",
             ["package.json", "tsmodule.ts"], ["tsmodule.ts"]);
    makeTest("includes files in options",
             ["package.json", "tsmodule.ts"], undefined, {
               sources: ["tsmodule.ts"],
             });
    makeTest("does not duplicate files",
             ["package.json", "tsmodule.ts"], ["tsmodule.ts"], {
               sources: ["tsmodule.ts"],
             });
  });

  describe("getCurrent", () => {
    function makeTest(name, fixtures, expected) {
      it(name, Promise.coroutine(function *_test() {
        const runner = new sync.Runner();
        yield copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          yield assert.eventually.deepEqual(runner.getCurrent(), expected);
        }
        finally {
          process.chdir(prevdir);
        }
      }));
    }

    makeTest("returns a correct value", ["package.json"], {
      version: "0.0.1",
      source: "package.json",
      line: 4,
    });
  });

  describe("verify", () => {
    function makeTest(name, fixtures, fn, versionedSources, bump) {
      it(name, Promise.coroutine(function *_test() {
        const runner = new sync.Runner({ bump });
        yield copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            yield setVersionedSources(versionedSources);
          }
          yield fn(runner, fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      }));
    }

    makeTest("fulfills when there is no error", ["package.json"],
             runner => assert.eventually.equal(runner.verify(), "0.0.1"));
    makeTest("emits a message when there is no error", ["package.json"],
             runner => new Promise((resolve, reject) => {
               runner.onMessage((msg) => {
                 try {
                   assert.equal(
                     cleanOutput(msg),
                     "Everything is in sync, the version number is 0.0.1.");
                 }
                 catch (ex) {
                   reject(ex);
                 }
                 resolve();
               });
               runner.verify();
             }));
    makeTest("rejects when there is an error", ["package.json", "amd.js"],
             runner => assert.isRejected(
               runner.verify(), Error,
               `Version numbers are inconsistent:
package.json:1: ${"0.0.1".red}
amd.js:2: ${"0.9.0".red}
`),
             ["amd.js"]);
    makeTest("does not check package when bump = \"sync\"",
             ["package.json", "amd.js"],
             runner => new Promise((resolve, reject) => {
               runner.onMessage((msg) => {
                 try {
                   assert.equal(
                     cleanOutput(msg),
                     "Version number in files to be synced is 0.9.0.");
                 }
                 catch (ex) {
                   reject(ex);
                 }
                 resolve();
               });
               runner.verify();
             }),
             ["amd.js"], "sync");
  });

  describe("setVersion", () => {
    function makeTest(name, fixtures, fn, versionedSources) {
      it(name, Promise.coroutine(function *_test() {
        const runner = new sync.Runner();
        yield copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            yield setVersionedSources(versionedSources);
          }
          yield fn(runner, fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      }));
    }

    makeTest("fulfills when there is no error", ["package.json"],
             runner => assert.isFulfilled(runner.setVersion("9.9.9")));
    makeTest("emits a message when there is no error", ["package.json"],
             runner => new Promise((resolve) => {
               runner.onMessage((msg) => {
                 assert.equal(
                   cleanOutput(msg),
                   "Version number was updated to 9.9.9 in package.json.");
                 resolve();
               });
               runner.setVersion("9.9.9");
             }));
    makeTest("actually changes the version number", ["package.json"],
             runner => runner.setVersion("9.9.9").then(() =>
               assert.eventually.equal(
                 sync.getVersion("package.json").get("version"), "9.9.9")));
    makeTest("rejects when there is an error", ["package.json", "noversion.js"],
             runner => assert.isRejected(
               runner.setVersion("9.9.9"), Error,
               "Missing version number in noversion.js."),
             ["noversion.js"]);
  });

  describe("run", () => {
    function makeTest(name, fixtures, fn, versionedSources) {
      it(name, Promise.coroutine(function *_test() {
        yield copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            yield setVersionedSources(versionedSources);
          }
          yield fn(fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      }));
    }

    makeTest("fulfills when there is no error", ["package.json"], () => {
      const runner = new sync.Runner({
        bump: "minor",
      });
      return assert.isFulfilled(runner.run());
    });

    makeTest("emits messages when there are no errors", ["package.json"], () => {
      const runner = new sync.Runner({
        bump: "minor",
      });
      const messages = [];
      runner.onMessage((msg) => {
        messages.push(cleanOutput(msg));
      });

      return runner.run({
        bump: "minor",
      }).then(() => {
        assert.deepEqual(messages, [
          "Everything is in sync, the version number is 0.0.1.",
          "Version number was updated to 0.1.0 in package.json.",
        ]);
      });
    });

    makeTest("accepts onMessage as function", ["package.json"], () => {
      const messages = [];
      const runner = new sync.Runner({
        bump: "minor",
        onMessage: (msg) => {
          messages.push(cleanOutput(msg));
        },
      });

      return runner.run({
        bump: "minor",
      }).then(() => {
        assert.deepEqual(messages, [
          "Everything is in sync, the version number is 0.0.1.",
          "Version number was updated to 0.1.0 in package.json.",
        ]);
      });
    });

    makeTest("accepts onMessage as array", ["package.json"], () => {
      const messages = [];
      const runner = new sync.Runner({
        bump: "minor",
        onMessage: [(msg) => {
          messages.push(cleanOutput(msg));
        }],
      });

      return runner.run({
        bump: "minor",
      }).then(() => {
        assert.deepEqual(messages, [
          "Everything is in sync, the version number is 0.0.1.",
          "Version number was updated to 0.1.0 in package.json.",
        ]);
      });
    });

    makeTest("rejects when there is an error", ["package.json", "noversion.js"],
             () => {
               const runner = new sync.Runner({
                 verify: true,
               });
               return assert.isRejected(
                 runner.run(), Error,
                 "Missing version number in noversion.js.");
             },
             ["noversion.js"]);
  });
});

describe("run", () => {
  after(() => del([tmpdir]));

  beforeEach(() => del([tmpdir]).then(() => fs.ensureDir(tmpdir)));

  function makeTest(name, fixtures, fn, versionedSources) {
    it(name, Promise.coroutine(function *_test() {
      yield copyFixturesToTmp(fixtures);

      const prevdir = process.cwd(); // eslint-disable-line no-shadow
      try {
        process.chdir("tmp");
        if (versionedSources) {
          yield setVersionedSources(versionedSources);
        }
        yield fn(fixtures);
      }
      finally {
        process.chdir(prevdir);
      }
    }));
  }

  makeTest("fulfills when there is no error", ["package.json"], () =>
    assert.isFulfilled(sync.run({
      bump: "minor",
    })));

  makeTest("rejects when there is an error", ["package.json", "noversion.js"],
           () => assert.isRejected(sync.run({
             verify: true,
           }), Error, "Missing version number in noversion.js."),
           ["noversion.js"]);
});

// "End-to-end" tests.
describe("running versync", function runningVersync() {
  // Later versions of TS require a longer timeout!
  this.timeout(3000);
  const options = { cwd: tmpdir };


  after(() => del([tmpdir]));

  beforeEach(() => del([tmpdir]).then(() => fs.ensureDir(tmpdir)));

  function execVersync(args, silent) {
    options.silentFailure = silent;
    return execAsync(`../../bin/versync ${args}`, options);
  }

  function assertGood(result, expectedStdout) {
    assert.equal(result.stderr, "");
    assert.equal(cleanOutput(result.stdout), expectedStdout);
  }

  it("verify", Promise.coroutine(function *test() {
    yield copyFixturesToTmp(["package.json", "component.json"]);

    const result = yield execVersync("-v");
    assertGood(result,
               "[OK] Everything is in sync, the version number is 0.0.1.\n");
  }));

  it("bump", Promise.coroutine(function *test() {
    const tmpfiles = yield copyFixturesToTmp(["package.json", "component.json"]);

    const result = yield execVersync("-b 0.2.0");
    assertGood(result, `\
[OK] Everything is in sync, the version number is 0.0.1.
[OK] Version number was updated to 0.2.0 in package.json, component.json.
`);
    yield Promise.map(
      tmpfiles,
      file => assert.eventually.equal(sync.getVersion(file).get("version"),
                                      "0.2.0"));
  }));

  it("bump = \"sync\" fails on lower version",
     Promise.coroutine(function *test() {
       yield copyFixturesToTmp(["package.json", "assigned.js", "es6.js"]);

       const prevdir = process.cwd(); // eslint-disable-line no-shadow
       try {
         process.chdir("tmp");
         yield setVersionedSources(["assigned.js", "es6.js"]);
       }
       finally {
         process.chdir(prevdir);
       }

       yield execVersync("-b sync", true).catch((err) => {
         assert.equal(cleanOutput(err.stdout), `\
[OK] Version number in files to be synced is 0.0.7.
[ERROR] Version in package.json (0.0.1) is lower than the version found in \
other files (0.0.7)
`);
       });
     }));

  it("bump = \"sync\"", Promise.coroutine(function *test() {
    const tmpfiles =
          yield copyFixturesToTmp(["package.json", "assigned.js", "es6.js"]);

    const prevdir = process.cwd(); // eslint-disable-line no-shadow
    try {
      process.chdir("tmp");
      yield setVersionedSources(["assigned.js", "es6.js"]);
      yield execAsync("npm version 0.2.0");
    }
    finally {
      process.chdir(prevdir);
    }

    const result = yield execVersync("-b sync");
    assertGood(result, `\
[OK] Version number in files to be synced is 0.0.7.
[OK] Version number was updated to 0.2.0 in assigned.js, es6.js.
`);
    yield Promise.map(
      tmpfiles,
      file => assert.eventually.equal(sync.getVersion(file).get("version"),
                                      "0.2.0"));
  }));

  it("verify failure", Promise.coroutine(function *test() {
    yield copyFixturesToTmp(["package.json", "invalid.js", "invalid.ts"]);

    yield execVersync("-v -s invalid.js", true).catch((err) => {
      assert.equal(cleanOutput(err.stdout),
                   "[ERROR] Invalid semver number in invalid.js. " +
                   "Found: version\n");
    });
  }));
});
