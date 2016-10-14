# versync

`versync` is a node.js module that enables you to synchronize version numbers accross `package.json`, `component.json` and other source files of your choosing.

This software is a fork of [`semver-sync`](https://github.com/cimi/semver-sync). The fork was triggered by a desire to support TypeScript. A pull request was put it but after over a week without response I decided to fork because my own projects depend on the enhancement. Many thanks to Alex Ciminian for having produced and leading the development of `semver-sync`.

## Supported Platforms

`versync` supports Node.js 4 and over.

Use [`semver-sync`](https://github.com/cimi/semver-sync) if you need similar functionality on earlier versions of Node.

## Installation

You can install it via `npm`:

````
npm install -g versync
````

Support for TypeScript is optional. If you want it, you need to also install `typescript`:

````
npm install -g typescript
````

Note that it is perfectly viable to install `versync` locally if you want.

## How to use it

This utility uses `package.json` as the reference by which all other version numbers in the package are checked. If you don't have a `package.json` in the folder where you run it, it will give an error and break.

The utility automatically checks `package.json` and `component.json`. If you have other JavaScript sources or JSON files that hold your version number first edit the `package.json`, adding the `versionedSources` property:

````json
{
  "name": "mypackage",
  "version": "1.2.3",
  "versionedSources": "mypackage.js"
}
````

Once that's done, you can check that everything's ok:

````terminal
versync -v
[OK] Everything is in sync, with version number 1.2.3
````

If you accidentally change the version number in one of the sources, or forget to update it, you'll see an error:

````
versync -v
[ERROR] Version number is out of sync in component.json, mypackage.js.
````

If you want to update the version number automatically in all the files, you can do:

````
versync -b
[OK] Version number was updated to 1.2.4 in package.json, component.json, mypackage.js.
versync -b patch
[OK] Version number was updated to 1.2.5 in package.json, component.json, mypackage.js.
versync -b minor
[OK] Version number was updated to 1.3.0 in package.json, component.json, mypackage.js.
versync -b major
[OK] Version number was updated to 2.0.0 in package.json, component.json, mypackage.js.
versync -b 3.0.0-alpha1
[OK] Version number was updated to 3.0.1-alpha1 in package.json, component.json, mypackage.js.
versync -b 3.0.0-beta2
[OK] Version number was updated to 3.0.1-beta2 in package.json, component.json, mypackage.js.
versync -b 3.0.0-rc1
[OK] Version number was updated to 3.0.1-rc1 in package.json, component.json, mypackage.js.
````

If you want to update the version number automatically in all the files, commit the changes and create a new git tag, you can do:

````
versync -t
[OK] Version number was updated to 1.2.4 in package.json, component.json, mypackage.js.
[OK] Files have been commited and tag v1.2.4 was created.
````

## How it works

The module uses [UglifyJS 2](https://github.com/mishoo/UglifyJS2) to create an AST of the JavaScript and JSON sources passed in. This approach is more flexible than matching strings or trying to find version numbers in source files.

The AST patterns used to find the nodes which hold the version properties are in the `patterns.js` source file. It should work on most types of structures, if you find one that doesn't please log an issue. The module has automated tests for this pattern matching, using some real-life libraries and it seems to work pretty well.

To check and bump the version number, the module uses the [node-semver](https://github.com/isaacs/node-semver) package.

The binary uses [node-optimist](https://github.com/substack/node-optimist) to parse the input options. Unfortunately, there are no automated tests for it yet, so please log any issues that you encounter.

## Console help

Usage: **`versync -s [source list] -b [release type]`**.

Options:

* `-b, --bump`
   Bump the version number in package.json, component.json and all other specified source files. It can take one of the following values: `major`, `minor`, `patch`. Alternatively you can specify a custom version that is higher than the current one. If no value is specified, it defaults to `patch`.
* `-v, --verify`
   Verifies that package.json, component.json and all other source files have the same version number and checks if it conforms to the semver specification.
* `-s, --sources`
  Declare additional files in which the version number will be updated or checked. If not explicitly specified, it is read from the package.json "versionedSources" property. If it's not present in the package.json and not explicitly specified, only component.json and package.json will be synced.
* `-t, --tag`
  Bump the version number, commit the changes to package.json, component.json and all other specified source files and create a git tag with the current version. It can take one of the following values: `major`, `minor`, `patch`. Alternatively you can specify a custom version that is higher than the current one. If no value is specified, it defaults to `patch`.

## API

You can now import versync and use its exported API. The code in
`index.js` has been commented using JSDoc 3 doclets. We do not yet
generate documentation from it, so you have to read the code to read
the documentation of the API. In brief, you can now do:

```
const versync = require("versync");
const runner = new sync.Runner({
  bump: "minor",
});
runner.run().then(() => {
  // Do somehting on success...
});
```

## License

This package is released under [the MIT License](http://opensource.org/licenses/MIT).

## Contributing

We are targetting the flavor of JavaScript that Node v4 and later support natively. Strictly speaking, this is neither ES5 nor ES6. It is more than ES5 because arrow functions, ``const``, ``let``, template strings, etc. are allowed. It is less than ES6 because Node v4 does not support all of ES6.
