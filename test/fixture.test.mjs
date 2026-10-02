import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture } from '../scripts/fixture.mjs';

test('the dev fixture covers every slot state, all four layouts, a partly booked session and a cancelled date', () => {
  const { sessions } = buildFixture('2026-10-02');
  const live = sessions.filter((s) => !s.cancelled);
  const states = new Set(live.flatMap((s) => s.slots.filter((x) => x.kind === 'talk').map((x) => x.state)));
  assert.deepEqual([...states].sort(), ['open', 'pending', 'scheduled']);
  assert.deepEqual(new Set(live.map((s) => s.layout)), new Set(['default', 'presentation', 'full', 'lightning']));
  assert.ok(sessions.some((s) => s.cancelled));
  const partly = live.some((s) => {
    const t = s.slots.filter((x) => x.kind === 'talk');
    return t.some((x) => x.state === 'open') && t.some((x) => x.state !== 'open');
  });
  assert.ok(partly, 'at least one session is partly booked');
  assert.ok(live.some((s) => s.slots.some((x) => x.kind === 'discussion')), 'leftover time renders as discussion');
});

test('fixture dates are always in the future relative to the given day', () => {
  const { sessions } = buildFixture('2030-06-15');
  assert.ok(sessions.every((s) => s.date > '2030-06-15'));
});
