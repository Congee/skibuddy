import { assert, describe, it } from '@effect/vitest';
import { Emphasis, NO_FOCUS, closeSlat, focusedKey, highlight, hoverSlat, isOpen, leaveSlat, openSlat } from '../src/state/focus';

describe('slat focus', () => {
  it('focuses the most recently opened slat', () => {
    const s = openSlat(openSlat(NO_FOCUS, 'quadriceps:outside'), 'calf:inside');
    assert.strictEqual(focusedKey(s), 'calf:inside');
    assert.isTrue(isOpen(s, 'quadriceps:outside'));
    assert.strictEqual(focusedKey(openSlat(s, 'quadriceps:outside')), 'quadriceps:outside');
  });

  it('clears the focus when its slat collapses', () => {
    const s = closeSlat(openSlat(NO_FOCUS, 'quadriceps:outside'), 'quadriceps:outside');
    assert.isNull(focusedKey(s));
    assert.isNull(highlight(s));
  });

  it('falls back to the slat opened before when the focused one collapses', () => {
    const s = closeSlat(openSlat(openSlat(NO_FOCUS, 'a'), 'b'), 'b');
    assert.strictEqual(focusedKey(s), 'a');
  });

  it('keeps the focus when an older slat collapses', () => {
    const s = closeSlat(openSlat(openSlat(NO_FOCUS, 'a'), 'b'), 'a');
    assert.strictEqual(focusedKey(s), 'b');
    assert.isFalse(isOpen(s, 'a'));
  });

  it('previews a hovered slat only while nothing is focused', () => {
    const hovered = hoverSlat(NO_FOCUS, 'a');
    assert.deepStrictEqual(highlight(hovered), { key: 'a', emphasis: Emphasis.Preview });
    const focused = openSlat(hovered, 'b');
    assert.deepStrictEqual(highlight(focused), { key: 'b', emphasis: Emphasis.Focus });
    assert.deepStrictEqual(highlight(hoverSlat(focused, 'c')), { key: 'b', emphasis: Emphasis.Focus });
  });

  it('clears a hover only from the slat that set it', () => {
    const s = hoverSlat(NO_FOCUS, 'b');
    assert.strictEqual(leaveSlat(s, 'a'), s);
    assert.isNull(highlight(leaveSlat(s, 'b')));
  });
});
