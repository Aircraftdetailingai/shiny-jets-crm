// Default intake flow — pre-loaded for every new detailer
export const DEFAULT_QUESTIONS = [
  {
    id: 'q_tail',
    type: 'text',
    text: 'What is your tail number?',
    placeholder: 'N12345',
    required: false,
    faaAutofill: true,
  },
  {
    id: 'q_services',
    type: 'multi_select',
    text: 'What services do you need?',
    required: true,
    options: [
      'Exterior Wash & Detail',
      'Paint Polish / One-Step',
      'Ceramic Coating',
      'Spray Ceramic',
      'Wax',
      'Decon Wash',
      'Brightwork Polish',
      'Interior Detail',
      'Leather Clean & Condition',
      'Carpet Extraction',
      'Transparencies',
    ],
  },
  {
    id: 'q_paint_goal',
    type: 'single_select',
    text: 'What is your goal for the paint?',
    required: false,
    options: ['Maximum gloss & protection', 'Clean and protected', 'Just clean'],
    showIf: { questionId: 'q_services', hasAny: ['Exterior Wash & Detail', 'Paint Polish / One-Step', 'Ceramic Coating', 'Spray Ceramic', 'Wax', 'Decon Wash'] },
  },
  {
    id: 'q_notes',
    type: 'long_text',
    text: 'Anything we should know?',
    placeholder: 'Special instructions, access details, timing...',
    required: false,
  },
  {
    id: 'q_photos',
    type: 'photo_upload',
    text: 'Upload photos of your aircraft',
    required: false,
  },
];

export const QUESTION_TYPES = [
  { key: 'single_select', label: 'Single Select', desc: 'Tap one option' },
  { key: 'multi_select', label: 'Multi Select', desc: 'Tap multiple options' },
  { key: 'yes_no', label: 'Yes / No', desc: 'Simple yes or no' },
  { key: 'text', label: 'Short Text', desc: 'One line answer' },
  { key: 'long_text', label: 'Long Text', desc: 'Multi-line answer' },
  { key: 'photo_upload', label: 'Photo Upload', desc: 'Upload images' },
  { key: 'number', label: 'Number', desc: 'Numeric input' },
  { key: 'date', label: 'Date Picker', desc: 'Select a date' },
];
