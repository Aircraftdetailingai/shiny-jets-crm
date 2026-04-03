(function() {
  'use strict';

  // Get configuration from window object or script attributes
  const widgetConfig = window.ShinyJetsWidget || window.VectorWidget || {};
  const script = document.currentScript;

  const detailerId = widgetConfig.detailerId || script?.getAttribute('data-detailer-id');
  const position = widgetConfig.position || script?.getAttribute('data-position') || 'right';
  const primaryColor = widgetConfig.color || script?.getAttribute('data-color') || '#007CB1';
  const buttonTitle = widgetConfig.title || script?.getAttribute('data-title') || 'Get a Quote';
  const apiBase = widgetConfig.apiBase || script?.getAttribute('data-api') || 'https://crm.shinyjets.com';

  if (!detailerId) {
    console.error('Shiny Jets Widget: Missing detailerId. Set window.ShinyJetsWidget.detailerId or data-detailer-id attribute');
    return;
  }

  const positionRight = position === 'right' || position === 'bottom-right';
  const positionBottom = position.includes('bottom') || position === 'right' || position === 'left';

  // Styles
  const styles = `
    #vector-widget-container * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #vector-widget-button {
      position: fixed;
      ${positionRight ? 'right: 20px;' : 'left: 20px;'}
      ${positionBottom ? 'bottom: 20px;' : 'top: 20px;'}
      padding: 14px 24px;
      border-radius: 50px;
      background: ${primaryColor};
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 999998;
      transition: transform 0.2s, box-shadow 0.2s;
      color: white;
      font-size: 15px;
      font-weight: 500;
    }

    #vector-widget-button:hover {
      transform: scale(1.02);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }

    #vector-widget-button svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    #vector-widget-chat {
      position: fixed;
      ${positionRight ? 'right: 20px;' : 'left: 20px;'}
      ${positionBottom ? 'bottom: 90px;' : 'top: 90px;'}
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 999999;
    }

    #vector-widget-chat.open {
      display: flex;
      animation: vectorSlideIn 0.3s ease-out;
    }

    @keyframes vectorSlideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    #vector-widget-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: white;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    #vector-widget-header img {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
      background: white;
      border: 2px solid rgba(255,255,255,0.2);
    }

    #vector-widget-header-text h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    #vector-widget-header-text p {
      margin: 4px 0 0;
      font-size: 12px;
      opacity: 0.8;
    }

    #vector-widget-close {
      margin-left: auto;
      background: rgba(255,255,255,0.1);
      border: none;
      color: white;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    #vector-widget-close:hover {
      background: rgba(255,255,255,0.2);
    }

    #vector-widget-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f9fafb;
    }

    .vector-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      animation: vectorFadeIn 0.3s ease-out;
    }

    @keyframes vectorFadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .vector-message.bot {
      background: white;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }

    .vector-message.user {
      background: ${primaryColor};
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }

    .vector-options {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }

    .vector-option-btn {
      padding: 8px 16px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    }

    .vector-option-btn:hover {
      border-color: ${primaryColor};
      color: ${primaryColor};
    }

    #vector-widget-input-area {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      background: white;
    }

    #vector-widget-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    #vector-widget-input:focus {
      border-color: ${primaryColor};
    }

    #vector-widget-send {
      padding: 12px 20px;
      background: ${primaryColor};
      color: white;
      border: none;
      border-radius: 24px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: opacity 0.2s;
    }

    #vector-widget-send:hover {
      opacity: 0.9;
    }

    #vector-widget-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .vector-typing {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
      background: white;
      border-radius: 16px;
      border-bottom-left-radius: 4px;
      align-self: flex-start;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }

    .vector-typing span {
      width: 8px;
      height: 8px;
      background: #9ca3af;
      border-radius: 50%;
      animation: vectorTyping 1.4s infinite;
    }

    .vector-typing span:nth-child(2) { animation-delay: 0.2s; }
    .vector-typing span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes vectorTyping {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-4px); }
    }

    #vector-widget-powered {
      text-align: center;
      padding: 8px;
      font-size: 11px;
      color: #9ca3af;
      background: white;
      border-top: 1px solid #f3f4f6;
    }

    #vector-widget-powered a {
      color: #6b7280;
      text-decoration: none;
    }

    #vector-widget-powered a:hover {
      text-decoration: underline;
    }

    @media (max-width: 440px) {
      #vector-widget-chat {
        width: calc(100vw - 20px);
        right: 10px;
        left: 10px;
        bottom: 80px;
        height: calc(100vh - 100px);
      }
      #vector-widget-button {
        right: 10px;
        bottom: 10px;
      }
    }
  `;

  // Create widget HTML
  const container = document.createElement('div');
  container.id = 'vector-widget-container';
  container.innerHTML = `
    <style>${styles}</style>

    <button id="vector-widget-button" aria-label="Get a quote">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
      </svg>
      <span>${buttonTitle}</span>
    </button>

    <div id="vector-widget-chat">
      <div id="vector-widget-header">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23f59e0b'/%3E%3Ctext x='50' y='65' text-anchor='middle' fill='white' font-size='40'%3E✈%3C/text%3E%3C/svg%3E" alt="Logo" id="vector-widget-logo">
        <div id="vector-widget-header-text">
          <h3 id="vector-widget-company">Get a Quote</h3>
          <p>Aircraft Detailing Services</p>
        </div>
        <button id="vector-widget-close" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div id="vector-widget-messages"></div>

      <div id="vector-widget-input-area">
        <input type="text" id="vector-widget-input" placeholder="Type your message..." />
        <button id="vector-widget-send">Send</button>
      </div>

      <div id="vector-widget-powered">
        Powered by <a href="https://shinyjets.com" target="_blank">Shiny Jets</a>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  // Widget state
  let config = null;
  let questions = [];
  let currentQuestionIndex = 0;
  let answers = {};
  let isOpen = false;
  let isCollectingInfo = true;
  let leadSubmitted = false;

  // Default questions if none configured
  const defaultQuestions = [
    { key: 'name', question: "What's your name?", placeholder: 'Your name' },
    { key: 'email', question: "What's your email address?", placeholder: 'email@example.com' },
    { key: 'phone', question: "What's a good phone number to reach you?", placeholder: '(555) 123-4567' },
    { key: 'aircraft_type', question: "What type of aircraft do you have?", placeholder: 'e.g., Cessna Citation CJ3' },
    { key: 'services', question: "What services are you interested in?", placeholder: 'e.g., Interior detail, Exterior wash' },
  ];

  // Elements
  const button = document.getElementById('vector-widget-button');
  const chat = document.getElementById('vector-widget-chat');
  const closeBtn = document.getElementById('vector-widget-close');
  const messagesEl = document.getElementById('vector-widget-messages');
  const inputEl = document.getElementById('vector-widget-input');
  const sendBtn = document.getElementById('vector-widget-send');
  const logoEl = document.getElementById('vector-widget-logo');
  const companyEl = document.getElementById('vector-widget-company');

  // Load config
  async function loadConfig() {
    try {
      const res = await fetch(`${apiBase}/api/lead-intake/widget?detailer_id=${detailerId}`);
      if (res.ok) {
        config = await res.json();

        if (config.detailer) {
          companyEl.textContent = config.detailer.company_name || 'Get a Quote';
          if (config.detailer.logo) {
            logoEl.src = config.detailer.logo;
          }
        }

        questions = config.questions?.length > 0 ? config.questions : defaultQuestions;
      } else {
        questions = defaultQuestions;
      }
    } catch (err) {
      console.error('Shiny Jets Widget: Failed to load config', err);
      questions = defaultQuestions;
    }
  }

  // Add message to chat
  function addMessage(text, isBot = true) {
    const msg = document.createElement('div');
    msg.className = `vector-message ${isBot ? 'bot' : 'user'}`;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Add options buttons
  function addOptions(options) {
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'vector-options';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'vector-option-btn';
      btn.textContent = opt;
      btn.onclick = () => {
        inputEl.value = opt;
        handleInput();
        optionsDiv.remove();
      };
      optionsDiv.appendChild(btn);
    });
    messagesEl.appendChild(optionsDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Show typing indicator
  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'vector-typing';
    typing.id = 'vector-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    const typing = document.getElementById('vector-typing');
    if (typing) typing.remove();
  }

  // Ask next question
  function askNextQuestion() {
    if (currentQuestionIndex >= questions.length) {
      submitLead();
      return;
    }

    const q = questions[currentQuestionIndex];
    setTimeout(() => {
      hideTyping();
      addMessage(q.question_text || q.question);
      if (q.placeholder) {
        inputEl.placeholder = q.placeholder;
      }
      // Add options if available
      if (q.options && Array.isArray(q.options)) {
        addOptions(q.options);
      }
    }, 500);
  }

  // Submit lead
  async function submitLead() {
    if (leadSubmitted) return;
    leadSubmitted = true;

    hideTyping();
    addMessage("Thank you! I've captured your information and someone will be in touch shortly with your quote. Is there anything else you'd like to know?");
    isCollectingInfo = false;

    try {
      await fetch(`${apiBase}/api/lead-intake/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailer_id: detailerId,
          customer_name: answers.name || 'Website Visitor',
          customer_email: answers.email || null,
          customer_phone: answers.phone || null,
          answers,
          source: 'widget',
        }),
      });
    } catch (err) {
      console.error('Shiny Jets Widget: Failed to submit lead', err);
    }
  }

  // Handle user input
  async function handleInput() {
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage(text, false);
    inputEl.value = '';

    if (isCollectingInfo && questions.length > 0) {
      // Store answer
      const q = questions[currentQuestionIndex];
      if (q) {
        answers[q.question_key || q.key] = text;
      }

      currentQuestionIndex++;
      showTyping();
      askNextQuestion();
    } else {
      // Free chat after collection - try AI response
      showTyping();
      try {
        const res = await fetch(`${apiBase}/api/lead-intake/widget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            detailer_id: detailerId,
            message: text,
            answers,
          }),
        });
        const data = await res.json();
        hideTyping();
        addMessage(data.response || "Thanks for your message! We'll follow up with you soon.");
      } catch (err) {
        hideTyping();
        addMessage("Thanks for your question! We'll get back to you shortly.");
      }
    }
  }

  // Toggle chat
  function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
      chat.classList.add('open');
      if (!config) {
        loadConfig().then(() => {
          showTyping();
          setTimeout(() => {
            hideTyping();
            addMessage("Hi! I'm here to help you get a quick quote for aircraft detailing. Let me ask you a few questions.");
            showTyping();
            setTimeout(() => askNextQuestion(), 1000);
          }, 500);
        });
      }
      inputEl.focus();
    } else {
      chat.classList.remove('open');
    }
  }

  // Event listeners
  button.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);
  sendBtn.addEventListener('click', handleInput);
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleInput();
  });

})();
