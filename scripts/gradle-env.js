const fs = require('fs');
const path = require('path');

/** Short path avoids Windows MAX_PATH failures in RN prefab/CMake builds. */
const SHORT_GRADLE_HOME_WIN = 'C:\\gradle';
const SANDBOX_CACHE_MARKER = 'cursor-sandbox-cache';

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function shouldReplaceGradleHome(current) {
  if (!current) return true;
  const normalized = current.replace(/\\/g, '/').toLowerCase();
  return normalized.includes(SANDBOX_CACHE_MARKER) || normalized.length > 80;
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

/**
 * Ninja's .ninja_deps stores absolute include paths from the prior configure.
 * After GRADLE_USER_HOME moves from a Cursor sandbox cache to C:\gradle, those
 * stale entries still exceed Windows' 260-char Stat limit even when build.ninja
 * already points at the short home. Purge only .cxx trees that still mention
 * the sandbox marker.
 *
 * @param {string} projectRoot
 * @returns {string[]} Removed .cxx directory paths
 */
function cleanStaleSandboxNativeCaches(projectRoot) {
  if (process.platform !== 'win32') {
    return [];
  }

  const nodeModules = path.join(projectRoot, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    return [];
  }

  const removed = [];

  /** @param {string} dir */
  function visitPackageAndroid(dir) {
    const cxxDir = path.join(dir, '.cxx');
    if (!fs.existsSync(cxxDir)) {
      return;
    }

    if (directoryMentionsSandbox(cxxDir)) {
      rmrf(cxxDir);
      removed.push(cxxDir);

      const intermediatesCxx = path.join(dir, 'build', 'intermediates', 'cxx');
      if (fs.existsSync(intermediatesCxx)) {
        rmrf(intermediatesCxx);
        removed.push(intermediatesCxx);
      }
    }
  }

  /** @param {string} dir @param {number} depth */
  function walk(dir, depth) {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.cxx') continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'android') {
        visitPackageAndroid(full);
        continue;
      }
      // Scoped packages (@scope/name) and normal package roots.
      walk(full, depth + 1);
    }
  }

  walk(nodeModules, 0);
  return removed;
}

/** @param {string} dir */
function directoryMentionsSandbox(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (directoryMentionsSandbox(full)) return true;
      continue;
    }
    if (entry.name === '.ninja_deps' || entry.name.endsWith('.txt') || entry.name === 'build.ninja') {
      try {
        const sample = fs.readFileSync(full);
        if (sample.includes(SANDBOX_CACHE_MARKER)) {
          return true;
        }
      } catch {
        // ignore unreadable files
      }
    }
  }
  return false;
}

/**
 * @param {NodeJS.ProcessEnv} [baseEnv]
 * @returns {NodeJS.ProcessEnv}
 */
function resolveGradleEnvironment(baseEnv = process.env) {
  const env = { ...baseEnv };

  if (process.platform !== 'win32') {
    return env;
  }

  if (shouldReplaceGradleHome(env.GRADLE_USER_HOME)) {
    ensureDirectory(SHORT_GRADLE_HOME_WIN);
    env.GRADLE_USER_HOME = SHORT_GRADLE_HOME_WIN;
  }

  return env;
}

module.exports = {
  resolveGradleEnvironment,
  cleanStaleSandboxNativeCaches,
  shouldReplaceGradleHome,
  SHORT_GRADLE_HOME_WIN,
  SANDBOX_CACHE_MARKER,
};
