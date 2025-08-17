#!/usr/bin/env node
/**
 * Extract only the content inside top-level @layer blocks, remove the @layer wrappers,
 * drop ::backdrop selectors from selector lists (but keep the rest), and output valid CSS.
 * Any top-level styles not inside @layer are discarded.
 *
 * Usage: node extract-layers.js input.css output.css
 */
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const inputFile = process.argv[2] || 'root-original.css';
const outputFile = process.argv[3] || 'root-legacy.css';

if (!fs.existsSync(inputFile)) {
  console.error('Input file not found:', inputFile);
  process.exit(1);
}

function splitSelectors(selector) {
  // Split at top-level commas only.
  const result = [];
  let current = '';
  let depthSquare = 0, depthParen = 0;
  let inSingle = false, inDouble = false;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '[') depthSquare++;
      else if (ch === ']') depthSquare = Math.max(0, depthSquare - 1);
      else if (ch === '(') depthParen++;
      else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
      else if (ch === ',' && depthSquare === 0 && depthParen === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function filterBackdrop(selectorList) {
  const parts = splitSelectors(selectorList);
  const kept = parts.filter(p => !/::backdrop\b/i.test(p));
  return kept.join(', ');
}

function processContainer(container) {
  if (!container || !container.nodes) return;
  // Copy to avoid skipping nodes when removing
  for (const node of [...container.nodes]) {
    if (node.type === 'rule') {
  let original = node.selector;
  // Normalize attribute selector spacing for ~= (e.g., [data-silk ~ =a1] -> [data-silk~=a1])
  original = original.replace(/(\[[^\]]*?)\s*~\s*=(?=[^\]]*\])/g, (m, pre) => pre + '~=');
      // Normalize escaped important markers: transform "\\ !" to "\\!"
      original = original.replace(/\\\s+!/g, '\\!');
  // Remove spaces after escaped commas inside arbitrary value class selectors (e.g., \,  becomes \,)
  original = original.replace(/\\,\s+/g, '\\,');
  // Inside arbitrary value class segments like .mt-\[calc(...) * -1\] collapse spaces around '*'
  original = original.replace(/\\\[[^\]]*?\\\]/g, seg => seg
    .replace(/\s*\*\s*/g, '*')
    .replace(/\s*\+\s*/g, '+')
  );
  // Fix malformed content arbitrary value utility classes lacking quotes, e.g. content-\[\M\\] or content-\[\ * \\]
  // Transform content-\[\ X \\] => content-\["X"\]
  original = original.replace(/content-\\\[\\([^\\\]]{1,20}?)\\\\?\\\]/g, (full, inner) => {
    const trimmed = inner.trim();
    // Avoid double quoting if already starts with quote
    if (/^['\"]/ .test(trimmed)) return full; // already quoted
    return full.replace(/content-\\\[\\.*\\\\?\\\]/, `content-\\["${trimmed}"\\]`);
  });
  // Specific fix for escaped asterisk content selector variants: .before:content-\\[\\*\\]:before => content-\\["*"\\]
  original = original.replace(/content-\\\[\\\*\\\]/g, 'content-\\["*"\\]');
  // Fallback: directly quote asterisk content for before: and after: variants if still present
  original = original.replace(/(before|after)\\:content-\\\[\\\*\\\]/g, '$1:content-\\["*"\\]');
      // Normalize malformed Tailwind variant selector produced as :is(.\ * \\:not-last\\:after\\:X > *):not(:last-child):after
      // Convert to .not-last\\:after\\:X > *:not(:last-child):after
      original = original.replace(/:is\(\.\\?\s*\*\s*\\:not-last\\:after\\:([^>]+?)>\s*\*\):not\(:last-child\):after/g,
        (m, util) => {
          const cleaned = util.trim().replace(/\s+$/,'');
          return '.not-last\\:after\\:' + cleaned + '>*:not(:last-child):after';
        }
      );
  const filtered = filterBackdrop(original);
      if (!filtered) {
        node.remove();
        continue;
      }
      node.selector = filtered;
      if (node.nodes) {
        // Filter out undefined-valued declarations
        node.nodes = node.nodes.filter(decl => !(decl.type === 'decl' && decl.value === undefined));
        // Remove empty custom property declarations like --foo:; or --bar:
        node.nodes = node.nodes.filter(decl => {
          if (decl.type !== 'decl') return true;
            if (decl.prop && decl.prop.startsWith('--')) {
              const val = (decl.value || '').trim();
              return val.length > 0; // keep only if has value
            }
            return true;
        });
        // Replace dynamic viewport units in declaration values only (leave class names/selectors untouched)
        for (const decl of node.nodes) {
          if (decl.type === 'decl' && typeof decl.value === 'string') {
            // Safe replacement: only whole unit tokens, not inside custom property names since we are in value
            // Convert dynamic viewport units (dvh/svh/lvh) to classic (vh/vw)
            // 1) Common case: a number (with optional sign/decimal) immediately precedes the unit, e.g., -100lvh, .5dvw, 2svh
            decl.value = decl.value.replace(/([+-]?(?:\d+\.?\d*|\.\d+))\s*([dsl])v([wh])\b/gi, '$1v$3');
            // 2) Rare case: bare unit token preceded by a non-word char (e.g., in functions or after operators), e.g., "min(100, 1dvh)"
            //    Avoid matching inside identifiers by requiring a non-word prefix and reinserting it.
            decl.value = decl.value.replace(/(^|[^0-9A-Za-z_-])([dsl])v([wh])\b/gi, (m, pre, _dyn, hw) => pre + 'v' + hw);
            // Normalize spaced scientific notation: 1e + 10 -> 1e+10, 2.5e - 8 -> 2.5e-8
            decl.value = decl.value.replace(/(\d(?:[\d]*\.?[\d]*)e)\s*([+-])\s*(\d+)/gi, '$1$2$3');
          }
        }
        if (node.nodes.length === 0) node.remove();
      }
    } else if (node.type === 'atrule') {
      if (node.name === 'layer') {
        // We should never have nested @layer (but if we do, inline its children)
        const parent = node.parent;
        const idx = parent.index(node);
        node.each(child => parent.insertBefore(node, child));
        node.remove();
        continue;
      }
      processContainer(node);
      if (!node.nodes || node.nodes.length === 0) {
        // Keep at-rules like @font-face (they have decls) or at-rules without blocks
        if (node.raws && node.raws.afterName === undefined && node.nodes === undefined) continue;
        if (node.name === 'font-face') continue; // font-face always has decls
        if (node.nodes && node.nodes.length === 0) node.remove();
      }
    }
  }
}

const raw = fs.readFileSync(inputFile, 'utf8');
let root;
try {
  root = postcss.parse(raw, { from: inputFile });
} catch (e) {
  console.error('Failed to parse input CSS:', e.message);
  process.exit(1);
}

// Collect content from top-level @layer at-rules only.
const newRoot = postcss.root();
const layersEncountered = [];
for (const node of root.nodes) {
  if (node.type === 'atrule' && node.name === 'layer') {
    layersEncountered.push(node.params.trim());
    // Inline its children into newRoot (clone to detach)
    node.each(child => newRoot.append(child.clone()));
  }
}

// Process the new root: remove ::backdrop selectors, clean empty stuff.
processContainer(newRoot);

// Extract all @container at-rules into a separate root
const containersRoot = postcss.root();
newRoot.walkAtRules('container', atRule => {
  containersRoot.append(atRule.clone());
  atRule.remove();
});

// Final validation parse step
let outputCSS = newRoot.toString();

try {
  postcss.parse(outputCSS, { from: undefined });
} catch (e) {
  console.error('Validation parse failed, aborting. Error:', e.message);
  const debugFile = outputFile.replace(/\.css$/, '') + '.invalid.css';
  fs.writeFileSync(debugFile, outputCSS, 'utf8');
  console.error('Wrote debug output to', debugFile);
  process.exit(1);
}

// Ensure output directory exists
const outDir = path.dirname(outputFile);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(outputFile, outputCSS, 'utf8');

// Derive container file name:
// If user passed styles/root-base.css => styles/root-container.css
// Else if basename is root-legacy.css => root-container.css
// Else default: append -containers before .css
const baseName = path.basename(outputFile);
let containersFile;
if (/^root-(legacy|base)\.css$/.test(baseName)) {
  containersFile = path.join(outDir, 'root-container.css');
} else if (baseName.endsWith('.css')) {
  containersFile = path.join(outDir, baseName.replace(/\.css$/, '-containers.css'));
} else {
  containersFile = outputFile + '-containers.css';
}
const containersCSS = containersRoot.toString();
fs.writeFileSync(containersFile, containersCSS, 'utf8');

console.log('Success. Layers extracted:', layersEncountered.join(', '));
console.log('Base output written to', outputFile);
console.log('Container rules written to', containersFile);
