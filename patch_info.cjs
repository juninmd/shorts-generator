const fs = require('fs');
let content = fs.readFileSync('src/core/youtube-info.ts', 'utf-8');
content = content.replace("raw = JSON.parse(trimmed.replace(/[:,]\\s*NA\\b/g, ':null'));", "raw = JSON.parse(trimmed.replace(/([:,]\\s*)NA\\b/g, '$1null'));");
fs.writeFileSync('src/core/youtube-info.ts', content);
