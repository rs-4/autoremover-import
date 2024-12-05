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
    const unusedPackages = new Set();
    const allFiles = [];
    
    // Récupérer tous les fichiers à analyser
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

    if (this.config.debug) {
      console.log('🔄 Analyzing dependencies...');
      console.log(`📁 Scanning files: ${allFiles.length}`);
    }

    // Analyser chaque fichier
    for (const file of allFiles) {
      try {
        const content = fs.readFileSync(path.join(this.projectPath, file), 'utf8');
        this.analyzeFileContent(content, usedPackages, unusedPackages);
      } catch (error) {
        console.error(`❌ Error in ${file}:`, error);
      }
    }

    // Afficher le rapport global une seule fois
    if (this.config.debug && (usedPackages.size > 0 || unusedPackages.size > 0)) {
      console.log('\n📊 Dependencies status:');
      if (usedPackages.size > 0) {
        console.log(`  ✅ ${usedPackages.size} used: ${Array.from(usedPackages).join(', ')}`);
      }
      if (unusedPackages.size > 0) {
        console.log(`  ⚠️  ${unusedPackages.size} unused: ${Array.from(unusedPackages).join(', ')}`);
      }
    }

    return usedPackages;
  }

  shouldIgnoreFile(file) {
    // Packages natifs de Node à ignorer
    const nativeModules = [
      'fs',
      'path',
      'child_process',
      'util',
      'readline',
      '@babel'
    ];

    // Ignorer les fichiers du package lui-même
    const selfPackageFiles = [
      'src/core/importManager.js',
      'src/index.js',
      'src/bin/cli.js',
      'src/bin/install.js',
      'src/config/import-manager.config.js',
      'watcher-importmanager.js',
      'node_modules/@babel',
      'node_modules/chokidar'
    ];

    // Vérifier si c'est un module natif
    if (nativeModules.includes(file)) {
      return true;
    }

    // Vérifier si c'est un fichier du package
    if (selfPackageFiles.some(pattern => file.includes(pattern))) {
      return true;
    }

    // Ignorer les patterns de la config
    return this.config.watcherConfig.ignoredPaths.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'), 'i');
      return regex.test(file);
    });
  }

  analyzeFileContent(content, usedPackages, unusedPackages) {
    const internalDependencies = [
      '@babel',
      '@babel/parser',
      '@babel/traverse',
      '@babel/core',
      'chokidar',
      'fs',
      'path',
      'child_process',
      'util',
      'readline',
      'typescript',
      'autoremover-import'
    ];

    const isNpmPackage = (source) => {
      if (!source) return false;
      
      // Ignorer tous les chemins relatifs et absolus
      if (source.startsWith('.') || 
          source.startsWith('/') || 
          source.startsWith('..') || 
          /^[a-zA-Z]:\\/.test(source)) {
        return false;
      }

      // Vérifier si c'est un package npm valide
      const packageName = source.split('/')[0];
      
      // Gestion des packages scoped (@org/package)
      if (packageName.startsWith('@')) {
        const parts = packageName.split('/');
        return parts.length === 2 && /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/.test(packageName);
      }
      
      // Packages standards
      return /^[a-z0-9-~][a-z0-9-._~]*$/.test(packageName);
    };

    const shouldAnalyzeImport = (source) => {
      // Vérifier d'abord si c'est un package npm
     if (!isNpmPackage(source)) {
        return false;
      } 

      // Vérifier si c'est un package interne à ignorer
      const packageName = source.split('/')[0];
      const shouldIgnore = internalDependencies.some(dep => 
        packageName === dep || packageName.startsWith(`${dep}/`)
      );
      return !shouldIgnore;
    };

    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy']
      });

      const imports = new Map();
      let hasJSX = false;

      const addImport = (packageName, localName) => {
        if (!imports.has(packageName)) {
          imports.set(packageName, new Set());
        }
        imports.get(packageName).add(localName);
      };

      const checkUsage = (name) => {
        imports.forEach((localNames, packageName) => {
          if (localNames.has(name)) {
            usedPackages.add(packageName);
            unusedPackages.delete(packageName);
          }
        });
      };

      traverse(ast, {
        ImportDeclaration(path) {
          const source = path.node.source.value;
          if (shouldAnalyzeImport(source)) {
            const packageName = source.split('/')[0];
            path.node.specifiers.forEach(spec => {
              addImport(packageName, spec.local.name);
            });
          }
        },

        CallExpression(path) {
          if (path.node.callee.name === 'require') {
            const args = path.node.arguments;
            if (args.length > 0 && args[0].type === 'StringLiteral') {
              const source = args[0].value;
              if (shouldAnalyzeImport(source)) {
                const packageName = source.split('/')[0];
                if (path.parent.type === 'VariableDeclarator') {
                  if (path.parent.id.type === 'Identifier') {
                    addImport(packageName, path.parent.id.name);
                  } else if (path.parent.id.type === 'ObjectPattern') {
                    path.parent.id.properties.forEach(prop => {
                      addImport(packageName, prop.value.name);
                    });
                  }
                }
              }
            }
          }
        },

        JSXElement() {
          hasJSX = true;
        },

        MemberExpression(path) {
          if (path.node.object.type === 'Identifier') {
            checkUsage(path.node.object.name);
          }
        },

        Identifier(path) {
          if (!path.parent.type.includes('Import') && 
              !path.parent.type.includes('VariableDeclarator') &&
              path.parent.type !== 'MemberExpression') {
            checkUsage(path.node.name);
          }
        }
      });

      if (hasJSX) {
        usedPackages.add('react');
      }

      // Mettre à jour les packages inutilisés
      imports.forEach((localNames, packageName) => {
        if (!usedPackages.has(packageName)) {
          unusedPackages.add(packageName);
        }
      });

    } catch (error) {
      if (error.code === 'BABEL_PARSER_SYNTAX_ERROR') {
        console.error('❌ Error parsing file:', error.message);
      } else {
        console.error('❌ Error analyzing imports:', error);
      }
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

      // Protection du package lui-même et des packages spéciaux
      const PROTECTED_PACKAGES = [
        'autoremover-import',
        '@babel',
        '@babel/core',
        '@babel/parser',
        '@babel/traverse',
        'chokidar',
        'typescript'
      ];

      const toInstall = Array.from(usedPackages)
        .filter(pkg => 
          !currentDeps[pkg] && 
          !devDeps[pkg] && 
          !this.config.ignoredPackages.includes(pkg) &&
          !PROTECTED_PACKAGES.some(protectedPkg => pkg.startsWith(protectedPkg))
        );

      const toRemove = Object.keys(currentDeps)
        .filter(pkg => 
          !usedPackages.has(pkg) && 
          !devDeps[pkg] && 
          !this.config.ignoredPackages.includes(pkg) &&
          !PROTECTED_PACKAGES.some(protectedPkg => pkg.startsWith(protectedPkg))
        );

      // Afficher un résumé des changements
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
        } catch (error) {
          console.error(`❌ Failed to install ${pkg}:`, error.message);
        }
      }

      // Suppression des packages en une seule commande
      if (toRemove.length > 0) {
        try {
          if (this.config.packageJsonConfig.safeMode) {
            const shouldRemove = await this.confirmAction(
              `\n🤔 Do you want to remove these packages: ${toRemove.join(', ')}?`
            );
            if (!shouldRemove) {
              console.log('⏭️  Skipping removal of packages');
              return;
            }
          }

          console.log('\n🗑️  Removing packages...');
          const command = this.config.packageJsonConfig.packageManager === 'yarn'
            ? `yarn remove ${toRemove.join(' ')}`
            : `npm uninstall ${toRemove.join(' ')}`;

          await execAsync(command, { 
            cwd: this.projectPath,
            stdio: 'inherit'
          });
          console.log('✅ Packages removed successfully');
        } catch (error) {
          console.error('❌ Failed to remove packages:', error.message);
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