const express = require('express');
const router = express.Router();
const axios = require('axios');
const { URL } = require('url');
const crawler = require('../services/crawler');
const seoScorer = require('../services/seoScorer');
const iaScorer = require('../services/iaScorer');
const adminNotifier = require('../services/adminNotifier');
const auditReport = require('../services/auditReport');
const backlinksChecker = require('../services/backlinksChecker');
const domainAgeChecker = require('../services/domainAgeChecker');
const brandMentionsChecker = require('../services/brandMentionsChecker');
const citationsChecker = require('../services/citationsChecker');
const cache = require('../services/cache');
const counter = require('../services/counter');
const analytics = require('../services/analytics');
const learningStorage = require('../services/learningStorage');

/**
 * Extrait le domaine d'une URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
}

/**
 * Valide une URL et vérifie qu'elle est accessible
 */
async function validateUrl(urlString) {
  try {
    // 1. Validation du format URL
    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      return { valid: false, error: 'Format d\'URL invalide' };
    }

    // 2. Vérifier le protocole (http ou https uniquement)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Seules les URLs HTTP et HTTPS sont acceptées' };
    }

    // 3. Vérifier que ce n'est pas localhost ou IP privée (sécurité)
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || 
        hostname.startsWith('10.') || hostname.startsWith('172.16.') || hostname.startsWith('172.17.') ||
        hostname.startsWith('172.18.') || hostname.startsWith('172.19.') || hostname.startsWith('172.20.') ||
        hostname.startsWith('172.21.') || hostname.startsWith('172.22.') || hostname.startsWith('172.23.') ||
        hostname.startsWith('172.24.') || hostname.startsWith('172.25.') || hostname.startsWith('172.26.') ||
        hostname.startsWith('172.27.') || hostname.startsWith('172.28.') || hostname.startsWith('172.29.') ||
        hostname.startsWith('172.30.') || hostname.startsWith('172.31.')) {
      return { valid: false, error: 'Les URLs locales ne sont pas autorisées' };
    }

    // 4. Vérifier que le domaine existe et est accessible (HEAD request rapide)
    // IMPORTANT: Ne jamais bloquer - même si la vérification échoue, on tente l'analyse
    try {
      const response = await axios.head(urlString, {
        timeout: 3000, // Timeout plus court pour ne pas bloquer
        maxRedirects: 3,
        validateStatus: () => true, // Accepter TOUS les codes (même 5xx)
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VisibilityScoreBot/1.0)'
        }
      });
      
      // Tous les codes sont acceptés - le site existe
      return { valid: true };
    } catch (error) {
      // TOUTES les erreurs sont acceptées - on tente l'analyse quand même
      // (peut être un problème temporaire, Cloudflare, etc.)
      return { valid: true, warning: 'Impossible de vérifier l\'accessibilité du site, analyse tentée quand même' };
    }
  } catch (error) {
    return { valid: false, error: 'Erreur lors de la validation de l\'URL' };
  }
}

router.post('/', async (req, res) => {
  try {
    const { url, sector, offer, email, analysis_type } = req.body;

    // Validation de base
    if (!url || !email || !analysis_type) {
      return res.status(400).json({ 
        error: 'URL, email et type d\'analyse requis' 
      });
    }

    // Validation du format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Format d\'email invalide' 
      });
    }

    if (!['seo', 'ia', 'both'].includes(analysis_type)) {
      return res.status(400).json({ 
        error: 'Type d\'analyse invalide (seo, ia, both)' 
      });
    }

    // Ajouter le protocole si manquant (https:// par défaut)
    let urlWithProtocol = url.trim();
    if (!urlWithProtocol.startsWith('http://') && !urlWithProtocol.startsWith('https://')) {
      urlWithProtocol = 'https://' + urlWithProtocol;
      console.log(`[NORMALISATION] Protocole ajouté: ${url} → ${urlWithProtocol}`);
    }

    // Normalisation de l'URL : ne garder que le domaine de base (protocole + hostname)
    let normalizedUrl = urlWithProtocol;
    try {
      const urlObj = new URL(urlWithProtocol);
      normalizedUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      if (normalizedUrl !== urlWithProtocol) {
        console.log(`[NORMALISATION] URL normalisée: ${urlWithProtocol} → ${normalizedUrl}`);
      }
    } catch (error) {
      // Si l'URL est invalide, on la garde telle quelle (sera rejetée par validateUrl)
      console.warn(`[NORMALISATION] Impossible de normaliser l'URL: ${urlWithProtocol}`);
      normalizedUrl = urlWithProtocol; // Utiliser l'URL avec protocole même si la normalisation échoue
    }

    // Validation de l'URL normalisée
    console.log(`[VALIDATION] Validation de l'URL: ${normalizedUrl}`);
    const urlValidation = await validateUrl(normalizedUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({ 
        error: urlValidation.error || 'URL invalide ou inaccessible'
      });
    }
    if (urlValidation.warning) {
      console.log(`[VALIDATION] Avertissement: ${urlValidation.warning}`);
    }

    // Vérifier le cache avant de crawler (avec l'URL normalisée)
    const cachedResult = cache.get(normalizedUrl);
    if (cachedResult) {
      console.log(`[CACHE] Résultat trouvé dans le cache pour: ${normalizedUrl}`);
      // Incrémenter le compteur même pour les résultats en cache
      counter.increment();
      analytics.trackConversion(email, normalizedUrl, analysis_type);
      
      // Sauvegarder aussi les résultats en cache dans APPRENTISSAGE
      try {
        learningStorage.saveResult({
          url: normalizedUrl,
          site: extractDomain(normalizedUrl),
          type: 'unknown',
          pages: cachedResult.crawlData?.pagesDetails || [],
          pagesCount: cachedResult.crawlData?.pagesAnalyzed || 0,
          sitemapUsed: cachedResult.crawlData?.sitemap?.present || false,
          metrics: {}, // Pas de métriques détaillées en cache
          seoScores: cachedResult.seo?.score || null,
          iaScores: cachedResult.ia?.score || null,
          siteType: cachedResult.siteType || null,
          seoDetails: cachedResult.seo?.details || null,
          iaDetails: cachedResult.ia?.details || null,
          userEmail: email,
          sector: sector || null,
          offer: offer || null,
          analysisType: analysis_type,
          orientation: cachedResult.orientation || null
        }, 'user');
      } catch (error) {
        console.error(`[LEARNING] Erreur lors de la sauvegarde (cache): ${error.message}`);
      }
      
      return res.json(cachedResult);
    }

    // Timeout global : 10 minutes (pour permettre un crawl complet avec limite de pages)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: analyse trop longue (limite: 10 minutes)')), 600000);
    });

    const analysisPromise = (async () => {
      // 1. Crawl du site avec logs (limité à 20 pages pour éviter les timeouts)
      // IMPORTANT: Le crawler ne throw JAMAIS - il retourne toujours un tableau (même vide)
      console.log(`[ANALYSE] Début du crawl de ${normalizedUrl}`);
      let pages = [];
      
      try {
        const crawlResult = await crawler.crawl(normalizedUrl, { maxPages: 20 });
        // Le crawler retourne toujours un tableau (même vide)
        pages = Array.isArray(crawlResult) ? crawlResult : [];
        if (pages.length === 0) {
          console.log(`[ANALYSE] ⚠️  Aucune page crawlé, continuation avec métriques vides`);
        }
      } catch (error) {
        // Même si une erreur survient, on continue avec un tableau vide
        console.log(`[ANALYSE] ⚠️  Erreur crawl (non bloquant): ${error.message}`);
        pages = [];
      }
      
      const crawledPagesCount = pages.filter(p => p && typeof p === 'object' && p.url && !p.robotsContent && !p.sitemapExists).length;
      console.log(`[ANALYSE] Crawl terminé: ${crawledPagesCount} pages valides analysées`);
      
      // NE JAMAIS THROW - on continue même avec 0 pages

      // 2. Vérification des backlinks (en parallèle pour ne pas ralentir)
      console.log(`[ANALYSE] Vérification des backlinks...`);
      let backlinksData = null;
      
      try {
        const targetDomain = new URL(normalizedUrl).hostname;
        
        // Vérification asynchrone des backlinks (ne bloque pas l'analyse)
        backlinksData = await Promise.race([
          backlinksChecker.checkBacklinks(url, targetDomain),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout backlinks')), 10000))
        ]).catch(err => {
          console.log(`[ANALYSE] Backlinks non disponibles: ${err.message}`);
          return null;
        });
        
        if (backlinksData) {
          console.log(`[ANALYSE] Backlinks détectés: ${backlinksData.referringDomainsCount} domaines, ${backlinksData.totalBacklinks} liens`);
        } else {
          console.log(`[ANALYSE] Aucun backlink détecté ou vérification échouée`);
        }
      } catch (error) {
        console.log(`[ANALYSE] Erreur vérification backlinks: ${error.message}`);
        console.error(`[ANALYSE] Stack: ${error.stack}`);
        // Ne pas bloquer l'analyse si les backlinks échouent
        backlinksData = null;
      }

      // 2b. Vérification de l'âge du domaine (en parallèle)
      console.log(`[ANALYSE] Vérification de l'âge du domaine...`);
      let domainAgeData = null;
      try {
        const targetDomain = new URL(normalizedUrl).hostname;
        domainAgeData = await Promise.race([
          domainAgeChecker.getDomainAge(targetDomain),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout domain age')), 8000))
        ]).catch(err => {
          console.log(`[ANALYSE] Âge du domaine non disponible: ${err.message}`);
          return null;
        });
        
        if (domainAgeData) {
          console.log(`[ANALYSE] Âge du domaine: ${domainAgeData.years} ans, ${domainAgeData.months} mois`);
        }
      } catch (error) {
        console.log(`[ANALYSE] Erreur vérification âge du domaine: ${error.message}`);
        domainAgeData = null;
      }

      // 2c. Vérification des mentions de marque (en parallèle)
      console.log(`[ANALYSE] Vérification des mentions de marque...`);
      let brandMentionsData = null;
      try {
        const targetDomain = new URL(normalizedUrl).hostname;
        const brandName = brandMentionsChecker.extractBrandFromDomain(targetDomain);
        brandMentionsData = await Promise.race([
          brandMentionsChecker.checkBrandMentions(brandName, targetDomain),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout brand mentions')), 10000))
        ]).catch(err => {
          console.log(`[ANALYSE] Mentions de marque non disponibles: ${err.message}`);
          return null;
        });
        
        if (brandMentionsData) {
          console.log(`[ANALYSE] Mentions de marque: ${brandMentionsData.totalMentions} mentions trouvées`);
        }
      } catch (error) {
        console.log(`[ANALYSE] Erreur vérification mentions de marque: ${error.message}`);
        brandMentionsData = null;
      }

      // 2d. Vérification des citations externes (en parallèle)
      console.log(`[ANALYSE] Vérification des citations externes...`);
      let citationsData = null;
      try {
        const targetDomain = new URL(normalizedUrl).hostname;
        const siteName = citationsChecker.extractSiteNameFromDomain(targetDomain);
        citationsData = await Promise.race([
          citationsChecker.checkCitations(targetDomain, siteName),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout citations')), 10000))
        ]).catch(err => {
          console.log(`[ANALYSE] Citations externes non disponibles: ${err.message}`);
          return null;
        });
        
        if (citationsData) {
          console.log(`[ANALYSE] Citations externes: ${citationsData.totalCitations} citations trouvées`);
        }
      } catch (error) {
        console.log(`[ANALYSE] Erreur vérification citations externes: ${error.message}`);
        citationsData = null;
      }

      // 3. Extraction des métriques (une seule fois, avec toutes les données)
      const metricsExtractor = require('../services/metricsExtractor');
      const { calculateSEOScores, calculateIAScores } = require('../services/newScorer');
      const { detectSiteType } = require('../services/siteTypeDetector');
      const metrics = await metricsExtractor.extractMetrics(pages, normalizedUrl, backlinksData, domainAgeData, brandMentionsData, citationsData);

      // 3.5. Détection du type de site
      const siteTypeDetection = detectSiteType(pages, metrics);
      const siteType = siteTypeDetection.type;
      console.log(`[ANALYSE] Type de site détecté: ${siteType} (confiance: ${siteTypeDetection.confidence}%)`);

      // 4. Calcul des scores selon le type
      let seoResult = null;
      let iaResult = null;

      if (analysis_type === 'seo' || analysis_type === 'both') {
        console.log(`[ANALYSE] Calcul du score SEO...`);
        seoResult = calculateSEOScores(metrics, siteType);
        console.log(`[ANALYSE] Score SEO: ${seoResult.score}/100 (${seoResult.scoreOn10}/10)`);
      }

      if (analysis_type === 'ia' || analysis_type === 'both') {
        console.log(`[ANALYSE] Calcul du score IA...`);
        // Le score IA dépend du score SEO (modèle hiérarchique)
        const seoScoreForIA = seoResult ? seoResult.score : 100; // Si pas de SEO, on prend 100 comme référence
        iaResult = calculateIAScores(metrics, seoScoreForIA, siteType);
        console.log(`[ANALYSE] Score IA: ${iaResult.score}/100 (${iaResult.scoreOn10}/10), Maturité: ${iaResult.maturityOn100}%`);
      }

      // 3. Orientation stratégique (uniquement si les deux analyses ont été demandées)
      // Nouvelle logique basée sur le modèle hiérarchique : IA ≤ SEO toujours
      let orientation = null;
      if (analysis_type === 'both' && seoResult && iaResult) {
        const seoScore = seoResult.score;
        const iaScore = iaResult.score;
        const maturity = iaResult.maturity;
        
        // L'IA ne peut jamais dépasser le SEO (garantie du modèle)
        // On compare directement les scores et la maturité
        
        if (maturity >= 0.7 && seoScore >= 70) {
          // Bon SEO + bonne maturité IA = HYBRIDE
          orientation = 'HYBRIDE';
        } else if (maturity >= 0.5 && seoScore >= 60) {
          // SEO correct + maturité IA correcte = HYBRIDE
          orientation = 'HYBRIDE';
        } else if (seoScore >= 70 && maturity < 0.5) {
          // Bon SEO mais faible maturité IA = SEO
          orientation = 'SEO';
        } else if (seoScore < 50) {
          // Mauvais SEO = SEO (fondations d'abord)
          orientation = 'SEO';
        } else if (maturity >= 0.6 && seoScore >= 50) {
          // SEO moyen mais bonne maturité IA = HYBRIDE
          orientation = 'HYBRIDE';
        } else {
          // Cas intermédiaires
          orientation = 'SEO';
        }
        
        console.log(`[ANALYSE] Orientation calculée: ${orientation} (SEO: ${seoScore}/100, IA: ${iaScore}/100, Maturité: ${Math.round(maturity * 100)}%)`);
      } else if (seoResult) {
        orientation = 'SEO';
      } else if (iaResult) {
        orientation = 'IA';
      }

      // 4. Génération du rapport d'audit complet
      const auditData = {
        url: normalizedUrl,
        pages,
        seo: seoResult,
        ia: iaResult,
        siteType: siteTypeDetection,
        sector: sector || '',
        offer: offer || '',
        email,
        orientation,
        timestamp: new Date().toISOString()
      };
      
      const fullAuditReport = auditReport.generateAuditReport(auditData);
      
      // 5. Envoi à l'administrateur avec le rapport complet
      await adminNotifier.send({
        email,
        url: normalizedUrl,
        sector: sector || '',
        offer: offer || '',
        seo: seoResult,
        ia: iaResult,
        orientation,
        timestamp: new Date().toISOString(),
        auditReport: fullAuditReport
      });

      // Préparer les données concrètes pour l'utilisateur
      // Filtrer uniquement les vraies pages (pas robotsContent, sitemapExists qui sont des propriétés du tableau)
      const validPages = pages.filter(p => {
        if (!p || typeof p !== 'object') return false;
        if (!p.url || typeof p.url !== 'string') return false;
        // Exclure les propriétés ajoutées au tableau (pas des pages)
        if (p === pages.robotsContent || p === pages.sitemapExists || p === pages.robotsAnalysis) return false;
        // Vérifier que c'est bien une page avec des données réelles
        return p.wordCount !== undefined && p.title !== undefined;
      });
      
      console.log(`[ANALYSE] Validation: ${validPages.length} pages valides sur ${pages.length} éléments totaux`);
      
      // Vérification détaillée de chaque page
      validPages.forEach((p, idx) => {
        console.log(`[ANALYSE] Page ${idx + 1}: ${p.url}`);
        console.log(`  - Titre: "${p.title?.substring(0, 50) || 'AUCUN'}"`);
        console.log(`  - Mots: ${p.wordCount || 0} (réel: ${typeof p.wordCount === 'number' ? 'OUI' : 'NON'})`);
        console.log(`  - Liens internes: ${p.links?.internal?.length || 0}`);
        console.log(`  - Liens externes: ${p.links?.external?.length || 0}`);
      });
      
      // Statistiques réelles - uniquement sur les pages réellement crawlé
      const totalWords = validPages.reduce((sum, p) => {
        const words = p.wordCount || 0;
        return sum + words;
      }, 0);
      
      const totalInternalLinks = validPages.reduce((sum, p) => {
        const links = (p.links && p.links.internal) ? p.links.internal.length : 0;
        return sum + links;
      }, 0);
      
      const totalExternalLinks = validPages.reduce((sum, p) => {
        const links = (p.links && p.links.external) ? p.links.external.length : 0;
        return sum + links;
      }, 0);
      
      const pagesWithMetaDesc = validPages.filter(p => {
        return p.metaDescription && typeof p.metaDescription === 'string' && p.metaDescription.trim().length > 0;
      }).length;
      
      const pagesWithSchema = validPages.filter(p => {
        return p.schemaOrg && Array.isArray(p.schemaOrg) && p.schemaOrg.length > 0;
      }).length;
      
      console.log(`[ANALYSE] Statistiques calculées:`);
      console.log(`  - Total mots: ${totalWords}`);
      console.log(`  - Liens internes: ${totalInternalLinks}`);
      console.log(`  - Liens externes: ${totalExternalLinks}`);
      console.log(`  - Pages avec meta desc: ${pagesWithMetaDesc}`);
      console.log(`  - Pages avec schema: ${pagesWithSchema}`);
      
      // Pages analysées avec détails (afficher toutes les pages analysées)
      const pagesAnalyzed = validPages.map(p => {
        // Vérification que les données existent vraiment
        if (!p.url) {
          console.warn(`[ANALYSE] Page sans URL détectée:`, p);
        }
        return {
          url: p.url || 'URL non disponible',
          title: (p.title && p.title.trim()) ? p.title.trim() : 'Sans titre',
          wordCount: p.wordCount || 0,
          h1Count: (p.h1 && Array.isArray(p.h1)) ? p.h1.length : 0
        };
      });
      
      // Validation finale des données avant envoi
      // IMPORTANT: NE JAMAIS THROW - on continue même avec 0 pages valides
      if (validPages.length === 0) {
        console.warn(`[ANALYSE] ⚠️  Aucune page valide trouvée après le crawl, continuation avec métriques vides`);
        // On continue avec des métriques vides - c'est un résultat valide, pas une erreur
      }
      
      // Retourner les infos concrètes pour l'utilisateur (uniquement des données réelles)
      const crawlDataResult = {
        pagesAnalyzed: validPages.length,
        pagesDetails: pagesAnalyzed,
        statistics: {
          totalWords: totalWords,
          totalInternalLinks: totalInternalLinks,
          totalExternalLinks: totalExternalLinks,
          pagesWithMetaDesc: pagesWithMetaDesc,
          pagesWithSchema: pagesWithSchema,
          averageWordsPerPage: validPages.length > 0 ? Math.round(totalWords / validPages.length) : 0
        },
        robotsTxt: {
          present: (pages.robotsAnalysis && pages.robotsAnalysis.present === true) || false,
          accessible: (pages.robotsAnalysis && pages.robotsAnalysis.accessible === true) || false
        },
        sitemap: {
          present: pages.sitemapExists === true || false
        },
        protocol: (() => {
          try {
            return new URL(normalizedUrl).protocol.replace(':', '').toUpperCase();
          } catch (e) {
            return 'UNKNOWN';
          }
        })()
      };
      
      console.log(`[ANALYSE] Données finales à envoyer:`);
      console.log(`  - Pages analysées: ${crawlDataResult.pagesAnalyzed}`);
      console.log(`  - Détails pages: ${crawlDataResult.pagesDetails.length}`);
      console.log(`  - Total mots: ${crawlDataResult.statistics.totalWords}`);
      
      // Pas de score total (supprimé selon demande utilisateur)
      const results = {
        seo: seoResult,
        ia: iaResult,
        siteType: siteTypeDetection,
        orientation,
        crawlData: crawlDataResult
      };

      // Mettre en cache le résultat (avec l'URL normalisée)
      cache.set(normalizedUrl, results);
      
      // Incrémenter le compteur
      counter.increment();
      
      // Tracker la conversion
      analytics.trackConversion(email, normalizedUrl, analysis_type);
      
      // Sauvegarder dans APPRENTISSAGE pour améliorer l'algorithme
      // ⚠️ IMPORTANT: Ne pas bloquer l'analyse si la sauvegarde échoue (Vercel serverless)
      try {
        learningStorage.saveResult({
          url: normalizedUrl,
          site: extractDomain(normalizedUrl),
          type: 'unknown', // Peut être amélioré avec détection automatique
          pages: validPages,
          pagesCount: validPages.length,
          sitemapUsed: pages.sitemapExists === true,
          sitemapUrlsCount: pages.sitemapUrlsCount || 0,
          metrics: metrics,
          seoScores: seoResult?.score || null,
          iaScores: iaResult?.score || null,
          siteType: siteTypeDetection,
          seoDetails: seoResult?.details || null,
          iaDetails: iaResult?.details || null,
          userEmail: email,
          sector: sector || null,
          offer: offer || null,
          analysisType: analysis_type,
          orientation: orientation
        }, 'user');
        console.log(`[LEARNING] Résultat sauvegardé dans APPRENTISSAGE`);
      } catch (error) {
        // Erreur non bloquante : sur Vercel serverless, le système de fichiers est en lecture seule
        console.warn(`[LEARNING] Erreur lors de la sauvegarde (non bloquant): ${error.message}`);
        // Ne pas throw : l'analyse doit continuer même si la sauvegarde échoue
      }
      
      return results;
    })();

    const results = await Promise.race([analysisPromise, timeoutPromise]);

    res.json(results);

  } catch (error) {
    console.error('Erreur lors de l\'analyse:', error);
    
    // Messages d'erreur plus explicites
    let errorMessage = 'Erreur lors de l\'analyse';
    let userMessage = 'Une erreur est survenue lors de l\'analyse de votre site.';
    
    // Utiliser les détails de l'erreur si disponibles
    if (error.details) {
      errorMessage = error.message || 'Erreur lors de l\'analyse';
      userMessage = error.details;
    } else if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
      errorMessage = 'Site temporairement indisponible';
      userMessage = 'Le site que vous essayez d\'analyser bloque temporairement les requêtes (rate limiting). Veuillez réessayer dans quelques minutes ou contactez-nous si le problème persiste.';
    } else if (error.message.includes('Impossible de crawler') || error.message.includes('Impossible d\'accéder')) {
      errorMessage = error.message.includes('temporairement indisponible') ? 'Site temporairement indisponible' :
                     error.message.includes('Accès refusé') ? 'Accès refusé' :
                     error.message.includes('Page introuvable') ? 'Page introuvable' :
                     error.message.includes('Erreur serveur') ? 'Erreur serveur' :
                     error.message.includes('Connexion refusée') ? 'Connexion refusée' :
                     error.message.includes('Timeout') ? 'Timeout' :
                     error.message.includes('Domaine introuvable') ? 'Domaine introuvable' :
                     'Impossible d\'accéder au site';
      userMessage = error.message.includes('temporairement indisponible') ? 'Le site bloque temporairement les requêtes (rate limiting). Veuillez réessayer dans quelques minutes.' :
                    error.message.includes('Accès refusé') ? 'Le site bloque l\'accès aux robots. Vérifiez que l\'URL est correcte et accessible.' :
                    error.message.includes('Page introuvable') ? 'La page demandée n\'existe pas. Vérifiez que l\'URL est correcte.' :
                    error.message.includes('Erreur serveur') ? 'Le serveur du site rencontre une erreur. Réessayez plus tard.' :
                    error.message.includes('Connexion refusée') ? 'Le serveur n\'est pas accessible. Vérifiez que l\'URL est correcte et que le site est en ligne.' :
                    error.message.includes('Timeout') ? 'Le serveur ne répond pas dans les temps. Le site est peut-être trop lent ou surchargé.' :
                    error.message.includes('Domaine introuvable') ? 'Le domaine n\'existe pas. Vérifiez que l\'URL est correcte.' :
                    'Impossible d\'accéder au site web. Vérifiez que l\'URL est correcte et que le site est accessible.';
    } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      errorMessage = 'Analyse trop longue';
      userMessage = 'L\'analyse prend trop de temps. Le site est peut-être trop volumineux ou trop lent. Veuillez réessayer plus tard.';
    } else if (error.message) {
      userMessage = `Erreur: ${error.message}`;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      message: userMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;

