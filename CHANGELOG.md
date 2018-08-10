<a name="4.1.0"></a>
# [4.1.0](https://github.com/lddubeau/versync/compare/v4.0.0...v4.1.0) (2018-08-10)


### Bug Fixes

* correctly check whether the `tag` flag is used without `bump` ([cead876](https://github.com/lddubeau/versync/commit/cead876))


### Features

* add support for running `git add` by itself ([775358b](https://github.com/lddubeau/versync/commit/775358b))

### Deprecations

* The special treatment of `bower.json` and `component.json` is formally deprecated. See [this issue](https://github.com/lddubeau/versync/issues/5).

<a name="4.0.0"></a>
# [4.0.0](https://github.com/lddubeau/versync/compare/v3.1.1...v4.0.0) (2018-06-08)


### Bug Fixes

* convert argument parsing from optimist to argparse ([51fb56e](https://github.com/lddubeau/versync/commit/51fb56e))
* drop object spreads ([f42627b](https://github.com/lddubeau/versync/commit/f42627b))
* TS declarations and jsdoc documentation needed updating ([8f63e6f](https://github.com/lddubeau/versync/commit/8f63e6f))
* update tests and error messages ([db4d656](https://github.com/lddubeau/versync/commit/db4d656))


### Code Refactoring

* drop support for versionedSources as comma-separated list ([da0490c](https://github.com/lddubeau/versync/commit/da0490c))
* reduce -t / --tag to a flag ([606166a](https://github.com/lddubeau/versync/commit/606166a))


### Documentation

* add a missing breaking change ([ddb2dc1](https://github.com/lddubeau/versync/commit/ddb2dc1))


### Features

* add support for `-b sync` ([b8db171](https://github.com/lddubeau/versync/commit/b8db171))


### BREAKING CHANGES

* The API was changed to remove the ``verify`` flag from
``RunnerOptions``. Previously you could use it to specify a run that would not
verify anything by setting the flag to ``false``. It would have an effect only
when not bumping and amounted to tell versync to do nothing at all, which is not
terribly useful. Removing the flag simplifies the code. Now calling run
will *always* result in versync performing at least a verification of the
source.
* setting ``versionedSources`` as a comma-separated list of file
names is no longer supported. That was deprecated in version 3.0.0.
* This change required changes to the API. If you only used ``Runner`` and called
``run`` on it, there should be no change that affects you. If you used the other
methods of ``Runner`` directly, or used the utility functions that are exported
by versync, you may need to update your code. The changes are:

  - ``VersionInfo`` now includes a ``source`` field which is the file that
    contains the version number. This is not "breaking" but may be useful for you.

  - The exported function ``verify``:

    * It no longer takes an ``expectedVersion`` parameter. Instead of checking
      that the files have an expected version, it checks that the files are
      consistent.

    * It used to return an array of strings with the names of the problematic
      source files. Now it returns an object whose ``consistent`` field indicates
      whether the version numbers are consistent. The ``versions`` field is an
      array of ``VersionInfo`` elements.

* the `-t` (`--tag`) option used do and be used exactly like the
`-b` option but added a commit-and-tag to the operation. So `versync -b major`
would bump the major version. And `versync -t major` would bump the major and
commit-and-tag. The `-t` option is now a plain on/off flag. Where you used to do
`versync -t major`, you now have to do `versync -b major -t` to turn on the
commit-and-tag operation *in addition* to the version bump.

====

3.1.1:

 - Updated the ``typescript`` dependency to allow TypeScript 2.x.

 - Added ``index.d.ts`` so that it can be used from TypeScript code.

3.1.0:

 - ``typescript`` was erroneously included in the ``dependencies`` list in
   ``package.json``. It has been removed from the list. It was already in
   ``optionalDependencies``, which is where it belongs because projects not
   using ``typescript`` can omit it.

 - API: The ``options`` passed to ``Runner`` now accept an ``onMessage`` option
   which can be a function or an array of functions. The functions are passed to
   the ``onMessage`` method at construction time. Where previously one would
   have done this:

            const runner = new versync.Runner({ verify: true });
            runner.onMessage(console.log);
            return runner.run();

   It is now possible to do this:

             const runner = new versync.Runner({
               verify: true,
               onMessage: console.log,
             }
             return runner.run();

 - API: versync now exports a ``run`` function which takes the same parameters
   as ``Runner``. Where previously one would have done this:

             const runner = new versync.Runner({
               verify: true,
               onMessage: console.log,
             }
             return runner.run();

    It is now possible to do:

             return versync.run({
               verify: true,
               onMessage: console.log,
             }

3.0.0:

 - Support for ES6.

 - Now offers a documented API.

 - Supports setting ``versionedSources`` as an array.

 - Deprecation: Setting ``versionedSources`` as a comma-separated list
   is deprecated and support for it will be removed in a future
   version (not before 4.x). With the addition of the support of
   ``versionedSources`` as an array, there's no reason to support this
   syntax.

2.0.0:

 - Fork from `semver-sync`.

 - Dropped support for Node 0.6-0.12.

 - Added formal testing on latest versions of Node.

 - Support for TypeScript.
