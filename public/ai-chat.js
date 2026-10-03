/*! Shiny Jets CRM — AI chat bubble.
 * <script src="https://crm.shinyjets.com/ai-chat.js" data-account="your-slug" async></script>
 * Optional: data-position="left". Answers come only from the shop's FAQs.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var account = script.getAttribute('data-account');
  if (!account || document.getElementById('sj-ai-chat-btn')) return;
  var base;
  try { base = new URL(script.src).origin; } catch (e) { return; }
  var side = script.getAttribute('data-position') === 'left' ? 'left' : 'right';

  function start(cfg) {
    if (!cfg || !cfg.available) return;
    var bg = (cfg.colors && cfg.colors.bg) || '#007CB1';
    var fg = (cfg.colors && cfg.colors.fg) || '#FFFFFF';
    var company = cfg.company || 'us';

    var style = document.createElement('style');
    style.textContent =
      '#sj-ai-chat-btn{position:fixed;' + side + ':max(16px,env(safe-area-inset-' + side + '));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483000;display:inline-flex;align-items:center;gap:8px;min-height:56px;padding:0 20px 0 16px;border:0;border-radius:999px;background:' + bg + ';color:' + fg + ';font:600 16px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.28);cursor:pointer}' +
      '#sj-ai-chat-btn:focus-visible{outline:3px solid ' + fg + ';outline-offset:-6px;box-shadow:0 0 0 4px #111827}' +
      '#sj-ai-chat-btn svg{width:24px;height:24px;flex-shrink:0}' +
      '#sj-ai-chat-panel{position:fixed;' + side + ':16px;bottom:88px;z-index:2147483001;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 112px);border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.3);background:#fff;display:none}' +
      '#sj-ai-chat-panel iframe{width:100%;height:100%;border:0;display:block}' +
      '@media (max-width:480px),(max-height:560px){#sj-ai-chat-panel{inset:0;width:100%;max-width:none;height:100%;max-height:none;border-radius:0}}' +
      '@media print{#sj-ai-chat-btn,#sj-ai-chat-panel{display:none!important}}';
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.id = 'sj-ai-chat-btn';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'sj-ai-chat-panel');
    btn.setAttribute('aria-label', 'Questions? Chat with ' + company);
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span>Questions?</span>';

    var panel = document.createElement('div');
    panel.id = 'sj-ai-chat-panel';
    var frame = null;

    function open() {
      if (!frame) {
        frame = document.createElement('iframe');
        frame.title = 'Chat with ' + company;
        frame.setAttribute('allow', 'clipboard-write');
        frame.src = base + '/chat-widget/' + encodeURIComponent(account) + '?embed=1&page=' + encodeURIComponent(location.href.split('#')[0].split('?')[0]);
        frame.addEventListener('load', function () { focusFrame(); });
        panel.appendChild(frame);
      }
      panel.style.display = 'block';
      btn.setAttribute('aria-expanded', 'true');
      if (window.matchMedia('(max-width:480px),(max-height:560px)').matches) btn.style.display = 'none';
      focusFrame();
    }
    function focusFrame() {
      try { frame.focus(); frame.contentWindow.postMessage({ source: 'sj-ai-chat-host', type: 'focus' }, base); } catch (e) {}
    }
    function close() {
      panel.style.display = 'none';
      btn.style.display = '';
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
    btn.addEventListener('click', function () { panel.style.display === 'block' ? close() : open(); });
    window.addEventListener('message', function (e) {
      if (e.origin !== base || !e.data || e.data.source !== 'sj-ai-chat') return;
      if (e.data.type === 'close') close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.style.display === 'block') close(); });

    document.body.appendChild(panel);
    document.body.appendChild(btn);
  }

  function boot() {
    fetch(base + '/api/ai-chat/config?account=' + encodeURIComponent(account))
      .then(function (r) { return r.json(); })
      .then(start)
      .catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
