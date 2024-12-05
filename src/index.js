const ImportManager = require('./core/importManager');
const path = require('path');

console.log('🚀 Starting import manager example...');

const projectPath = process.cwd();
const manager = new ImportManager(projectPath);

async function run() {
    try {
        await manager.start();
        console.log('✨ Import manager is now watching for changes');
        
        // Log current dependencies
        const packageJson = require(path.join(projectPath, 'package.json'));
        console.log('\n📦 Current dependencies:', packageJson.dependencies);
        
        // Keep the process running
        process.stdin.resume();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n👋 Stopping import manager...');
            manager.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

run();
