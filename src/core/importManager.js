const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { exec } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');
const execAsync = promisify(exec);

class ImportManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.packageJsonPath = path.join(projectPath, './package.json');
    this.watcher = null;
    
    try {
      const configPath = path.join(projectPath, 'import-manager.config.js');
      this.config = fs.existsSync(configPath) 
        ? require(configPath)
      
        : require('../config/import-manager.config.js');
      
      if (!this.config.packageJsonConfig.packageManager) {
        this.config.packageJsonConfig.packageManager = 'npm';
      }

      if (this.config.debug) {
        console.log('📦 Using package manager:', this.config.packageJsonConfig.packageManager);
      }
    } catch (error) {
      console.error('❌ Error loading config, using defaults:', error);
      this.config = require('../config/import-manager.config.js');
    }
  }

  getInstallCommand(pkg) {
    const manager = this.config.packageJsonConfig.packageManager;
    switch (manager) {
      case 'yarn':
        return `yarn add ${pkg}`;
      case 'npm':
      default:
        return `npm install ${pkg}`;
    }
  }

  getUninstallCommand(pkg) {
    const manager = this.config.packageJsonConfig.packageManager;
    switch (manager) {
      case 'yarn':
        return `yarn remove ${pkg}`;
      case 'npm':
      default:
        return `npm uninstall ${pkg}`;
    }
  }

  async start() {
    console.log('🚀 Starting import manager...');
    
    const watchPattern = this.config.watcherConfig.fileExtensions
      .map(ext => `**/*${ext}`);

    const ignoredPatterns = this.config.watcherConfig.ignoredPaths
      .map(pattern => `**/${pattern}/**`);

    this.watcher = chokidar.watch(watchPattern, {
      ignored: ignoredPatterns,
      cwd: this.projectPath,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    });

    if (this.config.debug) {
      console.log('🔍 Watch patterns:', watchPattern);
      console.log('🚫 Ignored patterns:', ignoredPatterns);
    }

    await this.analyzeAndUpdate();

    if (this.config.watcherConfig.watchOnSave) {
      let timeoutId = null;
      this.watcher.on('change', path => {
        console.log('📝 File modified:', path);
        
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
          this.analyzeAndUpdate();
        }, 300);
      });
    }
  }

  async analyzeAndUpdate() {
    try {
      if (this.config.debug) {
        console.log('🔄 Analyzing dependencies...');
      }
      const usedPackages = await this.analyzeUsage();
      await this.updatePackages(usedPackages);
    } catch (error) {
      console.error('❌ Analysis error:', error);
    }
  }

  async analyzeUsage() {
    const usedPackages = new Set();
    const allFiles = [];
    
    // Récupérer tous les fichiers à analyser
    const files = fs.readdirSync(this.projectPath)
      .filter(file => {
        const ext = path.extname(file);
        return this.config.watcherConfig.fileExtensions.includes(ext);
      })
      .filter(file => !this.shouldIgnoreFile(file));

    if (this.config.debug) {
      console.log('📁 Scanning files:', files.length);
    }

    // Analyser récursivement les sous-dossiers
    const scanDirectory = (dir) => {
      const entries = fs.readdirSync(dir);
      entries.forEach(entry => {
        const fullPath = path.join(dir, entry);
        const relativePath = path.relative(this.projectPath, fullPath);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !this.shouldIgnoreFile(relativePath)) {
          scanDirectory(fullPath);
        } else if (stat.isFile() && 
                  this.config.watcherConfig.fileExtensions.includes(path.extname(entry)) &&
                  !this.shouldIgnoreFile(relativePath)) {
          allFiles.push(relativePath);
        }
      });
    };

    // Scanner le projet en entier
    scanDirectory(this.projectPath);

    // Analyser chaque fichier
    for (const file of allFiles) {
      try {
        const content = fs.readFileSync(path.join(this.projectPath, file), 'utf8');
        this.analyzeFileContent(content, usedPackages);
      } catch (error) {
        console.error(`❌ Error in ${file}:`, error);
      }
    }

    return usedPackages;
  }

  shouldIgnoreFile(file) {
    // Ignorer les fichiers du package lui-même
    const selfPackageFiles = [
      'importManager.js',
      'index.js',
      'watcher-importmanager.js',
      'import-manager.config.js',
      'bin/cli.js',
      'bin/install.js'
    ];

    if (selfPackageFiles.includes(file)) {
      return true;
    }

    // Ignorer les patterns de la config
    return this.config.watcherConfig.ignoredPaths.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'), 'i');
      return regex.test(file);
    });
  }

  analyzeFileContent(content, usedPackages) {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy']
      });

      const imports = new Map();
      let hasJSX = false;

      const addImport = (packageName, localName) => {
        if (!imports.has(packageName)) {
          imports.set(packageName, []);
        }
        imports.get(packageName).push({
          name: localName,
          used: false,
          usageCount: 0
        });
      };

      const checkUsage = (name) => {
        imports.forEach((specifiers, packageName) => {
          specifiers.forEach(spec => {
            if (spec.name === name) {
              spec.used = true;
              spec.usageCount++;
              usedPackages.add(packageName);
            }
          });
        });
      };

      traverse(ast, {
        // Support pour ES6 imports
        ImportDeclaration(path) {
          const source = path.node.source.value;
          if (!source.startsWith('.') && !source.startsWith('/')) {
            const packageName = source.split('/')[0];
            path.node.specifiers.forEach(spec => {
              addImport(packageName, spec.local.name);
            });
          }
        },

        // Support pour require()
        VariableDeclarator(path) {
          if (path.node.init && 
              path.node.init.type === 'CallExpression' && 
              path.node.init.callee.name === 'require') {
            
            const args = path.node.init.arguments;
            if (args.length > 0 && args[0].type === 'StringLiteral') {
              const source = args[0].value;
              if (!source.startsWith('.') && !source.startsWith('/')) {
                const packageName = source.split('/')[0];
                
                // Gérer différents cas de require
                if (path.node.id.type === 'Identifier') {
                  // const axios = require('axios')
                  addImport(packageName, path.node.id.name);
                } 
                else if (path.node.id.type === 'ObjectPattern') {
                  // const { get, post } = require('axios')
                  path.node.id.properties.forEach(prop => {
                    addImport(packageName, prop.value.name);
                  });
                }
              }
            }
          }
        },

        JSXElement() {
          hasJSX = true;
        },

        JSXOpeningElement(path) {
          if (path.node.name && path.node.name.name) {
            checkUsage(path.node.name.name);
          }
        },

        TaggedTemplateExpression(path) {
          if (path.node.tag.type === 'MemberExpression' && 
              path.node.tag.object.name === 'styled') {
            usedPackages.add('styled-components');
          }
        },

        MemberExpression(path) {
          if (path.node.object.name) {
            checkUsage(path.node.object.name);
          }
        },

        Identifier(path) {
          if (!path.parent.type.includes('Import') && 
              !path.parent.type.includes('VariableDeclarator')) {
            checkUsage(path.node.name);
          }
        }
      });

      if (hasJSX) {
        usedPackages.add('react');
      }

      // Collecter les statistiques d'utilisation
      const usedImports = new Set();
      const unusedImports = new Set();

      imports.forEach((specifiers, packageName) => {
        if (specifiers.some(spec => spec.used)) {
          usedImports.add(packageName);
        } else {
          unusedImports.add(packageName);
        }
      });

      if (this.config.debug && (usedImports.size > 0 || unusedImports.size > 0)) {
        console.log('\n📊 Dependencies status:');
        if (usedImports.size > 0) {
          console.log(`  ✅ ${usedImports.size} used: ${Array.from(usedImports).join(', ')}`);
        }
        if (unusedImports.size > 0) {
          console.log(`  ⚠️  ${unusedImports.size} unused: ${Array.from(unusedImports).join(', ')}`);
        }
      }

    } catch (error) {
      console.error('❌ Error parsing file:', error);
    }
  }

  async confirmAction(message) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      const answer = await new Promise(resolve => {
        rl.question(`${message} (y/n): `, (answer) => {
          resolve(answer.toLowerCase());
        });
      });

      return answer === 'y' || answer === 'yes';
    } finally {
      rl.close();
    }
  }

  async updatePackages(usedPackages) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
      const currentDeps = packageJson.dependencies || {};
      const devDeps = this.config.packageJsonConfig.checkDevDependencies 
        ? (packageJson.devDependencies || {})
        : {};

      // Protection du package lui-même
      const PROTECTED_PACKAGE = 'autoremover-import';

      const toInstall = Array.from(usedPackages)
        .filter(pkg => 
          !currentDeps[pkg] && 
          !devDeps[pkg] && 
          !this.config.ignoredPackages.includes(pkg)
        );

      const toRemove = Object.keys(currentDeps)
        .filter(pkg => 
          !usedPackages.has(pkg) && 
          !devDeps[pkg] && 
          !this.config.ignoredPackages.includes(pkg) &&
          pkg !== PROTECTED_PACKAGE
        );

      if (toInstall.length > 0 || toRemove.length > 0) {
        console.log('\n📦 Dependencies changes:');
        if (toInstall.length > 0) console.log(`  + Adding: ${toInstall.join(', ')}`);
        if (toRemove.length > 0) console.log(`  - Removing: ${toRemove.join(', ')}`);
      }

      // Installation des packages
      for (const pkg of toInstall) {
        try {
          if (this.config.packageJsonConfig.safeMode) {
            const shouldInstall = await this.confirmAction(
              `\n🤔 Do you want to install ${pkg}?`
            );
            if (!shouldInstall) {
              console.log(`⏭️  Skipping installation of ${pkg}`);
              continue;
            }
          }

          console.log(`\n📥 Installing ${pkg}...`);
          await execAsync(this.getInstallCommand(pkg), { 
            cwd: this.projectPath,
            stdio: 'inherit'
          });
          console.log(`✅ ${pkg} installed successfully`);
        } catch (error) {
          console.error(`❌ Failed to install ${pkg}:`, error.message);
        }
      }

      // Suppression des packages
      for (const pkg of toRemove) {
        try {
          if (pkg === PROTECTED_PACKAGE) {
            console.warn('⚠️ Attempted to remove protected package autoremover-import - Operation blocked');
            continue;
          }

          if (this.config.packageJsonConfig.safeMode) {
            const shouldRemove = await this.confirmAction(
              `\n🤔 Do you want to remove ${pkg}?`
            );
            if (!shouldRemove) {
              console.log(`⏭️  Skipping removal of ${pkg}`);
              continue;
            }
          }

          console.log(`\n🗑️  Removing ${pkg}...`);
          await execAsync(this.getUninstallCommand(pkg), { 
            cwd: this.projectPath,
            stdio: 'inherit'
          });
          console.log(`✅ ${pkg} removed successfully`);
        } catch (error) {
          console.error(`❌ Failed to remove ${pkg}:`, error.message);
        }
      }

      if (this.config.debug && (toInstall.length > 0 || toRemove.length > 0)) {
        console.log('\n✨ Dependencies update completed\n');
      }
    } catch (error) {
      console.error('❌ Package update error:', error.message);
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      console.log('Import manager stopped');
    }
  }
}

module.exports = ImportManager;