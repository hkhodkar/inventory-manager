import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header and rows', () => {
    expect(
      toCsv(
        ['sku', 'stock'],
        [
          ['ELC-1', 4],
          ['OFF-2', 0],
        ],
      ),
    ).toBe('sku,stock\r\nELC-1,4\r\nOFF-2,0');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv(['name'], [['Box, large'], ['27" monitor'], ['two\nlines']])).toBe(
      'name\r\n"Box, large"\r\n"27"" monitor"\r\n"two\nlines"',
    );
  });

  it('leaves empty values blank and keeps negative numbers', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, -3]])).toBe('a,b,c\r\n,,-3');
  });

  it('neutralises text that looks like a formula', () => {
    expect(toCsv(['note'], [['=SUM(A1:A9)'], ['-2 damaged']])).toBe(
      "note\r\n'=SUM(A1:A9)\r\n'-2 damaged",
    );
  });
});
