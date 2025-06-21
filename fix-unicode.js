// fix-unicode.js
const fs = require('fs');
const path = require('path');

const ZWNJ = '\u200C'; // U+200C ZERO WIDTH NON-JOINER
const ZWJ  = '\u200D'; // U+200D ZERO WIDTH JOINER

function escapeUnicodeCharacters(content) {
  return content
    .replace(new RegExp(ZWNJ, 'g'), '\\u200C')
    .replace(new RegExp(ZWJ, 'g'), '\\u200D');
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const replaced = escapeUnicodeCharacters(original);

  if (original !== replaced) {
    fs.writeFileSync(filePath, replaced, 'utf8');
    console.log(`✅ Escaped unicode in: ${filePath}`);
  } else {
    console.log(`ℹ️ No ZWNJ/ZWJ found in: ${filePath}`);
  }
}

const targetFolder = 'layout/Library/Application Support/ChatGPTWebLegacyCompat';

fs.readdirSync(targetFolder).forEach(file => {
  if (file.endsWith('.js')) {
    const fullPath = path.join(targetFolder, file);
    processFile(fullPath);
  }
});
