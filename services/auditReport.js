/**
 * Génère un rapport d'audit complet et détaillé
 */
function generateAuditReport(data) {
  const { url, pages, seo, ia, sector, offer, email, timestamp } = data;
  
  const report = {
    metadata: {
      url: url,
      email: email,
      sector: sector || 'Non renseigné',
      offer: offer || 'Non renseigné',
      timestamp: timestamp,
      dateAnalyse: new Date(timestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
    },
    
    technique: {
      protocol: extractProtocol(url),
      robotsTxt: analyzeRobotsTxt(pages.robotsContent || pages.robotsAnalysis?.content || '', url),
      sitemap: {
        present: pages.sitemapExists || false,
        url: pages.sitemapExists ? new URL('/sitemap.xml', new URL(url).origin).toString() : null,
        urlsInSitemap: pages.sitemapUrlsCount || 0,
        urlsCrawled: pages.filter(p => p && typeof p === 'object' && p.url && !p.robotsContent && !p.sitemapExists).length,
        urlsExcluded: (pages.sitemapUrlsCount || 0) - pages.filter(p => p && typeof p === 'object' && p.url && !p.robotsContent && !p.sitemapExists).length,
        excludedDetails: pages.excludedPages || {
          duplicate: [],
          insufficientContent: [],
          errors: [],
          noTitle: []
        }
      },
      https: extractProtocol(url) === 'https',
      pagesAnalysees: pages.filter(p => p && typeof p === 'object' && p.url && !p.robotsContent && !p.sitemapExists).length,
      pagesDetails: pages.filter(p => p && typeof p === 'object' && p.url && !p.robotsContent && !p.sitemapExists).map(p => ({
        url: p.url,
        title: p.title,
        wordCount: p.wordCount,
        h1Count: p.h1?.length || 0,
        h2Count: p.h2?.length || 0,
        internalLinks: p.links?.internal?.length || 0,
        externalLinks: p.links?.external?.length || 0,
        hasMetaDescription: !!p.metaDescription,
        hasCanonical: !!p.canonical,
        hasSchemaOrg: (p.schemaOrg?.length || 0) > 0
      }))
    },
    
    seo: seo ? {
      score: seo.score,
      maxPossibleScore: seo.maxPossibleScore || 100,
      details: seo.details,
      note: seo.note || null
    } : null,
    
    ia: ia ? {
      score: ia.score,
      maxPossibleScore: ia.maxPossibleScore || 100,
      details: ia.details,
      note: ia.note || null
    } : null,
    
    totalScore: data.totalScore !== null && data.totalScore !== undefined ? {
      score: data.totalScore,
      maxPossibleScore: 100,
      seoContribution: seo ? Math.round(seo.score / 2) : 0,
      iaContribution: ia ? Math.round(ia.score / 2) : 0
    } : null,
    
    orientation: data.orientation,
    
    recommendations: generateRecommendations(seo, ia, pages)
  };
  
  return report;
}

/**
 * Extrait le protocole de l'URL
 */
function extractProtocol(url) {
  try {
    return new URL(url).protocol.replace(':', '');
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Analyse détaillée du robots.txt
 */
function analyzeRobotsTxt(robotsContent, siteUrl) {
  if (!robotsContent || robotsContent.trim().length === 0) {
    return {
      present: false,
      accessible: false,
      blocksHomepage: false,
      blocksAll: false,
      userAgents: [],
      disallowRules: [],
      allowRules: [],
      sitemapInRobots: null,
      warnings: ['robots.txt non présent ou inaccessible'],
      analysis: 'Aucun fichier robots.txt détecté. Les moteurs de recherche peuvent crawler toutes les pages.'
    };
  }
  
  const analysis = {
    present: true,
    accessible: true,
    blocksHomepage: false,
    blocksAll: false,
    userAgents: [],
    disallowRules: [],
    allowRules: [],
    sitemapInRobots: null,
    warnings: [],
    analysis: ''
  };
  
  const lines = robotsContent.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
  
  let currentUserAgent = '*';
  analysis.userAgents.push(currentUserAgent);
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // User-Agent
    if (lowerLine.startsWith('user-agent:')) {
      currentUserAgent = line.split(':')[1]?.trim() || '*';
      if (!analysis.userAgents.includes(currentUserAgent)) {
        analysis.userAgents.push(currentUserAgent);
      }
    }
    
    // Disallow
    if (lowerLine.startsWith('disallow:')) {
      const path = line.split(':')[1]?.trim() || '';
      if (path === '/') {
        analysis.blocksHomepage = true;
        analysis.warnings.push('La homepage est bloquée par robots.txt');
      }
      if (path === '') {
        // Disallow vide = tout autoriser (syntaxe Google)
        analysis.allowRules.push({ userAgent: currentUserAgent, path: '/' });
      } else {
        analysis.disallowRules.push({ userAgent: currentUserAgent, path: path });
        if (path === '/' || path === '') {
          analysis.blocksAll = true;
          analysis.warnings.push(`Tout le site est bloqué pour ${currentUserAgent}`);
        }
      }
    }
    
    // Allow
    if (lowerLine.startsWith('allow:')) {
      const path = line.split(':')[1]?.trim() || '';
      analysis.allowRules.push({ userAgent: currentUserAgent, path: path });
    }
    
    // Sitemap
    if (lowerLine.startsWith('sitemap:')) {
      analysis.sitemapInRobots = line.split(':')[1]?.trim() || null;
    }
  }
  
  // Génération de l'analyse textuelle
  if (analysis.blocksHomepage) {
    analysis.analysis = '⚠️ CRITIQUE: La homepage est bloquée par robots.txt. Les moteurs de recherche ne pourront pas indexer la page principale.';
  } else if (analysis.blocksAll) {
    analysis.analysis = '⚠️ CRITIQUE: Tout le site est bloqué. Aucune page ne sera indexée.';
  } else if (analysis.disallowRules.length > 0) {
    analysis.analysis = `Le robots.txt bloque ${analysis.disallowRules.length} chemin(s). Vérifiez que les pages importantes ne sont pas bloquées.`;
  } else {
    analysis.analysis = '✅ Le robots.txt est présent et n\'bloque pas les pages importantes.';
  }
  
  if (analysis.sitemapInRobots) {
    analysis.analysis += ` Sitemap déclaré: ${analysis.sitemapInRobots}`;
  }
  
  return analysis;
}

/**
 * Génère des recommandations basées sur l'audit
 */
function generateRecommendations(seo, ia, pages) {
  const recommendations = [];
  
  if (!seo && !ia) return recommendations;
  
  // Recommandations SEO
  if (seo) {
    if (seo.details?.technique?.checks?.https === false) {
      recommendations.push({
        type: 'critique',
        category: 'SEO Technique',
        title: 'Activer HTTPS',
        description: 'Le site n\'utilise pas HTTPS. C\'est un critère essentiel pour le SEO et la sécurité.'
      });
    }
    
    if (seo.details?.technique?.checks?.sitemap === false) {
      recommendations.push({
        type: 'important',
        category: 'SEO Technique',
        title: 'Créer un sitemap.xml',
        description: 'Aucun sitemap.xml détecté. Créez un sitemap pour faciliter l\'indexation.'
      });
    }
    
    if (seo.details?.contenu?.checks?.minPages === false) {
      recommendations.push({
        type: 'important',
        category: 'SEO Contenu',
        title: 'Augmenter le nombre de pages',
        description: `Seulement ${pages.filter(p => p && p.url).length} page(s) analysée(s). Créez plus de contenu.`
      });
    }
    
    if (seo.details?.contenu?.checks?.blog === false) {
      recommendations.push({
        type: 'suggestion',
        category: 'SEO Contenu',
        title: 'Créer un blog',
        description: 'Un blog permet de créer du contenu régulier et d\'améliorer votre visibilité.'
      });
    }
  }
  
  // Recommandations IA
  if (ia) {
    if (ia.details?.entite?.checks?.aboutPage === false) {
      recommendations.push({
        type: 'important',
        category: 'IA Clarté',
        title: 'Créer une page "À propos"',
        description: 'Une page À propos aide les IA à comprendre votre entreprise et votre activité.'
      });
    }
    
    if (ia.details?.intentions?.checks?.faq === false) {
      recommendations.push({
        type: 'suggestion',
        category: 'IA Intentions',
        title: 'Créer une FAQ',
        description: 'Une FAQ répond aux questions courantes et améliore la visibilité IA.'
      });
    }
    
    if (ia.details?.structure?.checks?.schema === false) {
      recommendations.push({
        type: 'suggestion',
        category: 'IA Structure',
        title: 'Ajouter des données structurées Schema.org',
        description: 'Les données structurées aident les IA à mieux comprendre votre contenu.'
      });
    }
  }
  
  return recommendations;
}

module.exports = { generateAuditReport };

