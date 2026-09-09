import { escapeIlikePattern, toIlikeContains } from './ilike-escape.util';

describe('ilike escape', () => {
  it('escapes wildcard characters', () => {
    expect(escapeIlikePattern('100%_off\\x')).toBe('100\\%\\_off\\\\x');
    expect(toIlikeContains('A_B')).toBe('%A\\_B%');
  });
});
