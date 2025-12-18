const nodemailer = require('nodemailer');
const pdfGenerator = require('./pdfGenerator');
const fs = require('fs');
require('dotenv').config();

let transporter = null;

function initTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = parseInt(process.env.SMTP_PORT || '587');
    const isSecure = port === 465;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: isSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
}

async function send(data) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const transporter = initTransporter();

  if (!adminEmail || !transporter) {
    console.warn('Email non configuré pour la confirmation de rendez-vous');
    return;
  }

  let pdfPath = null;

  try {
    // Générer le PDF avec toutes les données
    console.log('[APPOINTMENT] Génération du PDF...');
    pdfPath = await pdfGenerator.generatePDF(data);
    console.log(`[APPOINTMENT] PDF généré: ${pdfPath}`);

    const html = generateEmailHTML(data);
    const text = generateEmailText(data);

    // Préparer les pièces jointes
    const attachments = [];
    if (pdfPath && fs.existsSync(pdfPath)) {
      attachments.push({
        filename: `audit-${data.email.replace('@', '-at-')}-${Date.now()}.pdf`,
        path: pdfPath
      });
    }

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: adminEmail,
      subject: `🎯 Rendez-vous confirmé - ${data.email} - ${data.url}`,
      text: text,
      html: html,
      attachments: attachments
    });

    console.log(`[APPOINTMENT] Email de confirmation envoyé pour ${data.email} avec PDF`);
  } catch (error) {
    console.error('[APPOINTMENT] Erreur envoi email:', error);
    throw error;
  } finally {
    // Supprimer le fichier PDF temporaire après envoi
    if (pdfPath) {
      setTimeout(() => {
        pdfGenerator.deletePDF(pdfPath);
      }, 5000); // Attendre 5 secondes pour que l'email soit envoyé
    }
  }
}

function generateEmailHTML(data) {
  const { email, url, sector, offer, analysis_type, timestamp } = data;
  
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Rendez-vous confirmé</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          font-size: 16px;
          line-height: 1.6;
          color: #0F172A;
          background-color: #F8FAFC;
        }
        .email-container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #FFFFFF;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }
        .email-header {
          background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
          color: #FFFFFF;
          padding: 40px 30px;
          text-align: center;
        }
        .email-header h1 {
          margin: 0 0 12px 0;
          font-size: 2rem;
          font-weight: 700;
        }
        .email-header p {
          margin: 0;
          font-size: 1rem;
          opacity: 0.95;
        }
        .email-content {
          padding: 40px 30px;
        }
        .info-card {
          background: #F8FAFC;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 16px;
          border: 2px solid #E2E8F0;
        }
        .info-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #94A3B8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .info-value {
          font-size: 1rem;
          font-weight: 700;
          color: #0F172A;
          word-break: break-word;
        }
        .info-value a {
          color: #3B82F6;
          text-decoration: none;
        }
        .pdf-notice {
          background: #E0F2FE;
          border-left: 4px solid #3B82F6;
          padding: 16px 20px;
          margin-top: 24px;
          border-radius: 8px;
        }
        .pdf-notice strong {
          color: #3B82F6;
        }
        @media only screen and (max-width: 600px) {
          .email-container {
            border-radius: 0;
            max-width: 100%;
          }
          .email-header {
            padding: 32px 20px;
          }
          .email-content {
            padding: 28px 20px;
          }
        }
      </style>
    </head>
    <body>
      <div style="padding: 20px 0; background-color: #F8FAFC;">
        <div class="email-container">
          <div class="email-header">
            <h1>🎯 Rendez-vous confirmé</h1>
            <p>Un nouveau client a réservé un audit gratuit</p>
          </div>
          
          <div class="email-content">
            <h2 style="margin-top: 0; margin-bottom: 24px; font-size: 1.5rem; color: #0F172A;">👤 Informations du client</h2>
            
            <div class="info-card">
              <div class="info-label">📧 Email client</div>
              <div class="info-value"><a href="mailto:${email}">${email}</a></div>
            </div>
            
            <div class="info-card">
              <div class="info-label">🌐 Site web analysé</div>
              <div class="info-value"><a href="${url}" target="_blank">${url}</a></div>
            </div>
            
            <div class="info-card">
              <div class="info-label">🏢 Secteur d'activité</div>
              <div class="info-value">${sector || 'Non renseigné'}</div>
            </div>
            
            <div class="info-card">
              <div class="info-label">💼 Offre principale</div>
              <div class="info-value">${offer || 'Non renseigné'}</div>
            </div>
            
            <div class="info-card">
              <div class="info-label">🔍 Type d'analyse</div>
              <div class="info-value">${analysis_type === 'both' ? 'SEO + IA' : analysis_type === 'seo' ? 'SEO uniquement' : 'IA uniquement'}</div>
            </div>
            
            <div class="info-card">
              <div class="info-label">📅 Date de l'analyse</div>
              <div class="info-value">${new Date(timestamp).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</div>
            </div>
            
            <div class="pdf-notice">
              <strong>📎 Rapport complet en pièce jointe</strong><br>
              Toutes les données du crawler, les scores détaillés et les statistiques sont disponibles dans le PDF joint à cet email.
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateEmailText(data) {
  const { email, url, sector, offer, analysis_type, timestamp } = data;
  
  let text = `🎯 Rendez-vous confirmé !\n\n`;
  text += `Un nouveau client a réservé un audit gratuit\n\n`;
  text += `Informations du client:\n`;
  text += `- Email: ${email}\n`;
  text += `- Site web: ${url}\n`;
  text += `- Secteur: ${sector || 'Non renseigné'}\n`;
  text += `- Offre: ${offer || 'Non renseigné'}\n`;
  text += `- Type d'analyse: ${analysis_type === 'both' ? 'SEO + IA' : analysis_type === 'seo' ? 'SEO uniquement' : 'IA uniquement'}\n`;
  text += `- Date: ${new Date(timestamp).toLocaleString('fr-FR')}\n\n`;
  
  text += `Le rapport complet de l'audit est joint à cet email en format PDF.`;
  
  return text;
}

module.exports = { send };
