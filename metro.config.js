const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Transpile packages that ship modern JS syntax (class static blocks, etc.)
config.transformIgnorePatterns = [
  'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|@sphereon|@animo-id|react-native-quick-crypto|react-native-mmkv|nativewind|react-native-css-interop)/)',
];

function createResolveRequest(defaultResolveRequest) {
  return function resolveRequest(context, moduleName, platform) {
    if (moduleName === '@js-joda/core') {
      return {
        type: 'sourceFile',
        filePath: path.join(__dirname, 'src', 'vendor', 'js-joda.hermes.js'),
      };
    }

    if (moduleName === 'crypto' || moduleName === 'node:crypto') {
      return defaultResolveRequest(context, 'react-native-quick-crypto', platform);
    }

    return defaultResolveRequest(context, moduleName, platform);
  };
}

const nativeWindConfig = withNativeWind(config, { input: './global.css' });
const defaultResolveRequest =
  nativeWindConfig.resolver.resolveRequest ??
  ((context, moduleName, platform) => context.resolveRequest(context, moduleName, platform));
nativeWindConfig.resolver.resolveRequest = createResolveRequest(defaultResolveRequest);

module.exports = nativeWindConfig;
