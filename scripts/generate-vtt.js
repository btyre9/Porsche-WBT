#!/usr/bin/env node
/**
 * generate-vtt.js
 * Generates WebVTT caption files — one per VO audio clip.
 *
 * Standalone:  node scripts/generate-vtt.js [--whisper] [--key sk-...] [--clip SLD-CC01-001-INTRO]
 * As module:   const { generateVtts } = require('./generate-vtt')
 *              await generateVtts(segments, { outputDir, audioDir, durationSec })
 *
 * Modes:
 *   Placeholder (default) — one cue spanning the full duration, text from VoiceoverText
 *   Whisper (--whisper)   — real word-level transcription via OpenAI Whisper API
 *
 * Segment format: { fileName: 'SLD-CC01-004-CLICK-Appearance.mp3', text: 'Your appearance...' }
 * VTT output:     SLD-CC01-004-CLICK-Appearance.vtt  (mirrors the audio filename)
 *
 * Flags:
 *   --whisper         Use OpenAI Whisper API
 *   --key <sk-...>    OpenAI API key (or OPENAI_API_KEY env var)
 *   --clip <name>     Process one clip only (filename without extension)
 *   --audio-dir       VO audio directory  (default: course/assets/audio/vo)
 *   --output-dir      VTT output directory (default: course/assets/captions)
 *   --manifest        vo_manifest.csv path (default: storyboard/vo_manifest.csv)
 *   --duration <n>    Placeholder duration in seconds (default: 5)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// VTT helpers
// ---------------------------------------------------------------------------

function toTimestamp(seconds) {
  const totalMs = Math.round(seconds * 1000);
  const h  = Math.floor(totalMs / 3_600_000);
  const m  = Math.floor((totalMs % 3_600_000) / 60_000);
  const s  = Math.floor((totalMs % 60_000) / 1_000);
  const ms = totalMs % 1_000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}

function writePlaceholderVtt(label, text, outputPath, durationSec) {
  const safeText = (text || label).trim();
  const content  = `WEBVTT\n\n${toTimestamp(0)} --> ${toTimestamp(durationSec)}\n${safeText}\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

function writeSegmentedVtt(segments) {
  const lines = ['WEBVTT', ''];
  for (const seg of segments) {
    lines.push(`${toTimestamp(seg.start)} --> ${toTimestamp(seg.end)}`);
    lines.push(seg.text.trim());
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// OpenAI Whisper transcription
// ---------------------------------------------------------------------------

async function transcribeWithWhisper(audioPath, apiKey) {
  let OpenAI;
  try { OpenAI = require('openai'); } catch {
    throw new Error('openai package not found. Install: npm install openai --save-dev');
  }
  const client   = new OpenAI({ apiKey });
  const response = await client.audio.transcriptions.create({
    model:                   'whisper-1',
    file:                    fs.createReadStream(audioPath),
    response_format:         'verbose_json',
    timestamp_granularities: ['segment'],
    language:                'en',
  });
  return (response.segments || []).map((seg) => ({ start: seg.start, end: seg.end, text: seg.text }));
}

// ---------------------------------------------------------------------------
// Core logic (exported for use by import-storyboard.js)
// ---------------------------------------------------------------------------

/**
 * Generate VTT files from VO segments (placeholder mode).
 * @param {Array<{fileName:string, text:string}>} segments
 *   fileName — the audio filename e.g. 'SLD-CC01-004-CLICK-Appearance.mp3'
 *   text     — voiceover text for the placeholder cue
 * @param {object} opts
 * @param {string} opts.outputDir    Directory for .vtt files
 * @param {number} [opts.durationSec=5]  Placeholder duration in seconds
 */
async function generateVtts(segments, { outputDir, durationSec = 5 }) {
  let written = 0, skipped = 0;

  for (const seg of segments) {
    const vttName    = seg.fileName.replace(/\.[^.]+$/, '.vtt');
    const outputFile = path.join(outputDir, vttName);
    const text       = (seg.text || '').trim();

    if (!text) { skipped++; continue; }

    writePlaceholderVtt(seg.fileName, text, outputFile, durationSec);
    written++;
  }

  return { written, skipped };
}

// ---------------------------------------------------------------------------
// CSV reader (for standalone mode)
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
// Standalone entry point
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    whisper:   false,
    key:       process.env.OPENAI_API_KEY || null,
    clip:      null,
    audioDir:  path.join('course', 'assets', 'audio', 'vo'),
    outputDir: path.join('course', 'assets', 'captions'),
    manifest:  path.join('storyboard', 'vo_manifest.csv'),
    duration:  5.0,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--whisper')    { args.whisper   = true; }
    if (argv[i] === '--key')        { args.key       = argv[++i]; }
    if (argv[i] === '--clip')       { args.clip      = argv[++i]; }
    if (argv[i] === '--audio-dir')  { args.audioDir  = argv[++i]; }
    if (argv[i] === '--output-dir') { args.outputDir = argv[++i]; }
    if (argv[i] === '--manifest')   { args.manifest  = argv[++i]; }
    if (argv[i] === '--duration')   { args.duration  = parseFloat(argv[++i]) || 5.0; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.manifest)) {
    console.error(`Error: manifest not found at ${args.manifest}`);
    console.error('Run: npm run import-storyboard -- --docx <file.docx>  to generate it first.');
    process.exit(1);
  }
  if (args.whisper && !args.key) {
    console.error('Error: --whisper requires an OpenAI API key. Pass --key or set OPENAI_API_KEY.');
    process.exit(1);
  }

  const rows    = parseCsv(fs.readFileSync(args.manifest, 'utf8'));
  let segments  = rows.map((r) => ({ fileName: r.FileName, text: r.VoiceoverText || '' }));
  if (args.clip) segments = segments.filter((s) => s.fileName.replace(/\.[^.]+$/, '') === args.clip);

  let generated = 0, skipped = 0;

  for (const seg of segments) {
    const vttName    = seg.fileName.replace(/\.[^.]+$/, '.vtt');
    const outputFile = path.join(args.outputDir, vttName);
    const audioFile  = path.join(args.audioDir, seg.fileName);

    if (args.whisper) {
      if (!fs.existsSync(audioFile)) {
        console.log(`  SKIP  ${seg.fileName} — no audio file`);
        skipped++; continue;
      }
      try {
        process.stdout.write(`  TRANSCRIBE  ${seg.fileName} … `);
        const segs = await transcribeWithWhisper(audioFile, args.key);
        if (segs.length === 0) {
          writePlaceholderVtt(seg.fileName, seg.text, outputFile, args.duration);
          console.log('no speech, wrote placeholder');
        } else {
          fs.mkdirSync(path.dirname(outputFile), { recursive: true });
          fs.writeFileSync(outputFile, writeSegmentedVtt(segs), 'utf8');
          console.log(`${segs.length} segment(s)`);
        }
        generated++;
      } catch (err) {
        console.log(`FAILED (${err.message}) — wrote placeholder`);
        writePlaceholderVtt(seg.fileName, seg.text, outputFile, args.duration);
        generated++;
      }
    } else {
      if (!seg.text) { console.log(`  SKIP  ${seg.fileName} — no text`); skipped++; continue; }
      writePlaceholderVtt(seg.fileName, seg.text, outputFile, args.duration);
      console.log(`  WRITE  ${vttName}`);
      generated++;
    }
  }

  console.log(`\nDone. ${generated} VTT(s) written, ${skipped} skipped → ${args.outputDir}`);
  if (!args.whisper) console.log('Tip: add --whisper for word-accurate captions from audio.');
}

module.exports = { generateVtts };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
