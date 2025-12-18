const metricsExtractor = require('./metricsExtractor');
const { calculateIAScores } = require('./newScorer');

/**
 * Calcule le score IA total selon le nouveau système (5 axes x 20 points)
 * 
 * Axes:
 * - Preuves d'entité : 20 points max
 * - Alignement intentions : 20 points max
 * - Citabilité : 20 points max
 * - Autorité externe : 20 points max
 * - IA-ready : 20 points max
 */
async function compute(pages, originalUrl, backlinksData = null) {
  if (!pages || pages.length === 0) {
    return { 
      score: 0, 
      details: {
        entite: { score: 0, maxScore: 20 },
        intentions: { score: 0, maxScore: 15 },
        citabilite: { score: 0, maxScore: 30 },
        autoriteExterne: { score: 0, maxScore: 20 },
        iaready: { score: 0, maxScore: 15 }
      },
      maxPossibleScore: 100
    };
  }

  // Note: Les métriques sont maintenant extraites dans routes/analyze.js pour inclure domainAge, brandMentions, citations
  // Cette fonction est conservée pour compatibilité mais ne devrait plus être appelée directement
  const metrics = await metricsExtractor.extractMetrics(pages, originalUrl, backlinksData, null, null, null);
  
  if (!metrics) {
    return { 
      score: 0, 
      details: {
        entite: { score: 0, maxScore: 20 },
        intentions: { score: 0, maxScore: 15 },
        citabilite: { score: 0, maxScore: 30 },
        autoriteExterne: { score: 0, maxScore: 20 },
        iaready: { score: 0, maxScore: 15 }
      },
      maxPossibleScore: 100
    };
  }

  // Calculer les scores avec le nouveau système
  return calculateIAScores(metrics);
}

/**
 * Axe CLARTÉ D'ENTITÉ (30 points max)
 */
function computeEntite(pages) {
  let score = 0;
  const checks = {};

  // Proposition métier ≤ 25 mots (détection dans H1 ou premier paragraphe)
  const homepage = pages[0];
  if (homepage) {
    const proposition = (homepage.h1?.[0] || homepage.paragraphs?.[0] || '').trim();
    const wordCount = proposition.split(/\s+/).length;
    if (wordCount <= 25 && wordCount > 0) {
      score += 5;
      checks.conciseProposition = true;
    } else {
      checks.conciseProposition = false;
    }
  } else {
    checks.conciseProposition = false;
  }

  // Mot-clé métier dans H1 (détection améliorée avec patterns)
  const businessKeywords = ['service', 'solution', 'logiciel', 'plateforme', 'outil', 'entreprise', 'agence', 
                            'société', 'entreprise', 'expert', 'spécialiste', 'prestataire'];
  const businessPatterns = [
    /(service|solution|logiciel|plateforme|outil)/i,
    /(entreprise|société|agence)/i,
    /(expert|spécialiste|prestataire)/i
  ];
  
  const pagesWithBusinessKeyword = pages.filter(p => {
    const h1Text = (p.h1?.[0] || '').toLowerCase();
    const hasKeyword = businessKeywords.some(kw => h1Text.includes(kw));
    const hasPattern = businessPatterns.some(pattern => pattern.test(h1Text));
    return hasKeyword || hasPattern;
  }).length;
  
  const pageCount = pages.length;
  const businessKeywordPercentage = pageCount > 0 ? (pagesWithBusinessKeyword / pageCount) * 100 : 0;
  if (businessKeywordPercentage >= 50) {
    score += 5;
    checks.businessKeyword = true;
  } else if (businessKeywordPercentage >= 30) {
    score += 3.5;
    checks.businessKeyword = false;
  } else if (pagesWithBusinessKeyword > 0) {
    score += 2;
    checks.businessKeyword = false;
  } else {
    checks.businessKeyword = false;
  }
  checks.businessKeywordPages = pagesWithBusinessKeyword;

  // Spécialisation détectée (score proportionnel)
  const specializationKeywords = ['spécialisé', 'expert', 'leader', 'référence', 'spécialiste', 'expertise', 
                                  'maîtrise', 'compétence', 'savoir-faire'];
  const specializationPatterns = [
    /(spécialisé|expert|leader|référence|spécialiste)/i,
    /(expertise|maîtrise|compétence|savoir-faire)/i
  ];
  
  const specializationCount = pages.reduce((count, p) => {
    const text = (p.title + ' ' + p.paragraphs.join(' ')).toLowerCase();
    const keywordMatches = specializationKeywords.filter(kw => text.includes(kw)).length;
    const patternMatches = specializationPatterns.filter(pattern => pattern.test(text)).length;
    return count + keywordMatches + (patternMatches > 0 ? 1 : 0);
  }, 0);
  
  if (specializationCount >= 5) {
    score += 10;
    checks.specialization = true;
  } else if (specializationCount >= 3) {
    score += 7;
    checks.specialization = false;
  } else if (specializationCount >= 2) {
    score += 5;
    checks.specialization = false;
  } else if (specializationCount > 0) {
    score += 2;
    checks.specialization = false;
  } else {
    checks.specialization = false;
  }
  checks.specializationCount = specializationCount;

  // Page "À propos" existante
  const hasAboutPage = pages.some(p => {
    const url = p.url.toLowerCase();
    return url.includes('/about') || url.includes('/a-propos') || url.includes('/qui-sommes-nous');
  });
  if (hasAboutPage) {
    score += 5;
    checks.aboutPage = true;
  } else {
    checks.aboutPage = false;
  }

  // Cible B2B/B2C explicite
  const hasTarget = pages.some(p => {
    const text = (p.title + ' ' + p.paragraphs.join(' ')).toLowerCase();
    return text.includes('b2b') || text.includes('b2c') || 
           text.includes('entreprises') || text.includes('professionnels') ||
           text.includes('particuliers') || text.includes('consommateurs');
  });
  if (hasTarget) {
    score += 5;
    checks.target = true;
  } else {
    checks.target = false;
  }

  return { score, checks };
}

/**
 * Axe ALIGNEMENT INTENTIONS IA (20 points max)
 */
function computeIntentions(pages) {
  let score = 0;
  const checks = {};

  // Pages "comment / pourquoi" détectées (détection améliorée)
  const howWhyPatterns = [
    /(comment|how|guide)/i,
    /(pourquoi|why|raison)/i,
    /(tutoriel|tutorial)/i
  ];
  
  const howWhyPages = pages.filter(p => {
    const url = p.url.toLowerCase();
    const title = p.title.toLowerCase();
    const text = (p.title + ' ' + p.paragraphs.join(' ')).toLowerCase();
    
    // Vérifier URL
    const urlMatch = url.includes('/comment') || url.includes('/pourquoi') || 
                     url.includes('/guide') || url.includes('/tutoriel');
    // Vérifier titre
    const titleMatch = title.includes('comment') || title.includes('pourquoi') ||
                      title.includes('guide') || title.includes('tutoriel');
    // Vérifier patterns dans le contenu
    const patternMatch = howWhyPatterns.some(pattern => pattern.test(text));
    
    return urlMatch || titleMatch || patternMatch;
  }).length;
  
  const pageCount = pages.length;
  const howWhyPercentage = pageCount > 0 ? (howWhyPages / pageCount) * 100 : 0;
  if (howWhyPages >= 2 || howWhyPercentage >= 20) {
    score += 10;
    checks.howWhyPages = true;
  } else if (howWhyPages > 0) {
    score += 5;
    checks.howWhyPages = false;
  } else {
    checks.howWhyPages = false;
  }
  checks.howWhyPagesCount = howWhyPages;

  // FAQ (détection améliorée : questions structurées)
  const faqPage = pages.find(p => {
    const url = p.url.toLowerCase();
    const title = p.title.toLowerCase();
    return url.includes('/faq') || url.includes('/questions') || 
           url.includes('/frequently-asked') || title.includes('faq') || title.includes('questions');
  });
  if (faqPage) {
    const faqText = faqPage.paragraphs.join(' ');
    // Détection améliorée : questions avec patterns typiques FAQ
    const questionPatterns = [
      /(quelle|quels|quelle|comment|pourquoi|quand|où|qui)\s+[^?]*\?/gi,
      /^[A-Z][^?]*\?/gm
    ];
    const questionMatches = questionPatterns.reduce((count, pattern) => {
      return count + (faqText.match(pattern) || []).length;
    }, 0);
    
    // Aussi compter les "?" simples mais avec un minimum de contexte
    const simpleQuestions = (faqText.match(/\?/g) || []).length;
    const questionCount = Math.max(questionMatches, Math.floor(simpleQuestions / 2));
    
    if (questionCount >= 5) {
      score += 5;
      checks.faq = true;
    } else if (questionCount >= 3) {
      score += 3.5;
      checks.faq = false;
    } else if (questionCount > 0) {
      score += 2;
      checks.faq = false;
    } else {
      checks.faq = false;
    }
    checks.faqQuestionCount = questionCount;
  } else {
    checks.faq = false;
    checks.faqQuestionCount = 0;
  }

  // Cas d'usage / exemples
  const hasUseCases = pages.some(p => {
    const text = (p.title + ' ' + p.paragraphs.join(' ')).toLowerCase();
    return text.includes('cas d\'usage') || text.includes('exemple') || 
           text.includes('témoignage') || text.includes('client');
  });
  if (hasUseCases) {
    score += 5;
    checks.useCases = true;
  } else {
    checks.useCases = false;
  }

  return { score, checks };
}

/**
 * Axe CITABILITÉ (20 points max)
 */
function computeCitabilite(pages) {
  let score = 0;
  const checks = {};

  // Définitions (patterns améliorés)
  const definitionPatterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(est|désigne|signifie|correspond à|représente)\s+[^\.]{10,}/g,
    /(?:^|\.\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(est|désigne|signifie)\s+[^\.]{10,}/gm,
    /(?:^|\.\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+:\s+[^\.]{10,}/gm
  ];
  
  const pagesWithDefinitions = pages.filter(p => {
    const text = p.paragraphs.join(' ');
    return definitionPatterns.some(pattern => pattern.test(text));
  }).length;
  
  const pageCount = pages.length;
  const definitionPercentage = pageCount > 0 ? (pagesWithDefinitions / pageCount) * 100 : 0;
  if (definitionPercentage >= 40) {
    score += 5;
    checks.definitions = true;
  } else if (definitionPercentage >= 25) {
    score += 3.5;
    checks.definitions = false;
  } else if (pagesWithDefinitions > 0) {
    score += 2;
    checks.definitions = false;
  } else {
    checks.definitions = false;
  }
  checks.definitionPages = pagesWithDefinitions;

  // Listes structurées
  const hasLists = pages.some(p => p.lists && p.lists.length > 0);
  if (hasLists) {
    score += 5;
    checks.lists = true;
  } else {
    checks.lists = false;
  }

  // Comparatifs / tableaux
  const hasComparisons = pages.some(p => {
    const text = (p.title + ' ' + p.paragraphs.join(' ')).toLowerCase();
    return text.includes('comparaison') || text.includes('vs') || 
           text.includes('différence') || text.includes('tableau comparatif');
  });
  if (hasComparisons) {
    score += 5;
    checks.comparisons = true;
  } else {
    checks.comparisons = false;
  }

  // Superlatifs < 5 / page (ton neutre)
  const excessiveSuperlatives = pages.some(p => {
    const text = (p.title + ' ' + p.paragraphs.join(' ')).toLowerCase();
    const superlatives = ['meilleur', 'numéro 1', 'leader', 'inégalé', 'unique', 'révolutionnaire'];
    const count = superlatives.reduce((sum, sup) => {
      return sum + (text.match(new RegExp(sup, 'g')) || []).length;
    }, 0);
    return count >= 5;
  });
  if (!excessiveSuperlatives) {
    score += 5;
    checks.neutralTone = true;
  } else {
    checks.neutralTone = false;
  }

  return { score, checks };
}

/**
 * Axe AUTORITÉ EXTERNE IA (20 points max)
 * 
 * Utilise la détection de backlinks via techniques gratuites
 */
function computeAutoriteExterne(pages, url, backlinksData = null) {
  let score = 0;
  const checks = {};

  // Annuaire pro détecté (via liens sortants vers des annuaires)
  // Note: Les liens SORTANTS vers des annuaires indiquent une présence
  const externalLinks = pages.reduce((all, p) => {
    return all.concat(p.links?.external || []);
  }, []);
  
  const directoryDomains = ['pagesjaunes', 'societe', 'verif', 'infogreffe', 'kompass', 'pages-jaunes'];
  const hasDirectory = externalLinks.some(link => {
    try {
      const domain = new URL(link).hostname.toLowerCase();
      return directoryDomains.some(dir => domain.includes(dir));
    } catch (e) {
      return false;
    }
  });
  if (hasDirectory) {
    score += 5;
    checks.directory = true;
  } else {
    checks.directory = false;
  }

  // Profil LinkedIn (détection via liens sortants)
  // On vérifie la présence d'un lien vers LinkedIn (profil entreprise ou personnel)
  const hasLinkedIn = externalLinks.some(link => {
    try {
      const url = new URL(link);
      return url.hostname.includes('linkedin.com') && 
             (url.pathname.includes('/company/') || url.pathname.includes('/in/'));
    } catch (e) {
      return false;
    }
  });
  if (hasLinkedIn) {
    score += 5;
    checks.linkedin = true;
  } else {
    checks.linkedin = false;
  }

  // ≥ 3 backlinks (détection via backlinks)
  if (backlinksData && typeof backlinksData.totalBacklinks === 'number' && backlinksData.totalBacklinks >= 3) {
    score += 5;
    checks.backlinks = true;
    checks.backlinksCount = backlinksData.totalBacklinks;
  } else if (backlinksData && typeof backlinksData.totalBacklinks === 'number' && backlinksData.totalBacklinks > 0) {
    // Entre 1 et 2 backlinks : score partiel
    const partialScore = Math.floor((backlinksData.totalBacklinks / 3) * 5);
    score += partialScore;
    checks.backlinks = false;
    checks.backlinksCount = backlinksData.totalBacklinks;
  } else {
    checks.backlinks = false;
    checks.backlinksCount = 0;
  }

  // ≥ 3 avis clients (détection stricte : présence d'une section dédiée)
  // On cherche une page dédiée aux avis ou une section clairement identifiée
  const hasReviewsPage = pages.some(p => {
    const url = p.url.toLowerCase();
    return url.includes('/avis') || url.includes('/reviews') || url.includes('/temoignages');
  });
  
  // Ou présence d'au moins 3 mentions explicites d'avis/témoignages dans le contenu
  const reviewMentions = pages.reduce((count, p) => {
    const text = (p.title + ' ' + p.paragraphs.join(' ')).toLowerCase();
    // Recherche de patterns plus stricts : "avis client", "témoignage client", etc.
    const patterns = [
      /avis\s+(client|client[e]?s?)/g,
      /témoignage\s+(client|client[e]?s?)/g,
      /review\s+(client|client[e]?s?)/g,
      /note\s+(client|client[e]?s?)/g
    ];
    const matches = patterns.reduce((sum, pattern) => {
      return sum + (text.match(pattern) || []).length;
    }, 0);
    return count + matches;
  }, 0);
  
  if (hasReviewsPage || reviewMentions >= 3) {
    score += 5;
    checks.reviews = true;
  } else {
    checks.reviews = false;
  }

  return { score, checks };
}

/**
 * Axe STRUCTURATION IA (10 points max)
 */
function computeStructure(pages) {
  let score = 0;
  const checks = {};

  // Hiérarchie H1 → H2 → H3 valide (score proportionnel)
  const pagesWithHierarchy = pages.filter(p => {
    const hasH1 = p.h1 && p.h1.length > 0;
    const hasH2 = p.h2 && p.h2.length > 0;
    const hasH3 = p.h3 && p.h3.length > 0;
    // Hiérarchie complète : H1 + H2 + H3
    if (hasH1 && hasH2 && hasH3) return true;
    // Hiérarchie partielle : H1 + H2
    if (hasH1 && hasH2) return true;
    return false;
  }).length;
  
  const hierarchyPercentage = pages.length > 0 ? (pagesWithHierarchy / pages.length) * 100 : 0;
  if (hierarchyPercentage >= 80) {
    score += 5;
    checks.hierarchy = true;
  } else if (hierarchyPercentage >= 60) {
    score += 3.5; // 70% du score
    checks.hierarchy = false;
  } else if (hierarchyPercentage >= 40) {
    score += 2.5; // 50% du score
    checks.hierarchy = false;
  } else if (hierarchyPercentage >= 20) {
    score += 1; // 20% du score
    checks.hierarchy = false;
  } else {
    checks.hierarchy = false;
  }
  checks.hierarchyPercentage = Math.round(hierarchyPercentage);

  // Schema.org Organization / FAQ (score proportionnel)
  const pagesWithSchema = pages.filter(p => {
    if (!p.schemaOrg || p.schemaOrg.length === 0) return false;
    return p.schemaOrg.some(schema => {
      const type = schema['@type'] || schema.type;
      return type === 'Organization' || type === 'FAQPage' || type === 'LocalBusiness' || 
             type === 'Article' || type === 'Product' || type === 'Service';
    });
  }).length;
  
  const schemaPercentage = pages.length > 0 ? (pagesWithSchema / pages.length) * 100 : 0;
  if (schemaPercentage >= 50) {
    score += 5;
    checks.schema = true;
  } else if (schemaPercentage >= 30) {
    score += 3.5; // 70% du score
    checks.schema = false;
  } else if (schemaPercentage >= 15) {
    score += 2; // 40% du score
    checks.schema = false;
  } else if (schemaPercentage > 0) {
    score += 1; // 20% du score
    checks.schema = false;
  } else {
    checks.schema = false;
  }
  checks.schemaPercentage = Math.round(schemaPercentage);

  return { score, checks };
}

module.exports = { compute };

