const axios = require('axios');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (compatible; VisibilityScoreBot/1.0)';

/**
 * Récupère l'âge du domaine en utilisant des APIs gratuites
 * 
 * Méthodes utilisées (par ordre de priorité) :
 * 1. ipwhois.io (gratuit, 10k requêtes/mois)
 * 2. whoisxmlapi.com (gratuit, 500 requêtes/mois, nécessite clé API)
 * 3. Parsing direct des données Whois publiques
 */
async function getDomainAge(domain) {
  try {
    // Nettoyer le domaine (enlever www, http, etc.)
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    // Méthode 1 : ipwhois.io (gratuit, pas besoin de clé API)
    const age1 = await getDomainAgeFromIpWhois(cleanDomain);
    if (age1 && age1.years >= 0) {
      return age1;
    }

    // Méthode 2 : whoisxmlapi.com (gratuit avec clé API, 500 requêtes/mois)
    if (process.env.WHOISXMLAPI_KEY) {
      const age2 = await getDomainAgeFromWhoisXmlApi(cleanDomain);
      if (age2 && age2.years >= 0) {
        return age2;
      }
    }

    // Méthode 3 : Parsing direct Whois (via whois command ou API publique)
    const age3 = await getDomainAgeFromPublicWhois(cleanDomain);
    if (age3 && age3.years >= 0) {
      return age3;
    }

    // Si aucune méthode n'a fonctionné, retourner null
    return null;

  } catch (error) {
    console.error(`[DOMAIN_AGE] Erreur lors de la récupération de l'âge du domaine: ${error.message}`);
    return null;
  }
}

/**
 * Méthode 1 : ipwhois.io (gratuit, 10k requêtes/mois)
 * Note: Cette API ne fournit pas directement l'âge, mais on peut parser les données
 */
async function getDomainAgeFromIpWhois(domain) {
  try {
    // ipwhois.io ne fournit pas directement l'âge du domaine
    // On utilise une alternative : whois.iana.org ou parsing direct
    // Pour l'instant, on essaie une autre méthode
    return null;
  } catch (error) {
    console.log(`[DOMAIN_AGE] ipwhois.io non disponible: ${error.message}`);
    return null;
  }
}

/**
 * Méthode 2 : whoisxmlapi.com (gratuit avec clé API)
 * Documentation: https://whoisxmlapi.com/
 */
async function getDomainAgeFromWhoisXmlApi(domain) {
  try {
    const apiKey = process.env.WHOISXMLAPI_KEY;
    if (!apiKey) {
      return null;
    }

    const url = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${apiKey}&domainName=${domain}&outputFormat=JSON`;
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    if (response.data && response.data.WhoisRecord) {
      const record = response.data.WhoisRecord;
      const createdDate = record.createdDate || record.registryData?.createdDate;
      
      if (createdDate) {
        const created = new Date(createdDate);
        const now = new Date();
        const years = (now - created) / (1000 * 60 * 60 * 24 * 365.25);
        
        return {
          years: Math.floor(years),
          months: Math.floor((years % 1) * 12),
          registrationDate: createdDate,
          source: 'whoisxmlapi'
        };
      }
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.log(`[DOMAIN_AGE] whoisxmlapi.com rate limit atteint`);
    } else {
      console.log(`[DOMAIN_AGE] whoisxmlapi.com non disponible: ${error.message}`);
    }
    return null;
  }
}

/**
 * Méthode 3 : Parsing direct des données Whois publiques
 * Utilise des APIs publiques gratuites qui ne nécessitent pas de clé
 */
async function getDomainAgeFromPublicWhois(domain) {
  try {
    // Option 1 : Utiliser une API publique gratuite
    // Exemple : whois.com (mais nécessite souvent un parsing HTML)
    
    // Option 2 : Utiliser rdap.org (Registration Data Access Protocol)
    // RDAP est un protocole standard pour accéder aux données d'enregistrement
    const rdapUrl = `https://rdap.org/domain/${domain}`;
    
    try {
      const response = await axios.get(rdapUrl, {
        timeout: 8000,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/rdap+json'
        }
      });

      if (response.data && response.data.events) {
        // Chercher l'événement "registration"
        const registrationEvent = response.data.events.find(
          e => e.eventAction === 'registration' || e.eventAction === 'registered'
        );
        
        if (registrationEvent && registrationEvent.eventDate) {
          const created = new Date(registrationEvent.eventDate);
          const now = new Date();
          const years = (now - created) / (1000 * 60 * 60 * 24 * 365.25);
          
          return {
            years: Math.floor(years),
            months: Math.floor((years % 1) * 12),
            registrationDate: registrationEvent.eventDate,
            source: 'rdap'
          };
        }
      }
    } catch (rdapError) {
      // RDAP peut ne pas être disponible pour tous les domaines
      console.log(`[DOMAIN_AGE] RDAP non disponible pour ${domain}: ${rdapError.message}`);
    }

    // Option 3 : Utiliser whois.iana.org pour les TLD
    // Cette méthode est plus complexe et nécessite un parsing spécifique par TLD
    
    return null;
  } catch (error) {
    console.log(`[DOMAIN_AGE] Parsing public Whois non disponible: ${error.message}`);
    return null;
  }
}

/**
 * Calcule un score basé sur l'âge du domaine
 * - ≥ 2 ans : 10/10
 * - 1-2 ans : 7/10
 * - 6-12 mois : 5/10
 * - < 6 mois : 2/10
 * - Inconnu : 0/10
 */
function calculateDomainAgeScore(domainAge) {
  if (!domainAge || domainAge.years === null || domainAge.years === undefined) {
    return 0;
  }

  const years = domainAge.years;
  const months = domainAge.months || 0;
  const totalMonths = years * 12 + months;

  if (totalMonths >= 24) {
    return 10; // ≥ 2 ans
  } else if (totalMonths >= 12) {
    return 7; // 1-2 ans
  } else if (totalMonths >= 6) {
    return 5; // 6-12 mois
  } else if (totalMonths > 0) {
    return 2; // < 6 mois
  } else {
    return 0; // Domaine très récent
  }
}

module.exports = {
  getDomainAge,
  calculateDomainAgeScore
};

