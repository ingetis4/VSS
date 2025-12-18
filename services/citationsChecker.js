const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (compatible; VisibilityScoreBot/1.0)';

/**
 * Détecte les citations externes du site (mentions dans d'autres sources)
 * 
 * Méthodes utilisées (par ordre de priorité) :
 * 1. SerpAPI (recommandé, nécessite clé API) - Plus fiable et évite les blocages
 * 2. Google Custom Search API (gratuit, 100 requêtes/jour, nécessite clé API)
 * 3. Recherche Google simple avec patterns (gratuit mais limité)
 * 4. Recherche sur sites de référence (Wikipedia, annuaires, etc.)
 */
async function checkCitations(domain, siteName = null) {
  const results = {
    totalCitations: 0,
    sources: [],
    methods: []
  };

  try {
    // Extraire le nom du site si non fourni
    if (!siteName && domain) {
      siteName = extractSiteNameFromDomain(domain);
    }

    // Méthode 1 : SerpAPI (si clé API disponible) - PRIORITAIRE
    if (process.env.SERPAPI_KEY) {
      const serpApiResults = await checkCitationsSerpApi(domain, siteName);
      if (serpApiResults.totalCitations > 0) {
        results.totalCitations += serpApiResults.totalCitations;
        results.sources.push(...serpApiResults.sources);
        results.methods.push('serpapi');
        console.log(`[CITATIONS] SerpAPI: ${serpApiResults.totalCitations} citations trouvées`);
        // Si SerpAPI fonctionne, on retourne directement (plus fiable)
        return {
          totalCitations: results.totalCitations,
          sources: [...new Set(results.sources)],
          methods: results.methods
        };
      }
    }

    // Méthode 2 : Google Custom Search API (si clé API disponible)
    if (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY && process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
      const customSearchResults = await checkCitationsGoogleCustomSearch(domain, siteName);
      if (customSearchResults.totalCitations > 0) {
        results.totalCitations += customSearchResults.totalCitations;
        results.sources.push(...customSearchResults.sources);
        results.methods.push('google_custom_search');
        console.log(`[CITATIONS] Google Custom Search: ${customSearchResults.totalCitations} citations trouvées`);
      }
    }

    // Méthode 3 : Recherche Google simple (gratuit mais limité)
    const googleSimpleResults = await checkCitationsGoogleSimple(domain, siteName);
    if (googleSimpleResults.totalCitations > 0) {
      results.totalCitations += googleSimpleResults.totalCitations;
      results.sources.push(...googleSimpleResults.sources);
      results.methods.push('google_simple');
      console.log(`[CITATIONS] Google Simple: ${googleSimpleResults.totalCitations} citations trouvées`);
    }

    // Méthode 4 : Recherche sur sites de référence
    const referenceResults = await checkCitationsReferenceSites(domain, siteName);
    if (referenceResults.totalCitations > 0) {
      results.totalCitations += referenceResults.totalCitations;
      results.sources.push(...referenceResults.sources);
      results.methods.push('reference_sites');
      console.log(`[CITATIONS] Sites de référence: ${referenceResults.totalCitations} citations trouvées`);
    }

  } catch (error) {
    console.error(`[CITATIONS] Erreur lors de la vérification: ${error.message}`);
  }

  return {
    totalCitations: results.totalCitations,
    sources: [...new Set(results.sources)], // Dédupliquer
    methods: results.methods
  };
}

/**
 * Méthode 1 : SerpAPI (PRIORITAIRE)
 * Documentation: https://serpapi.com/
 * Plus fiable que le scraping direct, évite les blocages Google
 */
async function checkCitationsSerpApi(domain, siteName) {
  const results = {
    totalCitations: 0,
    sources: []
  };

  try {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return results;
    }

    // Recherche sur sites de référence : Wikipedia, Crunchbase, LinkedIn
    const searchQueries = [
      `"${siteName}" site:wikipedia.org -site:${domain}`,
      `"${siteName}" site:crunchbase.com -site:${domain}`,
      `"${siteName}" site:linkedin.com -site:${domain}`
    ];

    for (const query of searchQueries) {
      try {
        const url = `https://serpapi.com/search.json?api_key=${apiKey}&q=${encodeURIComponent(query)}&num=10&hl=fr&gl=fr`;
        
        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': USER_AGENT
          }
        });

        if (response.data && response.data.organic_results) {
          results.totalCitations += response.data.organic_results.length;
          response.data.organic_results.forEach(result => {
            try {
              const urlObj = new URL(result.link);
              results.sources.push(urlObj.hostname.replace('www.', ''));
            } catch (e) {
              results.sources.push(result.link);
            }
          });
        }
      } catch (error) {
        // Continuer avec la requête suivante en cas d'erreur
        if (error.response && error.response.status === 429) {
          console.log(`[CITATIONS] SerpAPI rate limit atteint pour: ${query}`);
          break; // Arrêter si rate limit
        }
      }
    }

  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        console.log(`[CITATIONS] SerpAPI clé API invalide ou non autorisée`);
      } else if (error.response.status === 429) {
        console.log(`[CITATIONS] SerpAPI rate limit atteint`);
      } else {
        console.log(`[CITATIONS] SerpAPI erreur HTTP ${error.response.status}: ${error.message}`);
      }
    } else {
      console.log(`[CITATIONS] SerpAPI non disponible: ${error.message}`);
    }
  }

  return results;
}

/**
 * Méthode 2 : Google Custom Search API
 */
async function checkCitationsGoogleCustomSearch(domain, siteName) {
  const results = {
    totalCitations: 0,
    sources: []
  };

  try {
    const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const engineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
    
    if (!apiKey || !engineId) {
      return results;
    }

    // Recherche : citations du site en excluant le domaine lui-même
    // On cherche sur des sites de référence : Wikipedia, annuaires, blogs, etc.
    const searchQueries = [
      `"${siteName}" site:wikipedia.org -site:${domain}`,
      `"${siteName}" site:crunchbase.com -site:${domain}`,
      `"${siteName}" site:linkedin.com -site:${domain}`
    ];

    for (const query of searchQueries) {
      try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(query)}&num=10`;
        
        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': USER_AGENT
          }
        });

        if (response.data && response.data.items) {
          results.totalCitations += response.data.items.length;
          response.data.items.forEach(item => {
            try {
              const urlObj = new URL(item.link);
              results.sources.push(urlObj.hostname.replace('www.', ''));
            } catch (e) {
              results.sources.push(item.link);
            }
          });
        }
      } catch (error) {
        // Continuer avec la requête suivante en cas d'erreur
        if (error.response && error.response.status === 429) {
          console.log(`[CITATIONS] Google Custom Search rate limit atteint pour: ${query}`);
          break; // Arrêter si rate limit
        }
      }
    }

  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.log(`[CITATIONS] Google Custom Search rate limit atteint`);
    } else if (error.response && error.response.status === 403) {
      console.log(`[CITATIONS] Google Custom Search API non autorisée`);
    } else {
      console.log(`[CITATIONS] Google Custom Search non disponible: ${error.message}`);
    }
  }

  return results;
}

/**
 * Méthode 2 : Recherche Google simple (gratuit mais limité)
 */
async function checkCitationsGoogleSimple(domain, siteName) {
  const results = {
    totalCitations: 0,
    sources: []
  };

  try {
    // Recherche sur Wikipedia
    const wikipediaQuery = `"${siteName}" site:wikipedia.org -site:${domain}`;
    const wikipediaResults = await performGoogleSimpleSearch(wikipediaQuery, domain);
    results.totalCitations += wikipediaResults.count;
    results.sources.push(...wikipediaResults.sources);

    // Recherche sur Crunchbase (pour les entreprises)
    const crunchbaseQuery = `"${siteName}" site:crunchbase.com -site:${domain}`;
    const crunchbaseResults = await performGoogleSimpleSearch(crunchbaseQuery, domain);
    results.totalCitations += crunchbaseResults.count;
    results.sources.push(...crunchbaseResults.sources);

  } catch (error) {
    console.log(`[CITATIONS] Google Simple non disponible: ${error.message}`);
  }

  return results;
}

/**
 * Méthode 3 : Recherche sur sites de référence
 */
async function checkCitationsReferenceSites(domain, siteName) {
  const results = {
    totalCitations: 0,
    sources: []
  };

  try {
    // Liste de sites de référence où on peut chercher des citations
    const referenceSites = [
      'wikipedia.org',
      'crunchbase.com',
      'linkedin.com',
      'github.com',
      'producthunt.com'
    ];

    for (const site of referenceSites) {
      try {
        const query = `"${siteName}" site:${site} -site:${domain}`;
        const siteResults = await performGoogleSimpleSearch(query, domain);
        results.totalCitations += siteResults.count;
        results.sources.push(...siteResults.sources);
      } catch (error) {
        // Continuer avec le site suivant
      }
    }

  } catch (error) {
    console.log(`[CITATIONS] Sites de référence non disponibles: ${error.message}`);
  }

  return results;
}

/**
 * Effectue une recherche Google simple et retourne les résultats
 */
async function performGoogleSimpleSearch(query, domain) {
  const results = {
    count: 0,
    sources: []
  };

  try {
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
    
    const response = await axios.get(googleSearchUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.google.com/'
      },
      maxRedirects: 5
    });

    if (response.status === 200) {
      const $ = cheerio.load(response.data);
      const domains = new Set();
      
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          try {
            let actualUrl = href;
            if (href.includes('/url?q=')) {
              const urlMatch = href.match(/[?&]q=([^&]+)/);
              if (urlMatch) {
                actualUrl = decodeURIComponent(urlMatch[1]);
              }
            }
            
            const url = new URL(actualUrl);
            const hostname = url.hostname.replace('www.', '').toLowerCase();
            const domainClean = domain.replace('www.', '').toLowerCase();
            
            if (hostname && 
                hostname !== 'google.com' && 
                !hostname.includes('google.') && 
                hostname !== domainClean) {
              domains.add(hostname);
            }
          } catch (e) {
            // URL invalide, ignorée
          }
        }
      });

      results.count = domains.size;
      results.sources = Array.from(domains);
    }

  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.log(`[CITATIONS] Google Simple rate limit atteint`);
    } else if (error.response && error.response.status === 403) {
      console.log(`[CITATIONS] Google Simple bloqué`);
    }
  }

  return results;
}

/**
 * Extrait le nom du site du domaine
 */
function extractSiteNameFromDomain(domain) {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const parts = cleanDomain.split('.');
    return parts[0]; // Prendre la première partie
  } catch (e) {
    return null;
  }
}

module.exports = {
  checkCitations,
  extractSiteNameFromDomain
};

