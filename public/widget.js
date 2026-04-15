(function() {
  'use strict';

  function init() {
    var cfg = window.ShinyJetsWidget || window.VectorWidget || {};
    var detailerId = cfg.detailerId || '';
    if (!detailerId) return;

    var color = cfg.color || '#007CB1';
    var pos = cfg.position || 'right';
    var title = cfg.title || 'Get a Quote';
    var base = cfg.apiBase || 'https://crm.shinyjets.com';
    var isRight = pos === 'right' || pos === 'bottom-right';

    if (document.getElementById('sj-w-root')) return;

    // State
    var messages = [];
    var isOpen = false;
    var isLoading = false;
    var isComplete = false;
    var companyName = '';

    // Try restore from sessionStorage
    try {
      var saved = sessionStorage.getItem('sj_chat_' + detailerId);
      if (saved) {
        var parsed = JSON.parse(saved);
        messages = parsed.messages || [];
        isComplete = parsed.complete || false;
        companyName = parsed.company || '';
      }
    } catch(e) {}

    function saveState() {
      try { sessionStorage.setItem('sj_chat_' + detailerId, JSON.stringify({ messages: messages, complete: isComplete, company: companyName })); } catch(e) {}
    }

    // Root container
    var root = document.createElement('div');
    root.id = 'sj-w-root';

    // Floating button
    var btn = document.createElement('div');
    btn.id = 'sj-w-btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#fff;flex-shrink:0"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg><span style="color:#fff;font-size:14px;font-weight:600">' + title + '</span>';
    btn.style.cssText = 'position:fixed;' + (isRight ? 'right:20px;' : 'left:20px;') + 'bottom:20px;padding:12px 22px;border-radius:50px;background:' + color + ';border:none;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;z-index:99998;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;transition:transform 0.2s;animation:sj-pulse 2s infinite;';

    // Pulse animation — injected as inline style tag in our own root
    var styleEl = document.createElement('style');
    styleEl.textContent = '@keyframes sj-pulse{0%,100%{box-shadow:0 4px 15px rgba(0,0,0,0.2)}50%{box-shadow:0 4px 25px ' + color + '40}}';
    root.appendChild(styleEl);

    // Chat panel
    var panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;' + (isRight ? 'right:20px;' : 'left:20px;') + 'bottom:80px;width:360px;max-width:calc(100vw - 30px);height:520px;max-height:calc(100vh - 100px);border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.2);z-index:99999;display:none;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#fff;';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'background:linear-gradient(135deg,#0D1B2A,' + color + ');padding:16px;display:flex;align-items:center;gap:10px;flex-shrink:0;';
    header.innerHTML = '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;">&#9992;</div><div style="flex:1;min-width:0;"><div id="sj-w-company" style="color:#fff;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + title + '</div><div style="color:rgba(255,255,255,0.7);font-size:11px;">Ask us anything</div></div><div id="sj-w-close" style="cursor:pointer;color:rgba(255,255,255,0.6);font-size:22px;padding:4px 8px;border-radius:6px;line-height:1;" onmouseover="this.style.color=\'#fff\'" onmouseout="this.style.color=\'rgba(255,255,255,0.6)\'">&times;</div>';

    // Messages area
    var msgsEl = document.createElement('div');
    msgsEl.id = 'sj-w-msgs';
    msgsEl.style.cssText = 'flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f9fafb;';

    // Input area
    var inputArea = document.createElement('div');
    inputArea.style.cssText = 'padding:12px;border-top:1px solid #e5e7eb;display:flex;gap:8px;background:#fff;flex-shrink:0;';
    var inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = 'Type a message...';
    inputEl.style.cssText = 'flex:1;padding:10px 14px;border:1px solid #e0e0e0;border-radius:24px;font-size:14px;outline:none;color:#333;background:#fff;font-family:inherit;';
    var sendBtn = document.createElement('button');
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    sendBtn.style.cssText = 'width:40px;height:40px;border-radius:50%;background:' + color + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity 0.2s;';
    inputArea.appendChild(inputEl);
    inputArea.appendChild(sendBtn);

    // Footer
    var footer = document.createElement('div');
    footer.style.cssText = 'padding:6px;text-align:center;font-size:10px;color:#bbb;background:#fff;flex-shrink:0;';
    footer.innerHTML = 'Powered by <a href="https://shinyjets.com" target="_blank" style="color:#999;text-decoration:none;">Shiny Jets</a>';

    panel.appendChild(header);
    panel.appendChild(msgsEl);
    panel.appendChild(inputArea);
    panel.appendChild(footer);

    root.appendChild(btn);
    root.appendChild(panel);
    document.body.appendChild(root);

    // Refs
    var closeEl = document.getElementById('sj-w-close');
    var companyEl = document.getElementById('sj-w-company');

    function addBubble(text, isBot) {
      var bubble = document.createElement('div');
      bubble.style.cssText = 'max-width:85%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;word-wrap:break-word;' + (isBot
        ? 'background:#fff;color:#1a1a1a;align-self:flex-start;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.06);'
        : 'background:' + color + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px;');
      bubble.textContent = text;
      msgsEl.appendChild(bubble);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function showTyping() {
      var t = document.createElement('div');
      t.id = 'sj-w-typing';
      t.style.cssText = 'align-self:flex-start;padding:10px 16px;background:#fff;border-radius:16px;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.06);display:flex;gap:4px;';
      for (var i = 0; i < 3; i++) {
        var dot = document.createElement('span');
        dot.style.cssText = 'width:7px;height:7px;background:#bbb;border-radius:50%;animation:sj-dot 1.2s infinite;animation-delay:' + (i * 0.2) + 's;';
        t.appendChild(dot);
      }
      msgsEl.appendChild(t);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function hideTyping() {
      var t = document.getElementById('sj-w-typing');
      if (t) t.remove();
    }

    // Add dot animation
    var dotStyle = document.createElement('style');
    dotStyle.textContent = '@keyframes sj-dot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}';
    root.appendChild(dotStyle);

    function renderMessages() {
      msgsEl.innerHTML = '';
      messages.forEach(function(m) { addBubble(m.content, m.role === 'assistant'); });
      if (isComplete) {
        var restart = document.createElement('button');
        restart.textContent = 'Start New Quote';
        restart.style.cssText = 'align-self:center;margin-top:8px;padding:8px 20px;border-radius:20px;border:1px solid ' + color + ';background:transparent;color:' + color + ';font-size:13px;cursor:pointer;font-family:inherit;';
        restart.onclick = function() {
          messages = [];
          isComplete = false;
          saveState();
          renderMessages();
          sendToAI();
        };
        msgsEl.appendChild(restart);
      }
    }

    function sendToAI() {
      if (isLoading) return;
      isLoading = true;
      inputEl.disabled = true;
      sendBtn.style.opacity = '0.5';
      showTyping();

      fetch(base + '/api/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detailerId: detailerId, messages: messages, sessionId: null }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        hideTyping();
        if (data.reply) {
          messages.push({ role: 'assistant', content: data.reply });
          addBubble(data.reply, true);
          if (data.complete) {
            isComplete = true;
            // Show success + restart
            setTimeout(function() {
              var restart = document.createElement('button');
              restart.textContent = 'Start New Quote';
              restart.style.cssText = 'align-self:center;margin-top:8px;padding:8px 20px;border-radius:20px;border:1px solid ' + color + ';background:transparent;color:' + color + ';font-size:13px;cursor:pointer;font-family:inherit;';
              restart.onclick = function() {
                messages = [];
                isComplete = false;
                saveState();
                renderMessages();
                sendToAI();
              };
              msgsEl.appendChild(restart);
              msgsEl.scrollTop = msgsEl.scrollHeight;
            }, 500);
          }
        }
        saveState();
      })
      .catch(function() {
        hideTyping();
        addBubble("Sorry, I'm having trouble connecting. Please try again in a moment.", true);
      })
      .finally(function() {
        isLoading = false;
        inputEl.disabled = false;
        sendBtn.style.opacity = '1';
        if (isOpen) inputEl.focus();
      });
    }

    function handleSend() {
      var text = inputEl.value.trim();
      if (!text || isLoading || isComplete) return;
      inputEl.value = '';
      messages.push({ role: 'user', content: text });
      addBubble(text, false);
      saveState();
      sendToAI();
    }

    function openChat() {
      isOpen = true;
      panel.style.display = 'flex';
      btn.style.display = 'none';
      btn.style.animation = 'none';

      if (messages.length === 0) {
        // Fetch company name then get greeting
        fetch(base + '/api/lead-intake/widget?detailer_id=' + detailerId)
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d.detailer?.name) {
              companyName = d.detailer.name;
              companyEl.textContent = companyName;
              saveState();
            }
          })
          .catch(function() {});
        sendToAI();
      } else {
        if (companyName) companyEl.textContent = companyName;
        renderMessages();
      }
      setTimeout(function() { inputEl.focus(); }, 100);
    }

    function closeChat() {
      isOpen = false;
      panel.style.display = 'none';
      btn.style.display = 'flex';
    }

    btn.onclick = openChat;
    btn.onkeydown = function(e) { if (e.key === 'Enter') openChat(); };
    closeEl.onclick = closeChat;
    sendBtn.onclick = handleSend;
    inputEl.onkeydown = function(e) { if (e.key === 'Enter') handleSend(); };
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && isOpen) closeChat(); });

    // Mobile: full width panel
    if (window.innerWidth < 440) {
      panel.style.width = 'calc(100vw - 20px)';
      panel.style.right = '10px';
      panel.style.left = '10px';
      panel.style.bottom = '70px';
      panel.style.height = 'calc(100vh - 90px)';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
