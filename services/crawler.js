const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const https = require('https');

// Ajout d'un délai minimal pour simuler un vrai crawl
const MIN_CRAWL_DELAY = 100; // 100ms entre chaque page (réduit pour accélérer)

// Pas de limite de pages - crawl complet du site
const MAX_DEPTH = 2;
const PAGE_TIMEOUT = 10000; // 10 secondes par page (augmenté pour les sites lents)
const MAX_RETRIES = 3; // Nombre de tentatives en cas d'échec
const RETRY_DELAY = 1000; // Délai initial entre les retries (1 seconde)

// User-Agent plus réaliste pour éviter les blocages
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Headers supplémentaires pour paraître plus "humain"
const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0'
};

/**
 * Normalise une URL
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Suppression des paramètres de requête
    urlObj.search = '';
    urlObj.hash = '';
    return urlObj.toString();
  } catch (e) {
    return url;
  }
}

/**
 * Vérifie si une URL doit être exclue (pages non pertinentes pour SEO/IA)
 */
function shouldExcludeUrl(url) {
  try {
    const urlLower = url.toLowerCase();
    const urlPath = new URL(url).pathname.toLowerCase();
    
    // Patterns d'exclusion pour pages non pertinentes
    const excludePatterns = [
      // Pages utilisateur/compte
      '/profil', '/profile', '/account', '/compte', '/user', '/utilisateur',
      '/dashboard', '/tableau-de-bord', '/admin', '/administration',
      '/login', '/connexion', '/signin', '/sign-in',
      '/logout', '/deconnexion', '/signout', '/sign-out',
      '/register', '/inscription', '/signup', '/sign-up',
      '/password', '/mot-de-passe', '/reset', '/reinitialisation',
      
      // Pages e-commerce non pertinentes
      '/panier', '/cart', '/basket', '/checkout', '/paiement', '/payment',
      '/commande', '/order', '/orders', '/commandes',
      '/wishlist', '/liste-souhaits', '/favoris', '/favorites',
      '/comparer', '/compare', '/comparaison',
      
      // Pages techniques
      '/api/', '/ajax/', '/json/', '/xml/',
      '/search', '/recherche', '/results', '/resultats',
      '/404', '/500', '/error', '/erreur',
      
      // Pages de session
      '/session', '/token', '/auth', '/authentification',
      
      // Autres pages non pertinentes
      '/print', '/imprimer', '/pdf', '/download', '/telecharger',
      '/share', '/partager', '/embed', '/iframe'
    ];
    
    // Vérifier si l'URL contient un pattern d'exclusion
    for (const pattern of excludePatterns) {
      if (urlPath.includes(pattern)) {
        return true;
      }
    }
    
    return false;
  } catch (e) {
    // Si l'URL est invalide, on l'exclut par sécurité
    return true;
  }
}

/**
 * Détecte si une URL est une page produit (basé sur des patterns simples)
 * Utilisé uniquement pour limiter le nombre de pages produits à 5
 * Note: Les URLs viennent déjà du sitemap ou du menu, on détecte juste le type pour limiter
 */
function isProductPage(url) {
  try {
    const urlPath = new URL(url).pathname.toLowerCase();
    
    // Patterns simples pour pages produits (e-commerce)
    const productPatterns = [
      '/product/', '/produit/', '/produits/', '/products/',
      '/p/', '/item/', '/article/', '/articles/'
    ];
    
    // Vérifier si l'URL correspond à un pattern de produit
    return productPatterns.some(pattern => urlPath.includes(pattern));
  } catch (e) {
    return false;
  }
}

/**
 * Filtre et limite les URLs selon les règles
 * @param {string[]} urls - Liste d'URLs (du sitemap ou du menu de navigation)
 * @param {number} maxProductPages - Nombre maximum de pages produits (défaut: 5)
 * 
 * Note: Les URLs viennent déjà du sitemap (si disponible) ou du menu de navigation.
 * On filtre juste les pages non pertinentes (profil, panier, etc.) et limite les produits à 5.
 */
function filterAndLimitUrls(urls, maxProductPages = 5) {
  // 1. Filtrer les URLs non pertinentes (profil, panier, etc.)
  const filtered = urls.filter(url => !shouldExcludeUrl(url));
  
  // 2. Séparer les pages produits des autres (pour limiter les produits à 5)
  const productPages = [];
  const otherPages = [];
  
  filtered.forEach(url => {
    if (isProductPage(url)) {
      productPages.push(url);
    } else {
      otherPages.push(url);
    }
  });
  
  // 3. Limiter les pages produits à maxProductPages
  const limitedProductPages = productPages.slice(0, maxProductPages);
  
  // 4. Combiner : d'abord les pages non-produits, puis les produits limités
  const result = [...otherPages, ...limitedProductPages];
  
  return {
    filtered: result,
    excluded: urls.length - filtered.length,
    productPagesExcluded: Math.max(0, productPages.length - maxProductPages),
    productPagesIncluded: limitedProductPages.length
  };
}

/**
 * Crawl une page unique avec retry automatique
 */
async function crawlPage(url, htmlContent = null, retryCount = 0) {
  try {
    let response;
    let $;
    const startTime = Date.now();
    
    if (htmlContent) {
      // Réutilisation du HTML fourni
      $ = cheerio.load(htmlContent);
      response = { headers: {} };
      console.log(`  [CRAWL] Réutilisation HTML pour: ${url}`);
    } else {
      // Nouvelle requête HTTP réelle avec retry
      console.log(`  [CRAWL] Requête HTTP vers: ${url}${retryCount > 0 ? ` (tentative ${retryCount + 1}/${MAX_RETRIES + 1})` : ''}`);
      
      try {
        response = await axios.get(url, {
          timeout: PAGE_TIMEOUT,
          headers: DEFAULT_HEADERS,
          maxRedirects: 10, // Suivre les redirections (augmenté pour Cloudflare)
          validateStatus: (status) => status < 600, // Accepter tous les codes < 600 (y compris 500)
          // Désactiver la vérification SSL pour certains sites problématiques
          httpsAgent: new https.Agent({
            rejectUnauthorized: false
          }),
          // Gérer la compression automatiquement
          decompress: true,
          // Gérer les cookies (important pour Cloudflare)
          withCredentials: false
        });
        
        // Vérifier si la réponse est vide ou si c'est une page de challenge Cloudflare
        const responseData = response.data || '';
        const responseText = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
        
        // Détecter les challenges Cloudflare
        if (responseText.includes('challenges.cloudflare.com') || 
            responseText.includes('cf-browser-verification') ||
            responseText.includes('Just a moment') ||
            responseText.length < 100) {
          console.log(`  [CRAWL] ⚠️  Challenge Cloudflare détecté pour ${url}`);
          // Retry avec un délai plus long pour Cloudflare
          if (retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY * Math.pow(3, retryCount); // Backoff plus agressif pour Cloudflare
            console.log(`  [CRAWL] Retry dans ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return crawlPage(url, null, retryCount + 1);
          }
          // Au lieu de throw, on retourne null (page non crawlé mais pas d'erreur)
          console.log(`  [CRAWL] ⚠️  Cloudflare bloque cette page après ${MAX_RETRIES + 1} tentatives, retour null (non bloquant)`);
          return null;
        }
        
        const loadTime = Date.now() - startTime;
        console.log(`  [CRAWL] ✓ Réponse reçue de ${url} (${response.status}) en ${loadTime}ms, ${(responseText.length || 0)} octets`);
        $ = cheerio.load(responseData);
      } catch (requestError) {
        // Retry automatique pour certaines erreurs
        if (retryCount < MAX_RETRIES) {
          const shouldRetry = 
            requestError.code === 'ETIMEDOUT' || 
            requestError.code === 'ECONNABORTED' ||
            requestError.code === 'ECONNRESET' ||
            requestError.code === 'ECONNREFUSED' ||
            (requestError.response && (
              requestError.response.status === 429 || 
              requestError.response.status === 503 ||
              requestError.response.status === 403 // Cloudflare peut retourner 403
            ));
          
          if (shouldRetry) {
            const delay = RETRY_DELAY * Math.pow(3, retryCount); // Backoff plus agressif (1s, 3s, 9s)
            console.log(`  [CRAWL] ⚠️  Erreur ${requestError.code || requestError.response?.status}, retry dans ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return crawlPage(url, null, retryCount + 1);
          }
        }
        throw requestError; // Relancer l'erreur si pas de retry
      }
    }

    const baseUrl = new URL(url).origin;

    // Extraction des signaux
    const data = {
      url: normalizeUrl(url),
      statusCode: response.status || 200, // ✅ AJOUT: Status code HTTP
      title: $('title').text().trim(),
      metaDescription: $('meta[name="description"]').attr('content') || '',
      metaViewport: $('meta[name="viewport"]').attr('content') || '',
      h1: $('h1').map((i, el) => $(el).text().trim()).get(),
      h2: $('h2').map((i, el) => $(el).text().trim()).get(),
      h3: $('h3').map((i, el) => $(el).text().trim()).get(),
      paragraphs: $('p').map((i, el) => $(el).text().trim()).get(),
      lists: $('ul, ol').map((i, el) => $(el).text().trim()).get(),
      links: {
        internal: [],
        external: [],
        relAttributes: {
          follow: [],
          nofollow: []
        }
      },
      schemaOrg: extractSchemaOrg($),
      canonical: $('link[rel="canonical"]').attr('href') || '',
      robotsMeta: $('meta[name="robots"]').attr('content') || '',
      metaRobots: $('meta[name="robots"]').attr('content') || '', // ✅ AJOUT: Alias pour cohérence
      headers: response.headers || {}, // ✅ AJOUT: Headers HTTP
      images: $('img').map((i, el) => ({
        src: $(el).attr('src') || '',
        alt: $(el).attr('alt') || '',
        hasAlt: !!$(el).attr('alt')
      })).get(),
      openGraph: {
        title: $('meta[property="og:title"]').attr('content') || '',
        description: $('meta[property="og:description"]').attr('content') || '',
        image: $('meta[property="og:image"]').attr('content') || ''
      },
      twitterCard: {
        card: $('meta[name="twitter:card"]').attr('content') || '',
        title: $('meta[name="twitter:title"]').attr('content') || '',
        description: $('meta[name="twitter:description"]').attr('content') || ''
      },
      wordCount: (() => {
        const bodyText = $('body').text();
        if (!bodyText || bodyText.trim().length === 0) {
          console.warn(`[CRAWL] Body vide pour ${url}`);
          return 0;
        }
        const words = bodyText.split(/\s+/).filter(w => w && w.trim().length > 0);
        return words.length;
      })(),
      ctaCount: (() => {
        // Compter les CTA (boutons) : button, input[type="submit"], a avec classes CTA, etc.
        // Exclure les liens du menu (nav, header, footer)
        let ctaCount = 0;
        
        // 1. Boutons <button> (hors menu)
        $('body button:not(nav button):not(header button):not(footer button)').each((i, el) => {
          const text = $(el).text().trim().toLowerCase();
          // Exclure les boutons de menu/navigation
          if (text && !text.match(/^(menu|navigation|nav|☰|≡)$/i)) {
            ctaCount++;
          }
        });
        
        // 2. Input submit (hors formulaires de recherche dans header)
        $('body input[type="submit"]:not(header input):not(nav input)').each(() => {
          ctaCount++;
        });
        
        // 3. Liens avec classes CTA communes (hors menu)
        const ctaClasses = ['cta', 'button', 'btn', 'call-to-action', 'action-button'];
        $('body a:not(nav a):not(header a):not(footer a)').each((i, el) => {
          const classes = $(el).attr('class') || '';
          const id = $(el).attr('id') || '';
          const combined = (classes + ' ' + id).toLowerCase();
          if (ctaClasses.some(ctaClass => combined.includes(ctaClass))) {
            ctaCount++;
          }
        });
        
        return ctaCount;
      })(),
      hiddenContentLength: (() => { // ✅ AJOUT: Contenu caché
        const hiddenSelectors = [
          '[style*="display: none"]',
          '[style*="display:none"]',
          '[style*="visibility: hidden"]',
          '[style*="visibility:hidden"]',
          '.hidden',
          '[hidden]'
        ];
        
        let hiddenWords = 0;
        hiddenSelectors.forEach(selector => {
          $(selector).each((i, el) => {
            const text = $(el).text();
            hiddenWords += text.split(/\s+/).filter(w => w && w.trim().length > 0).length;
          });
        });
        
        return hiddenWords;
      })(),
      timeTags: $('time').map((i, el) => ({ // ✅ AJOUT: Balises time
        datetime: $(el).attr('datetime') || '',
        text: $(el).text().trim()
      })).get(),
      ttfb: response.headers && response.headers['x-response-time'] ? parseFloat(response.headers['x-response-time']) : null,
      html: htmlContent || (response.data || '') // Conserver le HTML pour réutilisation
    };

    // Extraction des liens avec attributs rel
    data.links.relAttributes = {
      follow: [],
      nofollow: []
    };

    // Utiliser des Sets pour éviter les doublons
    const internalLinksSet = new Set();
    const externalLinksSet = new Set();
    const followLinksSet = new Set();
    const nofollowLinksSet = new Set();

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const linkUrl = new URL(href, baseUrl);
        const normalized = normalizeUrl(linkUrl.toString());
        const rel = $(el).attr('rel') || '';
        const isNofollow = rel.toLowerCase().includes('nofollow');
        const anchorText = $(el).text().trim(); // ✅ AJOUT: Texte d'ancrage
        
        if (linkUrl.origin === baseUrl) {
          // Ajouter seulement si pas déjà présent (déduplication)
          if (!internalLinksSet.has(normalized)) {
            internalLinksSet.add(normalized);
            // ✅ MODIFICATION: Stocker comme objet avec anchorText pour rétrocompatibilité
            const linkData = {
              url: normalized,
              anchorText: anchorText,
              rel: rel
            };
            data.links.internal.push(linkData);
          }
          
          if (isNofollow) {
            if (!nofollowLinksSet.has(normalized)) {
              nofollowLinksSet.add(normalized);
              data.links.relAttributes.nofollow.push(normalized);
            }
          } else {
            if (!followLinksSet.has(normalized)) {
              followLinksSet.add(normalized);
              data.links.relAttributes.follow.push(normalized);
            }
          }
        } else {
          // Déduplication des liens externes aussi
          if (!externalLinksSet.has(normalized)) {
            externalLinksSet.add(normalized);
            data.links.external.push(normalized);
          }
        }
      } catch (e) {
        // Lien invalide, ignoré
      }
    });

    // Logs détaillés pour prouver l'extraction
    console.log(`  [CRAWL] Données extraites de ${url}:`);
    console.log(`    - Titre: "${data.title.substring(0, 60)}${data.title.length > 60 ? '...' : ''}"`);
    console.log(`    - Mots: ${data.wordCount}`);
    console.log(`    - H1: ${data.h1.length}, H2: ${data.h2.length}, H3: ${data.h3.length}`);
    console.log(`    - Liens internes: ${data.links.internal.length}, externes: ${data.links.external.length}`);
    console.log(`    - Paragraphes: ${data.paragraphs.length}`);

    return data;
  } catch (error) {
    console.error(`Erreur crawl page ${url}:`, error.message);
    
    // Améliorer les messages d'erreur pour être plus explicites
    if (error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      console.error(`  Status HTTP: ${status} ${statusText}`);
      
      if (status === 429) {
        console.error(`  Le site bloque temporairement les requêtes (rate limiting)`);
      } else if (status === 403) {
        console.error(`  Le site bloque l'accès (forbidden)`);
      } else if (status === 404) {
        console.error(`  La page n'existe pas (not found)`);
      } else if (status >= 500) {
        console.error(`  Erreur serveur du site`);
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error(`  Connexion refusée - le serveur n'est pas accessible`);
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.error(`  Timeout - le serveur ne répond pas dans les temps`);
    } else if (error.code === 'ENOTFOUND') {
      console.error(`  Domaine introuvable - vérifiez l'URL`);
    }
    
    return null;
  }
}

/**
 * Extrait les données Schema.org
 */
function extractSchemaOrg($) {
  const schemas = [];
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const json = JSON.parse($(el).html());
      schemas.push(json);
    } catch (e) {
      // JSON invalide
    }
  });
  return schemas;
}

/**
 * Parse un sitemap.xml et extrait les URLs
 * Gère aussi les sitemaps index (récursif pour le premier sous-sitemap)
 */
async function parseSitemap(sitemapContent, baseUrl) {
  const urls = [];
  
  try {
    // Parser XML avec cheerio
    const $ = cheerio.load(sitemapContent, { xmlMode: true });
    
    // Format sitemap standard : <url><loc>...</loc></url>
    $('url loc').each((i, el) => {
      const url = $(el).text().trim();
      if (url) {
        try {
          const normalized = normalizeUrl(url);
          urls.push(normalized);
        } catch (e) {
          // URL invalide
        }
      }
    });
    
    // Format sitemap index : <sitemap><loc>...</loc></sitemap>
    // Si c'est un sitemap index, on parse le premier sous-sitemap
    const sitemapIndexUrls = [];
    $('sitemap loc').each((i, el) => {
      const sitemapUrl = $(el).text().trim();
      if (sitemapUrl) {
        sitemapIndexUrls.push(sitemapUrl);
      }
    });
    
    // Si on a trouvé un sitemap index, parser le premier sous-sitemap
    if (sitemapIndexUrls.length > 0 && urls.length === 0) {
      try {
        console.log(`[CRAWL] Sitemap index détecté, parsing du premier sous-sitemap: ${sitemapIndexUrls[0]}`);
        const subSitemapResponse = await axios.get(sitemapIndexUrls[0], {
          timeout: PAGE_TIMEOUT,
          headers: DEFAULT_HEADERS,
          maxRedirects: 5
        });
        
        if (subSitemapResponse.status === 200) {
          // Parser récursivement le sous-sitemap
          const subUrls = await parseSitemap(subSitemapResponse.data, baseUrl);
          urls.push(...subUrls);
          console.log(`[CRAWL] ${subUrls.length} URLs extraites du sous-sitemap`);
        }
      } catch (e) {
        console.log(`[CRAWL] Erreur parsing sous-sitemap: ${e.message}`);
      }
    }
    
    console.log(`[CRAWL] Sitemap parsé: ${urls.length} URLs extraites`);
    
  } catch (error) {
    console.log(`[CRAWL] Erreur parsing sitemap: ${error.message}`);
  }
  
  return urls;
}

/**
 * Trouve les pages importantes à crawler en analysant vraiment le HTML
 */
function findImportantPages(baseUrl, $) {
  const pages = new Set();
  
  // 1. D'abord, on récupère les liens de navigation (les plus fiables)
  const navLinks = [];
  $('nav a[href], header a[href], .nav a[href], .navigation a[href], .menu a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        const url = new URL(href, baseUrl);
        if (url.origin === baseUrl) {
          const normalized = normalizeUrl(url.toString());
          if (normalized !== baseUrl && !normalized.endsWith('#') && !normalized.endsWith('/#')) {
            navLinks.push(normalized);
          }
        }
      } catch (e) {}
    }
  });

  // 2. On vérifie aussi les liens dans le footer
  $('footer a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        const url = new URL(href, baseUrl);
        if (url.origin === baseUrl) {
          const normalized = normalizeUrl(url.toString());
          if (normalized !== baseUrl && !normalized.endsWith('#') && !normalized.endsWith('/#')) {
            navLinks.push(normalized);
          }
        }
      } catch (e) {}
    }
  });

  // 3. On vérifie les chemins importants mais seulement s'ils sont mentionnés dans les liens
  const importantPaths = ['/about', '/a-propos', '/qui-sommes-nous', '/blog', '/articles', '/actualites', '/faq', '/questions', '/contact'];
  const foundImportantPaths = [];
  
  navLinks.forEach(link => {
    importantPaths.forEach(path => {
      if (link.includes(path)) {
        foundImportantPaths.push(link);
      }
    });
  });

  // 4. On combine : d'abord les pages importantes trouvées, puis les autres liens de nav
  foundImportantPaths.forEach(url => pages.add(url));
  navLinks.forEach(url => {
    pages.add(url);
  });

  // 5. Si on n'a pas assez de pages, on essaie les chemins standards (mais on les vérifiera après)
  if (pages.size < 5) {
    importantPaths.forEach(path => {
      try {
        const url = new URL(path, baseUrl);
        pages.add(normalizeUrl(url.toString()));
      } catch (e) {}
    });
  }

  return Array.from(pages);
}

/**
 * Crawl principal
 * @param {string} startUrl - URL de départ
 * @param {object} options - Options de crawl
 * @param {number} options.maxPages - Nombre maximum de pages à crawler (défaut: illimité)
 */
async function crawl(startUrl, options = {}) {
  const { maxPages } = options;
  const baseUrl = new URL(startUrl).origin;
  const normalizedStart = normalizeUrl(startUrl);
  const crawled = new Set();
  const pages = [];

  // 1. Crawl de la homepage
  let homepageError = null;
  try {
    const homepage = await crawlPage(normalizedStart);
    if (!homepage) {
      homepageError = new Error('Impossible de crawler la homepage');
    } else {
      pages.push(homepage);
      crawled.add(normalizedStart);
    }
  } catch (error) {
    homepageError = error;
  }
  
  // Si la homepage a échoué, on essaie quand même de crawler via le sitemap ou d'autres pages
  if (homepageError || !pages.find(p => p && p.url === normalizedStart)) {
    console.log(`[CRAWL] ⚠️  Homepage inaccessible, tentative via sitemap ou autres pages...`);
    
    // Essayer de récupérer le sitemap même si la homepage échoue
    try {
      // Essayer plusieurs URLs de sitemap possibles
      const sitemapUrlsToTry = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/wp-sitemap.xml',
        '/sitemaps.xml'
      ];
      
      let sitemapUrls = [];
      let sitemapFound = false;
      
      for (const sitemapPath of sitemapUrlsToTry) {
        try {
          const sitemapUrl = new URL(sitemapPath, baseUrl).toString();
          console.log(`[CRAWL] Tentative sitemap: ${sitemapUrl}`);
          const sitemapResponse = await axios.get(sitemapUrl, { 
            timeout: PAGE_TIMEOUT, 
            headers: DEFAULT_HEADERS,
            validateStatus: (status) => status < 500,
            maxRedirects: 5 // Suivre les redirections
          });
          
          if (sitemapResponse.status === 200) {
            sitemapUrls = await parseSitemap(sitemapResponse.data, baseUrl);
            console.log(`[CRAWL] Sitemap trouvé (${sitemapPath}) avec ${sitemapUrls.length} URLs, crawl en cours...`);
            sitemapFound = true;
            break; // Sitemap trouvé, on arrête
          }
        } catch (e) {
          console.log(`[CRAWL] Sitemap ${sitemapPath} non accessible: ${e.message}`);
          continue; // Essayer le suivant
        }
      }
      
      if (sitemapFound && sitemapUrls.length > 0) {
        try {
          // Essayer de crawler quelques pages du sitemap
          const filtered = filterAndLimitUrls(sitemapUrls, 5);
          console.log(`[CRAWL] URLs filtrées: ${filtered.filtered.length} (sur ${sitemapUrls.length} total)`);
          let crawledFromSitemap = 0;
          let cloudflareDetected = false;
          let errorCount = 0;
          
          const urlsToCrawl = filtered.filtered.slice(0, 5);
          console.log(`[CRAWL] Tentative de crawl de ${urlsToCrawl.length} pages du sitemap...`);
          for (const url of urlsToCrawl) {
          try {
            const page = await crawlPage(url);
            if (page) {
              pages.push(page);
              crawled.add(url);
              crawledFromSitemap++;
            } else {
              // crawlPage retourne null en cas d'erreur, on doit détecter Cloudflare autrement
              errorCount++;
              console.log(`[CRAWL] Page retournée null pour ${url}, vérification Cloudflare...`);
              // On ne peut pas détecter Cloudflare ici car crawlPage ne retourne pas l'erreur
              // Mais on peut utiliser l'heuristique : si toutes les pages retournent null, c'est Cloudflare
            }
            await new Promise(resolve => setTimeout(resolve, MIN_CRAWL_DELAY));
          } catch (e) {
            errorCount++;
            // Détecter si c'est Cloudflare qui bloque
            // Cloudflare peut retourner 403, 500, ou même 503
            if (e.response) {
              const status = e.response.status;
              const headers = e.response.headers || {};
              const data = e.response.data || '';
              const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
              
              // Détection Cloudflare : headers, status, ou contenu
              if (status === 403 || status === 500 || status === 503) {
                // Vérifier les headers Cloudflare (insensible à la casse)
                const serverHeader = (headers['server'] || '').toLowerCase();
                if (headers['cf-ray'] || serverHeader === 'cloudflare' || 
                    headers['cf-cache-status'] || headers['cf-request-id'] ||
                    headers['cf-ray'] || headers['cf-request-id']) {
                  cloudflareDetected = true;
                  console.log(`[CRAWL] 🔒 Cloudflare détecté via headers (status: ${status})`);
                }
                // Vérifier le contenu de la réponse
                if (dataStr.toLowerCase().includes('cloudflare') || 
                    dataStr.toLowerCase().includes('challenge') || 
                    dataStr.toLowerCase().includes('cf-browser-verification') ||
                    dataStr.toLowerCase().includes('just a moment') ||
                    dataStr.length < 200) { // Réponse très courte = souvent Cloudflare
                  cloudflareDetected = true;
                }
                // Si plusieurs pages retournent 500, c'est probablement Cloudflare
                if (errorCount >= 3 && status === 500) {
                  cloudflareDetected = true;
                  console.log(`[CRAWL] 🔒 Cloudflare détecté via heuristique (${errorCount} erreurs 500)`);
                }
              }
            }
            console.log(`[CRAWL] Échec crawl ${url}: ${e.message}`);
          }
        }
        
        if (crawledFromSitemap > 0) {
          console.log(`[CRAWL] ✓ ${crawledFromSitemap} pages crawlé depuis le sitemap malgré l'échec de la homepage`);
          // On continue avec les pages crawlé depuis le sitemap
        } else {
          // Si toutes les pages ont échoué, on continue quand même avec un tableau vide
          // NE JAMAIS THROW - toujours retourner un résultat
          console.log(`[CRAWL] ⚠️  Toutes les pages ont échoué: errorCount=${errorCount}, cloudflareDetected=${cloudflareDetected}`);
          console.log(`[CRAWL] ⚠️  Continuation avec ${pages.length} pages déjà crawlé (peut être vide)`);
          // On continue avec ce qu'on a (peut être vide)
        }
        } catch (loopError) {
          // Si une erreur survient dans la boucle, on continue quand même
          console.log(`[CRAWL] ⚠️  Erreur dans la boucle de crawl (non bloquant): ${loopError.message}`);
          // On continue avec ce qu'on a déjà crawlé
        }
      } else {
        // Aucun sitemap accessible - on continue avec ce qu'on a (peut être vide)
        console.log(`[CRAWL] ⚠️  Aucun sitemap accessible, continuation avec ${pages.length} pages déjà crawlé`);
      }
    } catch (sitemapError) {
      // TOUTES les erreurs sont non bloquantes - on continue avec ce qu'on a
      console.log(`[CRAWL] ⚠️  Erreur sitemap (non bloquant): ${sitemapError.message}`);
      console.log(`[CRAWL] ⚠️  Continuation avec ${pages.length} pages déjà crawlé`);
      // On continue avec ce qu'on a (peut être vide)
    }
  }

  // La homepage a déjà été ajoutée dans le bloc try/catch ci-dessus si elle existe
  // pages.push(homepage) et crawled.add(normalizedStart) sont déjà faits dans le else

  // 2. Vérification du sitemap.xml en premier (plus fiable)
  let sitemapUrls = [];
  let sitemapFound = false;
  
  try {
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    console.log(`[CRAWL] Vérification du sitemap: ${sitemapUrl}`);
    const sitemapResponse = await axios.get(sitemapUrl, { 
      timeout: PAGE_TIMEOUT, 
      headers: DEFAULT_HEADERS 
    });
    
    if (sitemapResponse.status === 200) {
      sitemapFound = true;
      sitemapUrls = await parseSitemap(sitemapResponse.data, baseUrl);
      console.log(`[CRAWL] ✓ Sitemap trouvé avec ${sitemapUrls.length} URLs`);
    }
  } catch (e) {
    console.log(`[CRAWL] Sitemap non disponible, utilisation de la méthode alternative`);
  }
  
  // 3. Détection des pages importantes depuis la homepage (si pas de sitemap ou complément)
  // Récupérer la homepage depuis le tableau pages
  const homepagePage = pages.find(p => p && p.url === normalizedStart);
  const $ = homepagePage && homepagePage.html ? cheerio.load(homepagePage.html) : cheerio.load('');
  const importantPages = findImportantPages(baseUrl, $);
  
  // Prioriser les URLs du sitemap si disponible, sinon utiliser le menu de navigation
  // Le sitemap/menu nous donne déjà toutes les URLs pertinentes, on filtre juste les pages non pertinentes
  let pagesToCrawlInitial = [];
  let filterStats = null;
  
  if (sitemapFound && sitemapUrls.length > 0) {
    // Le sitemap nous donne déjà toutes les URLs pertinentes
    // On filtre juste les pages non pertinentes (profil, panier, etc.) et limite les produits à 5
    filterStats = filterAndLimitUrls(sitemapUrls, 5); // Max 5 pages produits
    pagesToCrawlInitial = filterStats.filtered;
    
    // Appliquer la limite maxPages si définie
    if (maxPages && pagesToCrawlInitial.length > maxPages) {
      pagesToCrawlInitial = pagesToCrawlInitial.slice(0, maxPages);
    }
    
    console.log(`[CRAWL] Sitemap: ${sitemapUrls.length} URLs trouvées`);
    console.log(`[CRAWL]   - URLs exclues (non pertinentes: profil, panier, etc.): ${filterStats.excluded}`);
    console.log(`[CRAWL]   - Pages produits exclues (limite 5): ${filterStats.productPagesExcluded}`);
    console.log(`[CRAWL]   - Pages produits incluses: ${filterStats.productPagesIncluded}`);
    console.log(`[CRAWL] Utilisation de ${pagesToCrawlInitial.length} URLs filtrées${maxPages ? ` (limité à ${maxPages})` : ''}`);
  } else {
    // Pas de sitemap : on utilise les liens du menu de navigation (header/nav)
    // On filtre juste les pages non pertinentes et limite les produits à 5
    filterStats = filterAndLimitUrls(importantPages, 5); // Max 5 pages produits
    pagesToCrawlInitial = filterStats.filtered;
    
    // Appliquer la limite maxPages si définie
    if (maxPages && pagesToCrawlInitial.length > maxPages) {
      pagesToCrawlInitial = pagesToCrawlInitial.slice(0, maxPages);
    }
    
    console.log(`[CRAWL] Menu navigation: ${importantPages.length} URLs trouvées`);
    console.log(`[CRAWL]   - URLs exclues (non pertinentes: profil, panier, etc.): ${filterStats.excluded}`);
    console.log(`[CRAWL]   - Pages produits exclues (limite 5): ${filterStats.productPagesExcluded}`);
    console.log(`[CRAWL]   - Pages produits incluses: ${filterStats.productPagesIncluded}`);
    console.log(`[CRAWL] Utilisation de ${pagesToCrawlInitial.length} pages filtrées${maxPages ? ` (limité à ${maxPages})` : ''}`);
  }

  // 4. Crawl des pages avec vérification réelle
  console.log(`\n[CRAWL] Découverte de ${pagesToCrawlInitial.length} pages potentielles à analyser`);
  console.log(`[CRAWL] URLs à visiter: ${pagesToCrawlInitial.slice(0, 5).join(', ')}${pagesToCrawlInitial.length > 5 ? '...' : ''}\n`);
  
  // Queue de pages à crawler
  const pagesToCrawl = [...pagesToCrawlInitial];
  let pageIndex = 0;
  const excludedPages = {
    duplicate: [],
    insufficientContent: [],
    errors: [],
    noTitle: []
  };
  
  // Crawl itératif : on visite les pages et on ajoute leurs liens internes à la queue
  // Limite de pages si maxPages est défini
  while (pagesToCrawl.length > 0) {
    // Arrêter si on a atteint la limite
    if (maxPages && pages.length >= maxPages) {
      console.log(`[CRAWL] Limite de ${maxPages} pages atteinte, arrêt du crawl`);
      break;
    }
    
    const pageUrl = pagesToCrawl.shift();
    
    if (crawled.has(pageUrl)) {
      excludedPages.duplicate.push(pageUrl);
      console.log(`[CRAWL] Page déjà visitée, ignorée: ${pageUrl}`);
      continue;
    }
    
    pageIndex++;
    console.log(`[CRAWL] [${pageIndex}] Début du crawl de: ${pageUrl}`);
    
    // Délai entre les pages pour ne pas surcharger le serveur
    await new Promise(resolve => setTimeout(resolve, MIN_CRAWL_DELAY));
    
    // Vérification que la page existe vraiment avant de la crawler
    try {
      const pageData = await crawlPage(pageUrl);
      if (!pageData) {
        excludedPages.errors.push({ url: pageUrl, reason: 'pageData null' });
        console.log(`[CRAWL] ✗ Page ${pageIndex} ignorée (pageData null): ${pageUrl}\n`);
        continue;
      }
      
      // Marquer les pages avec des problèmes mais les inclure quand même
      if (!pageData.title || pageData.title.length === 0) {
        pageData.hasIssues = true;
        pageData.issues = pageData.issues || [];
        pageData.issues.push('no_title');
        excludedPages.noTitle.push({ url: pageUrl, wordCount: pageData.wordCount || 0 });
        console.log(`[CRAWL] ⚠️ Page ${pageIndex} sans titre (incluse quand même): ${pageUrl}`);
        console.log(`[CRAWL]   Mots: ${pageData.wordCount || 0}`);
      }
      
      // Pages avec peu de contenu : on les inclut mais on les marque
      if (pageData.wordCount < 30) {
        pageData.hasIssues = true;
        pageData.issues = pageData.issues || [];
        pageData.issues.push('low_content');
        pageData.isLowQuality = true;
        excludedPages.insufficientContent.push({ url: pageUrl, wordCount: pageData.wordCount || 0, title: pageData.title || 'Sans titre' });
        console.log(`[CRAWL] ⚠️ Page ${pageIndex} avec peu de contenu (${pageData.wordCount} mots, incluse quand même): ${pageUrl}`);
      }
      
      // On inclut TOUTES les pages du sitemap, même celles avec des problèmes
      // Cela permet d'avoir un rapport complet et de signaler les problèmes réels
      pages.push(pageData);
      crawled.add(pageUrl);
      if (pageData.hasIssues) {
        console.log(`[CRAWL] ⚠️ Page ${pageIndex} ajoutée avec problèmes: ${pageUrl}`);
        console.log(`[CRAWL]   Problèmes: ${pageData.issues.join(', ')}`);
      } else {
        console.log(`[CRAWL] ✓ Page ${pageIndex} ajoutée avec succès: ${pageUrl}`);
      }
      console.log(`[CRAWL]   Résumé: ${pageData.wordCount} mots, ${pageData.h1?.length || 0} H1, ${pageData.links?.internal?.length || 0} liens internes`);
      
      // Ajouter les liens internes de cette page à la queue
      // Note: On se base principalement sur le sitemap/menu, donc on limite les liens découverts récursivement
      if (pageData.links?.internal) {
        // Helper pour extraire l'URL (gère string ou object)
        const getLinkUrl = (link) => typeof link === 'string' ? link : link.url;
        
        // Filtrer les liens : exclure les pages non pertinentes et déjà visitées
        const filteredLinks = pageData.links.internal
          .map(getLinkUrl)
          .filter(link => {
            // Exclure si déjà visité ou en queue
            if (crawled.has(link) || pagesToCrawl.includes(link)) {
              return false;
            }
            // Exclure les pages non pertinentes
            if (shouldExcludeUrl(link)) {
              return false;
            }
            return true;
          });
        
        // Limiter les pages produits dans les nouveaux liens découverts
        const productLinks = filteredLinks.filter(link => isProductPage(link));
        const otherLinks = filteredLinks.filter(link => !isProductPage(link));
        
        // Compter combien de pages produits on a déjà crawlé
        const existingProductPages = pages.filter(p => isProductPage(p.url)).length;
        const maxProductPages = 5;
        const remainingProductSlots = Math.max(0, maxProductPages - existingProductPages);
        
        // Limiter les pages produits
        const limitedProductLinks = productLinks.slice(0, remainingProductSlots);
        const newLinks = [...otherLinks, ...limitedProductLinks];
        
        if (newLinks.length > 0) {
          pagesToCrawl.push(...newLinks);
          const excludedCount = filteredLinks.length - newLinks.length;
          if (excludedCount > 0) {
            console.log(`[CRAWL]   + ${newLinks.length} nouveaux liens ajoutés (${excludedCount} exclus: non pertinents ou limite produits)`);
          } else {
            console.log(`[CRAWL]   + ${newLinks.length} nouveaux liens ajoutés à la queue`);
          }
        }
      }
      console.log('');
    } catch (error) {
      excludedPages.errors.push({ url: pageUrl, reason: error.message, code: error.code || error.name });
      console.log(`[CRAWL] ✗ Erreur crawl page ${pageIndex} (${pageUrl}): ${error.message}`);
      console.log(`[CRAWL]   Type d'erreur: ${error.code || error.name}\n`);
      // Continue avec la page suivante
    }
  }
  
  // Log des pages exclues
  console.log(`\n[CRAWL] ===== PAGES EXCLUES DU SITEMAP =====`);
  console.log(`[CRAWL] Total URLs sitemap: ${sitemapUrls.length}`);
  console.log(`[CRAWL] Pages crawlé avec succès: ${pages.length}`);
  console.log(`[CRAWL] Pages exclues: ${sitemapUrls.length - pages.length}`);
  console.log(`[CRAWL]   - Doublons: ${excludedPages.duplicate.length}`);
  console.log(`[CRAWL]   - Contenu insuffisant (< 50 mots): ${excludedPages.insufficientContent.length}`);
  console.log(`[CRAWL]   - Pas de titre: ${excludedPages.noTitle.length}`);
  console.log(`[CRAWL]   - Erreurs: ${excludedPages.errors.length}`);
  
  if (excludedPages.insufficientContent.length > 0) {
    console.log(`[CRAWL]   Détail contenu insuffisant:`);
    excludedPages.insufficientContent.slice(0, 5).forEach(p => {
      console.log(`[CRAWL]     - ${p.url}: ${p.wordCount} mots`);
    });
    if (excludedPages.insufficientContent.length > 5) {
      console.log(`[CRAWL]     ... et ${excludedPages.insufficientContent.length - 5} autres`);
    }
  }
  
  if (excludedPages.errors.length > 0) {
    console.log(`[CRAWL]   Détail erreurs:`);
    excludedPages.errors.slice(0, 5).forEach(p => {
      console.log(`[CRAWL]     - ${p.url}: ${p.reason}`);
    });
    if (excludedPages.errors.length > 5) {
      console.log(`[CRAWL]     ... et ${excludedPages.errors.length - 5} autres`);
    }
  }
  console.log(`[CRAWL] ====================================\n`);
  
  // 5. Marquer le sitemap comme existant ou non
  pages.sitemapExists = sitemapFound;
  pages.sitemapUrlsCount = sitemapUrls.length; // Stocker le nombre pour le rapport
  pages.excludedPages = excludedPages; // Stocker les pages exclues pour le rapport
  
  console.log(`\n[CRAWL] ===== RÉSUMÉ FINAL =====`);
  console.log(`[CRAWL] Pages visitées avec succès: ${pages.length}`);
  console.log(`[CRAWL] Sitemap utilisé: ${sitemapFound ? 'Oui' : 'Non'}`);
  if (sitemapFound) {
    console.log(`[CRAWL] URLs trouvées dans le sitemap: ${sitemapUrls.length}`);
  }
  console.log(`[CRAWL] URLs crawlé: ${pages.map(p => p.url).join(', ')}`);
  console.log(`[CRAWL] =========================\n`);

  // 5. Vérification robots.txt avec analyse détaillée
  let robotsAnalysis = {
    present: false,
    accessible: false,
    content: '',
    url: new URL('/robots.txt', baseUrl).toString()
  };
  
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    const robotsResponse = await axios.get(robotsUrl, { 
      timeout: PAGE_TIMEOUT, 
      headers: DEFAULT_HEADERS,
      validateStatus: (status) => status < 500 // Accepte même 404 pour savoir s'il existe
    });
    
    if (robotsResponse.status === 200) {
      robotsAnalysis.present = true;
      robotsAnalysis.accessible = true;
      robotsAnalysis.content = robotsResponse.data;
      pages.robotsContent = robotsResponse.data;
      console.log(`✓ robots.txt trouvé et analysé (${robotsResponse.data.length} caractères)`);
    } else {
      pages.robotsContent = '';
      console.log(`✗ robots.txt non accessible (status: ${robotsResponse.status})`);
    }
  } catch (e) {
    pages.robotsContent = '';
    console.log(`✗ robots.txt non trouvé ou inaccessible: ${e.message}`);
  }
  
  // Stocker l'analyse pour le rapport
  pages.robotsAnalysis = robotsAnalysis;

  // 6. Vérification LLMs.txt
  let llmsTxtPresent = false;
  try {
    const llmsUrl = new URL('/llms.txt', baseUrl).toString();
    const llmsResponse = await axios.get(llmsUrl, {
      timeout: 2000,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: (status) => status < 500
    });
    if (llmsResponse.status === 200) {
      llmsTxtPresent = true;
      console.log(`✓ llms.txt trouvé`);
    }
  } catch (e) {
    // LLMs.txt non présent (normal, optionnel)
  }
  pages.llmsTxtPresent = llmsTxtPresent;

  // Nettoyage : suppression du HTML des pages (non nécessaire pour le scoring)
  // IMPORTANT: Ne pas supprimer le HTML des propriétés spéciales (robotsContent, sitemapExists, robotsAnalysis)
  pages.forEach((page, index) => {
    // Vérifier que c'est bien une page (objet avec url) et pas une propriété du tableau
    if (page && typeof page === 'object' && page.url && page.html) {
      delete page.html;
    }
  });

  // S'assurer que seules les vraies pages sont dans le tableau
  // Les propriétés spéciales sont ajoutées directement au tableau, pas comme objets de page
  const cleanedPages = pages.filter(p => {
    return p && typeof p === 'object' && p.url && typeof p.url === 'string';
  });

  // Réajouter les propriétés spéciales
  cleanedPages.robotsContent = pages.robotsContent;
  cleanedPages.sitemapExists = pages.sitemapExists;
  cleanedPages.robotsAnalysis = pages.robotsAnalysis;

  console.log(`[CRAWL] Nettoyage: ${cleanedPages.length} pages valides conservées`);
  
  return cleanedPages;
}

module.exports = { crawl };

