const ImportManager = require('autorem');

// Initialiser le gestionnaire avec le chemin du projet
const manager = new ImportManager(__dirname);

// Démarrer la surveillance
manager.start().catch(error => {
    console.error('Erreur au démarrage:', error);
});

// Pour arrêter la surveillance plus tard si nécessaire
// manager.stop(); 