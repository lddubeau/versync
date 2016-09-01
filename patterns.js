/* global require module */
"use strict";
var uglify = require("uglify-js");

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
  var result;
  properties.forEach(function each(prop) {
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

var patterns = [];

patterns.push(function exportsPattern(node) {
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

patterns.push(function literalPattern(node) {
  // matching object literals from assignments to exports
  if (node.operator === "=" && node.left.property === "exports"
    && isObjectLiteral(node.right)) {
    return extractVersionProperty(node.right.properties);
  }

  return undefined;
});

patterns.push(function returnPattern(node) {
  // matching return { [...], version: "...", [...] }
  if (node.start && node.value && node.start.value === "return"
      && isObjectLiteral(node.value)) {
    return extractVersionProperty(node.value.properties);
  }

  return undefined;
});

patterns.push(function genericAssignmentPattern(node) {
  // matching generic assignments to .version or
  // literals containing the property "version"
  var result;
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
    console.log("WARNING: found version number " + result.version +
      ", but not directly assigned to module or exports.");
  }
  return result;
});

patterns.push(function objectLiteralPattern(node) {
  // matching simple object literals
  // useful for JSON
  if (isJSONObject(node)) {
    return extractVersionProperty(node.properties);
  }

  return undefined;
});

patterns.match = function match(node) {
  var result;
  // using every because we need
  // to break out of the loop
  patterns.every(function every(pattern) {
    result = pattern(node);
    return !result;
  });

  return result;
};


function traverse(node) {
  var result = patterns.match(node);
  if (result) {
    // if a pattern matched, we return what we found and exit
    return result;
  }
  else {
    // otherwise, we go deeper in the tree
    if (node.length || (node.body && node.body.length)) {
      if (node.body && node.body.length) {
        node = node.body;
      }
      node.every(function every(n) {
        result = traverse(n);
        return !result;
      });

      return result;
    }
    else if (node.args && node.args.length) {
      node.args.every(function every(n) {
        result = traverse(n);
        return !result;
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
  }

  return undefined;
}


var exports = module.exports = {};

exports.parse = function parse(data) {
  var ast = uglify.parse(data);
  return traverse(ast);
};
