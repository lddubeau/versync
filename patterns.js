/* global require exports */
"use strict";
const uglify = require("uglify-js");

function isObjectLiteral(node) {
  return node.start && node.end
      && node.start.value === "{" && node.end.value === "}";
}

function isJSONObject(node) {
  return node.start && node.end
      && node.start.value === "(" && node.end.value === ")"
      && node.properties;
}

function extractVersionProperty(properties) {
  let result;
  properties.forEach((prop) => {
    if (prop.key === "version") {
      result = {
        version: prop.value.value,
        line: prop.end.line,
      };

      return false;
    }
    return true;
  });

  return result;
}

const patterns = [];

patterns.push((node) => {
  // matching module.exports.version = "..." and exports.version = "..."
  // TODO: also matches module.version which is not quite OK
  if (node.operator === "=" && node.left.property === "version"
    && ~["module", "exports"].indexOf(node.left.start.value)) {
    return {
      version: node.right.end.value,
      line: node.right.end.line,
    };
  }

  return undefined;
});

patterns.push((node) => {
  // matching object literals from assignments to exports
  if (node.operator === "=" && node.left.property === "exports"
    && isObjectLiteral(node.right)) {
    return extractVersionProperty(node.right.properties);
  }

  return undefined;
});

patterns.push((node) => {
  // matching return { [...], version: "...", [...] }
  if (node.start && node.value && node.start.value === "return"
      && isObjectLiteral(node.value)) {
    return extractVersionProperty(node.value.properties);
  }

  return undefined;
});

patterns.push((node) => {
  // matching generic assignments to .version or
  // literals containing the property "version"
  let result;
  if (node.left && node.left.property === "version") {
    result = {
      version: node.right.end.value,
      line: node.right.end.line,
    };
  }
  else if (node.value && isObjectLiteral(node.value)) {
    result = extractVersionProperty(node.value.properties);
  }
  else if (node.operator === "=" && isObjectLiteral(node.right)) {
    result = extractVersionProperty(node.right.properties);
  }

  if (result) {
    // eslint-disable-next-line no-console
    console.log(`WARNING: found version number ${result.version}, ` +
      "but not directly assigned to module or exports.");
  }
  return result;
});

// matching simple object literals
// useful for JSON
patterns.push(
  (node) =>
    (isJSONObject(node) ? extractVersionProperty(node.properties) : undefined));

patterns.match = function match(node) {
  let result;
  patterns.find((pattern) => {
    result = pattern(node);
    return result;
  });
  return result;
};


function traverse(node) {
  let result = patterns.match(node);
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
      result = traverse(n);
      return result;
    });

    return result;
  }
  else if (node.args && node.args.length) {
    node.args.find((n) => {
      result = traverse(n);
      return result;
    });

    return result;
  }
  else if (node.body) {
    return traverse(node.body);
  }
  else if (node.expression) {
    return traverse(node.expression);
  }
  else if (node.right && node.right.expression) {
    return traverse(node.right.expression);
  }

  return undefined;
}


exports.parse = function parse(data) {
  const ast = uglify.parse(data);
  return traverse(ast);
};
