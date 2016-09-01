/* global require exports */
"use strict";
const ts = require("typescript");

function getLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    .line + 1; // + 1 because it is 0-based by default.
}

exports.parse = function parse(filename, data) {
  const sourceFile = ts.createSourceFile(filename, data);
  const statements = sourceFile.statements;
  for (let statementsIx = 0; statementsIx < statements.length; ++statementsIx) {
    const statement = statements[statementsIx];
    if (statement.kind !== ts.SyntaxKind.VariableStatement ||
        statement.declarationList.kind !==
        ts.SyntaxKind.VariableDeclarationList) {
      continue;
    }

    const decls = statement.declarationList.declarations;
    for (let declsIx = 0; declsIx < decls.length; ++declsIx) {
      const node = decls[declsIx];
      if (node.kind !== ts.SyntaxKind.VariableDeclaration ||
          node.name.text !== "version") {
        continue;
      }

      const initializer = node.initializer;
      if (initializer.kind !== ts.SyntaxKind.StringLiteral) {
        continue;
      }

      // Bingo!
      return {
        version: initializer.text,
        line: getLine(sourceFile, initializer),
      };
    }
  }

  return undefined;
};
