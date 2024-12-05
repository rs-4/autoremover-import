// importManager.js
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ImportManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.packageJsonPath = path.join(projectPath, 'package.json');
    this.watcher = null;
    
    try {
      const configPath = path.join(projectPath, 'import-manager.config.js');
      this.config = fs.existsSync(configPath) 
        ? require(configPath)
        : require('./import-manager.config.js');
      
      if (this.config.debug) {
        console.log('Configuration loaded:', this.config);
      }
    } catch (error) {
      console.error('Error loading config, using defaults:', error);
      this.config = require('./import-manager.config.js');
    }
  }

  async start() {
    console.log('Démarrage du gestionnaire d\'imports...');
    
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
      console.log('Motifs de surveillance:', watchPattern);
      console.log('Motifs ignorés:', ignoredPatterns);
    }

    await this.analyzeAndUpdate();

    if (this.config.watcherConfig.watchOnSave) {
      let timeoutId = null;
      this.watcher.on('change', path => {
        console.log('Fichier modifié:', path);
        
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
      console.log('Analyse et mise à jour des packages...');
      const usedPackages = await this.analyzeUsage();
      
      this.config.essentialPackages.forEach(pkg => usedPackages.add(pkg));
      
      await this.updatePackages(usedPackages);
      console.log('Analyse terminée');
    } catch (error) {
      console.error('Erreur lors de l\'analyse:', error);
    }
  }

  async analyzeUsage() {
    const usedPackages = new Set();
    
    const files = fs.readdirSync(this.projectPath)
      .filter(file => {
        const ext = path.extname(file);
        return this.config.watcherConfig.fileExtensions.includes(ext);
      })
      .filter(file => !this.shouldIgnoreFile(file));

    if (this.config.debug) {
      console.log('Analyzing files:', files);
    }

    for (const file of files) {
      try {
        if (file === path.basename(__filename)) {
          continue;
        }
        
        const content = fs.readFileSync(path.join(this.projectPath, file), 'utf8');
        this.analyzeFileContent(content, usedPackages);
      } catch (error) {
        console.error(`Error analyzing ${file}:`, error);
      }
    }

    return usedPackages;
  }

  shouldIgnoreFile(file) {
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
      const debug = this.config?.debug;

      const checkUsage = (name) => {
        imports.forEach((specifiers, packageName) => {
          specifiers.forEach(spec => {
            if (spec.name === name) {
              spec.used = true;
              spec.usageCount++;
              usedPackages.add(packageName);
              if (debug) {
                console.log(`Usage detected for package: ${packageName}`);
              }
            }
          });
        });
      };

      traverse(ast, {
        ImportDeclaration(path) {
          const source = path.node.source.value;
          if (!source.startsWith('.') && !source.startsWith('/')) {
            const packageName = source.split('/')[0];
            const specifiers = path.node.specifiers.map(spec => ({
              name: spec.local.name,
              used: false,
              usageCount: 0
            }));
            imports.set(packageName, specifiers);
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
            if (debug) {
              console.log('Usage detected for package: styled-components');
            }
          }
        },

        MemberExpression(path) {
          if (path.node.object.name) {
            checkUsage(path.node.object.name);
          }
        },

        Identifier(path) {
          if (!path.parent.type.includes('Import')) {
            checkUsage(path.node.name);
          }
        }
      });

      if (hasJSX) {
        usedPackages.add('react');
        if (debug) {
          console.log('Usage detected for package: react');
        }
      }

      imports.forEach((specifiers, packageName) => {
        if (specifiers.some(spec => spec.used)) {
          usedPackages.add(packageName);
          if (debug) {
            console.log(`Package ${packageName} is being used`);
          }
        } else if (debug) {
          console.log(`Package ${packageName} is imported but not used`);
        }
      });

    } catch (error) {
      console.error('Error parsing file:', error);
    }
  }

  async updatePackages(usedPackages) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
      const currentDeps = packageJson.dependencies || {};
      const devDeps = this.config.packageJsonConfig.checkDevDependencies 
        ? (packageJson.devDependencies || {})
        : {};

      const missingEssentials = this.config.essentialPackages
        .filter(pkg => !currentDeps[pkg] && !devDeps[pkg]);

      if (missingEssentials.length > 0) {
        console.log('Installing missing essential packages:', missingEssentials);
        for (const pkg of missingEssentials) {
          try {
            await execAsync(`npm install ${pkg}`, { 
              cwd: this.projectPath,
              stdio: 'inherit'
            });
            console.log(`Successfully installed essential package ${pkg}`);
          } catch (error) {
            console.error(`Error installing essential package ${pkg}:`, error);
          }
        }
      }

      const toInstall = Array.from(usedPackages)
        .filter(pkg => 
          !currentDeps[pkg] && 
          !devDeps[pkg] && 
          !this.config.essentialPackages.includes(pkg)
        );

      const toRemove = Object.keys(currentDeps)
        .filter(pkg => 
          !usedPackages.has(pkg) && 
          !devDeps[pkg] && 
          !this.config.essentialPackages.includes(pkg)
        );

      if (toInstall.length > 0) {
        console.log('Installing new non-essential packages:', toInstall);
        for (const pkg of toInstall) {
          try {
            await execAsync(`npm install ${pkg}`, { 
              cwd: this.projectPath,
              stdio: 'inherit'
            });
            console.log(`Successfully installed ${pkg}`);
          } catch (error) {
            console.error(`Error installing ${pkg}:`, error);
          }
        }
      }

      if (toRemove.length > 0) {
        console.log('Removing unused non-essential packages:', toRemove);
        for (const pkg of toRemove) {
          try {
            await execAsync(`npm uninstall ${pkg}`, { 
              cwd: this.projectPath,
              stdio: 'inherit'
            });
            console.log(`Successfully removed ${pkg}`);
          } catch (error) {
            console.error(`Error removing ${pkg}:`, error);
          }
        }
      }

      if (this.config.debug) {
        console.log('Package updates completed');
      }
    } catch (error) {
      console.error('Error updating packages:', error);
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