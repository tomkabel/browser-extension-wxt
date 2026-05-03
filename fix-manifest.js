// Fix Chrome MV3 manifest - remove invalid 'type' field from background
import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const manifestPath = join(process.cwd(), '.output/chrome-mv3/manifest.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Remove invalid 'type' field from background
if (manifest.background && manifest.background.type) {
  delete manifest.background.type;
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Fixed manifest.json - removed invalid background.type field');

// Create popup.html if it doesn't exist but is referenced in manifest
if (manifest.action?.default_popup) {
  const popupHtmlPath = join(process.cwd(), '.output/chrome-mv3', manifest.action.default_popup);
  const popupHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Domain Inspector</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="popup.js" type="module"></script>
  </body>
</html>
`;
  writeFileSync(popupHtmlPath, popupHtml);
  console.log('Created popup.html');
}
