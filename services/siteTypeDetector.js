/**
 * Détection automatique du type de site basée sur des heuristiques de crawl
 * Retourne un type avec un score de confiance et un breakdown détaillé
 */

function detectSiteType(pages, metrics) {
  if (!pages || pages.length === 0) {
    return {
      type: 'unknown',
      confidence: 0,
      breakdown: {}
    };
  }

  const probabilities = {
    blog: 0,
    ecommerce: 0,
    saas: 0,
    vitrine: 0,
    local: 0
  };

  const breakdown = {
    blog: {},
    ecommerce: {},
    saas: {},
    vitrine: {},
    local: {}
  };

  // === DÉTECTION BLOG / MÉDIA ===
  let blogSignals = 0;
  
  // 1. URLs avec /blog, /articles, /news, /actualites
  const blogUrls = pages.filter(p => {
    const url = p.url.toLowerCase();
    return url.includes('/blog') || url.includes('/articles') || 
           url.includes('/news') || url.includes('/actualites') ||
           url.includes('/nouveautes') || url.includes('/post');
  }).length;
  if (blogUrls > 0) {
    blogSignals += 2;
    breakdown.blog.hasBlogSection = true;
    breakdown.blog.blogPages = blogUrls;
  }
  
  // 2. Pages avec dates/auteurs (timeTags)
  const pagesWithDates = pages.filter(p => (p.timeTags || []).length > 0).length;
  const dateRatio = pagesWithDates / pages.length;
  if (dateRatio > 0.3) {
    blogSignals += 2;
    breakdown.blog.hasDates = true;
    breakdown.blog.dateRatio = Math.round(dateRatio * 100);
  }
  
  // 3. Structure Hn + wordCount élevé
  const longContentPages = pages.filter(p => (p.wordCount || 0) >= 800).length;
  const longContentRatio = longContentPages / pages.length;
  if (longContentRatio > 0.2) {
    blogSignals += 1;
    breakdown.blog.hasLongContent = true;
    breakdown.blog.longContentRatio = Math.round(longContentRatio * 100);
  }
  
  // 4. Catégories/tags (URLs avec /category, /tag, /categorie)
  const categoryPages = pages.filter(p => {
    const url = p.url.toLowerCase();
    return url.includes('/category') || url.includes('/tag') || 
           url.includes('/categorie') || url.includes('/rubrique');
  }).length;
  if (categoryPages > 0) {
    blogSignals += 1;
    breakdown.blog.hasCategories = true;
    breakdown.blog.categoryPages = categoryPages;
  }
  
  probabilities.blog = Math.min(1, blogSignals / 6);

  // === DÉTECTION E-COMMERCE ===
  let ecommerceSignals = 0;
  
  // 1. Pages produits : prix, add to cart, checkout
  const productPages = pages.filter(p => {
    const text = (p.title + ' ' + (p.paragraphs || []).join(' ')).toLowerCase();
    const hasPrice = /€|\$|prix|price|tarif|add to cart|ajouter au panier|checkout|commander/i.test(text);
    const hasProductUrl = p.url.toLowerCase().includes('/product') || 
                          p.url.toLowerCase().includes('/produit') ||
                          p.url.toLowerCase().includes('/p/') ||
                          p.url.toLowerCase().includes('/item');
    return hasPrice || hasProductUrl;
  }).length;
  if (productPages > 0) {
    ecommerceSignals += 3;
    breakdown.ecommerce.hasProducts = true;
    breakdown.ecommerce.productPages = productPages;
  }
  
  // 2. URLs /product/, /collections/, /category/
  const ecommerceUrls = pages.filter(p => {
    const url = p.url.toLowerCase();
    return url.includes('/product') || url.includes('/produit') ||
           url.includes('/collection') || url.includes('/collections') ||
           url.includes('/category') || url.includes('/categorie') ||
           url.includes('/shop') || url.includes('/boutique');
  }).length;
  if (ecommerceUrls > 0) {
    ecommerceSignals += 2;
    breakdown.ecommerce.hasEcommerceUrls = true;
    breakdown.ecommerce.ecommerceUrls = ecommerceUrls;
  }
  
  // 3. Schema.org Product, Offer, AggregateRating
  const productSchemaPages = pages.filter(p => {
    if (!p.schemaOrg) return false;
    return p.schemaOrg.some(s => {
      const type = (s['@type'] || s.type || '').toLowerCase();
      return type.includes('product') || type.includes('offer') || 
             type.includes('aggregaterating') || type.includes('price');
    });
  }).length;
  if (productSchemaPages > 0) {
    ecommerceSignals += 2;
    breakdown.ecommerce.hasProductSchema = true;
    breakdown.ecommerce.productSchemaPages = productSchemaPages;
  }
  
  // 4. Présence de filtres (dirty URLs avec paramètres)
  const dirtyUrlsRatio = metrics.dirtyUrls || 0;
  if (dirtyUrlsRatio > 20) { // E-commerce a souvent des filtres
    ecommerceSignals += 1;
    breakdown.ecommerce.hasFilters = true;
    breakdown.ecommerce.dirtyUrlsRatio = Math.round(dirtyUrlsRatio);
  }
  
  probabilities.ecommerce = Math.min(1, ecommerceSignals / 8);

  // === DÉTECTION SAAS / PRODUIT B2B ===
  let saasSignals = 0;
  
  // 1. Pages /features, /pricing, /docs, /api, /changelog
  const saasPages = pages.filter(p => {
    const url = p.url.toLowerCase();
    return url.includes('/features') || url.includes('/fonctionnalites') ||
           url.includes('/pricing') || url.includes('/tarifs') ||
           url.includes('/docs') || url.includes('/documentation') ||
           url.includes('/api') || url.includes('/changelog') ||
           url.includes('/roadmap');
  }).length;
  if (saasPages > 0) {
    saasSignals += 3;
    breakdown.saas.hasSaasPages = true;
    breakdown.saas.saasPages = saasPages;
  }
  
  // 2. FAQ présente
  const faqScore = metrics.faq || 0;
  if (faqScore > 5) {
    saasSignals += 2;
    breakdown.saas.hasFaq = true;
    breakdown.saas.faqScore = faqScore;
  }
  
  // 3. Beaucoup de headings structurés, peu de profondeur
  const avgDepth = metrics.depth || 0;
  const hasStructure = pages.filter(p => {
    const hasH1 = (p.h1 || []).length > 0;
    const hasH2 = (p.h2 || []).length > 0;
    return hasH1 && hasH2;
  }).length / pages.length;
  
  if (avgDepth < 3 && hasStructure > 0.7) {
    saasSignals += 2;
    breakdown.saas.hasGoodStructure = true;
    breakdown.saas.avgDepth = Math.round(avgDepth * 10) / 10;
    breakdown.saas.structureRatio = Math.round(hasStructure * 100);
  }
  
  // 4. Pages "use cases" ou "témoignages"
  const useCasePages = pages.filter(p => {
    const url = p.url.toLowerCase();
    const text = (p.title + ' ' + (p.paragraphs || []).join(' ')).toLowerCase();
    return url.includes('/use-case') || url.includes('/cas-usage') ||
           url.includes('/testimonial') || url.includes('/temoignage') ||
           text.includes('cas d\'usage') || text.includes('use case');
  }).length;
  if (useCasePages > 0) {
    saasSignals += 1;
    breakdown.saas.hasUseCases = true;
    breakdown.saas.useCasePages = useCasePages;
  }
  
  probabilities.saas = Math.min(1, saasSignals / 8);

  // === DÉTECTION LOCAL BUSINESS ===
  let localSignals = 0;
  
  // 1. NAP détecté
  const napScore = metrics.nap || 0;
  if (napScore >= 3) {
    localSignals += 3;
    breakdown.local.hasNap = true;
    breakdown.local.napScore = napScore;
  }
  
  // 2. Schema LocalBusiness
  const localBusinessPages = pages.filter(p => {
    if (!p.schemaOrg) return false;
    return p.schemaOrg.some(s => {
      const type = (s['@type'] || s.type || '').toLowerCase();
      return type.includes('localbusiness') || type.includes('restaurant') ||
             type.includes('store') || type.includes('business');
    });
  }).length;
  if (localBusinessPages > 0) {
    localSignals += 2;
    breakdown.local.hasLocalSchema = true;
    breakdown.local.localBusinessPages = localBusinessPages;
  }
  
  // 3. Maps links (Google Maps)
  const mapsLinks = pages.reduce((count, p) => {
    const links = [...(p.links?.external || []), ...(p.links?.internal || [])];
    return count + links.filter(link => {
      const url = typeof link === 'string' ? link : (link.url || '');
      return url.toLowerCase().includes('google.com/maps') || 
             url.toLowerCase().includes('maps.google');
    }).length;
  }, 0);
  if (mapsLinks > 0) {
    localSignals += 2;
    breakdown.local.hasMaps = true;
    breakdown.local.mapsLinks = mapsLinks;
  }
  
  // 4. Page contact forte
  const contactPages = pages.filter(p => {
    const url = p.url.toLowerCase();
    return url.includes('/contact') || url.includes('/nous-contacter');
  });
  if (contactPages.length > 0) {
    const contactPage = contactPages[0];
    const contactWordCount = contactPage.wordCount || 0;
    if (contactWordCount > 200) {
      localSignals += 1;
      breakdown.local.hasContactPage = true;
      breakdown.local.contactWordCount = contactWordCount;
    }
  }
  
  probabilities.local = Math.min(1, localSignals / 8);

  // === DÉTECTION VITRINE / ONE-PAGE ===
  let vitrineSignals = 0;
  
  // 1. Très peu de pages (1-5)
  if (pages.length <= 5) {
    vitrineSignals += 3;
    breakdown.vitrine.hasFewPages = true;
    breakdown.vitrine.pagesCount = pages.length;
  }
  
  // 2. Peu de profondeur
  const avgDepthVitrine = metrics.depth || 0;
  if (avgDepthVitrine < 2) {
    vitrineSignals += 2;
    breakdown.vitrine.hasLowDepth = true;
    breakdown.vitrine.avgDepth = Math.round(avgDepthVitrine * 10) / 10;
  }
  
  // 3. Maillage faible (peu de liens internes)
  const avgInternalLinks = metrics.internalLinksOut || 0;
  if (avgInternalLinks < 3) {
    vitrineSignals += 1;
    breakdown.vitrine.hasWeakInternalLinks = true;
    breakdown.vitrine.avgInternalLinks = Math.round(avgInternalLinks * 10) / 10;
  }
  
  // 4. Peu de contenu long
  const longContentRatioVitrine = pages.filter(p => (p.wordCount || 0) >= 500).length / pages.length;
  if (longContentRatioVitrine < 0.3) {
    vitrineSignals += 1;
    breakdown.vitrine.hasLittleLongContent = true;
    breakdown.vitrine.longContentRatio = Math.round(longContentRatioVitrine * 100);
  }
  
  // 5. Beaucoup de CTA (boutons, liens d'action)
  const ctaCount = pages.reduce((sum, p) => {
    return sum + (p.ctaCount || 0);
  }, 0);
  const avgCta = ctaCount / pages.length;
  if (avgCta > 3) {
    vitrineSignals += 1;
    breakdown.vitrine.hasManyCtas = true;
    breakdown.vitrine.avgCta = Math.round(avgCta * 10) / 10;
  }
  
  probabilities.vitrine = Math.min(1, vitrineSignals / 8);

  // === DÉTERMINATION DU TYPE FINAL ===
  const maxProbability = Math.max(...Object.values(probabilities));
  const type = Object.keys(probabilities).find(key => probabilities[key] === maxProbability);
  
  // Si aucune probabilité n'est significative (>0.3), on classe comme "unknown"
  let finalType = 'unknown';
  let confidence = 0;
  
  if (maxProbability >= 0.3) {
    finalType = type;
    confidence = Math.round(maxProbability * 100);
  } else {
    // Si aucune détection claire, on essaie de deviner par défaut
    if (pages.length <= 3) {
      finalType = 'vitrine';
      confidence = 50;
    } else if (pages.length > 20 && avgDepthVitrine < 3) {
      finalType = 'saas';
      confidence = 40;
    } else {
      finalType = 'blog';
      confidence = 30;
    }
  }

  return {
    type: finalType,
    confidence: confidence,
    probabilities: probabilities,
    breakdown: breakdown[finalType] || {}
  };
}

module.exports = { detectSiteType };


