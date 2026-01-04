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

/**
 * Transpile @container range syntax to legacy @media syntax.
 * @param {string} params 
 * @returns {string}
 */
function transpileContainerQuery(params) {
  // Fix the weird space in range syntax: "> =" -> ">="
  let p = params.replace(/\s*([<>])\s*=\s*/g, '$1=')
                .replace(/\s*>\s*/g, '>')
                .replace(/\s*<\s*/g, '<');

  // Strip container name (everything before the first '(')
  const parenIndex = p.indexOf('(');
  if (parenIndex !== -1) {
    const preParen = p.substring(0, parenIndex);
    const hasNot = /\bnot\b/i.test(preParen);
    p = (hasNot ? 'not ' : '') + p.substring(parenIndex);
  }
  p = p.trim();

  // Convert (width >= 400px) -> (min-width: 400px)
  p = p.replace(/\(width\s*>=\s*([^)]+)\)/gi, '(min-width: $1)');
  // Convert (width <= 400px) -> (max-width: 400px)
  p = p.replace(/\(width\s*<=\s*([^)]+)\)/gi, '(max-width: $1)');
  
  // Handle 'not' for media queries: "not (min-width: 400px)" -> "not all and (min-width: 400px)"
  if (/^not\s+\(/i.test(p)) {
    p = 'not all and ' + p.substring(4);
  }

  return p;
}

/**
 * Convert physical properties to logical ones within a rule.
 * @param {import('postcss').Rule} rule 
 * @param {'ltr'|'rtl'} direction 
 */
function transformLogicalProperties(rule, direction) {
  rule.walkDecls(decl => {
    const prop = decl.prop;
    if (direction === 'ltr') {
      decl.prop = prop
        .replace(/^left$/, 'inset-inline-start')
        .replace(/^right$/, 'inset-inline-end')
        .replace(/^margin-left$/, 'margin-inline-start')
        .replace(/^margin-right$/, 'margin-inline-end')
        .replace(/^padding-left$/, 'padding-inline-start')
        .replace(/^padding-right$/, 'padding-inline-end')
        .replace(/^border-left$/, 'border-inline-start')
        .replace(/^border-right$/, 'border-inline-end')
        .replace(/^border-left-([a-z-]+)$/, 'border-inline-start-$1')
        .replace(/^border-right-([a-z-]+)$/, 'border-inline-end-$1')
        .replace(/^border-top-left-radius$/, 'border-start-start-radius')
        .replace(/^border-top-right-radius$/, 'border-end-start-radius')
        .replace(/^border-bottom-left-radius$/, 'border-start-end-radius')
        .replace(/^border-bottom-right-radius$/, 'border-end-end-radius');
    } else if (direction === 'rtl') {
      decl.prop = prop
        .replace(/^left$/, 'inset-inline-end')
        .replace(/^right$/, 'inset-inline-start')
        .replace(/^margin-left$/, 'margin-inline-end')
        .replace(/^margin-right$/, 'margin-inline-start')
        .replace(/^padding-left$/, 'padding-inline-end')
        .replace(/^padding-right$/, 'padding-inline-start')
        .replace(/^border-left$/, 'border-inline-end')
        .replace(/^border-right$/, 'border-inline-start')
        .replace(/^border-left-([a-z-]+)$/, 'border-inline-end-$1')
        .replace(/^border-right-([a-z-]+)$/, 'border-inline-start-$1')
        .replace(/^border-top-left-radius$/, 'border-end-start-radius')
        .replace(/^border-top-right-radius$/, 'border-start-start-radius')
        .replace(/^border-bottom-left-radius$/, 'border-end-end-radius')
        .replace(/^border-bottom-right-radius$/, 'border-start-end-radius');
    }
  });
}

function processContainer(container) {
  if (!container || !container.nodes) return;
  // Copy to avoid skipping nodes when removing
  for (const node of [...container.nodes]) {
    if (node.type === 'rule') {
      let original = node.selector;

      // Convert :dir(ltr/rtl) to logical properties for iOS < 16.4
      if (/:dir\((ltr|rtl)\)/.test(original)) {
        // Collect all directions present in the selector
        const directions = [];
        original.replace(/:dir\((ltr|rtl)\)/g, (m, dir) => {
          if (!directions.includes(dir)) directions.push(dir);
          return '';
        });
        // Transform declarations for each direction found
        directions.forEach(dir => transformLogicalProperties(node, dir));
        // Strip the pseudo-class from the selector and clean up internal/external commas
        original = original.replace(/:dir\((ltr|rtl)\)/g, '')
          .replace(/(:where|:is|:not)\(\s*,/g, '$1(')
          .replace(/,\s*,/g, ',')
          .replace(/,\s*\)/g, ')');
        
        // Clean up any double commas at the top level (if any part became empty)
        original = splitSelectors(original).filter(s => s.trim().length > 0).join(', ');
      }

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
            // Convert dynamic viewport units (dvh/svh/lvh/dvw/svw/lvw) to classic (vh/vw)
            // and mark the declaration as !important if any conversion occurred.
            let v = decl.value;
            let changed = false;

            // 1) Common case: a number (with optional sign/decimal) immediately precedes the unit
            let next = v.replace(/([+-]?(?:\d+\.?\d*|\.\d+))\s*([dsl])v([wh])\b/gi, '$1v$3');
            changed = changed || next !== v; v = next;

            // Normalize scientific notation
            v = v.replace(/(\d(?:[\d]*\.?[\d]*)e)\s*([+-])\s*(\d+)/gi, '$1$2$3');

            // Fix corrupted font-family line for Segoe UI Variable Small
            if (v.includes('Segoe UI Variable')) {
              // Handle multiple potential corruption patterns
              v = v.replace(/"?Segoe UI Variable\s+ui-sans-serif"ns-serif"?/g, '"Segoe UI Variable Small", "ui-sans-serif"');
              v = v.replace(/Segoe UI Variable ui-sans-serif"ns-serif"/g, '"Segoe UI Variable Small", "ui-sans-serif"');
              changed = true;
            }

            // Fix url(";https://...) errors
            if (v.includes('url(";https://')) {
              v = v.replace(/url\(";https:\/\//g, 'url("https://');
              changed = true;
            }

            // Fix mask-composite: source-in (invalid in standard CSS, usually followed by intersect)
            if (decl.prop === 'mask-composite' && v === 'source-in') {
               v = 'intersect';
               changed = true;
            }

            // Assign back and enforce !important when units were converted (but don't double-add)
            if (v !== decl.value) {
              decl.value = v;
            }
            if (changed && !decl.important) {
              decl.important = true;
            }
            
            // Final cleanup of values: remove any accidental trailing semicolon and unwanted leading semicolon from misparsing
            if (typeof decl.value === 'string') {
              let cleaned = decl.value.trim();
              if (cleaned.startsWith(';')) cleaned = cleaned.substring(1).trim();
              if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1).trim();
              decl.value = cleaned;
            }
          }
        }

        // Deduplicate and filter declarations
        const decls = new Map();
        for (const decl of [...node.nodes]) {
          if (decl.type === 'decl') {
            // Drop declarations with empty or whitespace-only values
            if (!decl.value || decl.value.trim().length === 0) {
              decl.remove();
              continue;
            }
            const key = `${decl.prop}${decl.important ? '!important' : ''}`;
            if (decls.has(key)) {
              decls.get(key).remove();
            }
            decls.set(key, decl);
          }
        }

        if (node.nodes.length === 0) node.remove();
      }
    } else if (node.type === 'atrule') {
      if (node.name === 'layer') {
        const parent = node.parent;
        node.each(child => parent.insertBefore(node, child));
        node.remove();
        continue;
      }
      
      // Fix @supports spacing: and(not -> and (not
      if (node.name === 'supports') {
        node.params = node.params
          .replace(/\s*and\s*\(/gi, ' and (')
          .replace(/\s*or\s*\(/gi, ' or (')
          .replace(/\s*not\s*\(/gi, ' not (');
      }

      processContainer(node);
      if (['starting-style', 'font-palette-values'].includes(node.name) || (node.name === 'media' && node.params.includes('print'))) {
        node.remove();
        continue;
      }
      if (!node.nodes || node.nodes.length === 0) {
        if (node.raws && node.raws.afterName === undefined && node.nodes === undefined) continue;
        if (node.name === 'font-face') continue;
        if (node.nodes && node.nodes.length === 0) node.remove();
      }
    }
  }
  
  // Deduplicate identical adjacent rules or rules with same content within the same container
  const seenRules = new Map();
  for (const node of [...container.nodes]) {
    if (node.type === 'rule') {
      const ruleKey = node.selector + ' {' + node.nodes.map(n => n.toString()).join(';') + '}';
      if (seenRules.has(ruleKey)) {
        node.remove();
      } else {
        seenRules.set(ruleKey, true);
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

// Extract all @container at-rules into a separate root, converting them to @media for compatibility.
const containersRoot = postcss.root();
newRoot.walkAtRules('container', atRule => {
  atRule.params = transpileContainerQuery(atRule.params);
  atRule.name = 'media';
  // Also process contents of container rules as they might need logical property conversion etc.
  processContainer(atRule);
  containersRoot.append(atRule.clone());
  atRule.remove();
});

// Final validation parse step
let outputCSS = newRoot.toString()
  .replace(/;;/g, ';') // General cleanup for double semicolons
  .split('ui-sans-serif"ns-serif"').join('Small", "ui-sans-serif"')
  .replace(/Variable\s+ui-sans-serif"ns-serif"/g, 'Variable Small", "ui-sans-serif"')
  .replace(/url\(";https:\/\//g, 'url("https://'); // Specific fix for misquoted URLs

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
