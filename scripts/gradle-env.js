const fs = require('fs');

/** Short path avoids Windows MAX_PATH failures in RN prefab/CMake builds. */
const SHORT_GRADLE_HOME_WIN = 'C:\\gradle';

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function shouldReplaceGradleHome(current) {
  if (!current) return true;
  const normalized = current.replace(/\\/g, '/').toLowerCase();
  return normalized.includes('cursor-sandbox-cache') || normalized.length > 80;
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

module.exports = { resolveGradleEnvironment };
