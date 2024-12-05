# 🧹 Autoremover Import

Automatically manage your JavaScript/React project dependencies by analyzing imports in real-time. Never worry about unused dependencies or missing packages again!

## ✨ Features

- 🔍 **Real-time Analysis**: Monitors your code for import changes
- 🚀 **Auto-Installation**: Automatically installs missing dependencies
- 🗑️ **Auto-Removal**: Safely removes unused dependencies
- 🛡️ **Safe Mode**: Optional confirmation before any package changes
- 📦 **Multiple Package Managers**: Supports both npm and yarn
- 🌟 **Smart Detection**: Supports both ES6 imports and require syntax
- 🔒 **Protected Packages**: Prevent accidental removal of essential packages
- 📁 **Deep Scanning**: Recursively analyzes all project files

## 📥 Installation

```bash
npm install autoremover-import
# or
yarn add autoremover-import
```

## 🚀 Quick Start

1. After installation, initialize the configuration:
```bash
npx autoremover-import init
```

2. Start watching your imports:
```bash
npm run watch-imports
# or
yarn watch-imports
```

## 💻 Usage Examples

### Basic Usage
```javascript
const ImportManager = require('autoremover-import');

// Initialize with your project path
const manager = new ImportManager(__dirname);

// Start watching for changes
manager.start().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
```

### With Safe Mode
```javascript
const ImportManager = require('autoremover-import');
const path = require('path');

const manager = new ImportManager(__dirname);

async function run() {
    try {
        await manager.start();
        console.log('✨ Import manager is now watching for changes');
        
        // Keep the process running
        process.stdin.resume();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('Stopping import manager...');
            manager.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
```

## ⚙️ Configuration

Create an `import-manager.config.js` file in your project root:

```javascript
module.exports = {
  // Packages that will never be removed automatically
  ignoredPackages: [
    'react',
    'typescript'
  ],

  // Watcher configuration
  watcherConfig: {
    watchOnSave: true,          // Watch for file changes
    watchInterval: 1000,        // Check interval in milliseconds
    ignoredPaths: [             // Paths to ignore
      'node_modules',
      'dist',
      'build',
      '.next',
      '*.test.*',
      'package.json',
      'package-lock.json'
    ],
    fileExtensions: [           // File types to watch
      '.js',
      '.jsx',
      '.ts',
      '.tsx'
    ]
  },

  // Package.json configuration
  packageJsonConfig: {
    checkDevDependencies: false,  // Whether to manage devDependencies
    defaultVersion: 'latest',     // Default version when installing new packages
    safeMode: false,             // Ask for confirmation before changes
    packageManager: 'npm'        // 'npm' or 'yarn'
  },

  // Enable debug logs
  debug: true
};
```

### Configuration Options Explained

#### 🛡️ ignoredPackages
- **Purpose**: Protect packages from being removed
- **Example**: `['react', 'typescript']`
- **Use Case**: Essential packages that should never be removed

#### ⚡ watcherConfig
- **watchOnSave**: Enable/disable file watching
  - `true`: Real-time monitoring
  - `false`: Manual analysis only
- **watchInterval**: Delay between checks
  - Lower value = More frequent checks
  - Higher value = Better performance
- **ignoredPaths**: Paths to exclude from analysis
- **fileExtensions**: File types to analyze

#### 📦 packageJsonConfig
- **checkDevDependencies**: Include devDependencies in analysis
  - `true`: Manage both dependencies and devDependencies
  - `false`: Only manage dependencies
- **safeMode**: Confirmation prompts
  - `true`: Ask before any package changes
  - `false`: Automatic changes without confirmation
- **packageManager**: Choose your package manager
  - `'npm'`: Use npm commands
  - `'yarn'`: Use yarn commands

## 🔍 Import Detection

Supports various import syntaxes:

```javascript
// ES6 imports
import axios from 'axios';
import { get, post } from 'axios';
import * as React from 'react';

// CommonJS requires
const axios = require('axios');
const { get, post } = require('axios');
```

## 🛠️ Advanced Features

### Protected Packages
Some packages are protected by default and won't be removed:
- The package itself (`autoremover-import`)
- Packages listed in `ignoredPackages`

### Deep Analysis
- Analyzes all files in your project recursively
- Ensures packages used in any file are not removed
- Handles complex import patterns and dependencies

### Safe Mode Operations
When `safeMode` is enabled:
```bash
🤔 Do you want to install axios? (y/n): y
📥 Installing axios...
✅ axios installed successfully

🤔 Do you want to remove moment? (y/n): n
⏭️ Skipping removal of moment
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © [rs12]