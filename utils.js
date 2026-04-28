export const STORAGE_KEYS = {
  settings: 'settings',
  history: 'history',
  draft: 'draft'
};

export const DEFAULT_SETTINGS = {
  baseUrl: 'https://devops.cwoa.net',
  reviewer: '',
  firstReviewer: '',
  manHour: 8,
  reportDateStrategy: 'same-day',
  firstHourTypeId: 2,
  secondHourTypeId: 5,
  stepId: 96,
  productId: '7E34F33A-0629-4AC9-92A2-6631BB7BBBB8',
  productLineId: '113B2E2E-9EE4-43DA-B257-F6F56E95387F',
  customerId: '',
  issueType: '任务',
  tenantId: 'Canway',
  status: 'PENDING',
  historyLimit: 50
};

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    manHour: Number(settings.manHour ?? DEFAULT_SETTINGS.manHour),
    reportDateStrategy: normalizeReportDateStrategy(settings.reportDateStrategy),
    firstHourTypeId: Number(settings.firstHourTypeId ?? DEFAULT_SETTINGS.firstHourTypeId),
    secondHourTypeId: Number(settings.secondHourTypeId ?? DEFAULT_SETTINGS.secondHourTypeId),
    stepId: Number(settings.stepId ?? DEFAULT_SETTINGS.stepId),
    historyLimit: Number(settings.historyLimit ?? DEFAULT_SETTINGS.historyLimit)
  };
}

export function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function parseDate(dateString) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function enumerateDates(startDate, endDate) {
  const dates = [];
  if (!startDate || !endDate || startDate > endDate) {
    return dates;
  }
  const cursor = parseDate(startDate);
  const end = parseDate(endDate);
  while (cursor <= end) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function getMonthLabel(dateString) {
  const date = parseDate(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getFileDate(fileName) {
  const normalized = fileName.split('/').pop() ?? '';
  const stem = normalized.replace(/\.[^.]+$/, '');
  return /^\d{4}-\d{2}-\d{2}$/.test(stem) ? stem : '';
}

export function normalizeReportDateStrategy(strategy) {
  return strategy === 'previous-day' ? 'previous-day' : DEFAULT_SETTINGS.reportDateStrategy;
}

export function resolveReportDate(fileDate, strategy = DEFAULT_SETTINGS.reportDateStrategy) {
  const normalizedStrategy = normalizeReportDateStrategy(strategy);
  if (!fileDate) {
    return '';
  }
  if (normalizedStrategy === 'same-day') {
    return fileDate;
  }

  const date = parseDate(fileDate);
  date.setDate(date.getDate() - 1);
  return formatDate(date);
}

export function isMarkdownFile(fileName) {
  return /(?:\.md|\.markdown)$/i.test(fileName) || /^\d{4}-\d{2}-\d{2}$/.test(fileName.split('/').pop() ?? '');
}

export function buildCalendarSections(startDate, endDate, entriesByDate = {}) {
  const allDates = enumerateDates(startDate, endDate);
  if (!allDates.length) {
    return [];
  }

  const first = parseDate(startDate);
  const last = parseDate(endDate);
  const sections = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const finalMonth = new Date(last.getFullYear(), last.getMonth(), 1);

  while (cursor <= finalMonth) {
    const year = cursor.getFullYear();
    const monthIndex = cursor.getMonth();
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    const days = [];

    const leading = (monthStart.getDay() + 6) % 7;
    for (let index = 0; index < leading; index += 1) {
      days.push({ empty: true, key: `empty-start-${year}-${monthIndex}-${index}` });
    }

    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const current = new Date(year, monthIndex, day);
      const dateKey = formatDate(current);
      const inRange = dateKey >= startDate && dateKey <= endDate;
      const entry = entriesByDate[dateKey] ?? null;
      days.push({
        key: dateKey,
        date: dateKey,
        day,
        inRange,
        status: !inRange ? 'out-of-range' : entry ? entry.status : 'missing',
        fileName: entry?.fileName ?? '',
        content: entry?.content ?? '',
        error: entry?.error ?? ''
      });
    }

    while (days.length % 7 !== 0) {
      days.push({ empty: true, key: `empty-end-${year}-${monthIndex}-${days.length}` });
    }

    sections.push({
      key: `${year}-${monthIndex + 1}`,
      title: `${year} 年 ${monthIndex + 1} 月`,
      weekLabels: WEEK_LABELS,
      days
    });

    cursor.setMonth(cursor.getMonth() + 1, 1);
  }

  return sections;
}

export function summarizePreview(startDate, endDate, entriesByDate = {}) {
  const dates = enumerateDates(startDate, endDate);
  const total = dates.length;
  const loaded = dates.filter((date) => Boolean(entriesByDate[date])).length;
  return {
    total,
    loaded,
    missing: total - loaded
  };
}

export function formatDateTime(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

export function createWorkbookXml(sheets) {
  const escape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const renderCell = (value) => `<Cell><Data ss:Type="String">${escape(value)}</Data></Cell>`;
  const renderRow = (row) => `<Row>${row.map(renderCell).join('')}</Row>`;
  const worksheets = sheets.map((sheet) => `
    <Worksheet ss:Name="${escape(sheet.name)}">
      <Table>
        ${sheet.rows.map(renderRow).join('')}
      </Table>
    </Worksheet>`).join('');

  return `<?xml version="1.0"?>
  <?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:html="http://www.w3.org/TR/REC-html40">
    ${worksheets}
  </Workbook>`;
}

export function downloadWorkbook(fileName, sheets) {
  const xml = createWorkbookXml(sheets);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
