#!/usr/bin/env node
/**
 * generate-vo.js
 * Sends each VO clip to the WellSaid API and saves the audio to course/assets/audio/vo/.
 * After each clip is saved, a placeholder VTT is written to course/assets/captions/.
 *
 * Usage:
 *   node scripts/generate-vo.js [--manifest storyboard/vo_manifest.csv]
 *                               [--key <wellsaid-api-key>]
 *                               [--speaker <avatar-id>]
 *                               [--clip SLD-CC01-004-CLICK-Appearance]
 *                               [--skip-existing]
 *
 * Env vars (used if flags not provided):
 *   WELLSAID_API_KEY
 *   WELLSAID_SPEAKER_ID
 *
 * WellSaid speaker IDs: https://app.wellsaidlabs.com/api-access
 * Each generated file is saved as: course/assets/audio/vo/{FileName}
 * Matching VTT is saved as:        course/assets/captions/{FileName minus .mp3}.vtt
 *
 * Skips clips that already have an audio file (use --skip-existing or omit to skip by default).
 * Use --force to overwrite existing files.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

const WELLSAID_HOST     = 'api.wellsaidlabs.com';
const WELLSAID_ENDPOINT = '/v1/tts/stream';

// ---------------------------------------------------------------------------
// HTTP helper — POST JSON, return buffer
// ---------------------------------------------------------------------------

function postToWellSaid(apiKey, speakerId, text) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify({ text, speaker_id: speakerId });
    const options = {
      hostname: WELLSAID_HOST,
      path:     WELLSAID_ENDPOINT,
      method:   'POST',
      headers:  {
        'X-Api-Key':      apiKey,
        'Content-Type':   'application/json',
        'Accept':         'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const msg = Buffer.concat(chunks).toString('utf8').slice(0, 200);
          reject(new Error(`WellSaid API ${res.statusCode}: ${msg}`));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// VTT placeholder helper
// ---------------------------------------------------------------------------

function writePlaceholderVtt(text, outputPath, durationSec = 5) {
  const safeText = (text || '').trim();
  const ts       = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.000`;
  };
  const content = `WEBVTT\n\n${ts(0)} --> ${ts(durationSec)}\n${safeText}\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// CSV reader
// ---------------------------------------------------------------------------

function parseCsv(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, ''));
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = [];
    let inQuote = false, current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { values.push(current); current = ''; }
      else { current += ch; }
    }
    values.push(current);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

// ---------------------------------------------------------------------------
// Core — exported for use by import-storyboard.js
// ---------------------------------------------------------------------------

/**
 * Generate VO audio files via WellSaid API.
 * @param {Array<{FileName:string, VoiceoverText:string}>} segments
 * @param {object} opts
 * @param {string}  opts.apiKey       WellSaid API key
 * @param {string}  opts.speakerId    WellSaid avatar/speaker ID
 * @param {string}  opts.audioDir     Output directory for .mp3 files
 * @param {string}  opts.captionsDir  Output directory for .vtt files
 * @param {boolean} [opts.force]      Overwrite existing files
 * @param {number}  [opts.delayMs]    Delay between API calls in ms (default: 500)
 */
async function generateVo(segments, { apiKey, speakerId, audioDir, captionsDir, force = false, delayMs = 500 }) {
  let created = 0, skipped = 0, failed = 0;

  for (const seg of segments) {
    const audioFile   = path.join(audioDir,   seg.FileName);
    const vttName     = seg.FileName.replace(/\.[^.]+$/, '.vtt');
    const captionFile = path.join(captionsDir, vttName);

    if (!force && fs.existsSync(audioFile)) {
      console.log(`  SKIP     ${seg.FileName} — already exists`);
      skipped++;
      continue;
    }

    const text = (seg.VoiceoverText || '').trim();
    if (!text) {
      console.log(`  SKIP     ${seg.FileName} — no text`);
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`  GENERATE ${seg.FileName} … `);
      const audioBuffer = await postToWellSaid(apiKey, speakerId, text);

      fs.mkdirSync(path.dirname(audioFile),   { recursive: true });
      fs.mkdirSync(path.dirname(captionFile), { recursive: true });

      fs.writeFileSync(audioFile, audioBuffer);
      writePlaceholderVtt(text, captionFile);

      console.log(`saved (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
      created++;

      // Polite delay between API calls
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      failed++;
    }
  }

  return { created, skipped, failed };
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    manifest:    path.join('storyboard', 'vo_manifest.csv'),
    audioDir:    path.join('course', 'assets', 'audio', 'vo'),
    captionsDir: path.join('course', 'assets', 'captions'),
    key:         process.env.WELLSAID_API_KEY    || null,
    speaker:     process.env.WELLSAID_SPEAKER_ID || null,
    clip:        null,
    force:       false,
    delay:       500,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest')    args.manifest    = argv[++i];
    if (argv[i] === '--audio-dir')   args.audioDir    = argv[++i];
    if (argv[i] === '--captions-dir') args.captionsDir = argv[++i];
    if (argv[i] === '--key')         args.key         = argv[++i];
    if (argv[i] === '--speaker')     args.speaker     = argv[++i];
    if (argv[i] === '--clip')        args.clip        = argv[++i];
    if (argv[i] === '--force')       args.force       = true;
    if (argv[i] === '--delay')       args.delay       = parseInt(argv[++i], 10) || 500;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.key) {
    console.error('Error: WellSaid API key required. Pass --key or set WELLSAID_API_KEY.');
    process.exit(1);
  }
  if (!args.speaker) {
    console.error('Error: WellSaid speaker ID required. Pass --speaker or set WELLSAID_SPEAKER_ID.');
    process.exit(1);
  }
  if (!fs.existsSync(args.manifest)) {
    console.error(`Error: manifest not found at ${args.manifest}`);
    console.error('Run: npm run import-storyboard -- --docx <file.docx>  to generate it first.');
    process.exit(1);
  }

  let segments = parseCsv(fs.readFileSync(args.manifest, 'utf8'));
  if (args.clip) {
    segments = segments.filter((s) => s.FileName.replace(/\.[^.]+$/, '') === args.clip);
    if (segments.length === 0) {
      console.error(`No clip found matching: ${args.clip}`);
      process.exit(1);
    }
  }

  console.log(`\nGenerating ${segments.length} VO clip(s) via WellSaid…`);
  console.log(`Speaker: ${args.speaker}  |  Audio → ${args.audioDir}  |  VTT → ${args.captionsDir}`);
  console.log('─'.repeat(60));

  const { created, skipped, failed } = await generateVo(segments, {
    apiKey:      args.key,
    speakerId:   args.speaker,
    audioDir:    args.audioDir,
    captionsDir: args.captionsDir,
    force:       args.force,
    delayMs:     args.delay,
  });

  console.log('─'.repeat(60));
  console.log(`Done. ${created} created, ${skipped} skipped, ${failed} failed.`);
  if (created > 0) {
    console.log('\nNext step: run generate-vtt with --whisper for accurate captions from the audio:');
    console.log('  npm run generate-vtt -- --whisper --key <openai-key>');
  }
  if (failed > 0) process.exit(1);
}

module.exports = { generateVo };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
