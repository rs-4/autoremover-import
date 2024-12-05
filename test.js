const ImportManager = require('./importManager');
const fs = require('fs');
console.log('Démarrage du gestionnaire d\'imports...');
console.log('Répertoire actuel:', __dirname);

const manager = new ImportManager(__dirname);

try {
    // Afficher le contenu initial du package.json
    console.log('package.json initial:', require('./package.json'));

    manager.start().catch(error => {
        console.error('Erreur au démarrage du gestionnaire d\'imports:', error);
        process.exit(1);
    });

    // Afficher les fichiers surveillés après 2 secondes
    setTimeout(() => {
        const watched = manager.watcher.getWatched();
        console.log('Fichiers surveillés:', watched);
        
        // Relire et afficher le package.json pour voir les changements
        const updatedPackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        console.log('package.json mis à jour:', updatedPackageJson);
    }, 2000);

} catch (error) {
    console.error('Erreur critique:', error);
    process.exit(1);
}