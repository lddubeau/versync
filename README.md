# versync

`versync` is a node.js module that enables you to synchronize version numbers
accross `package.json`, `component.json` and other source files of your
choosing.

This software is a fork of
[`semver-sync`](https://github.com/cimi/semver-sync). The fork was triggered by
a desire to support TypeScript. A pull request was put it but after over a week
without response I decided to fork because my own projects depend on the
enhancement. Many thanks to Alex Ciminian for having produced and leading the
development of `semver-sync`.

## Supported Platforms

`versync` supports Node.js 6 and over.

## Installation

You can install it via `npm`:

```console
npm install -g versync
```

Note that it is perfectly viable to install `versync` locally if you want.

Support for TypeScript is optional. If you want it, you need to also install
`typescript`.

## How to use it

This utility uses `package.json` as the reference by which all other version
numbers in the package are checked. If you don't have a `package.json` in the
folder where you run it, it will give an error and break.

The utility automatically checks `package.json` and `component.json`. If you
have other JavaScript sources or JSON files that hold your version number first
edit the `package.json`, adding the `versionedSources` property:

```json
{
  "name": "mypackage",
  "version": "1.2.3",
  "versionedSources": "mypackage.js"
}
```

Once that's done, you can check that everything's ok:

```console
versync -v
[OK] Everything is in sync, with version number 1.2.3
```

If you accidentally change the version number in one of the sources, or forget
to update it, you'll see an error:

```console
versync -v
[ERROR] Version number is out of sync in component.json, mypackage.js.
```

If you want to update the version number automatically in all the files, you can
do:

```console
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
```

If you want to update the version number automatically in all the files, commit
the changes and create a new git tag, you can do:

```console
versync -b -t
[OK] Version number was updated to 1.2.4 in package.json, component.json, mypackage.js.
[OK] Files have been commited and tag v1.2.4 was created.
```

### Integration with `npm version`

If you want to integrate versync with `npm version` or any tool that sets the
version number in ``package.json`` and you only want to propagate that version
number to other files, you can use `-b sync`:

```console
versync -b sync
[OK] Version number in files to be synced is 0.0.7.
[OK] Version number was updated to 0.2.0 in assigned.js, es6.js.
```

If the tool also commits files, you probably want to also use the `-a` flag:

```console
versync -b sync -a
```

This allows you to have a `version` script like this in your `package.json`:

```json
  "version": "./bin/versync -b sync -a",
```

What will happen when you run `npm version` is:

1. `npm` will change the version in `package.json`, and then launch the
`version` script.

2. `versync` will synchronise all version numbers with the new one in
`package.json`.

3. `versync` will run `git add` for all synchronised files.

4. `npm` will run `git add package.json`, commit the changes and add a tag.

## How it works

The module uses [esprima](https://github.com/jquery/esprima) to create an AST of
the JavaScript and JSON sources passed in, or it uses TypeScript's own AST
facilities to create an AST of TypeScript sources.

The AST patterns used to find the nodes which hold the version properties are in
the `patterns.js` and `tspatterns.ts` source files. It should work on most types
xof structures, if you find one that doesn't please log an issue. The module has
automated tests for this pattern matching, using some real-life libraries and it
seems to work pretty well.

## Console help

```
usage: versync [-h] [-b [BUMP]] [-s SOURCES] [-v] [-t]

Synchronizes version numbers accross package.json, component.json and other
source files of your choosing.

Optional arguments:
  -h, --help            Show this help message and exit.
  -b [BUMP], --bump [BUMP]
                        Bump the version number in package.json, component.
                        json and all other specified source files. It can
                        take one of the following values: "major", "minor",
                        "patch". Or you can use "sync" to copy the version
                        numbers from package.json to the other files.
                        Alternatively you can specify a custom version that
                        is higher than the current one. If no value is
                        specified, it defaults to "patch".
  -s SOURCES, --sources SOURCES
                        Declare the JavaScript files in which the version
                        number will be updated. If not explicitly specified,
                        it is read from the package.json "versionedSources"
                        property. If it's not present in the package.json and
                        not explicitly specified, only component.json and
                        package.json will be synced. Optional.
  -v, --verify          Verifies that package.json, component.json and all
                        other source files have the same version number and
                        checks if it conforms to the semver specification.
  -t, --tag             After bumping the version number, commit the changes
                        to package.json, component.json and all other
                        specified source files and create a git tag with the
                        current version.
```

## API

You can now import versync and use its exported API. The code in
`index.js` has been commented using JSDoc 3 doclets. We do not yet
generate documentation from it, so you have to read the code to read
the documentation of the API. In brief, you can now do:

```js
const versync = require("versync");
const runner = new sync.Runner({
  bump: "minor",
});
runner.run().then(() => {
  // Do somehting on success...
});
```

## License

This package is released under [the MIT
License](http://opensource.org/licenses/MIT).

## Contributing

We are targetting the flavor of JavaScript that Node v6 and later support
natively.
