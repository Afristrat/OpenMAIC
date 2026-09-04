import PDFDocument from 'pdfkit';

interface ReportMetrics {
  totalLearners: number;
  activeClassrooms: number;
  avgScore: number;
  completionRate: number;
}

interface ReportFormation {
  name: string;
  learner_count: number;
  avg_score: number;
  completion_rate: number;
}

function safeDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
}

export async function createInstitutionalReportPdf(input: {
  organizationName: string;
  dateFrom: string | null;
  dateTo: string | null;
  metrics: ReportMetrics;
  formations: ReportFormation[];
}): Promise<Buffer> {
  const document = new PDFDocument({ size: 'A4', margin: 46, bufferPages: true });
  document.font('Helvetica');

  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });

  document.fillColor('#7c3aed').font('Helvetica-Bold').fontSize(24).text('Qalem');
  document.fillColor('#111827').fontSize(18).text('Rapport institutionnel', { align: 'right' });
  document.moveDown(0.4).font('Helvetica').fontSize(11).fillColor('#4b5563');
  document.text(input.organizationName);
  document.text(`Période : ${safeDate(input.dateFrom ?? '')} au ${safeDate(input.dateTo ?? '')}`);
  document.text(`Généré le ${new Date().toLocaleString('fr-FR')}`);
  document.moveDown(1.4);

  const metricCards = [
    ['Apprenants', input.metrics.totalLearners.toString()],
    ['Classrooms actives', input.metrics.activeClassrooms.toString()],
    ['Score moyen', `${input.metrics.avgScore.toFixed(1)} %`],
    ['Taux de complétion', `${input.metrics.completionRate.toFixed(1)} %`],
  ];
  const cardWidth = 118;
  const cardY = document.y;
  metricCards.forEach(([label, value], index) => {
    const x = 46 + index * (cardWidth + 8);
    document.roundedRect(x, cardY, cardWidth, 58, 6).fillAndStroke('#f5f3ff', '#ddd6fe');
    document
      .fillColor('#6d28d9')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(value, x + 10, cardY + 10, {
        width: cardWidth - 20,
      });
    document
      .fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(8.5)
      .text(label, x + 10, cardY + 35, {
        width: cardWidth - 20,
      });
  });
  document.y = cardY + 78;

  const section = (title: string) => {
    if (document.y > 700) document.addPage();
    document.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text(title);
    document.moveDown(0.5);
  };
  const row = (columns: Array<{ text: string; width: number }>, header = false) => {
    if (document.y > 745) document.addPage();
    const y = document.y;
    if (header) document.rect(46, y - 3, 503, 22).fill('#ede9fe');
    let x = 52;
    document
      .fillColor('#1f2937')
      .font(header ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(header ? 8.5 : 8);
    for (const column of columns) {
      document.text(column.text, x, y + 3, {
        width: column.width,
        ellipsis: true,
        lineBreak: false,
      });
      x += column.width;
    }
    document.y = y + 23;
  };

  section('Résultats par formation');
  row(
    [
      { text: 'Formation', width: 255 },
      { text: 'Apprenants', width: 75 },
      { text: 'Score', width: 70 },
      { text: 'Complétion', width: 90 },
    ],
    true,
  );
  input.formations.forEach((formation) =>
    row([
      { text: formation.name, width: 255 },
      { text: formation.learner_count.toString(), width: 75 },
      { text: `${formation.avg_score.toFixed(1)} %`, width: 70 },
      { text: `${formation.completion_rate.toFixed(1)} %`, width: 90 },
    ]),
  );

  const pageCount = document.bufferedPageRange().count;
  for (let page = 0; page < pageCount; page += 1) {
    document.switchToPage(page);
    document
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6b7280')
      .text(`Qalem — page ${page + 1}/${pageCount}`, 46, 806, { width: 503, align: 'center' });
  }
  document.end();
  return completed;
}
