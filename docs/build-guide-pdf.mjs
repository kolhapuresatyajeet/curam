#!/usr/bin/env node
/**
 * Build a print-ready HTML for the GP trial guide.
 *
 *   node docs/build-guide-pdf.mjs
 *
 * Reads docs/gp-trial-guide.md and writes docs/curam-trial-guide-print.html
 * (A4 print CSS, Cúram styling, auto table of contents). Then print it to PDF:
 *
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless=new --disable-gpu --print-to-pdf=docs/curam-trial-guide_1.pdf \
 *     "file://…/docs/curam-trial-guide-print.html"
 *
 * (Chrome's default print header/footer supplies the running title and page
 * numbers, matching the committed PDF's style.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const here = dirname(fileURLToPath(import.meta.url));
const markdown = readFileSync(join(here, 'gp-trial-guide.md'), 'utf8');

// The cover reproduces the title + intro, so drop them from the body
// (everything before the first "## " section heading).
const firstSection = markdown.indexOf('## ');
const bodyMarkdown = markdown.slice(firstSection);
const body = marked.parse(bodyMarkdown, { gfm: true });

// Table of contents from the ## headings (skip the doc title).
const toc = [...markdown.matchAll(/^## (.+)$/gm)]
  .map((match) => match[1].trim())
  .filter((title) => !/^—/.test(title))
  .map((title) => `<li>${title}</li>`)
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cúram — GP End-to-End Trial Guide</title>
<style>
  :root { --teal: #0f766e; --teal-dark: #115e59; --ink: #1e293b; --muted: #475569; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.5; color: var(--ink); margin: 0;
  }
  h1 {
    font-size: 26pt; line-height: 1.2; color: var(--teal-dark);
    margin: 8mm 0 4mm; letter-spacing: -0.5px;
  }
  h2 {
    font-size: 15pt; color: var(--teal-dark); margin: 9mm 0 3mm;
    padding-bottom: 2mm; border-bottom: 2px solid #ccEBe4;
    break-after: avoid; break-inside: avoid;
  }
  h3 { font-size: 11.5pt; color: var(--teal); margin: 6mm 0 2mm; break-after: avoid; }
  p { margin: 2mm 0; }
  ul, ol { margin: 2mm 0; padding-left: 6mm; }
  li { margin: 1.2mm 0; }
  strong { color: var(--teal-dark); }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 6mm 0; }
  code {
    font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 8.8pt;
    background: #f1f5f4; border: 1px solid #e2e8f0; border-radius: 3px; padding: 0.4mm 1.2mm;
  }
  pre { background: #f8faf9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 3mm; overflow-x: hidden; }
  pre code { border: none; background: none; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0; font-size: 9.5pt; break-inside: avoid; }
  th { background: #e8f2ed; color: var(--teal-dark); text-align: left; }
  th, td { border: 1px solid #d7e3de; padding: 1.8mm 2.5mm; vertical-align: top; }
  .cover { break-after: page; padding-top: 40mm; }
  .cover .brand { font-size: 40pt; font-weight: 800; color: var(--teal-dark); letter-spacing: -1px; }
  .cover .brand .fada { color: var(--teal); }
  .cover .subtitle { font-size: 20pt; font-weight: 600; color: var(--ink); margin-top: 2mm; }
  .cover .blurb { max-width: 130mm; color: var(--muted); font-size: 11pt; margin-top: 6mm; }
  .toc { margin-top: 14mm; max-width: 140mm; }
  .toc h2 { border: none; }
  .toc ol { list-style: none; padding: 0; }
  .toc li { padding: 1.6mm 0; border-bottom: 1px solid #eef2f1; font-size: 10.5pt; }
</style>
</head>
<body>
  <div class="cover">
    <div class="brand">C<span class="fada">ú</span>ram</div>
    <div class="subtitle">GP End-to-End Trial Guide</div>
    <p class="blurb">A step-by-step script for trialling Cúram with a GP: every module, all three apps
    (web, HealthLink bridge, patient app), ending with the GP able to start using the platform for real.
    Allow 60–90 minutes.</p>
    <div class="toc">
      <h2>Contents</h2>
      <ol>${toc}</ol>
    </div>
  </div>
  ${body}
</body>
</html>`;

writeFileSync(join(here, 'curam-trial-guide-print.html'), html);
console.log('Wrote docs/curam-trial-guide-print.html — print to PDF via Chrome.');
