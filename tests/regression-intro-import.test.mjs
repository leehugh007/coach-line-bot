import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  formatStudentImportPreview,
  parseStudentImportLine,
} from '../lib/student-import.mjs';

test('Excel preview keeps student ID separate from introduction', () => {
  const preview = formatStudentImportPreview({
    lineName: '雅萍',
    realName: '雷雅萍',
    studentId: '2609002-3',
  });

  assert.equal(preview, '雅萍 | 雷雅萍 | 2609002-3 | ');
  assert.deepEqual(parseStudentImportLine(preview, '2026年9月班'), {
    lineName: '雅萍',
    realName: '雷雅萍',
    className: '2026年9月班',
    studentId: '2609002-3',
    intro: '',
  });
});

test('legacy three-column manual import still treats prose as introduction', () => {
  assert.deepEqual(
    parseStudentImportLine('Annie | 安妮 | 金融業，第二期學員', '2026年9月班'),
    {
      lineName: 'Annie',
      realName: '安妮',
      className: '2026年9月班',
      studentId: '',
      intro: '金融業，第二期學員',
    },
  );
});

test('explicit four-column import preserves pipes inside introduction', () => {
  assert.deepEqual(
    parseStudentImportLine('Amy | 王小美 | 2609008-1 | 老師 | 想改善體力', '2026年9月班'),
    {
      lineName: 'Amy',
      realName: '王小美',
      className: '2026年9月班',
      studentId: '2609008-1',
      intro: '老師 | 想改善體力',
    },
  );
});

test('group self-introduction stays in the webhook lifetime and always creates a pending record', async () => {
  const route = await readFile(new URL('../app/api/webhook/route.js', import.meta.url), 'utf8');
  const start = route.indexOf('if (looksLikeIntroduction(trimmed))');
  const end = route.indexOf('// 2.5', start);
  const block = route.slice(start, end);

  assert.ok(start >= 0 && end > start, 'self-introduction branch must exist');
  assert.match(block, /await introBackground\(\);/);
  assert.doesNotMatch(block, /globalThis\.__nextWaitUntil/);
  assert.match(block, /generateDraftWithRetry/);
  assert.match(block, /await savePendingItem\(/);
  assert.doesNotMatch(block, /if \(draft\) \{[\s\S]*await savePendingItem/);
});

test('raw introduction is durably saved before optional AI extraction', async () => {
  const userSource = await readFile(new URL('../lib/user.js', import.meta.url), 'utf8');
  const start = userSource.indexOf('export async function processIntroduction');
  const end = userSource.indexOf('/**\n * 記錄互動次數', start);
  const block = userSource.slice(start, end);

  const rawAssignment = block.indexOf('profile.introText = introText');
  const durableSave = block.indexOf('await saveUser(userId, profile, { awaitSupabase: true })');
  const extraction = block.indexOf('extractProfile(introText');

  assert.ok(rawAssignment >= 0, 'raw intro assignment must exist');
  assert.ok(durableSave > rawAssignment, 'raw intro must be saved after assignment');
  assert.ok(extraction > durableSave, 'AI extraction must happen only after raw intro is saved');
});
