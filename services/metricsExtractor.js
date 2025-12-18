const { URL } = require('url');
const domainAgeChecker = require('./domainAgeChecker');
const brandMentionsChecker = require('./brandMentionsChecker');
const citationsChecker = require('./citationsChecker');

/**
 * Crée un objet métriques vide avec des valeurs par défaut
 * Utilisé quand aucune page n'a pu être crawlé
 */
function createEmptyMetrics(originalUrl) {
  return {
    url: originalUrl,
    pagesCount: 0,
    // SEO - Axe 1: Crawl & Accès
    https: extractProtocol(originalUrl) === 'https',
    robotsPresent: false,
    robotsOptimized: false,
    llmsTxtPresent: false,
    sitemapPresent: false,
    ttfb: null,
    errorRate: 100, // 100% d'erreur si aucune page
    dirtyUrls: 0,
    pageIndexation: 0,
    siteUpToDate: false,
    // SEO - Axe 2: Optimisation On-Page
    exploitablePages: 0,
    qualityTitles: 0,
    metaDescriptions: 0,
    h1Quality: 0,
    semanticVariants: 0,
    wordCount: 0,
    imageAltText: 0,
    contentFreshness: 0,
    // SEO - Axe 3: Technique On-Page
    schemaOrg: 0,
    mobileFriendly: false,
    // SEO - Axe 4: Architecture & Maillage
    depth: 0,
    internalLinksIn: 0,
    internalLinksOut: 0,
    followRatio: 0,
    anchorText: 0,
    // SEO - Axe 5: Autorité
    domainAge: 0,
    brandMentions: 0,
    citations: 0,
    // IA - Axe A: Exploitabilité machine
    hnStructure: 0,
    extractableFormats: 0,
    contentAccessibility: 0,
    htmlStable: false,
    // IA - Axe B: Crédibilité / Entité
    nap: false,
    entitySchema: 0,
    aboutPage: 0,
    externalReferences: 0,
    reviews: 0,
    // IA - Axe C: Stabilité & fraîcheur
    datesAuthor: 0,
    socialPresence: 0
  };
}

/**
 * Extrait toutes les métriques nécessaires pour le nouveau système de scoring (5 axes x 20 points)
 */
async function extractMetrics(pages, originalUrl, backlinksData = null, domainAgeData = null, brandMentionsData = null, citationsData = null) {
  // IMPORTANT: Ne jamais retourner null - toujours retourner un objet avec des valeurs par défaut
  if (!pages || pages.length === 0) {
    return createEmptyMetrics(originalUrl);
  }

  const validPages = pages.filter(p => p && typeof p === 'object' && p.url && !p.isLowQuality);
  
  if (validPages.length === 0) {
    // Même si aucune page valide, on retourne des métriques vides (pas null)
    return createEmptyMetrics(originalUrl);
  }

  // Helper pour obtenir l'URL d'un lien (gère string ou object)
  const getLinkUrl = (link) => typeof link === 'string' ? link : (link?.url || '');
  
  // Calcul du pourcentage de liens follow
  const totalInternalLinks = validPages.reduce((sum, p) => sum + (p.links?.internal?.length || 0), 0);
  const totalFollowLinks = validPages.reduce((sum, p) => sum + (p.links?.relAttributes?.follow?.length || 0), 0);
  const totalNofollowLinks = validPages.reduce((sum, p) => sum + (p.links?.relAttributes?.nofollow?.length || 0), 0);
  const totalLinksWithRel = totalFollowLinks + totalNofollowLinks;
  const followPercentage = totalLinksWithRel > 0 
    ? (totalFollowLinks / totalLinksWithRel) * 100 
    : (totalInternalLinks > 0 ? 100 : 0);

  const metrics = {
    url: originalUrl,
    pagesCount: validPages.length,
    
    // SEO - Axe 1: Crawl & Accès
    https: extractProtocol(originalUrl) === 'https',
    robotsPresent: pages.robotsAnalysis?.present || false,
    robotsOptimized: calculateRobotsOptimized(pages.robotsAnalysis?.content || '', originalUrl), // Nouveau : robots.txt optimisé
    llmsTxtPresent: pages.llmsTxtPresent || false, // Nouveau : présence LLMs.txt
    sitemapPresent: pages.sitemapExists || false,
    ttfb: calculateAverageTtfb(validPages), // Moyenne des headers TTFB
    errorRate: calculateErrorRate(validPages),
    dirtyUrls: calculateDirtyUrls(validPages),
    pageIndexation: calculatePageIndexation(validPages), // Nouveau : indexation des pages (codes statut)
    siteUpToDate: calculateSiteUpToDate(validPages), // Nouveau : site à jour (si possible)
    
    // SEO - Axe 2: Optimisation On-Page
    exploitablePages: calculateExploitablePages(validPages),
    qualityTitles: calculateQualityTitles(validPages),
    metaDescriptions: calculateMetaDescriptions(validPages),
    h1Quality: calculateH1Quality(validPages),
    semanticVariants: calculateSemanticVariants(validPages),
    
    // SEO - Axe 3: Technique On-page
    viewport: calculateViewport(validPages),
    altText: calculateAltText(validPages),
    canonical: calculateCanonical(validPages),
    schemaOrg: calculateSchemaOrg(validPages),
    indexability: calculateIndexability(validPages),
    
    // SEO - Axe 4: Architecture & Maillage
    depth: calculateDepth(validPages),
    internalLinksIn: calculateInternalLinksIn(validPages),
    internalLinksOut: calculateInternalLinksOut(validPages),
    anchorText: calculateAnchorText(validPages), // Réajouté : texte d'ancrage descriptif
    // avgCtaPerPage supprimé (remplacé par anchorText)
    
    // SEO - Axe 5: Autorité
    referringDomains: backlinksData?.referringDomainsCount || 0,
    totalBacklinks: backlinksData?.totalBacklinks || 0,
    followLinksPercentage: followPercentage,
    domainAge: domainAgeData ? {
      years: domainAgeData.years || 0,
      months: domainAgeData.months || 0,
      score: domainAgeChecker.calculateDomainAgeScore(domainAgeData)
    } : null,
    brandMentions: brandMentionsData?.totalMentions || 0,
    
    // IA - Axe 1: Preuves d'entité
    nap: calculateNAP(validPages),
    entitySchema: calculateEntitySchema(validPages),
    aboutPage: calculateAboutPage(validPages),
    // clearOffer supprimé (peu fiable)
    
    // IA - Axe 2: Alignement intentions
    questions: calculateQuestions(validPages),
    faq: calculateFAQ(validPages), // Réintroduit : détection URL fiable
    // useCases supprimé (peu fiable)
    
    // IA - Axe 3: Citabilité
    // definitions supprimé (peu fiable)
    extractableFormats: calculateExtractableFormats(validPages),
    // comparisons supprimé (peu fiable)
    externalReferences: calculateExternalReferences(validPages),
    anchorText: calculateAnchorText(validPages), // Réajouté : texte d'ancrage descriptif
    
    // IA - Axe 4: Autorité externe
    reviews: calculateReviews(validPages),
    citations: citationsData?.totalCitations || 0,
    socialPresence: calculateSocialPresence(validPages),
    
    // IA - Axe 5: IA-ready content
    hnStructure: calculateHnStructure(validPages),
    datesAuthor: calculateDatesAuthor(validPages),
    contentAccessibility: calculateContentAccessibility(validPages)
  };
  
  return metrics;
}

// Fonctions d'extraction de métriques
function extractProtocol(url) {
  try {
    return new URL(url).protocol.replace(':', '');
  } catch (e) {
    return 'unknown';
  }
}

function calculateAverageTtfb(pages) {
  const pagesWithTtfb = pages.filter(p => p.ttfb && p.ttfb > 0);
  if (pagesWithTtfb.length === 0) return null;
  return pagesWithTtfb.reduce((sum, p) => sum + p.ttfb, 0) / pagesWithTtfb.length;
}

function calculateErrorRate(pages) {
  // ✅ AMÉLIORATION: Mesurer réellement les erreurs HTTP
  const errorPages = pages.filter(p => {
    const statusCode = p.statusCode || 200;
    return statusCode >= 400 && statusCode < 600;
  }).length;
  
  return pages.length > 0 ? (errorPages / pages.length) * 100 : 0;
}

function calculateDirtyUrls(pages) {
  const dirtyCount = pages.filter(p => {
    try {
      const urlObj = new URL(p.url);
      return urlObj.search.length > 0;
    } catch (e) {
      return false;
    }
  }).length;
  return (dirtyCount / pages.length) * 100;
}

function calculateExploitablePages(pages) {
  const exploitable = pages.filter(p => (p.wordCount || 0) >= 300);
  return (exploitable.length / pages.length) * 100;
}

function calculateQualityTitles(pages) {
  const quality = pages.filter(p => {
    const title = p.title || '';
    const length = title.length >= 25 && title.length <= 65;
    return length;
  });
  return (quality.length / pages.length) * 100;
}

function calculateMetaDescriptions(pages) {
  const withMeta = pages.filter(p => {
    const meta = p.metaDescription || '';
    return meta.length >= 70 && meta.length <= 160;
  });
  return (withMeta.length / pages.length) * 100;
}

function calculateH1Quality(pages) {
  const quality = pages.filter(p => {
    const h1Count = (p.h1 || []).length;
    return h1Count === 1;
  });
  return (quality.length / pages.length) * 100;
}

function calculateSemanticVariants(pages) {
  const withVariants = pages.filter(p => {
    const h2Count = (p.h2 || []).length;
    const h3Count = (p.h3 || []).length;
    return h2Count > 0 || h3Count > 0;
  });
  return (withVariants.length / pages.length) * 100;
}

function calculateViewport(pages) {
  const withViewport = pages.filter(p => p.metaViewport && p.metaViewport.length > 0);
  return (withViewport.length / pages.length) * 100;
}

function calculateAltText(pages) {
  const totalImages = pages.reduce((sum, p) => sum + (p.images?.length || 0), 0);
  const imagesWithAlt = pages.reduce((sum, p) => {
    return sum + (p.images?.filter(img => img.alt && img.alt.trim().length > 0).length || 0);
  }, 0);
  return totalImages > 0 ? (imagesWithAlt / totalImages) * 100 : 0;
}

function calculateCanonical(pages) {
  const withCanonical = pages.filter(p => p.canonical && p.canonical.trim().length > 0);
  return (withCanonical.length / pages.length) * 100;
}

function calculateSchemaOrg(pages) {
  const withSchema = pages.filter(p => p.schemaOrg && p.schemaOrg.length > 0);
  return (withSchema.length / pages.length) * 100;
}

function calculateIndexability(pages) {
  // ✅ AMÉLIORATION: Vérifier réellement les balises noindex
  const indexablePages = pages.filter(p => {
    // Vérifier la meta robots
    const metaRobots = p.metaRobots || p.robotsMeta || '';
    const hasNoindex = /noindex/i.test(metaRobots);
    
    // Vérifier les headers X-Robots-Tag
    const headers = p.headers || {};
    const xRobotsTag = headers['x-robots-tag'] || headers['X-Robots-Tag'] || '';
    const hasNoindexHeader = /noindex/i.test(xRobotsTag);
    
    // Page indexable si pas de noindex
    return !hasNoindex && !hasNoindexHeader;
  }).length;
  
  return pages.length > 0 ? (indexablePages / pages.length) * 100 : 100;
}

function calculateDepth(pages) {
  const depths = pages.map(p => {
    try {
      const urlObj = new URL(p.url);
      return urlObj.pathname.split('/').filter(s => s.length > 0).length;
    } catch (e) {
      return 1;
    }
  });
  return depths.reduce((sum, d) => sum + d, 0) / depths.length;
}

function calculateInternalLinksIn(pages) {
  // ✅ AMÉLIORATION: Calculer réellement le pourcentage de pages avec liens entrants
  // ⚡ OPTIMISÉ: Utilise un Map pour O(1) lookup - Complexité O(n*m) où n=pages, m=liens/page
  if (pages.length === 0) return 0;
  
  // Helper pour obtenir l'URL d'un lien (gère string ou object)
  const getLinkUrl = (link) => typeof link === 'string' ? link : (link?.url || '');
  
  // Helper pour normaliser une URL (sans query/hash) - mis en cache pour éviter les recalculs
  const urlCache = new Map();
  const normalizeUrlForMap = (urlString) => {
    if (urlCache.has(urlString)) return urlCache.get(urlString);
    try {
      const urlObj = new URL(urlString);
      const normalized = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
      urlCache.set(urlString, normalized);
      return normalized;
    } catch (e) {
      urlCache.set(urlString, urlString);
      return urlString;
    }
  };
  
  // Créer un map des URLs pour compter les liens entrants (O(n))
  const urlMap = new Map();
  pages.forEach(p => {
    const normalized = normalizeUrlForMap(p.url);
    urlMap.set(normalized, { incoming: 0 });
  });
  
  // Compter les liens entrants pour chaque page (O(n*m) où m = avg links per page)
  pages.forEach(p => {
    const internalLinks = p.links?.internal || [];
    internalLinks.forEach(link => {
      const linkUrl = getLinkUrl(link);
      const normalizedLink = normalizeUrlForMap(linkUrl);
      
      // O(1) lookup grâce au Map
      const entry = urlMap.get(normalizedLink);
      if (entry) {
        entry.incoming++;
      }
    });
  });
  
  // Calculer le pourcentage de pages avec au moins 1 lien entrant (O(n))
  let pagesWithIncoming = 0;
  urlMap.forEach(entry => {
    if (entry.incoming > 0) pagesWithIncoming++;
  });
  
  return pages.length > 0 ? (pagesWithIncoming / pages.length) * 100 : 0;
}

function calculateInternalLinksOut(pages) {
  // Helper pour obtenir l'URL d'un lien (gère string ou object)
  const getLinkUrl = (link) => typeof link === 'string' ? link : (link?.url || '');
  
  const avgLinks = pages.reduce((sum, p) => {
    return sum + (p.links?.internal?.length || 0);
  }, 0) / pages.length;
  return avgLinks;
}

function calculateAnchorText(pages) {
  // Calculer le % de liens avec texte d'ancrage descriptif
  // Les ancres vides ou non descriptives ("cliquez ici", "lire la suite", etc.) sont pénalisées
  let totalLinks = 0;
  let descriptiveLinks = 0;
  
  const nonDescriptive = ['cliquez ici', 'lire la suite', 'en savoir plus', 'ici', 
                          'là', 'plus', 'suite', 'lien', 'lire', 'voir', 'cliquez',
                          'découvrir', 'accéder', 'aller', 'juste ici'];
  
  pages.forEach(p => {
    const internalLinks = p.links?.internal || [];
    const externalLinks = p.links?.external || [];
    const allLinks = [...internalLinks, ...externalLinks];
    
    allLinks.forEach(link => {
      totalLinks++;
      const linkData = typeof link === 'object' ? link : { url: link, anchorText: '' };
      const anchorText = (linkData.anchorText || '').trim();
      const anchorLower = anchorText.toLowerCase();
      
      // Vérifier si l'ancre est descriptive
      const isEmpty = anchorText.length === 0;
      const isTooShort = anchorText.length < 3;
      const isNonDescriptive = nonDescriptive.some(nd => anchorLower === nd || anchorLower.includes(nd));
      const isOnlySpecialChars = /^[^\w\s]+$/.test(anchorText);
      
      const isDescriptive = !isEmpty && !isTooShort && !isNonDescriptive && !isOnlySpecialChars && anchorText.length <= 100;
      
      if (isDescriptive) {
        descriptiveLinks++;
      }
    });
  });
  
  return totalLinks > 0 ? (descriptiveLinks / totalLinks) * 100 : 0;
}

function calculateRobotsOptimized(robotsContent, siteUrl) {
  // Calculer un score d'optimisation du robots.txt (0-100)
  // Basé sur les bonnes pratiques : https://sem.brindisiserver.click/blog/beginners-guide-robots-txt/
  if (!robotsContent || robotsContent.trim().length === 0) {
    return 0; // Pas de robots.txt = 0
  }
  
  let score = 0;
  const content = robotsContent.toLowerCase();
  
  // 1. Présence de User-agent: * (15 points)
  // Indique que les règles s'appliquent à tous les robots
  if (/user-agent:\s*\*/i.test(robotsContent)) {
    score += 15;
  }
  
  // 2. Sitemap déclaré (15 points)
  // Aide les moteurs à découvrir toutes les pages importantes
  if (/sitemap:/i.test(robotsContent)) {
    score += 15;
  }
  
  // 3. Pas de blocage de la homepage (20 points) - CRITIQUE
  // Bloquer "/" empêche l'indexation de la page principale
  if (!/disallow:\s*\/$/i.test(robotsContent)) {
    score += 20;
  } else {
    return 0; // Blocage homepage = score 0 (erreur critique)
  }
  
  // 4. Pas de blocage total (20 points) - CRITIQUE
  // Disallow vide bloque tout le site
  if (!/disallow:\s*$/i.test(robotsContent)) {
    score += 20;
  } else {
    return 0; // Blocage total = score 0 (erreur critique)
  }
  
  // 5. Ne pas bloquer les ressources critiques (15 points)
  // CSS, JS, API sont nécessaires pour le rendu
  const criticalResources = ['/css/', '/js/', '/assets/', '/api/', '/static/'];
  let blocksCritical = false;
  criticalResources.forEach(resource => {
    const pattern = new RegExp(`disallow:\\s*${resource.replace(/\//g, '\\/')}`, 'i');
    if (pattern.test(robotsContent)) {
      blocksCritical = true;
    }
  });
  if (!blocksCritical) {
    score += 15;
  }
  
  // 6. Utilisation correcte des wildcards (10 points)
  // Éviter les patterns trop larges qui bloquent des pages importantes
  // Exemples de mauvais patterns : /*.php, /.html$
  const badPatterns = [
    /disallow:\s*\*\.php/i,
    /disallow:\s*\/\.html\$/i,
    /disallow:\s*\*\.html/i
  ];
  let hasBadPattern = false;
  badPatterns.forEach(pattern => {
    if (pattern.test(robotsContent)) {
      hasBadPattern = true;
    }
  });
  if (!hasBadPattern) {
    score += 10;
  }
  
  // 7. Présence de commentaires (5 points)
  // Les commentaires aident à comprendre les règles
  if (/#/.test(robotsContent)) {
    score += 5;
  }
  
  return Math.min(100, score);
}

function calculatePageIndexation(pages) {
  // Calculer la répartition des pages par code statut HTTP
  const statusCounts = {
    200: 0,
    301: 0,
    302: 0,
    404: 0,
    500: 0,
    other: 0
  };
  
  pages.forEach(p => {
    const status = p.statusCode || 200;
    if (status === 200) {
      statusCounts[200]++;
    } else if (status === 301) {
      statusCounts[301]++;
    } else if (status === 302) {
      statusCounts[302]++;
    } else if (status === 404) {
      statusCounts[404]++;
    } else if (status >= 500) {
      statusCounts[500]++;
    } else {
      statusCounts.other++;
    }
  });
  
  return {
    total: pages.length,
    status200: statusCounts[200],
    status301: statusCounts[301],
    status302: statusCounts[302],
    status404: statusCounts[404],
    status500: statusCounts[500],
    other: statusCounts.other,
    indexablePercentage: pages.length > 0 ? (statusCounts[200] / pages.length) * 100 : 0
  };
}

function calculateSiteUpToDate(pages) {
  // Détecter si le site est à jour (basé sur les dates dans le contenu)
  // Si possible : vérifier les dates de publication, copyright, etc.
  const currentYear = new Date().getFullYear();
  const currentYearStr = currentYear.toString();
  const lastYearStr = (currentYear - 1).toString();
  
  let pagesWithRecentDate = 0;
  
  pages.forEach(p => {
    const text = (p.title + ' ' + (p.paragraphs || []).join(' ')).toLowerCase();
    
    // Vérifier les balises <time>
    const hasRecentTimeTag = (p.timeTags || []).some(timeTag => {
      if (!timeTag.datetime) return false;
      try {
        const date = new Date(timeTag.datetime);
        const year = date.getFullYear();
        return year >= currentYear - 1; // Dernière année ou année actuelle
      } catch (e) {
        return false;
      }
    });
    
    // Vérifier les mentions d'année dans le texte
    const hasRecentYear = text.includes(currentYearStr) || text.includes(lastYearStr);
    
    // Vérifier copyright récent
    const hasRecentCopyright = /copyright.*20\d{2}/i.test(text) && 
                               (text.includes(currentYearStr) || text.includes(lastYearStr));
    
    if (hasRecentTimeTag || hasRecentYear || hasRecentCopyright) {
      pagesWithRecentDate++;
    }
  });
  
  return pages.length > 0 ? (pagesWithRecentDate / pages.length) * 100 : 0;
}

function calculateNAP(pages) {
  // ✅ AMÉLIORATION: Patterns regex plus précis
  let napScore = 0;
  const foundElements = { name: false, address: false, phone: false, email: false };
  
  pages.forEach(p => {
    const text = (p.title + ' ' + (p.paragraphs || []).join(' ')).toLowerCase();
    
    // Nom de l'entreprise (dans le titre ou H1)
    if (!foundElements.name) {
      const namePattern = /(société|entreprise|sarl|sas|eurl|sa|sci|company|corp)/i;
      if (namePattern.test(p.title) || namePattern.test(p.h1?.[0] || '')) {
        foundElements.name = true;
        napScore++;
      }
    }
    
    // Adresse (patterns français)
    if (!foundElements.address) {
      const addressPattern = /(\d{1,3}\s+(?:rue|avenue|boulevard|chemin|impasse|place|allée|route)\s+[^,]+|code postal\s+\d{5}|cp\s+\d{5}|\d{5}\s+[A-Z][a-z]+)/i;
      if (addressPattern.test(text)) {
        foundElements.address = true;
        napScore++;
      }
    }
    
    // Téléphone (formats français)
    if (!foundElements.phone) {
      const phonePattern = /(?:0[1-9]|(?:\+33|0033)[1-9])(?:[.\s-]?\d{2}){4}/;
      if (phonePattern.test(text)) {
        foundElements.phone = true;
        napScore++;
      }
    }
    
    // Email
    if (!foundElements.email) {
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      if (emailPattern.test(text)) {
        foundElements.email = true;
        napScore++;
      }
    }
  });
  
  return Math.min(4, napScore);
}

function calculateEntitySchema(pages) {
  const entityTypes = ['Organization', 'LocalBusiness', 'Person'];
  const withEntity = pages.filter(p => {
    if (!p.schemaOrg) return false;
    return p.schemaOrg.some(s => {
      const type = s['@type'] || s.type || '';
      return entityTypes.some(et => type.includes(et));
    });
  });
  return (withEntity.length / pages.length) * 100;
}

function calculateAboutPage(pages) {
  const aboutPage = pages.find(p => {
    const url = p.url.toLowerCase();
    return url.includes('/about') || url.includes('/a-propos') || url.includes('/qui-sommes');
  });
  if (!aboutPage) return 0;
  return aboutPage.wordCount || 0;
}

function calculateClearOffer(pages) {
  // ✅ AMÉLIORATION: Patterns contextuels améliorés
  const homepage = pages[0];
  if (!homepage) return 0;
  
  const text = ((homepage.h1?.[0] || '') + ' ' + (homepage.paragraphs?.[0] || '')).toLowerCase();
  let score = 0;
  
  // 1. Cible explicite (nous, on, notre, pour les entreprises, pour les particuliers)
  const targetPatterns = [
    /(?:nous|on|notre|votre)\s+(?:proposons|offrons|vendons|fournissons)/i,
    /pour\s+(?:les\s+)?(?:entreprises|professionnels|particuliers|clients)/i,
    /(?:destiné|conçu|adapté)\s+(?:aux?|pour)/i
  ];
  if (targetPatterns.some(pattern => pattern.test(text))) {
    score++;
  }
  
  // 2. Bénéfice clair (aide, permet, facilite, améliore, optimise)
  const benefitPatterns = [
    /(?:aide|permet|facilite|améliore|optimise|réduit|augmente|gagne)\s+[^.]{5,}/i,
    /(?:économisez|gagnez|réduisez)\s+(?:du\s+)?(?:temps|argent|efforts)/i
  ];
  if (benefitPatterns.some(pattern => pattern.test(text))) {
    score++;
  }
  
  // 3. Service/Produit explicite
  const servicePatterns = [
    /(?:service|solution|logiciel|plateforme|outil|produit|application)\s+(?:de|pour|en)/i,
    /(?:nous\s+)?(?:développons|créons|concevons|fabriquons)\s+[^.]{5,}/i
  ];
  if (servicePatterns.some(pattern => pattern.test(text))) {
    score++;
  }
  
  return Math.min(3, score);
}

function calculateQuestions(pages) {
  const questionWords = ['comment', 'pourquoi', 'combien', 'quel', 'quelle', 'quand', 'où'];
  const withQuestions = pages.filter(p => {
    const h2h3 = [...(p.h2 || []), ...(p.h3 || [])].join(' ').toLowerCase();
    return questionWords.some(qw => h2h3.includes(qw));
  });
  return (withQuestions.length / pages.length) * 100;
}

function calculateFAQ(pages) {
  let faqScore = 0;
  
  // 1. Détection FAQ sur page dédiée (URL)
  const faqPage = pages.find(p => {
    const url = p.url.toLowerCase();
    const title = (p.title || '').toLowerCase();
    return url.includes('/faq') || url.includes('/questions') || 
           url.includes('/frequently-asked') || 
           title.includes('faq') || title.includes('questions');
  });
  
  if (faqPage) {
    // Page FAQ dédiée trouvée : compter les questions
    const text = (faqPage.paragraphs || []).join(' ');
    const questionPatterns = [
      /(quelle|quels|quelle|comment|pourquoi|quand|où|qui)\s+[^?]*\?/gi,
      /^[A-Z][^?]*\?/gm
    ];
    const questionMatches = questionPatterns.reduce((count, pattern) => {
      return count + (text.match(pattern) || []).length;
    }, 0);
    const simpleQuestions = (text.match(/\?/g) || []).length;
    const questionCount = Math.max(questionMatches, Math.floor(simpleQuestions / 2));
    faqScore += Math.min(questionCount, 10); // Cap à 10
  }
  
  // 2. Détection FAQ intégrée dans les pages (sections FAQ)
  // Cherche des sections avec plusieurs questions (≥3 questions)
  pages.forEach(p => {
    const text = (p.paragraphs || []).join(' ');
    const h2h3 = [...(p.h2 || []), ...(p.h3 || [])].join(' ');
    
    // Patterns pour détecter les vraies questions
    const questionPatterns = [
      /(quelle|quels|quelle|comment|pourquoi|quand|où|qui)\s+[^?]*\?/gi,
      /^[A-Z][^?]*\?/gm
    ];
    const questionMatches = questionPatterns.reduce((count, pattern) => {
      return count + (text.match(pattern) || []).length;
    }, 0);
    const simpleQuestions = (text.match(/\?/g) || []).length;
    const questionCount = Math.max(questionMatches, Math.floor(simpleQuestions / 2));
    
    // Si une page a ≥3 questions, c'est probablement une section FAQ
    if (questionCount >= 3) {
      faqScore += Math.min(questionCount, 5); // Bonus mais limité (max 5 par page)
    }
  });
  
  // 3. Titre de page est une question
  const pagesWithQuestionTitle = pages.filter(p => {
    const title = (p.title || '').trim();
    if (!title) return false;
    // Vérifie si le titre se termine par "?" ou commence par un mot-question
    const questionWords = ['comment', 'pourquoi', 'combien', 'quel', 'quelle', 'quand', 'où', 'qui'];
    const titleLower = title.toLowerCase();
    return title.endsWith('?') || questionWords.some(qw => titleLower.startsWith(qw));
  }).length;
  
  if (pagesWithQuestionTitle > 0) {
    faqScore += Math.min(pagesWithQuestionTitle * 2, 5); // Bonus : 2 pts par page, max 5
  }
  
  // 4. Présence d'un blog (articles de blog)
  const blogPages = pages.filter(p => {
    const url = p.url.toLowerCase();
    return url.includes('/blog') || url.includes('/articles') || 
           url.includes('/actualites') || url.includes('/news') || 
           url.includes('/nouveautes') || url.includes('/post');
  }).length;
  
  if (blogPages > 0) {
    faqScore += Math.min(blogPages, 5); // Bonus : 1 pt par page blog, max 5
  }
  
  // Retourne le score total (0-10+ pour scoring proportionnel)
  return Math.min(faqScore, 10); // Cap à 10 pour le scoring
}

function calculateUseCases(pages) {
  const keywords = ['cas d\'usage', 'exemple', 'scénario', 'témoignage', 'client'];
  let count = 0;
  pages.forEach(p => {
    const text = (p.title + ' ' + (p.paragraphs || []).join(' ')).toLowerCase();
    keywords.forEach(kw => {
      if (text.includes(kw)) count++;
    });
  });
  return count;
}

function calculateDefinitions(pages) {
  // ✅ AMÉLIORATION: Plus de patterns pour capturer différents formats
  const totalWords = pages.reduce((sum, p) => sum + (p.wordCount || 0), 0);
  let definitions = 0;
  
  pages.forEach(p => {
    const text = (p.paragraphs || []).join(' ');
    
    // Patterns améliorés pour les définitions
    const definitionPatterns = [
      // Format 1: "X est Y"
      /([A-Z][a-zA-ZÀ-ÿ\s-]{2,30})\s+(?:est|désigne|signifie|correspond à|représente|définit)\s+[^.]{10,}/gi,
      // Format 2: "X : Y"
      /([A-Z][a-zA-ZÀ-ÿ\s-]{2,30})\s*:\s+[^.]{10,}/gi,
      // Format 3: "X, c'est Y"
      /([A-Z][a-zA-ZÀ-ÿ\s-]{2,30}),\s*c'?est\s+[^.]{10,}/gi,
      // Format 4: "Par X, on entend Y"
      /par\s+([a-z][a-zA-ZÀ-ÿ\s-]{2,30}),\s+on\s+entend\s+[^.]{10,}/gi,
      // Format 5: "X se définit comme Y"
      /([A-Z][a-zA-ZÀ-ÿ\s-]{2,30})\s+se\s+définit\s+(?:comme|par)\s+[^.]{10,}/gi
    ];
    
    definitionPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      definitions += matches.length;
    });
  });
  
  return totalWords > 0 ? (definitions / totalWords) * 1000 : 0;
}

function calculateExtractableFormats(pages) {
  const withFormats = pages.filter(p => {
    const hasLists = (p.lists || []).length > 0;
    const hasTables = (p.title + ' ' + (p.paragraphs || []).join(' ')).toLowerCase().includes('tableau');
    return hasLists || hasTables;
  });
  return (withFormats.length / pages.length) * 100;
}

function calculateComparisons(pages) {
  const keywords = ['vs', 'versus', 'alternatives', 'comparaison', 'comparatif'];
  let count = 0;
  pages.forEach(p => {
    const text = (p.title + ' ' + (p.paragraphs || []).join(' ')).toLowerCase();
    keywords.forEach(kw => {
      if (text.includes(kw)) count++;
    });
  });
  return count;
}

function calculateExternalReferences(pages) {
  // Calculer le % de pages avec des liens externes vers des sources crédibles
  // Sources crédibles : Wikipedia, études (.edu, .gov), articles scientifiques, etc.
  const credibleDomains = [
    'wikipedia.org', 'wikimedia.org',
    '.edu', '.gov', '.ac.uk', '.ac.fr',
    'pubmed', 'scholar.google', 'researchgate',
    'nature.com', 'science.org', 'ieee.org', 'acm.org'
  ];
  
  const pagesWithReferences = pages.filter(p => {
    const externalLinks = p.links?.external || [];
    return externalLinks.some(link => {
      try {
        const url = typeof link === 'string' ? link : (link.url || '');
        const hostname = new URL(url).hostname.toLowerCase();
        return credibleDomains.some(domain => hostname.includes(domain));
      } catch (e) {
        return false;
      }
    });
  });
  
  return pages.length > 0 ? (pagesWithReferences.length / pages.length) * 100 : 0;
}

function calculateReviews(pages) {
  // ✅ AMÉLIORATION: Patterns améliorés + comptage réel
  // 1. Page dédiée aux avis
  const reviewPage = pages.find(p => {
    const url = p.url.toLowerCase();
    return url.includes('/avis') || url.includes('/reviews') || 
           url.includes('/témoignages') || url.includes('/testimonials') ||
           url.includes('/clients') || url.includes('/satisfaction');
  });
  
  if (reviewPage) {
    // Compter les avis dans la page
    const text = (reviewPage.paragraphs || []).join(' ');
    const reviewPatterns = [
      /(?:avis|témoignage|review|note|évaluation)\s+(?:client|client[e]?s?|utilisateur)/gi,
      /(?:note|rating|étoile)\s*:?\s*\d+\s*(?:sur|out of|\/)\s*\d+/gi,
      /(?:★★★★|⭐⭐⭐⭐|5\s*étoiles|4\s*étoiles)/gi
    ];
    
    const matches = reviewPatterns.reduce((count, pattern) => {
      return count + (text.match(pattern) || []).length;
    }, 0);
    
    return Math.min(50, 10 + matches * 2); // 10 points de base + 2 par avis
  }
  
  // 2. Mentions d'avis dans le contenu
  const mentions = pages.reduce((sum, p) => {
    const text = (p.paragraphs || []).join(' ').toLowerCase();
    const patterns = [
      /(?:avis|témoignage|review|note)\s+(?:client|client[e]?s?|utilisateur)/g,
      /(?:nos\s+)?(?:clients|utilisateurs)\s+(?:nous|ont)\s+(?:donné|attribué|laissé)\s+(?:un\s+)?(?:avis|témoignage)/g
    ];
    
    const matches = patterns.reduce((count, pattern) => {
      return count + (text.match(pattern) || []).length;
    }, 0);
    
    return sum + matches;
  }, 0);
  
  return Math.min(50, mentions * 5);
}

function calculateSocialPresence(pages) {
  let score = 0;
  pages.forEach(p => {
    const links = [...(p.links?.external || [])];
    links.forEach(link => {
      if (link.includes('linkedin.com')) score += 3;
      if (link.includes('twitter.com') || link.includes('x.com')) score += 2;
      if (link.includes('facebook.com')) score += 1;
    });
  });
  return Math.min(10, score);
}

function calculateHnStructure(pages) {
  const withStructure = pages.filter(p => {
    const hasH1 = (p.h1 || []).length > 0;
    const hasH2 = (p.h2 || []).length > 0;
    return hasH1 && hasH2;
  });
  return (withStructure.length / pages.length) * 100;
}

function calculateDatesAuthor(pages) {
  // ✅ AMÉLIORATION: Patterns améliorés + balises <time>
  const pagesWithDates = pages.filter(p => {
    // Vérifier les balises <time>
    const hasTimeTag = (p.timeTags || []).length > 0;
    if (hasTimeTag) return true;
    
    const text = (p.paragraphs || []).join(' ');
    
    // Patterns améliorés pour les dates
    const datePatterns = [
      // Format français: DD/MM/YYYY, DD-MM-YYYY
      /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/,
      // Format ISO: YYYY-MM-DD
      /\d{4}[\/\-]\d{2}[\/\-]\d{2}/,
      // Format texte: "15 janvier 2024", "janvier 2024"
      /(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}/i,
      // Format court: "2024", "en 2024"
      /(?:en\s+)?\d{4}(?:\s|$|,|\.)/,
      // Format relatif: "il y a 2 jours", "publié le"
      /(?:publié|mis à jour|créé|modifié)\s+(?:le\s+)?(?:le\s+\d|en)/i
    ];
    
    return datePatterns.some(pattern => pattern.test(text));
  });
  
  return pages.length > 0 ? (pagesWithDates.length / pages.length) * 100 : 0;
}

function calculateContentAccessibility(pages) {
  // ✅ AMÉLIORATION: Calculer réellement l'accessibilité avec plusieurs critères
  if (pages.length === 0) return 0;
  
  let totalScore = 0;
  
  pages.forEach(p => {
    let pageScore = 0;
    let criteriaCount = 0;
    
    // 1. Structure Hn présente (25%)
    if ((p.h1 || []).length > 0 && (p.h2 || []).length > 0) {
      pageScore += 25;
    }
    criteriaCount++;
    
    // 2. Paragraphes structurés (25%)
    const paragraphs = p.paragraphs || [];
    const avgParaLength = paragraphs.length > 0
      ? paragraphs.reduce((sum, para) => sum + para.split(/\s+/).length, 0) / paragraphs.length
      : 0;
    if (avgParaLength >= 40 && avgParaLength <= 200) {
      pageScore += 25;
    }
    criteriaCount++;
    
    // 3. Listes présentes (25%)
    if ((p.lists || []).length > 0) {
      pageScore += 25;
    }
    criteriaCount++;
    
    // 4. Pas de contenu caché (25%)
    const hiddenContentLength = p.hiddenContentLength || 0;
    const totalWords = p.wordCount || 1;
    const hiddenContentRatio = hiddenContentLength / totalWords;
    if (hiddenContentRatio < 0.3) { // Moins de 30% de contenu caché
      pageScore += 25;
    }
    criteriaCount++;
    
    totalScore += (pageScore / criteriaCount);
  });
  
  return totalScore / pages.length;
}

module.exports = { 
  extractMetrics,
  createEmptyMetrics
};

