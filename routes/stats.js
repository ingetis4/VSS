/**
 * Route pour récupérer les statistiques publiques (compteur, etc.)
 */
const express = require('express');
const router = express.Router();
const counter = require('../services/counter');
const cache = require('../services/cache');

/**
 * GET /api/stats
 * Récupère les statistiques publiques pour le social proof
 */
router.get('/', async (req, res) => {
  try {
    // Sur Vercel serverless, getStats() peut être asynchrone ou échouer
    // On utilise une valeur par défaut si le fichier n'existe pas
    let stats = { total: 0, today: 0 };
    try {
      const counterStats = counter.getStats();
      if (counterStats && typeof counterStats === 'object') {
        stats = {
          total: counterStats.total || 0,
          today: counterStats.today || 0
        };
      }
    } catch (counterError) {
      console.warn('[STATS] Erreur counter (non bloquant):', counterError.message);
      // Garder les valeurs par défaut
    }
    
    let cacheStats = { valid: 0, ttl: 24 };
    try {
      const cacheData = cache.getStats();
      if (cacheData && typeof cacheData === 'object') {
        cacheStats = {
          valid: cacheData.valid || 0,
          ttl: cacheData.ttl || 24
        };
      }
    } catch (cacheError) {
      console.warn('[STATS] Erreur cache (non bloquant):', cacheError.message);
      // Garder les valeurs par défaut
    }
    
    // Toujours retourner une réponse 200, même si les stats sont par défaut
    res.json({
      success: true,
      counter: {
        total: stats.total || 0,
        today: stats.today || 0,
        formatted: {
          total: counter.formatNumber(stats.total || 0),
          today: (stats.today || 0).toString()
        }
      },
      cache: {
        entries: cacheStats.valid || 0,
        ttl_hours: cacheStats.ttl || 24
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // En cas d'erreur inattendue, retourner quand même une réponse valide
    console.error('[STATS] Erreur inattendue (non bloquant):', error);
    res.status(200).json({
      success: true,
      counter: {
        total: 0,
        today: 0,
        formatted: {
          total: '0',
          today: '0'
        }
      },
      cache: {
        entries: 0,
        ttl_hours: 24
      },
      timestamp: new Date().toISOString(),
      warning: 'Statistiques temporairement indisponibles'
    });
  }
});

module.exports = router;

