module.exports = {
  plugins: [
    // Expand and resolve custom properties early so color functions can compute.
    require('@csstools/postcss-progressive-custom-properties')({ preserve: false }),
    // Provide fallback for gradients using colorspace syntax (e.g. 'linear-gradient(in oklab, ...)').
    (function gradientColorspaceFallback(){
      const supportsTest = '(background-image:linear-gradient(in lab,red,red))';
      const stripInPattern = /\s+in\s+(oklab|lab)\b/gi;
      function stripValue(v){ return v.replace(stripInPattern, ''); }
      return {
        postcssPlugin: 'gradient-colorspace-fallback',
        Once(root){
          // Simplify @supports (color: color-mix(...)) if both colors identical (e.g., red, red) -> (color: red)
          root.walkAtRules('supports', at => {
            const before = at.params;
            // Match color-mix(in lab|oklab, colorA <pct>?, colorB <pct>?)
            at.params = at.params.replace(/color-mix\(in\s+(?:oklab|lab)\s*,\s*([a-zA-Z#0-9]+)(?:\s+([0-9]{1,3})%?)?\s*,\s*([a-zA-Z#0-9]+)(?:\s+([0-9]{1,3})%?)?\s*\)/g, (m,c1,p1,c2,p2) => {
              if (c1.toLowerCase() === c2.toLowerCase()) {
                return c1; // identical colors -> result is that color
              }
              return m; // leave complex mixes untouched
            });
            // Also collapse surrounding parentheses pattern (color: <color>) if replaced
            at.params = at.params.replace(/\(\s*color:\s*([a-zA-Z#0-9]+)\s*\)/g, '(color: $1)');
          });
          // Collect rules that define --tw-gradient-position with ' in oklab'
          const candidates = [];
          root.walkRules(rule => {
            if (rule.parent.type === 'atrule' && rule.parent.name === 'supports') return; // skip already-conditional
            let hasOklab = false;
            rule.walkDecls('--tw-gradient-position', decl => {
              if (/\bin\s+oklab\b/.test(decl.value)) hasOklab = true;
            });
            if (hasOklab) candidates.push(rule);
          });
          candidates.forEach(rule => {
            // Skip if we already inserted a fallback (detect duplicate stripped version immediately before)
            const prev = rule.prev();
            let already = false;
            if (prev && prev.type === 'rule' && prev.selector === rule.selector) {
              let diff = false;
              prev.walkDecls('--tw-gradient-position', d => { if (/\bin\s+oklab\b/.test(d.value)) diff = true; });
              if (!diff) already = true; // previous does not contain oklab
            }
            if (already) return;
            const supportsClone = rule.clone(); // original with oklab retained
            // Fallback mutation in place
            rule.walkDecls('--tw-gradient-position', d => { d.value = stripValue(d.value); });
            // Also strip any linear/radial gradient function arguments containing ' in oklab'
            rule.walkDecls(d => { if (/gradient\(/.test(d.value)) d.value = stripValue(d.value); });
            const atSupports = rule.clone({ type: 'atrule', name: 'supports', params: supportsTest });
            atSupports.removeAll();
            atSupports.append(supportsClone);
            rule.parent.insertAfter(rule, atSupports);
          });
          // Inside existing @supports blocks: add fallbacks before them by stripping values
          root.walkAtRules('supports', at => {
            if (!/linear-gradient\(in\s+lab/i.test(at.params)) return;
            const fallbackRules = [];
            at.walkRules(r => {
              let uses = false;
              r.walkDecls('--tw-gradient-position', d => { if (/\bin\s+oklab\b/.test(d.value)) uses = true; });
              if (uses) {
                const fb = r.clone();
                fb.walkDecls('--tw-gradient-position', d => { d.value = stripValue(d.value); });
                fb.walkDecls(d => { if (/gradient\(/.test(d.value)) d.value = stripValue(d.value); });
                fallbackRules.push(fb);
              }
            });
            if (fallbackRules.length) {
              fallbackRules.forEach(fb => at.parent.insertBefore(at, fb));
            }
          });
        }
      };
    })(),
    // Normalize neutral oklab forms like oklab(0 none none/.5) -> oklab(0 0 0 / .5)
    (function neutralOklabToNumeric(){
      const re = /oklab\(0%?\s+none\s+none\/(0?\.\d+|1(?:\.0+)?|0)\)/g;
      return {
        postcssPlugin: 'neutral-oklab-to-numeric',
        Declaration(decl){
          if (re.test(decl.value)) {
            decl.value = decl.value.replace(re, 'oklab(0 0 0 / $1)');
          }
        }
      };
    })(),
    // Convert oklab()/oklch() to sRGB.
    require('@csstools/postcss-oklab-function')({ preserve: false }),
    // Resolve color-mix() after oklab conversion.
    require('@csstools/postcss-color-mix-function')({ preserve: false }),
    // Finally expand relative color syntax.
    require('@csstools/postcss-relative-color-syntax')(),
    // require('autoprefixer'),
  ],
};
