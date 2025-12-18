const metricsExtractor = require('./metricsExtractor');
const { calculateSEOScores } = require('./newScorer');

/**
 * Calcule le score SEO total selon le nouveau système (5 axes x 20 points)
 * 
 * Axes:
 * - Crawl & Accès : 20 points max
 * - Optimisation On-Page : 20 points max
 * - Technique On-page : 20 points max
 * - Architecture & Maillage : 20 points max
 * - Autorité : 20 points max
 */
async function compute(pages, originalUrl, backlinksData = null) {
  if (!pages || pages.length === 0) {
    return { 
      score: 0, 
      details: {
        crawl: { score: 0, maxScore: 25 },
        contenu: { score: 0, maxScore: 20 },
        technique: { score: 0, maxScore: 15 },
        architecture: { score: 0, maxScore: 20 },
        autorite: { score: 0, maxScore: 20 }
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
        crawl: { score: 0, maxScore: 25 },
        contenu: { score: 0, maxScore: 20 },
        technique: { score: 0, maxScore: 15 },
        architecture: { score: 0, maxScore: 20 },
        autorite: { score: 0, maxScore: 20 }
      },
      maxPossibleScore: 100
    };
  }

  // Calculer les scores avec le nouveau système
  return calculateSEOScores(metrics);
}

/**
 * Axe TECHNIQUE SEO (30 points max)
 */
function computeTechnique(pages, url) {
  let score = 0;
  const checks = {};

  // HTTPS actif
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol === 'https:') {
      score += 5;
      checks.https = true;
    } else {
      checks.https = false;
    }
  } catch (e) {
    checks.https = false;
  }

  // Meta viewport présent
  const hasViewport = pages.some(p => p.metaViewport && p.metaViewport.length > 0);
  if (hasViewport) {
    score += 5;
    checks.viewport = true;
  } else {
    checks.viewport = false;
  }

  // TTFB ≤ 1.5s (mesure réelle requise)
  // Sans mesure précise, on ne peut pas attribuer de points
  const pagesWithTtfb = pages.filter(p => p.ttfb !== null && p.ttfb > 0);
  if (pagesWithTtfb.length > 0) {
    const avgTtfb = pagesWithTtfb.reduce((sum, p) => sum + p.ttfb, 0) / pagesWithTtfb.length;
    if (avgTtfb <= 1.5) {
      score += 5;
      checks.ttfb = true;
    } else {
      checks.ttfb = false;
    }
  } else {
    // Pas de données TTFB disponibles = pas de points
    checks.ttfb = false;
  }

  // robots.txt ne bloque pas /
  const robotsContent = pages.robotsContent || '';
  const blocksHomepage = /Disallow:\s*\/$/.test(robotsContent);
  if (!blocksHomepage) {
    score += 5;
    checks.robots = true;
  } else {
    checks.robots = false;
  }

  // URLs sans paramètres excessifs
  const hasCleanUrls = pages.every(p => {
    const urlObj = new URL(p.url);
    return urlObj.search === '';
  });
  if (hasCleanUrls) {
    score += 5;
    checks.cleanUrls = true;
  } else {
    checks.cleanUrls = false;
  }

  // sitemap.xml accessible
  if (pages.sitemapExists) {
    score += 5;
    checks.sitemap = true;
  } else {
    checks.sitemap = false;
  }

  return { score, checks };
}

/**
 * Axe CONTENU SEO (30 points max)
 */
function computeContenu(pages) {
  let score = 0;
  const checks = {};

  // Filtrer les pages de qualité (exclure les pages très faibles pour le scoring)
  // Mais on garde toutes les pages pour le comptage total
  const qualityPages = pages.filter(p => p.url && !p.isLowQuality);
  const pageCount = pages.filter(p => p.url).length;
  const qualityPageCount = qualityPages.length;
  if (qualityPageCount >= 5) {
    score += 4;
    checks.minPages = true;
  } else if (qualityPageCount >= 3) {
    score += 2.5;
    checks.minPages = false;
  } else if (qualityPageCount >= 1) {
    score += 1;
    checks.minPages = false;
  } else {
    checks.minPages = false;
  }
  checks.pageCount = pageCount;

  // Title ≈ H1 (similarité proportionnelle) - 4 points max
  // Basé sur les pages de qualité uniquement
  const titleH1Match = qualityPages.filter(p => {
    if (!p.title || !p.h1 || p.h1.length === 0) return false;
    const titleWords = p.title.toLowerCase().split(/\s+/);
    const h1Words = p.h1[0].toLowerCase().split(/\s+/);
    const commonWords = titleWords.filter(w => h1Words.includes(w));
    const similarity = (commonWords.length / Math.max(titleWords.length, h1Words.length)) * 100;
    return similarity > 60;
  }).length;
  const matchPercentage = qualityPageCount > 0 ? (titleH1Match / qualityPageCount) * 100 : 0;
  if (matchPercentage >= 75) {
    score += 4;
    checks.titleH1Match = true;
  } else if (matchPercentage >= 50) {
    score += 2.5;
    checks.titleH1Match = false;
  } else if (matchPercentage >= 25) {
    score += 1.5;
    checks.titleH1Match = false;
  } else {
    checks.titleH1Match = false;
  }
  checks.titleH1MatchPercentage = Math.round(matchPercentage);

  // Longueur moyenne contenu (score proportionnel) - 4 points max
  // Calcul basé uniquement sur les pages de qualité
  const avgWordCount = qualityPages.length > 0 
    ? qualityPages.reduce((sum, p) => sum + (p.wordCount || 0), 0) / qualityPages.length
    : 0;
  if (avgWordCount >= 800) {
    score += 4;
    checks.longContent = true;
  } else if (avgWordCount >= 600) {
    score += 3;
    checks.longContent = false;
  } else if (avgWordCount >= 400) {
    score += 2;
    checks.longContent = false;
  } else if (avgWordCount >= 200) {
    score += 1;
    checks.longContent = false;
  } else {
    checks.longContent = false;
  }
  checks.avgWordCount = Math.round(avgWordCount);

  // Blog détecté (score proportionnel) - 3 points max
  const blogPages = qualityPages.filter(p => {
    const url = p.url.toLowerCase();
    return url.includes('/blog') || url.includes('/articles') || url.includes('/actualites') ||
           url.includes('/news') || url.includes('/nouveautes');
  }).length;
  const blogPercentage = qualityPageCount > 0 ? (blogPages / qualityPageCount) * 100 : 0;
  if (blogPercentage >= 20) {
    score += 3;
    checks.blog = true;
  } else if (blogPercentage >= 10) {
    score += 2;
    checks.blog = false;
  } else if (blogPages > 0) {
    score += 1;
    checks.blog = false;
  } else {
    checks.blog = false;
  }
  checks.blogPages = blogPages;

  // Liens internes / page (score proportionnel) - 3 points max
  const avgInternalLinks = qualityPages.length > 0 ? qualityPages.reduce((sum, p) => {
    return sum + (p.links?.internal?.length || 0);
  }, 0) / qualityPages.length : 0;
  if (avgInternalLinks >= 2) {
    score += 3;
    checks.internalLinks = true;
  } else if (avgInternalLinks >= 1.5) {
    score += 2.5;
    checks.internalLinks = false;
  } else if (avgInternalLinks >= 0.5) {
    score += 1.5;
    checks.internalLinks = false;
  } else {
    checks.internalLinks = false;
  }
  checks.avgInternalLinks = Math.round(avgInternalLinks * 10) / 10;

  // Mots-clés principaux (analyse améliorée : top 3 mots-clés)
  // Basé sur les pages de qualité uniquement
  const allTitles = qualityPages.map(p => (p.title || '') + ' ' + (p.h1 || []).join(' ')).join(' ').toLowerCase();
  const words = allTitles.split(/\s+/).filter(w => w.length > 3 && !['avec', 'dans', 'pour', 'sont', 'cette', 'notre', 'votre'].includes(w));
  
  if (words.length === 0) {
    checks.keywordDensity = false;
  } else {
    const wordFreq = {};
    words.forEach(w => wordFreq[w] = (wordFreq[w] || 0) + 1);
    
    // Prendre les top 3 mots-clés au lieu d'un seul
    const topKeywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word, count]) => ({ word, count }));
    
    const totalWords = qualityPages.reduce((sum, p) => sum + (p.wordCount || 0), 0);
    
    if (totalWords > 0 && topKeywords.length > 0) {
      // Calculer la densité moyenne des top 3 mots-clés
      const avgDensity = topKeywords.reduce((sum, kw) => {
        return sum + ((kw.count / totalWords) * 100);
      }, 0) / topKeywords.length;
      
      if (avgDensity >= 1) {
        score += 3;
        checks.keywordDensity = true;
      } else if (avgDensity >= 0.7) {
        score += 2;
        checks.keywordDensity = false;
      } else if (avgDensity >= 0.4) {
        score += 1;
        checks.keywordDensity = false;
      } else {
        checks.keywordDensity = false;
      }
      checks.keywordDensityValue = Math.round(avgDensity * 100) / 100;
      checks.topKeywords = topKeywords.map(kw => kw.word);
    } else {
      checks.keywordDensity = false;
    }
  }

  // Meta descriptions présentes (score proportionnel) - 4 points max
  const pagesWithMetaDesc = qualityPages.filter(p => {
    return p.metaDescription && p.metaDescription.trim().length >= 120 && p.metaDescription.trim().length <= 160;
  }).length;
  const metaDescPercentage = qualityPageCount > 0 ? (pagesWithMetaDesc / qualityPageCount) * 100 : 0;
  if (metaDescPercentage >= 80) {
    score += 4;
    checks.metaDescriptions = true;
  } else if (metaDescPercentage >= 60) {
    score += 3;
    checks.metaDescriptions = false;
  } else if (metaDescPercentage >= 40) {
    score += 2;
    checks.metaDescriptions = false;
  } else if (pagesWithMetaDesc > 0) {
    score += 1;
    checks.metaDescriptions = false;
  } else {
    checks.metaDescriptions = false;
  }
  checks.metaDescPercentage = Math.round(metaDescPercentage);
  checks.pagesWithMetaDesc = pagesWithMetaDesc;

  // Images avec alt text (score proportionnel) - 3 points max
  const totalImages = qualityPages.reduce((sum, p) => sum + (p.images?.length || 0), 0);
  const imagesWithAlt = qualityPages.reduce((sum, p) => {
    return sum + (p.images?.filter(img => img.hasAlt && img.alt.trim().length > 0).length || 0);
  }, 0);
  
  if (totalImages > 0) {
    const altPercentage = (imagesWithAlt / totalImages) * 100;
    if (altPercentage >= 90) {
      score += 3;
      checks.altText = true;
    } else if (altPercentage >= 70) {
      score += 2.5;
      checks.altText = false;
    } else if (altPercentage >= 50) {
      score += 1.5;
      checks.altText = false;
    } else if (altPercentage > 0) {
      score += 0.5;
      checks.altText = false;
    } else {
      checks.altText = false;
    }
    checks.altPercentage = Math.round(altPercentage);
  } else {
    checks.altText = false;
    checks.altPercentage = 0;
  }
  checks.totalImages = totalImages;
  checks.imagesWithAlt = imagesWithAlt;

  // Canonical tags présents - 2 points max
  const pagesWithCanonical = qualityPages.filter(p => p.canonical && p.canonical.trim().length > 0).length;
  const canonicalPercentage = qualityPageCount > 0 ? (pagesWithCanonical / qualityPageCount) * 100 : 0;
  if (canonicalPercentage >= 80) {
    score += 2;
    checks.canonical = true;
  } else if (canonicalPercentage >= 50) {
    score += 1.5;
    checks.canonical = false;
  } else if (pagesWithCanonical > 0) {
    score += 0.5;
    checks.canonical = false;
  } else {
    checks.canonical = false;
  }
  checks.canonicalPercentage = Math.round(canonicalPercentage);

  return { score, checks };
}

/**
 * Axe AUTORITÉ SEO (25 points max)
 * 
 * Utilise la détection de backlinks via techniques gratuites
 */
function computeAutorite(pages, url, backlinksData = null) {
  let score = 0;
  const checks = {};

  // ≥ 5 domaines référents (détection via backlinks)
  if (backlinksData && typeof backlinksData.referringDomainsCount === 'number' && backlinksData.referringDomainsCount >= 5) {
    score += 10;
    checks.referringDomains = true;
    checks.referringDomainsCount = backlinksData.referringDomainsCount;
  } else if (backlinksData && typeof backlinksData.referringDomainsCount === 'number' && backlinksData.referringDomainsCount > 0) {
    // Entre 1 et 4 domaines : score partiel
    const partialScore = Math.floor((backlinksData.referringDomainsCount / 5) * 10);
    score += partialScore;
    checks.referringDomains = false;
    checks.referringDomainsCount = backlinksData.referringDomainsCount;
  } else {
    checks.referringDomains = false;
    checks.referringDomainsCount = 0;
  }

  // ≥ 50% liens follow (analyse des attributs rel)
  const totalInternalLinks = pages.reduce((sum, p) => {
    return sum + (p.links?.internal?.length || 0);
  }, 0);
  
  const totalFollowLinks = pages.reduce((sum, p) => {
    return sum + (p.links?.relAttributes?.follow?.length || 0);
  }, 0);
  
  const totalNofollowLinks = pages.reduce((sum, p) => {
    return sum + (p.links?.relAttributes?.nofollow?.length || 0);
  }, 0);
  
  const totalLinksWithRel = totalFollowLinks + totalNofollowLinks;
  
  if (totalLinksWithRel > 0) {
    const followPercentage = (totalFollowLinks / totalLinksWithRel) * 100;
    if (followPercentage >= 50) {
      score += 5;
      checks.followLinks = true;
      checks.followPercentage = Math.round(followPercentage);
    } else {
      checks.followLinks = false;
      checks.followPercentage = Math.round(followPercentage);
    }
  } else {
    // Si aucun attribut rel détecté, on assume que les liens sont follow par défaut
    // (HTML standard : liens sans rel="nofollow" sont follow)
    if (totalInternalLinks > 0) {
      score += 5;
      checks.followLinks = true;
      checks.followPercentage = 100; // Assumé
    } else {
      checks.followLinks = false;
      checks.followPercentage = 0;
    }
  }

  // Domaine ≥ 2 ans (nécessite vérification whois réelle)
  // Sans API whois, on ne peut pas déterminer l'ancienneté
  // Ce critère nécessite une intégration externe (API whois)
  checks.domainAge = false;
  // Score: 0/5 (nécessite API whois)

  // Mentions marque détectées (nécessite analyse externe réelle)
  // Les mentions de marque en dehors du site nécessitent des outils externes
  // (Google Search, APIs de mentions, etc.)
  // Sans ces outils, on ne peut pas valider ce critère
  checks.brandMentions = false;
  // Score: 0/5 (nécessite API externe)

  return { score, checks };
}

/**
 * Axe UX & ENGAGEMENT (15 points max)
 */
function computeUX(pages) {
  let score = 0;
  const checks = {};

  // Filtrer les pages de qualité (exclure les pages très faibles pour le scoring)
  const qualityPages = pages.filter(p => p.url && !p.isLowQuality);
  const qualityPageCountUX = qualityPages.length;

  // Menu structuré (score proportionnel basé sur le nombre de pages et la navigation)
  const avgInternalLinks = qualityPageCountUX > 0 ? qualityPages.reduce((sum, p) => {
    return sum + (p.links?.internal?.length || 0);
  }, 0) / qualityPageCountUX : 0;
  
  // Score basé sur la présence de navigation (plusieurs pages) et de liens internes
  if (qualityPageCountUX >= 10 && avgInternalLinks >= 3) {
    score += 5;
    checks.structuredMenu = true;
  } else if (qualityPageCountUX >= 5 && avgInternalLinks >= 2) {
    score += 3.5; // 70% du score
    checks.structuredMenu = false;
  } else if (qualityPageCountUX >= 3 && avgInternalLinks >= 1) {
    score += 2; // 40% du score
    checks.structuredMenu = false;
  } else if (qualityPageCountUX > 1) {
    score += 1; // 20% du score
    checks.structuredMenu = false;
  } else {
    checks.structuredMenu = false;
  }

  // CTA visible (détection améliorée : patterns + boutons)
  const ctaKeywords = ['contact', 'découvrir', 'essayer', 'commencer', 'télécharger', 'acheter', 'commander', 
                       'demander', 'réserver', 'inscrire', 's\'inscrire', 'essai gratuit', 'démo'];
  const ctaPatterns = [
    /(contactez|contact|nous contacter)/i,
    /(découvrir|essayer|tester|démo)/i,
    /(commencer|démarrer|s'inscrire)/i,
    /(télécharger|téléchargement)/i,
    /(acheter|commander|réserver)/i
  ];
  
  const pagesWithCTA = qualityPages.filter(p => {
    const text = ((p.title || '') + ' ' + (p.paragraphs || []).join(' ')).toLowerCase();
    // Vérifier les mots-clés
    const hasKeyword = ctaKeywords.some(keyword => text.includes(keyword));
    // Vérifier les patterns regex
    const hasPattern = ctaPatterns.some(pattern => pattern.test(text));
    return hasKeyword || hasPattern;
  }).length;
  
  const ctaPercentage = qualityPageCountUX > 0 ? (pagesWithCTA / qualityPageCountUX) * 100 : 0;
  if (ctaPercentage >= 50) {
    score += 5;
    checks.cta = true;
  } else if (ctaPercentage >= 30) {
    score += 3.5;
    checks.cta = false;
  } else if (pagesWithCTA > 0) {
    score += 2;
    checks.cta = false;
  } else {
    checks.cta = false;
  }
  checks.ctaPages = pagesWithCTA;

  // Paragraphes lisibles (score proportionnel)
  const avgParagraphLength = qualityPages.length > 0 ? qualityPages.reduce((sum, p) => {
    const paraLengths = (p.paragraphs || []).map(para => para.split(/\s+/).length);
    const avg = paraLengths.length > 0 ? paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length : 0;
    return sum + avg;
  }, 0) / qualityPages.length : 0;
  
  // Paragraphes optimaux : 80-120 mots (idéal pour la lisibilité)
  if (avgParagraphLength >= 80 && avgParagraphLength <= 120) {
    score += 5;
    checks.readableParagraphs = true;
  } else if (avgParagraphLength >= 60 && avgParagraphLength <= 150) {
    score += 3.5; // 70% du score
    checks.readableParagraphs = false;
  } else if (avgParagraphLength >= 40 && avgParagraphLength <= 180) {
    score += 2; // 40% du score
    checks.readableParagraphs = false;
  } else if (avgParagraphLength > 0 && avgParagraphLength <= 200) {
    score += 1; // 20% du score
    checks.readableParagraphs = false;
  } else {
    checks.readableParagraphs = false;
  }
  checks.avgParagraphLength = Math.round(avgParagraphLength);

  return { score, checks };
}

module.exports = { compute };

