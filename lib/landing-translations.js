const translations = {
  en: {
    nav: { features: 'Features', pricing: 'Pricing', faq: 'FAQ', signIn: 'Sign In', startFree: 'Join Now' },
    hero: {
      badge: 'Now in Beta \u2014 Founding Member Pricing',
      headline: 'The CRM Built for',
      headlineHighlight: 'Aircraft Detailers',
      sub: 'Quote in 60 seconds. Get paid instantly. Grow your business.',
      cta: 'Join as a Founding Member',
      cta2: 'See How It Works',
      noCc: 'First 50 detailers get founding member status \u2014 locked-in Pro pricing forever.',
    },
    mockup: { quotes: 'Quotes This Month', revenue: 'Revenue Booked', conversion: 'Conversion Rate', recentQuote: 'Recent Quote: Gulfstream G450' },
    problems: [
      { title: 'Stop Wasting Hours on Quotes', desc: 'No more spreadsheets, calculators, or back-of-napkin math. Vector automates the entire process.' },
      { title: '208 Aircraft, Your Hours', desc: 'Default hours for 208 aircraft from a Robinson R22 to a Boeing 747. Use ours, upload yours, or adjust per job.' },
      { title: 'Your Rate \u00D7 Your Hours', desc: 'Set your hourly rate. Pick the aircraft. Adjust the hours if you want. Vector handles the math \u2014 you control the numbers.' },
    ],
    howItWorks: { title: 'How It Works', sub: 'From setup to getting paid \u2014 three simple steps.' },
    steps: [
      { title: 'Add Your Services & Rates', desc: 'Set up your service menu and hourly rates. Exterior wash, ceramic coating, interior detail \u2014 whatever you offer.' },
      { title: 'Select Aircraft, Build Quote', desc: 'Choose from 208 pre-loaded aircraft or add your own hours. Vector calculates the price \u2014 you stay in control.' },
      { title: 'Send to Client, Get Paid', desc: 'Email the quote. Your client views a professional branded page and pays online with one click.' },
    ],
    features: {
      title: 'Everything You Need to Run Your Business',
      sub: 'Built specifically for aircraft detailers. Quoting, payments, team management, customer engagement, and analytics \u2014 all in one platform.',
      items: [
        { title: '208 Aircraft Database', desc: 'Pre-loaded hours for 208 aircraft \u2014 or upload your own. Use our defaults as a starting point and adjust per job.' },
        { title: 'Instant Quoting', desc: 'Select aircraft, pick services, adjust hours if needed. Your hourly rate times your hours equals an accurate quote in 60 seconds.' },
        { title: 'Email Delivery', desc: 'Send professional quotes directly to clients via email. Track when they view it.' },
        { title: 'Get Paid Online', desc: 'Stripe payments built right into every quote. Clients accept and pay with one click.' },
        { title: 'Calendar & Scheduling', desc: 'Track all your jobs in one place. Never double-book or miss an appointment.' },
        { title: 'Track Your Growth', desc: 'ROI dashboard, revenue analytics, points, and rewards. Watch your business grow.' },
      ],
    },
    pricing: {
      title: 'Simple, Transparent Pricing',
      sub: 'Start free and upgrade as you grow. No hidden fees, no long-term contracts.',
      monthly: 'Monthly',
      annual: 'Annual',
      mo: '/mo',
      save: 'Save',
      yr: '/yr',
      billed: 'Billed',
      year: '/year',
      mostPopular: 'MOST POPULAR',
      footer: 'All plans include Stripe payment processing. Platform fee covers payment processing, hosting, and support.',
      tiers: [
        { name: 'Free', desc: 'Try Vector risk-free', cta: 'Start Free', features: ['3 quotes/month', '208 aircraft database', 'Email quotes', 'Stripe payments', '5% platform fee'] },
        { name: 'Pro', desc: 'For full-time detailers', cta: 'Go Pro', features: ['Unlimited quotes', '208 aircraft database', 'Email quotes', 'Email notifications', 'Remove Vector branding', 'Calendar & scheduling', 'Priority support', '2% platform fee'] },
        { name: 'Business', desc: 'For teams & high-volume shops', cta: 'Get Business', features: ['Everything in Pro', 'Multi-user access', 'Vendor portal', 'API access', 'ROI analytics', 'Dedicated support', '1% platform fee'] },
      ],
    },
    testimonials: {
      title: 'Built by a Detailer, for Detailers',
    },
    faqs: {
      title: 'Frequently Asked Questions',
      items: [
        { q: 'How does pricing work?', a: 'Vector multiplies your hourly rate by the service hours for each aircraft. We pre-load default hours for 208 models, but you can upload your own or adjust hours on any quote.' },
        { q: 'Can I customize my services?', a: 'Absolutely. Add any service you offer \u2014 exterior wash, interior detail, ceramic coating, brightwork, decon, or create your own. Bundle them into packages with automatic discounts.' },
        { q: 'What payment methods do you accept?', a: 'Clients pay via Stripe \u2014 all major credit cards, Apple Pay, and Google Pay. Funds go directly to your connected Stripe account.' },
        { q: 'Is there a long-term contract?', a: 'No contracts. Start free, upgrade anytime, cancel anytime. The free plan is free forever with up to 3 quotes per month.' },
        { q: 'How accurate are the aircraft hours?', a: 'Our database covers 208 aircraft with default hours derived from real-world detailing data. You can use the defaults, upload your own, or adjust per quote.' },
      ],
    },
    footerCta: {
      title: 'Be One of the First 50 Founding Members',
      sub: 'Vector is in beta. Join now and lock in Pro pricing forever as a founding member. Built by a professional aircraft detailer with 15+ years of experience in the industry.',
      cta: 'Join as a Founding Member',
    },
    footer: {
      by: 'by Vector Aviation',
      copy: '\u00A9 2026 Vector Aviation Software. All rights reserved.',
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
      contact: 'Contact',
    },
  },

  es: {
    nav: { features: 'Funciones', pricing: 'Precios', faq: 'FAQ', signIn: 'Iniciar Sesi\u00F3n', startFree: 'Empezar Gratis' },
    hero: {
      badge: 'Dise\u00F1ado para Detalladores de Aeronaves',
      headline: 'Software de Cotizaci\u00F3n para',
      headlineHighlight: 'Detalladores de Aeronaves',
      sub: 'Crea cotizaciones profesionales en 60 segundos. Cobra m\u00E1s r\u00E1pido. Haz crecer tu negocio.',
      cta: 'Prueba Gratis',
      cta2: 'Ver C\u00F3mo Funciona',
      noCc: 'Sin tarjeta de cr\u00E9dito. Plan gratuito disponible para siempre.',
    },
    mockup: { quotes: 'Cotizaciones Este Mes', revenue: 'Ingresos Reservados', conversion: 'Tasa de Conversi\u00F3n', recentQuote: 'Cotizaci\u00F3n Reciente: Gulfstream G450' },
    problems: [
      { title: 'Deja de Perder Horas en Cotizaciones', desc: 'No m\u00E1s hojas de c\u00E1lculo ni calculadoras. Vector automatiza todo el proceso.' },
      { title: '208 Aeronaves, Tus Horas', desc: 'Horas predeterminadas para 208 aeronaves. Usa las nuestras, sube las tuyas o ajusta por trabajo.' },
      { title: 'Tu Tarifa \u00D7 Tus Horas', desc: 'Establece tu tarifa por hora. Elige la aeronave. Ajusta las horas. Vector hace el c\u00E1lculo.' },
    ],
    howItWorks: { title: 'C\u00F3mo Funciona', sub: 'De la configuraci\u00F3n al cobro \u2014 tres pasos simples.' },
    steps: [
      { title: 'Agrega Tus Servicios y Tarifas', desc: 'Configura tu men\u00FA de servicios y tarifas por hora. Lavado exterior, cer\u00E1mica, detallado interior \u2014 lo que ofrezcas.' },
      { title: 'Selecciona Aeronave, Crea Cotizaci\u00F3n', desc: 'Elige entre 208 aeronaves precargadas o agrega tus propias horas. Vector calcula el precio.' },
      { title: 'Env\u00EDa al Cliente, Cobra', desc: 'Env\u00EDa la cotizaci\u00F3n por email. Tu cliente ve una p\u00E1gina profesional y paga en l\u00EDnea con un clic.' },
    ],
    features: {
      title: 'Todo lo que Necesitas para Cotizar, Reservar y Crecer',
      sub: 'Dise\u00F1ado espec\u00EDficamente para detalladores de aeronaves.',
      items: [
        { title: 'Base de Datos de 208 Aeronaves', desc: 'Horas precargadas para 208 aeronaves. Usa nuestros valores o sube los tuyos.' },
        { title: 'Cotizaci\u00F3n Instant\u00E1nea', desc: 'Selecciona aeronave, elige servicios, ajusta horas. Cotizaci\u00F3n precisa en 60 segundos.' },
        { title: 'Env\u00EDo por Email', desc: 'Env\u00EDa cotizaciones profesionales directamente a tus clientes. Rastrea cu\u00E1ndo las ven.' },
        { title: 'Cobra en L\u00EDnea', desc: 'Pagos con Stripe integrados en cada cotizaci\u00F3n. Los clientes aceptan y pagan con un clic.' },
        { title: 'Calendario y Programaci\u00F3n', desc: 'Rastrea todos tus trabajos en un solo lugar. Nunca pierdas una cita.' },
        { title: 'Rastrea Tu Crecimiento', desc: 'Panel de ROI, an\u00E1lisis de ingresos, puntos y recompensas. Observa c\u00F3mo crece tu negocio.' },
      ],
    },
    pricing: {
      title: 'Precios Simples y Transparentes',
      sub: 'Comienza gratis y actualiza a medida que crezcas. Sin tarifas ocultas.',
      monthly: 'Mensual', annual: 'Anual', mo: '/mes', save: 'Ahorra', yr: '/a\u00F1o', billed: 'Facturado', year: '/a\u00F1o', mostPopular: 'M\u00C1S POPULAR',
      footer: 'Todos los planes incluyen procesamiento de pagos con Stripe.',
      tiers: [
        { name: 'Gratis', desc: 'Prueba Vector sin riesgo', cta: 'Empezar Gratis', features: ['3 cotizaciones/mes', 'Base de datos de 208 aeronaves', 'Cotizaciones por email', 'Pagos con Stripe', '5% comisi\u00F3n'] },
        { name: 'Pro', desc: 'Para detalladores a tiempo completo', cta: 'Ir a Pro', features: ['Cotizaciones ilimitadas', 'Base de datos de 208 aeronaves', 'Email cotizaciones', 'Notificaciones por email', 'Sin marca Vector', 'Calendario', 'Soporte prioritario', '2% comisi\u00F3n'] },
        { name: 'Business', desc: 'Para equipos y talleres', cta: 'Obtener Business', features: ['Todo en Pro', 'Acceso multiusuario', 'Portal de proveedores', 'Acceso API', 'An\u00E1lisis ROI', 'Soporte dedicado', '1% comisi\u00F3n'] },
      ],
    },
    testimonials: {
      title: 'Lo que Dicen los Detalladores',
      items: [
        { quote: 'Vector me ahorra 10 horas a la semana en cotizaciones. Antes pasaba 30 minutos por cotizaci\u00F3n \u2014 ahora toma 60 segundos.', name: 'Detallador de Aeronaves', location: 'Scottsdale, AZ' },
        { quote: 'La base de datos de aeronaves cambi\u00F3 todo. Empec\u00E9 con las horas predeterminadas y ahora tengo mis propios n\u00FAmeros para cada modelo.', name: 'Due\u00F1o de Negocio', location: 'Van Nuys, CA' },
        { quote: 'A mis clientes les encanta recibir cotizaciones profesionales que pueden aceptar y pagar en l\u00EDnea.', name: 'Detallador de Aviaci\u00F3n', location: 'Teterboro, NJ' },
      ],
    },
    faqs: {
      title: 'Preguntas Frecuentes',
      items: [
        { q: '\u00BFC\u00F3mo funciona el precio?', a: 'Vector multiplica tu tarifa por hora por las horas de servicio de cada aeronave. Precargamos horas para 208 modelos.' },
        { q: '\u00BFPuedo personalizar mis servicios?', a: 'Absolutamente. Agrega cualquier servicio que ofrezcas y crea paquetes con descuentos autom\u00E1ticos.' },
        { q: '\u00BFQu\u00E9 m\u00E9todos de pago aceptan?', a: 'Los clientes pagan por Stripe \u2014 tarjetas de cr\u00E9dito, Apple Pay y Google Pay.' },
        { q: '\u00BFHay contrato a largo plazo?', a: 'Sin contratos. Comienza gratis, actualiza cuando quieras, cancela cuando quieras.' },
        { q: '\u00BFQu\u00E9 tan precisas son las horas?', a: 'Nuestra base cubre 208 aeronaves con datos reales. Puedes usar los valores predeterminados o subir los tuyos.' },
      ],
    },
    footerCta: {
      title: '\u00BFListo para Hacer Crecer tu Negocio?',
      sub: '\u00DAnete a profesionales que ahorran horas cada semana con Vector. Comienza gratis.',
      cta: 'Prueba Gratis',
    },
    footer: { by: 'por Vector Aviation', copy: '\u00A9 2026 Vector Aviation Software. Todos los derechos reservados.', terms: 'T\u00E9rminos', privacy: 'Privacidad', contact: 'Contacto' },
  },

  pt: {
    nav: { features: 'Recursos', pricing: 'Pre\u00E7os', faq: 'FAQ', signIn: 'Entrar', startFree: 'Come\u00E7ar Gr\u00E1tis' },
    hero: {
      badge: 'Feito para Detalhadores de Aeronaves',
      headline: 'Software de Or\u00E7amentos para',
      headlineHighlight: 'Detalhadores de Aeronaves',
      sub: 'Crie or\u00E7amentos profissionais em 60 segundos. Receba mais r\u00E1pido. Cres\u00E7a seu neg\u00F3cio.',
      cta: 'Teste Gr\u00E1tis',
      cta2: 'Veja Como Funciona',
      noCc: 'Sem cart\u00E3o de cr\u00E9dito. Plano gratuito dispon\u00EDvel para sempre.',
    },
    mockup: { quotes: 'Or\u00E7amentos Este M\u00EAs', revenue: 'Receita Reservada', conversion: 'Taxa de Convers\u00E3o', recentQuote: 'Or\u00E7amento Recente: Gulfstream G450' },
    problems: [
      { title: 'Pare de Perder Horas em Or\u00E7amentos', desc: 'Sem mais planilhas ou calculadoras. O Vector automatiza todo o processo.' },
      { title: '208 Aeronaves, Suas Horas', desc: 'Horas padr\u00E3o para 208 aeronaves. Use as nossas, envie as suas ou ajuste por trabalho.' },
      { title: 'Sua Taxa \u00D7 Suas Horas', desc: 'Defina sua taxa hor\u00E1ria. Escolha a aeronave. Ajuste as horas. O Vector faz a conta.' },
    ],
    howItWorks: { title: 'Como Funciona', sub: 'Da configura\u00E7\u00E3o ao pagamento \u2014 tr\u00EAs passos simples.' },
    steps: [
      { title: 'Adicione Seus Servi\u00E7os e Taxas', desc: 'Configure seu menu de servi\u00E7os e taxas hor\u00E1rias. Lavagem externa, cer\u00E2mica, detalhamento interno.' },
      { title: 'Selecione Aeronave, Crie Or\u00E7amento', desc: 'Escolha entre 208 aeronaves pr\u00E9-carregadas. O Vector calcula o pre\u00E7o.' },
      { title: 'Envie ao Cliente, Receba', desc: 'Envie o or\u00E7amento por email. Seu cliente paga online com um clique.' },
    ],
    features: {
      title: 'Tudo que Voc\u00EA Precisa para Or\u00E7ar, Agendar e Crescer',
      sub: 'Feito especificamente para detalhadores de aeronaves.',
      items: [
        { title: 'Banco de Dados de 208 Aeronaves', desc: 'Horas pr\u00E9-carregadas para 208 aeronaves. Use nossos padr\u00F5es ou envie os seus.' },
        { title: 'Or\u00E7amento Instant\u00E2neo', desc: 'Selecione aeronave, escolha servi\u00E7os, ajuste horas. Or\u00E7amento preciso em 60 segundos.' },
        { title: 'Envio por Email', desc: 'Envie or\u00E7amentos profissionais diretamente aos clientes. Rastreie quando visualizam.' },
        { title: 'Receba Online', desc: 'Pagamentos Stripe integrados em cada or\u00E7amento. Clientes aceitam e pagam com um clique.' },
        { title: 'Calend\u00E1rio e Agenda', desc: 'Acompanhe todos os seus trabalhos em um s\u00F3 lugar.' },
        { title: 'Acompanhe Seu Crescimento', desc: 'Painel de ROI, an\u00E1lises de receita, pontos e recompensas.' },
      ],
    },
    pricing: {
      title: 'Pre\u00E7os Simples e Transparentes',
      sub: 'Comece gr\u00E1tis e fa\u00E7a upgrade conforme cresce.',
      monthly: 'Mensal', annual: 'Anual', mo: '/m\u00EAs', save: 'Economize', yr: '/ano', billed: 'Cobrado', year: '/ano', mostPopular: 'MAIS POPULAR',
      footer: 'Todos os planos incluem processamento de pagamentos Stripe.',
      tiers: [
        { name: 'Gr\u00E1tis', desc: 'Experimente sem risco', cta: 'Come\u00E7ar Gr\u00E1tis', features: ['3 or\u00E7amentos/m\u00EAs', 'Banco de 208 aeronaves', 'Or\u00E7amentos por email', 'Pagamentos Stripe', '5% taxa'] },
        { name: 'Pro', desc: 'Para detalhadores em tempo integral', cta: 'Ir para Pro', features: ['Or\u00E7amentos ilimitados', 'Banco de 208 aeronaves', 'Email or\u00E7amentos', 'Notifica\u00E7\u00F5es por email', 'Sem marca Vector', 'Calend\u00E1rio', 'Suporte priorit\u00E1rio', '2% taxa'] },
        { name: 'Business', desc: 'Para equipes e oficinas', cta: 'Obter Business', features: ['Tudo no Pro', 'Acesso multiusu\u00E1rio', 'Portal de fornecedores', 'Acesso API', 'An\u00E1lise ROI', 'Suporte dedicado', '1% taxa'] },
      ],
    },
    testimonials: {
      title: 'O que os Detalhadores Dizem',
      items: [
        { quote: 'O Vector me economiza 10 horas por semana em or\u00E7amentos. Antes eu gastava 30 minutos por or\u00E7amento.', name: 'Detalhador de Aeronaves', location: 'Scottsdale, AZ' },
        { quote: 'O banco de dados de aeronaves mudou tudo. Comecei com as horas padr\u00E3o e agora tenho meus pr\u00F3prios n\u00FAmeros.', name: 'Dono de Neg\u00F3cio', location: 'Van Nuys, CA' },
        { quote: 'Meus clientes adoram receber or\u00E7amentos profissionais que podem aceitar e pagar online.', name: 'Detalhador de Avia\u00E7\u00E3o', location: 'Teterboro, NJ' },
      ],
    },
    faqs: {
      title: 'Perguntas Frequentes',
      items: [
        { q: 'Como funciona o pre\u00E7o?', a: 'O Vector multiplica sua taxa hor\u00E1ria pelas horas de servi\u00E7o de cada aeronave.' },
        { q: 'Posso personalizar meus servi\u00E7os?', a: 'Com certeza. Adicione qualquer servi\u00E7o e crie pacotes com descontos autom\u00E1ticos.' },
        { q: 'Quais m\u00E9todos de pagamento aceitam?', a: 'Clientes pagam via Stripe \u2014 cart\u00F5es de cr\u00E9dito, Apple Pay e Google Pay.' },
        { q: 'Existe contrato de longo prazo?', a: 'Sem contratos. Comece gr\u00E1tis, fa\u00E7a upgrade ou cancele a qualquer momento.' },
        { q: 'Qu\u00E3o precisas s\u00E3o as horas?', a: 'Nosso banco cobre 208 aeronaves com dados reais. Use os padr\u00F5es ou envie os seus.' },
      ],
    },
    footerCta: {
      title: 'Pronto para Crescer Seu Neg\u00F3cio?',
      sub: 'Junte-se aos profissionais que economizam horas toda semana com o Vector.',
      cta: 'Teste Gr\u00E1tis',
    },
    footer: { by: 'por Vector Aviation', copy: '\u00A9 2026 Vector Aviation Software. Todos os direitos reservados.', terms: 'Termos', privacy: 'Privacidade', contact: 'Contato' },
  },

  fr: {
    nav: { features: 'Fonctions', pricing: 'Tarifs', faq: 'FAQ', signIn: 'Connexion', startFree: 'Essai Gratuit' },
    hero: {
      badge: 'Con\u00E7u pour les D\u00E9tailleurs d\'A\u00E9ronefs',
      headline: 'Logiciel de Devis pour',
      headlineHighlight: 'D\u00E9tailleurs d\'A\u00E9ronefs',
      sub: 'Cr\u00E9ez des devis professionnels en 60 secondes. Soyez pay\u00E9 plus vite. D\u00E9veloppez votre activit\u00E9.',
      cta: 'Essai Gratuit',
      cta2: 'Voir Comment \u00C7a Marche',
      noCc: 'Sans carte de cr\u00E9dit. Plan gratuit disponible pour toujours.',
    },
    mockup: { quotes: 'Devis Ce Mois', revenue: 'Chiffre d\'Affaires', conversion: 'Taux de Conversion', recentQuote: 'Devis R\u00E9cent : Gulfstream G450' },
    problems: [
      { title: 'Arr\u00EAtez de Perdre des Heures', desc: 'Plus de tableurs ni de calculatrices. Vector automatise tout le processus.' },
      { title: '208 A\u00E9ronefs, Vos Heures', desc: 'Heures par d\u00E9faut pour 208 a\u00E9ronefs. Utilisez les n\u00F4tres, importez les v\u00F4tres ou ajustez par travail.' },
      { title: 'Votre Tarif \u00D7 Vos Heures', desc: 'D\u00E9finissez votre tarif horaire. Choisissez l\'a\u00E9ronef. Ajustez les heures. Vector fait le calcul.' },
    ],
    howItWorks: { title: 'Comment \u00C7a Marche', sub: 'De la configuration au paiement \u2014 trois \u00E9tapes simples.' },
    steps: [
      { title: 'Ajoutez Vos Services et Tarifs', desc: 'Configurez votre menu de services et tarifs horaires. Lavage ext\u00E9rieur, c\u00E9ramique, d\u00E9taillage int\u00E9rieur.' },
      { title: 'S\u00E9lectionnez l\'A\u00E9ronef, Cr\u00E9ez le Devis', desc: 'Choisissez parmi 208 a\u00E9ronefs pr\u00E9charg\u00E9s. Vector calcule le prix.' },
      { title: 'Envoyez au Client, Soyez Pay\u00E9', desc: 'Envoyez le devis par email. Votre client consulte une page professionnelle et paie en ligne.' },
    ],
    features: {
      title: 'Tout Ce Dont Vous Avez Besoin',
      sub: 'Con\u00E7u sp\u00E9cifiquement pour les d\u00E9tailleurs d\'a\u00E9ronefs.',
      items: [
        { title: 'Base de 208 A\u00E9ronefs', desc: 'Heures pr\u00E9charg\u00E9es pour 208 a\u00E9ronefs. Utilisez nos valeurs ou importez les v\u00F4tres.' },
        { title: 'Devis Instantan\u00E9', desc: 'S\u00E9lectionnez l\'a\u00E9ronef, choisissez les services. Devis pr\u00E9cis en 60 secondes.' },
        { title: 'Envoi par Email', desc: 'Envoyez des devis professionnels directement \u00E0 vos clients.' },
        { title: 'Paiement en Ligne', desc: 'Paiements Stripe int\u00E9gr\u00E9s. Les clients acceptent et paient en un clic.' },
        { title: 'Calendrier et Planning', desc: 'Suivez tous vos travaux au m\u00EAme endroit.' },
        { title: 'Suivez Votre Croissance', desc: 'Tableau de bord ROI, analyses de revenus, points et r\u00E9compenses.' },
      ],
    },
    pricing: {
      title: 'Tarifs Simples et Transparents',
      sub: 'Commencez gratuitement et \u00E9voluez. Sans frais cach\u00E9s.',
      monthly: 'Mensuel', annual: 'Annuel', mo: '/mois', save: '\u00C9conomisez', yr: '/an', billed: 'Factur\u00E9', year: '/an', mostPopular: 'LE PLUS POPULAIRE',
      footer: 'Tous les plans incluent le traitement des paiements Stripe.',
      tiers: [
        { name: 'Gratuit', desc: 'Essayez Vector sans risque', cta: 'Commencer', features: ['3 devis/mois', 'Base de 208 a\u00E9ronefs', 'Devis par email', 'Paiements Stripe', '5% commission'] },
        { name: 'Pro', desc: 'Pour les d\u00E9tailleurs \u00E0 plein temps', cta: 'Passer Pro', features: ['Devis illimit\u00E9s', 'Base de 208 a\u00E9ronefs', 'Devis par email', 'Notifications par email', 'Sans marque Vector', 'Calendrier', 'Support prioritaire', '2% commission'] },
        { name: 'Business', desc: 'Pour les \u00E9quipes', cta: 'Obtenir Business', features: ['Tout dans Pro', 'Acc\u00E8s multi-utilisateurs', 'Portail fournisseurs', 'Acc\u00E8s API', 'Analyses ROI', 'Support d\u00E9di\u00E9', '1% commission'] },
      ],
    },
    testimonials: {
      title: 'Ce que Disent les D\u00E9tailleurs',
      items: [
        { quote: 'Vector m\'\u00E9conomise 10 heures par semaine. Avant, je passais 30 minutes par devis \u2014 maintenant \u00E7a prend 60 secondes.', name: 'D\u00E9tailleur d\'A\u00E9ronefs', location: 'Scottsdale, AZ' },
        { quote: 'La base de donn\u00E9es d\'a\u00E9ronefs a tout chang\u00E9. J\'ai commenc\u00E9 avec les heures par d\u00E9faut et maintenant j\'ai mes propres chiffres.', name: 'Propri\u00E9taire d\'Entreprise', location: 'Van Nuys, CA' },
        { quote: 'Mes clients adorent recevoir des devis professionnels qu\'ils peuvent accepter et payer en ligne.', name: 'D\u00E9tailleur Aviation', location: 'Teterboro, NJ' },
      ],
    },
    faqs: {
      title: 'Questions Fr\u00E9quentes',
      items: [
        { q: 'Comment fonctionnent les tarifs ?', a: 'Vector multiplie votre tarif horaire par les heures de service pour chaque a\u00E9ronef.' },
        { q: 'Puis-je personnaliser mes services ?', a: 'Absolument. Ajoutez n\'importe quel service et cr\u00E9ez des forfaits avec remises automatiques.' },
        { q: 'Quels modes de paiement acceptez-vous ?', a: 'Les clients paient via Stripe \u2014 cartes de cr\u00E9dit, Apple Pay et Google Pay.' },
        { q: 'Y a-t-il un contrat \u00E0 long terme ?', a: 'Aucun contrat. Commencez gratuitement, \u00E9voluez ou annulez \u00E0 tout moment.' },
        { q: 'Les heures sont-elles pr\u00E9cises ?', a: 'Notre base couvre 208 a\u00E9ronefs avec des donn\u00E9es r\u00E9elles. Vous pouvez ajuster \u00E0 tout moment.' },
      ],
    },
    footerCta: {
      title: 'Pr\u00EAt \u00E0 D\u00E9velopper Votre Activit\u00E9 ?',
      sub: 'Rejoignez les professionnels qui gagnent du temps chaque semaine avec Vector.',
      cta: 'Essai Gratuit',
    },
    footer: { by: 'par Vector Aviation', copy: '\u00A9 2026 Vector Aviation Software. Tous droits r\u00E9serv\u00E9s.', terms: 'Conditions', privacy: 'Confidentialit\u00E9', contact: 'Contact' },
  },

  de: {
    nav: { features: 'Funktionen', pricing: 'Preise', faq: 'FAQ', signIn: 'Anmelden', startFree: 'Kostenlos Starten' },
    hero: {
      badge: 'F\u00FCr Flugzeug-Detailer entwickelt',
      headline: 'Angebotssoftware f\u00FCr',
      headlineHighlight: 'Flugzeug-Detailer',
      sub: 'Erstellen Sie professionelle Angebote in 60 Sekunden. Schneller bezahlt werden. Gesch\u00E4ft ausbauen.',
      cta: 'Kostenlos Testen',
      cta2: 'So Funktioniert Es',
      noCc: 'Keine Kreditkarte erforderlich. Kostenloser Plan f\u00FCr immer verf\u00FCgbar.',
    },
    mockup: { quotes: 'Angebote Diesen Monat', revenue: 'Gebuchter Umsatz', conversion: 'Konversionsrate', recentQuote: 'Aktuelles Angebot: Gulfstream G450' },
    problems: [
      { title: 'Keine Stunden Mehr f\u00FCr Angebote', desc: 'Keine Tabellenkalkulationen oder Taschenrechner mehr. Vector automatisiert den gesamten Prozess.' },
      { title: '208 Flugzeuge, Ihre Stunden', desc: 'Standardstunden f\u00FCr 208 Flugzeuge. Nutzen Sie unsere, laden Sie Ihre hoch oder passen Sie pro Auftrag an.' },
      { title: 'Ihr Satz \u00D7 Ihre Stunden', desc: 'Legen Sie Ihren Stundensatz fest. W\u00E4hlen Sie das Flugzeug. Vector rechnet \u2014 Sie kontrollieren.' },
    ],
    howItWorks: { title: 'So Funktioniert Es', sub: 'Von der Einrichtung bis zur Zahlung \u2014 drei einfache Schritte.' },
    steps: [
      { title: 'Services und Preise Hinzuf\u00FCgen', desc: 'Richten Sie Ihr Servicemen\u00FC und Stundens\u00E4tze ein. Au\u00DFenw\u00E4sche, Keramik, Innenreinigung.' },
      { title: 'Flugzeug W\u00E4hlen, Angebot Erstellen', desc: 'W\u00E4hlen Sie aus 208 vorgeladenen Flugzeugen. Vector berechnet den Preis.' },
      { title: 'An Kunden Senden, Bezahlt Werden', desc: 'Senden Sie das Angebot per E-Mail. Ihr Kunde zahlt online mit einem Klick.' },
    ],
    features: {
      title: 'Alles Was Sie Brauchen',
      sub: 'Speziell f\u00FCr Flugzeug-Detailer entwickelt.',
      items: [
        { title: '208 Flugzeug-Datenbank', desc: 'Vorgeladene Stunden f\u00FCr 208 Flugzeuge.' },
        { title: 'Sofort-Angebote', desc: 'Flugzeug w\u00E4hlen, Services ausw\u00E4hlen. Pr\u00E4zises Angebot in 60 Sekunden.' },
        { title: 'E-Mail Versand', desc: 'Senden Sie professionelle Angebote direkt an Ihre Kunden.' },
        { title: 'Online Bezahlt Werden', desc: 'Stripe-Zahlungen in jedes Angebot integriert.' },
        { title: 'Kalender & Planung', desc: 'Verfolgen Sie alle Auftr\u00E4ge an einem Ort.' },
        { title: 'Wachstum Verfolgen', desc: 'ROI-Dashboard, Umsatzanalysen, Punkte und Belohnungen.' },
      ],
    },
    pricing: {
      title: 'Einfache, Transparente Preise',
      sub: 'Starten Sie kostenlos und upgraden Sie mit Ihrem Wachstum.',
      monthly: 'Monatlich', annual: 'J\u00E4hrlich', mo: '/Mo', save: 'Sparen', yr: '/Jahr', billed: 'Abgerechnet', year: '/Jahr', mostPopular: 'AM BELIEBTESTEN',
      footer: 'Alle Pl\u00E4ne beinhalten Stripe-Zahlungsabwicklung.',
      tiers: [
        { name: 'Kostenlos', desc: 'Vector risikofrei testen', cta: 'Kostenlos Starten', features: ['3 Angebote/Monat', '208 Flugzeug-Datenbank', 'E-Mail-Angebote', 'Stripe-Zahlungen', '5% Plattformgeb\u00FChr'] },
        { name: 'Pro', desc: 'F\u00FCr Vollzeit-Detailer', cta: 'Pro W\u00E4hlen', features: ['Unbegrenzte Angebote', '208 Flugzeug-Datenbank', 'E-Mail-Angebote', 'E-Mail-Benachrichtigungen', 'Ohne Vector-Branding', 'Kalender', 'Priorit\u00E4ts-Support', '2% Plattformgeb\u00FChr'] },
        { name: 'Business', desc: 'F\u00FCr Teams', cta: 'Business W\u00E4hlen', features: ['Alles in Pro', 'Multi-User-Zugang', 'Lieferanten-Portal', 'API-Zugang', 'ROI-Analysen', 'Dedizierter Support', '1% Plattformgeb\u00FChr'] },
      ],
    },
    testimonials: {
      title: 'Was Detailer Sagen',
      items: [
        { quote: 'Vector spart mir 10 Stunden pro Woche bei Angeboten. Fr\u00FCher habe ich 30 Minuten pro Angebot gebraucht.', name: 'Flugzeug-Detailer', location: 'Scottsdale, AZ' },
        { quote: 'Die Flugzeug-Datenbank ist ein Gamechanger. Ich habe mit den Standardstunden begonnen und jetzt meine eigenen Zahlen.', name: 'Gesch\u00E4ftsinhaber', location: 'Van Nuys, CA' },
        { quote: 'Meine Kunden lieben professionelle Angebote, die sie online akzeptieren und bezahlen k\u00F6nnen.', name: 'Aviation Detailer', location: 'Teterboro, NJ' },
      ],
    },
    faqs: {
      title: 'H\u00E4ufig Gestellte Fragen',
      items: [
        { q: 'Wie funktioniert die Preisgestaltung?', a: 'Vector multipliziert Ihren Stundensatz mit den Servicestunden f\u00FCr jedes Flugzeug.' },
        { q: 'Kann ich meine Services anpassen?', a: 'Absolut. F\u00FCgen Sie jeden Service hinzu und erstellen Sie Pakete mit automatischen Rabatten.' },
        { q: 'Welche Zahlungsmethoden akzeptieren Sie?', a: 'Kunden zahlen \u00FCber Stripe \u2014 Kreditkarten, Apple Pay und Google Pay.' },
        { q: 'Gibt es einen langfristigen Vertrag?', a: 'Keine Vertr\u00E4ge. Kostenlos starten, jederzeit upgraden oder k\u00FCndigen.' },
        { q: 'Wie genau sind die Stunden?', a: 'Unsere Datenbank deckt 208 Flugzeuge mit realen Daten ab.' },
      ],
    },
    footerCta: {
      title: 'Bereit, Ihr Gesch\u00E4ft Auszubauen?',
      sub: 'Schlie\u00DFen Sie sich Profis an, die jede Woche Stunden sparen mit Vector.',
      cta: 'Kostenlos Testen',
    },
    footer: { by: 'von Vector Aviation', copy: '\u00A9 2026 Vector Aviation Software. Alle Rechte vorbehalten.', terms: 'AGB', privacy: 'Datenschutz', contact: 'Kontakt' },
  },

  it: {
    nav: { features: 'Funzioni', pricing: 'Prezzi', faq: 'FAQ', signIn: 'Accedi', startFree: 'Inizia Gratis' },
    hero: {
      badge: 'Progettato per i Detailer Aeronautici',
      headline: 'Software di Preventivi per',
      headlineHighlight: 'Detailer Aeronautici',
      sub: 'Crea preventivi professionali in 60 secondi. Incassa pi\u00F9 velocemente. Fai crescere il tuo business.',
      cta: 'Prova Gratuita',
      cta2: 'Scopri Come Funziona',
      noCc: 'Nessuna carta di credito richiesta. Piano gratuito disponibile per sempre.',
    },
    mockup: { quotes: 'Preventivi Questo Mese', revenue: 'Fatturato Prenotato', conversion: 'Tasso di Conversione', recentQuote: 'Preventivo Recente: Gulfstream G450' },
    problems: [
      { title: 'Basta Sprecare Ore nei Preventivi', desc: 'Niente pi\u00F9 fogli di calcolo o calcolatrici. Vector automatizza tutto.' },
      { title: '208 Aeromobili, Le Tue Ore', desc: 'Ore predefinite per 208 aeromobili. Usa le nostre, carica le tue o regola per lavoro.' },
      { title: 'La Tua Tariffa \u00D7 Le Tue Ore', desc: 'Imposta la tua tariffa oraria. Scegli l\'aeromobile. Vector fa il calcolo.' },
    ],
    howItWorks: { title: 'Come Funziona', sub: 'Dalla configurazione al pagamento \u2014 tre semplici passaggi.' },
    steps: [
      { title: 'Aggiungi Servizi e Tariffe', desc: 'Configura il tuo menu servizi e tariffe orarie.' },
      { title: 'Seleziona Aeromobile, Crea Preventivo', desc: 'Scegli tra 208 aeromobili precaricati. Vector calcola il prezzo.' },
      { title: 'Invia al Cliente, Incassa', desc: 'Invia il preventivo via email. Il cliente paga online con un clic.' },
    ],
    features: {
      title: 'Tutto Ci\u00F2 di Cui Hai Bisogno',
      sub: 'Progettato specificamente per i detailer aeronautici.',
      items: [
        { title: 'Database di 208 Aeromobili', desc: 'Ore precaricate per 208 aeromobili.' },
        { title: 'Preventivo Istantaneo', desc: 'Seleziona aeromobile, scegli servizi. Preventivo preciso in 60 secondi.' },
        { title: 'Invio via Email', desc: 'Invia preventivi professionali direttamente ai clienti.' },
        { title: 'Pagamento Online', desc: 'Pagamenti Stripe integrati in ogni preventivo.' },
        { title: 'Calendario e Pianificazione', desc: 'Tieni traccia di tutti i lavori in un unico posto.' },
        { title: 'Monitora la Crescita', desc: 'Dashboard ROI, analisi dei ricavi, punti e premi.' },
      ],
    },
    pricing: {
      title: 'Prezzi Semplici e Trasparenti',
      sub: 'Inizia gratis e fai upgrade man mano che cresci.',
      monthly: 'Mensile', annual: 'Annuale', mo: '/mese', save: 'Risparmia', yr: '/anno', billed: 'Fatturato', year: '/anno', mostPopular: 'PI\u00D9 POPOLARE',
      footer: 'Tutti i piani includono elaborazione pagamenti Stripe.',
      tiers: [
        { name: 'Gratuito', desc: 'Prova Vector senza rischi', cta: 'Inizia Gratis', features: ['3 preventivi/mese', 'Database 208 aeromobili', 'Preventivi email', 'Pagamenti Stripe', '5% commissione'] },
        { name: 'Pro', desc: 'Per detailer a tempo pieno', cta: 'Vai Pro', features: ['Preventivi illimitati', 'Database 208 aeromobili', 'Email preventivi', 'Notifiche email', 'Senza marchio Vector', 'Calendario', 'Supporto prioritario', '2% commissione'] },
        { name: 'Business', desc: 'Per team e grandi volumi', cta: 'Ottieni Business', features: ['Tutto in Pro', 'Accesso multiutente', 'Portale fornitori', 'Accesso API', 'Analisi ROI', 'Supporto dedicato', '1% commissione'] },
      ],
    },
    testimonials: {
      title: 'Cosa Dicono i Detailer',
      items: [
        { quote: 'Vector mi fa risparmiare 10 ore a settimana. Prima spendevo 30 minuti per preventivo.', name: 'Detailer Aeronautico', location: 'Scottsdale, AZ' },
        { quote: 'Il database degli aeromobili ha cambiato tutto. Ho iniziato con le ore predefinite e ora ho i miei numeri.', name: 'Imprenditore', location: 'Van Nuys, CA' },
        { quote: 'I miei clienti adorano ricevere preventivi professionali che possono accettare e pagare online.', name: 'Detailer Aviazione', location: 'Teterboro, NJ' },
      ],
    },
    faqs: {
      title: 'Domande Frequenti',
      items: [
        { q: 'Come funzionano i prezzi?', a: 'Vector moltiplica la tua tariffa oraria per le ore di servizio per ogni aeromobile.' },
        { q: 'Posso personalizzare i miei servizi?', a: 'Assolutamente. Aggiungi qualsiasi servizio e crea pacchetti con sconti automatici.' },
        { q: 'Quali metodi di pagamento accettate?', a: 'I clienti pagano tramite Stripe \u2014 carte di credito, Apple Pay e Google Pay.' },
        { q: 'C\'\u00E8 un contratto a lungo termine?', a: 'Nessun contratto. Inizia gratis, fai upgrade o annulla in qualsiasi momento.' },
        { q: 'Quanto sono precise le ore?', a: 'Il nostro database copre 208 aeromobili con dati reali.' },
      ],
    },
    footerCta: {
      title: 'Pronto a Far Crescere il Tuo Business?',
      sub: 'Unisciti ai professionisti che risparmiano ore ogni settimana con Vector.',
      cta: 'Prova Gratuita',
    },
    footer: { by: 'di Vector Aviation', copy: '\u00A9 2026 Vector Aviation Software. Tutti i diritti riservati.', terms: 'Termini', privacy: 'Privacy', contact: 'Contatto' },
  },

  nl: {
    nav: { features: 'Functies', pricing: 'Prijzen', faq: 'FAQ', signIn: 'Inloggen', startFree: 'Gratis Starten' },
    hero: {
      badge: 'Gebouwd voor Vliegtuig-Detailers',
      headline: 'Offertesoftware voor',
      headlineHighlight: 'Vliegtuig-Detailers',
      sub: 'Maak professionele offertes in 60 seconden. Sneller betaald worden. Laat je bedrijf groeien.',
      cta: 'Gratis Proberen',
      cta2: 'Bekijk Hoe Het Werkt',
      noCc: 'Geen creditcard nodig. Gratis plan voor altijd beschikbaar.',
    },
    mockup: { quotes: 'Offertes Deze Maand', revenue: 'Geboekte Omzet', conversion: 'Conversieratio', recentQuote: 'Recente Offerte: Gulfstream G450' },
    problems: [
      { title: 'Stop Met Uren Verspillen', desc: 'Geen spreadsheets of rekenmachines meer. Vector automatiseert het hele proces.' },
      { title: '208 Vliegtuigen, Jouw Uren', desc: 'Standaarduren voor 208 vliegtuigen. Gebruik de onze, upload de jouwe of pas aan per klus.' },
      { title: 'Jouw Tarief \u00D7 Jouw Uren', desc: 'Stel je uurtarief in. Kies het vliegtuig. Vector berekent \u2014 jij bepaalt.' },
    ],
    howItWorks: { title: 'Hoe Het Werkt', sub: 'Van instelling tot betaling \u2014 drie eenvoudige stappen.' },
    steps: [
      { title: 'Voeg Services en Tarieven Toe', desc: 'Stel je servicemenu en uurtarieven in.' },
      { title: 'Selecteer Vliegtuig, Maak Offerte', desc: 'Kies uit 208 voorgeladen vliegtuigen. Vector berekent de prijs.' },
      { title: 'Verstuur naar Klant, Word Betaald', desc: 'Stuur de offerte per e-mail. Je klant betaalt online met \u00E9\u00E9n klik.' },
    ],
    features: {
      title: 'Alles Wat Je Nodig Hebt',
      sub: 'Speciaal gebouwd voor vliegtuig-detailers.',
      items: [
        { title: '208 Vliegtuig Database', desc: 'Voorgeladen uren voor 208 vliegtuigen.' },
        { title: 'Directe Offertes', desc: 'Selecteer vliegtuig, kies services. Nauwkeurige offerte in 60 seconden.' },
        { title: 'E-mail Verzending', desc: 'Stuur professionele offertes direct naar je klanten.' },
        { title: 'Online Betaald Worden', desc: 'Stripe-betalingen ge\u00EFntegreerd in elke offerte.' },
        { title: 'Kalender & Planning', desc: 'Houd al je klussen bij op \u00E9\u00E9n plek.' },
        { title: 'Volg Je Groei', desc: 'ROI-dashboard, omzetanalyses, punten en beloningen.' },
      ],
    },
    pricing: {
      title: 'Eenvoudige, Transparante Prijzen',
      sub: 'Begin gratis en upgrade naarmate je groeit.',
      monthly: 'Maandelijks', annual: 'Jaarlijks', mo: '/mnd', save: 'Bespaar', yr: '/jaar', billed: 'Gefactureerd', year: '/jaar', mostPopular: 'MEEST POPULAIR',
      footer: 'Alle plannen bevatten Stripe-betalingsverwerking.',
      tiers: [
        { name: 'Gratis', desc: 'Probeer Vector risicovrij', cta: 'Gratis Starten', features: ['3 offertes/maand', '208 vliegtuig database', 'E-mail offertes', 'Stripe betalingen', '5% platformkosten'] },
        { name: 'Pro', desc: 'Voor fulltime detailers', cta: 'Ga Pro', features: ['Onbeperkte offertes', '208 vliegtuig database', 'E-mail offertes', 'E-mail meldingen', 'Zonder Vector branding', 'Kalender', 'Prioriteit support', '2% platformkosten'] },
        { name: 'Business', desc: 'Voor teams', cta: 'Kies Business', features: ['Alles in Pro', 'Multi-user toegang', 'Leveranciersportaal', 'API toegang', 'ROI analyses', 'Dedicated support', '1% platformkosten'] },
      ],
    },
    testimonials: {
      title: 'Wat Detailers Zeggen',
      items: [
        { quote: 'Vector bespaart me 10 uur per week. Vroeger besteedde ik 30 minuten per offerte.', name: 'Vliegtuig-Detailer', location: 'Scottsdale, AZ' },
        { quote: 'De vliegtuigdatabase is een gamechanger. Ik begon met de standaarduren en heb nu mijn eigen cijfers.', name: 'Bedrijfseigenaar', location: 'Van Nuys, CA' },
        { quote: 'Mijn klanten zijn dol op professionele offertes die ze online kunnen accepteren en betalen.', name: 'Luchtvaart Detailer', location: 'Teterboro, NJ' },
      ],
    },
    faqs: {
      title: 'Veelgestelde Vragen',
      items: [
        { q: 'Hoe werken de prijzen?', a: 'Vector vermenigvuldigt je uurtarief met de service-uren voor elk vliegtuig.' },
        { q: 'Kan ik mijn services aanpassen?', a: 'Absoluut. Voeg elke service toe en maak pakketten met automatische kortingen.' },
        { q: 'Welke betaalmethoden accepteren jullie?', a: 'Klanten betalen via Stripe \u2014 creditcards, Apple Pay en Google Pay.' },
        { q: 'Is er een langlopend contract?', a: 'Geen contracten. Begin gratis, upgrade of annuleer wanneer je wilt.' },
        { q: 'Hoe nauwkeurig zijn de uren?', a: 'Onze database dekt 208 vliegtuigen met echte data.' },
      ],
    },
    footerCta: {
      title: 'Klaar om Je Bedrijf te Laten Groeien?',
      sub: 'Sluit je aan bij professionals die elke week uren besparen met Vector.',
      cta: 'Gratis Proberen',
    },
    footer: { by: 'door Vector Aviation', copy: '\u00A9 2026 Vector Aviation Software. Alle rechten voorbehouden.', terms: 'Voorwaarden', privacy: 'Privacy', contact: 'Contact' },
  },

  ja: {
    nav: { features: '\u6A5F\u80FD', pricing: '\u6599\u91D1', faq: 'FAQ', signIn: '\u30ED\u30B0\u30A4\u30F3', startFree: '\u7121\u6599\u3067\u59CB\u3081\u308B' },
    hero: {
      badge: '\u822A\u7A7A\u6A5F\u30C7\u30A3\u30C6\u30FC\u30E9\u30FC\u5C02\u7528',
      headline: '\u898B\u7A4D\u30BD\u30D5\u30C8\u30A6\u30A7\u30A2',
      headlineHighlight: '\u822A\u7A7A\u6A5F\u30C7\u30A3\u30C6\u30FC\u30E9\u30FC\u5411\u3051',
      sub: '60\u79D2\u3067\u30D7\u30ED\u306E\u898B\u7A4D\u66F8\u3092\u4F5C\u6210\u3002\u3088\u308A\u65E9\u304F\u5165\u91D1\u3002\u30D3\u30B8\u30CD\u30B9\u3092\u6210\u9577\u3055\u305B\u307E\u3057\u3087\u3046\u3002',
      cta: '\u7121\u6599\u30C8\u30E9\u30A4\u30A2\u30EB',
      cta2: '\u4ED5\u7D44\u307F\u3092\u898B\u308B',
      noCc: '\u30AF\u30EC\u30B8\u30C3\u30C8\u30AB\u30FC\u30C9\u4E0D\u8981\u3002\u7121\u6599\u30D7\u30E9\u30F3\u306F\u6C38\u4E45\u306B\u5229\u7528\u53EF\u80FD\u3002',
    },
    mockup: { quotes: '\u4ECA\u6708\u306E\u898B\u7A4D', revenue: '\u4E88\u7D04\u58F2\u4E0A', conversion: '\u30B3\u30F3\u30D0\u30FC\u30B8\u30E7\u30F3\u7387', recentQuote: '\u6700\u65B0\u306E\u898B\u7A4D: Gulfstream G450' },
    problems: [
      { title: '\u898B\u7A4D\u306B\u4F55\u6642\u9593\u3082\u304B\u3051\u306A\u3044', desc: '\u30B9\u30D7\u30EC\u30C3\u30C9\u30B7\u30FC\u30C8\u3084\u96FB\u5353\u306F\u3082\u3046\u4E0D\u8981\u3002Vector\u304C\u5168\u30D7\u30ED\u30BB\u30B9\u3092\u81EA\u52D5\u5316\u3002' },
      { title: '300\u6A5F\u4EE5\u4E0A\u3001\u3042\u306A\u305F\u306E\u6642\u9593', desc: '300\u6A5F\u4EE5\u4E0A\u306E\u30C7\u30D5\u30A9\u30EB\u30C8\u6642\u9593\u3002\u79C1\u305F\u3061\u306E\u3082\u306E\u3092\u4F7F\u3046\u304B\u3001\u81EA\u5206\u306E\u3082\u306E\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3002' },
      { title: '\u3042\u306A\u305F\u306E\u6599\u91D1 \u00D7 \u3042\u306A\u305F\u306E\u6642\u9593', desc: '\u6642\u7D66\u3092\u8A2D\u5B9A\u3002\u6A5F\u4F53\u3092\u9078\u629E\u3002\u6642\u9593\u3092\u8ABF\u6574\u3002Vector\u304C\u8A08\u7B97\u3057\u307E\u3059\u3002' },
    ],
    howItWorks: { title: '\u4F7F\u3044\u65B9', sub: '\u30BB\u30C3\u30C8\u30A2\u30C3\u30D7\u304B\u3089\u5165\u91D1\u307E\u3067\u20143\u3064\u306E\u7C21\u5358\u306A\u30B9\u30C6\u30C3\u30D7\u3002' },
    steps: [
      { title: '\u30B5\u30FC\u30D3\u30B9\u3068\u6599\u91D1\u3092\u8FFD\u52A0', desc: '\u30B5\u30FC\u30D3\u30B9\u30E1\u30CB\u30E5\u30FC\u3068\u6642\u7D66\u3092\u8A2D\u5B9A\u3002' },
      { title: '\u6A5F\u4F53\u3092\u9078\u629E\u3001\u898B\u7A4D\u4F5C\u6210', desc: '300\u6A5F\u4EE5\u4E0A\u304B\u3089\u9078\u629E\u3002Vector\u304C\u4FA1\u683C\u3092\u8A08\u7B97\u3002' },
      { title: '\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u306B\u9001\u4FE1\u3001\u5165\u91D1', desc: '\u30E1\u30FC\u30EB\u3067\u898B\u7A4D\u3092\u9001\u4FE1\u3002\u30EF\u30F3\u30AF\u30EA\u30C3\u30AF\u3067\u30AA\u30F3\u30E9\u30A4\u30F3\u6C7A\u6E08\u3002' },
    ],
    features: {
      title: '\u5FC5\u8981\u306A\u3082\u306E\u304C\u3059\u3079\u3066\u63C3\u3063\u3066\u3044\u307E\u3059',
      sub: '\u822A\u7A7A\u6A5F\u30C7\u30A3\u30C6\u30FC\u30E9\u30FC\u5C02\u7528\u8A2D\u8A08\u3002',
      items: [
        { title: '300\u6A5F\u4EE5\u4E0A\u306E\u30C7\u30FC\u30BF\u30D9\u30FC\u30B9', desc: '300\u6A5F\u4EE5\u4E0A\u306E\u4E8B\u524D\u8A2D\u5B9A\u6E08\u307F\u6642\u9593\u3002' },
        { title: '\u5373\u6642\u898B\u7A4D', desc: '\u6A5F\u4F53\u9078\u629E\u3001\u30B5\u30FC\u30D3\u30B9\u9078\u629E\u300260\u79D2\u3067\u6B63\u78BA\u306A\u898B\u7A4D\u3002' },
        { title: '\u30E1\u30FC\u30EB\u9001\u4FE1', desc: '\u30D7\u30ED\u306E\u898B\u7A4D\u66F8\u3092\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u306B\u76F4\u63A5\u9001\u4FE1\u3002' },
        { title: '\u30AA\u30F3\u30E9\u30A4\u30F3\u6C7A\u6E08', desc: 'Stripe\u6C7A\u6E08\u304C\u5168\u898B\u7A4D\u306B\u7D71\u5408\u3002' },
        { title: '\u30AB\u30EC\u30F3\u30C0\u30FC\uFF06\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB', desc: '\u3059\u3079\u3066\u306E\u4ED5\u4E8B\u3092\u4E00\u5143\u7BA1\u7406\u3002' },
        { title: '\u6210\u9577\u3092\u8FFD\u8DE1', desc: 'ROI\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3001\u58F2\u4E0A\u5206\u6790\u3001\u30DD\u30A4\u30F3\u30C8\u3068\u5831\u916C\u3002' },
      ],
    },
    pricing: {
      title: '\u30B7\u30F3\u30D7\u30EB\u3067\u900F\u660E\u306A\u6599\u91D1',
      sub: '\u7121\u6599\u3067\u59CB\u3081\u3066\u3001\u6210\u9577\u306B\u5408\u308F\u305B\u3066\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9\u3002',
      monthly: '\u6708\u984D', annual: '\u5E74\u984D', mo: '/\u6708', save: '\u7BC0\u7D04', yr: '/\u5E74', billed: '\u8ACB\u6C42', year: '/\u5E74', mostPopular: '\u4E00\u756A\u4EBA\u6C17',
      footer: '\u5168\u30D7\u30E9\u30F3\u306BStripe\u6C7A\u6E08\u51E6\u7406\u304C\u542B\u307E\u308C\u307E\u3059\u3002',
      tiers: [
        { name: '\u7121\u6599', desc: 'Vector\u3092\u30EA\u30B9\u30AF\u306A\u3057\u3067\u8A66\u3059', cta: '\u7121\u6599\u3067\u59CB\u3081\u308B', features: ['3\u898B\u7A4D/\u6708', '300\u6A5F\u4EE5\u4E0A\u306EDB', '\u30E1\u30FC\u30EB\u898B\u7A4D', 'Stripe\u6C7A\u6E08', '5%\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u6599'] },
        { name: 'Pro', desc: '\u30D5\u30EB\u30BF\u30A4\u30E0\u30C7\u30A3\u30C6\u30FC\u30E9\u30FC\u5411\u3051', cta: 'Pro\u306B\u3059\u308B', features: ['\u7121\u5236\u9650\u898B\u7A4D', '300\u6A5F\u4EE5\u4E0A\u306EDB', '\u30E1\u30FC\u30EB\u898B\u7A4D', '\u30E1\u30FC\u30EB\u901A\u77E5', 'Vector\u30D6\u30E9\u30F3\u30C9\u524A\u9664', '\u30AB\u30EC\u30F3\u30C0\u30FC', '\u512A\u5148\u30B5\u30DD\u30FC\u30C8', '2%\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u6599'] },
        { name: 'Business', desc: '\u30C1\u30FC\u30E0\u5411\u3051', cta: 'Business\u306B\u3059\u308B', features: ['Pro\u306E\u5168\u6A5F\u80FD', '\u30DE\u30EB\u30C1\u30E6\u30FC\u30B6\u30FC', '\u30D9\u30F3\u30C0\u30FC\u30DD\u30FC\u30BF\u30EB', 'API\u30A2\u30AF\u30BB\u30B9', 'ROI\u5206\u6790', '\u5C02\u4EFB\u30B5\u30DD\u30FC\u30C8', '1%\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u6599'] },
      ],
    },
    testimonials: {
      title: '\u30C7\u30A3\u30C6\u30FC\u30E9\u30FC\u306E\u58F0',
      items: [
        { quote: 'Vector\u306E\u304A\u304B\u3052\u3067\u898B\u7A4D\u306B\u304B\u304B\u308B\u6642\u9593\u304C\u9031\u306B10\u6642\u9593\u7BC0\u7D04\u3067\u304D\u307E\u3057\u305F\u3002', name: '\u822A\u7A7A\u6A5F\u30C7\u30A3\u30C6\u30FC\u30E9\u30FC', location: 'Scottsdale, AZ' },
        { quote: '\u822A\u7A7A\u6A5F\u30C7\u30FC\u30BF\u30D9\u30FC\u30B9\u304C\u30B2\u30FC\u30E0\u30C1\u30A7\u30F3\u30B8\u30E3\u30FC\u3067\u3059\u3002\u30C7\u30D5\u30A9\u30EB\u30C8\u304B\u3089\u59CB\u3081\u3066\u81EA\u5206\u306E\u6570\u5B57\u306B\u8ABF\u6574\u3057\u307E\u3057\u305F\u3002', name: '\u30D3\u30B8\u30CD\u30B9\u30AA\u30FC\u30CA\u30FC', location: 'Van Nuys, CA' },
        { quote: '\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u304C\u30D7\u30ED\u306E\u898B\u7A4D\u66F8\u3092\u30AA\u30F3\u30E9\u30A4\u30F3\u3067\u627F\u8A8D\u30FB\u652F\u6255\u3044\u3067\u304D\u308B\u306E\u3092\u6C17\u306B\u5165\u3063\u3066\u3044\u307E\u3059\u3002', name: '\u822A\u7A7A\u30C7\u30A3\u30C6\u30FC\u30E9\u30FC', location: 'Teterboro, NJ' },
      ],
    },
    faqs: {
      title: '\u3088\u304F\u3042\u308B\u8CEA\u554F',
      items: [
        { q: '\u6599\u91D1\u306E\u4ED5\u7D44\u307F\u306F\uFF1F', a: 'Vector\u306F\u6642\u7D66\u306B\u5404\u6A5F\u4F53\u306E\u30B5\u30FC\u30D3\u30B9\u6642\u9593\u3092\u639B\u3051\u3066\u8A08\u7B97\u3057\u307E\u3059\u3002' },
        { q: '\u30B5\u30FC\u30D3\u30B9\u3092\u30AB\u30B9\u30BF\u30DE\u30A4\u30BA\u3067\u304D\u307E\u3059\u304B\uFF1F', a: '\u3082\u3061\u308D\u3093\u3002\u4EFB\u610F\u306E\u30B5\u30FC\u30D3\u30B9\u3092\u8FFD\u52A0\u3057\u3001\u81EA\u52D5\u5272\u5F15\u4ED8\u304D\u30D1\u30C3\u30B1\u30FC\u30B8\u3092\u4F5C\u6210\u3067\u304D\u307E\u3059\u3002' },
        { q: '\u3069\u306E\u652F\u6255\u3044\u65B9\u6CD5\u306B\u5BFE\u5FDC\uFF1F', a: 'Stripe\u7D4C\u7531\u3067\u30AF\u30EC\u30B8\u30C3\u30C8\u30AB\u30FC\u30C9\u3001Apple Pay\u3001Google Pay\u3002' },
        { q: '\u9577\u671F\u5951\u7D04\u306F\u3042\u308A\u307E\u3059\u304B\uFF1F', a: '\u5951\u7D04\u306A\u3057\u3002\u7121\u6599\u3067\u59CB\u3081\u3066\u3001\u3044\u3064\u3067\u3082\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9\u307E\u305F\u306F\u30AD\u30E3\u30F3\u30BB\u30EB\u53EF\u80FD\u3002' },
        { q: '\u6642\u9593\u306E\u7CBE\u5EA6\u306F\uFF1F', a: '\u5B9F\u969B\u306E\u30C7\u30FC\u30BF\u306B\u57FA\u3065\u304F300\u6A5F\u4EE5\u4E0A\u3092\u30AB\u30D0\u30FC\u3002\u8ABF\u6574\u3082\u53EF\u80FD\u3067\u3059\u3002' },
      ],
    },
    footerCta: {
      title: '\u30D3\u30B8\u30CD\u30B9\u3092\u6210\u9577\u3055\u305B\u308B\u6E96\u5099\u306F\u3067\u304D\u307E\u3057\u305F\u304B\uFF1F',
      sub: 'Vector\u3067\u6BCE\u9031\u4F55\u6642\u9593\u3082\u7BC0\u7D04\u3057\u3066\u3044\u308B\u30D7\u30ED\u306B\u53C2\u52A0\u3057\u307E\u3057\u3087\u3046\u3002',
      cta: '\u7121\u6599\u30C8\u30E9\u30A4\u30A2\u30EB',
    },
    footer: { by: 'by Vector Aviation', copy: '\u00A9 2026 Vector Aviation Software. All rights reserved.', terms: '\u5229\u7528\u898F\u7D04', privacy: '\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC', contact: '\u304A\u554F\u3044\u5408\u308F\u305B' },
  },

  zh: {
    nav: { features: '\u529F\u80FD', pricing: '\u4EF7\u683C', faq: '\u5E38\u89C1\u95EE\u9898', signIn: '\u767B\u5F55', startFree: '\u514D\u8D39\u5F00\u59CB' },
    hero: {
      badge: '\u4E13\u4E3A\u98DE\u673A\u7F8E\u5BB9\u5E08\u6253\u9020',
      headline: '\u62A5\u4EF7\u8F6F\u4EF6\u4E13\u4E3A',
      headlineHighlight: '\u98DE\u673A\u7F8E\u5BB9\u5E08',
      sub: '60\u79D2\u521B\u5EFA\u4E13\u4E1A\u62A5\u4EF7\u3002\u66F4\u5FEB\u6536\u6B3E\u3002\u53D1\u5C55\u4E1A\u52A1\u3002',
      cta: '\u514D\u8D39\u8BD5\u7528',
      cta2: '\u67E5\u770B\u5982\u4F55\u8FD0\u4F5C',
      noCc: '\u65E0\u9700\u4FE1\u7528\u5361\u3002\u514D\u8D39\u8BA1\u5212\u6C38\u4E45\u53EF\u7528\u3002',
    },
    mockup: { quotes: '\u672C\u6708\u62A5\u4EF7', revenue: '\u5DF2\u9884\u8BA2\u6536\u5165', conversion: '\u8F6C\u5316\u7387', recentQuote: '\u6700\u65B0\u62A5\u4EF7: Gulfstream G450' },
    problems: [
      { title: '\u505C\u6B62\u6D6A\u8D39\u65F6\u95F4', desc: '\u4E0D\u518D\u9700\u8981\u7535\u5B50\u8868\u683C\u6216\u8BA1\u7B97\u5668\u3002Vector\u81EA\u52A8\u5316\u6574\u4E2A\u6D41\u7A0B\u3002' },
      { title: '208\u98DE\u673A\uFF0C\u60A8\u7684\u65F6\u95F4', desc: '208\u98DE\u673A\u7684\u9ED8\u8BA4\u5DE5\u65F6\u3002\u4F7F\u7528\u6211\u4EEC\u7684\u6570\u636E\u3001\u4E0A\u4F20\u60A8\u7684\u6570\u636E\u6216\u6309\u5DE5\u4F5C\u8C03\u6574\u3002' },
      { title: '\u60A8\u7684\u8D39\u7387 \u00D7 \u60A8\u7684\u5DE5\u65F6', desc: '\u8BBE\u7F6E\u5C0F\u65F6\u8D39\u7387\u3002\u9009\u62E9\u98DE\u673A\u3002\u8C03\u6574\u5DE5\u65F6\u3002Vector\u8BA1\u7B97\u4E00\u5207\u3002' },
    ],
    howItWorks: { title: '\u5982\u4F55\u8FD0\u4F5C', sub: '\u4ECE\u8BBE\u7F6E\u5230\u6536\u6B3E\u2014\u2014\u4E09\u4E2A\u7B80\u5355\u6B65\u9AA4\u3002' },
    steps: [
      { title: '\u6DFB\u52A0\u670D\u52A1\u548C\u8D39\u7387', desc: '\u8BBE\u7F6E\u670D\u52A1\u83DC\u5355\u548C\u5C0F\u65F6\u8D39\u7387\u3002' },
      { title: '\u9009\u62E9\u98DE\u673A\uFF0C\u521B\u5EFA\u62A5\u4EF7', desc: '\u4ECE208\u9884\u52A0\u8F7D\u98DE\u673A\u4E2D\u9009\u62E9\u3002Vector\u8BA1\u7B97\u4EF7\u683C\u3002' },
      { title: '\u53D1\u9001\u7ED9\u5BA2\u6237\uFF0C\u6536\u6B3E', desc: '\u901A\u8FC7\u90AE\u4EF6\u53D1\u9001\u62A5\u4EF7\u3002\u5BA2\u6237\u4E00\u952E\u5728\u7EBF\u652F\u4ED8\u3002' },
    ],
    features: {
      title: '\u60A8\u9700\u8981\u7684\u4E00\u5207',
      sub: '\u4E13\u4E3A\u98DE\u673A\u7F8E\u5BB9\u5E08\u8BBE\u8BA1\u3002',
      items: [
        { title: '208\u98DE\u673A\u6570\u636E\u5E93', desc: '208\u98DE\u673A\u7684\u9884\u8BBE\u5DE5\u65F6\u3002' },
        { title: '\u5373\u65F6\u62A5\u4EF7', desc: '\u9009\u62E9\u98DE\u673A\uFF0C\u9009\u62E9\u670D\u52A1\u300260\u79D2\u7CBE\u786E\u62A5\u4EF7\u3002' },
        { title: '\u90AE\u4EF6\u53D1\u9001', desc: '\u76F4\u63A5\u5411\u5BA2\u6237\u53D1\u9001\u4E13\u4E1A\u62A5\u4EF7\u3002' },
        { title: '\u5728\u7EBF\u6536\u6B3E', desc: 'Stripe\u652F\u4ED8\u96C6\u6210\u5230\u6BCF\u4E2A\u62A5\u4EF7\u3002' },
        { title: '\u65E5\u5386\u548C\u6392\u7A0B', desc: '\u5728\u4E00\u4E2A\u5730\u65B9\u8DDF\u8E2A\u6240\u6709\u5DE5\u4F5C\u3002' },
        { title: '\u8DDF\u8E2A\u589E\u957F', desc: 'ROI\u4EEA\u8868\u677F\u3001\u6536\u5165\u5206\u6790\u3001\u79EF\u5206\u548C\u5956\u52B1\u3002' },
      ],
    },
    pricing: {
      title: '\u7B80\u5355\u900F\u660E\u7684\u4EF7\u683C',
      sub: '\u514D\u8D39\u5F00\u59CB\uFF0C\u968F\u4E1A\u52A1\u589E\u957F\u5347\u7EA7\u3002',
      monthly: '\u6708\u4ED8', annual: '\u5E74\u4ED8', mo: '/\u6708', save: '\u8282\u7701', yr: '/\u5E74', billed: '\u8BA1\u8D39', year: '/\u5E74', mostPopular: '\u6700\u53D7\u6B22\u8FCE',
      footer: '\u6240\u6709\u8BA1\u5212\u5747\u5305\u542BStripe\u652F\u4ED8\u5904\u7406\u3002',
      tiers: [
        { name: '\u514D\u8D39', desc: '\u65E0\u98CE\u9669\u8BD5\u7528Vector', cta: '\u514D\u8D39\u5F00\u59CB', features: ['3\u4E2A\u62A5\u4EF7/\u6708', '208\u98DE\u673A\u6570\u636E\u5E93', '\u90AE\u4EF6\u62A5\u4EF7', 'Stripe\u652F\u4ED8', '5%\u5E73\u53F0\u8D39'] },
        { name: 'Pro', desc: '\u9002\u5408\u5168\u804C\u7F8E\u5BB9\u5E08', cta: '\u5347\u7EA7Pro', features: ['\u65E0\u9650\u62A5\u4EF7', '208\u98DE\u673A\u6570\u636E\u5E93', '\u90AE\u4EF6\u62A5\u4EF7', '\u90AE\u4EF6\u901A\u77E5', '\u53BB\u9664Vector\u54C1\u724C', '\u65E5\u5386', '\u4F18\u5148\u652F\u6301', '2%\u5E73\u53F0\u8D39'] },
        { name: 'Business', desc: '\u9002\u5408\u56E2\u961F', cta: '\u83B7\u53D6Business', features: ['Pro\u6240\u6709\u529F\u80FD', '\u591A\u7528\u6237\u8BBF\u95EE', '\u4F9B\u5E94\u5546\u95E8\u6237', 'API\u8BBF\u95EE', 'ROI\u5206\u6790', '\u4E13\u5C5E\u652F\u6301', '1%\u5E73\u53F0\u8D39'] },
      ],
    },
    testimonials: {
      title: '\u7F8E\u5BB9\u5E08\u7684\u8BC4\u4EF7',
      items: [
        { quote: 'Vector\u6BCF\u5468\u4E3A\u6211\u8282\u7701\u4E8610\u5C0F\u65F6\u7684\u62A5\u4EF7\u65F6\u95F4\u3002\u4EE5\u524D\u6BCF\u4E2A\u62A5\u4EF7\u8981\u82B130\u5206\u949F\u3002', name: '\u98DE\u673A\u7F8E\u5BB9\u5E08', location: 'Scottsdale, AZ' },
        { quote: '\u98DE\u673A\u6570\u636E\u5E93\u662F\u4E00\u4E2A\u5DE8\u5927\u7684\u6539\u53D8\u3002\u6211\u4ECE\u9ED8\u8BA4\u5DE5\u65F6\u5F00\u59CB\uFF0C\u73B0\u5728\u6709\u4E86\u81EA\u5DF1\u7684\u6570\u636E\u3002', name: '\u4E1A\u52A1\u6240\u6709\u8005', location: 'Van Nuys, CA' },
        { quote: '\u5BA2\u6237\u559C\u6B22\u6536\u5230\u53EF\u4EE5\u5728\u7EBF\u63A5\u53D7\u548C\u652F\u4ED8\u7684\u4E13\u4E1A\u62A5\u4EF7\u3002', name: '\u822A\u7A7A\u7F8E\u5BB9\u5E08', location: 'Teterboro, NJ' },
      ],
    },
    faqs: {
      title: '\u5E38\u89C1\u95EE\u9898',
      items: [
        { q: '\u4EF7\u683C\u5982\u4F55\u8FD0\u4F5C\uFF1F', a: 'Vector\u5C06\u60A8\u7684\u5C0F\u65F6\u8D39\u7387\u4E58\u4EE5\u6BCF\u67B6\u98DE\u673A\u7684\u670D\u52A1\u5DE5\u65F6\u3002' },
        { q: '\u53EF\u4EE5\u81EA\u5B9A\u4E49\u670D\u52A1\u5417\uFF1F', a: '\u5F53\u7136\u3002\u6DFB\u52A0\u4EFB\u4F55\u670D\u52A1\u5E76\u521B\u5EFA\u81EA\u52A8\u6298\u6263\u5957\u9910\u3002' },
        { q: '\u63A5\u53D7\u54EA\u4E9B\u652F\u4ED8\u65B9\u5F0F\uFF1F', a: '\u5BA2\u6237\u901A\u8FC7Stripe\u652F\u4ED8\u2014\u2014\u4FE1\u7528\u5361\u3001Apple Pay\u548CGoogle Pay\u3002' },
        { q: '\u6709\u957F\u671F\u5408\u540C\u5417\uFF1F', a: '\u6CA1\u6709\u5408\u540C\u3002\u514D\u8D39\u5F00\u59CB\uFF0C\u968F\u65F6\u5347\u7EA7\u6216\u53D6\u6D88\u3002' },
        { q: '\u5DE5\u65F6\u51C6\u786E\u5417\uFF1F', a: '\u6211\u4EEC\u7684\u6570\u636E\u5E93\u8986\u76D6208\u98DE\u673A\uFF0C\u57FA\u4E8E\u5B9E\u9645\u6570\u636E\u3002\u60A8\u53EF\u4EE5\u968F\u65F6\u8C03\u6574\u3002' },
      ],
    },
    footerCta: {
      title: '\u51C6\u5907\u597D\u53D1\u5C55\u4E1A\u52A1\u4E86\u5417\uFF1F',
      sub: '\u52A0\u5165\u6BCF\u5468\u7528Vector\u8282\u7701\u6570\u5C0F\u65F6\u7684\u4E13\u4E1A\u4EBA\u58EB\u3002',
      cta: '\u514D\u8D39\u8BD5\u7528',
    },
    footer: { by: 'by Vector Aviation', copy: '\u00A9 2026 Vector Aviation Software. \u4FDD\u7559\u6240\u6709\u6743\u5229\u3002', terms: '\u670D\u52A1\u6761\u6B3E', privacy: '\u9690\u79C1\u653F\u7B56', contact: '\u8054\u7CFB\u6211\u4EEC' },
  },
};

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { code: 'es', label: 'Espa\u00F1ol', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
  { code: 'pt', label: 'Portugu\u00EAs', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
  { code: 'fr', label: 'Fran\u00E7ais', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
  { code: 'de', label: 'Deutsch', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
  { code: 'it', label: 'Italiano', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
  { code: 'nl', label: 'Nederlands', flag: '\uD83C\uDDF3\uD83C\uDDF1' },
  { code: 'ja', label: '\u65E5\u672C\u8A9E', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  { code: 'zh', label: '\u4E2D\u6587', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
];

export function getTranslation(lang) {
  return translations[lang] || translations.en;
}

export default translations;
