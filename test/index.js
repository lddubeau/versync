/* eslint-env mocha */

"use strict";

const { exec } = require("child_process");
const del = require("del");
const fs = require("fs-extra");
const path = require("path");
const mockery = require("mockery");
const chai = require("chai");
const { expectRejection, use } = require("expect-rejection");
const sync = require("../");

const { assert } = chai;

use(chai);

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
      it(name, async () => assert.equal(
        (await sync.getVersion(toFixture(filename))).version, version));
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
      it(name, async () => assert.equal(
        (await sync.getVersion(toFixture(filename))).line, line));
    }

    test("json", "package.json", 4);
    test("topojson.js", "complete/topojson.js", 248);
    test("a TypeScript module", "tsmodule.ts", 10);
    test("export from es6 file", "es6-export.js", 3);
  });

  it("fails when reading ts data without typescript", async () => {
    mockery.enable({
      useCleanCache: true,
      warnOnUnregistered: false,
    });
    try {
      mockery.registerSubstitute("typescript", "nonexistent___");
      mockery.registerAllowable("..");

      const nots = require(".."); // eslint-disable-line global-require

      await expectRejection(
        nots.getVersion("fixtures/tsmodule.ts"),
        Error, "file fixtures/tsmodule.ts is a TypeScript file " +
          "but the package `typescript` is not available; " +
          "please install it.");
    }
    finally {
      mockery.disable();
    }
  });
});

describe("getValidVersion", () => {
  it("resolves to a version number when the version is valid",
     async () => assert.equal(
       (await sync.getValidVersion(toFixture("package.json"))).version,
       "0.0.1"));

  it("rejects if the version is invalid",
     () => expectRejection(sync.getValidVersion(toFixture("invalid.js"))));
});


const tmpdir = "tmp";

function copyFixturesToTmp(files) {
  return Promise.all(files.map(async (filename) => {
    const fullpath = toFixture(filename);
    const tmpfile = path.join(tmpdir, filename);
    await fs.copy(fullpath, tmpfile);
    return tmpfile;
  }));
}

async function gitInit(options) {
  options = options || {};
  await execAsync("git init", options);
  await execAsync("git config user.email 'you@example.com'", options);
  await execAsync("git config user.name YourName", options);
  await execAsync("git add .", options);
  await execAsync("git commit -m'Initial commit.'", options);
}

describe("setVersion sets version numbers in", () => {
  async function setVersionTmp(
    files, version) {
    await del([tmpdir]);
    await fs.ensureDir(tmpdir);
    const tmpfiles = await copyFixturesToTmp(files);

    return sync.setVersion(tmpfiles, version).then(() => tmpfiles);
  }


  function test(name, files, version) {
    it(name, async () => {
      const tmpfiles = await setVersionTmp(files, version);
      assert.equal(tmpfiles.length, files.length);
      await Promise.all(tmpfiles.map(async (file) => {
        const v = await sync.getVersion(file);
        assert.equal(v.version, version);
      }));
    });
  }

  test("json files", ["package.json"], "0.0.5");
  test("topojson.js", ["complete/topojson.js"], "0.0.11");
  test("TypeScript module", ["tsmodule.ts"], "0.1.0");
  test("an es6 file", ["es6-export.js"], "0.1.0");
});

async function setVersionedSources(value) {
  const data = await fs.readFile("package.json");
  const fixture = JSON.parse(data);
  if (fixture.name === "versync") {
    throw new Error("looks like you are trying to modify versync's own " +
                    "package.json");
  }
  fixture.versionedSources = value;
  return fs.writeFile("package.json", JSON.stringify(fixture));
}

async function setVersionedSourcesInTmp(value) {
  // eslint-disable-next-line no-shadow
  const prevdir = process.cwd();
  process.chdir("tmp");
  try {
    await setVersionedSources(value);
  }
  finally {
    process.chdir(prevdir);
  }
}

describe("getSources", () => {
  after(() => del([tmpdir]));

  beforeEach(async () => {
    await del([tmpdir]);
    return fs.ensureDir(tmpdir);
  });

  // versionedSources is an optional value we can use to alter
  // the versionedSources value in the package.json file.
  function makeTest(name, fixtures, versionedSources) {
    it(name, async () => {
      await copyFixturesToTmp(fixtures);

      const prevdir = process.cwd(); // eslint-disable-line no-shadow
      try {
        process.chdir("tmp");
        if (versionedSources) {
          await setVersionedSources(versionedSources);
        }
        assert.sameMembers(await sync.getSources(), fixtures);
      }
      finally {
        process.chdir(prevdir);
      }
    });
  }

  makeTest("package.json without optional files", ["package.json"]);
  describe("reads versionedSources as", () => {
    makeTest("a single string", ["package.json", "literal.js"], "literal.js");
    makeTest("an array", ["package.json", "literal.js", "tsmodule.ts"],
             ["literal.js", "tsmodule.ts"]);
  });
});

describe("verify", () => {
  function makeTest(name, fixtures, expected = false) {
    it(name, async () => assert.deepEqual(
      await sync.verify(fixtures.map(toFixture)), expected));
  }

  it("empty array", () => {
    expectRejection(sync.verify([]), Error,
                    "tried to call verify with an empty array");
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

  it("bad version", () => expectRejection(sync.verify(["invalid.js"]), Error));
});

describe("bumpVersion", () => {
  it("takes a version number",
     () => assert.equal(sync.bumpVersion("0.0.1", "1.0.0"), "1.0.0"));
  it("takes 'major'",
     () => assert.equal(sync.bumpVersion("0.0.1", "major"), "1.0.0"));
  it("takes 'minor'",
     () => assert.equal(sync.bumpVersion("0.0.1", "minor"), "0.1.0"));
  it("takes 'patch'",
     () => assert.equal(sync.bumpVersion("0.0.1", "patch"), "0.0.2"));
  it("raises an error on garbage",
     () => assert.throws(sync.bumpVersion.bind(null, "0.0.1", "garbage"),
                         Error,
                         /^Invalid bump specification.*/));
  it("raises an error if the new version is not greater",
     () => assert.throws(sync.bumpVersion.bind(null, "0.0.1", "0.0.1"),
                         Error,
                         /^Invalid bump specification.*/));
  it("raises an error if the old version is garbage",
     () => assert.throws(sync.bumpVersion.bind(null, "gerbage", "0.0.1"),
                         Error,
                         "The version number is not a valid semver number."));
});

describe("commiting files and creating tag", () => {
  after(() => del([tmpdir]));

  beforeEach(async () => {
    await del([tmpdir]);
    return fs.ensureDir(tmpdir);
  });

  function makeTest(name, fn) {
    const fixtures = ["package.json", "component.json"];
    it(name, async () => {
      await copyFixturesToTmp(fixtures);

      const prevdir = process.cwd(); // eslint-disable-line no-shadow
      try {
        process.chdir("tmp");

        await gitInit();
        await fs.writeFile("test.txt", "");

        await setVersionedSources(["component.json"]);
        await sync.setVersion(fixtures, "0.0.2");

        await fn(fixtures);
      }
      finally {
        process.chdir(prevdir);
      }
    });
  }

  makeTest("works", async () => {
    const runner = new sync.Runner();
    await runner._commitSourcesAndCreateTag("0.0.2");
    let { stdout } = await execAsync("git status -s");

    const files = stdout.split("\n");
    assert.isTrue(files.length > 0);
    // Check that there are no uncommited files that matter to us.
    const noUnCommitted = !files.some(
      file => file.match(/(?:component|package)\.json/));
    assert.isTrue(noUnCommitted, "no staged or unstaged files");

    ({ stdout } = await execAsync("git log -1 --pretty=%B"));

    const commit = stdout.replace(/\n/g, "");
    assert.equal(commit, "v0.0.2", "commit correctly created");

    ({ stdout } = await execAsync("git describe --abbrev=0 --tags"));

    const tag = stdout.replace(/\n/g, "");
    assert.equal(tag, "v0.0.2", "tag correctly created");
  });

  makeTest("reports failures properly", async () => {
    const runner = new sync.Runner();
    // We need to add a non-existent file for this test.
    await setVersionedSources("foo.txt");
    await expectRejection(runner._commitSourcesAndCreateTag("0.0.2"), Error,
                          "git add foo.txt failed");
  });
});

function cleanOutput(output) {
  return output.replace(/\033\[[0-9;]*m/g, "");
}

describe("Runner", () => {
  after(() => del([tmpdir]));

  beforeEach(async () => {
    await del([tmpdir]);
    return fs.ensureDir(tmpdir);
  });

  describe("getSources", () => {
    function makeTest(name, fixtures, versionedSources, options) {
      it(name, async () => {
        const runner = new sync.Runner(options);
        await copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            await setVersionedSources(versionedSources);
          }
          assert.sameMembers(await runner.getSources(), fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      });
    }


    makeTest("includes package.json by default", ["package.json"]);
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
      it(name, async () => {
        const runner = new sync.Runner(options);
        await copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            await setVersionedSources(versionedSources);
          }
          assert.sameMembers(await runner.getSourcesToModify(),
                             options.bump === "sync" ?
                             fixtures.filter(x => x !== "package.json") :
                             fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      });
    }

    function makeTest(name, fixtures, versionedSources, options) {
      options = options || {};
      _makeTest(`${name} (not-sync)`, fixtures, versionedSources, options);
      _makeTest(`${name} (sync)`, fixtures, versionedSources,
                { ...options, bump: "sync" });
    }

    makeTest("includes package.json by default", ["package.json"]);
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
      it(name, async () => {
        const runner = new sync.Runner();
        await copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          assert.deepEqual(await runner.getCurrent(), expected);
        }
        finally {
          process.chdir(prevdir);
        }
      });
    }

    makeTest("returns a correct value", ["package.json"], {
      version: "0.0.1",
      source: "package.json",
      line: 4,
    });
  });

  describe("verify", () => {
    function makeTest(name, fixtures, fn, versionedSources, bump) {
      it(name, async () => {
        const runner = new sync.Runner({ bump });
        await copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            await setVersionedSources(versionedSources);
          }
          await fn(runner, fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      });
    }

    makeTest("fulfills when there is no error", ["package.json"],
             async runner => assert.equal(await runner.verify(), "0.0.1"));
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
             runner => expectRejection(runner.verify(), Error,
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
      it(name, async () => {
        const runner = new sync.Runner();
        await copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            await setVersionedSources(versionedSources);
          }
          await fn(runner, fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      });
    }

    makeTest("fulfills when there is no error", ["package.json"],
             runner => runner.setVersion("9.9.9"));
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
             async (runner) => {
               await runner.setVersion("9.9.9");
               assert.equal((await sync.getVersion("package.json")).version,
                            "9.9.9");
             });
    makeTest("rejects when there is an error", ["package.json", "noversion.js"],
             runner => expectRejection(
               runner.setVersion("9.9.9"), Error,
               "Missing version number in noversion.js."),
             ["noversion.js"]);
  });

  describe("run", () => {
    function makeTest(name, fixtures, fn, versionedSources) {
      it(name, async () => {
        await copyFixturesToTmp(fixtures);

        const prevdir = process.cwd(); // eslint-disable-line no-shadow
        try {
          process.chdir("tmp");
          if (versionedSources) {
            await setVersionedSources(versionedSources);
          }
          await fn(fixtures);
        }
        finally {
          process.chdir(prevdir);
        }
      });
    }

    makeTest("fulfills when there is no error", ["package.json"], () => {
      const runner = new sync.Runner({
        bump: "minor",
      });

      return runner.run();
    });

    makeTest("emits messages when no errors", ["package.json"], async () => {
      const runner = new sync.Runner({
        bump: "minor",
      });
      const messages = [];
      runner.onMessage((msg) => {
        messages.push(cleanOutput(msg));
      });

      await runner.run({
        bump: "minor",
      });
      assert.deepEqual(messages, [
        "Everything is in sync, the version number is 0.0.1.",
        "Version number was updated to 0.1.0 in package.json.",
      ]);
    });

    makeTest("accepts onMessage as function", ["package.json"], async () => {
      const messages = [];
      const runner = new sync.Runner({
        bump: "minor",
        onMessage: (msg) => {
          messages.push(cleanOutput(msg));
        },
      });

      await runner.run({
        bump: "minor",
      });

      assert.deepEqual(messages, [
        "Everything is in sync, the version number is 0.0.1.",
        "Version number was updated to 0.1.0 in package.json.",
      ]);
    });

    makeTest("accepts onMessage as array", ["package.json"], async () => {
      const messages = [];
      const runner = new sync.Runner({
        bump: "minor",
        onMessage: [(msg) => {
          messages.push(cleanOutput(msg));
        }],
      });

      await runner.run({
        bump: "minor",
      });

      assert.deepEqual(messages, [
        "Everything is in sync, the version number is 0.0.1.",
        "Version number was updated to 0.1.0 in package.json.",
      ]);
    });

    makeTest("rejects when there is an error", ["package.json", "noversion.js"],
             () => {
               const runner = new sync.Runner({
                 verify: true,
               });
               return expectRejection(
                 runner.run(), Error,
                 "Missing version number in noversion.js.");
             },
             ["noversion.js"]);
  });
});

describe("run", () => {
  after(() => del([tmpdir]));

  beforeEach(async () => {
    await del([tmpdir]);
    return fs.ensureDir(tmpdir);
  });

  function makeTest(name, fixtures, fn, versionedSources) {
    it(name, async () => {
      await copyFixturesToTmp(fixtures);

      const prevdir = process.cwd(); // eslint-disable-line no-shadow
      try {
        process.chdir("tmp");
        if (versionedSources) {
          await setVersionedSources(versionedSources);
        }
        await fn(fixtures);
      }
      finally {
        process.chdir(prevdir);
      }
    });
  }

  makeTest("fulfills when there is no error", ["package.json"],
           () => sync.run({ bump: "minor" }));

  makeTest("rejects when there is an error", ["package.json", "noversion.js"],
           () => expectRejection(sync.run({
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

  beforeEach(async () => {
    await del([tmpdir]);
    return fs.ensureDir(tmpdir);
  });

  function execVersync(args, silent) {
    options.silentFailure = silent;
    return execAsync(`../../bin/versync ${args}`, options);
  }

  function assertGood(result, expectedStdout) {
    assert.equal(result.stderr, "");
    assert.equal(cleanOutput(result.stdout), expectedStdout);
  }

  it("verify", async () => {
    await copyFixturesToTmp(["package.json", "component.json"]);
    await setVersionedSourcesInTmp(["component.json"]);

    assertGood(await execVersync("-v"),
               "[OK] Everything is in sync, the version number is 0.0.1.\n");
  });

  it("bump", async () => {
    const tmpfiles = await copyFixturesToTmp(["package.json", "component.json"]);
    await setVersionedSourcesInTmp(["component.json"]);

    assertGood(await execVersync("-b 0.2.0"), `\
[OK] Everything is in sync, the version number is 0.0.1.
[OK] Version number was updated to 0.2.0 in package.json, component.json.
`);
    await Promise.all(
      tmpfiles.map(async file => assert.equal(await sync.getVersion(file)
                                              .then(v => v.version),
                                              "0.2.0")));
  });

  it("bump = \"sync\" fails on lower version", async () => {
    await copyFixturesToTmp(["package.json", "assigned.js", "es6.js"]);

    await setVersionedSourcesInTmp(["assigned.js", "es6.js"]);
    await execVersync("-b sync", true).catch((err) => {
      assert.equal(cleanOutput(err.stdout), `\
[OK] Version number in files to be synced is 0.0.7.
[ERROR] Version in package.json (0.0.1) is lower than the version found in \
other files (0.0.7)
`);
    });
  });

  it("bump = \"sync\"", async () => {
    const tmpfiles =
          await copyFixturesToTmp(["package.json", "assigned.js", "es6.js"]);

    const prevdir = process.cwd(); // eslint-disable-line no-shadow
    try {
      process.chdir("tmp");
      await setVersionedSources(["assigned.js", "es6.js"]);
      await execAsync("npm version 0.2.0");
    }
    finally {
      process.chdir(prevdir);
    }

    assertGood(await execVersync("-b sync"), `\
[OK] Version number in files to be synced is 0.0.7.
[OK] Version number was updated to 0.2.0 in assigned.js, es6.js.
`);
    await Promise.all(
      tmpfiles.map(async file => assert.equal(await sync.getVersion(file)
                                              .then(v => v.version),
                                              "0.2.0")));
  });

  it("verify failure", async () => {
    await copyFixturesToTmp(["package.json", "invalid.js", "invalid.ts"]);

    await execVersync("-v -s invalid.js", true).catch((err) => {
      assert.equal(cleanOutput(err.stdout),
                   "[ERROR] Invalid semver number in invalid.js. " +
                   "Found: version\n");
    });
  });

  it("tag", async () => {
    await copyFixturesToTmp(["package.json", "component.json"]);
    await setVersionedSourcesInTmp(["component.json"]);

    await gitInit({ cwd: "tmp" });

    assertGood(await execVersync("-b 0.2.0 -t"), `\
[OK] Everything is in sync, the version number is 0.0.1.
[OK] Version number was updated to 0.2.0 in package.json, component.json.
[OK] Files have been committed and tag v0.2.0 was created.
`);
  });

  it("-t fails if -b is not used", async () => {
    await copyFixturesToTmp(["package.json", "component.json"]);
    await setVersionedSourcesInTmp(["component.json"]);

    await gitInit({ cwd: "tmp" });

    await execVersync("-t", true).catch((err) => {
      assert.match(cleanOutput(err.stdout),
                   /^The option -t is not valid without -b/);
    });
  });

  it("add", async () => {
    await copyFixturesToTmp(["package.json", "component.json"]);
    await setVersionedSourcesInTmp(["component.json"]);

    await gitInit({ cwd: "tmp" });

    assertGood(await execVersync("-b 0.2.0 -a"), `\
[OK] Everything is in sync, the version number is 0.0.1.
[OK] Version number was updated to 0.2.0 in package.json, component.json.
`);

    const { stdout } = await execAsync("git status -s", { cwd: "tmp" });
    assert.equal(stdout, `\
M  component.json
M  package.json
`);
  });

  it("-a fails if -b is not used", async () => {
    await copyFixturesToTmp(["package.json", "component.json"]);
    await setVersionedSourcesInTmp(["component.json"]);

    await gitInit({ cwd: "tmp" });

    await execVersync("-a", true).catch((err) => {
      assert.match(cleanOutput(err.stdout),
                   /^The option -a is not valid without -b/);
    });
  });
});
