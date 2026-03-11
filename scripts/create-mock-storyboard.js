#!/usr/bin/env node
/**
 * create-mock-storyboard.js
 * Generates a sample CC01 storyboard .docx for review and iteration.
 *
 * Usage:
 *   node scripts/create-mock-storyboard.js
 *   node scripts/create-mock-storyboard.js --output storyboard/my-draft.docx
 *
 * Format: Plain Key: Value paragraphs under Heading 2 slide headings.
 * No tables — easy for AI to generate and easy to edit in Word.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

let docxLib;
try { docxLib = require('docx'); } catch {
  console.error('docx package not found. Install: npm install docx --save-dev');
  process.exit(1);
}

const {
  Document, Packer, Paragraph, TextRun,
  HeadingLevel, AlignmentType, BorderStyle,
} = docxLib;

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const PORSCHE_RED = 'D5001C';
const DARK_GRAY   = '3E4146';
const MID_GRAY    = '6B7280';

// ---------------------------------------------------------------------------
// Paragraph helpers
// ---------------------------------------------------------------------------

// Stage direction annotation — shown in document, ignored by parser
function annotation(text) {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, color: MID_GRAY, size: 18 })],
    spacing:  { before: 120, after: 40 },
    indent:   { left: 120 },
  });
}

function courseTitle(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { after: 120 } });
}

function metaLine(text) {
  return new Paragraph({
    children: [new TextRun({ text, color: MID_GRAY, size: 18, italics: true })],
    spacing: { after: 80 },
  });
}

function slideHeading(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 60 } });
}

function field(key, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${key}: `, bold: true, size: 20, color: DARK_GRAY }),
      new TextRun({ text: value, size: 20 }),
    ],
    spacing: { after: 40 },
    indent:  { left: 120 },
  });
}

function sectionLabel(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 20, color: PORSCHE_RED })],
    spacing: { before: 400, after: 120 },
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' } },
    spacing: { before: 280, after: 0 },
  });
}

function spacer() {
  return new Paragraph({ text: '', spacing: { after: 40 } });
}

// ---------------------------------------------------------------------------
// Slide definitions
// ---------------------------------------------------------------------------

const SLIDES = [

  // ── SLD-CC01-001 — Title / Hero ──────────────────────────────────────────
  {
    heading: 'Slide 01 — Expert Technician as Brand Ambassador',
    fields: [
      ['Slide-ID',        'SLD-CC01-001'],
      ['Template-ID',     'hero-title'],
      ['Slide-Title',     'Expert Technician as Brand Ambassador'],
      { annotation: '>> On slide load → SLD-CC01-001-INTRO.mp3' },
      ['Voiceover-INTRO', 'As a Porsche technician, you represent far more than technical expertise. You are a brand ambassador — the human face of Porsche excellence.'],
      ['Caption-Text',    'As a Porsche technician, you represent far more than technical expertise.'],
      ['Image',           'A confident Porsche technician in a clean uniform stands beside a customer in a bright, modern Porsche service bay. The technician is engaged and approachable — not just a mechanic but a trusted expert. Warm, professional lighting. Wide shot that fills the frame.'],
      ['Status',          'Approved'],
      ['Notes',           'Full-bleed hero image. Title fades in at 0.5s. Subtitle animates up at 1.2s.'],
    ],
  },

  // ── SLD-CC01-002 — Standard content + stat ───────────────────────────────
  {
    heading: 'Slide 02 — Beyond the Wrench',
    fields: [
      ['Slide-ID',        'SLD-CC01-002'],
      ['Template-ID',     'content-stat'],
      ['Slide-Title',     'Beyond the Wrench'],
      { annotation: '>> On slide load → SLD-CC01-002-INTRO.mp3' },
      ['Voiceover-INTRO', 'Your role goes beyond technical repairs. Every customer interaction shapes their perception of Porsche as a brand. Studies show that 78% of customers say their service experience directly influences their brand loyalty.'],
      ['Caption-Text',    'Your role goes beyond technical repairs. Every customer interaction shapes brand perception.'],
      ['On-Screen-Text',  '78% of customers say their service experience directly influences brand loyalty.'],
      ['Image',           'A senior Porsche technician seated across from a customer at a service consultation desk. Both are looking at a tablet showing vehicle inspection data. Relaxed, professional tone. Warm dealership interior with cars subtly visible in the background.'],
      ['Status',          'In Review'],
      ['Notes',           'Animated stat counter on the 78% figure. Fires at ~4s into VO.'],
    ],
  },

  // ── SLD-CC01-004 — Multi-card CLICK interaction ───────────────────────────
  {
    heading: 'Slide 03 — The Five Pillars of Excellence',
    fields: [
      ['Slide-ID',                       'SLD-CC01-004'],
      ['Template-ID',                    'card-explore'],
      ['Slide-Title',                    'Five Pillars of Excellence'],
      { annotation: '>> On slide load → SLD-CC01-004-INTRO.mp3' },
      ['Voiceover-INTRO',                'Excellence in customer communication rests on five pillars. Click each card to explore them.'],
      { annotation: '>> User clicks Appearance card → SLD-CC01-004-CLICK-Appearance.mp3' },
      ['Voiceover-CLICK-Appearance',     'Your professional appearance communicates competence and respect before you say a word. A clean uniform, proper PPE, and attention to grooming set the tone for the entire interaction.'],
      { annotation: '>> User clicks Communication card → SLD-CC01-004-CLICK-Communication.mp3' },
      ['Voiceover-CLICK-Communication',  'Clear, jargon-free communication builds trust and keeps customers informed. Explain what you found, what you did, and why it matters — in plain language.'],
      { annotation: '>> User clicks Passion card → SLD-CC01-004-CLICK-Passion.mp3' },
      ['Voiceover-CLICK-Passion',        'Genuine passion for Porsche is contagious. Customers can tell the difference between someone going through the motions and someone who truly loves the craft.'],
      { annotation: '>> User clicks Professionalism card → SLD-CC01-004-CLICK-Professionalism.mp3' },
      ['Voiceover-CLICK-Professionalism','Every interaction — from the greeting to the final handshake — reflects your professionalism and, by extension, the Porsche brand.'],
      { annotation: '>> User clicks Technical Expertise card → SLD-CC01-004-CLICK-TechnicalExpertise.mp3' },
      ['Voiceover-CLICK-TechnicalExpertise', 'Customers trust technicians who can explain complex issues in plain language. Your expertise is most powerful when you can share it clearly.'],
      ['Caption-Text',                   'Excellence in customer communication rests on five pillars.'],
      ['Image',                          'Dark, abstract background with subtle depth — suggests precision and professionalism. Porsche-brand feel. The cards sit in the foreground so the background should not compete for attention.'],
      ['Status',                         'Draft'],
      ['Notes',                          'Five flip-cards. Cards locked until INTRO VO ends. All five must be clicked to unlock Next.'],
    ],
  },

  // ── SLD-CC01-008 — Two-part VO ────────────────────────────────────────────
  {
    heading: 'Slide 04 — Service Quality',
    fields: [
      ['Slide-ID',                     'SLD-CC01-008'],
      ['Template-ID',                  'split-explore'],
      ['Slide-Title',                  'Service Quality'],
      { annotation: '>> On slide load → SLD-CC01-008-INTRO.mp3' },
      ['Voiceover-INTRO',              'Service quality is the cornerstone of customer satisfaction. Understanding what customers expect — and consistently exceeding those expectations — is what sets Porsche apart.'],
      { annotation: '>> User clicks the detail panel → SLD-CC01-008-CLICK-ServiceDetail.mp3' },
      ['Voiceover-CLICK-ServiceDetail','When a customer brings their Porsche in for service, they are trusting you with more than a vehicle. They are trusting you with something they are passionate about. Click Next to continue.'],
      ['Caption-Text',                 'Service quality is the cornerstone of customer satisfaction.'],
      ['Image',                        'A Porsche service advisor reviewing a vehicle inspection report with a customer at a service counter. The customer looks reassured and engaged. Modern Porsche service environment — vehicles on lifts visible through a glass partition in the background.'],
      ['Status',                       'Approved'],
      ['Notes',                        'INTRO = part 1 VO. CLICK-ServiceDetail = part 2 VO triggered when user clicks the card. Next only unlocks after part 2 finishes.'],
    ],
  },

  // ── SLD-CC01-010 — Video background ──────────────────────────────────────
  {
    heading: 'Slide 05 — Customer Communications',
    fields: [
      ['Slide-ID',        'SLD-CC01-010'],
      ['Template-ID',     'video-bg'],
      ['Slide-Title',     'Customer Communications'],
      { annotation: '>> On slide load → SLD-CC01-010-INTRO.mp3' },
      ['Voiceover-INTRO', 'Every conversation with a customer is an opportunity to strengthen their relationship with Porsche. The way you communicate — your words, your tone, your body language — all contribute to a memorable service experience.'],
      ['Caption-Text',    'Every conversation is an opportunity to strengthen the customer relationship.'],
      ['Video',           'A Porsche technician walks alongside a customer through a bright, modern service bay, gesturing toward a vehicle on a lift while explaining the work performed. The customer looks satisfied and engaged. Slow, steady camera movement. Cinematic feel — no rapid cuts.'],
      ['Status',          'Approved'],
      ['Notes',           'Video loops from frame 0. Plays at 50% brightness as background. Use WebM — no mid-clip seek.'],
    ],
  },

  // ── KC-CC01-001 — Knowledge Check ────────────────────────────────────────
  {
    heading: 'Slide 06 — Knowledge Check 1',
    fields: [
      ['Slide-ID',        'KC-CC01-001'],
      ['Template-ID',     'knowledge-check'],
      ['Slide-Title',     'Knowledge Check'],
      { annotation: '>> On slide load → KC-CC01-001-INTRO.mp3' },
      ['Voiceover-INTRO', "Let's check your understanding. Select the best answer."],
      ['Question',        'Which of the following best describes the role of a Porsche technician?'],
      ['Choice-1',        'A highly trained mechanic focused solely on vehicle repairs'],
      ['Choice-2',        'A brand ambassador who combines technical skill with exceptional customer communication'],
      ['Choice-3',        'A customer service representative with minimal technical knowledge'],
      ['Choice-4',        'A salesperson who also performs vehicle maintenance'],
      ['Correct-Answer',  '2'],
      ['Review-Slide',    'SLD-CC01-001'],
      ['Caption-Text',    "Let's check your understanding."],
      ['Status',          'Approved'],
      ['Notes',           'Wrong answer shows "Back to Review" button → returns to SLD-CC01-001. Correct answer unlocks Next.'],
    ],
  },

  // ── FQ-CC01-001 — Final Quiz ──────────────────────────────────────────────
  {
    heading: 'Slide 07 — Final Assessment — Question 1',
    fields: [
      ['Slide-ID',        'FQ-CC01-001'],
      ['Template-ID',     'final-quiz'],
      ['Slide-Title',     'Final Assessment — Question 1'],
      { annotation: '>> On slide load → FQ-CC01-001-INTRO.mp3' },
      ['Voiceover-INTRO', 'Question one of four. Choose the best answer.'],
      ['Question',        'A customer asks why a repair cost more than originally estimated. What is the best approach?'],
      ['Choice-1',        'Apologize and offer a discount without further explanation'],
      ['Choice-2',        'Explain the additional findings in plain language and walk them through the work performed'],
      ['Choice-3',        'Refer them immediately to the service advisor without comment'],
      ['Choice-4',        'Provide a written summary only and avoid direct conversation'],
      ['Correct-Answer',  '2'],
      ['Caption-Text',    'Question one of four. Choose the best answer.'],
      ['Status',          'Approved'],
      ['Notes',           'Part of the 4-question final assessment. Pass threshold: 80%. Score reported to SCORM.'],
    ],
  },

];

// ---------------------------------------------------------------------------
// Field reference entries
// ---------------------------------------------------------------------------

const FIELD_REFERENCE = [
  ['Slide-ID',              'Unique slide identifier — e.g. SLD-CC01-001, KC-CC01-001, FQ-CC01-001'],
  ['Template-ID',           'Slide layout — e.g. hero-title, card-explore, video-bg, knowledge-check, final-quiz'],
  ['Slide-Title',           'Display title shown in course menu'],
  ['Voiceover-INTRO',       'VO that plays on slide entry (always required if slide has audio)'],
  ['Voiceover-CLICK-Label', 'VO triggered when a named card or hotspot is clicked — e.g. Voiceover-CLICK-Appearance'],
  ['Voiceover-TAB-Label',   'VO triggered when a named tab or accordion section opens — e.g. Voiceover-TAB-Charging'],
  ['Voiceover-STEP-N',      'VO triggered at step N in a sequence — e.g. Voiceover-STEP-02'],
  ['Caption-Text',          'Closed-caption text (VTT overlay). Usually matches Voiceover-INTRO.'],
  ['On-Screen-Text',        'Text displayed visually on the slide (stat, pull quote, label, etc.)'],
  ['Image',                 'Art direction for the slide image. Describe subject, composition, mood, and setting. Replace with a filename once the asset is ready.'],
  ['Image-File',            '(Production) Actual filename once the image has been sourced — e.g. PTech-w-customer1-NEW.webp'],
  ['Video',                 'Art direction for the background video. Describe subject, camera movement, and tone. Replace with a filename once the asset is ready.'],
  ['Video-File',            '(Production) Actual filename once the video has been sourced — e.g. Customer-communications-video1_1.webm'],
  ['Question',              '(KC / FQ only) The question text'],
  ['Choice-1 … Choice-N',  '(KC / FQ only) Answer choices'],
  ['Correct-Answer',        '(KC / FQ only) Number of the correct choice — e.g. 2'],
  ['Review-Slide',          '(KC only) Slide ID to return to on wrong answer — e.g. SLD-CC01-001'],
  ['Status',                'Authoring status — Draft, In Review, or Approved'],
  ['Notes',                 'Developer / production notes (not parsed into course data)'],
];

// ---------------------------------------------------------------------------
// Build document
// ---------------------------------------------------------------------------

function buildDocument() {
  const children = [
    courseTitle('Course: Customer Communications — Module 1'),
    metaLine('Module ID: CC01  |  Version: 1.0  |  Status: Draft'),
    metaLine('How to use: Each slide starts with a "Slide XX" heading. Fields follow in Key: Value format.'),
    metaLine('Run: npm run import-storyboard -- --docx <this file>'),
    spacer(),
  ];

  for (const slide of SLIDES) {
    children.push(divider());
    children.push(slideHeading(slide.heading));
    for (const entry of slide.fields) {
      if (Array.isArray(entry)) {
        children.push(field(entry[0], entry[1]));
      } else if (entry.annotation) {
        children.push(annotation(entry.annotation));
      }
    }
  }

  // Field reference
  children.push(divider());
  children.push(sectionLabel('Field Reference'));
  for (const [key, value] of FIELD_REFERENCE) {
    children.push(field(key, value));
  }
  children.push(spacer());

  return new Document({
    creator:     'Porsche WBT Project',
    title:       'Customer Communications Module 1 — Storyboard',
    description: 'CC01 course storyboard. Parse with: npm run import-storyboard -- --docx <file>',
    sections: [{ children }],
    styles: {
      default: {
        document: {
          run:       { font: 'Calibri', size: 20, color: '111827' },
          paragraph: { spacing: { after: 80 } },
        },
      },
      paragraphStyles: [
        {
          id:   'Heading1',
          name: 'Heading 1',
          run:  { font: 'Calibri', size: 40, bold: true, color: DARK_GRAY },
        },
        {
          id:   'Heading2',
          name: 'Heading 2',
          run:  { font: 'Calibri', size: 26, bold: true, color: PORSCHE_RED },
        },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  let outputPath = path.join('storyboard', 'CC01-Mock-Storyboard.docx');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--output') outputPath = argv[++i];
  }

  const doc    = buildDocument();
  const buffer = await Packer.toBuffer(doc);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);

  console.log(`\nMock storyboard created: ${outputPath}`);
  console.log(`Slides: ${SLIDES.length}`);
  console.log('\nTo test the parser:');
  console.log(`  node scripts/import-storyboard.js --docx ${outputPath}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
