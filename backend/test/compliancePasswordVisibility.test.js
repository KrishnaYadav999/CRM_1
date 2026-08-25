const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('compliance review passwords have independent accessible visibility toggles', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/ClientComplianceReview.jsx'), 'utf8');

  assert.match(source, /Eye, EyeOff/);
  assert.match(source, /function ReviewFieldCard/);
  assert.match(source, /field\.sensitive && passwordVisible \? String\(field\.rawValue/);
  assert.match(source, /aria-label=\{`\$\{passwordVisible \? 'Hide' : 'Show'\} \$\{field\.label\}`\}/);
  assert.match(source, /<ReviewFieldCard key=\{field\.id\}/);
  assert.match(source, /\['ceprPassword', 'CEPR Password'\]/);
  assert.match(source, /\['loginPassword', 'CPCB Login Password'\]/);
});
