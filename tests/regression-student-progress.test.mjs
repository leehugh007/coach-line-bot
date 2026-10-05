import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { formatStudentProgressDetail } from '../lib/student-progress.mjs';

// Execute the real modules with in-memory service boundaries: no LINE sends,
// database writes, or AI calls during regression tests.
async function loadModule(path, names, stubs = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const executable = source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  return vm.runInNewContext(`${executable}\n;({ ${names.join(', ')} });`, {
    console: { log() {}, warn() {}, error() {} },
    process: { env: {} },
    formatStudentProgressDetail,
    ...stubs,
  });
}

const screenshotDetails = [
  ['AI 建議學員觀察褲頭鬆緊度或下午精神狀況，這些是潛在的進步跡象。', '建議你觀察褲頭鬆緊度或下午精神狀況，這些是潛在的進步跡象。'],
  ['學員有吃到兩拳頭的蔬菜', '你有吃到兩拳頭的蔬菜'],
  ['學員對主食的選擇更有意識，從被動轉為主動掌控營養來源。', '你對主食的選擇更有意識，從被動轉為主動掌控營養來源。'],
  ['學員對羅漢果糖與精緻糖的差異有更深入的研究與觀察。', '你對羅漢果糖與精緻糖的差異有更深入的研究與觀察。'],
  ['Emma對食物成分開始有敏銳度了。', 'Emma對食物成分開始有敏銳度了。'],
];

test('legacy screenshot details address the student without inventing completion', () => {
  for (const [before, after] of screenshotDetails) {
    assert.equal(formatStudentProgressDetail(before), after);
    assert.equal(formatStudentProgressDetail(after), after);
  }
});

test('empty and malformed details are safe, while references to other students stay intact', () => {
  for (const detail of [null, undefined, 42, {}, [], '  ']) {
    assert.equal(formatStudentProgressDetail(detail), '');
  }
  assert.equal(formatStudentProgressDetail('其他學員說你瘦了'), '其他學員說你瘦了');
  assert.equal(formatStudentProgressDetail('你和其他學員一起運動'), '你和其他學員一起運動');
  assert.equal(formatStudentProgressDetail('該學員褲頭變鬆了。學員下午更有精神'), '你褲頭變鬆了。你下午更有精神');
});

test('new tags persist the same direct-address detail in both stores', async () => {
  const redisRecords = [];
  const databaseRecords = [];
  const { saveCoachingTags } = await loadModule('../lib/tags.js', ['saveCoachingTags'], {
    Redis: class {
      async rpush(_key, record) { redisRecords.push(JSON.parse(record)); }
      async llen() { return redisRecords.length; }
    },
    getSupabase: () => ({ from: () => ({ insert: async record => {
      databaseRecords.push(record);
      return { error: null };
    } }) }),
  });
  const input = { topic: 'habit', emotion: 'positive', progress_signal: 'positive', progress_detail: '學員有吃到兩拳頭的蔬菜' };
  assert.equal(await saveCoachingTags('test-student', input), 1);
  assert.equal(redisRecords[0].progress_detail, '你有吃到兩拳頭的蔬菜');
  assert.equal(databaseRecords[0].progress_detail, redisRecords[0].progress_detail);
  assert.equal(input.progress_detail, '學員有吃到兩拳頭的蔬菜', 'caller data must not be mutated');
  assert.equal(await saveCoachingTags('test-student', null), 0);
  assert.equal(await saveCoachingTags('test-student', []), 0);
});

test('malformed AI tag responses fail safely and prompt specifies the intended audience', async () => {
  for (const payload of [null, [], 'wrong shape']) {
    const { extractCoachingTags } = await loadModule('../lib/tags.js', ['extractCoachingTags'], {
      fetch: async (_url, request) => {
        const prompt = JSON.parse(request.body).contents[0].parts[0].text;
        assert.match(prompt, /會直接顯示給本人看/);
        assert.match(prompt, /尚未回報做到的行動，填 null/);
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }) };
      },
    });
    assert.equal(await extractCoachingTags('我今天有吃到蔬菜', '很棒'), null);
  }
});

async function runEveningScenario({ progress = [], daysSilent = 3, goal = null, todayUniqueUsers = 1, celebrated = true } = {}) {
  const sent = [];
  const history = [];
  const redisValues = new Map(celebrated ? [['coach-class-goal-celebrated:測試班', '1']] : []);
  const statsCalls = [];
  const now = new Date();
  const query = (table) => {
    let selection = '';
    let count = null;
    const builder = {
      select(value) { selection = value; return this; },
      eq() { return this; }, not() { return this; }, order() { return this; },
      gte() { return this; }, limit(value) { count = value; return this; },
      then(resolve, reject) {
        let data = [];
        if (table === 'coaching_tags') data = progress;
        if (table === 'conversations' && selection === 'created_at' && count === 1) {
          data = [{ created_at: new Date(now.getTime() - daysSilent * 86400000).toISOString() }];
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  const { handleEveningPush } = await loadModule('../app/api/cron/smart-push/route.js', ['handleEveningPush'], {
    getActiveGoal: async () => goal,
    getClassStats: async (...args) => {
      statsCalls.push(args);
      return { todayUniqueUsers, weekInteractions: 0, weekGoal: 100 };
    },
    pushMessage: async (id, text) => sent.push({ id, text }),
    pushWithQuickReply: async (id, text, qr) => sent.push({ id, text, qr }),
    addChatMessage: async (id, role, text) => history.push({ id, role, text }),
  });
  const redis = {
    get: async key => redisValues.get(key),
    set: async (key, value) => redisValues.set(key, value),
    lpush: async () => {}, ltrim: async () => {}, expire: async () => {},
  };
  const result = await handleEveningPush({ from: query }, redis, [{ id: 'test-student', display_name: 'Emma', class_name: '測試班' }], {
    測試班: { startDate: new Date(now.getTime() - 14 * 86400000).toISOString() },
  }, now);
  return { sent, history, redisValues, statsCalls, result };
}

test('real evening recap pipeline formats old notes and retains dates, persistence and cooldown', async () => {
  const { sent, history, redisValues, result } = await runEveningScenario({
    progress: screenshotDetails.map(([progress_detail]) => ({ progress_detail, created_at: '2026-09-30T12:00:00Z' })),
  });
  assert.equal(sent.length, 1);
  assert.equal(result.log[0].type, 'progress-review');
  for (const [, expected] of screenshotDetails) assert.ok(sent[0].text.includes(`✓ ${expected}（9/30）`));
  assert.doesNotMatch(sent[0].text, /學員|AI 建議/);
  assert.equal(history[0].text, sent[0].text);
  assert.equal(redisValues.get('coach-progress-review:test-student'), '5');
  assert.ok(redisValues.has('coach-push-log:test-student'));
});

test('student dashboard formats legacy details and omits malformed entries without a new AI call', async () => {
  const progress = [
    ...screenshotDetails.map(([progress_detail]) => ({ progress_detail, created_at: '2026-09-30T12:00:00Z' })),
    { progress_detail: {}, created_at: '2026-09-29T12:00:00Z' },
  ];
  const from = (table) => {
    let selection;
    const builder = {
      select(value) { selection = value; return this; },
      eq() { return this; }, not() { return this; }, order() { return this; },
      limit() { return this; }, single() { return this; },
      then(resolve, reject) {
        const data = table === 'users' ? { display_name: 'Emma' }
          : table === 'coaching_tags' && selection.startsWith('progress_detail') ? progress : [];
        return Promise.resolve({ data, count: 0, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  const { GET } = await loadModule('../app/api/dashboard/route.js', ['GET'], {
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    Redis: class { async get() { return 'existing portrait'; } },
    getSupabase: () => ({ from }),
    FOOD_QUIZZES: [], KNOWLEDGE_QUIZZES: [],
    QUIZ_LEVELS: [{ min: 0, title: 'test' }], KNOWLEDGE_LEVELS: [{ min: 0, title: 'test' }],
    fetch: () => { throw new Error('no new AI call expected'); },
    URL,
  });
  const response = await GET({ url: 'https://test.local/api/dashboard?userId=test-student' });
  assert.equal(response.status, 200);
  assert.equal(response.body.progressRecords.length, 5);
  response.body.progressRecords.forEach((row, i) => {
    assert.equal(row.detail, screenshotDetails[i][1]);
    assert.equal(row.date, '2026-09-30T12:00:00Z');
  });
});
