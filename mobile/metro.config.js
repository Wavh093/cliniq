const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Metro to Babel-transform packages that use private class fields (#field syntax),
// which Hermes cannot parse from raw node_modules source.
// @supabase/realtime-js is the main culprit.
config.transformer.transformIgnorePatterns = [
  'node_modules/(?!(react-native|@react-native|expo|@expo|expo-router|@unimodules|@supabase|react-native-url-polyfill|react-native-calendars|react-native-svg|react-native-safe-area-context|react-native-screens)/)',
];

module.exports = config;
