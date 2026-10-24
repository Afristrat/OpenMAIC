import { describe, expect, it } from 'vitest';
import { evaluateTtsOutcome } from '@/lib/server/tts-outcome';

describe('evaluateTtsOutcome', () => {
  it('accepts a course whose every speech line carries a voice', () => {
    expect(
      evaluateTtsOutcome({ requested: 10, generated: 10 }, { speech: 10, missing: 0 }),
    ).toEqual({ kind: 'ok' });
  });

  it('accepts a course without any speech line', () => {
    expect(evaluateTtsOutcome({ requested: 0, generated: 0 }, { speech: 0, missing: 0 })).toEqual({
      kind: 'ok',
    });
  });

  it('keeps the course when only some voices failed (123 of 150)', () => {
    expect(
      evaluateTtsOutcome({ requested: 150, generated: 123 }, { speech: 150, missing: 27 }),
    ).toEqual({ kind: 'partial', missing: 27, total: 150, creditsBlocked: false });
  });

  it('keeps the course when the credits ran out after some voices', () => {
    expect(
      evaluateTtsOutcome(
        { requested: 10, generated: 4, creditsBlocked: true },
        { speech: 10, missing: 6 },
      ),
    ).toEqual({ kind: 'partial', missing: 6, total: 10, creditsBlocked: true });
  });

  it('fails when voices were requested and none was generated', () => {
    expect(evaluateTtsOutcome({ requested: 5, generated: 0 }, { speech: 5, missing: 5 })).toEqual({
      kind: 'total_failure',
      creditsBlocked: false,
      message: 'TTS persistence incomplete: 0/5 speech actions generated',
    });
  });

  it('fails with a credits error when the balance blocked every voice', () => {
    const outcome = evaluateTtsOutcome(
      { requested: 5, generated: 0, creditsBlocked: true },
      { speech: 5, missing: 5 },
    );
    expect(outcome).toMatchObject({ kind: 'total_failure', creditsBlocked: true });
  });

  it('fails when no server voice provider exists (nothing requested, lines silent)', () => {
    expect(evaluateTtsOutcome({ requested: 0, generated: 0 }, { speech: 8, missing: 8 })).toEqual({
      kind: 'total_failure',
      creditsBlocked: false,
      message: 'TTS incomplete: 8 speech lines have no audio',
    });
  });
});
