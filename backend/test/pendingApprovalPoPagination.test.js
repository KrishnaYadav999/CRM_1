const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('PO approvals paginate after five filtered records and reset with filters', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/PendingApproval.jsx'), 'utf8');
  assert.match(page, /const rowsPerPage = 5/);
  assert.match(page, /const \[poPage, setPoPage\] = useState\(1\)/);
  assert.match(page, /Math\.ceil\(filteredPoApprovals\.length \/ rowsPerPage\)/);
  assert.match(page, /filteredPoApprovals\.slice\(\(poPage - 1\) \* rowsPerPage, poPage \* rowsPerPage\)/);
  assert.match(page, /visiblePoApprovals\.map/);
  assert.match(page, /setPoPage\(1\)/);
  assert.match(page, /page=\{poPage\}/);
  assert.match(page, /totalPages=\{poTotalPages\}/);
});
