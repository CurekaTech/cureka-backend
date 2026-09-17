import { mapMasterFaqs, normalizeMasterFaqs } from './master-faq.util';

describe('master-faq.util sequence', () => {
  it('assigns sequence from array index when omitted', () => {
    expect(
      normalizeMasterFaqs([
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
      ]),
    ).toEqual([
      { question: 'Q1', answer: 'A1', sequence: 0 },
      { question: 'Q2', answer: 'A2', sequence: 1 },
    ]);
  });

  it('sorts by explicit sequence on read', () => {
    expect(
      mapMasterFaqs([
        { question: 'Second', answer: 'B', sequence: 10 },
        { question: 'First', answer: 'A', sequence: 2 },
      ]),
    ).toEqual([
      { question: 'First', answer: 'A', sequence: 2 },
      { question: 'Second', answer: 'B', sequence: 10 },
    ]);
  });

  it('treats legacy items without sequence as index 0 then stable order', () => {
    expect(
      mapMasterFaqs([
        { question: 'Legacy', answer: 'L' },
        { question: 'Ordered', answer: 'O', sequence: 5 },
      ]),
    ).toEqual([
      { question: 'Legacy', answer: 'L', sequence: 0 },
      { question: 'Ordered', answer: 'O', sequence: 5 },
    ]);
  });
});
