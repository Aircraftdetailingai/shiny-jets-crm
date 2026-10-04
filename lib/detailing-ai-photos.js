// Detailing AI photo diagnosis: server-side checks and provider payloads.
// Pure helpers (no Next/Supabase imports): node scripts/test-detailing-ai-photos.mjs
//
// Privacy: photos are NOT stored. They travel in the request body, are checked
// here, sent to the AI provider with that one chat turn, and dropped. The chat
// page only keeps in-memory previews for the open session.
//
// Cost control: the phone resizes to <= 1568px on the long edge and <= ~1.15 MP
// (Anthropic's recommended limits, so the API never has to downscale) as JPEG
// ~0.8, which is ~1,600 input tokens per photo at most. Up to 3 photos per message.

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 1_500_000; // per photo, decoded (resized phone JPEGs are ~150-500 KB)
export const MAX_TOTAL_PHOTO_BYTES = 3_600_000; // keeps the JSON body under Vercel's 4.5 MB limit
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_EDGE = 1568;
export const MAX_PHOTO_PIXELS = 1_150_000;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function sniffType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// Validates the `images` array from the request body.
// Accepts [{ media_type, data }] where data is raw base64 or a data: URL.
// Returns { ok: true, images: [{ media_type, data, bytes }] } or { ok: false, status, error }.
export function validatePhotos(input) {
  if (input == null) return { ok: true, images: [] };
  if (!Array.isArray(input)) return { ok: false, status: 400, error: 'Photos were not sent correctly. Try adding them again.' };
  if (input.length === 0) return { ok: true, images: [] };
  if (input.length > MAX_PHOTOS) return { ok: false, status: 400, error: `You can attach up to ${MAX_PHOTOS} photos per message.` };

  const out = [];
  let total = 0;
  for (let i = 0; i < input.length; i++) {
    const img = input[i] || {};
    let data = typeof img.data === 'string' ? img.data.trim() : '';
    let declared = typeof img.media_type === 'string' ? img.media_type.toLowerCase().trim() : '';
    const m = data.match(/^data:([a-z/+.-]+);base64,(.*)$/i);
    if (m) { declared = declared || m[1].toLowerCase(); data = m[2]; }
    if (!ALLOWED_PHOTO_TYPES.includes(declared)) {
      return { ok: false, status: 415, error: 'Photos must be JPEG, PNG or WebP.' };
    }
    if (!data || data.length % 4 !== 0 || !BASE64_RE.test(data)) {
      return { ok: false, status: 400, error: `Photo ${i + 1} could not be read. Try adding it again.` };
    }
    const buf = Buffer.from(data, 'base64');
    if (buf.length > MAX_PHOTO_BYTES) {
      return { ok: false, status: 413, error: `Photo ${i + 1} is too large. Try a smaller photo.` };
    }
    const actual = sniffType(buf);
    if (!actual || actual !== declared) {
      return { ok: false, status: 415, error: `Photo ${i + 1} isn't a JPEG, PNG or WebP image.` };
    }
    total += buf.length;
    if (total > MAX_TOTAL_PHOTO_BYTES) {
      return { ok: false, status: 413, error: 'These photos are too large together. Try fewer photos.' };
    }
    out.push({ media_type: actual, data, bytes: buf.length });
  }
  return { ok: true, images: out };
}

// Attach photos to the LAST user turn (Anthropic: image blocks first, then text).
export function withAnthropicPhotos(messages, images) {
  if (!images?.length || !messages?.length) return messages;
  const out = messages.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  if (last.role !== 'user') return out;
  last.content = [
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } })),
    { type: 'text', text: last.content },
  ];
  return out;
}

export function withOpenAIPhotos(messages, images) {
  if (!images?.length || !messages?.length) return messages;
  const out = messages.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  if (last.role !== 'user') return out;
  last.content = [
    { type: 'text', text: last.content },
    ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.media_type};base64,${img.data}`, detail: 'high' } })),
  ];
  return out;
}

export const PHOTO_PROMPT = `
Photos (when the detailer attaches photos to a message):
- FIRST, look at each photo and decide what it shows, before reading anything into the detailer's text. Only aircraft or aircraft parts count (fuselage, wings, leading edges, nacelles, cowlings, props, gear, windows, brightwork, cabin interior).
- If a photo is NOT an aircraft or aircraft part (for example a car, truck, boat, motorcycle, house, or a random object), say so plainly in your first sentence, e.g. "Photo 1 looks like a car door, not an aircraft." Do not diagnose it as an aircraft surface, do not call it a fuselage, wing or any aircraft part even if the detailer's text does, do not recommend methods for it, and do not add quote suggestions for it. Ask for a photo of the aircraft surface they want help with.
- If you can't clearly tell what a photo shows, or whether it's an aircraft (too close, too dark, blurry, cropped), thank them and give your best guess in one line, e.g. "Thanks for the photo, it looks like this might be oxidation on a polished leading edge." Then ask for more context: what part of the aircraft it is, what they're seeing (in person, not just in the photo), and what they're trying to do. Don't jump to a full method or quote suggestions until they answer; a closer, wider or better-lit shot also helps.
- When several photos are sent, handle each one: diagnose the aircraft photos and call out any that aren't aircraft.
- Describe what you can actually see (defect type, location on the aircraft, rough severity) before you diagnose. Lead with the most likely diagnosis and say how confident you are.
- A photo cannot prove some things: single-stage vs clearcoat, defect depth, or whether haze is a film or scratches. Say what the detailer should check in person (test spot, wipe test, paint-depth / thickness reading, touch) before quoting.
- Swirls/marring vs oxidation vs clearcoat failure vs acrylic crazing: name which one it looks like and the visual cues. Crazing, cracking, peeling clear, or corrosion beyond polish means stop and refer, same as text.
- If the photo is too dark, blurry, far away, or doesn't show the problem, say so and ask for a closer, well-lit shot (angle a flashlight across paint to show swirls).
- All Detailing AI rules above still apply to photo answers (methods wording, product rules, manuals, advisory-only).`;

// Rough input-token estimate for one photo (Anthropic: tokens ≈ width × height / 750).
export function estimatePhotoTokens(width, height) {
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(width, height), Math.sqrt(MAX_PHOTO_PIXELS / (width * height)));
  return Math.ceil((Math.round(width * scale) * Math.round(height * scale)) / 750);
}
