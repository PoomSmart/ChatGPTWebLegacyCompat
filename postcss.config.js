module.exports = {
  plugins: [
    // require('@csstools/postcss-cascade-layers'),
    // require('autoprefixer'),
    require('cssnano')({
      preset: 'default',
    }),
  ],
};
