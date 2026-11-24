import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvRecords, toCsv } from './csv';

describe('parseCsv', () => {
  it('parses simple rows and drops blank lines', () => {
    expect(parseCsv('a,b,c\n1,2,3\n\n4,5,6\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quotes, escaped quotes, embedded commas and newlines', () => {
    const rows = parseCsv('a,b\n"x, y","say ""hi"""\n"line1\nline2",z');
    expect(rows[1]).toEqual(['x, y', 'say "hi"']);
    expect(rows[2]).toEqual(['line1\nline2', 'z']);
  });

  it('handles CRLF, lone CR and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps empty fields and detects semicolons', () => {
    expect(parseCsv('a;b;c\n1;;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('parseCsvRecords', () => {
  it('maps rows to header names and pads short rows', () => {
    const { headers, records } = parseCsvRecords('Date,Name,Reps\n2024-01-01,Squat\n');
    expect(headers).toEqual(['Date', 'Name', 'Reps']);
    expect(records).toEqual([{ Date: '2024-01-01', Name: 'Squat', Reps: '' }]);
  });
});

describe('toCsv', () => {
  it('round-trips awkward values', () => {
    const rows = [['a', 'b'], ['x, y', 'say "hi"'], ['l1\nl2', 3]];
    expect(parseCsv(toCsv(rows))).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['l1\nl2', '3']]);
  });
});
