module.exports = {
  ignoredPackages: [
    'typescript',
    'react',
    'react-dom',
    'fs',
    'autoremover-import'
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
      'package-lock.json',
      '.git'
    ],
    fileExtensions: ['.js', '.jsx', '.ts', '.tsx']
  },
  packageJsonConfig: {
    checkDevDependencies: false,
    defaultVersion: 'latest',
    safeMode: false,
    packageManager: 'npm'
  },
  debug: true
};