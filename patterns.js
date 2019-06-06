/* global require exports */

"use strict";

const esprima = require("esprima");

function isObjectLiteral(node) {
  return node.type === "ObjectExpression";
}

function extractVersionProperty(properties) {
  let result;
  properties.forEach((prop) => {
    if (prop.key.value === "version" || prop.key.name === "version") {
      result = prop.value;
      return false;
    }
    return true;
  });

  return result;
}

function unparseMemberExpression(node) {
  const { object } = node;
  const unparsedObject = (object.type === "MemberExpression") ?
        unparseMemberExpression(object) : object.name;
  return `${unparsedObject}.${node.property.name}`;
}

function versionFromNode(source, node) {
  let version = node.value;

  if (version === undefined) {
    // We have a node, but it does not have a value. We're probably dealing with
    // an expression of some sort, extract it from the data. This allows
    // providing a more useful error message.
    version = source.substring(node.range[0], node.range[1]);
  }

  return version;
}

const patterns = [];

patterns.push((source, node) => {
  // matching return { [...], version: "...", [...] }
  if (node.type === "ReturnStatement" && isObjectLiteral(node.argument)) {
    return extractVersionProperty(node.argument.properties);
  }

  return undefined;
});

patterns.push((source, node) => {
  // matching export ...
  if (node.type === "ExportNamedDeclaration") {
    const { declarations } = node.declaration;

    for (let i = 0; i < declarations.length; ++i) {
      const declaration = declarations[i];

      if (declaration.id.name === "version") {
        return declaration.init;
      }
    }
  }
  return undefined;
});

patterns.push((source, node) => {
  // Matches assignments to `.version` (e.g. `exports.version = "1.2.3"`) or
  // assignment that assign literals containing the property "version"
  // (e.g. `module.exports = { version: 1.2.3}`).
  let result;

  // If we got *a* result but it is in an unexpected location, we want to warn
  // the user.
  let warn = true;

  if (node.left &&
      node.left.type === "MemberExpression" &&
      node.left.property.name === "version") {
    result = node.right;
    const unparsed = unparseMemberExpression(node.left);
    warn = ["exports.version", "module.exports.version"]
      .indexOf(unparsed) === -1;
  }
  else if (node.value && isObjectLiteral(node.value)) {
    result = extractVersionProperty(node.value.properties);
  }
  else if (node.operator === "=" && isObjectLiteral(node.right)) {
    result = extractVersionProperty(node.right.properties);
    if (node.left.type === "MemberExpression") {
      const unparsed = unparseMemberExpression(node.left);
      warn = ["exports", "module.exports"].indexOf(unparsed) === -1;
    }
  }

  if (result && warn) {
    const version = versionFromNode(source, result);
    // eslint-disable-next-line no-console
    console.warn(`WARNING: found version number ${version}, ` +
      "but not directly assigned to exports or module.exports.");
  }
  return result;
});

// matching simple object literals
// useful for JSON
patterns.push(
  (source, node) => (isObjectLiteral(node) ?
                     extractVersionProperty(node.properties) :
                     undefined));

patterns.match = function match(source, node) {
  let result;
  patterns.find((pattern) => {
    result = pattern(source, node);
    return result;
  });
  return result;
};


function traverse(source, node) {
  let result = patterns.match(source, node);
  if (result) {
    // if a pattern matched, we return what we found and exit
    return result;
  }

  // otherwise, we go deeper in the tree
  if (node.length || (node.body && node.body.length)) {
    if (node.body && node.body.length) {
      node = node.body;
    }
    node.find((n) => {
      result = traverse(source, n);
      return result;
    });

    return result;
  }

  if (node.arguments && node.arguments.length) {
    node.arguments.find((n) => {
      result = traverse(source, n);
      return result;
    });

    return result;
  }

  if (node.body) {
    return traverse(source, node.body);
  }

  if (node.expression) {
    return traverse(source, node.expression);
  }

  if (node.right) {
    return traverse(source, node.right);
  }

  if (node.callee) {
    return traverse(source, node.callee);
  }

  return undefined;
}

exports.parse = function parse(data) {
  const options = {
    loc: true,
    range: true,
    sourceType: "module",
  };

  let ast;
  try {
    ast = esprima.parse(data, options);
  }
  catch (ex) {
    //
    // When we parse with `sourceType: "module"`, it is possible that ES5 code
    // will cause errors due to the use of words that are considered to be
    // future reserved words (e.g. `var await = 1`, `await` is a future reserved
    // word.
    //
    // These are effective only when parsing "module" source, so try again with
    // "script".
    //
    options.sourceType = "script";
    ast = esprima.parse(data, options);
  }

  const node = traverse(data, ast);

  if (!node) {
    return undefined;
  }

  return {
    version: versionFromNode(data, node),
    line: node.loc.end.line,
  };
};
