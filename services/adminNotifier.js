const nodemailer = require('nodemailer');
const axios = require('axios');

let transporter = null;

// Initialisation du transporteur email
function initTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = parseInt(process.env.SMTP_PORT || '587');
    const isSecure = port === 465;
    
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: isSecure, // true pour port 465, false pour port 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      // Configuration supplémentaire pour Hostinger
      tls: {
        rejectUnauthorized: false // Permet de contourner les problèmes de certificat SSL
      }
    });
  }

  return transporter;
}

/**
 * Envoie les résultats à l'administrateur
 */
async function send(data) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const webhookUrl = process.env.WEBHOOK_URL;

  const payload = {
    email: data.email,
    url: data.url,
    sector: data.sector,
    offer: data.offer,
    seo: data.seo,
    ia: data.ia,
    orientation: data.orientation,
    timestamp: data.timestamp,
    auditReport: data.auditReport || null
  };

  // Envoi par email si configuré
  if (adminEmail && transporter) {
    try {
      await sendEmail(adminEmail, payload);
    } catch (error) {
      console.error('Erreur envoi email:', error);
    }
  }

  // Envoi par webhook si configuré
  if (webhookUrl) {
    try {
      await axios.post(webhookUrl, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Erreur envoi webhook:', error);
    }
  }
}

/**
 * Envoie un email à l'administrateur
 */
async function sendEmail(to, data) {
  const transporter = initTransporter();
  if (!transporter) {
    throw new Error('Email non configuré');
  }

  const html = generateEmailHTML(data);
  const text = generateEmailText(data);

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: to,
    subject: `Nouvelle analyse Visibility Score - ${data.url}`,
    text: text,
    html: html
  });
}

/**
 * Génère le HTML de l'email
 */
function generateEmailHTML(data) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1A1A1A; color: #FFFFFF; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
        .score-box { background: #FFFFFF; padding: 15px; margin: 10px 0; border-left: 4px solid #C9AD01; }
        .score-value { font-size: 32px; font-weight: bold; color: #C9AD01; }
        .details { margin-top: 20px; }
        .detail-item { padding: 10px; background: #FFFFFF; margin: 5px 0; border-radius: 3px; }
        .label { font-weight: bold; }
        .audit-section { margin-top: 30px; }
        .audit-box { background: #FFFFFF; padding: 20px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #C9AD01; }
        .audit-box h4 { margin-top: 0; color: #1A1A1A; }
        table { font-size: 0.9em; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Nouvelle analyse Visibility Strategy Score</h2>
        </div>
        <div class="content">
          <p><strong>Email utilisateur:</strong> ${data.email}</p>
          <p><strong>URL analysée:</strong> <a href="${data.url}">${data.url}</a></p>
          <p><strong>Secteur:</strong> ${data.sector || 'Non renseigné'}</p>
          <p><strong>Offre:</strong> ${data.offer || 'Non renseigné'}</p>
          <p><strong>Date:</strong> ${new Date(data.timestamp).toLocaleString('fr-FR')}</p>
          
          ${data.seo ? `
            <div class="score-box">
              <div class="label">Score SEO</div>
              <div class="score-value">${data.seo.score}/100</div>
              ${generateDetailsHTML(data.seo.details)}
            </div>
          ` : ''}
          
          ${data.ia ? `
            <div class="score-box">
              <div class="label">Score IA</div>
              <div class="score-value">${data.ia.score}/100</div>
              ${generateDetailsHTML(data.ia.details)}
            </div>
          ` : ''}
          
          ${data.totalScore !== null && data.totalScore !== undefined && data.seo && data.ia ? `
            <div class="score-box" style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); color: #FFFFFF; border-left: 4px solid #FFFFFF;">
              <div class="label" style="color: rgba(255, 255, 255, 0.9);">Score Total de Visibilité</div>
              <div class="score-value" style="color: #FFFFFF;">${data.totalScore}/100</div>
              <div style="margin-top: 10px; font-size: 0.9em; color: rgba(255, 255, 255, 0.9);">
                Contribution SEO: ${Math.round(data.seo.score / 2)}/50 | 
                Contribution IA: ${Math.round(data.ia.score / 2)}/50
              </div>
            </div>
          ` : ''}
          
          <div class="score-box">
            <div class="label">Orientation stratégique</div>
            <div class="score-value">${data.orientation}</div>
          </div>
          
          ${data.auditReport ? `
            <div class="audit-section">
              <h3>📊 Rapport d'audit complet</h3>
              
              <div class="audit-box">
                <h4>🔍 Analyse technique</h4>
                <p><strong>Protocole:</strong> ${data.auditReport.technique.protocol.toUpperCase()}</p>
                <p><strong>Pages analysées:</strong> ${data.auditReport.technique.pagesAnalysees}</p>
                
                <h4>🤖 robots.txt</h4>
                <p><strong>Présent:</strong> ${data.auditReport.technique.robotsTxt.present ? '✅ Oui' : '❌ Non'}</p>
                <p><strong>Accessible:</strong> ${data.auditReport.technique.robotsTxt.accessible ? '✅ Oui' : '❌ Non'}</p>
                <p><strong>Analyse:</strong> ${data.auditReport.technique.robotsTxt.analysis}</p>
                ${data.auditReport.technique.robotsTxt.warnings.length > 0 ? `
                  <div style="background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">
                    <strong>⚠️ Avertissements:</strong>
                    <ul>
                      ${data.auditReport.technique.robotsTxt.warnings.map(w => `<li>${w}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}
                ${data.auditReport.technique.robotsTxt.disallowRules.length > 0 ? `
                  <p><strong>Règles Disallow:</strong> ${data.auditReport.technique.robotsTxt.disallowRules.length}</p>
                ` : ''}
                ${data.auditReport.technique.robotsTxt.sitemapInRobots ? `
                  <p><strong>Sitemap déclaré dans robots.txt:</strong> ${data.auditReport.technique.robotsTxt.sitemapInRobots}</p>
                ` : ''}
              </div>
              
              <div class="audit-box">
                <h4>🗺️ Sitemap</h4>
                <p><strong>Présent:</strong> ${data.auditReport.technique.sitemap.present ? '✅ Oui' : '❌ Non'}</p>
                ${data.auditReport.technique.sitemap.url ? `
                  <p><strong>URL:</strong> <a href="${data.auditReport.technique.sitemap.url}">${data.auditReport.technique.sitemap.url}</a></p>
                ` : ''}
              </div>
              
              <div class="audit-box">
                <h4>📄 Détails des pages analysées</h4>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                  <thead>
                    <tr style="background: #333; color: #fff;">
                      <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">URL</th>
                      <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Mots</th>
                      <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">H1</th>
                      <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Liens int.</th>
                      <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Meta desc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.auditReport.technique.pagesDetails.map((page, i) => `
                      <tr style="background: ${i % 2 === 0 ? '#f9f9f9' : '#fff'};">
                        <td style="padding: 8px; border: 1px solid #ddd; word-break: break-all;">${page.url}</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${page.wordCount}</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${page.h1Count}</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${page.internalLinks}</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${page.hasMetaDescription ? '✅' : '❌'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              
              ${data.auditReport.recommendations.length > 0 ? `
                <div class="audit-box">
                  <h4>💡 Recommandations</h4>
                  ${data.auditReport.recommendations.map(rec => `
                    <div style="margin: 10px 0; padding: 10px; background: ${rec.type === 'critique' ? '#ffebee' : rec.type === 'important' ? '#fff3e0' : '#e8f5e9'}; border-left: 4px solid ${rec.type === 'critique' ? '#f44336' : rec.type === 'important' ? '#ff9800' : '#4caf50'}; border-radius: 4px;">
                      <strong>${rec.title}</strong> (${rec.category})
                      <p style="margin: 5px 0 0 0; font-size: 0.9em;">${rec.description}</p>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          <div class="details">
            <h3>Détails complets (JSON)</h3>
            <pre style="background: #FFFFFF; padding: 15px; border-radius: 3px; overflow-x: auto; max-height: 500px; overflow-y: auto;">${JSON.stringify(data.auditReport || data, null, 2)}</pre>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateDetailsHTML(details) {
  if (!details) return '';
  
  // Mapping des axes vers français
  const seoAxisLabels = {
    crawl: 'Crawl & Accès',
    contenu: 'Optimisation On-Page',
    technique: 'Technique On-page',
    architecture: 'Architecture & Maillage',
    autorite: 'Autorité'
  };
  
  const iaAxisLabels = {
    entite: 'Preuves d\'entité',
    intentions: 'Alignement intentions',
    citabilite: 'Citabilité',
    autoriteExterne: 'Autorité externe',
    iaready: 'IA-ready'
  };
  
  let html = '<div class="details">';
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'object' && value !== null && 'score' in value) {
      const label = seoAxisLabels[key] || iaAxisLabels[key] || key;
      const maxScore = value.maxScore || 20;
      const score = value.score || 0;
      html += `<div class="detail-item"><span class="label">${label}:</span> ${score.toFixed(1)}/${maxScore} points</div>`;
    }
  }
  html += '</div>';
  return html;
}

/**
 * Génère le texte brut de l'email
 */
function generateEmailText(data) {
  let text = `Nouvelle analyse Visibility Strategy Score\n\n`;
  text += `Email utilisateur: ${data.email}\n`;
  text += `URL analysée: ${data.url}\n`;
  text += `Secteur: ${data.sector || 'Non renseigné'}\n`;
  text += `Offre: ${data.offer || 'Non renseigné'}\n`;
  text += `Date: ${new Date(data.timestamp).toLocaleString('fr-FR')}\n\n`;
  
  if (data.seo) {
    text += `Score SEO: ${data.seo.score}/100\n`;
  }
  
  if (data.ia) {
    text += `Score IA: ${data.ia.score}/100\n`;
  }
  
  if (data.totalScore !== null && data.totalScore !== undefined && data.seo && data.ia) {
    text += `Score Total de Visibilité: ${data.totalScore}/100\n`;
    text += `  - Contribution SEO: ${Math.round(data.seo.score / 2)}/50\n`;
    text += `  - Contribution IA: ${Math.round(data.ia.score / 2)}/50\n`;
  }
  
  text += `Orientation: ${data.orientation}\n\n`;
  text += `Détails complets:\n${JSON.stringify(data, null, 2)}\n`;
  
  return text;
}

module.exports = { send };

