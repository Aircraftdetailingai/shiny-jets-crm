// First-run tutorial for Detailing AI (CRM and standalone use the same /detailing-ai page).
// Brett's wording: Shiny Jets procedures are "methods", never "recipes".
export const TUTORIAL_STORAGE_KEY = 'detailing_ai_tutorial_v1';
export const ASK_EXPERT_LABEL = 'Ask a Shiny Jets expert';

// Privacy copy (Brett, Oct 4 2026): the AI is not crowd-sourced. Verified in code: chats, projects,
// escalations and catalog reads are scoped to the account, and the shared knowledge is written only
// by Shiny Jets (Brett's own general question + answer, never a detailer's words; see
// lib/ask-brett.js buildKnowledgeRow). Same wording as aircraftdetailing.ai. Don't say "train".
export const PRIVACY_TITLE = 'Your shop stays private.';
export const PRIVACY_BODY = 'The AI isn\u2019t crowd-sourced. Your questions, prices and customer info stay in your account and are never shared with other shops.';

export const TUTORIAL_SLIDES = [
  {
    id: 'welcome',
    icon: '\u2708\uFE0F',
    title: 'Welcome to Detailing AI',
    lead: 'Your aircraft detailing coach, built on Shiny Jets methods.',
    points: [
      'Sharpen your skills with clear, step-by-step methods.',
      'Save labor and time by getting the right approach first.',
      'Get great results on paint, brightwork, interiors and coatings.',
    ],
  },
  {
    id: 'private',
    icon: '\uD83D\uDD12',
    title: PRIVACY_TITLE,
    lead: PRIVACY_BODY,
    points: [],
  },
  {
    id: 'ask',
    icon: '\uD83D\uDCAC',
    title: 'How to ask',
    lead: 'The more you tell it, the better the answer. Include:',
    points: [
      'Aircraft type (for example King Air 350, Citation CJ3).',
      'The area: leading edge, belly, brightwork, and so on.',
      'The surface: paint, bare aluminum, chrome.',
      'What you see, and what you\u2019ve tried (products, pad, machine).',
      'Your goal: clean, corrected, shiny, protected.',
    ],
  },
  {
    id: 'photos',
    icon: '\uD83D\uDCF7',
    title: 'Great photos',
    lead: 'Add up to 3 photos to a message. For the clearest answer:',
    points: [
      'Shoot in the shade, at an angle to the surface.',
      'On white paint, use a swirl light or flashlight to show defects.',
      'Send one close-up plus one wider shot.',
      'Wipe the area clean first.',
    ],
  },
  {
    id: 'organize',
    icon: '\uD83D\uDDC2\uFE0F',
    title: 'Stay organized',
    lead: 'Keep each job easy to find later.',
    points: [
      'Make a project for each aircraft or customer. Add notes (paint, products, tools) and Detailing AI reads them in every chat in that project.',
      'Start a new chat for each aircraft or problem. Chats are saved, and you can rename, move or delete them.',
      'Long chat? Tap \u201cStart a fresh chat\u201d and a summary comes with you.',
    ],
  },
  {
    id: 'stuck',
    icon: '\uD83E\uDDD1\u200D\uD83D\uDD27',
    title: 'Stuck?',
    lead: `Tap \u201c${ASK_EXPERT_LABEL}\u201d: $4.99 for one question answered by a Shiny Jets expert.`,
    points: [
      'You get the answer right in your chat and by email. A follow-up question needs a new payment.',
      'When Detailing AI can\u2019t answer something itself, it sends it to Brett for free.',
    ],
  },
];
