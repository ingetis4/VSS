/**
 * Service de stockage pour l'apprentissage
 * Stocke tous les résultats de crawl (tests et utilisateurs) pour améliorer l'algorithme
 */

const fs = require('fs');
const path = require('path');

const LEARNING_DIR = path.join(__dirname, '..', '..', 'APPRENTISSAGE');
const RESULTS_FILE = path.join(LEARNING_DIR, 'results.json');
const METRICS_FILE = path.join(LEARNING_DIR, 'metrics.json');
const STATS_FILE = path.join(LEARNING_DIR, 'stats.json');

// S'assurer que le dossier existe
if (!fs.existsSync(LEARNING_DIR)) {
  fs.mkdirSync(LEARNING_DIR, { recursive: true });
}

/**
 * Charge les résultats existants
 */
function loadResults() {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const data = fs.readFileSync(RESULTS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      
      // Gérer les différentes structures possibles
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (typeof parsed === 'object') {
        // Structure avec clés numériques (ex: {"0": {...}, "1": {...}})
        const keys = Object.keys(parsed).filter(k => /^\d+$/.test(k));
        if (keys.length > 0) {
          return keys.map(k => parsed[k]);
        }
        // Sinon, c'est peut-être un objet avec propriété "results"
        if (parsed.results && Array.isArray(parsed.results)) {
          return parsed.results;
        }
      }
      return [];
    }
  } catch (error) {
    console.error('[LEARNING] Erreur lors du chargement des résultats:', error.message);
  }
  return [];
}

/**
 * Sauvegarde un résultat de crawl
 * @param {object} data - Données du crawl (url, metrics, scores, etc.)
 * @param {string} source - Source du crawl ('test', 'user', 'validation')
 */
function saveResult(data, source = 'user') {
  try {
    const results = loadResults();
    
    const resultEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      source: source,
      url: data.url || data.normalizedUrl,
      site: data.site || extractDomain(data.url || data.normalizedUrl),
      type: data.type || 'unknown',
      
      // Résultats du crawl
      crawl: {
        pagesCount: data.pagesCount || data.pages?.length || 0,
        pages: data.pages ? data.pages.map(p => ({
          url: p.url,
          title: p.title,
          wordCount: p.wordCount,
          statusCode: p.statusCode
        })) : [],
        sitemapUsed: data.sitemapUsed || false,
        sitemapUrlsCount: data.sitemapUrlsCount || 0
      },
      
      // Métriques extraites
      metrics: data.metrics || {},
      
      // Scores calculés
      scores: {
        seo: data.seoScores || data.seo || null,
        ia: data.iaScores || data.ia || null,
        total: data.totalScore || data.total || null,
        seoDetails: data.seoDetails || null,
        iaDetails: data.iaDetails || null
      },
      
      // Informations additionnelles
      metadata: {
        userEmail: data.userEmail || null,
        sector: data.sector || null,
        offer: data.offer || null,
        analysisType: data.analysisType || 'both',
        orientation: data.orientation || null,
        error: data.error || null
      }
    };
    
    // S'assurer que results est un tableau
    if (!Array.isArray(results)) {
      results = [];
    }
    
    results.push(resultEntry);
    
    // Sauvegarder (toujours en tableau pour la nouvelle structure)
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    
    // Mettre à jour les statistiques
    updateStats(resultEntry);
    
    // Sauvegarder les métriques séparément pour analyse
    saveMetrics(resultEntry);
    
    console.log(`[LEARNING] Résultat sauvegardé: ${resultEntry.url} (${source})`);
    
    return resultEntry.id;
  } catch (error) {
    console.error('[LEARNING] Erreur lors de la sauvegarde:', error.message);
    return null;
  }
}

/**
 * Sauvegarde les métriques pour analyse
 */
function saveMetrics(resultEntry) {
  try {
    let metrics = [];
    if (fs.existsSync(METRICS_FILE)) {
      const data = fs.readFileSync(METRICS_FILE, 'utf8');
      metrics = JSON.parse(data);
    }
    
    metrics.push({
      id: resultEntry.id,
      timestamp: resultEntry.timestamp,
      url: resultEntry.url,
      source: resultEntry.source,
      metrics: resultEntry.metrics,
      scores: resultEntry.scores
    });
    
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
  } catch (error) {
    console.error('[LEARNING] Erreur lors de la sauvegarde des métriques:', error.message);
  }
}

/**
 * Met à jour les statistiques globales
 */
function updateStats(resultEntry) {
  try {
    let stats = {
      total: 0,
      bySource: {},
      byType: {},
      scores: {
        seo: { min: 100, max: 0, avg: 0, sum: 0, count: 0 },
        ia: { min: 100, max: 0, avg: 0, sum: 0, count: 0 },
        total: { min: 100, max: 0, avg: 0, sum: 0, count: 0 }
      },
      lastUpdate: new Date().toISOString()
    };
    
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf8');
      stats = JSON.parse(data);
    }
    
    // Mettre à jour les stats
    stats.total++;
    stats.lastUpdate = new Date().toISOString();
    
    // Par source
    if (!stats.bySource[resultEntry.source]) {
      stats.bySource[resultEntry.source] = 0;
    }
    stats.bySource[resultEntry.source]++;
    
    // Par type
    if (!stats.byType[resultEntry.type]) {
      stats.byType[resultEntry.type] = 0;
    }
    stats.byType[resultEntry.type]++;
    
    // Scores
    if (resultEntry.scores.seo !== null && resultEntry.scores.seo !== undefined) {
      const seo = resultEntry.scores.seo;
      stats.scores.seo.min = Math.min(stats.scores.seo.min, seo);
      stats.scores.seo.max = Math.max(stats.scores.seo.max, seo);
      stats.scores.seo.sum += seo;
      stats.scores.seo.count++;
      stats.scores.seo.avg = stats.scores.seo.sum / stats.scores.seo.count;
    }
    
    if (resultEntry.scores.ia !== null && resultEntry.scores.ia !== undefined) {
      const ia = resultEntry.scores.ia;
      stats.scores.ia.min = Math.min(stats.scores.ia.min, ia);
      stats.scores.ia.max = Math.max(stats.scores.ia.max, ia);
      stats.scores.ia.sum += ia;
      stats.scores.ia.count++;
      stats.scores.ia.avg = stats.scores.ia.sum / stats.scores.ia.count;
    }
    
    if (resultEntry.scores.total !== null && resultEntry.scores.total !== undefined) {
      const total = resultEntry.scores.total;
      stats.scores.total.min = Math.min(stats.scores.total.min, total);
      stats.scores.total.max = Math.max(stats.scores.total.max, total);
      stats.scores.total.sum += total;
      stats.scores.total.count++;
      stats.scores.total.avg = stats.scores.total.sum / stats.scores.total.count;
    }
    
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('[LEARNING] Erreur lors de la mise à jour des stats:', error.message);
  }
}

/**
 * Génère un ID unique
 */
function generateId() {
  return `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extrait le domaine d'une URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
}

/**
 * Récupère les statistiques
 */
function getStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[LEARNING] Erreur lors du chargement des stats:', error.message);
  }
  return {
    total: 0,
    bySource: {},
    byType: {},
    scores: {
      seo: { min: 100, max: 0, avg: 0 },
      ia: { min: 100, max: 0, avg: 0 },
      total: { min: 100, max: 0, avg: 0 }
    }
  };
}

/**
 * Récupère les résultats récents
 * @param {number} limit - Nombre de résultats à récupérer
 * @param {string} source - Filtrer par source (optionnel)
 */
function getRecentResults(limit = 100, source = null) {
  try {
    const results = loadResults();
    let filtered = results;
    
    if (source) {
      filtered = results.filter(r => r.source === source);
    }
    
    // Trier par timestamp décroissant
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return filtered.slice(0, limit);
  } catch (error) {
    console.error('[LEARNING] Erreur lors de la récupération des résultats:', error.message);
    return [];
  }
}

/**
 * Exporte les données pour analyse
 * @param {string} format - Format d'export ('json', 'csv')
 */
function exportData(format = 'json') {
  try {
    const results = loadResults();
    const stats = getStats();
    
    if (format === 'json') {
      const exportPath = path.join(LEARNING_DIR, `export_${Date.now()}.json`);
      fs.writeFileSync(exportPath, JSON.stringify({
        stats,
        results,
        exportDate: new Date().toISOString()
      }, null, 2));
      return exportPath;
    }
    
    // CSV (basique)
    if (format === 'csv') {
      const exportPath = path.join(LEARNING_DIR, `export_${Date.now()}.csv`);
      const csv = [
        'id,timestamp,source,url,type,seo,ia,total,pagesCount',
        ...results.map(r => [
          r.id,
          r.timestamp,
          r.source,
          r.url,
          r.type,
          r.scores.seo || '',
          r.scores.ia || '',
          r.scores.total || '',
          r.crawl.pagesCount
        ].join(','))
      ].join('\n');
      
      fs.writeFileSync(exportPath, csv);
      return exportPath;
    }
    
    return null;
  } catch (error) {
    console.error('[LEARNING] Erreur lors de l\'export:', error.message);
    return null;
  }
}

module.exports = {
  saveResult,
  getStats,
  getRecentResults,
  exportData,
  loadResults
};

