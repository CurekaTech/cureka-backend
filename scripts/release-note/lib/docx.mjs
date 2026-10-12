import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { flattenChanges } from './validate.mjs';

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 1008;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY = '1F4E79';
const RULE = 'D0D5DD';
const HEADER_FILL = '1F4E79';
const ZEBRAS = ['FFFFFF', 'F7F9FC'];

const thin = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const borders = { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin };

function run(text, options = {}) {
  return new TextRun({
    text: text == null || text === '' ? ' ' : String(text),
    font: options.mono ? 'Consolas' : 'Calibri',
    size: options.size || (options.mono ? 18 : 21),
    bold: Boolean(options.bold),
    color: options.color || '222222',
    italics: Boolean(options.italics),
  });
}

function paragraph(text, options = {}) {
  const lines = String(text ?? '—').split('\n');
  return lines.map((line, index) => new Paragraph({
    heading: options.heading,
    spacing: { before: index === 0 ? options.before || 0 : 0, after: options.after ?? 80 },
    alignment: options.align,
    children: [run(line, options)],
  }));
}

function heading(text, level) {
  const size = level === HeadingLevel.HEADING_1 ? 32 : 26;
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 240, after: 120 },
    border: level === HeadingLevel.HEADING_1
      ? { bottom: { color: NAVY, space: 1, style: BorderStyle.SINGLE, size: 12 } }
      : undefined,
    children: [run(text, { bold: true, size, color: NAVY })],
  });
}

function cell(text, width, options = {}) {
  const lines = String(text ?? '—').split('\n');
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options.header
      ? { type: ShadingType.CLEAR, fill: HEADER_FILL }
      : { type: ShadingType.CLEAR, fill: options.fill || 'FFFFFF' },
    margins: { top: 50, bottom: 50, left: 70, right: 70 },
    verticalAlign: VerticalAlign.CENTER,
    children: lines.map((line) => new Paragraph({
      children: [run(line, {
        bold: options.header || options.bold,
        color: options.header ? 'FFFFFF' : '222222',
        mono: options.mono,
        size: options.header ? 16 : 18,
      })],
    })),
  });
}

function table(headers, rows, widths) {
  const body = rows.length > 0 ? rows : [headers.map(() => '—')];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    borders,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((headerText, index) => cell(headerText, widths[index], { header: true })),
      }),
      ...body.map((row, rowIndex) => new TableRow({
        cantSplit: true,
        children: row.map((value, index) => cell(value, widths[index], { fill: ZEBRAS[rowIndex % 2], mono: index === row.length - 1 && optionsMono(headers[index]) })),
      })),
    ],
  });
}

function optionsMono(header) {
  return /command|range|sha|rollback|health/i.test(header);
}

function linesOf(items, empty) {
  if (!items || items.length === 0) return paragraph(empty);
  return items.flatMap((item) => paragraph(typeof item === 'string' ? item : JSON.stringify(item)));
}

function businessBlocks(summary) {
  if (!summary) {
    return paragraph('No business summary was provided. The Word playbook was still generated. The email draft was not written.');
  }
  const sections = [
    ['Subject', summary.subject],
    ['Introduction', summary.introduction],
    ['Release window', summary.releaseWindow],
    ['Customer impact', summary.customerImpact],
    ['Operations impact', summary.operationsImpact],
    ['Behind the scenes', summary.behindTheScenes],
    ['Decisions needed', summary.decisions],
    ['Not included', summary.excludedChanges],
    ['Known customer impact or downtime', summary.knownCustomerImpact],
    ['Contacts', summary.contacts],
  ];
  return sections.flatMap(([label, text]) => [
    ...paragraph(label, { bold: true, before: 80, after: 40, color: NAVY }),
    ...paragraph(text || 'TBD'),
  ]);
}

export async function renderReleaseDocx(manifest) {
  const changes = flattenChanges(manifest);
  const selected = manifest.repositories.filter((repo) => repo.selected);
  const children = [
    ...paragraph(
      manifest.developmentValidation
        ? 'DEVELOPMENT VALIDATION — not production approval'
        : manifest.example
          ? 'EXAMPLE RELEASE FIXTURE'
          : 'DRAFT FOR REVIEW',
      {
        bold: true,
        size: 18,
        color: '9A3412',
        before: 0,
        after: 40,
      },
    ),
    ...paragraph(manifest.releaseName, { bold: true, size: 40, color: NAVY, after: 40 }),
    ...paragraph(manifest.developmentValidation
      ? 'This playbook documents one pull request merged into development. It is not production deployment approval. It does not deploy code, change Git history, or run migrations.'
      : 'This playbook is documentation. It does not deploy code, change Git history, run migrations, or send email.'),
    heading('Release overview', HeadingLevel.HEADING_1),
    table(
      ['Field', 'Value'],
      [
        ['Release id', manifest.releaseId],
        ['Planned deployment', manifest.plannedDeploymentAt],
        ['Target environment', manifest.targetEnvironment],
        ['Status', manifest.status || 'ready-for-review'],
        ['Dev lead', `${manifest.devLead?.name || 'TBD'} (${manifest.devLead?.email || 'TBD'})`],
        ['QA owner', `${manifest.qaOwner?.name || 'TBD'} (${manifest.qaOwner?.email || 'TBD'})`],
        ['Risk', manifest.risk?.level || 'TBD'],
        ['Version', String(manifest.generation?.version || 'TBD')],
        ['Generated', manifest.generation?.generatedAt || 'TBD'],
      ],
      [2800, CONTENT_WIDTH - 2800],
    ),
    heading('Business summary', HeadingLevel.HEADING_1),
    ...businessBlocks(manifest.businessSummary),
    ...paragraph(manifest.businessSummary
      ? 'Email draft file: business-summary.txt. It has not been sent.'
      : 'Email draft file was not created.'),
    heading('Repository and commit manifest', HeadingLevel.HEADING_1),
    table(
      ['Repository', 'Selected', 'Branches', 'Comparison range'],
      manifest.repositories.map((repo) => [
        repo.id,
        repo.selected ? 'Yes' : 'No',
        repo.selected ? `source ${repo.sourceBranch || 'TBD'}\nproduction ${repo.productionBranch || 'TBD'}` : 'Excluded',
        repo.selected ? (repo.range || 'TBD') : 'Not compared',
      ]),
      [2200, 1200, 3200, CONTENT_WIDTH - 6600],
    ),
    ...selected.flatMap((repo) => [
      heading(repo.id, HeadingLevel.HEADING_2),
      ...paragraph(`Baseline ${repo.baselineSha || 'TBD'}`),
      ...paragraph(`Target ${repo.targetSha || 'TBD'}`),
      ...paragraph(`Uncommitted changes are listed separately and are not part of the commit range.`),
      table(
        ['Commit', 'Subject'],
        (repo.commits || []).map((commit) => [commit.sha, commit.subject]),
        [4200, CONTENT_WIDTH - 4200],
      ),
      ...paragraph(`Uncommitted: ${(repo.uncommittedChanges || []).length === 0 ? 'none recorded' : repo.uncommittedChanges.join('\n')}`, { mono: true }),
    ]),
    heading('Change log', HeadingLevel.HEADING_1),
    ...changes.flatMap((change) => [
      heading(change.summary || change.id, HeadingLevel.HEADING_2),
      ...paragraph(`Repository: ${change.repositoryId || 'TBD'}`),
      ...paragraph(`Commit: ${change.sha || 'TBD'}`, { mono: true }),
      ...paragraph(`Categories: ${(change.categories || []).join(', ') || 'TBD'}`),
      ...paragraph(`Classification source: ${change.categorySource || 'manifest'}. Path-based categories still need a human to read the diff.`),
      table(
        ['Status', 'Path'],
        (change.files || []).map((file) => [file.status || '', file.path || String(file)]),
        [1400, CONTENT_WIDTH - 1400],
      ),
    ]),
    ...(changes.length === 0 ? paragraph('No committed changes were recorded.') : []),
    heading('Risk assessment', HeadingLevel.HEADING_1),
    ...paragraph(`Release risk: ${manifest.risk?.level || 'TBD'}`, { bold: true }),
    ...linesOf(manifest.risk?.reasons, 'No risk reasons recorded.'),
    ...((manifest.approvalDrift || []).length > 0
      ? [
        heading('Previously approved changes that moved', HeadingLevel.HEADING_2),
        table(
          ['Change', 'What happened'],
          manifest.approvalDrift.map((item) => [item.changeId, item.kind]),
          [5200, CONTENT_WIDTH - 5200],
        ),
      ]
      : []),
    heading('Prerequisites', HeadingLevel.HEADING_1),
    ...linesOf(manifest.deployment?.prerequisites, 'TBD'),
    ...paragraph('Unresolved questions'),
    ...linesOf(manifest.unresolvedQuestions, 'None recorded.'),
    heading('Deployment sequence', HeadingLevel.HEADING_1),
    ...paragraph('Commands below are copied from repository documentation for the environment they name. Production steps marked TBD are not invented. Nothing in this document has been executed.'),
    ...(manifest.deployment?.sequence || []).flatMap((step) => [
      heading(`${step.order}. ${step.repositoryId}`, HeadingLevel.HEADING_2),
      ...paragraph(step.instruction || 'TBD'),
      ...paragraph(`Source branch: ${step.sourceBranch || 'TBD'}`),
      ...paragraph(`Production branch: ${step.productionBranch || 'TBD'}`),
      ...paragraph(`Range: ${step.range || 'TBD'}`, { mono: true }),
      ...paragraph('Documented beta commands', { bold: true }),
      ...(step.documentedBetaCommands || []).flatMap((command) => paragraph(command, { mono: true })),
      ...paragraph(`Rollback documentation: ${step.rollback || 'TBD'}`, { mono: true }),
      ...paragraph(`Health check documentation: ${step.health || 'TBD'}`),
      ...linesOf(step.notes, ''),
    ]),
    ...paragraph(`Restart / workers: ${manifest.deployment?.restart || 'TBD'}`),
    heading('Database and configuration changes', HeadingLevel.HEADING_1),
    table(
      ['Migration file', 'Documented commands'],
      (manifest.deployment?.migrations || []).map((migration) => [
        migration.file,
        `apply: ${migration.apply}\nrevert: ${migration.revert}\n${migration.note || ''}`,
      ]),
      [4200, CONTENT_WIDTH - 4200],
    ),
    table(
      ['Environment variable', 'Value'],
      (manifest.deployment?.environmentVariables || []).map((item) => [item.name, 'omitted']),
      [5200, CONTENT_WIDTH - 5200],
    ),
    heading('Cross-repository dependencies', HeadingLevel.HEADING_1),
    table(
      ['Dependency', 'Confirmed', 'Review'],
      (manifest.dependencies || []).map((item) => [
        item.statement || item.id,
        item.confirmed ? 'Yes, from project documentation' : 'No',
        item.review || item.source || 'TBD',
      ]),
      [3600, 1800, CONTENT_WIDTH - 5400],
    ),
    heading('Rollback plan', HeadingLevel.HEADING_1),
    ...paragraph(manifest.deployment?.rollbackLimitations || 'TBD'),
    ...(manifest.deployment?.sequence || []).flatMap((step) => paragraph(`${step.repositoryId}: ${step.rollback || 'TBD'}`, { mono: true })),
    heading('QA checklist', HeadingLevel.HEADING_1),
    ...paragraph('Result, evidence, owner, timestamp, and sign-off stay blank until a person records them.'),
    table(
      ['Area', 'Steps', 'Result', 'Evidence', 'Owner', 'Timestamp', 'Sign-off'],
      (manifest.qaChecklist || []).map((item) => [
        item.area || item.id,
        item.steps || '',
        item.result || '',
        item.evidence || '',
        item.owner || '',
        item.timestamp || '',
        item.signOff || '',
      ]),
      [1300, 2790, 1100, 1200, 1100, 1200, 1200],
    ),
    heading('Known issues', HeadingLevel.HEADING_1),
    ...linesOf(
      (manifest.knownIssues || []).map((issue) => issue.description || issue.summary || JSON.stringify(issue)),
      'No known issues recorded.',
    ),
    ...paragraph('Constraints'),
    ...linesOf(manifest.constraints, 'None recorded.'),
    ...paragraph('Stakeholder decisions'),
    table(
      ['Question', 'Decision', 'Reply by', 'Owner'],
      (manifest.stakeholderDecisions || []).map((item) => [item.question || '', item.decision || 'TBD', item.replyBy || 'TBD', item.owner || 'TBD']),
      [3200, 2890, 1800, 2000],
    ),
    heading('Approvals and sign-off', HeadingLevel.HEADING_1),
    table(
      ['Role', 'Name', 'Status', 'Signed at', 'Notes'],
      (manifest.approvers || []).map((approver) => [
        approver.role,
        approver.name,
        approver.status || 'pending',
        approver.signedAt || '',
        approver.notes || '',
      ]),
      [1800, 2200, 1600, 1800, CONTENT_WIDTH - 7400],
    ),
    ...paragraph('Escalation: use the dev lead and QA owner named in the overview. Additional contacts: TBD.'),
  ];

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 21 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 568, footer: 568 },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [run(`${manifest.releaseId}  ·  draft, not a deploy authorization`, { size: 16, color: '667085', italics: true })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                run('Page ', { size: 16, color: '667085' }),
                new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: '667085' }),
                run(' of ', { size: 16, color: '667085' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 16, color: '667085' }),
              ],
            })],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
