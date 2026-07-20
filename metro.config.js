const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

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
