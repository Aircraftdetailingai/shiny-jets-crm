"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

const STARTERS = [
  'Paint looks chalky on a G550 top — oxidation or clearcoat failure?',
  'Acrylic windows hazed after an FBO wipe. What do I ask / sell?',
  'Customer wants leading edges restored. How do I set cut level & hours?',
  'Ceramic from another shop stopped beading after 6 months. Next steps?',
];

const MAX_PHOTOS = 3;
const MAX_EDGE = 1568; // Anthropic's recommended max long edge
const MAX_PIXELS = 1_150_000; // ~1.15 MP: past this the API downscales anyway (~1,600 tokens per photo)
const MAX_PHOTO_BYTES = 1_400_000;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(blob);
  });
}

// Resize + compress on the phone: <= 1568px long edge and <= ~1.15 MP, JPEG ~0.8 (stepping down if still big).
// Browsers apply EXIF orientation when drawing an <img>, so portrait photos stay upright.
async function preparePhoto(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('type');
  const { img, url } = await loadImage(file);
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('decode');
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
    const cw = Math.max(1, Math.floor(w * scale));
    const ch = Math.max(1, Math.floor(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // flatten PNG transparency for JPEG
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    let blob = null;
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
      if (blob && blob.size <= MAX_PHOTO_BYTES) break;
    }
    if (!blob || blob.size > MAX_PHOTO_BYTES) throw new Error('size');
    const data = await blobToBase64(blob);
    return { media_type: 'image/jpeg', data, previewUrl: URL.createObjectURL(blob), width: cw, height: ch, bytes: blob.size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildPrefillFromSuggestions(suggestions, diagnosisText) {
  const services = Array.isArray(suggestions?.services) ? suggestions.services : [];
  const matchedIds = services.map((s) => s.service_id).filter(Boolean);
  const names = services.map((s) => s.name).filter(Boolean);
  const customHours = {};
  for (const s of services) {
    if (s.service_id && s.hours != null && !Number.isNaN(Number(s.hours))) {
      customHours[s.service_id] = Number(s.hours);
    }
  }

  const lineNotes = services
    .filter((s) => s.notes)
    .map((s) => `${s.name}: ${s.notes}`)
    .join('\n');

  const notesParts = [];
  if (suggestions?.notes) notesParts.push(suggestions.notes);
  if (lineNotes) notesParts.push(lineNotes);
  if (diagnosisText) {
    const clipped = diagnosisText.length > 1200 ? `${diagnosisText.slice(0, 1200)}…` : diagnosisText;
    notesParts.push(`— Detailing AI diagnosis —\n${clipped}`);
  }

  return {
    source: 'detailing-ai',
    aircraft: suggestions?.aircraft || '',
    service: names.join(', '),
    selected_services: matchedIds,
    custom_hours: Object.keys(customHours).length ? customHours : undefined,
    notes: notesParts.filter(Boolean).join('\n\n'),
    timestamp: Date.now(),
  };
}

const GREETING = {
  role: 'assistant',
  content:
    "I'm Detailing AI — diagnostic help for exterior, interior, brightwork, and ceramic. Describe the jet and what you're seeing, and I'll help you diagnose and align services. I don't replace manufacturer specs.",
  greeting: true,
};
const POLL_MS = 30_000;

function authHeaders(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : '';
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` };
}

function fromStored(m) {
  return {
    role: m.role,
    content: m.content,
    display: m.display !== undefined ? m.display : (m.role === 'user' ? String(m.content || '').replace(/^\[Sent \d+ photos?\]\s*/, '') : undefined),
    photoCount: m.photo_count || 0,
    suggestions: m.suggestions || null,
    created_at: m.created_at,
  };
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Thread = chat messages + expert (Ask Brett) cards, each card placed after the message it followed.
function buildThread(messages, escalations) {
  const items = messages.map((m, i) => ({ kind: 'msg', m, i }));
  const sorted = [...escalations].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const e of sorted) {
    let at = items.length;
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      const t = it.kind === 'msg' ? it.m.created_at : it.e.created_at;
      if (!t || String(t) <= String(e.created_at)) { at = k + 1; break; }
      at = k;
    }
    items.splice(at, 0, { kind: 'expert', e });
  }
  return items;
}

// What the model sees: user/assistant turns, with Brett's answers folded in as assistant turns.
function modelMessages(thread) {
  const out = [];
  for (const it of thread) {
    if (it.kind === 'msg') {
      if (it.m.role === 'user' || it.m.role === 'assistant') out.push({ role: it.m.role, content: it.m.content });
    } else if (it.e.status === 'answered' && it.e.answer) {
      out.push({ role: 'assistant', content: `Shiny Jets expert (Brett) answered the escalated question: ${it.e.answer}` });
    }
  }
  return out;
}

export default function DetailingAiPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creatingDraft, setCreatingDraft] = useState(null);
  const [photos, setPhotos] = useState([]); // pending photos for the next message (in memory only)
  const [photoStatus, setPhotoStatus] = useState('');
  const [preparing, setPreparing] = useState(false);
  // Saved chats
  const [chats, setChats] = useState([]);
  const [chatsAvailable, setChatsAvailable] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [activeTitle, setActiveTitle] = useState('New chat');
  const [escalations, setEscalations] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [announce, setAnnounce] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const photoButtonRef = useRef(null);
  const chatsButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const sessionPhotos = useRef({}); // chat id (or 'new') -> last photos sent in this session (for an expert escalation)
  const escalationsRef = useRef([]);
  escalationsRef.current = escalations;

  const addPhotos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError('');
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setPhotoStatus(`You can add up to ${MAX_PHOTOS} photos per message.`);
      return;
    }
    setPreparing(true);
    const added = [];
    let failed = 0;
    for (const f of files.slice(0, room)) {
      try {
        added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...(await preparePhoto(f)) });
      } catch {
        failed += 1;
      }
    }
    setPreparing(false);
    const total = photos.length + added.length;
    if (added.length) setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    const parts = [];
    if (added.length) parts.push(`${added.length === 1 ? 'Photo' : `${added.length} photos`} added, ${total} of ${MAX_PHOTOS}.`);
    if (failed) parts.push(`${failed === 1 ? 'One photo' : `${failed} photos`} couldn't be read. Try a JPEG or PNG photo.`);
    if (files.length > room) parts.push(`Only ${MAX_PHOTOS} photos per message.`);
    setPhotoStatus(parts.join(' '));
  };

  const removePhoto = (id, index) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setPhotoStatus(`Photo ${index + 1} removed.`);
    photoButtonRef.current?.focus();
  };

  // ─── Saved chats ───
  const loadChats = useCallback(async () => {
    try {
      const res = await fetch('/api/detailing-ai/conversations', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.unavailable) { setChatsAvailable(!data.unavailable && res.ok); setChats([]); return; }
      setChatsAvailable(true);
      setChats(Array.isArray(data.conversations) ? data.conversations : []);
    } catch {
      setChatsAvailable(false);
    }
  }, []);

  const setUrl = (id) => {
    const url = id ? `/detailing-ai?c=${encodeURIComponent(id)}` : '/detailing-ai';
    window.history.replaceState(null, '', url);
  };

  const openChat = useCallback(async (id, { quiet = false } = {}) => {
    if (!quiet) setLoadingChat(true);
    try {
      const res = await fetch(`/api/detailing-ai/conversations/${id}`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!quiet) { setError(data.error || 'Could not open that chat.'); setUrl(null); }
        return;
      }
      const prevOpen = escalationsRef.current.filter((e) => e.status === 'open').map((e) => e.id);
      const nextEsc = Array.isArray(data.escalations) ? data.escalations : [];
      const newlyAnswered = nextEsc.filter((e) => e.status === 'answered' && prevOpen.includes(e.id));
      if (quiet) {
        if (newlyAnswered.length) {
          setEscalations(nextEsc);
          setAnnounce(`A Shiny Jets expert answered${newlyAnswered[0].summary ? `: ${newlyAnswered[0].summary}` : ''}.`);
          loadChats();
        }
        return;
      }
      setActiveId(id);
      setActiveTitle(data.conversation?.title || 'New chat');
      setMessages([GREETING, ...(data.conversation?.messages || []).map(fromStored)]);
      setEscalations(nextEsc);
      setPhotos([]);
      setPhotoStatus('');
      setError('');
      setUrl(id);
    } catch {
      if (!quiet) setError('Network error opening that chat.');
    } finally {
      if (!quiet) setLoadingChat(false);
    }
  }, [loadChats]);

  const newChat = () => {
    setActiveId(null);
    setActiveTitle('New chat');
    setMessages([GREETING]);
    setEscalations([]);
    setPhotos([]);
    setPhotoStatus('');
    setError('');
    setRenamingId(null);
    setConfirmDeleteId(null);
    setUrl(null);
    setDrawerOpen(false);
    setAnnounce('New chat started.');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pickChat = async (id) => {
    setDrawerOpen(false);
    setRenamingId(null);
    setConfirmDeleteId(null);
    if (id === activeId) { setTimeout(() => inputRef.current?.focus(), 0); return; }
    await openChat(id);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const saveRename = async (id) => {
    const title = renameValue.trim();
    if (!title) return;
    const res = await fetch(`/api/detailing-ai/conversations/${id}`, { method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ title }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Could not rename that chat.'); return; }
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: data.conversation.title } : c)));
    if (id === activeId) setActiveTitle(data.conversation.title);
    setRenamingId(null);
    setAnnounce(`Chat renamed to ${data.conversation.title}.`);
  };

  const deleteChat = async (id) => {
    const res = await fetch(`/api/detailing-ai/conversations/${id}`, { method: 'DELETE', headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Could not delete that chat.'); return; }
    setChats((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
    setAnnounce('Chat deleted.');
    if (id === activeId) newChat();
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    loadChats();
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) openChat(c);
  }, [router, loadChats, openChat]);

  // Waiting on an expert: check this chat every 30 s while the tab is visible.
  useEffect(() => {
    if (!activeId || !escalations.some((e) => e.status === 'open')) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') openChat(activeId, { quiet: true });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [activeId, escalations, openChat]);

  // Phone drawer: Escape closes, focus moves in, and back to the Chats button on close.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const el = drawerRef.current;
    el?.querySelector('button, input')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { setDrawerOpen(false); chatsButtonRef.current?.focus(); }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll('button:not([disabled]), input')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, escalations.length]);

  const fileEscalation = async ({ ticket, convId, aiReply, contextMessages }) => {
    const key = convId || 'new';
    const sent = sessionPhotos.current[key] || sessionPhotos.current.new || [];
    try {
      const res = await fetch('/api/detailing-ai/escalations', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          ticket,
          messages: contextMessages,
          ai_reply: aiReply,
          photos: sent.map((p) => ({ media_type: p.media_type, data: p.data })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.escalation) {
        setMessages((prev) => [...prev, { role: 'notice', content: data.error || "Couldn't reach a Shiny Jets expert just now. Try asking again in a minute.", created_at: new Date().toISOString() }]);
        return;
      }
      setEscalations((prev) => [...prev, { ...data.escalation, photo_urls: sent.map((p) => p.previewUrl) }]);
      setAnnounce('Sent to a Shiny Jets expert. You\u2019ll get an answer here and by email.');
      loadChats();
    } catch {
      setMessages((prev) => [...prev, { role: 'notice', content: "Couldn't reach a Shiny Jets expert just now. Try asking again in a minute.", created_at: new Date().toISOString() }]);
    }
  };

  const send = async (text) => {
    const typed = (text ?? input).trim();
    const sending = text == null ? photos : [];
    if ((!typed && !sending.length) || loading || preparing) return;

    setError('');
    setInput('');
    setPhotos([]);
    setPhotoStatus('');
    // The model sees a short marker so later turns know photos were shared; the bubble shows thumbnails.
    const marker = sending.length ? `[Sent ${sending.length} photo${sending.length === 1 ? '' : 's'}]` : '';
    const content = [marker, typed].filter(Boolean).join('\n');
    const now = new Date().toISOString();
    const userMsg = { role: 'user', content, display: typed, photos: sending.map((p) => ({ url: p.previewUrl })), photoCount: sending.length, created_at: now };
    const nextMessages = [...messages, userMsg];
    if (sending.length) sessionPhotos.current[activeId || 'new'] = sending;
    setMessages(nextMessages);
    setLoading(true);

    const contextMessages = modelMessages(buildThread(nextMessages, escalations));
    try {
      const res = await fetch('/api/detailing-ai/chat', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          messages: contextMessages,
          images: sending.map((p) => ({ media_type: p.media_type, data: p.data })),
          conversation_id: activeId || undefined,
          display: typed,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.reply) {
        setError(data.error || 'Request failed');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.error || 'Something went wrong. Try again.', created_at: new Date().toISOString() },
        ]);
      } else {
        const reply = data.reply || 'No response from Detailing AI.';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: reply, suggestions: data.suggestions || null, created_at: new Date().toISOString() },
        ]);
        const convId = data.conversation?.id || activeId;
        if (data.conversation?.id && !activeId) {
          setActiveId(data.conversation.id);
          setUrl(data.conversation.id);
          if (sessionPhotos.current.new) { sessionPhotos.current[data.conversation.id] = sessionPhotos.current.new; delete sessionPhotos.current.new; }
        }
        if (data.conversation?.title) setActiveTitle(data.conversation.title);
        if (data.conversation) loadChats();
        if (data.escalate?.ticket) {
          await fileEscalation({ ticket: data.escalate.ticket, convId, aiReply: reply, contextMessages });
        }
      }
    } catch (err) {
      setError(err.message || 'Network error');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network error talking to Detailing AI. Check your connection and try again.', created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const createQuoteDraft = (messageIndex) => {
    const msg = messages[messageIndex];
    if (!msg?.suggestions?.services?.length) return;
    setCreatingDraft(messageIndex);
    try {
      const prefill = buildPrefillFromSuggestions(msg.suggestions, msg.content);
      localStorage.setItem('quote_prefill', JSON.stringify(prefill));
      router.push('/quotes/new');
    } catch (err) {
      setError(err.message || 'Could not open quote draft');
      setCreatingDraft(null);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    send();
  };

  const thread = buildThread(messages, escalations);

  const chatList = (where) => (
    <div className="flex flex-col min-h-0 h-full">
      <button
        type="button"
        onClick={newChat}
        className="h-11 w-full shrink-0 rounded-xl bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-wider hover:brightness-110 transition flex items-center justify-center gap-2"
      >
        <span aria-hidden="true" className="text-base leading-none">+</span> New chat
      </button>
      {/* Sidebar: h2 (it comes before the page heading in reading order). Drawer: h3 under the dialog's h2. */}
      {where === 'side' ? (
        <h2 id={`chats-heading-${where}`} className="mt-4 mb-2 text-[10px] uppercase tracking-widest text-v-text-secondary">Your chats</h2>
      ) : (
        <h3 id={`chats-heading-${where}`} className="mt-4 mb-2 text-[10px] uppercase tracking-widest text-v-text-secondary">Your chats</h3>
      )}
      {!chatsAvailable ? (
        <p className="text-xs text-v-text-secondary">Saved chats aren&apos;t available right now. This chat still works, it just won&apos;t be saved.</p>
      ) : chats.length === 0 ? (
        <p className="text-xs text-v-text-secondary">No saved chats yet. Your questions are saved here automatically.</p>
      ) : (
        <ul aria-labelledby={`chats-heading-${where}`} className="space-y-1 overflow-y-auto overscroll-contain min-h-0 -mx-1 px-1">
          {chats.map((c) => {
            const isActive = c.id === activeId;
            if (renamingId === c.id) {
              return (
                <li key={c.id} className="rounded-lg border border-v-gold/40 p-2">
                  <label htmlFor={`rename-${where}-${c.id}`} className="block text-[10px] uppercase tracking-widest text-v-text-secondary mb-1">Chat name</label>
                  <input
                    id={`rename-${where}-${c.id}`}
                    value={renameValue}
                    maxLength={80}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveRename(c.id); }
                      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenamingId(null); }
                    }}
                    className="w-full rounded-lg bg-v-charcoal border border-v-border-subtle px-3 py-2 text-sm text-v-text-primary focus:outline-none focus:border-v-gold/60"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => saveRename(c.id)} className="min-h-[36px] px-3 rounded-lg bg-v-gold text-v-charcoal text-xs font-semibold">Save</button>
                    <button type="button" onClick={() => setRenamingId(null)} className="min-h-[36px] px-3 rounded-lg border border-v-border-subtle text-v-text-primary text-xs">Cancel</button>
                  </div>
                </li>
              );
            }
            if (confirmDeleteId === c.id) {
              return (
                <li key={c.id} className="rounded-lg border border-red-400/50 p-2" role="group" aria-label={`Delete ${c.title}?`}>
                  <p className="text-xs text-v-text-primary">Delete &ldquo;{c.title}&rdquo;? This can&apos;t be undone.{c.expert?.open ? ' Your expert question still gets answered by email.' : ''}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => deleteChat(c.id)} className="min-h-[36px] px-3 rounded-lg bg-red-500 text-white text-xs font-semibold">Delete</button>
                    <button type="button" autoFocus onClick={() => setConfirmDeleteId(null)} className="min-h-[36px] px-3 rounded-lg border border-v-border-subtle text-v-text-primary text-xs">Cancel</button>
                  </div>
                </li>
              );
            }
            return (
              <li key={c.id} className={`group flex items-stretch rounded-lg border ${isActive ? 'border-v-gold/50 bg-v-gold/10' : 'border-transparent hover:border-v-border-subtle'}`}>
                <button
                  type="button"
                  onClick={() => pickChat(c.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className="flex-1 min-w-0 text-left px-2.5 py-2 min-h-[44px]"
                >
                  <span className="block text-sm text-v-text-primary truncate">{c.title}</span>
                  <span className="flex items-center gap-2 text-[11px] text-v-text-secondary">
                    <span>{shortDate(c.updated_at)}</span>
                    {c.expert?.open > 0 && <span className="text-amber-300">Waiting for expert</span>}
                    {!c.expert?.open && c.expert?.answered > 0 && <span className="text-emerald-300">Expert answered</span>}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => { setRenamingId(c.id); setRenameValue(c.title); setConfirmDeleteId(null); }}
                  aria-label={`Rename chat: ${c.title}`}
                  className="w-10 shrink-0 flex items-center justify-center text-v-text-secondary hover:text-v-text-primary rounded-lg"
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M14 6l4 4" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDeleteId(c.id); setRenamingId(null); }}
                  aria-label={`Delete chat: ${c.title}`}
                  className="w-10 shrink-0 flex items-center justify-center text-v-text-secondary hover:text-red-300 rounded-lg"
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <AppShell title="Detailing AI">
      {/* dvh keeps the composer above mobile browser toolbars (100vh is
          taller than the visible area on phones, which pushed the input
          off-screen). min-h-0 lets the message list shrink instead. */}
      <div className="flex w-full min-w-0 h-[calc(100vh-3.5rem)] supports-[height:100dvh]:h-[calc(100dvh-3.5rem)] max-w-5xl mx-auto md:px-4 md:gap-4">
        <nav aria-label="Detailing AI chats" className="hidden md:flex w-64 shrink-0 flex-col pt-4 pb-4 min-h-0">
          {chatList('side')}
        </nav>

        <div className="flex flex-col flex-1 w-full min-w-0 max-w-3xl mx-auto px-4 md:px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 md:mb-4 shrink-0 min-w-0">
            <h2 className="font-heading text-v-text-primary text-lg font-light uppercase tracking-wider md:tracking-widest break-words">
              Detailing AI
            </h2>
            <p className="text-sm text-v-text-secondary mt-1 hidden sm:block">
              Aircraft detailing diagnosis for your shop — exterior, interior, brightwork, ceramic.
              Describe the issue or add up to {MAX_PHOTOS} photos. Suggested services can open a draft quote (never auto-sent).
            </p>
            {/* Phone: chats drawer + new chat */}
            <div className="mt-2 flex items-center gap-2 md:hidden">
              <button
                ref={chatsButtonRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                className="h-11 px-3 shrink-0 rounded-xl border border-v-border-subtle text-v-text-primary text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
                Chats{chats.length ? ` (${chats.length})` : ''}
              </button>
              <p className="flex-1 min-w-0 text-sm text-v-text-secondary truncate" aria-live="off"><span className="sr-only">Current chat: </span>{activeTitle}</p>
              <button
                type="button"
                onClick={newChat}
                aria-label="New chat"
                className="h-11 w-11 shrink-0 rounded-xl bg-v-gold text-v-charcoal flex items-center justify-center text-xl leading-none"
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>
            <p className="hidden md:block mt-2 text-sm text-v-text-primary truncate"><span className="sr-only">Current chat: </span>{activeTitle}</p>
          </div>

          <div
            role="region"
            aria-label={`Conversation: ${activeTitle}`}
            tabIndex={0}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-v-border-subtle bg-v-surface/40 p-3 md:p-4 space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-v-gold"
            aria-busy={loadingChat ? 'true' : undefined}
          >
            {loadingChat && <p className="text-xs text-v-text-secondary">Opening chat…</p>}
            {thread.map((it) => {
              if (it.kind === 'expert') {
                const e = it.e;
                return (
                  <div key={`e-${e.id}`} className="flex justify-start">
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap border ${e.status === 'answered' ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-amber-950/30 border-amber-400/40'}`}>
                      <p className={`text-[10px] uppercase tracking-widest mb-1.5 ${e.status === 'answered' ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {e.status === 'answered' ? 'Shiny Jets expert · Brett' : 'Sent to a Shiny Jets expert'}
                      </p>
                      {e.status === 'answered' ? (
                        <>
                          {e.summary && <p className="text-xs text-v-text-secondary mb-2">Your question: {e.summary}</p>}
                          <p className="text-v-text-primary">{e.answer}</p>
                          <p className="mt-2 text-[11px] text-v-text-secondary">Answered {shortDate(e.answered_at)}. Also sent to your email.</p>
                        </>
                      ) : (
                        <>
                          <p className="text-v-text-primary">{e.summary || 'Your question'}</p>
                          <p className="mt-1 text-xs text-v-text-secondary">Waiting for an answer. You&apos;ll get it here and by email.</p>
                        </>
                      )}
                      {e.photo_urls?.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${e.photo_urls.length} photo${e.photo_urls.length === 1 ? '' : 's'} sent to the expert`}>
                          {e.photo_urls.map((u, pi) => (
                            <li key={pi}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u} alt={`Photo ${pi + 1} sent to the expert`} className="h-16 w-16 rounded-lg object-cover border border-v-border-subtle" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              }
              const { m, i } = it;
              if (m.role === 'notice') {
                return (
                  <p key={i} className="text-xs text-amber-300 text-center px-4">{m.content}</p>
                );
              }
              return (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-v-gold/20 text-v-text-primary border border-v-gold/30'
                        : 'bg-v-charcoal text-v-text-primary border border-v-border-subtle'
                    }`}
                  >
                    {m.role === 'assistant' && (
                      <p className="text-[10px] uppercase tracking-widest text-v-gold mb-1.5">Detailing AI</p>
                    )}
                    {m.photos?.length > 0 ? (
                      <ul className={`flex flex-wrap gap-2 ${m.display ? 'mb-2' : ''}`} aria-label={`${m.photos.length} photo${m.photos.length === 1 ? '' : 's'} you sent`}>
                        {m.photos.map((p, pi) => (
                          <li key={pi}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={`Photo ${pi + 1} you sent`} className="h-24 w-24 md:h-28 md:w-28 rounded-lg object-cover border border-v-gold/30" />
                          </li>
                        ))}
                      </ul>
                    ) : m.photoCount > 0 ? (
                      <p className={`text-xs text-v-text-secondary ${m.display ? 'mb-2' : ''}`}>
                        {m.photoCount} photo{m.photoCount === 1 ? '' : 's'} sent (chat photos aren&apos;t saved)
                      </p>
                    ) : null}
                    {m.display !== undefined ? m.display : m.content}

                    {m.role === 'assistant' && m.suggestions?.services?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-v-border-subtle space-y-2 whitespace-normal">
                        <p className="text-[10px] uppercase tracking-widest text-v-text-secondary">
                          Suggested quote lines
                        </p>
                        <ul className="space-y-1.5">
                          {m.suggestions.services.map((s, si) => (
                            <li
                              key={`${s.name}-${si}`}
                              className="flex items-start justify-between gap-3 text-xs text-v-text-primary"
                            >
                              <span>
                                <span className="font-medium">{s.name}</span>
                                {!s.matched && (
                                  <span className="ml-1.5 text-v-text-secondary">(name match in wizard)</span>
                                )}
                                {s.notes ? (
                                  <span className="block text-v-text-secondary mt-0.5">{s.notes}</span>
                                ) : null}
                              </span>
                              <span className="shrink-0 text-v-gold tabular-nums">
                                {s.hours != null ? `${Number(s.hours).toFixed(1)}h` : '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {m.suggestions.notes && (
                          <p className="text-xs text-v-text-secondary">{m.suggestions.notes}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => createQuoteDraft(i)}
                          disabled={creatingDraft === i}
                          className="mt-1 inline-flex items-center px-3 py-2 rounded-lg bg-v-gold text-v-charcoal text-[11px] font-semibold uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition"
                        >
                          {creatingDraft === i ? 'Opening…' : 'Create quote draft'}
                        </button>
                        <p className="text-[10px] text-v-text-secondary">
                          Opens /quotes/new prefilled — draft only, nothing is sent.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 text-sm border border-v-border-subtle bg-v-charcoal text-v-text-secondary">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && !loadingChat && (
            <div className="mt-3 flex flex-wrap gap-2 shrink-0 max-h-[30vh] overflow-y-auto">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={loading}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-v-border-subtle text-v-text-secondary hover:text-v-text-primary hover:border-v-gold/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>
          )}

          <p role="status" aria-live="polite" className="sr-only">{preparing ? 'Preparing photo…' : photoStatus}</p>
          <p aria-live="polite" className="sr-only" data-testid="chat-announcer">{announce}</p>
          {photoStatus && !preparing && /couldn|Only|up to/.test(photoStatus) && (
            <p className="mt-2 text-xs text-amber-300" aria-hidden="true">{photoStatus}</p>
          )}

          {photos.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2 shrink-0" aria-label={`Photos to send (${photos.length} of ${MAX_PHOTOS})`}>
              {photos.map((p, pi) => (
                <li key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.previewUrl} alt={`Photo ${pi + 1} to send`} className="h-16 w-16 rounded-lg object-cover border border-v-border-subtle" />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id, pi)}
                    aria-label={`Remove photo ${pi + 1}`}
                    className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-v-charcoal border border-v-border-subtle text-v-text-primary text-sm leading-none flex items-center justify-center hover:border-v-gold/60"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={onSubmit} className="mt-3 flex gap-2 items-end shrink-0 min-w-0">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
            />
            {/* At the 3-photo limit the button is aria-disabled (still focusable) so focus can return here after removing a photo. */}
            <button
              ref={photoButtonRef}
              type="button"
              onClick={() => {
                if (photos.length >= MAX_PHOTOS) { setPhotoStatus(`You can add up to ${MAX_PHOTOS} photos per message.`); return; }
                fileRef.current?.click();
              }}
              disabled={loading || preparing}
              aria-disabled={photos.length >= MAX_PHOTOS ? 'true' : undefined}
              aria-label={photos.length >= MAX_PHOTOS ? `Add photo (limit of ${MAX_PHOTOS} reached)` : `Add photo (${photos.length} of ${MAX_PHOTOS})`}
              className="h-11 w-11 shrink-0 rounded-xl border border-v-border-subtle text-v-text-primary flex items-center justify-center hover:border-v-gold/50 disabled:opacity-40 aria-disabled:opacity-40 transition"
            >
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
            </button>
            <textarea
              aria-label="Message Detailing AI"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={photos.length ? "Add a note (optional)…" : "Describe the aircraft and the issue…"}
              className="flex-1 min-w-0 resize-none rounded-xl bg-v-charcoal border border-v-border-subtle px-4 py-3 text-sm text-v-text-primary placeholder:text-v-text-secondary/60 focus:outline-none focus:border-v-gold/50"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || preparing || (!input.trim() && photos.length === 0)}
              className="h-11 px-4 md:px-5 shrink-0 rounded-xl bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={() => { setDrawerOpen(false); chatsButtonRef.current?.focus(); }} />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="chats-drawer-title"
            className="absolute inset-y-0 left-0 w-[86%] max-w-sm bg-v-charcoal border-r border-v-border-subtle p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 id="chats-drawer-title" className="font-heading text-v-text-primary text-base uppercase tracking-wider">Chats</h2>
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); chatsButtonRef.current?.focus(); }}
                aria-label="Close chats"
                className="h-11 w-11 rounded-xl border border-v-border-subtle text-v-text-primary flex items-center justify-center text-xl leading-none"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="flex-1 min-h-0">{chatList('drawer')}</div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
