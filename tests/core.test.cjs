const test = require('node:test');
const assert = require('node:assert/strict');
const {parseWords, schedule, dayKey, streak} = require('../core');

test('supports multilingual tables and stable IDs after meaning edits or row reorder', () => {
  const header = '| Word | Reading | POS | Meaning |\n| --- | --- | --- | --- |\n';
  const rows = ['| apple | /ˈæpəl/ | noun | 苹果 |', '| 猫 | ねこ | 名 | cat |', '| bonjour | | | 你好 |'];
  const words = parseWords(header + rows.join('\n'), 'Words/Unit.md');
  assert.equal(words.length, 3);
  assert.equal(words[1].reading, 'ねこ');
  assert.equal(words[2].reading, '');
  const reversed = parseWords(header + rows.toReversed().join('\n'), 'Words/Unit.md');
  assert.equal(words[0].id, reversed[2].id);
  assert.equal(words[0].id, parseWords(header + rows[0].replace('苹果', 'an apple'), 'Words/Unit.md')[0].id);
  assert.equal(new Set(parseWords(header + [rows[0], rows[0]].join('\n'), 'Words/Unit.md').map(w=>w.id)).size, 2);
});

test('accepts Chinese two-column tables and preserves legacy word IDs', () => {
  const words = parseWords('| 单词 | 释义 |\n| --- | --- |\n| hola | 你好 |', 'A.md');
  assert.equal(words[0].term, 'hola');
  const legacy = parseWords('## Nouns\n| <a href="https://www.mojidict.com/details/123">1</a> | <span>ねこ（猫）</span> | 名 | cat |', 'J.md');
  assert.equal(legacy[0].id, 'J.md::Nouns::123');
  assert.equal(legacy[0].term, '猫');
  assert.equal(legacy[0].reading, 'ねこ');
});

test('schedules forgotten, unsure, known and caps long intervals', () => {
  const now = 1000000;
  assert.equal(schedule(null,0,now).due, now + 600000);
  assert.equal(schedule(null,1,now).due, now + 86400000);
  let p;
  const intervals = [];
  for(let i=0;i<5;i++){p=schedule(p,2,now);intervals.push(p.interval);}
  assert.deepEqual(intervals,[1,3,7,17,41]);
  assert.equal(schedule(p,0,now).interval,0);
  assert.equal(schedule(p,1,now).interval,1);
  assert.equal(schedule({interval:179},2,now).interval,180);
});

test('handles local dates and streaks across month boundaries', () => {
  const now = new Date(2026,10,1,12).getTime();
  assert.equal(dayKey(now),'2026-11-01');
  assert.equal(streak({'2026-11-01':['x'],'2026-10-31':['y']},now),2);
  assert.equal(streak({'2026-10-31':['y']},now),1);
});
