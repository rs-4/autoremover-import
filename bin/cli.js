#!/usr/bin/env node

const ImportManager = require('../importManager');
const path = require('path');
const fs = require('fs');

// Get user's project path
const userProjectPath = process.cwd();

// Function to add script to user's package.json
function addScriptToPackageJson() {
    const packageJsonPath = path.join(userProjectPath, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Add script if it doesn't exist
        if (!packageJson.scripts) {
            packageJson.scripts = {};
        }
        
        if (!packageJson.scripts['watch-imports']) {
            packageJson.scripts['watch-imports'] = 'autorem';
            
            // Write changes to package.json
            fs.writeFileSync(
                packageJsonPath,
                JSON.stringify(packageJson, null, 2)
            );
            console.log('Script "watch-imports" added to package.json');
        }
    }
}

// Function to copy configuration file if it doesn't exist
function createConfigFile() {
    const configPath = path.join(userProjectPath, 'import-manager.config.js');
    
    if (!fs.existsSync(configPath)) {
        const defaultConfig = path.join(__dirname, '../import-manager.config.js');
        fs.copyFileSync(defaultConfig, configPath);
        console.log('Configuration file created');
    }
}

// Initialization function
async function init() {
    try {
        addScriptToPackageJson();
        createConfigFile();
        console.log('Installation completed successfully');
    } catch (error) {
        console.error('Error during installation:', error);
        process.exit(1);
    }
}

// Main function
async function main() {
    const args = process.argv.slice(2);
    
    if (args[0] === 'init') {
        await init();
        return;
    }

    try {
        // Start the import manager
        const manager = new ImportManager(userProjectPath);
        await manager.start();
        
        console.log('Import manager started successfully');
        
    } catch (error) {
        console.error('Error during initialization:', error);
        process.exit(1);
    }
}

// Execute the program
main(); 