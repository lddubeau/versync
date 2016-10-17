3.1.0:

 - ``typescript`` was erroneously included in the ``dependencies`` list in
   ``package.json``. It has been removed from the list. It was already in
   ``optionalDependencies``, which is where it belongs because projects not
   using ``typescript`` can omit it.

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
