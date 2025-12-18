const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const analyzeRouter = require('./routes/analyze');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware CORS - Configuration ultra-permissive pour Vercel
// IMPORTANT: Doit être le PREMIER middleware
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

// Middleware CORS d'Express (backup, mais le custom middleware ci-dessus devrait suffire)
app.use(cors({
  origin: true, // Autoriser toutes les origines
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.use(express.json());

// Rate limiting : désactivé par défaut (aucune limite)
// Pour activer, définir RATE_LIMIT_MAX avec une valeur > 0 dans .env
const RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 0;
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW) : 24 * 60 * 60 * 1000; // 24 heures par défaut (1 jour)

if (RATE_LIMIT_MAX > 0) {
  const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    message: { 
      error: 'Limite de requêtes atteinte',
      message: `Vous avez atteint la limite de ${RATE_LIMIT_MAX} analyse(s) par jour. Réessayez demain ou contactez-nous pour une analyse approfondie.`
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Utiliser l'IP réelle même derrière un proxy
    trustProxy: true,
    // Skip successful requests (ne pas compter les erreurs comme des requêtes)
    skipSuccessfulRequests: false,
    // Skip failed requests (compter les erreurs aussi)
    skipFailedRequests: false
  });
  app.use('/api/analyze', limiter);
  const windowHours = RATE_LIMIT_WINDOW / 1000 / 60 / 60;
  console.log(`✅ Rate limiting activé: ${RATE_LIMIT_MAX} requêtes par ${windowHours} heure(s) (${windowHours === 24 ? 'jour' : windowHours + 'h'})`);
} else {
  console.log('⚠️  Rate limiting désactivé - aucune limite');
}

// Route racine
app.get('/', (req, res) => {
  res.json({
    name: 'Visibility Strategy Score API',
    version: '1.0.0',
    description: 'API backend pour l\'évaluation de visibilité SEO & IA',
    endpoints: {
      analyze: 'POST /api/analyze',
      stats: 'GET /api/stats',
      health: 'GET /api/health',
      confirmAppointment: 'POST /api/confirm-appointment'
    },
    documentation: 'Voir README.md pour plus d\'informations'
  });
});

// Routes
app.use('/api/analyze', analyzeRouter);
app.use('/api/confirm-appointment', require('./routes/confirmAppointment'));
app.use('/api/stats', require('./routes/stats'));

// Health check public pour monitoring (UptimeRobot, Pingdom, etc.)
app.get('/api/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      api: 'operational',
      crawler: 'operational',
      scorer: 'operational'
    }
  };
  
  // Vérifier que les services critiques sont configurés
  if (!process.env.ADMIN_EMAIL) {
    health.services.email = 'not_configured';
  } else {
    health.services.email = 'configured';
  }
  
  res.status(200).json(health);
});

// Health check simple (pour compatibilité)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur globale:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erreur serveur',
    message: err.details || err.message || 'Une erreur est survenue',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Gestion des routes non trouvées
app.use((req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    message: `La route ${req.method} ${req.path} n'existe pas`
  });
});

// Sur Vercel, l'app est exportée et utilisée via api/index.js
if (process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) {
  app.listen(PORT, () => {
    console.log(`Serveur backend démarré sur le port ${PORT}`);
  });
}

// Exporter l'app pour Vercel
module.exports = app;

