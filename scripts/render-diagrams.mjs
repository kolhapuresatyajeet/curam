#!/usr/bin/env node
// Extracts every ```mermaid block from docs/architecture.md, renders it to
// docs/diagrams/<slug>.svg with mermaid-cli, and rewrites the doc to embed
// the SVG image (with the mermaid source kept in a collapsed details block).
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

const docPath = 'docs/architecture.md';
const doc = readFileSync(docPath, 'utf8');

const blocks = [];
const re = /```mermaid\n([\s\S]*?)```/g;
let m;
while ((m = re.exec(doc)) !== null) blocks.push(m[1]);

console.log(`found ${blocks.length} mermaid blocks`);
mkdirSync('docs/diagrams', { recursive: true });

let i = 0;
let out = doc;
for (const code of blocks) {
  i++;
  const hash = createHash('md5').update(code).digest('hex').slice(0, 8);
  const slug = /sequenceDiagram/.test(code)
    ? `flow-${i}-${(code.match(/^.*?participant (\w+)/m)?.[1] ?? 'seq').toLowerCase()}`
    : `flow-${i}-components`;
  const svgPath = `docs/diagrams/${slug}-${hash}.svg`;
  const tmp = `/tmp/curam-diagram-${hash}.mmd`;
  writeFileSync(tmp, code);
  execSync(`npx -y @mermaid-js/mermaid-cli -i ${tmp} -o ${svgPath} -b transparent --scale 2`, {
    stdio: 'inherit',
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: undefined },
  });
  const rel = svgPath.replace('docs/', '');
  const embed = `<img src="${rel}" alt="diagram ${i}" width="100%" />\n\n<details><summary>Mermaid source</summary>\n\n\`\`\`mermaid\n${code}\`\`\`\n</details>`;
  out = out.replace(`\`\`\`mermaid\n${code}\`\`\``, embed);
  console.log(`rendered ${svgPath}`);
}

writeFileSync(docPath, out);
console.log('doc updated');
