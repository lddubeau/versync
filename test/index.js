/* global require */
"use strict";

const exec = require("child_process").exec;
const test = require("tap").test;
const sync = require("../");
const del = require("del");
const fs = require("fs-extra");
const mockery = require("mockery");

function getVersion(filename) {
  return sync.getVersion(filename).version;
}

function getLine(filename) {
  return sync.getVersion(filename).line;
}

test("reading version numbers from simple text fixtures", (t) => {
  t.equal(getVersion("fixtures/package.json"), "0.0.1", "json");
  t.equal(getVersion("fixtures/assigned.js"), "0.0.7",
          "module.exports.version assignment");
  t.equal(getVersion("fixtures/literal.js"), "0.10.29",
          "object literal returned from a module function");
  t.equal(getVersion("fixtures/assigned-literal.js"), "7.7.7",
          "object literal assigned to exports");
  t.equal(getVersion("fixtures/amd.js"), "0.9.0",
          "object literal assigned to exports in AMD-style module");
  t.equal(getVersion("fixtures/tsmodule.ts"), "0.0.1",
          "exports from TypeScript module");
  t.end();
});

test("reading version numbers from ts data without typescript", (t) => {
  mockery.enable({
    useCleanCache: true,
    warnOnUnregistered: false,
  });
  try {
    mockery.registerSubstitute("typescript", "nonexistent___");
    mockery.registerAllowable("..");
    const nots = require(".."); // eslint-disable-line global-require
    t.throws(nots.getVersion.bind(undefined, "fixtures/tsmodule.ts"),
             new Error("file fixtures/tsmodule.ts is a TypeScript file " +
                       "but the package `typescript` is not available; " +
                       "please install it."),
             "throws an error");
    t.end();
  }
  finally {
    mockery.disable();
  }
});


test("reading version numbers from actual libraries", (t) => {
  t.equal(getVersion("fixtures/complete/topojson.js"), "0.0.10",
          "topojson.js parsed correctly.");
  t.equal(getVersion("fixtures/complete/queue.js"), "1.0.0",
          "queue.js parsed correctly.");
  t.equal(getVersion("fixtures/complete/d3.js"), "3.0.5",
          "d3.js parsed correctly.");
  t.end();
});

test("version numbers come with line number information", (t) => {
  t.equal(getLine("fixtures/package.json"), 4,
          "Line numbers work for JSON.");
  t.equal(getLine("fixtures/complete/topojson.js"), 248,
          "Line number determined correctly for topojson.js.");
  t.equal(getLine("fixtures/tsmodule.ts"), 10,
          "Line numbers work for TypeScript module.");
  t.end();
});

test("setting version numbers", (t) => {
  sync.setVersion(["fixtures/component.json", "fixtures/package.json"], "0.0.5");
  t.equal(getVersion("fixtures/component.json"), "0.0.5");
  t.equal(getVersion("fixtures/package.json"), "0.0.5");
  sync.setVersion(["fixtures/component.json", "fixtures/package.json"], "0.0.1");
  t.equal(getVersion("fixtures/component.json"), "0.0.1");
  t.equal(getVersion("fixtures/package.json"), "0.0.1");

  sync.setVersion(["fixtures/complete/topojson.js"], "0.0.11");
  t.equal(getVersion("fixtures/complete/topojson.js"), "0.0.11",
          "topojson.js parsed correctly.");
  sync.setVersion(["fixtures/complete/topojson.js"], "0.0.10");

  del.sync(["tmp"]);
  fs.ensureDirSync("tmp");
  fs.copySync("fixtures/tsmodule.ts", "tmp/tsmodule.ts");
  // Do it on a ts file.
  t.equal(getVersion("tmp/tsmodule.ts"), "0.0.1");
  sync.setVersion(["tmp/tsmodule.ts"], "0.10.0");
  t.equal(getVersion("tmp/tsmodule.ts"), "0.10.0");

  t.end();
});

/* eslint-disable no-shadow */
test("commiting files and creating tag", (t) => {
  const options = { cwd: "tmp" };
  t.plan(3);

  exec("./git-test", (_error) => {
    sync.setVersion(["tmp/package.json", "tmp/component.json"], "0.0.2");
    sync.commitSourcesAndCreateTag(
      ["package.json", "component.json"], "0.0.2", () => {
        exec("git status -s", options, (_error, stdout) => {
          const files = stdout.split("\n");
          const noStagedOrUnstagedFiles = !files.some(
            (file) => file.match(/(?:component|package)\.json/));
          t.ok(noStagedOrUnstagedFiles, "no staged or unstaged files");
        });

        exec("git log -1 --pretty=%B", options, (_error, stdout) => {
          const commit = stdout.replace(/\n/g, "");
          t.equal(commit, "v0.0.2", "commit correctly created");
        });

        exec("git describe --abbrev=0 --tags", options, (_error, stdout) => {
          const tag = stdout.replace(/\n/g, "");
          t.equal(tag, "v0.0.2", "tag correctly created");
        });
      }, options);
  });
});

test("running versync", (t) => {
  const options = { cwd: "tmp" };
  t.plan(2);

  t.test((t) => {
    t.plan(2);
    exec("./exec-test", () => {
      exec("../../bin/versync -v", options, (error, stdout) => {
        t.equal(error, null);
        t.equal(stdout.replace(/\033\[[0-9;]*m/g, ""),
                "[OK] Everything is in sync, the version number is 0.0.1.\n");
      });
    });
  });

  t.test((t) => {
    t.plan(2);
    exec("./exec-invalid-test", () => {
      exec("../../bin/versync -v -s invalid.js", options, (error, stdout) => {
        t.equal(error.code, 1);
        t.equal(stdout.replace(/\033\[[0-9;]*m/g, ""),
                "[ERROR] Missing or wrong semver number in " +
                "invalid.js. Found: version\n");
      });
    });
  });
});
