import {
  compactSearchText,
  isCloseSearchMatch,
  isGibberishSearchQuery,
  searchQueryNeedsCompactRetry,
  searchTypoBudget,
} from './search-tolerance.util';

describe('search tolerance', () => {
  it('strips spaces and punctuation into one token', () => {
    expect(compactSearchText('ceta phil')).toBe('cetaphil');
    expect(compactSearchText('ceta  phil')).toBe('cetaphil');
    expect(compactSearchText('cetaphil ')).toBe('cetaphil');
    expect(compactSearchText('Cetaphil')).toBe('cetaphil');
  });

  it('retries a compact search only when the query is spaced or punctuated', () => {
    expect(searchQueryNeedsCompactRetry('ceta phil')).toBe(true);
    expect(searchQueryNeedsCompactRetry('ceta  phil')).toBe(true);
    expect(searchQueryNeedsCompactRetry('cetaphil')).toBe(false);
    expect(searchQueryNeedsCompactRetry('cetaph')).toBe(false);
    expect(searchQueryNeedsCompactRetry('ceta')).toBe(false);
  });

  it('allows 1 typo under 7 characters and 2 typos after that', () => {
    expect(searchTypoBudget(4)).toBe(1);
    expect(searchTypoBudget(6)).toBe(1);
    expect(searchTypoBudget(7)).toBe(2);
    expect(searchTypoBudget('setaphil'.length)).toBe(2);
  });

  it('keeps existing prefix names as close matches', () => {
    expect(isCloseSearchMatch('Cetaphil Moisturising Cream', 'cetaphil')).toBe(true);
    expect(isCloseSearchMatch('Cetaphil Moisturising Cream', 'cetaph')).toBe(true);
    expect(isCloseSearchMatch('Cetaphil Moisturising Cream', 'ceta')).toBe(true);
  });

  it('matches a one-character typo and a spaced brand name', () => {
    expect(isCloseSearchMatch('Cetaphil Moisturising Cream', 'setaphil')).toBe(true);
    expect(isCloseSearchMatch('Cetaphil', 'ceta phil')).toBe(true);
    expect(isCloseSearchMatch('Cetaphil', 'ceta  phil')).toBe(true);
  });

  it('does not treat an unrelated word or gibberish as a close title match', () => {
    expect(isCloseSearchMatch('Cetaphil', 'iphone')).toBe(false);
    expect(isCloseSearchMatch('Cetaphil', 'asdfqwerzx')).toBe(false);
    expect(isCloseSearchMatch('Cetaphil', 'xqzplkmn')).toBe(false);
  });

  it('reserves gibberish for nonsense and keeps real words that we do not sell', () => {
    expect(isGibberishSearchQuery('asdfqwerzx')).toBe(true);
    expect(isGibberishSearchQuery('xqzplkmn')).toBe(true);
    expect(isGibberishSearchQuery('iphone')).toBe(false);
    expect(isGibberishSearchQuery('cetaphil')).toBe(false);
    expect(isGibberishSearchQuery('setaphil')).toBe(false);
    expect(isGibberishSearchQuery('ceta')).toBe(false);
  });
});
