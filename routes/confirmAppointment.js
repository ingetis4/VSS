const express = require('express');
const router = express.Router();
const appointmentNotifier = require('../services/appointmentNotifier');
const analytics = require('../services/analytics');

router.post('/', async (req, res) => {
  try {
    const { email, url, sector, offer, results, analysis_type } = req.body;

    // Validation
    if (!email || !results) {
      return res.status(400).json({
        error: 'Email et résultats requis'
      });
    }

    // Envoyer l'email avec toutes les insights
    await appointmentNotifier.send({
      email,
      url: url || 'Non renseigné',
      sector: sector || 'Non renseigné',
      offer: offer || 'Non renseigné',
      results,
      analysis_type: analysis_type || 'both',
      timestamp: new Date().toISOString()
    });

    // Track la confirmation du rendez-vous
    analytics.trackAppointmentConfirmed(email, url || 'Non renseigné');

    res.json({
      success: true,
      message: 'Email de confirmation envoyé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la confirmation de rendez-vous:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'envoi de la confirmation',
      message: error.message
    });
  }
});

module.exports = router;

