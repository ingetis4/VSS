/**
 * Service de queue pour gérer les analyses asynchrones
 * Utilise une queue en mémoire (peut être remplacé par Bull/Redis en production)
 */

const queue = [];
let processing = false;
const MAX_CONCURRENT = 2; // Nombre maximum d'analyses simultanées

/**
 * Ajoute une tâche à la queue
 */
function add(job) {
  queue.push({
    ...job,
    id: Date.now() + Math.random(),
    createdAt: new Date().toISOString(),
    status: 'pending'
  });
  console.log(`[QUEUE] Tâche ajoutée: ${job.url} (${queue.length} en attente)`);
  processQueue();
  return queue[queue.length - 1].id;
}

/**
 * Traite la queue
 */
async function processQueue() {
  if (processing || queue.length === 0) {
    return;
  }

  processing = true;
  console.log(`[QUEUE] Début du traitement (${queue.length} tâches en attente)`);

  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) continue;

    try {
      job.status = 'processing';
      console.log(`[QUEUE] Traitement de: ${job.url}`);
      
      // Exécuter la fonction de traitement
      const result = await job.process();
      
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date().toISOString();
      
      // Appeler le callback de succès
      if (job.onSuccess) {
        job.onSuccess(result);
      }
      
      console.log(`[QUEUE] Tâche terminée: ${job.url}`);
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.failedAt = new Date().toISOString();
      
      console.error(`[QUEUE] Erreur sur la tâche ${job.url}:`, error);
      
      // Appeler le callback d'erreur
      if (job.onError) {
        job.onError(error);
      }
    }
  }

  processing = false;
  console.log(`[QUEUE] Traitement terminé`);
}

/**
 * Récupère les statistiques de la queue
 */
function getStats() {
  return {
    pending: queue.filter(j => j.status === 'pending').length,
    processing: queue.filter(j => j.status === 'processing').length,
    total: queue.length,
    maxConcurrent: MAX_CONCURRENT
  };
}

/**
 * Vide la queue
 */
function clear() {
  queue.length = 0;
  console.log('[QUEUE] Queue vidée');
}

module.exports = {
  add,
  processQueue,
  getStats,
  clear
};

