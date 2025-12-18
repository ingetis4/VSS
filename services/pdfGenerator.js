const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Couleurs de la charte graphique
const COLORS = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  secondary: '#0F172A',
  text: '#475569',
  textLight: '#64748B',
  textLighter: '#94A3B8',
  background: '#F8FAFC',
  border: '#E2E8F0',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444'
};

/**
 * Génère un PDF élégant avec toutes les données du crawler
 */
function generatePDF(data) {
  const { email, url, sector, offer, results, analysis_type, timestamp } = data;
  
  // Créer un document PDF
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 60, left: 50, right: 50 }
  });
  
  // Créer un fichier temporaire
  const tempDir = os.tmpdir();
  const filename = `audit-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;
  const filepath = path.join(tempDir, filename);
  
  // Pipe vers le fichier
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);
  
  // Fonction helper pour dessiner une ligne de séparation
  const drawSeparator = (y, color = COLORS.border) => {
    doc.strokeColor(color)
       .lineWidth(1)
       .moveTo(50, y)
       .lineTo(545, y)
       .stroke();
  };
  
  // Fonction helper pour dessiner un encadré
  const drawBox = (x, y, width, height, fillColor, strokeColor) => {
    doc.rect(x, y, width, height)
       .fillColor(fillColor)
       .fill()
       .strokeColor(strokeColor)
       .lineWidth(1)
       .stroke();
  };
  
  // Fonction helper pour dessiner un badge de score
  const drawScoreBadge = (x, y, score, label, size = 80) => {
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    
    // Cercle de fond
    doc.circle(centerX, centerY, size / 2)
       .fillColor(COLORS.primary)
       .fill();
    
    // Score en grand (centré)
    doc.fontSize(28)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text(score.toString(), x, centerY - 20, { align: 'center', width: size });
    
    // "/100"
    doc.fontSize(12)
       .fillColor('#FFFFFF')
       .opacity(0.9)
       .font('Helvetica')
       .text('/100', x, centerY + 5, { align: 'center', width: size });
    
    // Label
    doc.fontSize(10)
       .fillColor(COLORS.text)
       .opacity(1)
       .font('Helvetica-Bold')
       .text(label, x, y + size + 8, { align: 'center', width: size });
  };
  
  // === PAGE DE GARDE ===
  // Fond avec dégradé simulé (rectangles)
  doc.rect(0, 0, 595, 842)
     .fillColor(COLORS.background)
     .fill();
  
  // En-tête avec bande bleue
  doc.rect(0, 0, 595, 120)
     .fillColor(COLORS.primary)
     .fill();
  
  // Logo/Titre principal
  doc.fontSize(32)
     .fillColor('#FFFFFF')
     .font('Helvetica-Bold')
     .text('Visibility Strategy Score', 50, 40, { align: 'left' });
  
  doc.fontSize(16)
     .fillColor('#FFFFFF')
     .opacity(0.9)
     .font('Helvetica')
     .text('Rapport d\'Audit Complet', 50, 75, { align: 'left' });
  
  // Date
  doc.fontSize(10)
     .fillColor('#FFFFFF')
     .opacity(0.8)
     .text(`Généré le ${new Date(timestamp).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}`, 50, 100, { align: 'left' });
  
  // Contenu principal
  let currentY = 180;
  
  // === INFORMATIONS CLIENT ===
  doc.fontSize(20)
     .fillColor(COLORS.secondary)
     .font('Helvetica-Bold')
     .text('Informations Client', 50, currentY);
  
  currentY += 35;
  
  // Encadré pour les infos client
  const infoBoxHeight = 140;
  drawBox(50, currentY, 495, infoBoxHeight, '#FFFFFF', COLORS.border);
  
  const infoStartY = currentY + 15;
  let infoY = infoStartY;
  
    doc.fontSize(11)
     .fillColor(COLORS.text)
     .font('Helvetica-Bold')
     .text('Email:', 60, infoY);
  doc.font('Helvetica')
     .fillColor(COLORS.textLight)
     .text(email, 130, infoY);
  
  infoY += 20;
  doc.font('Helvetica-Bold')
     .fillColor(COLORS.text)
     .text('Site web:', 60, infoY);
  doc.font('Helvetica')
     .fillColor(COLORS.primary)
     .text(url, 130, infoY);
  
  infoY += 20;
  doc.font('Helvetica-Bold')
     .fillColor(COLORS.text)
     .text('Secteur:', 60, infoY);
  doc.font('Helvetica')
     .fillColor(COLORS.textLight)
     .text(sector || 'Non renseigné', 130, infoY);
  
  infoY += 20;
  doc.font('Helvetica-Bold')
     .fillColor(COLORS.text)
     .text('Offre:', 60, infoY);
  doc.font('Helvetica')
     .fillColor(COLORS.textLight)
     .text(offer || 'Non renseigné', 130, infoY);
  
  infoY += 20;
  doc.font('Helvetica-Bold')
     .fillColor(COLORS.text)
     .text('Type d\'analyse:', 60, infoY);
  doc.font('Helvetica')
     .fillColor(COLORS.textLight)
     .text(analysis_type === 'both' ? 'SEO + IA' : analysis_type === 'seo' ? 'SEO uniquement' : 'IA uniquement', 200, infoY);
  
  currentY += infoBoxHeight + 25;
  
  // === SCORES ===
  if (results && (results.seo || results.ia)) {
    doc.fontSize(20)
       .fillColor(COLORS.secondary)
       .font('Helvetica-Bold')
       .text('Scores de Visibilite', 50, currentY);
    
    currentY += 35;
    
    // Badges de scores côte à côte
    if (results.seo && results.ia) {
      // Deux scores
      drawScoreBadge(120, currentY, results.seo.score, 'Potentiel SEO', 90);
      drawScoreBadge(360, currentY, results.ia.score, 'Potentiel IA', 90);
      currentY += 120;
    } else if (results.seo) {
      // Un seul score SEO
      drawScoreBadge(250, currentY, results.seo.score, 'Potentiel SEO', 90);
      currentY += 120;
    } else if (results.ia) {
      // Un seul score IA
      drawScoreBadge(250, currentY, results.ia.score, 'Potentiel IA', 90);
      currentY += 120;
    }
    
    // Score total de visibilité (si les deux scores sont présents)
    if (results.seo && results.ia && results.totalScore !== null && results.totalScore !== undefined) {
      currentY += 20;
      const seoContribution = Math.round(results.seo.score / 2);
      const iaContribution = Math.round(results.ia.score / 2);
      
      // Encadré pour le score total
      drawBox(50, currentY, 495, 100, '#3B82F6', '#2563EB');
      
      doc.fontSize(18)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text('Score Total de Visibilité', 60, currentY + 15);
      
      doc.fontSize(36)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text(`${results.totalScore}/100`, 60, currentY + 40);
      
      doc.fontSize(10)
         .fillColor('rgba(255, 255, 255, 0.9)')
         .font('Helvetica')
         .text(`Contribution SEO: ${seoContribution}/50`, 60, currentY + 75);
      
      doc.fontSize(10)
         .fillColor('rgba(255, 255, 255, 0.9)')
         .font('Helvetica')
         .text(`Contribution IA: ${iaContribution}/50`, 200, currentY + 75);
      
      currentY += 120;
    }
    
    // Détails par axe
    if (results.seo && results.seo.details) {
      currentY += 10;
      doc.fontSize(14)
         .fillColor(COLORS.secondary)
         .font('Helvetica-Bold')
         .text('Détails SEO par axe', 50, currentY);
      
      currentY += 20;
      
      // Encadré pour les détails SEO
      const seoDetailsHeight = Object.keys(results.seo.details).length * 25 + 20;
      drawBox(50, currentY, 495, seoDetailsHeight, '#FFFFFF', COLORS.border);
      
      // Mapping des axes SEO vers français
      const seoAxisLabels = {
        crawl: 'Crawl & Accès',
        contenu: 'Optimisation On-Page',
        technique: 'Technique On-page',
        architecture: 'Architecture & Maillage',
        autorite: 'Autorité'
      };
      
      let detailY = currentY + 15;
      Object.entries(results.seo.details).forEach(([key, value]) => {
        const label = seoAxisLabels[key] || key;
        const maxScore = value.maxScore || 20;
        const score = value.score || 0;
        
        doc.fontSize(10)
           .fillColor(COLORS.text)
           .font('Helvetica-Bold')
           .text(label, 60, detailY);
        
        // Barre de progression
        const barWidth = 300;
        const barHeight = 8;
        const barX = 200;
        const barY = detailY + 2;
        const progress = score / maxScore;
        
        // Fond de la barre
        doc.rect(barX, barY, barWidth, barHeight)
           .fillColor(COLORS.border)
           .fill();
        
        // Barre de progression
        doc.rect(barX, barY, barWidth * progress, barHeight)
           .fillColor(COLORS.primary)
           .fill();
        
        // Score
        doc.fontSize(10)
           .fillColor(COLORS.primary)
           .font('Helvetica-Bold')
           .text(`${score.toFixed(1)}/${maxScore} pts`, barX + barWidth + 10, detailY);
        
        detailY += 25;
      });
      
      currentY += seoDetailsHeight + 20;
    }
    
    if (results.ia && results.ia.details) {
      if (currentY > 700) {
        doc.addPage();
        currentY = 60;
      }
      
      doc.fontSize(14)
         .fillColor(COLORS.secondary)
         .font('Helvetica-Bold')
         .text('Détails IA par axe', 50, currentY);
      
      currentY += 20;
      
      // Encadré pour les détails IA
      const iaDetailsHeight = Object.keys(results.ia.details).length * 25 + 20;
      drawBox(50, currentY, 495, iaDetailsHeight, '#FFFFFF', COLORS.border);
      
      // Mapping des axes IA vers français
      const iaAxisLabels = {
        entite: 'Preuves d\'entité',
        intentions: 'Alignement intentions',
        citabilite: 'Citabilité',
        autoriteExterne: 'Autorité externe',
        iaready: 'IA-ready'
      };
      
      let detailY = currentY + 15;
      Object.entries(results.ia.details).forEach(([key, value]) => {
        const label = iaAxisLabels[key] || key;
        const maxScore = value.maxScore || 20;
        const score = value.score || 0;
        
        doc.fontSize(10)
           .fillColor(COLORS.text)
           .font('Helvetica-Bold')
           .text(label, 60, detailY);
        
        // Barre de progression
        const barWidth = 300;
        const barHeight = 8;
        const barX = 200;
        const barY = detailY + 2;
        const progress = score / maxScore;
        
        // Fond de la barre
        doc.rect(barX, barY, barWidth, barHeight)
           .fillColor(COLORS.border)
           .fill();
        
        // Barre de progression
        doc.rect(barX, barY, barWidth * progress, barHeight)
           .fillColor(COLORS.primary)
           .fill();
        
        // Score
        doc.fontSize(10)
           .fillColor(COLORS.primary)
           .font('Helvetica-Bold')
           .text(`${score.toFixed(1)}/${maxScore} pts`, barX + barWidth + 10, detailY);
        
        detailY += 25;
      });
      
      currentY += iaDetailsHeight + 20;
    }
    
    // Orientation stratégique
    if (results.orientation) {
      if (currentY > 700) {
        doc.addPage();
        currentY = 60;
      }
      
      currentY += 10;
      doc.fontSize(14)
         .fillColor(COLORS.secondary)
         .font('Helvetica-Bold')
         .text('Orientation Strategique', 50, currentY);
      
      currentY += 25;
      
      // Badge d'orientation
      const orientationWidth = 200;
      const orientationHeight = 50;
      const orientationX = (595 - orientationWidth) / 2;
      
      doc.rect(orientationX, currentY, orientationWidth, orientationHeight)
         .fillColor(COLORS.primary)
         .fill();
      
      doc.fontSize(18)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text(results.orientation, orientationX, currentY + 15, { align: 'center', width: orientationWidth });
      
      currentY += orientationHeight + 30;
    }
  }
  
  // === DONNÉES DU CRAWLER ===
  if (results && results.crawlData) {
    if (currentY > 650) {
      doc.addPage();
      currentY = 60;
    }
    
    drawSeparator(currentY);
    currentY += 20;
    
    doc.fontSize(20)
       .fillColor(COLORS.secondary)
       .font('Helvetica-Bold')
       .text('Donnees du Crawler', 50, currentY);
    
    currentY += 30;
    
    const crawlData = results.crawlData;
    
    // Statistiques principales dans des encadrés
    if (crawlData.statistics) {
      const statsBoxHeight = 120;
      drawBox(50, currentY, 495, statsBoxHeight, '#FFFFFF', COLORS.border);
      
      const statsStartY = currentY + 15;
      let statsY = statsStartY;
      
      // Colonne gauche
      doc.fontSize(11)
         .fillColor(COLORS.text)
         .font('Helvetica-Bold')
         .text('Pages analysées:', 60, statsY);
      doc.font('Helvetica')
         .fillColor(COLORS.primary)
         .fontSize(16)
         .text((crawlData.pagesAnalyzed || 0).toString(), 60, statsY + 15);
      
      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor(COLORS.text)
         .text('Mots au total:', 60, statsY + 45);
      doc.font('Helvetica')
         .fillColor(COLORS.textLight)
         .text((crawlData.statistics.totalWords || 0).toLocaleString('fr-FR'), 60, statsY + 60);
      
      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor(COLORS.text)
         .text('Mots/page (moy.):', 60, statsY + 85);
      doc.font('Helvetica')
         .fillColor(COLORS.textLight)
         .text((crawlData.statistics.averageWordsPerPage || 0).toString(), 60, statsY + 100);
      
      // Colonne droite
      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor(COLORS.text)
         .text('Liens internes:', 300, statsY);
      doc.font('Helvetica')
         .fillColor(COLORS.textLight)
         .text((crawlData.statistics.totalInternalLinks || 0).toString(), 300, statsY + 15);
      
      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor(COLORS.text)
         .text('Liens externes:', 300, statsY + 45);
      doc.font('Helvetica')
         .fillColor(COLORS.textLight)
         .text((crawlData.statistics.totalExternalLinks || 0).toString(), 300, statsY + 60);
      
      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor(COLORS.text)
         .text('Pages avec meta desc:', 300, statsY + 85);
      doc.font('Helvetica')
         .fillColor(COLORS.textLight)
         .text(`${crawlData.statistics.pagesWithMetaDesc || 0}/${crawlData.pagesAnalyzed || 0}`, 300, statsY + 100);
      
      currentY += statsBoxHeight + 20;
    }
    
    // Informations techniques
    if (currentY > 700) {
      doc.addPage();
      currentY = 60;
    }
    
    doc.fontSize(14)
       .fillColor(COLORS.secondary)
       .font('Helvetica-Bold')
       .text('Informations Techniques', 50, currentY);
    
    currentY += 25;
    
    const techBoxHeight = 100;
    drawBox(50, currentY, 495, techBoxHeight, '#FFFFFF', COLORS.border);
    
    const techStartY = currentY + 15;
    let techY = techStartY;
    
    // Protocole
    doc.fontSize(10)
       .fillColor(COLORS.text)
       .font('Helvetica-Bold')
       .text('Protocole:', 60, techY);
    doc.font('Helvetica')
       .fillColor(crawlData.protocol === 'HTTPS' ? COLORS.success : COLORS.error)
       .text(crawlData.protocol || 'UNKNOWN', 120, techY);
    
    // Robots.txt
    techY += 20;
    doc.font('Helvetica-Bold')
       .fillColor(COLORS.text)
       .text('robots.txt:', 60, techY);
    doc.font('Helvetica')
       .fillColor(crawlData.robotsTxt?.present ? COLORS.success : COLORS.error)
       .text(crawlData.robotsTxt?.present ? 'Présent' : 'Absent', 120, techY);
    
    // Sitemap
    techY += 20;
    doc.font('Helvetica-Bold')
       .fillColor(COLORS.text)
       .text('sitemap.xml:', 60, techY);
    doc.font('Helvetica')
       .fillColor(crawlData.sitemap?.present ? COLORS.success : COLORS.error)
       .text(crawlData.sitemap?.present ? 'Présent' : 'Absent', 120, techY);
    
    // Schema.org
    techY += 20;
    doc.font('Helvetica-Bold')
       .fillColor(COLORS.text)
       .text('Schema.org:', 60, techY);
    doc.font('Helvetica')
       .fillColor((crawlData.statistics?.pagesWithSchema || 0) > 0 ? COLORS.success : COLORS.error)
       .text((crawlData.statistics?.pagesWithSchema || 0) > 0 ? `${crawlData.statistics.pagesWithSchema} page(s)` : 'Aucune', 120, techY);
    
    currentY += techBoxHeight + 25;
    
    // Pages analysées en détail
    if (crawlData.pagesDetails && crawlData.pagesDetails.length > 0) {
      if (currentY > 650) {
        doc.addPage();
        currentY = 60;
      }
      
      doc.fontSize(16)
         .fillColor(COLORS.secondary)
         .font('Helvetica-Bold')
         .text('Pages Analysees en Detail', 50, currentY);
      
      currentY += 25;
      
      // Tableau des pages
      const headerY = currentY;
      drawBox(50, headerY, 495, 25, COLORS.primary, COLORS.primary);
      
      doc.fontSize(9)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text('URL', 55, headerY + 8);
      doc.text('Titre', 200, headerY + 8);
      doc.text('Mots', 400, headerY + 8);
      doc.text('H1', 450, headerY + 8);
      
      currentY += 30;
      
      // Pages (limitées à 30 pour ne pas surcharger)
      const pagesToShow = crawlData.pagesDetails.slice(0, 30);
      pagesToShow.forEach((page, index) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = 60;
          
          // Réafficher l'en-tête du tableau
          drawBox(50, currentY, 495, 25, COLORS.primary, COLORS.primary);
          doc.fontSize(9)
             .fillColor('#FFFFFF')
             .font('Helvetica-Bold')
             .text('URL', 55, currentY + 8);
          doc.text('Titre', 200, currentY + 8);
          doc.text('Mots', 400, currentY + 8);
          doc.text('H1', 450, currentY + 8);
          currentY += 30;
        }
        
        // Ligne du tableau
        const rowColor = index % 2 === 0 ? '#FFFFFF' : COLORS.background;
        drawBox(50, currentY, 495, 20, rowColor, COLORS.border);
        
        // URL (tronquée si trop longue)
        const urlText = page.url.length > 45 ? page.url.substring(0, 42) + '...' : page.url;
        doc.fontSize(8)
           .fillColor(COLORS.primary)
           .font('Helvetica')
           .text(urlText, 55, currentY + 6, { width: 140 });
        
        // Titre (tronqué si trop long)
        const titleText = (page.title || 'Sans titre').length > 25 ? (page.title || 'Sans titre').substring(0, 22) + '...' : (page.title || 'Sans titre');
        doc.fontSize(8)
           .fillColor(COLORS.text)
           .text(titleText, 200, currentY + 6, { width: 195 });
        
        // Mots
        doc.fontSize(8)
           .fillColor(COLORS.textLight)
           .text((page.wordCount || 0).toString(), 400, currentY + 6);
        
        // H1
        doc.fontSize(8)
           .fillColor(COLORS.textLight)
           .text((page.h1Count || 0).toString(), 450, currentY + 6);
        
        currentY += 23;
      });
      
      if (crawlData.pagesAnalyzed > 30) {
        currentY += 5;
        doc.fontSize(9)
           .fillColor(COLORS.textLighter)
           .font('Helvetica-Oblique')
           .text(`+ ${crawlData.pagesAnalyzed - 30} autre(s) page(s) analysée(s)`, 50, currentY, { align: 'center', width: 495 });
      }
    }
  }
  
  // === PIED DE PAGE ===
  // Ajouter le footer à chaque page (sauf la première qui sera ajoutée manuellement)
  let isFirstPage = true;
  
  doc.on('pageAdded', () => {
    if (!isFirstPage) {
      const footerY = 800;
      drawSeparator(footerY, COLORS.border);
      doc.fontSize(8)
         .fillColor(COLORS.textLighter)
         .font('Helvetica')
         .text(
           `Rapport généré le ${new Date(timestamp).toLocaleString('fr-FR')} | Visibility Strategy Score`,
           50,
           footerY + 10,
           { align: 'center', width: 495 }
         );
    }
    isFirstPage = false;
  });
  
  // Ajouter le footer à la première page manuellement
  const footerY = 800;
  drawSeparator(footerY, COLORS.border);
  doc.fontSize(8)
     .fillColor(COLORS.textLighter)
     .font('Helvetica')
     .text(
       `Rapport généré le ${new Date(timestamp).toLocaleString('fr-FR')} | Visibility Strategy Score`,
       50,
       footerY + 10,
       { align: 'center', width: 495 }
     );
  
  // Finaliser le PDF
  doc.end();
  
  // Retourner une promesse qui se résout avec le chemin du fichier
  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      resolve(filepath);
    });
    
    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Supprime le fichier PDF temporaire
 */
function deletePDF(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (error) {
    console.error(`[PDF] Erreur suppression fichier ${filepath}:`, error);
  }
}

module.exports = {
  generatePDF,
  deletePDF
};
