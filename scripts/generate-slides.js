#!/usr/bin/env node
/**
 * generate-slides.js
 * Reads storyboard/course.md and generates production-ready HTML slide files.
 *
 * Usage:
 *   node scripts/generate-slides.js [--storyboard storyboard/course.md] [--force]
 *
 * Outputs:
 *   course/slides/{SLIDE_ID}.html        — one per slide (skipped if exists, unless --force)
 *   course/data/course.data.json         — rewrites slides[] + quiz; preserves meta
 *   course/data/kc-review.json           — KC slide ID → review slide array map
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    storyboard: path.join('storyboard', 'course.md'),
    slidesDir:  path.join('course', 'slides'),
    dataDir:    path.join('course', 'data'),
    templatesDir: path.join('scripts', 'templates'),
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--storyboard') args.storyboard  = argv[++i];
    if (argv[i] === '--slides-dir') args.slidesDir   = argv[++i];
    if (argv[i] === '--force')      args.force        = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Parse storyboard/course.md
// ---------------------------------------------------------------------------

function parseCourseMd(mdPath) {
  const text  = fs.readFileSync(mdPath, 'utf8');
  const lines = text.split('\n');

  let courseTitle = 'Untitled Course';
  const slides    = [];
  let current     = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === '---') continue;

    // Course title line: "# Course: Module Name"
    const courseTitleMatch = line.match(/^#\s+Course:\s*(.+)$/i);
    if (courseTitleMatch) {
      courseTitle = courseTitleMatch[1].trim();
      continue;
    }

    // Slide heading: "## Slide 01 — Title"
    if (line.startsWith('## ')) {
      if (current) slides.push(current);
      current = { _heading: line.slice(3).trim() };
      continue;
    }

    if (!current) continue;

    // Stage directions (ignored)
    if (line.startsWith('>>')) continue;

    // Key: Value lines
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key   = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (current[key] !== undefined) {
        // Continuation — append
        current[key] += ' ' + value;
      } else {
        current[key] = value;
      }
    }
  }

  if (current) slides.push(current);

  // Normalise slide entries
  slides.forEach((slide, idx) => {
    slide['Slide-ID']    = slide['Slide-ID']    || `slide_${String(idx + 1).padStart(2, '0')}`;
    slide['Template-ID'] = slide['Template-ID'] || 'content-split';
    slide['Slide-Title'] = slide['Slide-Title'] || slide._heading || `Slide ${idx + 1}`;
  });

  return { courseTitle, slides };
}

// ---------------------------------------------------------------------------
// Build audio VO path from Slide-ID
// Returns path relative to the SLIDE file (e.g. "../assets/audio/vo/SLD_XX01_001_INTRO.mp3")
// and player path (no leading ../) used in course.data.json
// ---------------------------------------------------------------------------

function resolveAudioPaths(slideId) {
  // Detect separator from the slide ID:
  //   underscore format: SLD_CC02_001 → SLD_CC02_001_INTRO.mp3
  //   hyphen format:     SLD-CC02-001 → SLD-CC02-001-INTRO.mp3
  const sep      = slideId.includes('_') ? '_' : '-';
  const fileName = slideId + sep + 'INTRO.mp3';
  return {
    slidePath:  '../assets/audio/vo/' + fileName,
    playerPath: 'assets/audio/vo/'    + fileName,
  };
}

// ---------------------------------------------------------------------------
// Extract CLICK trigger labels from a slide's Voiceover-CLICK-* keys
// Returns [ { label: "CardOne", audioSlide: "../assets/audio/..." }, ... ]
// ---------------------------------------------------------------------------

function extractClickTriggers(slide, slideId) {
  const sep      = slideId.includes('_') ? '_' : '-';
  const triggers = [];
  for (const [key] of Object.entries(slide)) {
    const m = key.match(/^Voiceover-CLICK-(.+)$/);
    if (!m) continue;
    const label = m[1];
    triggers.push({
      label,
      audioPath: `../assets/audio/vo/${slideId}${sep}CLICK${sep}${label}.mp3`,
    });
  }
  return triggers;
}

// ---------------------------------------------------------------------------
// Bullet list items (content-split template)
// ---------------------------------------------------------------------------

function buildBulletListHtml(bodyText) {
  if (!bodyText || !bodyText.trim()) return '            <!-- no bullets -->';
  return bodyText.split('|')
    .map(s => s.trim()).filter(Boolean)
    .map(text =>
      `            <li><span class="bullet-dot" aria-hidden="true"></span>` +
      `<span>${escHtml(text)}</span></li>`
    )
    .join('\n');
}

// Builds the JS array of VO cue times — one null per bullet, with TODO comments.
// Left column bullets come first, then right column.
function buildBulletTimesArray(leftBody, rightBody) {
  const parse = b => b ? b.split('|').map(s => s.trim()).filter(Boolean) : [];
  const left  = parse(leftBody);
  const right = parse(rightBody);
  if (!left.length && !right.length) return '[]';
  const entries = [
    ...left.map( (_, i) => `  null  /* TODO L${i + 1}: cue time in seconds after VO recording */`),
    ...right.map((_, i) => `  null  /* TODO R${i + 1}: cue time in seconds after VO recording */`),
  ];
  return '[\n' + entries.join(',\n') + '\n]';
}

// Builds the optional callout box HTML, or returns empty string.
function buildCalloutHtml(slide) {
  const text  = (slide['Callout-Text']  || '').trim();
  if (!text) return '';
  const label = (slide['Callout-Label'] || '').trim();
  const content = label
    ? `<strong>${escHtml(label)}:</strong> ${escHtml(text)}`
    : escHtml(text);
  return (
    `      <div class="callout-box anim-block" id="el-callout">\n` +
    `        <p>${content}</p>\n` +
    `      </div>`
  );
}

// ---------------------------------------------------------------------------
// Objective items
// ---------------------------------------------------------------------------

function buildObjectivesHtml(slide) {
  const items = [];
  for (let i = 1; i <= 10; i++) {
    const text = slide[`Objective-${i}`];
    if (!text) break;
    const num = String(i).padStart(2, '0');
    items.push(
      `      <li class="obj-item">\n` +
      `        <span class="obj-number">${num}</span>\n` +
      `        <span class="obj-text">${escHtml(text)}</span>\n` +
      `      </li>`
    );
  }
  if (items.length === 0) {
    // Placeholder items for authoring
    for (let i = 1; i <= 3; i++) {
      const num = String(i).padStart(2, '0');
      items.push(
        `      <li class="obj-item">\n` +
        `        <span class="obj-number">${num}</span>\n` +
        `        <span class="obj-text"><!-- Objective ${i}: replace with actual objective --></span>\n` +
        `      </li>`
      );
    }
  }
  return items.join('\n');
}

// ---------------------------------------------------------------------------
// Tab items (content-tab template)
// ---------------------------------------------------------------------------

function buildTabsHtml(slide, slideId) {
  const sep = slideId.includes('_') ? '_' : '-';
  const items = [];
  for (const [key, value] of Object.entries(slide)) {
    const m = key.match(/^Tab-Title-(.+)$/);
    if (!m) continue;
    const label = m[1];
    const body = slide[`Tab-Body-${label}`] || '';
    const audioPath = `../assets/audio/vo/${slideId}${sep}TAB${sep}${label}.mp3`;
    items.push({ label, title: value, body, audioPath });
  }
  if (!items.length) return '<!-- no tabs -->';
  const buttons = items.map((t, i) =>
    `      <button class="tab-btn${i === 0 ? ' is-active' : ''}" data-tab="${escAttr(t.label)}" data-audio="${escAttr(t.audioPath)}" role="tab" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${escHtml(t.title)}</button>`
  ).join('\n');
  const panels = items.map((t, i) =>
    `      <div class="tab-panel${i === 0 ? ' is-active' : ''}" id="panel-${escAttr(t.label)}" role="tabpanel">\n        <ul class="bullet-list">\n${buildBulletListHtml(t.body)}\n        </ul>\n      </div>`
  ).join('\n');
  return `    <div class="tabs-nav" role="tablist">\n${buttons}\n    </div>\n    <div class="tabs-content">\n${panels}\n    </div>`;
}

// ---------------------------------------------------------------------------
// Step items (content-steps template)
// ---------------------------------------------------------------------------

function buildStepsHtml(slide, slideId) {
  const sep = slideId.includes('_') ? '_' : '-';
  const items = [];
  for (let i = 1; i <= 15; i++) {
    const title = slide[`Step-Title-${i}`];
    if (!title) break;
    const body = slide[`Step-Body-${i}`] || '';
    const audioPath = `../assets/audio/vo/${slideId}${sep}STEP${sep}${i}.mp3`;
    items.push({ n: i, title, body, audioPath });
  }
  if (!items.length) return '<!-- no steps -->';
  const total = items.length;
  return items.map((s) =>
    `      <div class="step-item" data-step="${s.n}" data-audio="${escAttr(s.audioPath)}" data-total="${total}">\n` +
    `        <div class="step-number">${String(s.n).padStart(2, '0')}</div>\n` +
    `        <div class="step-content">\n` +
    `          <div class="step-title">${escHtml(s.title)}</div>\n` +
    `          <ul class="bullet-list">\n${buildBulletListHtml(s.body)}\n          </ul>\n` +
    `        </div>\n` +
    `      </div>`
  ).join('\n');
}

function buildStepNavHtml(slide) {
  let total = 0;
  for (let i = 1; i <= 15; i++) {
    if (!slide[`Step-Title-${i}`]) break;
    total++;
  }
  if (!total) return '';
  const dots = Array.from({length: total}, (_, i) =>
    `      <button class="step-nav-dot${i === 0 ? ' is-active' : ''}" data-step="${i + 1}" aria-label="Step ${i + 1}"></button>`
  ).join('\n');
  return `    <div class="step-nav" role="tablist" aria-label="Steps">\n${dots}\n    </div>`;
}

// ---------------------------------------------------------------------------
// Accordion items (content-accordion template)
// ---------------------------------------------------------------------------

function buildAccordionHtml(slide, slideId) {
  const sep = slideId.includes('_') ? '_' : '-';
  const items = [];
  for (const [key, value] of Object.entries(slide)) {
    const m = key.match(/^Accordion-Title-(.+)$/);
    if (!m) continue;
    const label = m[1];
    const body = slide[`Accordion-Body-${label}`] || '';
    const audioPath = `../assets/audio/vo/${slideId}${sep}TAB${sep}${label}.mp3`;
    items.push({ label, title: value, body, audioPath });
  }
  if (!items.length) return '<!-- no accordion items -->';
  return items.map((a, i) =>
    `      <div class="accordion-item${i === 0 ? ' is-open' : ''}" data-accordion="${escAttr(a.label)}" data-audio="${escAttr(a.audioPath)}">\n` +
    `        <button class="accordion-trigger" aria-expanded="${i === 0 ? 'true' : 'false'}" tabindex="0">\n` +
    `          <span class="accordion-label">${escHtml(a.title)}</span>\n` +
    `          <span class="accordion-chevron" aria-hidden="true">&#8250;</span>\n` +
    `        </button>\n` +
    `        <div class="accordion-body">\n` +
    `          <ul class="bullet-list">\n${buildBulletListHtml(a.body)}\n          </ul>\n` +
    `        </div>\n` +
    `      </div>`
  ).join('\n');
}

// ---------------------------------------------------------------------------
// Summary points (content-summary template)
// ---------------------------------------------------------------------------

function buildSummaryPointsHtml(slide) {
  const items = [];
  for (let i = 1; i <= 10; i++) {
    const text = slide[`Summary-Point-${i}`];
    if (!text) break;
    items.push(
      `      <li class="summary-point">\n` +
      `        <span class="summary-dot" aria-hidden="true"></span>\n` +
      `        <span>${escHtml(text)}</span>\n` +
      `      </li>`
    );
  }
  return items.join('\n') || '      <!-- no summary points -->';
}

// ---------------------------------------------------------------------------
// Card panels (hidden content for card-explore detail panel)
// ---------------------------------------------------------------------------

function buildCardPanelsHtml(triggers, slide) {
  if (!triggers.length) return '';
  return triggers.map(t => {
    const body = slide ? buildBulletListHtml(slide[`Card-Body-${t.label}`]) : '';
    return (
      `  <div class="card-panel" id="panel-${escAttr(t.label)}">\n` +
      `    <ul class="bullet-list">\n${body}\n    </ul>\n  </div>`
    );
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Card items (card-explore template)
// ---------------------------------------------------------------------------

function buildCardsHtml(triggers, slide) {
  const letters = ['01', '02', '03', '04', '05', '06'];
  return triggers.map((t, idx) => {
    const num   = letters[idx] || String(idx + 1).padStart(2, '0');
    const title = (slide && slide[`Card-Title-${t.label}`]) || camelToWords(t.label);
    return (
      `      <div class="explore-card pds-card pds-card--interactive is-shimmer" data-card="${escAttr(t.label)}" id="card-${escAttr(t.label)}" tabindex="0" role="button" aria-label="Explore ${escAttr(title)}">\n` +
      `        <div class="card-number">${num}</div>\n` +
      `        <div class="card-title">${escHtml(title)}</div>\n` +
      `        <div class="card-chip">Explore &rarr;</div>\n` +
      `      </div>`
    );
  }).join('\n');
}

function buildCardAudioMap(triggers) {
  const entries = triggers.map(t => `  '${t.label}': '${t.audioPath}'`);
  return '{\n' + entries.join(',\n') + '\n}';
}

// Generates an inline <script> block that:
//  1. Sends sandbox-configure-interactions synchronously on DOMContentLoaded so
//     the player knows which cards are required BEFORE the VO can end.
//  2. Wires up each card's click/keydown handler to send sandbox-play-interaction
//     with the correct audio src and the card's ID for interaction tracking.
//  3. Listens for player-interaction-progress to mark visited cards visually.
// This must run before the VO finishes to avoid the premature Click_Next bug.
function buildCardInitScript(triggers) {
  if (!triggers.length) return '';
  const requiredIds = JSON.stringify(triggers.map(t => t.label));
  const audioMap    = triggers.map(t => `  ${JSON.stringify(t.label)}: ${JSON.stringify(t.audioPath)}`).join(',\n');
  return `<script>
(function () {
  var AUDIO_MAP = {
${audioMap}
  };
  var requiredIds = ${requiredIds};

  // Tell the player which cards are required and to lock Next until all are visited.
  // Done synchronously so the player is configured before the VO can end.
  window.parent.postMessage({
    type: 'sandbox-configure-interactions',
    requiredIds: requiredIds,
    finalCueSrc: 'assets/audio/vo/Click_Next.mp3',
    lockNextUntilComplete: true
  }, '*');

  function playCard(label) {
    var src = AUDIO_MAP[label];
    if (!src) return;
    window.parent.postMessage({
      type: 'sandbox-play-interaction',
      src: src,
      id: label,
      pauseNarration: true,
      resumeNarration: true
    }, '*');
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.explore-card').forEach(function (card) {
      var label = card.getAttribute('data-card');
      card.addEventListener('click', function () { playCard(label); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playCard(label); }
      });
    });
  });

  // Mark visited cards visually when the player reports progress.
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'player-interaction-progress') return;
    var card = document.getElementById('card-' + e.data.id);
    if (card) card.classList.add('visited');
  });
}());
</script>`;
}

// ---------------------------------------------------------------------------
// Choice items (KC / FQ templates)
// ---------------------------------------------------------------------------

function buildChoicesHtml(slide, templateId) {
  if (templateId === 'knowledge-check') {
    return buildKCChoicesHtml(slide);
  }
  // final-quiz and others: numeric data-choice format
  const choiceClass = templateId === 'final-quiz' ? 'fq-choice' : 'kc-choice';
  const letterClass = templateId === 'final-quiz' ? 'fq-choice-letter' : 'kc-choice-letter';
  const textClass   = templateId === 'final-quiz' ? 'fq-choice-text' : 'kc-choice-text';
  const letters     = ['A', 'B', 'C', 'D'];
  const items       = [];

  for (let i = 1; i <= 4; i++) {
    const text = slide[`Choice-${i}`] || `Choice ${i}`;
    items.push(
      `      <div class="${choiceClass}" data-choice="${i}" role="button" tabindex="0">\n` +
      `        <span class="${letterClass}">${letters[i - 1]}</span>\n` +
      `        <span class="${textClass}">${escHtml(text)}</span>\n` +
      `      </div>`
    );
  }
  return items.join('\n');
}

// KC choices: .option-row format with data-correct="true" on the correct item.
// JS in the template shuffles rows and re-assigns A–D labels at runtime.
function buildKCChoicesHtml(slide) {
  const letters    = ['A', 'B', 'C', 'D'];
  const correctIdx = (parseInt(slide['Correct-Answer'], 10) || 1) - 1; // 0-based
  const items      = [];

  for (let i = 0; i < 4; i++) {
    const text      = slide[`Choice-${i + 1}`] || `Choice ${i + 1}`;
    const correct   = i === correctIdx ? ' data-correct="true"' : '';
    items.push(
      `      <div class="option-row"${correct} data-value="${letters[i]}" role="radio" aria-checked="false" tabindex="0">\n` +
      `        <div class="option-row__letter">${letters[i]}</div>\n` +
      `        <span class="option-row__text">${escHtml(text)}</span>\n` +
      `      </div>`
    );
  }
  return items.join('\n');
}

// ---------------------------------------------------------------------------
// Stat value / label split
// e.g. "94% Customer Satisfaction" → { value: "94%", label: "Customer Satisfaction" }
// e.g. "Service excellence starts here" → { value: slide title, label: text }
// ---------------------------------------------------------------------------

function splitStat(onScreenText, slideTitle) {
  if (!onScreenText) return { value: slideTitle, label: '' };
  const m = onScreenText.match(/^(\d[\d,.%×x]*)\s+(.+)$/);
  if (m) return { value: m[1], label: m[2] };
  return { value: onScreenText, label: '' };
}

// ---------------------------------------------------------------------------
// FQ question number (count FQ slides seen so far, excluding SCORE slide)
// ---------------------------------------------------------------------------

function fqQuestionNumber(allSlides, currentSlideId) {
  let count = 0;
  for (const s of allSlides) {
    const id = s['Slide-ID'] || '';
    if (!/^FQ[_-]/i.test(id)) continue;
    if (/[_-]SCORE$/i.test(id)) continue;
    count++;
    if (id === currentSlideId) break;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

function renderTemplate(html, tokens) {
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match;
  });
}

// ---------------------------------------------------------------------------
// Build token map for a slide
// ---------------------------------------------------------------------------

function buildTokens(slide, allSlides, courseTitle, templateHtml) {
  const slideId     = slide['Slide-ID'];
  const templateId  = slide['Template-ID'];
  const slideTitle  = slide['Slide-Title'] || slideId;
  const onScreen    = slide['On-Screen-Text'] || slideTitle;
  const imageFile   = slide['Image-File'];
  const imagePath   = imageFile
    ? `../assets/images/${imageFile}`
    : '../assets/images/placeholder.webp';

  const { value: statValue, label: statLabel } = splitStat(onScreen, slideTitle);
  const clicks = extractClickTriggers(slide, slideId);

  // content-quote tokens
  const quoteText            = slide['Quote']              || onScreen;
  const quoteAttributionName = slide['Quote-Attribution']  || '<!-- Attribution name -->';
  const quoteAttributionTitle= slide['Quote-Title']        || '<!-- Attribution title / role -->';

  // hero-title subtitle: explicit field or second | segment of On-Screen-Text
  const onScreenParts = (slide['On-Screen-Text'] || '').split('|');
  const heroSubtitle  = slide['Hero-Subtitle'] || (onScreenParts[1] ? onScreenParts[1].trim() : '');

  // Pull-Quote: optional field — if present, replaces body copy in content-split with a pc-pull-quote
  const pullQuoteText = slide['Pull-Quote'];
  let bodyContentHtml;
  if (pullQuoteText) {
    bodyContentHtml = `<pc-pull-quote class="anim-fade-right" style="--anim-delay: 0.35s;" text="${escAttr(pullQuoteText)}"></pc-pull-quote>`;
  } else {
    bodyContentHtml = `<p class="pds-body anim-fade-right" style="--anim-delay: 0.35s;">${escHtml(onScreen)}</p>`;
  }

  const eyebrow = slide['Eyebrow'] || courseTitle;

  const tokens = {
    SLIDE_ID:       slideId,
    SLIDE_TITLE:    escHtml(slideTitle),
    EYEBROW:        escHtml(eyebrow),
    ON_SCREEN_TEXT: escHtml(onScreen),
    HERO_SUBTITLE:  escHtml(heroSubtitle),
    MODULE_LABEL:   escHtml(courseTitle),
    IMAGE_PATH:     imagePath,
    // Stat template
    STAT_VALUE:     escHtml(statValue),
    STAT_LABEL:     escHtml(statLabel),
    // Quote template
    QUOTE_TEXT:               escHtml(quoteText),
    QUOTE_ATTRIBUTION_NAME:   escHtml(quoteAttributionName),
    QUOTE_ATTRIBUTION_TITLE:  escHtml(quoteAttributionTitle),
    // Objectives template
    OBJECTIVES_HTML: buildObjectivesHtml(slide),
    // content-split template
    COL_LEFT_HEADER:      escHtml(slide['Col-Left-Header']  || ''),
    COL_RIGHT_HEADER:     escHtml(slide['Col-Right-Header'] || ''),
    COL_LEFT_BULLETS:     buildBulletListHtml(slide['Col-Left-Body']),
    COL_RIGHT_BULLETS:    buildBulletListHtml(slide['Col-Right-Body']),
    CALLOUT_HTML:         buildCalloutHtml(slide),
    BULLET_TIMES_ARRAY:   buildBulletTimesArray(slide['Col-Left-Body'], slide['Col-Right-Body']),
    CALLOUT_CUE_TIME:     'null  /* TODO: callout emphasis cue time in seconds */',
    // Card-explore template
    CARDS_HTML:        buildCardsHtml(clicks, slide),
    CARD_AUDIO_MAP:    buildCardAudioMap(clicks),
    CARD_INIT_SCRIPT:  buildCardInitScript(clicks),
    TOTAL_CARDS:       String(clicks.length || 3),
    // content-split body — pull quote or plain body copy
    BODY_CONTENT_HTML: bodyContentHtml,
    // KC / FQ templates
    CHOICES_HTML:    buildChoicesHtml(slide, templateId),
    CORRECT_ANSWER:  String(parseInt(slide['Correct-Answer'], 10) || 1),
    REVIEW_SLIDE:    slide['Review-Slide'] || '',
    QUESTION_NUMBER: String(fqQuestionNumber(allSlides, slideId)),
    // Option tokens for KC/FQ (support both Option-A/B/C/D and Choice-1/2/3/4 formats)
    OPTION_A_TEXT:    escHtml(slide['Option-A'] || slide['Choice-1'] || 'Option A'),
    OPTION_B_TEXT:    escHtml(slide['Option-B'] || slide['Choice-2'] || 'Option B'),
    OPTION_C_TEXT:    escHtml(slide['Option-C'] || slide['Choice-3'] || 'Option C'),
    OPTION_D_TEXT:    escHtml(slide['Option-D'] || slide['Choice-4'] || 'Option D'),
    OPTION_A_CORRECT: (function(){ var co=(slide['Correct-Option']||'').trim().toUpperCase(); var ca=String(parseInt(slide['Correct-Answer'],10)||0); return (co==='A'||ca==='1')?'true':'false'; }()),
    OPTION_B_CORRECT: (function(){ var co=(slide['Correct-Option']||'').trim().toUpperCase(); var ca=String(parseInt(slide['Correct-Answer'],10)||0); return (co==='B'||ca==='2')?'true':'false'; }()),
    OPTION_C_CORRECT: (function(){ var co=(slide['Correct-Option']||'').trim().toUpperCase(); var ca=String(parseInt(slide['Correct-Answer'],10)||0); return (co==='C'||ca==='3')?'true':'false'; }()),
    OPTION_D_CORRECT: (function(){ var co=(slide['Correct-Option']||'').trim().toUpperCase(); var ca=String(parseInt(slide['Correct-Answer'],10)||0); return (co==='D'||ca==='4')?'true':'false'; }()),
    REVIEW_SLIDE_ID:  slide['Review-Slide'] || '',
    FQ_EYEBROW:       escHtml(slide['FQ-Eyebrow'] || ''),
    FQ_QUESTION_LABEL: 'Final Quiz',
    FQ_QUESTION_NUMBER_LABEL: 'Question ' + String(fqQuestionNumber(allSlides, slideId)),
    QUESTION_TEXT:    escHtml(slide['Question-Text'] || slide['Question'] || ''),
    FEEDBACK_CORRECT: escHtml(slide['Feedback-Correct'] || ''),
    FEEDBACK_INCORRECT: escHtml(slide['Feedback-Incorrect'] || ''),
    PASS_SCORE:       String(parseInt(slide['Pass-Score'], 10) || 80),
    PASS_MESSAGE:     escHtml(slide['Pass-Message'] || ''),
    FAIL_MESSAGE:     escHtml(slide['Fail-Message'] || ''),
    // New interaction template tokens
    TABS_HTML:        buildTabsHtml(slide, slideId),
    STEPS_HTML:       buildStepsHtml(slide, slideId),
    STEP_NAV_HTML:    buildStepNavHtml(slide),
    ACCORDION_HTML:   buildAccordionHtml(slide, slideId),
    SUMMARY_POINTS_HTML: buildSummaryPointsHtml(slide),
    SUMMARY_INTRO:    escHtml(slide['Summary-Intro'] || ''),
    SUMMARY_CLOSING:  escHtml(slide['Summary-Closing'] || ''),
    SUMMARY_NEXT:     escHtml(slide['Summary-Next'] || ''),
    CARD_PANELS_HTML: buildCardPanelsHtml(clicks, slide),
    TOTAL_STEPS:      (function(){ var n=0; for(var i=1;i<=15;i++){ if(!slide['Step-Title-'+i]) break; n++; } return String(n); }()),
    // content-diagram tokens
    DIAGRAM_STEPS_HTML:      buildDiagramStepsHtml(slide),
    INTERACTION_PROMPT:      escHtml(slide['Interaction-Prompt']     || 'Click to explore'),
    INTERACTION_REVEALS_HTML: buildInteractionRevealsHtml(slide),
    INTERACTION_CONCLUSION:  escHtml(slide['Interaction-Conclusion'] || ''),
  };

  return tokens;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function camelToWords(str) {
  // "CardOne" → "Card One" | "BatteryOverview" → "Battery Overview"
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

// ---------------------------------------------------------------------------
// content-diagram builders
// ---------------------------------------------------------------------------

function buildDiagramStepsHtml(slide) {
  const raw = slide['Diagram-Steps'] || '';
  const steps = raw.split('|').map(s => s.trim()).filter(Boolean);
  if (!steps.length) return '';

  let html = '';
  steps.forEach(function (label, i) {
    const isLast      = i === steps.length - 1;
    // Last step often describes the "problem" — give it a muted node
    const nodeClass   = isLast ? 'step-node is-problem' : 'step-node';
    const connH       = isLast ? 0 : 44; // px height of connector line

    html += `      <div class="diagram-step" id="dstep-${i}" data-animate="fade-right" data-delay="${(0.3 + i * 0.12).toFixed(2)}">\n`;
    html += `        <div class="${nodeClass}">${i + 1}</div>\n`;
    html += `        <div class="step-label">${escHtml(label)}</div>\n`;
    html += `      </div>\n`;

    if (!isLast && connH > 0) {
      html += `      <div class="step-connector" style="top:${200 + i * (48 + connH) + 48}px; height:${connH}px;"></div>\n`;
    }
  });

  return html;
}

function buildInteractionRevealsHtml(slide) {
  const raw = slide['Interaction-Reveal'] || '';
  const items = raw.split('|').map(s => s.trim()).filter(Boolean);
  if (!items.length) return '';

  return items.map(function (text, i) {
    return `        <div class="reveal-item" id="reveal-${i}" role="listitem">\n` +
           `          <div class="reveal-dot" aria-hidden="true"></div>\n` +
           `          <span class="reveal-text">${escHtml(text)}</span>\n` +
           `        </div>`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Validate storyboard
  const sbPath = path.resolve(args.storyboard);
  if (!fs.existsSync(sbPath)) {
    console.error(`Error: storyboard not found — ${sbPath}`);
    console.error('Run: npm run import-storyboard -- --docx <file.docx>');
    process.exit(1);
  }

  console.log(`\nGenerating slides from: ${path.basename(sbPath)}`);
  console.log('─'.repeat(60));

  const { courseTitle, slides } = parseCourseMd(sbPath);
  console.log(`Course: ${courseTitle}  |  Slides: ${slides.length}\n`);

  // Ensure output directories exist
  fs.mkdirSync(path.resolve(args.slidesDir), { recursive: true });
  fs.mkdirSync(path.resolve(args.dataDir),   { recursive: true });

  let written = 0;
  let skipped = 0;
  let errors  = 0;

  // Collect KC review map and FQ question IDs while iterating
  const kcReviewMap = {};
  const fqQuestionIds = [];

  for (const slide of slides) {
    const slideId    = slide['Slide-ID'];
    const templateId = slide['Template-ID'];
    const outPath    = path.resolve(args.slidesDir, slideId + '.html');

    // Track KC review map
    if (/^KC[_-]/i.test(slideId) && slide['Review-Slide']) {
      kcReviewMap[slideId] = [slide['Review-Slide']];
    }

    // Track FQ question slides (not SCORE)
    if (/^FQ[_-]/i.test(slideId) && !/[_-]SCORE$/i.test(slideId)) {
      fqQuestionIds.push(slideId);
    }

    // Skip if exists and not forced
    if (!args.force && fs.existsSync(outPath)) {
      console.log(`  SKIP   ${slideId}.html  (exists — use --force to overwrite)`);
      skipped++;
      continue;
    }

    // Load template
    const templatePath = path.resolve(args.templatesDir, templateId + '.html');
    if (!fs.existsSync(templatePath)) {
      console.warn(`  WARN   ${slideId} — template not found: ${templateId}.html — using content-split`);
      const fallbackPath = path.resolve(args.templatesDir, 'content-split.html');
      if (!fs.existsSync(fallbackPath)) {
        console.error(`  ERROR  ${slideId} — fallback template also missing`);
        errors++;
        continue;
      }
    }

    let templateHtml;
    try {
      const tplFile = fs.existsSync(templatePath)
        ? templatePath
        : path.resolve(args.templatesDir, 'content-split.html');
      templateHtml = fs.readFileSync(tplFile, 'utf8');
    } catch (err) {
      console.error(`  ERROR  ${slideId} — could not read template: ${err.message}`);
      errors++;
      continue;
    }

    // Build tokens and render
    const tokens   = buildTokens(slide, slides, courseTitle, templateHtml);
    const rendered = renderTemplate(templateHtml, tokens);

    // Write slide file
    try {
      fs.writeFileSync(outPath, rendered, 'utf8');
      const tplLabel = templateId.padEnd(18);
      console.log(`  WRITE  ${tplLabel}  →  ${slideId}.html`);
      written++;
    } catch (err) {
      console.error(`  ERROR  ${slideId} — write failed: ${err.message}`);
      errors++;
    }
  }

  // ── Update course.data.json ───────────────────────────────────────────────

  const dataPath = path.resolve(args.dataDir, 'course.data.json');
  let existing   = { meta: {}, slides: [] };
  if (fs.existsSync(dataPath)) {
    try { existing = JSON.parse(fs.readFileSync(dataPath, 'utf8')); }
    catch (_) {}
  }

  // Preserve meta; update module title if meta.title is placeholder
  if (!existing.meta) existing.meta = {};
  if (!existing.meta.title || existing.meta.title === 'Module Title Here') {
    existing.meta.title = courseTitle;
  }

  // Build slides array
  existing.slides = slides.map(slide => {
    const slideId = slide['Slide-ID'];
    const entry = {
      id:       slideId,
      title:    slide['Slide-Title'] || slideId,
      audio_vo: resolveAudioPaths(slideId).playerPath,
    };
    // Next-Cue overrides the default Click_Next transition sound.
    // Storyboard authors set this on the last content slide before the quiz:
    //   Next-Cue: Click_Start_Quiz
    // The value is a bare filename (no path) resolved from assets/audio/vo/.
    if (slide['Next-Cue']) {
      const cueFile = slide['Next-Cue'].trim().replace(/\.mp3$/i, '') + '.mp3';
      entry.audio_cue_next = 'assets/audio/vo/' + cueFile;
    }
    return entry;
  });

  // Build quiz section
  existing.quiz = {
    final_quiz: {
      passing_score: existing.quiz?.final_quiz?.passing_score ?? 80,
      questions: fqQuestionIds,
    }
  };

  fs.writeFileSync(dataPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  console.log(`\n✓ course.data.json  (${slides.length} slides, ${fqQuestionIds.length} FQ questions)`);

  // ── Write kc-review.json ──────────────────────────────────────────────────

  const kcPath = path.resolve(args.dataDir, 'kc-review.json');
  fs.writeFileSync(kcPath, JSON.stringify(kcReviewMap, null, 2) + '\n', 'utf8');
  const kcCount = Object.keys(kcReviewMap).length;
  console.log(`✓ kc-review.json    (${kcCount} KC slide${kcCount !== 1 ? 's' : ''})`);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(60));
  console.log(`Written: ${written}  |  Skipped: ${skipped}  |  Errors: ${errors}`);

  if (written > 0) {
    console.log('\nNext steps:');
    console.log('  1. Review generated slides in course/slides/');
    console.log('  2. Fill in placeholder content (card bodies, body copy, images)');
    console.log('  3. npm run start-player  →  http://localhost:8080');
  }

  if (errors > 0) process.exit(1);
}

main().catch(err => { console.error(err.message); process.exit(1); });
