/**
 * Service de compteur pour le social proof
 * Compte le nombre total d'analyses effectuées
 * Stockage persistant dans un fichier JSON
 */

const fs = require('fs');
const path = require('path');

const COUNTER_FILE = path.join(__dirname, '..', 'counter.json');

// Compteur en mémoire
let totalAnalyses = 0;
let dailyAnalyses = 0;
let lastResetDate = new Date().toDateString();

/**
 * Charge les données depuis le fichier JSON
 */
function loadFromFile() {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = fs.readFileSync(COUNTER_FILE, 'utf8');
      const counterData = JSON.parse(data);
      
      totalAnalyses = counterData.total || 0;
      dailyAnalyses = counterData.daily || 0;
      lastResetDate = counterData.lastResetDate || new Date().toDateString();
      
      // Vérifier si on a changé de jour
      const today = new Date().toDateString();
      if (today !== lastResetDate) {
        dailyAnalyses = 0;
        lastResetDate = today;
        // Ne pas bloquer si la sauvegarde échoue (Vercel serverless = lecture seule)
        try {
          saveToFile();
        } catch (saveError) {
          // Ignorer silencieusement - sur Vercel, le système de fichiers est en lecture seule
        }
      }
      
      console.log(`[COUNTER] Données chargées: ${totalAnalyses} total, ${dailyAnalyses} aujourd'hui`);
      return true;
    }
  } catch (error) {
    console.error('[COUNTER] Erreur lors du chargement du fichier:', error.message);
  }
  return false;
}

/**
 * Sauvegarde les données dans le fichier JSON
 */
function saveToFile() {
  try {
    const data = {
      total: totalAnalyses,
      daily: dailyAnalyses,
      lastResetDate: lastResetDate,
      lastUpdate: new Date().toISOString()
    };
    
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    // Sur Vercel serverless, le système de fichiers est en lecture seule
    // Ne pas logger l'erreur pour éviter de polluer les logs (c'est normal)
    // Juste retourner false silencieusement
    if (error.code !== 'EROFS') {
      // Logger seulement si ce n'est pas une erreur de système de fichiers en lecture seule
      console.warn('[COUNTER] Erreur lors de la sauvegarde (non bloquant):', error.message);
    }
    return false;
  }
}

/**
 * Initialise le compteur (charge depuis le fichier JSON)
 */
function init() {
  if (!loadFromFile()) {
    // Si le fichier n'existe pas, initialiser à 0
    totalAnalyses = 0;
    dailyAnalyses = 0;
    lastResetDate = new Date().toDateString();
    saveToFile(); // Créer le fichier avec les valeurs par défaut
    console.log('[COUNTER] Compteur initialisé (nouveau fichier créé)');
  } else {
    console.log('[COUNTER] Compteur initialisé (données chargées)');
  }
}

/**
 * Incrémente le compteur d'analyses
 */
function increment() {
  try {
    const today = new Date().toDateString();
    
    // Réinitialiser le compteur quotidien si on change de jour
    if (today !== lastResetDate) {
      dailyAnalyses = 0;
      lastResetDate = today;
    }
    
    totalAnalyses++;
    dailyAnalyses++;
    
    // Sauvegarder immédiatement dans le fichier (ne pas bloquer si ça échoue)
    try {
      saveToFile();
    } catch (saveError) {
      // Ne pas logger EROFS (lecture seule sur Vercel, c'est normal)
      if (saveError.code !== 'EROFS') {
        console.warn('[COUNTER] Erreur sauvegarde (non bloquant):', saveError.message);
      }
      // Sur Vercel serverless, on continue même si la sauvegarde échoue
    }
    
    console.log(`[COUNTER] Analyses totales: ${totalAnalyses}, Aujourd'hui: ${dailyAnalyses}`);
    
    return {
      total: totalAnalyses,
      today: dailyAnalyses
    };
  } catch (error) {
    console.error('[COUNTER] Erreur lors de l\'incrément:', error.message);
    // Retourner quand même des valeurs pour ne pas bloquer
    return {
      total: totalAnalyses || 0,
      today: dailyAnalyses || 0
    };
  }
}

/**
 * Récupère les statistiques du compteur
 */
function getStats() {
  try {
    const today = new Date().toDateString();
    
    // Réinitialiser le compteur quotidien si on change de jour
    if (today !== lastResetDate) {
      dailyAnalyses = 0;
      lastResetDate = today;
      // Ne pas bloquer si la sauvegarde échoue (Vercel serverless)
      try {
        saveToFile();
      } catch (saveError) {
        // Ne pas logger EROFS (lecture seule sur Vercel, c'est normal)
        if (saveError.code !== 'EROFS') {
          console.warn('[COUNTER] Erreur sauvegarde (non bloquant):', saveError.message);
        }
      }
    }
    
    return {
      total: totalAnalyses,
      today: dailyAnalyses,
      lastReset: lastResetDate
    };
  } catch (error) {
    console.error('[COUNTER] Erreur lors de la récupération des stats:', error.message);
    // Retourner des valeurs par défaut en cas d'erreur
    return {
      total: 0,
      today: 0,
      lastReset: new Date().toDateString()
    };
  }
}

/**
 * Formate le nombre pour l'affichage (ex: 1234 -> "1.2k")
 */
function formatNumber(num) {
  if (num < 1000) return num.toString();
  if (num < 1000000) return (num / 1000).toFixed(1) + 'k';
  return (num / 1000000).toFixed(1) + 'M';
}

// Initialiser au démarrage (mais ne pas bloquer si ça échoue)
try {
  init();
} catch (error) {
  console.warn('[COUNTER] Erreur lors de l\'initialisation (non bloquant):', error.message);
  // Sur Vercel serverless, le système de fichiers peut être en lecture seule
  // On continue avec les valeurs par défaut en mémoire
}

module.exports = {
  increment,
  getStats,
  formatNumber
};

