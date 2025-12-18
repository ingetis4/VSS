/**
 * Service de cache pour éviter de re-crawler les mêmes sites
 * Utilise un cache en mémoire (peut être remplacé par Redis en production)
 */

const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures en millisecondes

/**
 * Génère une clé de cache à partir d'une URL
 */
function getCacheKey(url) {
  try {
    const urlObj = new URL(url);
    // Normaliser l'URL (sans trailing slash, sans query params)
    return urlObj.origin + urlObj.pathname.replace(/\/$/, '');
  } catch (e) {
    return url;
  }
}

/**
 * Récupère une valeur du cache
 */
function get(url) {
  try {
    const key = getCacheKey(url);
    const cached = cache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Vérifier si le cache a expiré
    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL) {
      cache.delete(key);
      console.log(`[CACHE] Cache expiré pour: ${url}`);
      return null;
    }
    
    console.log(`[CACHE] Cache hit pour: ${url}`);
    return cached.data;
  } catch (error) {
    // Erreur non bloquante : retourner null si le cache échoue
    console.warn(`[CACHE] Erreur lors de la récupération: ${error.message}`);
    return null;
  }
}

/**
 * Stocke une valeur dans le cache
 */
function set(url, data) {
  try {
    const key = getCacheKey(url);
    cache.set(key, {
      data: data,
      timestamp: Date.now()
    });
    console.log(`[CACHE] Cache set pour: ${url}`);
  } catch (error) {
    // Erreur non bloquante : log mais ne pas throw
    console.warn(`[CACHE] Erreur lors de la sauvegarde: ${error.message}`);
  }
}

/**
 * Supprime une entrée du cache
 */
function del(url) {
  const key = getCacheKey(url);
  cache.delete(key);
  console.log(`[CACHE] Cache supprimé pour: ${url}`);
}

/**
 * Vide tout le cache
 */
function clear() {
  cache.clear();
  console.log('[CACHE] Cache vidé');
}

/**
 * Récupère les statistiques du cache
 */
function getStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      expiredEntries++;
    } else {
      validEntries++;
    }
  }
  
  return {
    total: cache.size,
    valid: validEntries,
    expired: expiredEntries,
    ttl: CACHE_TTL / 1000 / 60 / 60 // TTL en heures
  };
}

/**
 * Nettoie les entrées expirées du cache
 */
function cleanup() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[CACHE] Nettoyage: ${cleaned} entrées expirées supprimées`);
  }
  
  return cleaned;
}

// Nettoyer le cache toutes les heures
setInterval(cleanup, 60 * 60 * 1000);

module.exports = {
  get,
  set,
  del,
  clear,
  getStats,
  cleanup
};

