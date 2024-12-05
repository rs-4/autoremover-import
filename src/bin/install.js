#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Get the parent project path (where the package is installed)
const parentPath = process.env.INIT_CWD || process.cwd();

function setupProject() {
    try {
        console.log('📦 Setting up project...');
        
        // Parent package.json path
        const parentPackageJsonPath = path.join(parentPath, 'package.json');
        
        // Configuration file path
        const configPath = path.join(parentPath, 'import-manager.config.js');
        
        // Watcher file path
        const watcherPath = path.join(parentPath, 'watcher-importmanager.js');
        
        // Add script to parent package.json
        if (fs.existsSync(parentPackageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(parentPackageJsonPath, 'utf8'));
            
            if (!packageJson.scripts) {
                packageJson.scripts = {};
            }
            
            // Add required scripts
            packageJson.scripts['watch-imports'] = 'node watcher-importmanager.js';
            packageJson.scripts['watch-dev'] = 'npm run watch-imports';
            
            fs.writeFileSync(parentPackageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log('✅ Scripts added to package.json');
        }
        
        // Copy configuration file
        if (!fs.existsSync(configPath)) {
            const defaultConfig = path.join(__dirname, '../config/import-manager.config.js');
            fs.copyFileSync(defaultConfig, configPath);
            console.log('✅ Configuration file created');
        }
        
        // Create watcher.js file
        const watcherContent = `
const ImportManager = require('autoremover-import');

console.log('🔍 Starting import manager...');

const manager = new ImportManager(__dirname);
manager.start().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});

console.log('✨ Import watching enabled');
`;
        
        fs.writeFileSync(watcherPath, watcherContent);
        console.log('✅ Watcher file created');
        
        console.log('\n✅ Installation completed successfully!');
        console.log('\nTo start watching imports:');
        console.log('  npm run watch-imports');
        console.log('or');
        console.log('  npm run dev\n');
        
    } catch (error) {
        console.error('❌ Error during installation:', error);
        console.error(error);
    }
}

setupProject(); 