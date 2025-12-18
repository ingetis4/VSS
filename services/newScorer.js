/**
 * Nouveau système de scoring avec modèle hiérarchique
 * SEO = Score absolu (0-100) → plafond naturel
 * IA = SEO × Maturité IA (0-1) → garantit IA ≤ SEO
 * Scores affichés sur 10 au lieu de 100
 */

const { getSiteTypeProfile } = require('./siteTypeProfiles');

// Fonctions de scoring
function linearScore(value, min, max) {
  if (value < min) return 0;
  if (value > max) return 10;
  return ((value - min) / (max - min)) * 10;
}

function inverseScore(value, min, max) {
  if (value < min) return 10;
  if (value > max) return 0;
  return (1 - (value - min) / (max - min)) * 10;
}

function logScore(value, cap) {
  if (value <= 0) return 0;
  if (value >= cap) return 10;
  return (Math.log(1 + value) / Math.log(1 + cap)) * 10;
}

/**
 * Calcule les scores SEO selon le nouveau système (5 axes x 20 points)
 * Adapte les seuils selon le type de site
 */
function calculateSEOScores(metrics, siteType = 'unknown') {
  if (!metrics) {
    return {
      score: 0,
      scoreOn10: 0,
      details: {
        crawl: { score: 0, maxScore: 25 },
        contenu: { score: 0, maxScore: 20 },
        technique: { score: 0, maxScore: 15 },
        architecture: { score: 0, maxScore: 20 },
        autorite: { score: 0, maxScore: 20 }
      }
    };
  }

  const profile = getSiteTypeProfile(siteType);
  const seoAdjustments = profile.seoAdjustments || {};

  const scores = {
    crawl: 0,
    contenu: 0,
    technique: 0,
    architecture: 0,
    autorite: 0
  };

  // SEO - Axe 1: Crawl & Accès (25 pts) - CRITIQUE (fondation)
  const dirtyUrlsMax = seoAdjustments.dirtyUrls?.max || 35;
  const crawlScores = {
    https: metrics.https ? linearScore(100, 70, 100) * 5 : 0,
    robotsSitemap: ((metrics.robotsPresent ? 5 : 0) + (metrics.sitemapPresent ? 5 : 0)) / 10 * 4,
    robotsOptimized: linearScore(metrics.robotsOptimized || 0, 0, 100) * 4,
    llmsTxt: metrics.llmsTxtPresent ? 2 : 0,
    ttfb: (metrics.ttfb && metrics.ttfb > 0) ? inverseScore(metrics.ttfb, 0.3, 2.5) * 4 : 0,
    errors: inverseScore(metrics.errorRate, 0, 8) * 5,
    urls: inverseScore(metrics.dirtyUrls, 0, dirtyUrlsMax) * 1
  };
  const crawlWeights = 5 + 4 + 4 + 2 + 4 + 5 + 1; // Total = 25
  scores.crawl = (Object.values(crawlScores).reduce((a, b) => a + b, 0) / crawlWeights) * 2.5;

  // SEO - Axe 2: Optimisation On-Page (20 pts)
  const exploitableMin = seoAdjustments.exploitablePages?.min || 20;
  const exploitableMax = seoAdjustments.exploitablePages?.max || 70;
  const contenuScores = {
    exploitable: linearScore(metrics.exploitablePages, exploitableMin, exploitableMax) * 4,
    titles: linearScore(metrics.qualityTitles, 40, 85) * 4,
    meta: linearScore(metrics.metaDescriptions, 30, 80) * 4,
    h1: linearScore(metrics.h1Quality, 50, 90) * 4,
    variants: linearScore(metrics.semanticVariants, 25, 70) * 4
  };
  const contenuWeights = 4 + 4 + 4 + 4 + 4; // Total = 20
  scores.contenu = (Object.values(contenuScores).reduce((a, b) => a + b, 0) / contenuWeights) * 2;

  // SEO - Axe 3: Technique (15 pts)
  const techniqueScores = {
    viewport: linearScore(metrics.viewport, 70, 100) * 2.5,
    alt: linearScore(metrics.altText, 40, 90) * 2.5,
    canonical: linearScore(metrics.canonical, 40, 90) * 2.5,
    schema: linearScore(metrics.schemaOrg, 10, 60) * 3,
    indexability: linearScore(metrics.indexability, 60, 95) * 3.5,
    pageIndexation: linearScore(metrics.pageIndexation?.indexablePercentage || 0, 80, 100) * 1.5
  };
  const techniqueWeights = 2.5 + 2.5 + 2.5 + 3 + 3.5 + 1.5; // Total = 15
  scores.technique = (Object.values(techniqueScores).reduce((a, b) => a + b, 0) / techniqueWeights) * 1.5;

  // SEO - Axe 4: Architecture (20 pts)
  const depthMin = seoAdjustments.depth?.min || 1.5;
  const depthMax = seoAdjustments.depth?.max || 5;
  const linksInMin = seoAdjustments.internalLinksIn?.min || 40;
  const linksInMax = seoAdjustments.internalLinksIn?.max || 85;
  const linksOutMin = seoAdjustments.internalLinksOut?.min || 2;
  const linksOutMax = seoAdjustments.internalLinksOut?.max || 12;
  
  const archScores = {
    depth: inverseScore(metrics.depth, depthMin, depthMax) * 5,
    linksIn: linearScore(metrics.internalLinksIn, linksInMin, linksInMax) * 5,
    linksOut: linearScore(metrics.internalLinksOut, linksOutMin, linksOutMax) * 4,
    anchorText: linearScore(metrics.anchorText || 0, 50, 90) * 6
  };
  const archTotal = archScores.depth + archScores.linksIn + archScores.linksOut + archScores.anchorText;
  const archMax = 5 + 5 + 4 + 6; // 20
  scores.architecture = Math.min(20, (archTotal / archMax) * 20);

  // SEO - Axe 5: Autorité (20 pts)
  const autoriteScores = {
    followLinks: linearScore(metrics.followLinksPercentage || 0, 50, 100), // 0-10
    domainAge: (metrics.domainAge?.score || 0) // 0-10
  };
  const autoriteWeights = {
    followLinks: 5,
    domainAge: 2
  };
  const totalWeight = autoriteWeights.followLinks + autoriteWeights.domainAge; // 7
  const autoriteTotal = (autoriteScores.followLinks * autoriteWeights.followLinks) +
                        (autoriteScores.domainAge * autoriteWeights.domainAge);
  const maxPossible = 10 * totalWeight; // 70
  scores.autorite = maxPossible > 0 
    ? Math.round((autoriteTotal / maxPossible) * 20 * 10) / 10
    : 0;

  const total = scores.crawl + scores.contenu + scores.technique + scores.architecture + scores.autorite;
  const scoreOn100 = Math.min(100, Math.round(total));
  const scoreOn10 = Math.round((scoreOn100 / 100) * 10 * 10) / 10; // Sur 10 avec 1 décimale

  return {
    score: scoreOn100, // Score interne sur 100 (pour calculs)
    scoreOn10: scoreOn10, // Score affiché sur 10
    details: {
      crawl: { score: Math.round(scores.crawl * 10) / 10, maxScore: 25 },
      contenu: { score: Math.round(scores.contenu * 10) / 10, maxScore: 20 },
      technique: { score: Math.round(scores.technique * 10) / 10, maxScore: 15 },
      architecture: { score: Math.round(scores.architecture * 10) / 10, maxScore: 20 },
      autorite: { score: Math.round(scores.autorite * 10) / 10, maxScore: 20 }
    },
    maxPossibleScore: 100
  };
}

/**
 * Calcule la maturité IA (0-1.0) selon le nouveau modèle
 * 
 * Principe : La maturité IA mesure la capacité réelle d'un site à transformer son SEO en valeur IA
 * 
 * Structure :
 * - Axe A : Exploitabilité machine (35%) - Est-ce que l'IA peut techniquement lire, découper, extraire ?
 * - Axe B : Crédibilité/Entité (35%) - Est-ce que l'IA a une raison de faire confiance à ce site ?
 * - Axe C : Stabilité & fraîcheur (30%) - Est-ce que le contenu est fiable dans le temps ?
 * 
 * Si crédibilité < 0.2, alors l'IA est structurellement fragile, même si tout le reste est bon
 */
function calculateIAMaturity(metrics, siteType = 'unknown') {
  if (!metrics) return 0;

  const profile = getSiteTypeProfile(siteType);
  const iaAdjustments = profile.iaAdjustments || {};

  // Helper pour appliquer les ajustements de poids
  const applyWeight = (value, key) => {
    const weight = iaAdjustments[key]?.weight || 1.0;
    return Math.min(1.0, value * weight);
  };

  // ============================================
  // AXE A : Exploitabilité machine (35%)
  // ============================================
  // Est-ce que l'IA peut techniquement lire, découper, extraire ?
  
  const exploitabilityScores = {
    // Structure Hn (headings hiérarchiques)
    hnStructure: applyWeight(linearScore(metrics.hnStructure || 0, 50, 90) / 10, 'hnStructure'),
    
    // Formats extractibles (listes, tableaux)
    extractableFormats: applyWeight(linearScore(metrics.extractableFormats || 0, 15, 60) / 10, 'extractableFormats'),
    
    // Accessibilité du contenu (pas caché, pas de JS requis)
    contentAccessibility: applyWeight(linearScore(metrics.contentAccessibility || 0, 60, 95) / 10, 'contentAccessibility'),
    
    // HTML stable (peu de JS bloquant) - inversé : moins de JS = mieux
    // On utilise l'accessibilité comme proxy (si accessible = moins de JS bloquant)
    htmlStable: applyWeight(linearScore(metrics.contentAccessibility || 0, 60, 95) / 10, 'htmlStable')
  };
  
  // Moyenne normalisée des critères d'exploitabilité
  const exploitability = (
    exploitabilityScores.hnStructure * 0.3 +
    exploitabilityScores.extractableFormats * 0.3 +
    exploitabilityScores.contentAccessibility * 0.25 +
    exploitabilityScores.htmlStable * 0.15
  );

  // ============================================
  // AXE B : Crédibilité/Entité (35%)
  // ============================================
  // Est-ce que l'IA a une raison de faire confiance à ce site ?
  
  const credibiliteScores = {
    // NAP (Name, Address, Phone) pour entreprises locales
    nap: applyWeight(linearScore(metrics.nap || 0, 0, 4) / 4, 'nap'),
    
    // Schema.org entité (données structurées pour identifier l'entité)
    entitySchema: applyWeight(linearScore(metrics.entitySchema || 0, 20, 80) / 10, 'entitySchema'),
    
    // Page À propos
    aboutPage: applyWeight(Math.min(1.0, linearScore(metrics.aboutPage || 0, 150, 600) / 10), 'aboutPage'),
    
    // Références externes crédibles (liens vers sources fiables)
    externalReferences: applyWeight(linearScore(metrics.externalReferences || 0, 10, 50) / 10, 'externalReferences'),
    
    // Avis (si présents)
    reviews: applyWeight(logScore(metrics.reviews || 0, 50) / 10, 'reviews')
  };
  
  // Moyenne normalisée des critères de crédibilité
  const credibilite = (
    credibiliteScores.nap * 0.2 +
    credibiliteScores.entitySchema * 0.3 +
    credibiliteScores.aboutPage * 0.2 +
    credibiliteScores.externalReferences * 0.2 +
    credibiliteScores.reviews * 0.1
  );
  
  // ⚠️ Règle critique : Si crédibilité < 0.2, alors l'IA est structurellement fragile
  // On applique un plafond si la crédibilité est trop faible
  const credibiliteFinale = credibilite < 0.2 ? credibilite * 0.5 : credibilite;

  // ============================================
  // AXE C : Stabilité & fraîcheur (30%)
  // ============================================
  // Est-ce que le contenu est fiable dans le temps ?
  
  const stabiliteScores = {
    // Dates & auteurs (présence de dates et auteurs sur les articles)
    datesAuthor: applyWeight(linearScore(metrics.datesAuthor || 0, 20, 70) / 10, 'datesAuthor'),
    
    // Site à jour (détection basée sur les dates récentes)
    // On utilise datesAuthor comme proxy (si dates présentes = site à jour)
    siteUpToDate: applyWeight(linearScore(metrics.datesAuthor || 0, 20, 70) / 10, 'siteUpToDate')
  };
  
  // Moyenne normalisée des critères de stabilité
  const stabilite = (
    stabiliteScores.datesAuthor * 0.6 +
    stabiliteScores.siteUpToDate * 0.4
  );

  // ============================================
  // MATURITÉ FINALE
  // ============================================
  const maturity = (
    exploitability * 0.35 +
    credibiliteFinale * 0.35 +
    stabilite * 0.30
  );

  return Math.min(1.0, Math.max(0, maturity));
}

/**
 * Calcule les scores IA selon le nouveau modèle hiérarchique
 * IA réel = SEO × Maturité IA
 * Garantit que IA ≤ SEO
 */
function calculateIAScores(metrics, seoScore, siteType = 'unknown') {
  if (!metrics || !seoScore) {
    return {
      score: 0,
      scoreOn10: 0,
      maturity: 0,
      maturityOn100: 0,
      details: {
        exploitabilite: { score: 0, maxScore: 1.0 },
        credibilite: { score: 0, maxScore: 1.0 },
        stabilite: { score: 0, maxScore: 1.0 }
      }
    };
  }

  // 1. Calculer la maturité IA (0-1)
  const maturity = calculateIAMaturity(metrics, siteType);
  
  // 2. Calculer le score IA réel = SEO × Maturité
  const iaScore = Math.round(seoScore * maturity);
  const iaScoreOn10 = Math.round((iaScore / 100) * 10 * 10) / 10; // Sur 10 avec 1 décimale
  const maturityOn100 = Math.round(maturity * 100);

  // 3. Calculer les détails pour l'affichage
  const profile = getSiteTypeProfile(siteType);
  const iaAdjustments = profile.iaAdjustments || {};

  // Calculer les détails pour l'affichage (même logique que calculateIAMaturity)
  const applyWeight = (value, key) => {
    const weight = iaAdjustments[key]?.weight || 1.0;
    return Math.min(1.0, value * weight);
  };

  // Axe A : Exploitabilité machine
  const exploitabilityDetail = Math.min(1.0, (
    applyWeight(linearScore(metrics.hnStructure || 0, 50, 90) / 10, 'hnStructure') * 0.3 +
    applyWeight(linearScore(metrics.extractableFormats || 0, 15, 60) / 10, 'extractableFormats') * 0.3 +
    applyWeight(linearScore(metrics.contentAccessibility || 0, 60, 95) / 10, 'contentAccessibility') * 0.25 +
    applyWeight(linearScore(metrics.contentAccessibility || 0, 60, 95) / 10, 'htmlStable') * 0.15
  ));

  // Axe B : Crédibilité/Entité
  const credibiliteDetail = Math.min(1.0, (
    applyWeight(linearScore(metrics.nap || 0, 0, 4) / 4, 'nap') * 0.2 +
    applyWeight(linearScore(metrics.entitySchema || 0, 20, 80) / 10, 'entitySchema') * 0.3 +
    applyWeight(Math.min(1.0, linearScore(metrics.aboutPage || 0, 150, 600) / 10), 'aboutPage') * 0.2 +
    applyWeight(linearScore(metrics.externalReferences || 0, 10, 50) / 10, 'externalReferences') * 0.2 +
    applyWeight(logScore(metrics.reviews || 0, 50) / 10, 'reviews') * 0.1
  ));
  const credibiliteFinaleDetail = Math.min(1.0, credibiliteDetail < 0.2 ? credibiliteDetail * 0.5 : credibiliteDetail);

  // Axe C : Stabilité & fraîcheur
  const stabiliteDetail = Math.min(1.0, (
    applyWeight(linearScore(metrics.datesAuthor || 0, 20, 70) / 10, 'datesAuthor') * 0.6 +
    applyWeight(linearScore(metrics.datesAuthor || 0, 20, 70) / 10, 'siteUpToDate') * 0.4
  ));

  const details = {
    exploitabilite: {
      score: Math.max(0, Math.min(1.0, Math.round(exploitabilityDetail * 100) / 100)),
      maxScore: 1.0
    },
    credibilite: {
      score: Math.max(0, Math.min(1.0, Math.round(credibiliteFinaleDetail * 100) / 100)),
      maxScore: 1.0
    },
    stabilite: {
      score: Math.max(0, Math.min(1.0, Math.round(stabiliteDetail * 100) / 100)),
      maxScore: 1.0
    }
  };

  return {
    score: iaScore, // Score réel (0 à SEO max)
    scoreOn10: iaScoreOn10, // Score affiché sur 10
    maturity: maturity, // Maturité (0-1)
    maturityOn100: maturityOn100, // Maturité affichée (0-100%)
    details: details
  };
}

module.exports = {
  calculateSEOScores,
  calculateIAScores,
  calculateIAMaturity
};
