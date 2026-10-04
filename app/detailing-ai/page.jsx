"use client";

import { useEffect, useRef, useState } from 'react';
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

export default function DetailingAiPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "I'm Detailing AI — diagnostic help for exterior, interior, brightwork, and ceramic. Describe the jet and what you're seeing, and I'll help you diagnose and align services. I don't replace manufacturer specs.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creatingDraft, setCreatingDraft] = useState(null);
  const [photos, setPhotos] = useState([]); // pending photos for the next message (in memory only)
  const [photoStatus, setPhotoStatus] = useState('');
  const [preparing, setPreparing] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const photoButtonRef = useRef(null);

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

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) router.push('/login');
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
    const userMsg = { role: 'user', content, display: typed, photos: sending.map((p) => ({ url: p.previewUrl })) };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/detailing-ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content })),
          images: sending.map((p) => ({ media_type: p.media_type, data: p.data })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.reply) {
        setError(data.error || 'Request failed');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.error || 'Something went wrong. Try again.' },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply || 'No response from Detailing AI.',
            suggestions: data.suggestions || null,
          },
        ]);
      }
    } catch (err) {
      setError(err.message || 'Network error');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network error talking to Detailing AI. Check your connection and try again.' },
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

  return (
    <AppShell title="Detailing AI">
      {/* dvh keeps the composer above mobile browser toolbars (100vh is
          taller than the visible area on phones, which pushed the input
          off-screen). min-h-0 lets the message list shrink instead. */}
      <div className="flex flex-col w-full min-w-0 h-[calc(100vh-3.5rem)] supports-[height:100dvh]:h-[calc(100dvh-3.5rem)] max-w-3xl mx-auto px-4 md:px-8 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 md:mb-4 shrink-0 min-w-0">
          <h2 className="font-heading text-v-text-primary text-lg font-light uppercase tracking-wider md:tracking-widest break-words">
            Detailing AI
          </h2>
          <p className="text-sm text-v-text-secondary mt-1">
            Aircraft detailing diagnosis for your shop — exterior, interior, brightwork, ceramic.
            Describe the issue or add up to {MAX_PHOTOS} photos. Suggested services can open a draft quote (never auto-sent).
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-v-border-subtle bg-v-surface/40 p-3 md:p-4 space-y-4">
          {messages.map((m, i) => (
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
                {m.photos?.length > 0 && (
                  <ul className={`flex flex-wrap gap-2 ${m.display ? 'mb-2' : ''}`} aria-label={`${m.photos.length} photo${m.photos.length === 1 ? '' : 's'} you sent`}>
                    {m.photos.map((p, pi) => (
                      <li key={pi}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={`Photo ${pi + 1} you sent`} className="h-24 w-24 md:h-28 md:w-28 rounded-lg object-cover border border-v-gold/30" />
                      </li>
                    ))}
                  </ul>
                )}
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
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 text-sm border border-v-border-subtle bg-v-charcoal text-v-text-secondary">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length <= 1 && (
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
    </AppShell>
  );
}
