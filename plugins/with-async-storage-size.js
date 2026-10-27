const { withGradleProperties } = require('expo/config-plugins');

// Raises the Android AsyncStorage database limit (library default: 6 MB). It only lifts the
// total size: one row is still read through a ~2 MiB CursorWindow, which is why native values
// are split into parts of at most 256 KiB (src/utils/chunked-storage.ts).
// It does not touch AsyncStorage_useNextStorage: that backend is a separate database.
const KEY = 'AsyncStorage_db_size_in_MB';

module.exports = function withAsyncStorageSize(config, { sizeMB = 32 } = {}) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter((item) => !(item.type === 'property' && item.key === KEY));
    config.modResults.push({ type: 'property', key: KEY, value: String(sizeMB) });
    return config;
  });
};
