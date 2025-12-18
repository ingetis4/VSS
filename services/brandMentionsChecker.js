const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (compatible; VisibilityScoreBot/1.0)';

/**
 * Détecte les mentions de marque en utilisant des techniques gratuites
 * 
 * Méthodes utilisées (par ordre de priorité) :
 * 1. SerpAPI (recommandé, nécessite clé API) - Plus fiable et évite les blocages
 * 2. Google Custom Search API (gratuit, 100 requêtes/jour, nécessite clé API)
 * 3. Recherche Google simple avec patterns (gratuit mais limité)
 * 4. Recherche sur réseaux sociaux (Twitter, LinkedIn) via patterns
 */
async function checkBrandMentions(brandName, domain) {
  const results = {
    totalMentions: 0,
    sources: [],
    methods: []
  };

  try {
    // Extraire le nom de marque du domaine si non fourni
    if (!brandName && domain) {
      brandName = extractBrandFromDomain(domain);
    }

    if (!brandName) {
      return results;
    }

    // Méthode 1 : SerpAPI (si clé API disponible) - PRIORITAIRE
    if (process.env.SERPAPI_KEY) {
      const serpApiResults = await checkBrandMentionsSerpApi(brandName, domain);
      if (serpApiResults.totalMentions > 0) {
        results.totalMentions += serpApiResults.totalMentions;
        results.sources.push(...serpApiResults.sources);
        results.methods.push('serpapi');
        console.log(`[BRAND_MENTIONS] SerpAPI: ${serpApiResults.totalMentions} mentions trouvées`);
        // Si SerpAPI fonctionne, on retourne directement (plus fiable)
        return {
          totalMentions: results.totalMentions,
          sources: [...new Set(results.sources)],
          methods: results.methods
        };
      }
    }

    // Méthode 2 : Google Custom Search API (si clé API disponible)
    if (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY && process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
      const customSearchResults = await checkBrandMentionsGoogleCustomSearch(brandName, domain);
      if (customSearchResults.totalMentions > 0) {
        results.totalMentions += customSearchResults.totalMentions;
        results.sources.push(...customSearchResults.sources);
        results.methods.push('google_custom_search');
        console.log(`[BRAND_MENTIONS] Google Custom Search: ${customSearchResults.totalMentions} mentions trouvées`);
      }
    }

    // Méthode 3 : Recherche Google simple (gratuit mais limité)
    const googleSimpleResults = await checkBrandMentionsGoogleSimple(brandName, domain);
    if (googleSimpleResults.totalMentions > 0) {
      results.totalMentions += googleSimpleResults.totalMentions;
      results.sources.push(...googleSimpleResults.sources);
      results.methods.push('google_simple');
      console.log(`[BRAND_MENTIONS] Google Simple: ${googleSimpleResults.totalMentions} mentions trouvées`);
    }

    // Méthode 4 : Recherche sur réseaux sociaux (via patterns)
    const socialResults = await checkBrandMentionsSocial(brandName, domain);
    if (socialResults.totalMentions > 0) {
      results.totalMentions += socialResults.totalMentions;
      results.sources.push(...socialResults.sources);
      results.methods.push('social');
      console.log(`[BRAND_MENTIONS] Social: ${socialResults.totalMentions} mentions trouvées`);
    }

  } catch (error) {
    console.error(`[BRAND_MENTIONS] Erreur lors de la vérification: ${error.message}`);
  }

  return {
    totalMentions: results.totalMentions,
    sources: [...new Set(results.sources)], // Dédupliquer
    methods: results.methods
  };
}

/**
 * Méthode 1 : SerpAPI (PRIORITAIRE)
 * Documentation: https://serpapi.com/
 * Plus fiable que le scraping direct, évite les blocages Google
 */
async function checkBrandMentionsSerpApi(brandName, domain) {
  const results = {
    totalMentions: 0,
    sources: []
  };

  try {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return results;
    }

    // Recherche : mentions de la marque en excluant le domaine lui-même
    const searchQuery = `"${brandName}" -site:${domain}`;
    const url = `https://serpapi.com/search.json?api_key=${apiKey}&q=${encodeURIComponent(searchQuery)}&num=20&hl=fr&gl=fr`;

    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    if (response.data && response.data.organic_results) {
      results.totalMentions = response.data.organic_results.length;
      results.sources = response.data.organic_results.map(result => {
        try {
          const urlObj = new URL(result.link);
          return urlObj.hostname.replace('www.', '');
        } catch (e) {
          return result.link;
        }
      });
    }

  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        console.log(`[BRAND_MENTIONS] SerpAPI clé API invalide ou non autorisée`);
      } else if (error.response.status === 429) {
        console.log(`[BRAND_MENTIONS] SerpAPI rate limit atteint`);
      } else {
        console.log(`[BRAND_MENTIONS] SerpAPI erreur HTTP ${error.response.status}: ${error.message}`);
      }
    } else {
      console.log(`[BRAND_MENTIONS] SerpAPI non disponible: ${error.message}`);
    }
  }

  return results;
}

/**
 * Méthode 2 : Google Custom Search API
 * Documentation: https://developers.google.com/custom-search/v1/overview
 * Gratuit : 100 requêtes/jour
 */
async function checkBrandMentionsGoogleCustomSearch(brandName, domain) {
  const results = {
    totalMentions: 0,
    sources: []
  };

  try {
    const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const engineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
    
    if (!apiKey || !engineId) {
      return results;
    }

    // Recherche : mentions de la marque en excluant le domaine lui-même
    const searchQuery = `"${brandName}" -site:${domain}`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(searchQuery)}&num=10`;

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    if (response.data && response.data.items) {
      results.totalMentions = response.data.items.length;
      results.sources = response.data.items.map(item => {
        try {
          const urlObj = new URL(item.link);
          return urlObj.hostname.replace('www.', '');
        } catch (e) {
          return item.link;
        }
      });
    }

  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.log(`[BRAND_MENTIONS] Google Custom Search rate limit atteint`);
    } else if (error.response && error.response.status === 403) {
      console.log(`[BRAND_MENTIONS] Google Custom Search API non autorisée`);
    } else {
      console.log(`[BRAND_MENTIONS] Google Custom Search non disponible: ${error.message}`);
    }
  }

  return results;
}

/**
 * Méthode 2 : Recherche Google simple (gratuit mais limité)
 * Note: Google peut bloquer les requêtes automatisées
 */
async function checkBrandMentionsGoogleSimple(brandName, domain) {
  const results = {
    totalMentions: 0,
    sources: []
  };

  try {
    // Recherche : mentions de la marque en excluant le domaine lui-même
    const searchQuery = `"${brandName}" -site:${domain}`;
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=10`;
    
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
      
      // Extraire les domaines des résultats de recherche
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
            
            // Exclure google.com et le domaine cible
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

      results.totalMentions = domains.size;
      results.sources = Array.from(domains);
    }

  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.log(`[BRAND_MENTIONS] Google Simple rate limit atteint`);
    } else if (error.response && error.response.status === 403) {
      console.log(`[BRAND_MENTIONS] Google Simple bloqué`);
    } else {
      console.log(`[BRAND_MENTIONS] Google Simple non disponible: ${error.message}`);
    }
  }

  return results;
}

/**
 * Méthode 3 : Recherche sur réseaux sociaux
 * Note: Les APIs Twitter/LinkedIn sont payantes, on utilise des patterns de recherche
 */
async function checkBrandMentionsSocial(brandName, domain) {
  const results = {
    totalMentions: 0,
    sources: []
  };

  try {
    // Recherche Twitter via Google (gratuit mais limité)
    const twitterQuery = `"${brandName}" site:twitter.com OR site:x.com`;
    const twitterResults = await checkBrandMentionsGoogleSimple(twitterQuery.replace(`"${brandName}"`, brandName), domain);
    
    if (twitterResults.totalMentions > 0) {
      results.totalMentions += twitterResults.totalMentions;
      results.sources.push(...twitterResults.sources.filter(s => s.includes('twitter') || s.includes('x.com')));
    }

    // Recherche LinkedIn via Google
    const linkedInQuery = `"${brandName}" site:linkedin.com`;
    const linkedInResults = await checkBrandMentionsGoogleSimple(linkedInQuery.replace(`"${brandName}"`, brandName), domain);
    
    if (linkedInResults.totalMentions > 0) {
      results.totalMentions += linkedInResults.totalMentions;
      results.sources.push(...linkedInResults.sources.filter(s => s.includes('linkedin')));
    }

  } catch (error) {
    console.log(`[BRAND_MENTIONS] Social non disponible: ${error.message}`);
  }

  return results;
}

/**
 * Extrait le nom de marque du domaine
 * Exemple: "example.com" -> "example"
 */
function extractBrandFromDomain(domain) {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const parts = cleanDomain.split('.');
    return parts[0]; // Prendre la première partie (ex: "example" de "example.com")
  } catch (e) {
    return null;
  }
}

module.exports = {
  checkBrandMentions,
  extractBrandFromDomain
};

