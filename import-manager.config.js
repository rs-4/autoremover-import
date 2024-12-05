module.exports = {
  essentialPackages: [
    'typescript'
  ],

  watcherConfig: {
    watchOnSave: true,
    watchInterval: 1000,
    ignoredPaths: [
      'node_modules',
      'dist',
      'build',
      '.next',
      '*.test.*',
      'package.json',
      'package-lock.json'
    ],
    fileExtensions: ['.js', '.jsx', '.ts', '.tsx']
  },

  packageJsonConfig: {
    checkDevDependencies: false,
    defaultVersion: 'latest'
  },

  debug: true
};