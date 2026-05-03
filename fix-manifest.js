import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = join(process.cwd(), '.output/chrome-mv3/manifest.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

if (manifest.background && manifest.background.type) {
  delete manifest.background.type;
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Fixed manifest.json - removed invalid background.type field');
