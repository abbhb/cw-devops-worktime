import {
  DEFAULT_SETTINGS,
  MAX_JOB_CONTENT_LENGTH,
  STORAGE_KEYS,
  buildCalendarSections,
  downloadWorkbook,
  enumerateDates,
  formatDateTime,
  getFileDate,
  isMarkdownFile,
  normalizeSettings,
  resolveReportDate,
  summarizePreview,
  truncateJobContent
} from './utils.js';

const state = {
  settings: normalizeSettings(DEFAULT_SETTINGS),
  draft: {},
  workItems: [],
  selectedWorkItemId: '',
  preparedEntries: [],
  missingDates: [],
  latestHistoryEntry: null,
  history: []
};

const elements = {
  openOptionsButton: document.getElementById('openOptionsButton'),
  sessionStatus: document.getElementById('sessionStatus'),
  historyCount: document.getElementById('historyCount'),
  tabButtons: Array.from(document.querySelectorAll('.tab-button')),
  reportingTab: document.getElementById('reportingTab'),
  historyTab: document.getElementById('historyTab'),
  keywordInput: document.getElementById('keywordInput'),
  searchButton: document.getElementById('searchButton'),
  searchHint: document.getElementById('searchHint'),
  workItemList: document.getElementById('workItemList'),
  startDateInput: document.getElementById('startDateInput'),
  endDateInput: document.getElementById('endDateInput'),
  folderInput: document.getElementById('folderInput'),
  previewButton: document.getElementById('previewButton'),
  submitButton: document.getElementById('submitButton'),
  previewSummary: document.getElementById('previewSummary'),
  calendarContainer: document.getElementById('calendarContainer'),
  contentPreviewList: document.getElementById('contentPreviewList'),
  latestResult: document.getElementById('latestResult'),
  exportLatestFailuresButton: document.getElementById('exportLatestFailuresButton'),
  refreshHistoryButton: document.getElementById('refreshHistoryButton'),
  historyList: document.getElementById('historyList'),
  workItemTemplate: document.getElementById('workItemTemplate'),
  historyTemplate: document.getElementById('historyTemplate')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadInitialState();
  bindEvents();
  renderSessionStatusPending();
  await refreshSessionStatus();
  renderWorkItems();
  renderHistory();
  renderLatestResult();
}

function bindEvents() {
  elements.openOptionsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());
  elements.tabButtons.forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  elements.searchButton.addEventListener('click', searchWorkItems);
  elements.previewButton.addEventListener('click', preparePreview);
  elements.submitButton.addEventListener('click', submitBatch);
  elements.refreshHistoryButton.addEventListener('click', refreshHistoryFromStorage);
  elements.exportLatestFailuresButton.addEventListener('click', () => {
    if (state.latestHistoryEntry) {
      exportFailures(state.latestHistoryEntry);
    }
  });

  const persistDraft = () => saveDraft();
  elements.keywordInput.addEventListener('input', persistDraft);
  elements.startDateInput.addEventListener('change', persistDraft);
  elements.endDateInput.addEventListener('change', persistDraft);
}

async function loadInitialState() {
  const stored = await chrome.storage.local.get({
    [STORAGE_KEYS.settings]: DEFAULT_SETTINGS,
    [STORAGE_KEYS.draft]: {},
    [STORAGE_KEYS.history]: []
  });

  state.settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
  state.draft = stored[STORAGE_KEYS.draft] ?? {};
  state.history = stored[STORAGE_KEYS.history] ?? [];
  state.latestHistoryEntry = state.history[0] ?? null;

  elements.keywordInput.value = state.draft.keyword ?? '';
  elements.startDateInput.value = state.draft.startDate ?? '';
  elements.endDateInput.value = state.draft.endDate ?? '';
  state.selectedWorkItemId = state.draft.selectedWorkItemId ?? '';
}

async function refreshSessionStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'getSessionStatus' });
  if (!response?.ok) {
    setStatus(elements.sessionStatus, 'status-error', '无法读取登录 Cookie');
    return;
  }
  if (response.result.loggedIn) {
    setStatus(elements.sessionStatus, 'status-success', `已检测到登录 Cookie（${response.result.cookieCount}）`);
  } else {
    setStatus(elements.sessionStatus, 'status-error', '未检测到可用的 DevOps 登录 Cookie，请先在浏览器中登录 cwoa，并打开一次 https://devops.cwoa.net/。');
  }
}

function renderSessionStatusPending() {
  setStatus(elements.sessionStatus, 'status-pending', '检查登录状态中...');
}

function switchTab(tabName) {
  const reportingActive = tabName === 'reporting';
  elements.reportingTab.classList.toggle('active', reportingActive);
  elements.historyTab.classList.toggle('active', !reportingActive);
  elements.tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
}

async function searchWorkItems() {
  const keyword = elements.keywordInput.value.trim();
  if (!keyword) {
    elements.searchHint.textContent = '请输入关键词后再搜索。';
    return;
  }

  setBusy(elements.searchButton, true, '搜索中...');
  elements.searchHint.textContent = '正在从接口加载工作项...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'searchWorkItems', keyword });
    if (!response?.ok) {
      throw new Error(response?.error || '搜索失败');
    }
    state.workItems = response.result;
    if (!state.workItems.some((item) => item.issueId === state.selectedWorkItemId)) {
      state.selectedWorkItemId = state.workItems[0]?.issueId ?? '';
    }
    await saveDraft();
    renderWorkItems();
    elements.searchHint.textContent = state.workItems.length
      ? `已加载 ${state.workItems.length} 个工作项，请选择后继续。`
      : '未搜索到工作项，请调整关键词后重试。';
  } catch (error) {
    elements.searchHint.textContent = error.message || '搜索失败';
  } finally {
    setBusy(elements.searchButton, false, '搜索');
  }
}

function renderWorkItems() {
  elements.workItemList.innerHTML = '';
  if (!state.workItems.length) {
    elements.workItemList.classList.add('empty-state');
    elements.workItemList.textContent = '暂无工作项，请先搜索。';
    return;
  }

  elements.workItemList.classList.remove('empty-state');
  const fragment = document.createDocumentFragment();

  state.workItems.forEach((item) => {
    const template = elements.workItemTemplate.content.cloneNode(true);
    const radio = template.querySelector('input[type="radio"]');
    const title = template.querySelector('.item-title');
    const meta = template.querySelector('.item-meta');

    radio.value = item.issueId;
    radio.checked = item.issueId === state.selectedWorkItemId;
    radio.addEventListener('change', async () => {
      state.selectedWorkItemId = item.issueId;
      await saveDraft();
      renderWorkItems();
    });

    title.textContent = `${item.number} ${item.title}`;
    meta.textContent = `${item.state} ｜ ${item.projectId} ｜ ${item.issueType || item.typeClassify} ｜ 创建人 ${item.createUser}`;
    fragment.appendChild(template);
  });

  elements.workItemList.appendChild(fragment);
}

async function preparePreview() {
  const validationError = validateRange();
  if (validationError) {
    renderPreviewError(validationError);
    return;
  }

  const files = Array.from(elements.folderInput.files ?? []);
  if (!files.length) {
    renderPreviewError('请选择日报文件夹。');
    return;
  }

  setBusy(elements.previewButton, true, '预览生成中...');

  try {
    const { preparedEntries, missingDates, entriesByDate, warnings } = await buildPreparedEntries(files);
    state.preparedEntries = preparedEntries;
    state.missingDates = missingDates;
    renderPreview(entriesByDate, warnings);
    elements.submitButton.disabled = !state.preparedEntries.length || !getSelectedWorkItem();
  } catch (error) {
    renderPreviewError(error.message || '生成预览失败');
  } finally {
    setBusy(elements.previewButton, false, '生成预览');
  }
}

async function buildPreparedEntries(files) {
  const startDate = elements.startDateInput.value;
  const endDate = elements.endDateInput.value;
  const expectedDates = new Set(getRangeDates());
  const candidateMap = new Map();
  const warnings = [];

  files.forEach((file) => {
    if (!isMarkdownFile(file.name)) {
      warnings.push(`已忽略非 Markdown 文件：${file.name}`);
      return;
    }

    const fileDate = getFileDate(file.name);
    if (!fileDate) {
      warnings.push(`已忽略文件名不符合 YYYY-MM-DD 的文件：${file.name}`);
      return;
    }

    const dateKey = resolveReportDate(fileDate, state.settings.reportDateStrategy);

    if (!expectedDates.has(dateKey)) {
      return;
    }

    candidateMap.set(dateKey, file);
  });

  const preparedEntries = [];
  const entriesByDate = {};
  const rangeDates = getRangeDates();

  for (const date of rangeDates) {
    const file = candidateMap.get(date);
    if (!file) {
      continue;
    }
    const content = (await file.text()).trim();
    if (!content) {
      entriesByDate[date] = {
        status: 'failed',
        fileName: file.name,
        content: '',
        error: '文件内容为空'
      };
      warnings.push(`文件内容为空：${file.name}`);
      continue;
    }

    const truncatedContent = truncateJobContent(content);
    if (truncatedContent !== content) {
      warnings.push(`日报内容超过 ${MAX_JOB_CONTENT_LENGTH} 字，已自动截断：${file.name}`);
    }

    const entry = {
      date,
      fileName: file.name,
      content: truncatedContent
    };
    preparedEntries.push(entry);
    entriesByDate[date] = {
      status: 'present',
      fileName: file.name,
      content: truncatedContent
    };
  }

  const missingDates = rangeDates.filter((date) => !entriesByDate[date]);
  return { preparedEntries, missingDates, entriesByDate, warnings };
}

function renderPreview(entriesByDate, warnings) {
  const startDate = elements.startDateInput.value;
  const endDate = elements.endDateInput.value;
  const summary = summarizePreview(startDate, endDate, entriesByDate);

  elements.previewSummary.innerHTML = '';
  [
    ['日期数', summary.total],
    ['已匹配日报', summary.loaded],
    ['缺失日报', summary.missing],
    ['待提交', state.preparedEntries.length]
  ].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    const span = document.createElement('span');
    span.textContent = label;
    card.append(strong, span);
    elements.previewSummary.appendChild(card);
  });

  const calendarSections = buildCalendarSections(startDate, endDate, entriesByDate);
  elements.calendarContainer.innerHTML = '';
  elements.calendarContainer.classList.remove('empty-state');

  calendarSections.forEach((section) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'month-section';
    const title = document.createElement('h3');
    title.textContent = section.title;
    const weekHeader = document.createElement('div');
    weekHeader.className = 'calendar week-header';
    section.weekLabels.forEach((label) => {
      const cell = document.createElement('div');
      cell.className = 'week-label';
      cell.textContent = label;
      weekHeader.appendChild(cell);
    });

    const grid = document.createElement('div');
    grid.className = 'calendar';
    section.days.forEach((day) => {
      const cell = document.createElement('div');
      cell.className = `calendar-cell ${day.empty ? 'calendar-empty' : day.status}`;
      if (day.empty) {
        grid.appendChild(cell);
        return;
      }

      const date = document.createElement('div');
      date.className = 'calendar-date';
      date.textContent = String(day.day);
      cell.appendChild(date);

      if (day.inRange) {
        const badge = document.createElement('span');
        badge.className = `tag ${day.status === 'missing' ? 'tag-error' : 'tag-success'}`;
        badge.textContent = day.status === 'missing' ? '缺失' : '已加载';
        cell.appendChild(badge);
      }

      if (day.fileName) {
        const name = document.createElement('div');
        name.className = 'cell-note';
        name.textContent = day.fileName.split('/').pop() ?? day.fileName;
        cell.appendChild(name);
      }

      if (day.error) {
        const error = document.createElement('div');
        error.className = 'cell-note error-text';
        error.textContent = day.error;
        cell.appendChild(error);
      }

      grid.appendChild(cell);
    });

    wrapper.append(title, weekHeader, grid);
    elements.calendarContainer.appendChild(wrapper);
  });

  renderContentPreviews();
  if (warnings.length) {
    const warningList = document.createElement('div');
    warningList.className = 'warning-box';
    warnings.forEach((warning) => {
      const item = document.createElement('div');
      item.textContent = warning;
      warningList.appendChild(item);
    });
    elements.calendarContainer.prepend(warningList);
  }
}

function renderPreviewError(message) {
  state.preparedEntries = [];
  state.missingDates = [];
  elements.submitButton.disabled = true;
  elements.previewSummary.innerHTML = '';
  elements.contentPreviewList.innerHTML = '';
  elements.calendarContainer.className = 'calendar-container empty-state';
  elements.calendarContainer.textContent = message;
}

function renderContentPreviews() {
  elements.contentPreviewList.innerHTML = '';
  if (!state.preparedEntries.length) {
    elements.contentPreviewList.className = 'content-preview-list empty-state';
    elements.contentPreviewList.textContent = '当前日期范围内没有可提交的日报内容。';
    return;
  }

  elements.contentPreviewList.className = 'content-preview-list';
  state.preparedEntries.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'content-card';
    const title = document.createElement('div');
    title.className = 'inline-row between wrap';
    const date = document.createElement('strong');
    date.textContent = entry.date;
    const fileName = document.createElement('span');
    fileName.className = 'subtle';
    fileName.textContent = entry.fileName;
    title.append(date, fileName);

    const preview = document.createElement('pre');
    preview.textContent = entry.content;
    card.append(title, preview);
    elements.contentPreviewList.appendChild(card);
  });
}

async function submitBatch() {
  const workItem = getSelectedWorkItem();
  if (!workItem) {
    renderLatestResultMessage('请先搜索并选择工作项。');
    return;
  }
  if (!state.preparedEntries.length) {
    renderLatestResultMessage('请先生成预览，确认日报文件完整后再填报。');
    return;
  }

  setBusy(elements.submitButton, true, '提交中...');
  renderLatestResultMessage('正在批量填报，请稍候...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'submitBatch',
      payload: {
        settings: state.settings,
        keyword: elements.keywordInput.value.trim(),
        startDate: elements.startDateInput.value,
        endDate: elements.endDateInput.value,
        workItem,
        entries: state.preparedEntries,
        missingDates: state.missingDates
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || '批量填报失败');
    }

    state.latestHistoryEntry = response.result;
    await refreshHistoryFromStorage();
    renderLatestResult();
    switchTab('history');
  } catch (error) {
    renderLatestResultMessage(error.message || '批量填报失败');
  } finally {
    setBusy(elements.submitButton, false, '开始填报');
  }
}

async function refreshHistoryFromStorage() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEYS.history]: [] });
  state.history = stored[STORAGE_KEYS.history] ?? [];
  state.latestHistoryEntry = state.history[0] ?? state.latestHistoryEntry;
  renderHistory();
  renderLatestResult();
}

function renderLatestResult() {
  if (!state.latestHistoryEntry) {
    renderLatestResultMessage('暂无执行结果。');
    elements.exportLatestFailuresButton.disabled = true;
    return;
  }

  elements.exportLatestFailuresButton.disabled = state.latestHistoryEntry.summary.failure === 0 && state.latestHistoryEntry.summary.missing === 0;
  elements.latestResult.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'result-box';
  wrapper.appendChild(buildSummaryChips(state.latestHistoryEntry));

  const list = document.createElement('div');
  list.className = 'detail-list';
  state.latestHistoryEntry.details.forEach((detail) => {
    list.appendChild(buildDetailRow(detail));
  });
  wrapper.appendChild(list);
  elements.latestResult.appendChild(wrapper);
}

function renderLatestResultMessage(message) {
  elements.latestResult.className = 'empty-state';
  elements.latestResult.textContent = message;
}

function renderHistory() {
  elements.historyCount.textContent = `已保存 ${state.history.length} 次记录`;
  elements.historyList.innerHTML = '';
  if (!state.history.length) {
    elements.historyList.className = 'history-list empty-state';
    elements.historyList.textContent = '暂无历史记录。';
    return;
  }

  elements.historyList.className = 'history-list';
  const fragment = document.createDocumentFragment();

  state.history.forEach((entry) => {
    const template = elements.historyTemplate.content.cloneNode(true);
    template.querySelector('.history-title').textContent = `${entry.workItem.number} ${entry.workItem.title}`;
    template.querySelector('.history-meta').textContent = `${formatDateTime(entry.createdAt)} ｜ ${entry.startDate} ~ ${entry.endDate}`;
    template.querySelector('.history-summary').appendChild(buildSummaryChips(entry));

    const details = template.querySelector('.history-details');
    entry.details.forEach((detail) => details.appendChild(buildDetailRow(detail)));

    const exportButton = template.querySelector('.export-history-button');
    exportButton.disabled = entry.summary.failure === 0 && entry.summary.missing === 0;
    exportButton.addEventListener('click', () => exportFailures(entry));

    fragment.appendChild(template);
  });

  elements.historyList.appendChild(fragment);
}

function buildSummaryChips(entry) {
  const container = document.createElement('div');
  container.className = 'summary-chip-row';
  [
    ['成功', entry.summary.success, 'success'],
    ['失败', entry.summary.failure, 'error'],
    ['缺失', entry.summary.missing, 'warning'],
    ['已提交', entry.summary.submitted, 'default']
  ].forEach(([label, value, type]) => {
    const chip = document.createElement('span');
    chip.className = `metric-chip ${type}`;
    chip.textContent = `${label} ${value}`;
    container.appendChild(chip);
  });
  return container;
}

function buildDetailRow(detail) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  const left = document.createElement('div');
  const date = document.createElement('strong');
  date.textContent = detail.date;
  const fileName = document.createElement('div');
  fileName.className = 'subtle';
  fileName.textContent = detail.fileName || '无文件';
  left.append(date, fileName);

  const right = document.createElement('div');
  right.className = `detail-status ${detail.status}`;
  right.textContent = detail.message;

  row.append(left, right);
  return row;
}

function exportFailures(entry) {
  const failedRows = entry.details.filter((detail) => detail.status === 'failed' || detail.status === 'missing');
  if (!failedRows.length) {
    return;
  }

  downloadWorkbook(`cw-devops-failures-${entry.createdAt.replace(/[:.]/g, '-')}.xls`, [
    {
      name: '失败结果',
      rows: [
        ['执行时间', formatDateTime(entry.createdAt)],
        ['工作项', `${entry.workItem.number} ${entry.workItem.title}`],
        ['日期范围', `${entry.startDate} ~ ${entry.endDate}`],
        [],
        ['日期', '状态', '文件名', '原因']
      ].concat(failedRows.map((detail) => [detail.date, detail.status, detail.fileName, detail.message]))
    }
  ]);
}

function getSelectedWorkItem() {
  return state.workItems.find((item) => item.issueId === state.selectedWorkItemId) ?? null;
}

function validateRange() {
  const startDate = elements.startDateInput.value;
  const endDate = elements.endDateInput.value;
  if (!startDate || !endDate) {
    return '请选择开始日期与结束日期。';
  }
  if (startDate > endDate) {
    return '开始日期不能晚于结束日期。';
  }
  return '';
}

function getRangeDates() {
  const startDate = elements.startDateInput.value;
  const endDate = elements.endDateInput.value;
  return enumerateDates(startDate, endDate);
}

async function saveDraft() {
  const draft = {
    keyword: elements.keywordInput.value.trim(),
    startDate: elements.startDateInput.value,
    endDate: elements.endDateInput.value,
    selectedWorkItemId: state.selectedWorkItemId
  };
  state.draft = draft;
  await chrome.storage.local.set({ [STORAGE_KEYS.draft]: draft });
}

function setBusy(button, busy, busyText) {
  if (!button.dataset.idleText) {
    button.dataset.idleText = button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.idleText;
}

function setStatus(element, className, text) {
  element.className = `status-pill ${className}`;
  element.textContent = text;
}
