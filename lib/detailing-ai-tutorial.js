// First-run tutorial for Detailing AI (CRM and standalone use the same /detailing-ai page).
// Brett's wording: Shiny Jets procedures are "methods", never "recipes".
export const TUTORIAL_STORAGE_KEY = 'detailing_ai_tutorial_v1';
export const ASK_EXPERT_LABEL = 'Ask a Shiny Jets expert';

export const TUTORIAL_SLIDES = [
  {
    id: 'welcome',
    title: 'Welcome to Detailing AI',
    lead: 'Your aircraft detailing coach, built on Shiny Jets methods.',
    points: [
      'Sharpen your skills with clear, step-by-step methods.',
      'Save labor and time by getting the right approach first.',
      'Get great results on paint, brightwork, interiors and coatings.',
    ],
  },
  {
    id: 'ask',
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
    title: 'Stuck?',
    lead: `Tap \u201c${ASK_EXPERT_LABEL}\u201d and Brett answers.`,
    points: [
      'You get the answer right in your chat and by email.',
      'Detailing AI also offers this when it isn\u2019t sure.',
    ],
  },
];
