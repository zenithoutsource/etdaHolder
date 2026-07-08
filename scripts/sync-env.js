#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const pairs = [
  [path.join(projectRoot, 'env'), path.join(projectRoot, '.env')],
  [path.join(projectRoot, 'server', 'env'), path.join(projectRoot, 'server', '.env')],
];

let failed = false;

for (const [source, target] of pairs) {
  if (!fs.existsSync(source)) {
    console.error(`✗ Missing ${path.relative(projectRoot, source)}`);
    failed = true;
    continue;
  }
  fs.copyFileSync(source, target);
  console.log(`✓  ${path.relative(projectRoot, source)} → ${path.relative(projectRoot, target)}`);
}

process.exit(failed ? 1 : 0);
