/**
 * Service d'analytics et tracking des événements
 * Compatible avec Google Analytics 4 et Plausible
 */

/**
 * Track un événement côté serveur (pour analytics backend)
 */
function trackEvent(eventName, eventData = {}) {
  // Log pour debugging
  console.log(`[ANALYTICS] Event: ${eventName}`, eventData);
  
  // Ici on pourrait envoyer à un service d'analytics backend
  // Pour l'instant, on log juste
  return {
    success: true,
    event: eventName,
    data: eventData,
    timestamp: new Date().toISOString()
  };
}

/**
 * Track une conversion (analyse complétée)
 */
function trackConversion(email, url, analysisType) {
  return trackEvent('conversion', {
    type: 'analysis_completed',
    email: email ? email.substring(0, 3) + '***' : 'anonymous', // Anonymiser l'email
    url: url,
    analysis_type: analysisType,
    timestamp: new Date().toISOString()
  });
}

/**
 * Track l'ouverture de Calendly
 */
function trackCalendlyOpen(email, url) {
  return trackEvent('calendly_opened', {
    email: email ? email.substring(0, 3) + '***' : 'anonymous',
    url: url,
    timestamp: new Date().toISOString()
  });
}

/**
 * Track la confirmation d'un rendez-vous
 */
function trackAppointmentConfirmed(email, url) {
  return trackEvent('appointment_confirmed', {
    email: email ? email.substring(0, 3) + '***' : 'anonymous',
    url: url,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  trackEvent,
  trackConversion,
  trackCalendlyOpen,
  trackAppointmentConfirmed
};

