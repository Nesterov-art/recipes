module.exports = function (api) {
  const platform = api.caller(caller => caller?.platform);
  return {
    presets: ['babel-preset-expo'],
    plugins: platform === 'android' || platform === 'ios'
      ? ['./plugins/babel-draggable-compat.cjs']
      : [],
  };
};
