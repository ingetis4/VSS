/**
 * Profils de pondération et seuils adaptés selon le type de site
 * Permet de contextualiser le scoring sans trahir la logique "100/100"
 */

const SITE_TYPE_PROFILES = {
  blog: {
    name: 'Blog / Média',
    description: 'Site de contenu avec articles, dates, auteurs',
    seoAdjustments: {
      // Pas de changement sur les poids, mais ajustement des seuils
      exploitablePages: { min: 20, max: 70 }, // Inchangé
      qualityTitles: { min: 40, max: 85 }, // Inchangé
      semanticVariants: { min: 25, max: 70 }, // Inchangé
      // Pas de pénalité sur la profondeur (les blogs peuvent être profonds)
      depth: { min: 1.5, max: 8 }, // Plus permissif
      // Pas de pénalité sur les dirty URLs (catégories/tags)
      dirtyUrls: { min: 0, max: 50 } // Plus permissif
    },
    iaAdjustments: {
      // IA-ready très important pour les blogs
      datesAuthor: { weight: 1.2 }, // +20% d'importance
      hnStructure: { weight: 1.1 }, // +10% d'importance
      contentAccessibility: { weight: 1.1 }, // +10% d'importance
      // Questions/FAQ très important
      questions: { weight: 1.2 }, // +20% d'importance
      faq: { weight: 1.3 }, // +30% d'importance
      // Formats extractibles important
      extractableFormats: { weight: 1.1 } // +10% d'importance
    }
  },
  
  ecommerce: {
    name: 'E-commerce',
    description: 'Site de vente en ligne avec produits',
    seoAdjustments: {
      // Canonicals et indexability très importants
      canonical: { min: 40, max: 90 }, // Inchangé mais critique
      indexability: { min: 60, max: 95 }, // Inchangé mais critique
      schemaOrg: { min: 10, max: 60 }, // Inchangé
      // Dirty URLs plus pénalisant (filtres, facettes)
      dirtyUrls: { min: 0, max: 25 }, // Plus strict
      // Profondeur peut être élevée (catégories)
      depth: { min: 1.5, max: 6 }, // Plus permissif
      // Pages exploitables moins critique (fiches produits courtes OK)
      exploitablePages: { min: 15, max: 60 } // Plus permissif
    },
    iaAdjustments: {
      // Questions/FAQ moins critique
      questions: { weight: 0.7 }, // -30% d'importance
      faq: { weight: 0.6 }, // -40% d'importance
      // Entity schema très important
      entitySchema: { weight: 1.3 }, // +30% d'importance
      // Formats extractibles moins critique
      extractableFormats: { weight: 0.8 } // -20% d'importance
    }
  },
  
  saas: {
    name: 'SaaS / Produit B2B',
    description: 'Application SaaS, produit B2B avec docs, API',
    seoAdjustments: {
      // Structure très importante
      semanticVariants: { min: 25, max: 70 }, // Inchangé
      // Profondeur faible attendue (structure plate)
      depth: { min: 1.5, max: 4 }, // Plus strict
      // Maillage interne important
      internalLinksIn: { min: 40, max: 85 }, // Inchangé
      internalLinksOut: { min: 2, max: 12 }, // Inchangé
      // Pages exploitables importantes (docs)
      exploitablePages: { min: 25, max: 75 } // Plus strict
    },
    iaAdjustments: {
      // IA-ready très important
      hnStructure: { weight: 1.3 }, // +30% d'importance
      contentAccessibility: { weight: 1.2 }, // +20% d'importance
      // FAQ très important
      faq: { weight: 1.4 }, // +40% d'importance
      // Formats extractibles très important (docs)
      extractableFormats: { weight: 1.3 }, // +30% d'importance
      // External references important (docs techniques)
      externalReferences: { weight: 1.2 } // +20% d'importance
    }
  },
  
  vitrine: {
    name: 'Vitrine / One-page',
    description: 'Site vitrine, portfolio, landing page',
    seoAdjustments: {
      // Architecture moins critique (peu de pages)
      depth: { min: 1.5, max: 10 }, // Très permissif
      internalLinksIn: { min: 20, max: 100 }, // Très permissif
      internalLinksOut: { min: 0, max: 20 }, // Très permissif
      // Crawl/indexability/https/robots très importants (socle)
      // Pas de changement, déjà critique
      // Pages exploitables moins critique
      exploitablePages: { min: 10, max: 50 } // Plus permissif
    },
    iaAdjustments: {
      // Maturité IA naturellement limitée par le faible contenu
      // Pas besoin de plafond artificiel
      // Structure importante quand même
      hnStructure: { weight: 1.1 }, // +10% d'importance
      // Questions/FAQ moins critique
      questions: { weight: 0.6 }, // -40% d'importance
      faq: { weight: 0.5 }, // -50% d'importance
      // Formats extractibles moins critique
      extractableFormats: { weight: 0.7 } // -30% d'importance
    }
  },
  
  local: {
    name: 'Local Business',
    description: 'Commerce local, restaurant, agence locale',
    seoAdjustments: {
      // NAP très important (déjà dans IA)
      // Schema LocalBusiness très important
      schemaOrg: { min: 10, max: 60 }, // Inchangé mais critique
      // Profondeur faible attendue
      depth: { min: 1.5, max: 5 }, // Plus strict
      // Pages exploitables moins critique
      exploitablePages: { min: 15, max: 60 } // Plus permissif
    },
    iaAdjustments: {
      // NAP très important
      nap: { weight: 1.5 }, // +50% d'importance
      // Entity schema très important
      entitySchema: { weight: 1.4 }, // +40% d'importance
      // About page important
      aboutPage: { weight: 1.2 }, // +20% d'importance
      // Questions/FAQ moins critique
      questions: { weight: 0.7 }, // -30% d'importance
      faq: { weight: 0.6 } // -40% d'importance
    }
  },
  
  unknown: {
    name: 'Type inconnu',
    description: 'Type de site non détecté, utilisation des seuils par défaut',
    seoAdjustments: {},
    iaAdjustments: {}
  }
};

/**
 * Récupère le profil pour un type de site donné
 */
function getSiteTypeProfile(siteType) {
  return SITE_TYPE_PROFILES[siteType] || SITE_TYPE_PROFILES.unknown;
}

/**
 * Applique les ajustements SEO selon le type de site
 */
function applySEOAdjustments(metrics, siteType) {
  const profile = getSiteTypeProfile(siteType);
  const adjustments = profile.seoAdjustments || {};
  
  // Retourne les métriques avec les seuils ajustés
  // (les ajustements seront appliqués dans les fonctions de scoring)
  return {
    ...metrics,
    _siteType: siteType,
    _seoAdjustments: adjustments
  };
}

/**
 * Applique les ajustements IA selon le type de site
 */
function applyIAAdjustments(metrics, siteType) {
  const profile = getSiteTypeProfile(siteType);
  const adjustments = profile.iaAdjustments || {};
  
  return {
    ...metrics,
    _siteType: siteType,
    _iaAdjustments: adjustments
  };
}

module.exports = {
  SITE_TYPE_PROFILES,
  getSiteTypeProfile,
  applySEOAdjustments,
  applyIAAdjustments
};


