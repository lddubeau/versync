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
