const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (compatible; VisibilityScoreBot/1.0)';

/**
 * Détecte les backlinks en utilisant des techniques gratuites
 */
async function checkBacklinks(targetUrl, targetDomain) {
  const results = {
    referringDomains: new Set(),
    totalBacklinks: 0,
    followLinks: 0,
    nofollowLinks: 0,
    methods: []
  };

  try {
    // Méthode 1 : Recherche Google "link:" (gratuit mais limité)
    const googleResults = await checkGoogleBacklinks(targetUrl, targetDomain);
    if (googleResults.domains.length > 0) {
      googleResults.domains.forEach(domain => results.referringDomains.add(domain));
      results.totalBacklinks += googleResults.count;
      results.methods.push('google_search');
      console.log(`[BACKLINKS] Google Search: ${googleResults.domains.length} domaines trouvés`);
    }

    // Méthode 2 : Vérification via des APIs publiques gratuites (si disponibles)
    // Note: La plupart des APIs de backlinks sont payantes, mais on peut essayer des alternatives
    
    // Méthode 3 : Détection via mentions du domaine dans des sites connus
    const mentionsResults = await checkDomainMentions(targetDomain);
    if (mentionsResults.domains.length > 0) {
      mentionsResults.domains.forEach(domain => results.referringDomains.add(domain));
      results.totalBacklinks += mentionsResults.count;
      results.methods.push('mentions');
      console.log(`[BACKLINKS] Mentions: ${mentionsResults.domains.length} domaines trouvés`);
    }

  } catch (error) {
    console.error(`[BACKLINKS] Erreur lors de la vérification: ${error.message}`);
  }

  return {
    referringDomainsCount: results.referringDomains.size,
    totalBacklinks: results.totalBacklinks,
    referringDomains: Array.from(results.referringDomains),
    methods: results.methods
  };
}

/**
 * Vérifie les backlinks via Google Search (technique "link:")
 * Note: Google limite cette fonctionnalité et peut bloquer les requêtes automatisées
 * Cette méthode est limitée mais peut donner quelques résultats
 */
async function checkGoogleBacklinks(targetUrl, targetDomain) {
  const domains = new Set();
  let count = 0;

  try {
    // Recherche Google avec l'opérateur link:
    const searchQuery = `link:${targetDomain}`;
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=20`;
    
    console.log(`[BACKLINKS] Tentative recherche Google: ${searchQuery}`);
    
    const response = await axios.get(googleSearchUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.google.com/'
      },
      maxRedirects: 5
    });

    if (response.status === 200) {
      const $ = cheerio.load(response.data);
      
      // Extraire les domaines des résultats de recherche
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          try {
            // Google peut rediriger via /url?q=...
            let actualUrl = href;
            if (href.includes('/url?q=')) {
              const urlMatch = href.match(/[?&]q=([^&]+)/);
              if (urlMatch) {
                actualUrl = decodeURIComponent(urlMatch[1]);
              }
            }
            
            const url = new URL(actualUrl);
            const domain = url.hostname.replace('www.', '').toLowerCase();
            const targetDomainClean = targetDomain.replace('www.', '').toLowerCase();
            
            // Exclure google.com et le domaine cible
            if (domain && 
                domain !== 'google.com' && 
                !domain.includes('google.') && 
                domain !== targetDomainClean &&
                !domain.includes('youtube.com') &&
                !domain.includes('facebook.com')) {
              domains.add(domain);
              count++;
            }
          } catch (e) {
            // URL invalide, ignorée
          }
        }
      });

      // Si on n'a pas trouvé de résultats, Google a peut-être bloqué ou il n'y a pas de backlinks
      if (domains.size === 0) {
        console.log(`[BACKLINKS] Aucun backlink détecté via Google (peut être bloqué ou aucun backlink)`);
      }
    }

  } catch (error) {
    // Google bloque souvent les requêtes automatisées, c'est normal
    if (error.response && error.response.status === 429) {
      console.log(`[BACKLINKS] Google a bloqué la requête (rate limit)`);
    } else if (error.response && error.response.status === 403) {
      console.log(`[BACKLINKS] Google a bloqué la requête (forbidden)`);
    } else {
      console.log(`[BACKLINKS] Google Search non disponible: ${error.message}`);
    }
  }

  return { domains: Array.from(domains), count };
}

/**
 * Vérifie les mentions du domaine sur des sites connus (annuaires, etc.)
 */
async function checkDomainMentions(targetDomain) {
  const domains = new Set();
  let count = 0;

  // Liste de sites où on peut chercher des mentions
  const searchSites = [
    // On pourrait chercher sur des annuaires, mais cela nécessiterait des APIs
    // Pour l'instant, on retourne un résultat vide mais la structure est prête
  ];

  // Pour l'instant, on détecte via des signaux indirects :
  // Si le site a des liens vers des annuaires, c'est qu'il y est probablement référencé
  // (mais ce n'est pas une vraie détection de backlinks)

  return { domains: Array.from(domains), count };
}

/**
 * Extrait les attributs rel des liens pour détecter follow/nofollow
 */
function extractLinkAttributes($, baseUrl) {
  const links = {
    follow: [],
    nofollow: [],
    external: []
  };

  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    const rel = $(el).attr('rel') || '';
    const isNofollow = rel.toLowerCase().includes('nofollow');
    
    if (href) {
      try {
        const linkUrl = new URL(href, baseUrl);
        const isExternal = linkUrl.origin !== baseUrl;
        
        if (isNofollow) {
          links.nofollow.push(linkUrl.toString());
        } else {
          links.follow.push(linkUrl.toString());
        }
        
        if (isExternal) {
          links.external.push(linkUrl.toString());
        }
      } catch (e) {}
    }
  });

  return links;
}

module.exports = { 
  checkBacklinks,
  extractLinkAttributes 
};

