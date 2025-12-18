/**
 * Point d'entrée pour Vercel serverless functions
 * Version simplifiée - import direct des routes sans passer par server.js
 */

// Charger dotenv en premier (important pour Vercel)
require('dotenv').config();

const express = require('express');
const app = express();

// CORS - Configuration simple et directe
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Headers CORS pour TOUTES les requêtes
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', origin ? 'true' : 'false');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Gérer OPTIONS (preflight) directement
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  next();
});

app.use(express.json());

// Routes
app.use('/api/analyze', require('../routes/analyze'));
app.use('/api/confirm-appointment', require('../routes/confirmAppointment'));
app.use('/api/stats', require('../routes/stats'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    name: 'Visibility Strategy Score API',
    version: '1.0.0',
    status: 'ok'
  });
});

// Gestion d'erreurs
app.use((err, req, res, next) => {
  console.error('Erreur:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erreur serveur',
    message: err.message || 'Une erreur est survenue'
  });
});

// Handler pour Vercel serverless functions
module.exports = app;
