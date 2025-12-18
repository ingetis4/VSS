// Point d'entrée pour Vercel serverless functions
// Ce fichier est nécessaire pour que Vercel reconnaisse les routes API
const app = require('../server');

// Export pour Vercel
module.exports = app;
