// Finds JavaScript that iOS 15's Safari can't even load. One of these anywhere in the bundle and the
// whole app shows a blank screen on an iOS 15 iPhone, so the web build fails instead.
//   - class static { } blocks (Safari 16.4)
//   - regular expressions with lookbehind (?<= (?<! (Safari 16.4) or the v flag (Safari 17)
// Newer built-in functions are warned about only. src/polyfills.ts adds .at, findLast, findLastIndex
// and Object.hasOwn, so those aren't listed.

import * as acorn from 'acorn';
import fs from 'node:fs';
import path from 'node:path';

const LOOKBEHIND = /\(\?<[=!]/;
const NEWER_BUILTINS = [
  'structuredClone(',
  '.toSorted(',
  '.toReversed(',
  '.toSpliced(',
  'Object.groupBy(',
  'Promise.withResolvers(',
];

export function checkSafari15(file) {
  const code = fs.readFileSync(file, 'utf8');
  const name = path.basename(file);
  const problems = [];
  const at = (pos) => `${name}:${acorn.getLineInfo(code, pos).line}`;

  let ast;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'script',
      allowHashBang: true,
      onToken: (t) => {
        if (t.type.label !== 'regexp') return;
        const { pattern, flags } = t.value;
        if (LOOKBEHIND.test(pattern)) problems.push(`${at(t.start)} regex lookbehind /${pattern.slice(0, 40)}/`);
        if (flags.includes('v')) problems.push(`${at(t.start)} regex v flag /${pattern.slice(0, 40)}/${flags}`);
      },
    });
  } catch (e) {
    return [`${name}: uses JavaScript newer than ES2022 (${e.message})`];
  }

  walk(ast, (node) => {
    if (node.type === 'StaticBlock') problems.push(`${at(node.start)} class static block`);
    // new RegExp("...(?<=...") only fails when it runs, but it still breaks that feature on iOS 15.
    if (
      (node.type === 'NewExpression' || node.type === 'CallExpression') &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'RegExp' &&
      node.arguments[0]?.type === 'Literal' &&
      typeof node.arguments[0].value === 'string' &&
      LOOKBEHIND.test(node.arguments[0].value)
    ) {
      problems.push(`${at(node.start)} new RegExp with lookbehind`);
    }
  });

  for (const builtin of NEWER_BUILTINS) {
    const count = code.split(builtin).length - 1;
    if (count) console.warn(`  note: ${name} calls ${builtin.replace('(', '')} ${count}x (newer than iOS 15; fine if feature-checked)`);
  }
  return problems;
}

function walk(node, visit) {
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') walk(child, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}
