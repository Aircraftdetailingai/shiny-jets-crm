/**
 * Email Templates for Vector
 * Clean, professional HTML email templates
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vectorav.ai';
const BRAND_COLOR = '#0D1B2A';
const GOLD_COLOR = '#C9A84C';
const SUCCESS_COLOR = '#C9A84C';
const WARNING_COLOR = '#d97706';
const INFO_COLOR = '#1e3a5f';

/**
 * Map a font name to its closest web-safe email font stack
 */
function getEmailFontStack(fontName) {
  if (!fontName) return null;
  const name = fontName.toLowerCase();
  // Web-safe fonts — use directly
  if (/^(georgia|times new roman|arial|helvetica|verdana|trebuchet|courier|tahoma)/.test(name)) {
    return `'${fontName}', sans-serif`;
  }
  // Serif fonts
  if (/playfair|merriweather|lora|crimson|libre baskerville|cormorant|eb garamond|bitter|noto serif|source serif|dm serif/i.test(name)) {
    return `Georgia, 'Times New Roman', serif`;
  }
  // Sans-serif (default)
  return `'Helvetica Neue', Arial, sans-serif`;
}

/**
 * Base email wrapper with detailer branding header and subtle Vector footer
 */
function emailWrapper(content, { headerBg = BRAND_COLOR, headerText = '', companyName = '', unsubscribeEmail = '', accentColor = '', logoUrl = '', fontHeading = '', fontBody = '' } = {}) {
  const accent = accentColor || GOLD_COLOR;
  const unsubscribeHtml = unsubscribeEmail
    ? `<a href="mailto:${unsubscribeEmail}?subject=Unsubscribe" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>`
    : `<a href="mailto:support@vectorav.ai?subject=Unsubscribe" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>`;

  const brandName = logoUrl
    ? `<img src="${logoUrl}" alt="${companyName || 'Logo'}" height="40" style="max-height: 40px; max-width: 200px; object-fit: contain;" />`
    : companyName
      ? `<span style="color: #ffffff; font-size: 30px; font-weight: 800; letter-spacing: -0.5px;">${companyName}</span>`
      : `<span style="color: #ffffff; font-size: 30px; font-weight: 800; letter-spacing: -0.5px;">Vector</span>`;

  const bodyFontStack = getEmailFontStack(fontBody) || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const headingFontStack = getEmailFontStack(fontHeading) || bodyFontStack;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerText}</title>
</head>
<body style="font-family: ${bodyFontStack}; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f0ee;">
  <div style="background: linear-gradient(135deg, ${headerBg} 0%, #0a1520 100%); padding: 36px 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <div style="margin-bottom: 10px;">
      ${brandName}
    </div>
    <h1 style="font-family: ${headingFontStack}; color: ${accent}; margin: 0; font-size: 18px; font-weight: 400; letter-spacing: 0.3px;">${headerText}</h1>
  </div>
  <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    ${content}
  </div>
  <div style="text-align: center; padding: 16px 20px; color: #b0b8c4; font-size: 11px;">
    <p style="margin: 0;">Powered by <a href="https://vectorav.ai" style="color: #b0b8c4; text-decoration: none;">Vector Aviation</a></p>
    <p style="margin: 6px 0 0 0;">${unsubscribeHtml}</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format currency using detailer's currency setting
 */
function formatCurrency(amount, currency = 'USD') {
  const localeMap = {
    USD: 'en-US', CAD: 'en-CA', EUR: 'de-DE', GBP: 'en-GB', AUD: 'en-AU',
    NZD: 'en-NZ', CHF: 'de-CH', JPY: 'ja-JP', SGD: 'en-SG', HKD: 'en-HK',
    MXN: 'es-MX', BRL: 'pt-BR', INR: 'en-IN', AED: 'ar-AE', ZAR: 'en-ZA',
    SEK: 'sv-SE', NOK: 'nb-NO', DKK: 'da-DK', PLN: 'pl-PL', CZK: 'cs-CZ',
  };
  const locale = localeMap[currency] || 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

/**
 * Format services list
 */
function formatServices(services) {
  if (!services) return [];
  const labels = {
    exterior: 'Exterior Wash & Detail',
    interior: 'Interior Detail',
    brightwork: 'Brightwork Polish',
    ceramic: 'Ceramic Coating',
    engine: 'Engine Detail',
  };
  return Object.entries(services)
    .filter(([key, value]) => value === true)
    .map(([key]) => labels[key] || key);
}

/**
 * Format line items for email display
 */
function formatLineItems(lineItems) {
  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) return [];
  return lineItems.filter(item => item.description && item.amount > 0);
}

/**
 * QUOTE SENT - Email to customer when detailer sends quote
 * Professional, compelling template with detailer branding
 * Supports language (en/es/fr/pt/de/it/nl/ja/zh) and detailer currency
 */
export function quoteSentTemplate({ quote, detailer, language }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, services, line_items, valid_until, notes, discount_percent, addon_fees, addon_total, airport, minimum_fee_applied, tail_number } = quote;
  const aircraftBase = aircraft_model || aircraft_type || 'Aircraft';
  const aircraftDisplay = tail_number ? `${aircraftBase} (${tail_number})` : aircraftBase;
  const currency = detailer?.preferred_currency || 'USD';
  const amount = formatCurrency(total_price, currency);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const detailerPhone = detailer?.phone || '';
  const detailerEmail = detailer?.email || '';
  const detailerName = detailer?.name || '';
  const lang = language || 'en';
  const firstName = client_name ? client_name.split(' ')[0] : '';
  // When minimum fee applies, hide individual line item prices (they don't sum to total)
  // Show service names only so customer sees ONE clear price
  const lineItems = minimum_fee_applied ? [] : formatLineItems(line_items);
  const serviceNames = minimum_fee_applied && line_items ? line_items.map(i => i.description).filter(Boolean) : [];
  const servicesList = lineItems.length > 0 ? [] : formatServices(services || serviceNames);
  const localeMap = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', pt: 'pt-BR', de: 'de-DE', it: 'it-IT', nl: 'nl-NL', ja: 'ja-JP', zh: 'zh-CN' };
  const dateLocale = localeMap[lang] || 'en-US';
  const validDate = valid_until ? new Date(valid_until).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const discountPct = parseFloat(discount_percent) || 0;

  // i18n labels
  const i18n = {
    en: {
      greeting: 'Hi', greatNews: 'Great news! Your quote for', detailingReady: 'detailing is ready.',
      quoteSummary: 'Quote Summary', aircraftLabel: 'Aircraft', airportLabel: 'Airport',
      servicesLabel: 'Services', validUntilLabel: 'Valid Until', totalLabel: 'Total',
      noteLabel: 'Note from', ctaButton: 'View Quote &amp; Book Now',
      urgency: 'Book now to secure your spot',
      questionsLine: 'Questions? Reply to this email or call',
      thanksLine: 'Thanks for choosing', signoff: 'Best regards,',
      subject: ', your quote from', subjectSuffix: 'is ready',
      altSubject: 'Quote for your', header: 'Your Quote is Ready',
      previewText: 'Your aircraft detailing quote is ready - view details and book now.',
      discountLabel: 'Package Discount',
    },
    es: {
      greeting: 'Hola', greatNews: 'Tu cotizacion para el detallado de', detailingReady: 'esta lista.',
      quoteSummary: 'Resumen de Cotizacion', aircraftLabel: 'Aeronave', airportLabel: 'Aeropuerto',
      servicesLabel: 'Servicios', validUntilLabel: 'Valido Hasta', totalLabel: 'Total',
      noteLabel: 'Nota de', ctaButton: 'Ver Cotizacion y Reservar',
      urgency: 'Reserva ahora para asegurar tu lugar',
      questionsLine: 'Preguntas? Responde a este correo o llama al',
      thanksLine: 'Gracias por elegir', signoff: 'Saludos cordiales,',
      subject: ', tu cotizacion de', subjectSuffix: 'esta lista',
      altSubject: 'Cotizacion para tu', header: 'Tu Cotizacion Esta Lista',
      previewText: 'Tu cotizacion de detallado esta lista - revisa los detalles y reserva.',
      discountLabel: 'Descuento por Paquete',
    },
    fr: {
      greeting: 'Bonjour', greatNews: 'Bonne nouvelle ! Votre devis pour le nettoyage de', detailingReady: 'est pret.',
      quoteSummary: 'Resume du Devis', aircraftLabel: 'Aeronef', airportLabel: 'Aeroport',
      servicesLabel: 'Services', validUntilLabel: 'Valide Jusqu\'au', totalLabel: 'Total',
      noteLabel: 'Note de', ctaButton: 'Voir le Devis et Reserver',
      urgency: 'Reservez maintenant pour garantir votre place',
      questionsLine: 'Des questions ? Repondez a cet e-mail ou appelez le',
      thanksLine: 'Merci d\'avoir choisi', signoff: 'Cordialement,',
      subject: ', votre devis de', subjectSuffix: 'est pret',
      altSubject: 'Devis pour votre', header: 'Votre Devis est Pret',
      previewText: 'Votre devis est pret - consultez les details et reservez.',
      discountLabel: 'Remise Forfait',
    },
    pt: {
      greeting: 'Ola', greatNews: 'Otima noticia! Seu orcamento para detalhamento de', detailingReady: 'esta pronto.',
      quoteSummary: 'Resumo do Orcamento', aircraftLabel: 'Aeronave', airportLabel: 'Aeroporto',
      servicesLabel: 'Servicos', validUntilLabel: 'Valido Ate', totalLabel: 'Total',
      noteLabel: 'Nota de', ctaButton: 'Ver Orcamento e Reservar',
      urgency: 'Reserve agora para garantir sua vaga',
      questionsLine: 'Duvidas? Responda este e-mail ou ligue para',
      thanksLine: 'Obrigado por escolher', signoff: 'Atenciosamente,',
      subject: ', seu orcamento de', subjectSuffix: 'esta pronto',
      altSubject: 'Orcamento para seu', header: 'Seu Orcamento Esta Pronto',
      previewText: 'Seu orcamento esta pronto - veja os detalhes e reserve.',
      discountLabel: 'Desconto de Pacote',
    },
    de: {
      greeting: 'Hallo', greatNews: 'Tolle Neuigkeiten! Ihr Angebot fur die Aufbereitung Ihres', detailingReady: 'ist fertig.',
      quoteSummary: 'Angebotsubersicht', aircraftLabel: 'Flugzeug', airportLabel: 'Flughafen',
      servicesLabel: 'Dienstleistungen', validUntilLabel: 'Gultig Bis', totalLabel: 'Gesamt',
      noteLabel: 'Hinweis von', ctaButton: 'Angebot Ansehen &amp; Buchen',
      urgency: 'Jetzt buchen und Ihren Termin sichern',
      questionsLine: 'Fragen? Antworten Sie auf diese E-Mail oder rufen Sie an',
      thanksLine: 'Vielen Dank fur Ihr Vertrauen in', signoff: 'Mit freundlichen Grussen,',
      subject: ', Ihr Angebot von', subjectSuffix: 'ist bereit',
      altSubject: 'Angebot fur Ihr', header: 'Ihr Angebot ist Bereit',
      previewText: 'Ihr Angebot ist fertig - sehen Sie die Details und buchen Sie jetzt.',
      discountLabel: 'Paketrabatt',
    },
    it: {
      greeting: 'Ciao', greatNews: 'Ottime notizie! Il tuo preventivo per il detailing di', detailingReady: 'e pronto.',
      quoteSummary: 'Riepilogo Preventivo', aircraftLabel: 'Aeromobile', airportLabel: 'Aeroporto',
      servicesLabel: 'Servizi', validUntilLabel: 'Valido Fino Al', totalLabel: 'Totale',
      noteLabel: 'Nota da', ctaButton: 'Vedi Preventivo e Prenota',
      urgency: 'Prenota ora per assicurarti il posto',
      questionsLine: 'Domande? Rispondi a questa email o chiama il',
      thanksLine: 'Grazie per aver scelto', signoff: 'Cordiali saluti,',
      subject: ', il tuo preventivo da', subjectSuffix: 'e pronto',
      altSubject: 'Preventivo per il tuo', header: 'Il Tuo Preventivo e Pronto',
      previewText: 'Il tuo preventivo e pronto - visualizza i dettagli e prenota.',
      discountLabel: 'Sconto Pacchetto',
    },
    nl: {
      greeting: 'Hallo', greatNews: 'Goed nieuws! Uw offerte voor het detailen van', detailingReady: 'is klaar.',
      quoteSummary: 'Offerte Overzicht', aircraftLabel: 'Vliegtuig', airportLabel: 'Luchthaven',
      servicesLabel: 'Diensten', validUntilLabel: 'Geldig Tot', totalLabel: 'Totaal',
      noteLabel: 'Opmerking van', ctaButton: 'Offerte Bekijken en Boeken',
      urgency: 'Boek nu om uw plek te verzekeren',
      questionsLine: 'Vragen? Antwoord op deze email of bel',
      thanksLine: 'Bedankt voor het kiezen van', signoff: 'Met vriendelijke groet,',
      subject: ', uw offerte van', subjectSuffix: 'is klaar',
      altSubject: 'Offerte voor uw', header: 'Uw Offerte is Klaar',
      previewText: 'Uw offerte is klaar - bekijk de details en boek nu.',
      discountLabel: 'Pakketkorting',
    },
    ja: {
      greeting: '', greatNews: '朗報です！', detailingReady: 'のディテーリングの見積もりが完成しました。',
      quoteSummary: '見積もり概要', aircraftLabel: '航空機', airportLabel: '空港',
      servicesLabel: 'サービス', validUntilLabel: '有効期限', totalLabel: '合計',
      noteLabel: 'からのメモ', ctaButton: '見積もりを見て予約する',
      urgency: '今すぐ予約してお席を確保しましょう',
      questionsLine: 'ご質問がありましたら、このメールに返信するか、お電話ください',
      thanksLine: 'をお選びいただきありがとうございます', signoff: 'よろしくお願いいたします',
      subject: '様、', subjectSuffix: 'からの見積もり',
      altSubject: 'のお見積もり', header: 'お見積もりの準備ができました',
      previewText: 'お見積もりが完成しました - 詳細をご確認の上、ご予約ください。',
      discountLabel: 'パッケージ割引',
    },
    zh: {
      greeting: '您好', greatNews: '好消息！您的', detailingReady: '维护保养报价已准备就绪。',
      quoteSummary: '报价摘要', aircraftLabel: '飞机', airportLabel: '机场',
      servicesLabel: '服务项目', validUntilLabel: '有效期至', totalLabel: '总计',
      noteLabel: '来自的备注', ctaButton: '查看报价并预订',
      urgency: '立即预订以确保您的名额',
      questionsLine: '有疑问？回复此邮件或致电',
      thanksLine: '感谢您选择', signoff: '此致敬礼',
      subject: '，您来自', subjectSuffix: '的报价已就绪',
      altSubject: '的报价', header: '您的报价已准备就绪',
      previewText: '您的飞机维护报价已就绪 - 查看详情并立即预订。',
      discountLabel: '套餐折扣',
    },
  };
  const L = i18n[lang] || i18n.en;

  // Build service names list (NO prices in email — pricing is on the quote page only)
  const allServiceNames = [];
  if (lineItems.length > 0) {
    lineItems.forEach(item => { if (item.description) allServiceNames.push(item.description); });
  } else if (servicesList.length > 0) {
    servicesList.forEach(s => allServiceNames.push(s));
  }

  let serviceRowsHtml = allServiceNames.map(s => `
        <tr>
          <td colspan="2" style="padding: 4px 0; color: #374151; font-size: 15px;">&#8226; ${s}</td>
        </tr>`).join('');
  let serviceRowsText = allServiceNames.length > 0 ? `${L.servicesLabel}: ${allServiceNames.join(', ')}` : '';

  // Subject line - personalized
  const subjectLine = firstName
    ? `✈️ ${firstName}${L.subject} ${companyName} ${L.subjectSuffix}`
    : `✈️ ${companyName} - ${L.altSubject} ${aircraftDisplay}`;

  // Detailer contact block - simplified to company name only
  const contactHtml = `
    <div style="margin-top: 8px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 600;">${companyName}</p>
    </div>`;

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      ${L.previewText} ${aircraftDisplay}
    </div>

    <p style="font-size: 17px; margin: 0 0 16px 0; color: #1f2937;">
      ${L.greeting}${firstName ? ` ${firstName}` : ''},
    </p>

    <p style="font-size: 16px; margin: 0 0 24px 0; color: #374151; line-height: 1.5;">
      ${L.greatNews} <strong>${aircraftDisplay}</strong> ${L.detailingReady}
    </p>

    <!-- Quote Summary Card (no prices — pricing revealed on quote page) -->
    <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 0 0 24px 0;">
      <h2 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; font-weight: 600;">${L.quoteSummary}</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px;">${L.aircraftLabel}</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 600; font-size: 15px; color: #1e293b;">${aircraftDisplay}</td>
        </tr>
        ${airport ? `
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px;">${L.airportLabel}</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 600; font-size: 15px; color: #1e293b;">${airport}</td>
        </tr>` : ''}
        ${serviceRowsHtml ? `
        <tr>
          <td colspan="2" style="padding: 14px 0 6px 0; color: #64748b; font-weight: 600; font-size: 14px; border-top: 1px solid #e2e8f0;">${L.servicesLabel}</td>
        </tr>
        ${serviceRowsHtml}` : ''}
        ${validDate ? `
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0;">${L.validUntilLabel}</td>
          <td style="padding: 10px 0; text-align: right; font-size: 14px; color: #1e293b; border-top: 1px solid #e2e8f0;">${validDate}</td>
        </tr>` : ''}
      </table>
    </div>

    ${notes ? `
    <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 18px; margin: 0 0 24px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;"><strong>${L.noteLabel} ${companyName}:</strong> ${notes}</p>
    </div>` : ''}

    <!-- CTA Button -->
    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${APP_URL}/q/${share_link}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 18px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 18px; letter-spacing: 0.3px; mso-padding-alt: 0; text-align: center; box-shadow: 0 4px 14px rgba(201, 168, 76, 0.4);">
        <!--[if mso]><i style="letter-spacing: 48px; mso-font-width: -100%; mso-text-raise: 27pt;">&nbsp;</i><![endif]-->
        ${L.ctaButton}
        <!--[if mso]><i style="letter-spacing: 48px; mso-font-width: -100%;">&nbsp;</i><![endif]-->
      </a>
    </div>
    <p style="text-align: center; font-size: 13px; color: #94a3b8; margin: 0 0 28px 0; font-style: italic;">
      ${L.urgency}
    </p>

    <!-- Contact & Sign-off -->
    <div style="margin-top: 24px;">
      ${detailerPhone ? `
      <p style="font-size: 14px; color: #64748b; margin: 0 0 16px 0;">
        ${L.questionsLine} <a href="tel:${detailerPhone}" style="color: #0D1B2A; font-weight: 600; text-decoration: none;">${detailerPhone}</a>.
      </p>` : ''}
      <p style="font-size: 15px; color: #374151; margin: 0 0 4px 0;">
        ${L.thanksLine} <strong>${companyName}</strong>!
      </p>
      <p style="font-size: 15px; color: #374151; margin: 16px 0 4px 0;">
        ${L.signoff}
      </p>
      ${contactHtml}
    </div>
  `;

  const text = `
${L.greeting}${firstName ? ` ${firstName}` : ''},

${L.greatNews} ${aircraftDisplay} ${L.detailingReady}

--- ${L.quoteSummary} ---
${L.aircraftLabel}: ${aircraftDisplay}
${airport ? `${L.airportLabel}: ${airport}` : ''}
${serviceRowsText}
${validDate ? `${L.validUntilLabel}: ${validDate}` : ''}

${notes ? `${L.noteLabel} ${companyName}: ${notes}` : ''}

View your quote: ${APP_URL}/q/${share_link}

${L.urgency}

${detailerPhone ? `${L.questionsLine} ${detailerPhone}.` : ''}
${L.thanksLine} ${companyName}!

${L.signoff}
${detailerName}
${companyName}
${detailerPhone ? detailerPhone : ''}
${detailerEmail ? detailerEmail : ''}
  `.trim();

  return {
    subject: subjectLine,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || BRAND_COLOR, headerText: `Your Quote from ${companyName}`, companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * QUOTE VIEWED - Email to detailer when customer views quote
 */
export function quoteViewedTemplate({ quote, detailer, viewedAt }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, client_email, client_phone, id } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const viewTime = new Date(viewedAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${detailer?.name ? ` ${detailer.name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! <strong>${client_name || 'Your customer'}</strong> just opened your quote.
    </p>

    <div style="background: #f8f6f0; border: 1px solid #C9A84C; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #8B7332; font-weight: 600;">
        Viewed at ${viewTime}
      </p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Customer:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${client_name || 'Customer'}</td>
        </tr>
        ${client_email ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Email:</td>
          <td style="padding: 8px 0; text-align: right;"><a href="mailto:${client_email}" style="color: #0D1B2A;">${client_email}</a></td>
        </tr>
        ` : ''}
        ${client_phone ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Phone:</td>
          <td style="padding: 8px 0; text-align: right;"><a href="tel:${client_phone}" style="color: #0D1B2A;">${client_phone}</a></td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #0D1B2A;">${amount}</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      This is a great time to follow up if you haven't heard from them!
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/dashboard" style="display: inline-block; background: #C9A84C; color: #0D1B2A; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View in Dashboard
      </a>
    </div>
  `;

  const text = `
Hi${detailer?.name ? ` ${detailer.name}` : ''},

Great news! ${client_name || 'Your customer'} just opened your quote.

Viewed at: ${viewTime}

Customer: ${client_name || 'Customer'}
${client_email ? `Email: ${client_email}` : ''}
${client_phone ? `Phone: ${client_phone}` : ''}
Aircraft: ${aircraftDisplay}
Quote Total: ${amount}

This is a great time to follow up if you haven't heard from them!

View in dashboard: ${APP_URL}/dashboard
  `.trim();

  return {
    subject: `Quote Viewed - ${client_name || 'Customer'} opened your quote`,
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: 'Quote Viewed!' }),
    text,
  };
}

/**
 * PAYMENT RECEIVED - Email to detailer when customer pays
 */
export function paymentReceivedTemplate({ quote, detailer, feeBreakdown }) {
  const { aircraft_model, aircraft_type, total_price, client_name, client_email, client_phone, id, services } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const servicesList = formatServices(services);
  const platformFee = feeBreakdown?.platformFee || 0;
  const feeRate = feeBreakdown?.feeRate || 0;
  const yourPayout = feeBreakdown?.yourPayout || total_price;

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${detailer?.name ? ` ${detailer.name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! Your quote has been approved and paid!
    </p>

    <div style="background: #f8f6f0; border: 2px solid #C9A84C; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #8B7332; font-size: 14px;">Payment Received</p>
      <p style="margin: 0; color: #C9A84C; font-size: 32px; font-weight: 700;">${amount}</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Customer:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${client_name || 'Customer'}</td>
        </tr>
        ${client_email ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Email:</td>
          <td style="padding: 8px 0; text-align: right;"><a href="mailto:${client_email}" style="color: #0D1B2A;">${client_email}</a></td>
        </tr>
        ` : ''}
        ${client_phone ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Phone:</td>
          <td style="padding: 8px 0; text-align: right;"><a href="tel:${client_phone}" style="color: #0D1B2A;">${client_phone}</a></td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${servicesList.length > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Services:</td>
          <td style="padding: 8px 0; text-align: right;">
            ${servicesList.map(s => `<div>${s}</div>`).join('')}
          </td>
        </tr>
        ` : ''}
      </table>
    </div>

    ${platformFee > 0 ? `
    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #92400e; font-size: 14px;">Quote Total:</td>
          <td style="padding: 4px 0; text-align: right; color: #92400e; font-size: 14px;">${amount}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #92400e; font-size: 14px;">Platform Fee (${(feeRate * 100).toFixed(0)}%):</td>
          <td style="padding: 4px 0; text-align: right; color: #92400e; font-size: 14px;">-${formatCurrency(platformFee)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #fde68a; color: #78350f; font-weight: 600;">Your Payout:</td>
          <td style="padding: 8px 0; border-top: 1px solid #fde68a; text-align: right; color: #78350f; font-weight: 700; font-size: 16px;">${formatCurrency(yourPayout)}</td>
        </tr>
      </table>
    </div>
    ` : ''}

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      Please contact the customer to confirm available dates and schedule the service. The payment will be transferred to your connected Stripe account.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/dashboard" style="display: inline-block; background: #C9A84C; color: #0D1B2A; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View in Dashboard
      </a>
    </div>
  `;

  const text = `
Hi${detailer?.name ? ` ${detailer.name}` : ''},

Great news! Your quote has been approved and paid!

Payment Received: ${amount}
${platformFee > 0 ? `Platform Fee (${(feeRate * 100).toFixed(0)}%): -${formatCurrency(platformFee)}
Your Payout: ${formatCurrency(yourPayout)}` : ''}

Customer: ${client_name || 'Customer'}
${client_email ? `Email: ${client_email}` : ''}
${client_phone ? `Phone: ${client_phone}` : ''}
Aircraft: ${aircraftDisplay}
${servicesList.length > 0 ? `Services: ${servicesList.join(', ')}` : ''}

Please contact the customer to confirm available dates and schedule the service.

View in dashboard: ${APP_URL}/dashboard
  `.trim();

  return {
    subject: `Payment Received - ${amount} for ${aircraftDisplay}`,
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: 'Payment Received!' }),
    text,
  };
}

/**
 * PAYMENT CONFIRMED - Email to customer after payment
 */
export function paymentConfirmedTemplate({ quote, detailer, feeBreakdown }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, services, paid_at } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const servicesList = formatServices(services);
  const paidDate = paid_at ? new Date(paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const platformFee = feeBreakdown?.platformFee || 0;
  const feeRate = feeBreakdown?.feeRate || 0;
  const customerPaid = feeBreakdown?.customerPaid || total_price;

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Payment confirmed! ${amount} for ${aircraftDisplay} detail with ${companyName}.
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Thank you for your payment! Your aircraft detailing service with <strong>${companyName}</strong> has been confirmed.
    </p>

    <div style="background: #f8f6f0; border: 2px solid #C9A84C; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #8B7332; font-size: 14px;">Payment Confirmed</p>
      <p style="margin: 0; color: #C9A84C; font-size: 28px; font-weight: 700;">${amount}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">${paidDate}</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 16px 0; color: #0D1B2A; font-size: 16px;">Service Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${servicesList.length > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Services:</td>
          <td style="padding: 8px 0; text-align: right;">
            ${servicesList.map(s => `<div>${s}</div>`).join('')}
          </td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        ${platformFee > 0 ? `
        <tr>
          <td colspan="2" style="padding: 12px 0 0 0; border-top: 1px solid #e5e7eb;"></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Service Total:</td>
          <td style="padding: 4px 0; text-align: right;">${formatCurrency(total_price)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Service Fee (${(feeRate * 100).toFixed(0)}%):</td>
          <td style="padding: 4px 0; text-align: right;">${formatCurrency(platformFee)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; font-weight: 600; color: #0D1B2A;">Total Charged:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; color: #0D1B2A;">${formatCurrency(customerPaid)}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <h4 style="margin: 0 0 8px 0; color: #0D1B2A;">What's Next?</h4>
      <p style="margin: 0; color: #0D1B2A; font-size: 14px;">
        ${companyName} will contact you shortly to confirm the service date and any preparation details. If you have questions, feel free to reach out to them directly.
      </p>
    </div>

    ${detailer?.email || detailer?.phone ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #0D1B2A; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #0D1B2A; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/q/${share_link}" style="display: inline-block; background: #C9A84C; color: #0D1B2A; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View Receipt
      </a>
    </div>
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Thank you for your payment! Your aircraft detailing service with ${companyName} has been confirmed.

Payment Confirmed: ${amount}
Date: ${paidDate}

Service Details:
- Aircraft: ${aircraftDisplay}
${servicesList.length > 0 ? `- Services: ${servicesList.join(', ')}` : ''}
- Provider: ${companyName}
${platformFee > 0 ? `
Fee Breakdown:
- Service Total: ${formatCurrency(total_price)}
- Service Fee (${(feeRate * 100).toFixed(0)}%): ${formatCurrency(platformFee)}
- Total Charged: ${formatCurrency(customerPaid)}
` : ''}
What's Next?
${companyName} will contact you shortly to confirm the service date and any preparation details.

${detailer?.email || detailer?.phone ? `Contact ${companyName}: ${detailer?.email || ''} ${detailer?.phone || ''}` : ''}

View your receipt: ${APP_URL}/q/${share_link}
  `.trim();

  return {
    subject: `✈️ Payment Confirmed - ${aircraftDisplay} Detail with ${companyName}`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || SUCCESS_COLOR, headerText: 'Payment Confirmed', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * RECURRING SERVICE REMINDER - Email to customer about upcoming/new recurring service
 */
export function recurringReminderTemplate({ quote, detailer, isNewQuote }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, next_service_date } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';

  const dateStr = next_service_date
    ? new Date(next_service_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'soon';

  const headerText = isNewQuote ? 'Your Recurring Service is Ready' : 'Upcoming Service Reminder';

  const content = isNewQuote
    ? `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your recurring aircraft detailing service with <strong>${companyName}</strong> is ready for scheduling.
    </p>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; color: #0D1B2A; font-size: 14px;">Service Total</p>
      <p style="margin: 0; color: #0D1B2A; font-size: 28px; font-weight: 700;">${amount}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px;">${aircraftDisplay}</p>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      Review and approve your quote to confirm your next service appointment.
    </p>

    ${share_link ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/q/${share_link}" style="display: inline-block; background: #C9A84C; color: #0D1B2A; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View &amp; Approve Quote
      </a>
    </div>
    ` : ''}
  `
    : `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      This is a reminder that your recurring aircraft detailing service with <strong>${companyName}</strong> is coming up.
    </p>

    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; color: #92400e; font-size: 14px;">Scheduled For</p>
      <p style="margin: 0; color: #78350f; font-size: 20px; font-weight: 700;">${dateStr}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px;">${aircraftDisplay} - ${amount}</p>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      Please ensure your aircraft is accessible on the scheduled date. If you need to reschedule, contact ${companyName} directly.
    </p>

    ${detailer?.email || detailer?.phone ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #0D1B2A; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #0D1B2A; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}
  `;

  const text = isNewQuote
    ? `
Hi${client_name ? ` ${client_name}` : ''},

Your recurring aircraft detailing service with ${companyName} is ready.

Aircraft: ${aircraftDisplay}
Service Total: ${amount}

${share_link ? `Review your quote: ${APP_URL}/q/${share_link}` : ''}
    `.trim()
    : `
Hi${client_name ? ` ${client_name}` : ''},

Reminder: Your recurring service with ${companyName} is scheduled for ${dateStr}.

Aircraft: ${aircraftDisplay}
Amount: ${amount}

Please ensure your aircraft is accessible on the scheduled date.

${detailer?.email ? `Contact: ${detailer.email}` : ''}${detailer?.phone ? ` | ${detailer.phone}` : ''}
    `.trim();

  return {
    subject: isNewQuote
      ? `✈️ Recurring Service Ready - ${aircraftDisplay} Detail from ${companyName}`
      : `✈️ Service Reminder - ${aircraftDisplay} Detail on ${dateStr}`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || (isNewQuote ? BRAND_COLOR : WARNING_COLOR), headerText, companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * JOB SCHEDULED - Confirmation email to customer when job is scheduled
 */
export function jobScheduledTemplate({ quote, detailer, scheduledDate }) {
  const { aircraft_model, aircraft_type, total_price, client_name, airport } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const dateStr = scheduledDate
    ? new Date(scheduledDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'soon';
  const timeStr = scheduledDate
    ? new Date(scheduledDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Your ${aircraftDisplay} detail with ${companyName} is confirmed for ${dateStr}${timeStr ? ` at ${timeStr}` : ''}.
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! Your aircraft detailing service with <strong>${companyName}</strong> has been confirmed and scheduled.
    </p>

    <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; color: #15803d; font-size: 14px;">Service Confirmed</p>
      <p style="margin: 0; color: #15803d; font-size: 20px; font-weight: 700;">${dateStr}</p>
      ${timeStr ? `<p style="margin: 4px 0 0 0; color: #16a34a; font-size: 16px;">${timeStr}</p>` : ''}
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${airport ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Location:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${airport}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #0D1B2A;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Preparation:</strong> Please ensure your aircraft is accessible and the area is clear for the detailing crew to work.</p>
    </div>

    ${detailer?.email || detailer?.phone ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Need to reschedule? Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #0D1B2A; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #0D1B2A; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Your aircraft detailing service with ${companyName} is confirmed for ${dateStr}${timeStr ? ` at ${timeStr}` : ''}.

Aircraft: ${aircraftDisplay}
${airport ? `Location: ${airport}` : ''}
Provider: ${companyName}
Quote Total: ${amount}

Please ensure your aircraft is accessible and the area is clear for the detailing crew.

${detailer?.email ? `Contact: ${detailer.email}` : ''}${detailer?.phone ? ` | ${detailer.phone}` : ''}
  `.trim();

  return {
    subject: `✈️ Service Confirmed - ${aircraftDisplay} Detail on ${dateStr}`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || SUCCESS_COLOR, headerText: 'Service Confirmed', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * BOOKING RECEIVED (DETAILER) - Notification that a customer self-scheduled
 */
export function bookingReceivedDetailerTemplate({ quote, detailer, scheduledDate, timePreference, schedulingNotes }) {
  const { aircraft_model, aircraft_type, client_name, client_email, client_phone, airport, total_price } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const dateStr = scheduledDate
    ? new Date(scheduledDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'TBD';

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${detailer?.name ? ` ${detailer.name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${client_name || 'A customer'}</strong> just scheduled their service!
    </p>

    <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; color: #15803d; font-size: 14px;">Booked For</p>
      <p style="margin: 0; color: #15803d; font-size: 20px; font-weight: 700;">${dateStr}</p>
      ${timePreference && timePreference !== 'No preference' ? `<p style="margin: 4px 0 0 0; color: #16a34a; font-size: 14px;">Preferred: ${timePreference}</p>` : ''}
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Customer:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${client_name || 'N/A'}</td>
        </tr>
        ${client_email ? `<tr><td style="padding: 8px 0; color: #6b7280;">Email:</td><td style="padding: 8px 0; text-align: right;"><a href="mailto:${client_email}" style="color: #0D1B2A;">${client_email}</a></td></tr>` : ''}
        ${client_phone ? `<tr><td style="padding: 8px 0; color: #6b7280;">Phone:</td><td style="padding: 8px 0; text-align: right;"><a href="tel:${client_phone}" style="color: #0D1B2A;">${client_phone}</a></td></tr>` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${airport ? `<tr><td style="padding: 8px 0; color: #6b7280;">Location:</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${airport}</td></tr>` : ''}
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #0D1B2A;">${amount}</td>
        </tr>
      </table>
    </div>

    ${schedulingNotes ? `
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0 0 4px 0; color: #92400e; font-size: 14px; font-weight: 600;">Customer Notes:</p>
      <p style="margin: 0; color: #92400e; font-size: 14px;">${schedulingNotes}</p>
    </div>
    ` : ''}

    <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
      This job is now on your calendar. Log in to manage or reschedule if needed.
    </p>
  `;

  const text = `
${client_name || 'A customer'} just scheduled their ${aircraftDisplay} service for ${dateStr}.
${timePreference ? `Time preference: ${timePreference}` : ''}
${schedulingNotes ? `Notes: ${schedulingNotes}` : ''}
Quote total: ${amount}
${client_email ? `Customer email: ${client_email}` : ''}
${client_phone ? `Customer phone: ${client_phone}` : ''}
  `.trim();

  return {
    subject: `New Booking — ${aircraftDisplay} on ${dateStr}`,
    html: emailWrapper(content, { headerBg: '#0D1B2A', headerText: 'New Booking', companyName: detailer?.company }),
    text,
  };
}

/**
 * JOB REMINDER - Email to customer the day before scheduled service
 */
export function jobReminderTemplate({ quote, detailer, serviceDate }) {
  const { aircraft_model, aircraft_type, total_price, client_name, airport } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const dateStr = serviceDate
    ? new Date(serviceDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'tomorrow';

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Your ${aircraftDisplay} detail with ${companyName} is scheduled for ${dateStr}. Get ready!
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Just a friendly reminder that your aircraft detailing service with <strong>${companyName}</strong> is scheduled for <strong>${dateStr}</strong>.
    </p>

    <div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; color: #0D1B2A; font-size: 14px;">Scheduled Service</p>
      <p style="margin: 0; color: #0D1B2A; font-size: 20px; font-weight: 700;">${dateStr}</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${airport ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Location:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${airport}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #0D1B2A;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Preparation:</strong> Please ensure your aircraft is accessible and the area is clear for the detailing crew to work.</p>
    </div>

    ${detailer?.email || detailer?.phone ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Need to reschedule? Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #0D1B2A; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #0D1B2A; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Reminder: Your aircraft detailing service with ${companyName} is scheduled for ${dateStr}.

Aircraft: ${aircraftDisplay}
${airport ? `Location: ${airport}` : ''}
Provider: ${companyName}
Quote Total: ${amount}

Please ensure your aircraft is accessible and the area is clear for the detailing crew.

${detailer?.email ? `Contact: ${detailer.email}` : ''}${detailer?.phone ? ` | ${detailer.phone}` : ''}
  `.trim();

  return {
    subject: `✈️ Service Tomorrow - ${aircraftDisplay} Detail with ${companyName}`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || INFO_COLOR, headerText: 'Service Reminder', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * JOB COMPLETED - Email to customer when detailer marks job complete
 */
export function jobCompletedTemplate({ quote, detailer, completedAt }) {
  const { aircraft_model, aircraft_type, total_price, client_name, share_link } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const completedDate = completedAt
    ? new Date(completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Your ${aircraftDisplay} detail by ${companyName} is complete! We hope it looks amazing.
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your aircraft detailing service has been completed by <strong>${companyName}</strong>. We hope your aircraft looks fantastic!
    </p>

    <div style="background: #f8f6f0; border: 2px solid #C9A84C; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #8B7332; font-size: 14px;">Service Complete</p>
      <p style="margin: 0; color: #C9A84C; font-size: 20px; font-weight: 700;">${aircraftDisplay}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">${completedDate}</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #0D1B2A;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <h4 style="margin: 0 0 8px 0; color: #0D1B2A;">How was your experience?</h4>
      <p style="margin: 0; color: #0D1B2A; font-size: 14px;">
        If you were satisfied with the service, we'd appreciate a review or referral. If anything needs attention, please contact ${companyName} directly.
      </p>
    </div>

    ${detailer?.email || detailer?.phone ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #0D1B2A; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #0D1B2A; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Your aircraft detailing service has been completed by ${companyName}.

Aircraft: ${aircraftDisplay}
Completed: ${completedDate}
Total: ${amount}

If you were satisfied with the service, we'd appreciate a review or referral.

${detailer?.email ? `Contact: ${detailer.email}` : ''}${detailer?.phone ? ` | ${detailer.phone}` : ''}
  `.trim();

  return {
    subject: `✈️ Service Complete - ${aircraftDisplay} Detail by ${companyName}`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || SUCCESS_COLOR, headerText: 'Service Complete!', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * FOLLOW-UP - Email to customer 7 days after quote sent (if not yet accepted)
 */
export function followUpTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, valid_until } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const validDate = valid_until ? new Date(valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const isExpiringSoon = valid_until && (new Date(valid_until) - new Date()) < 7 * 24 * 60 * 60 * 1000;

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Your ${aircraftDisplay} quote from ${companyName} is still waiting - ${amount}. Don't miss out!
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Just checking in! You have an outstanding quote from <strong>${companyName}</strong> for your ${aircraftDisplay} detail.
    </p>

    ${isExpiringSoon && validDate ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #991b1b; font-weight: 600;">
        This quote expires ${validDate}
      </p>
    </div>
    ` : ''}

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        ${validDate ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Valid Until:</td>
          <td style="padding: 8px 0; text-align: right; ${isExpiringSoon ? 'color: #dc2626; font-weight: 600;' : ''}">${validDate}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #0D1B2A;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/q/${share_link}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        View Quote &amp; Pay
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Questions? Reply to this email or contact ${companyName} directly.
    </p>
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Just checking in! You have an outstanding quote from ${companyName} for your ${aircraftDisplay} detail.

Aircraft: ${aircraftDisplay}
Provider: ${companyName}
${validDate ? `Valid Until: ${validDate}` : ''}
Quote Total: ${amount}

View your quote: ${APP_URL}/q/${share_link}

Questions? Reply to this email or contact ${companyName} directly.
  `.trim();

  return {
    subject: `✈️ Your ${aircraftDisplay} Quote from ${companyName} is Waiting!`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || WARNING_COLOR, headerText: 'Your Quote is Waiting', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * WELCOME EMAIL - Sent to new detailers on signup
 */
export function welcomeTemplate({ detailer }) {
  const name = detailer?.name || '';
  const companyName = detailer?.company || name || 'there';

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${name ? ` ${name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Welcome to <strong>Vector</strong>! You're all set to start creating professional aircraft detailing quotes in minutes.
    </p>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 16px 0; color: #0D1B2A; font-size: 16px;">Get Started in 3 Steps:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 12px 10px 0; vertical-align: top; width: 36px;">
            <div style="background: #0D1B2A; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">1</div>
          </td>
          <td style="padding: 10px 0;">
            <p style="margin: 0; font-weight: 600; color: #0D1B2A;">Set up your services</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">Configure your pricing and service offerings in Settings.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 12px 10px 0; vertical-align: top;">
            <div style="background: #0D1B2A; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">2</div>
          </td>
          <td style="padding: 10px 0;">
            <p style="margin: 0; font-weight: 600; color: #0D1B2A;">Connect Stripe</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">Enable online payments to get paid directly through your quotes.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 12px 10px 0; vertical-align: top;">
            <div style="background: #0D1B2A; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">3</div>
          </td>
          <td style="padding: 10px 0;">
            <p style="margin: 0; font-weight: 600; color: #0D1B2A;">Create your first quote</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">Select an aircraft, choose services, and send a professional quote in under 2 minutes.</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px 0; color: #0D1B2A; font-size: 16px;">Your Free Plan Includes:</h3>
      <ul style="margin: 0; padding: 0 0 0 20px; color: #374151;">
        <li style="padding: 4px 0;">3 quotes per month</li>
        <li style="padding: 4px 0;">Full aircraft database</li>
        <li style="padding: 4px 0;">Online payment collection</li>
        <li style="padding: 4px 0;">Email quote delivery</li>
      </ul>
      <p style="margin: 16px 0 0 0; font-size: 14px; color: #6b7280;">
        Need unlimited quotes? <a href="${APP_URL}/settings" style="color: #C9A84C; font-weight: 600;">Upgrade to Pro</a> for $79/mo.
      </p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Go to Dashboard
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Questions? Reply to this email and we'll help you get set up.
    </p>
  `;

  const text = `
Hi${name ? ` ${name}` : ''},

Welcome to Vector! You're all set to start creating professional aircraft detailing quotes.

Get Started in 3 Steps:

1. Set up your services - Configure your pricing in Settings.
2. Connect Stripe - Enable online payments through your quotes.
3. Create your first quote - Select an aircraft, choose services, and send in under 2 minutes.

Your Free Plan Includes:
- 3 quotes per month
- Full aircraft database
- Online payment collection
- Email quote delivery

Need unlimited quotes? Upgrade to Pro for $79/mo at ${APP_URL}/settings

Go to your dashboard: ${APP_URL}/dashboard

Questions? Reply to this email and we'll help you get set up.
  `.trim();

  return {
    subject: 'Welcome to Vector - Let\'s get your first quote out!',
    html: emailWrapper(content, { headerBg: BRAND_COLOR, headerText: 'Welcome to Vector!' }),
    text,
  };
}

/**
 * FEEDBACK REQUEST - Email to customer after job completed
 */
export function feedbackRequestTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, client_name, feedback_token } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const reviewBaseUrl = `${APP_URL}/review/${feedback_token}`;

  const starLinks = [1, 2, 3, 4, 5].map(n => {
    const url = `${reviewBaseUrl}?r=${n}`;
    return `<a href="${url}" style="text-decoration: none; font-size: 36px; line-height: 1;">&#11088;</a>`;
  }).join('&nbsp;');

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Thank you for choosing <strong>${companyName}</strong> for your recent ${aircraftDisplay} detailing service. We hope everything exceeded your expectations!
    </p>

    <p style="font-size: 16px; margin-bottom: 24px; text-align: center;">
      How was your experience with <strong>${companyName}</strong>?
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 12px 0;">Tap a star to rate</p>
      <div style="display: inline-block;">
        ${starLinks}
      </div>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${reviewBaseUrl}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
        Leave a Review
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Your feedback helps us improve and lets other aircraft owners know what to expect.
    </p>
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Thank you for choosing ${companyName} for your recent ${aircraftDisplay} detailing.

How was your experience? Tap a star to rate:
1 star: ${reviewBaseUrl}?r=1
2 stars: ${reviewBaseUrl}?r=2
3 stars: ${reviewBaseUrl}?r=3
4 stars: ${reviewBaseUrl}?r=4
5 stars: ${reviewBaseUrl}?r=5

Or leave a review: ${reviewBaseUrl}

Your feedback helps us improve!
  `.trim();

  return {
    subject: `How was your ${aircraftDisplay} detail with ${companyName}?`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || BRAND_COLOR, headerText: 'Rate Your Experience', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * LOW STOCK ALERT - Email to detailer when product drops below reorder threshold
 */
export function lowStockAlertTemplate({ products, detailer }) {
  const name = detailer?.name || '';
  const count = products.length;

  const productRows = products.map(p => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6;">
        <div style="font-weight: 600; color: #1f2937;">${p.name}</div>
        ${p.brand ? `<div style="font-size: 12px; color: #9ca3af;">${p.brand}</div>` : ''}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: center;">
        <span style="color: #dc2626; font-weight: 700;">${p.current_quantity || 0}</span>
        <span style="color: #9ca3af; font-size: 12px;"> ${p.unit || ''}</span>
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #6b7280;">
        ${p.reorder_threshold || 0} ${p.unit || ''}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: center;">
        ${p.product_url ? `<a href="${p.product_url}" style="color: #d97706; font-weight: 600; text-decoration: none;">Reorder &rarr;</a>` : '<span style="color: #d1d5db;">-</span>'}
      </td>
    </tr>
  `).join('');

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${name ? ` ${name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      ${count === 1 ? 'A product has' : `${count} products have`} dropped below ${count === 1 ? 'its' : 'their'} reorder threshold.
    </p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #991b1b; font-weight: 600; font-size: 18px;">
        ${count} Low Stock Alert${count !== 1 ? 's' : ''}
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb;">
          <th style="text-align: left; padding: 8px 12px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Product</th>
          <th style="text-align: center; padding: 8px 12px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Current</th>
          <th style="text-align: center; padding: 8px 12px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Reorder At</th>
          <th style="text-align: center; padding: 8px 12px; color: #6b7280; font-size: 12px; text-transform: uppercase;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${productRows}
      </tbody>
    </table>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/products" style="display: inline-block; background: #C9A84C; color: #0D1B2A; padding: 14px 36px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        View Inventory
      </a>
    </div>
  `;

  const productList = products.map(p =>
    `  - ${p.name}: ${p.current_quantity || 0} ${p.unit || ''} (reorder at ${p.reorder_threshold})${p.product_url ? ` | Reorder: ${p.product_url}` : ''}`
  ).join('\n');

  const text = `
Hi${name ? ` ${name}` : ''},

${count} product${count !== 1 ? 's' : ''} ${count === 1 ? 'is' : 'are'} below reorder level:

${productList}

View inventory: ${APP_URL}/products
  `.trim();

  return {
    subject: `Low Stock Alert - ${count} product${count !== 1 ? 's' : ''} need reordering`,
    html: emailWrapper(content, { headerBg: '#dc2626', headerText: 'Low Stock Alert' }),
    text,
  };
}

/**
 * Quote expiring soon - email to customer (24hr warning)
 */
export function quoteExpiringTemplate({ quote, detailer }) {
  const client_name = quote.client_name || quote.customer_name || 'there';
  const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'your aircraft';
  const amount = formatCurrency(quote.total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const expiryDate = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'tomorrow';
  const quoteLink = quote.share_link ? `${APP_URL}/q/${quote.share_link}` : APP_URL;

  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 8px;">&#9200;</div>
      <h2 style="margin: 0; color: #1f2937; font-size: 22px;">Your Quote Expires Soon</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">Act now to lock in your price</p>
    </div>

    <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
      Hi ${client_name},<br><br>
      Your quote from <strong>${companyName}</strong> for <strong>${aircraftDisplay}</strong> expires on <strong style="color: #d97706;">${expiryDate}</strong>.
    </p>

    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <p style="margin: 0; font-size: 13px; color: #92400e;">Quote Total</p>
          <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: 700; color: #92400e;">${amount}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; font-size: 13px; color: #92400e;">Expires</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #92400e;">${expiryDate}</p>
        </div>
      </div>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${quoteLink}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 14px 36px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        View Quote Before It Expires
      </a>
    </div>

    <p style="font-size: 13px; color: #9ca3af; text-align: center;">
      After the expiration date, this quote will no longer be valid and pricing may change.
    </p>
  `;

  const text = `Hi ${client_name},\n\nYour quote from ${companyName} for ${aircraftDisplay} (${amount}) expires on ${expiryDate}.\n\nView your quote: ${quoteLink}\n\nAfter the expiration date, this quote will no longer be valid.`;

  return {
    subject: `⏰ Your ${aircraftDisplay} Quote from ${companyName} Expires Tomorrow!`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || WARNING_COLOR, headerText: 'Quote Expiring Soon', companyName, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * Quote expired - notification to detailer
 */
export function quoteExpiredDetailerTemplate({ quote, detailer }) {
  const client_name = quote.client_name || quote.customer_name || 'Customer';
  const client_email = quote.client_email || '';
  const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const amount = formatCurrency(quote.total_price);
  const wasViewed = quote.status === 'viewed';

  const content = `
    <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
      Hi${detailer?.name ? ` ${detailer.name}` : ''},
    </p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-weight: 600; color: #991b1b; font-size: 15px;">Quote Expired</p>
      <p style="margin: 4px 0 0 0; color: #991b1b; font-size: 14px;">
        ${client_name}'s quote for ${aircraftDisplay} has expired without payment.
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Customer:</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${client_name}</td>
      </tr>
      ${client_email ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Email:</td><td style="padding: 6px 0; text-align: right;">${client_email}</td></tr>` : ''}
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Aircraft:</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Amount:</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${amount}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Status before expiry:</td>
        <td style="padding: 6px 0; text-align: right;">
          <span style="background: ${wasViewed ? '#f3e8ff' : '#dbeafe'}; color: ${wasViewed ? '#7c3aed' : '#2563eb'}; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600;">
            ${wasViewed ? 'Viewed' : 'Not Viewed'}
          </span>
        </td>
      </tr>
    </table>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      ${wasViewed ? 'The customer viewed the quote but didn\'t pay. Consider following up directly.' : 'The customer never opened the quote. Try resending or reaching out by phone.'}
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/quotes" style="display: inline-block; background: #C9A84C; color: #0D1B2A; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View in Dashboard
      </a>
    </div>
  `;

  const text = `Quote expired: ${client_name} - ${aircraftDisplay} (${amount}). Status: ${wasViewed ? 'Viewed' : 'Not Viewed'}. Consider following up.`;

  return {
    subject: `Quote expired - ${client_name} (${aircraftDisplay})`,
    html: emailWrapper(content, { headerBg: '#dc2626', headerText: 'Quote Expired' }),
    text,
  };
}

/**
 * Invoice email to customer
 */
export function invoiceTemplate({ invoice }) {
  const items = invoice.line_items || [];
  const addons = invoice.addon_fees || [];

  let itemsHtml = '';
  if (items.length > 0) {
    const rows = items.map(item => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">${item.description || item.service || 'Service'}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">${formatCurrency(item.amount || item.price || 0)}</td>
      </tr>
    `).join('');

    itemsHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb;">
            <th style="text-align: left; padding: 8px 0; color: #6b7280; font-size: 12px; text-transform: uppercase;">Description</th>
            <th style="text-align: right; padding: 8px 0; color: #6b7280; font-size: 12px; text-transform: uppercase;">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  let addonsHtml = '';
  if (addons.length > 0) {
    addonsHtml = addons.map(a => `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #6b7280; font-size: 14px;">
        <span>${a.name || 'Add-on'}</span>
        <span>${formatCurrency(a.calculated || a.amount || 0)}</span>
      </div>
    `).join('');
  }

  const feeHtml = invoice.platform_fee > 0 ? `
    <div style="padding: 4px 0; color: #9ca3af; font-size: 13px;">
      <span>Platform fee (${(invoice.platform_fee_rate * 100).toFixed(0)}%)</span>
      <span style="float: right;">${formatCurrency(invoice.platform_fee)}</span>
    </div>
  ` : '';

  const statusColor = invoice.status === 'paid' ? SUCCESS_COLOR : WARNING_COLOR;
  const statusLabel = invoice.status === 'paid' ? 'PAID' : 'UNPAID';

  const content = `
    <div style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h2 style="margin: 0 0 4px 0; color: #1f2937; font-size: 20px;">Invoice ${invoice.invoice_number}</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">${new Date(invoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <span style="background: ${statusColor}; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600;">${statusLabel}</span>
      </div>
    </div>

    <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
      <div style="margin-bottom: 12px;">
        <p style="margin: 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">From</p>
        <p style="margin: 2px 0 0 0; font-weight: 600; color: #1f2937;">${invoice.detailer_company || invoice.detailer_name || ''}</p>
        ${invoice.detailer_email ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${invoice.detailer_email}</p>` : ''}
        ${invoice.detailer_phone ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${invoice.detailer_phone}</p>` : ''}
      </div>
      <div>
        <p style="margin: 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Bill To</p>
        <p style="margin: 2px 0 0 0; font-weight: 600; color: #1f2937;">${invoice.customer_name || 'Customer'}</p>
        ${invoice.customer_company ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${invoice.customer_company}</p>` : ''}
        ${invoice.customer_email ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${invoice.customer_email}</p>` : ''}
      </div>
    </div>

    ${invoice.aircraft ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 4px 0;">Aircraft: <strong style="color: #1f2937;">${invoice.aircraft}</strong></p>` : ''}
    ${invoice.airport ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">Location: <strong style="color: #1f2937;">${invoice.airport}</strong></p>` : ''}

    ${itemsHtml}
    ${addonsHtml}

    <div style="border-top: 2px solid #1e3a5f; padding-top: 12px; margin-top: 12px;">
      ${feeHtml}
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 18px; font-weight: 700; color: #1f2937;">Total</span>
        <span style="font-size: 24px; font-weight: 700; color: #0D1B2A;">${formatCurrency(invoice.total)}</span>
      </div>
    </div>

    ${invoice.status !== 'paid' && invoice.due_date ? `
      <p style="margin: 16px 0 0 0; color: #d97706; font-size: 14px;">Due by ${new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    ` : ''}

    ${invoice.notes ? `
      <div style="margin-top: 16px; padding: 12px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
        <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Notes:</strong> ${invoice.notes}</p>
      </div>
    ` : ''}
  `;

  const text = `Invoice ${invoice.invoice_number}\nFrom: ${invoice.detailer_company || invoice.detailer_name}\nTo: ${invoice.customer_name}\nTotal: ${formatCurrency(invoice.total)}\nStatus: ${statusLabel}`;

  return {
    subject: `✈️ Invoice ${invoice.invoice_number} from ${invoice.detailer_company || invoice.detailer_name || 'your detailing professional'}`,
    html: emailWrapper(content, {
      headerBg: BRAND_COLOR,
      headerText: `Invoice ${invoice.invoice_number}`,
      companyName: invoice.detailer_company || invoice.detailer_name || '',
    }),
    text,
  };
}

/**
 * Follow-up reminder - sent to customer 5 days before quote expires
 */
export function followUpReminderTemplate({ clientName, aircraft, quoteUrl, expiresIn, detailerName, detailerPhone }) {
  const name = clientName || 'there';
  const aircraftDisplay = aircraft || 'your aircraft';
  const company = detailerName || 'your detailing professional';

  const phoneHtml = detailerPhone
    ? `<p style="font-size: 14px; color: #6b7280;">Or call us at <a href="tel:${detailerPhone}" style="color: #0D1B2A; font-weight: 600;">${detailerPhone}</a></p>`
    : '';

  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 8px;">&#128172;</div>
      <h2 style="margin: 0; color: #1f2937; font-size: 22px;">Just Checking In</h2>
    </div>

    <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
      Hi ${name},<br><br>
      We wanted to follow up on the quote we sent for your <strong>${aircraftDisplay}</strong> detail. The quote expires in <strong style="color: #d97706;">${expiresIn}</strong>.
    </p>

    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #92400e; font-weight: 600;">Your quote expires in ${expiresIn}</p>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #92400e;">Lock in your price before it expires</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${quoteUrl}" style="display: inline-block; background: #C9A84C; color: #0D1B2A; padding: 14px 36px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        View Your Quote
      </a>
    </div>

    ${phoneHtml}

    <p style="font-size: 13px; color: #9ca3af; text-align: center; margin-top: 20px;">
      If you have any questions or need changes to the quote, don't hesitate to reach out.
    </p>
  `;

  const text = `Hi ${name},\n\nJust following up on the quote for your ${aircraftDisplay} detail. It expires in ${expiresIn}.\n\nView your quote: ${quoteUrl}\n\nQuestions? Reply to this email or call ${detailerPhone || 'us'}.\n\n- ${company}`;

  return {
    subject: `✈️ Your ${aircraftDisplay} Quote from ${company} Expires in ${expiresIn}`,
    html: emailWrapper(content, { headerBg: BRAND_COLOR, headerText: 'Quote Reminder', companyName: company }),
    text,
  };
}

/**
 * Expiry discount - sent to customer 2 days before quote expires with a discount offer
 */
export function expiryDiscountTemplate({ clientName, aircraft, quoteUrl, discountPercent, originalPrice, discountedPrice, detailerName, detailerPhone, currency }) {
  const name = clientName || 'there';
  const aircraftDisplay = aircraft || 'your aircraft';
  const company = detailerName || 'your detailing professional';
  const original = formatCurrency(originalPrice, currency);
  const discounted = formatCurrency(discountedPrice, currency);

  const phoneHtml = detailerPhone
    ? `<p style="font-size: 14px; color: #6b7280; text-align: center;">Or call us at <a href="tel:${detailerPhone}" style="color: #0D1B2A; font-weight: 600;">${detailerPhone}</a></p>`
    : '';

  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 8px;">&#127881;</div>
      <h2 style="margin: 0; color: #1f2937; font-size: 22px;">Special Offer - ${discountPercent}% Off</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">Book before your quote expires</p>
    </div>

    <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
      Hi ${name},<br><br>
      Your quote for <strong>${aircraftDisplay}</strong> expires in <strong>2 days</strong>. Book now and save <strong style="color: #C9A84C;">${discountPercent}%</strong>!
    </p>

    <div style="background: #f8f6f0; border: 1px solid #C9A84C; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #8B7332; text-transform: uppercase; letter-spacing: 1px;">Limited Time Offer</p>
      <p style="margin: 8px 0 0 0; font-size: 16px; color: #6b7280; text-decoration: line-through;">${original}</p>
      <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: 700; color: #C9A84C;">${discounted}</p>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #8B7332; font-weight: 600;">Save ${discountPercent}%</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${quoteUrl}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 14px 36px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Claim Your Discount
      </a>
    </div>

    ${phoneHtml}

    <p style="font-size: 13px; color: #9ca3af; text-align: center; margin-top: 20px;">
      This offer expires with your quote. Don't miss out!
    </p>
  `;

  const text = `Hi ${name},\n\nYour ${aircraftDisplay} quote expires in 2 days. Book now and save ${discountPercent}%!\n\nOriginal: ${original}\nDiscounted: ${discounted}\n\nView & book: ${quoteUrl}\n\n- ${company}`;

  return {
    subject: `🎉 ${discountPercent}% Off Your ${aircraftDisplay} Detail with ${company}!`,
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: `${discountPercent}% Off - Limited Time`, companyName: company }),
    text,
  };
}

/**
 * Beta invite email template
 */
export function monthlyReportTemplate({ detailer, monthLabel, stats }) {
  const companyName = detailer?.company || detailer?.name || 'Your Business';
  const fmtCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0);

  const content = `
    <p style="font-size: 16px; color: #333; margin-bottom: 8px;">
      Here's your <strong>${monthLabel}</strong> revenue summary.
    </p>

    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); border-radius: 8px; padding: 24px; margin: 24px 0; color: #fff;">
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Revenue Summary — ${monthLabel}</p>
      <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
        <div style="text-align: center; flex: 1;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #C9A84C;">${fmtCurrency(stats.totalRevenue)}</p>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8; text-transform: uppercase;">Gross Revenue</p>
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #e2e8f0;">Jobs Completed</td>
          <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #fff; text-align: right; font-weight: 600;">${stats.jobCount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #e2e8f0;">Quotes Sent</td>
          <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #fff; text-align: right; font-weight: 600;">${stats.totalQuotes}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #e2e8f0;">Avg Job Value</td>
          <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #C9A84C; text-align: right; font-weight: 600;">${fmtCurrency(stats.avgJobValue)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #e2e8f0;">Platform Fees</td>
          <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #f87171; text-align: right; font-weight: 600;">-${fmtCurrency(stats.totalFees)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-top: 2px solid rgba(201,168,76,0.3); font-size: 15px; color: #fff; font-weight: 700;">Net Revenue</td>
          <td style="padding: 12px 0; border-top: 2px solid rgba(201,168,76,0.3); font-size: 15px; color: #C9A84C; text-align: right; font-weight: 700;">${fmtCurrency(stats.netRevenue)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${APP_URL}/reports" style="display: inline-block; background: #C9A84C; color: #0F1117; text-decoration: none; padding: 12px 32px; border-radius: 4px; font-weight: 600; font-size: 14px; letter-spacing: 0.5px;">
        View Full Reports
      </a>
    </div>

    <p style="font-size: 12px; color: #999; text-align: center;">
      You can manage this email in <a href="${APP_URL}/settings" style="color: #C9A84C;">Settings</a>.
    </p>
  `;

  const text = `${companyName} — ${monthLabel} Revenue Report\n\nGross Revenue: ${fmtCurrency(stats.totalRevenue)}\nJobs: ${stats.jobCount}\nQuotes Sent: ${stats.totalQuotes}\nPlatform Fees: ${fmtCurrency(stats.totalFees)}\nNet Revenue: ${fmtCurrency(stats.netRevenue)}\n\nView full reports: ${APP_URL}/reports`;

  return {
    subject: `${monthLabel} Revenue Report — ${fmtCurrency(stats.netRevenue)} net`,
    html: emailWrapper(content, {
      headerText: 'Monthly Report',
      companyName,
      accentColor: GOLD_COLOR,
      logoUrl: detailer?.theme_logo_url,
      fontHeading: detailer?.font_heading,
      fontBody: detailer?.font_body,
    }),
    text,
  };
}

export function betaInviteTemplate({ email, plan, durationDays, note, token }) {
  const signupUrl = `${APP_URL}/signup?invite=${token}`;
  const planLabel = plan === 'business' ? 'Business' : 'Pro';

  const content = `
    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
      You've been personally invited to try <strong>Vector Aviation</strong> — the premium quoting and client management platform built for aircraft detailing professionals.
    </p>

    <div style="background: #f8f6f0; border-left: 3px solid #C9A84C; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Your Invitation Details</p>
      <p style="margin: 0 0 4px 0; font-size: 15px; color: #333;"><strong>Plan:</strong> ${planLabel}</p>
      <p style="margin: 0 0 4px 0; font-size: 15px; color: #333;"><strong>Duration:</strong> ${durationDays} days free</p>
      <p style="margin: 0; font-size: 15px; color: #333;"><strong>Cost:</strong> $0 for the full trial period</p>
    </div>

    ${note ? `<p style="font-size: 14px; color: #555; font-style: italic; margin: 16px 0;">"${note}"</p>` : ''}

    <div style="text-align: center; margin: 32px 0;">
      <a href="${signupUrl}" style="display: inline-block; background: #C9A84C; color: #0F1117; text-decoration: none; padding: 14px 36px; border-radius: 4px; font-weight: 600; font-size: 15px; letter-spacing: 0.5px;">
        Accept Invitation
      </a>
    </div>

    <p style="font-size: 13px; color: #999; text-align: center;">
      This invite is for <strong>${email}</strong> only and can be used once.
    </p>
  `;

  const text = `You're invited to Vector Aviation!\n\nPlan: ${planLabel}\nDuration: ${durationDays} days free\nCost: $0\n\n${note ? `Note: ${note}\n\n` : ''}Accept your invitation: ${signupUrl}\n\nThis invite is for ${email} only.`;

  return {
    subject: `You're Invited to Vector Aviation — ${durationDays} Days Free`,
    html: emailWrapper(content, { headerBg: '#C9A84C', headerText: 'Beta Invitation' }),
    text,
  };
}

/**
 * Staffing alert email — sent to detailer when a far-out booking needs staff coverage
 */
export function staffingAlertTemplate({ quote, detailer, scheduledDate, daysOut }) {
  const dateStr = new Date(scheduledDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const customerName = quote.client_name || 'A customer';
  const aircraft = quote.aircraft_model || quote.aircraft_type || 'aircraft';
  const jobsUrl = `${APP_URL}/jobs`;

  const content = `
    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
      <strong>${customerName}</strong> just booked a service <strong>${daysOut} days out</strong> — you may need to assign staff coverage.
    </p>

    <div style="background: #fffbeb; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #92400e; font-size: 13px; font-weight: 600;">Date</td>
          <td style="padding: 6px 0; color: #333; font-size: 14px; text-align: right;">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #92400e; font-size: 13px; font-weight: 600;">Customer</td>
          <td style="padding: 6px 0; color: #333; font-size: 14px; text-align: right;">${customerName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #92400e; font-size: 13px; font-weight: 600;">Aircraft</td>
          <td style="padding: 6px 0; color: #333; font-size: 14px; text-align: right;">${aircraft}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${jobsUrl}" style="display: inline-block; background: #d97706; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
        Assign Staff Coverage
      </a>
    </div>

    <p style="font-size: 13px; color: #666; text-align: center;">
      You can manage staffing alerts from your dashboard.
    </p>
  `;

  const text = `Staff Coverage Needed\n\n${customerName} booked ${aircraft} for ${dateStr} (${daysOut} days out).\n\nAssign staff: ${jobsUrl}`;

  return {
    subject: `Staff Coverage Needed — ${dateStr}`,
    html: emailWrapper(content, { headerBg: '#92400e', headerText: 'Staff Coverage Needed' }),
    text,
  };
}

/**
 * Weekly digest email — sent Monday mornings
 */
export function weeklyDigestTemplate({ detailer, thisWeekJobs, needsStaffJobs, unscheduledJobs }) {
  const detailerName = detailer?.name?.split(' ')[0] || 'there';
  const dashboardUrl = `${APP_URL}/analytics`;
  const jobsUrl = `${APP_URL}/jobs`;

  function jobRow(job) {
    const date = job.scheduled_date
      ? new Date(job.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : '—';
    return `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #333;">${date}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #333;">${job.client_name || '—'}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #333;">${job.aircraft_model || job.aircraft_type || '—'}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #333;">${job.status || '—'}</td>
      </tr>
    `;
  }

  function jobTable(jobs, highlight = false) {
    const headerBg = highlight ? '#fffbeb' : '#f9fafb';
    return `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid ${highlight ? '#f59e0b' : '#e5e7eb'}; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: ${headerBg};">
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Date</th>
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Customer</th>
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Aircraft</th>
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${jobs.map(j => jobRow(j)).join('')}
        </tbody>
      </table>
    `;
  }

  let sections = '';

  if (thisWeekJobs.length > 0) {
    sections += `
      <h2 style="font-size: 16px; color: #333; margin: 24px 0 12px 0;">This Week's Jobs (${thisWeekJobs.length})</h2>
      ${jobTable(thisWeekJobs)}
    `;
  }

  if (needsStaffJobs.length > 0) {
    sections += `
      <h2 style="font-size: 16px; color: #92400e; margin: 24px 0 12px 0;">Needs Staff Assignment (${needsStaffJobs.length})</h2>
      ${jobTable(needsStaffJobs, true)}
    `;
  }

  if (unscheduledJobs.length > 0) {
    sections += `
      <h2 style="font-size: 16px; color: #333; margin: 24px 0 12px 0;">Awaiting Scheduling (${unscheduledJobs.length})</h2>
      ${jobTable(unscheduledJobs)}
    `;
  }

  const content = `
    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
      Hey ${detailerName}, here's your weekly overview.
    </p>

    ${sections || '<p style="font-size: 14px; color: #666; text-align: center; padding: 20px;">All clear — no jobs to report this week.</p>'}

    <div style="text-align: center; margin: 28px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: ${GOLD_COLOR}; color: #0D1B2A; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
        View Dashboard
      </a>
    </div>
  `;

  const totalJobs = thisWeekJobs.length + needsStaffJobs.length + unscheduledJobs.length;
  const text = `Weekly Digest\n\nThis week: ${thisWeekJobs.length} jobs\nNeeds staff: ${needsStaffJobs.length}\nAwaiting scheduling: ${unscheduledJobs.length}\n\nView dashboard: ${dashboardUrl}`;

  return {
    subject: `Weekly Digest — ${totalJobs} item${totalJobs !== 1 ? 's' : ''} to review`,
    html: emailWrapper(content, { headerBg: BRAND_COLOR, headerText: 'Weekly Digest' }),
    text,
  };
}

/**
 * Customer introduction email — sent when a detailer invites their first customer during onboarding
 */
export function customerIntroTemplate({ customerName, detailerCompany, detailerName }) {
  const firstName = customerName ? customerName.split(' ')[0] : '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,';

  const content = `
    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
      ${greeting}
    </p>

    <p style="font-size: 15px; color: #333; line-height: 1.6; margin-bottom: 20px;">
      <strong>${detailerCompany}</strong> has invited you to <strong>Vector</strong>, their aircraft detailing management platform.
    </p>

    <p style="font-size: 15px; color: #333; line-height: 1.6; margin-bottom: 20px;">
      Going forward, you'll receive professional quotes, invoices, and service updates through Vector. No action is needed on your end — when ${detailerName || detailerCompany} sends you a quote, you'll receive it directly to this email.
    </p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="font-size: 14px; color: #555; margin: 0 0 12px 0; font-weight: 600;">What to expect:</p>
      <ul style="font-size: 14px; color: #555; line-height: 1.8; margin: 0; padding-left: 20px;">
        <li>Professional quotes with detailed service breakdowns</li>
        <li>Easy online acceptance and scheduling</li>
        <li>Secure payment processing</li>
        <li>Service history and documentation</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${APP_URL}" style="display: inline-block; background: ${GOLD_COLOR}; color: #0D1B2A; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
        Learn More About Vector
      </a>
    </div>

    <p style="font-size: 14px; color: #666; line-height: 1.6;">
      If you have questions, simply reply to this email to reach ${detailerName || detailerCompany} directly.
    </p>
  `;

  const text = `${greeting}\n\n${detailerCompany} has invited you to Vector, their aircraft detailing management platform.\n\nGoing forward, you'll receive professional quotes, invoices, and service updates through Vector.\n\nLearn more: ${APP_URL}`;

  return {
    subject: `${detailerCompany} is now on Vector`,
    html: emailWrapper(content, { headerBg: BRAND_COLOR, headerText: 'Welcome to Vector', companyName: detailerCompany }),
    text,
  };
}

/**
 * FOLLOW-UP: NOT VIEWED - Sent when customer hasn't opened quote after X days
 */
export function followupNotViewedTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const quoteLink = share_link ? `${APP_URL}/q/${share_link}` : APP_URL;

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      You have a quote waiting from ${companyName} for your ${aircraftDisplay} — ${amount}.
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${companyName}</strong> sent you a quote for your <strong>${aircraftDisplay}</strong> detail. It's ready for your review!
    </p>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #0D1B2A;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${quoteLink}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        View Your Quote
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Questions? Reply to this email or contact ${companyName} directly.
    </p>
  `;

  const text = `Hi${client_name ? ` ${client_name}` : ''},\n\n${companyName} sent you a quote for your ${aircraftDisplay} detail. It's ready for your review!\n\nAircraft: ${aircraftDisplay}\nProvider: ${companyName}\nQuote Total: ${amount}\n\nView your quote: ${quoteLink}\n\nQuestions? Reply to this email or contact ${companyName} directly.`;

  return {
    subject: `You have a quote waiting from ${companyName}`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || GOLD_COLOR, headerText: 'Quote Waiting For You', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * FOLLOW-UP: VIEWED NOT ACCEPTED - Sent when customer viewed but hasn't accepted after X days
 */
export function followupViewedNotAcceptedTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, valid_until } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const quoteLink = share_link ? `${APP_URL}/q/${share_link}` : APP_URL;
  const validDate = valid_until ? new Date(valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Still interested in your ${aircraftDisplay} detail? Your ${amount} quote from ${companyName} is ready to go.
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      We noticed you checked out your <strong>${aircraftDisplay}</strong> quote from <strong>${companyName}</strong>. Still interested? Your quote is ready whenever you are.
    </p>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        ${validDate ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Valid Until:</td>
          <td style="padding: 8px 0; text-align: right;">${validDate}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #0D1B2A;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${quoteLink}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        View Quote &amp; Book Now
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Have questions? Reply to this email to reach ${companyName} directly.
    </p>
  `;

  const text = `Hi${client_name ? ` ${client_name}` : ''},\n\nWe noticed you checked out your ${aircraftDisplay} quote from ${companyName}. Still interested? Your quote is ready whenever you are.\n\nAircraft: ${aircraftDisplay}\nProvider: ${companyName}\n${validDate ? `Valid Until: ${validDate}\n` : ''}Quote Total: ${amount}\n\nView your quote: ${quoteLink}\n\nHave questions? Reply to this email to reach ${companyName} directly.`;

  return {
    subject: `Still interested in your ${aircraftDisplay} detail?`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || GOLD_COLOR, headerText: 'Still Interested?', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * FOLLOW-UP: EXPIRY WARNING - Sent X days before quote expires
 */
export function followupExpiryWarningTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, valid_until } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const quoteLink = share_link ? `${APP_URL}/q/${share_link}` : APP_URL;
  const expiryDate = valid_until
    ? new Date(valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'soon';
  const daysLeft = valid_until ? Math.max(0, Math.ceil((new Date(valid_until) - new Date()) / (1000 * 60 * 60 * 24))) : 0;

  const content = `
    <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Your ${aircraftDisplay} quote expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}! Lock in your ${amount} price before it's gone.
    </div>

    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 8px;">&#9200;</div>
      <h2 style="margin: 0; color: #1f2937; font-size: 22px;">Your Quote Expires ${daysLeft <= 1 ? 'Tomorrow' : `in ${daysLeft} Days`}</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">Act now to lock in your price</p>
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your quote from <strong>${companyName}</strong> for your <strong>${aircraftDisplay}</strong> expires on <strong style="color: #d97706;">${expiryDate}</strong>. Don't miss out on this price!
    </p>

    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <p style="margin: 0; font-size: 13px; color: #92400e;">Quote Total</p>
          <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: 700; color: #92400e;">${amount}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; font-size: 13px; color: #92400e;">Expires</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #92400e;">${expiryDate}</p>
        </div>
      </div>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${quoteLink}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        View Quote Before It Expires
      </a>
    </div>

    <p style="font-size: 13px; color: #9ca3af; text-align: center;">
      After the expiration date, this quote will no longer be valid and pricing may change.
    </p>
  `;

  const text = `Hi${client_name ? ` ${client_name}` : ''},\n\nYour quote from ${companyName} for your ${aircraftDisplay} (${amount}) expires on ${expiryDate}.\n\nDon't miss out — view and accept your quote before it expires.\n\nView your quote: ${quoteLink}\n\nAfter the expiration date, this quote will no longer be valid and pricing may change.`;

  return {
    subject: `Your ${aircraftDisplay} quote expires ${daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`}!`,
    html: emailWrapper(content, { headerBg: detailer?.theme_accent || WARNING_COLOR, headerText: 'Quote Expiring Soon', companyName, unsubscribeEmail: detailer?.email, accentColor: detailer?.theme_primary, logoUrl: detailer?.theme_logo_url, fontHeading: detailer?.font_heading, fontBody: detailer?.font_body }),
    text,
  };
}

/**
 * REFERRAL REWARD — Sent to the referrer when their referral completes first paid quote
 */
export function referralRewardReferrerTemplate({ referrer, referredName, pointsEarned }) {
  const name = referrer?.name || 'there';
  const dashboardUrl = `${APP_URL}/referrals`;

  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 8px;">&#127881;</div>
      <h2 style="margin: 0; color: #1f2937; font-size: 22px;">Referral Reward Earned!</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">Your referral just completed their first job</p>
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi ${name},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! <strong>${referredName}</strong> just completed their first paid quote on Vector. As a thank you for the referral, here's what you've earned:
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 14px; color: #166534;">Bonus Points</span>
        <span style="font-size: 20px; font-weight: 700; color: #166534;">${pointsEarned.toLocaleString()} pts</span>
      </div>
      <div style="border-top: 1px solid #bbf7d0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 14px; color: #166534;">Free Pro Access</span>
        <span style="font-size: 20px; font-weight: 700; color: #166534;">+30 days</span>
      </div>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 24px;">
      Keep sharing your referral link to earn more rewards. Each successful referral earns you points and extends your Pro access.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
        View Your Referrals
      </a>
    </div>
  `;

  const text = `Hi ${name},\n\nGreat news! ${referredName} just completed their first paid quote on Vector.\n\nYou've earned:\n- ${pointsEarned.toLocaleString()} bonus points\n- 30 days of free Pro access\n\nKeep sharing your referral link to earn more rewards.\n\nView your referrals: ${dashboardUrl}`;

  return {
    subject: `You earned ${pointsEarned.toLocaleString()} points from a referral!`,
    html: emailWrapper(content, { headerText: 'Referral Reward', accentColor: '#22c55e' }),
    text,
  };
}

/**
 * REFERRAL REWARD — Sent to the referred user when they complete first paid quote
 */
export function referralRewardReferredTemplate({ referred, pointsEarned }) {
  const name = referred?.name || 'there';
  const dashboardUrl = `${APP_URL}/dashboard`;

  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 8px;">&#127775;</div>
      <h2 style="margin: 0; color: #1f2937; font-size: 22px;">Welcome Bonus Earned!</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">Congratulations on your first paid quote</p>
    </div>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi ${name},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Congratulations on completing your first paid quote on Vector! As part of our referral program, you've earned a welcome bonus:
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #166534;">Welcome Bonus</p>
      <p style="margin: 8px 0 0 0; font-size: 28px; font-weight: 700; color: #166534;">${pointsEarned.toLocaleString()} points</p>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 24px;">
      You can earn more points by sending quotes, completing jobs, and referring other detailers. Points can be redeemed for Pro plan upgrades and other rewards.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C 0%, #a88b3a 100%); color: #0D1B2A; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
        Go to Dashboard
      </a>
    </div>
  `;

  const text = `Hi ${name},\n\nCongratulations on completing your first paid quote on Vector!\n\nYou've earned a welcome bonus of ${pointsEarned.toLocaleString()} points.\n\nYou can earn more points by sending quotes, completing jobs, and referring other detailers.\n\nGo to your dashboard: ${dashboardUrl}`;

  return {
    subject: `Welcome bonus: ${pointsEarned.toLocaleString()} points earned!`,
    html: emailWrapper(content, { headerText: 'Welcome Bonus', accentColor: '#22c55e' }),
    text,
  };
}
