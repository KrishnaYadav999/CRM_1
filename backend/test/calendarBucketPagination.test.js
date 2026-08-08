const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('calendar date bucket shows four records with pagination and visible actions', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/CalendarTodo.jsx'), 'utf8');
  const styles = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/styles/modules/09-notifications-calendar.css'), 'utf8');
  assert.match(page, /const BUCKET_PAGE_SIZE = 4/);
  assert.match(page, /const visibleBucketItems = bucketPopupItems\.slice/);
  assert.match(page, /visibleBucketItems\.map/);
  assert.match(page, /bucketPopupItems\.length > BUCKET_PAGE_SIZE && <MiniPager/);
  assert.match(page, /'Close Follow-Up'/);
  assert.match(page, /completionTarget\.type === 'followup'/);
  assert.match(styles, /grid-auto-rows:\s*minmax\(112px, auto\)/);
  assert.match(styles, /\.calendar-bucket-actions button:first-child\s*\{[\s\S]*?min-width:\s*130px/);
});

test('completing a calendar follow-up closes its linked lead service reminder', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/calendarItemController.js'), 'utf8');
  assert.match(controller, /async function closeLinkedLeadFollowUp\(item, user\)/);
  assert.match(controller, /nextFollowUpDate:\s*''/);
  assert.match(controller, /followUpClosedAt:\s*closedAt/);
  assert.match(controller, /await closeLinkedLeadFollowUp\(item, req\.user\)/);
});
