import { auditSubjectFields, mergeAuditSubject } from './audit-subject.util';

describe('audit subject snapshot', () => {
  it('stores the name beside the id and ref id', () => {
    expect(
      auditSubjectFields({
        name: '  Test Serum  ',
        id: '622a339b-ebc0-4361-a44e-3edc8df28d38',
        refId: 'TES2026380319',
      }),
    ).toEqual({
      subjectName: 'Test Serum',
      subjectId: '622a339b-ebc0-4361-a44e-3edc8df28d38',
      subjectRefId: 'TES2026380319',
      subjectLabel: 'Test Serum · TES2026380319',
    });
  });

  it('keeps the action details and does not drop them when a name is added', () => {
    expect(
      mergeAuditSubject({ from: 'rejected', to: 'published' }, { name: 'Test Serum', refId: 'TES2026380319' }),
    ).toMatchObject({
      from: 'rejected',
      to: 'published',
      subjectName: 'Test Serum',
      subjectLabel: 'Test Serum · TES2026380319',
    });
  });
});
