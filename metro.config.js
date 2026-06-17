const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure .web.tsx / .web.ts extensions are resolved before native equivalents
config.resolver.sourceExts = [
  'web.tsx',
  'web.ts',
  'web.jsx',
  'web.js',
  ...config.resolver.sourceExts,
];

module.exports = config;
