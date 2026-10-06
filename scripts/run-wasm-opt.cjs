#!/usr/bin/env node
const { existsSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const projectRoot = path.resolve(__dirname, '..');
const executableName = process.platform === 'win32' ? 'wasm-opt.exe' : 'wasm-opt';
const bundledBinary = path.join(projectRoot, 'node_modules', 'wasm-opt', 'bin', executableName);

function findGlobalBinary() {
  const pathSegments = process.env.PATH ? process.env.PATH.split(path.delimiter) : [];
  const sanitizedPath = pathSegments.filter((segment) => !segment.includes(`node_modules${path.sep}.bin`)).join(path.delimiter);
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  const lookup = spawnSync(whichCmd, ['wasm-opt'], { encoding: 'utf8', env: { ...process.env, PATH: sanitizedPath } });

  if (lookup.status === 0 && lookup.stdout.trim()) {
    return lookup.stdout.trim().split(/\r?\n/)[0];
  }

  return null;
}

function findBinary() {
  const globalBinary = findGlobalBinary();
  if (globalBinary) {
    return globalBinary;
  }

  if (existsSync(bundledBinary)) {
    return bundledBinary;
  }

  console.error(
    'wasm-opt binary not found. Install Binaryen (e.g. brew install binaryen) or ensure node_modules/wasm-opt installs its binary.'
  );
  process.exit(1);
}

const binary = findBinary();
const result = spawnSync(binary, args, { stdio: 'inherit' });

process.exit(result.status ?? 1);
