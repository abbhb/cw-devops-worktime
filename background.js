import { DEFAULT_SETTINGS, STORAGE_KEYS, normalizeSettings, truncateJobContent } from './utils.js';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || '未知错误' }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case 'searchWorkItems':
      return searchWorkItems(message.keyword);
    case 'submitBatch':
      return submitBatch(message.payload);
    case 'getSessionStatus':
      return getSessionStatus();
    default:
      throw new Error('不支持的消息类型');
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  return normalizeSettings(stored[STORAGE_KEYS.settings]);
}

async function getSessionStatus() {
  const cookies = await chrome.cookies.getAll({ url: 'https://devops.cwoa.net/' });
  const names = new Set(cookies.map((cookie) => cookie.name));
  return {
    loggedIn: names.has('access_token') || names.has('bk_token') || names.has('twbk_token'),
    cookieCount: cookies.length
  };
}

async function searchWorkItems(keyword) {
  if (!keyword?.trim()) {
    throw new Error('请输入工作项关键词');
  }
  const settings = await getSettings();
  const response = await apiPost(settings.baseUrl, '/ms/vteam/api/user/plugin_man_hour/hour_regist', {
    projectId: [],
    begin: '',
    end: '',
    stateId: [],
    title: keyword.trim(),
    num: 1,
    size: 20
  });
  return response?.data?.records ?? [];
}

async function submitBatch(payload) {
  const settings = normalizeSettings(payload?.settings ?? {});
  validateSettings(settings);

  const workItem = payload?.workItem;
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const missingDates = Array.isArray(payload?.missingDates) ? payload.missingDates : [];
  const startDate = payload?.startDate;
  const endDate = payload?.endDate;
  const keyword = payload?.keyword ?? '';

  if (!workItem?.issueId || !workItem?.projectId) {
    throw new Error('请选择有效的工作项');
  }

  const details = missingDates.map((date) => ({
    date,
    fileName: '',
    status: 'missing',
    message: '缺少对应日期的 Markdown 日报文件'
  }));

  let successCount = 0;
  let failureCount = 0;

  for (const entry of entries) {
    try {
      const result = await apiPost(
        settings.baseUrl,
        `/ms/vteam/api/user/plugin_man_hour/${encodeURIComponent(workItem.projectId)}/${encodeURIComponent(workItem.issueId)}`,
        buildSubmitPayload(workItem, entry, settings)
      );
      successCount += 1;
      details.push({
        date: entry.date,
        fileName: entry.fileName,
        status: 'success',
        message: '填报成功',
        responseId: result?.data?.id ?? ''
      });
    } catch (error) {
      failureCount += 1;
      details.push({
        date: entry.date,
        fileName: entry.fileName,
        status: 'failed',
        message: error.message || '填报失败'
      });
    }
  }

  details.sort((left, right) => left.date.localeCompare(right.date));

  const historyEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    keyword,
    startDate,
    endDate,
    workItem: {
      issueId: workItem.issueId,
      projectId: workItem.projectId,
      number: workItem.number,
      title: workItem.title,
      state: workItem.state,
      typeClassify: workItem.typeClassify
    },
    summary: {
      totalDates: details.length,
      submitted: entries.length,
      missing: missingDates.length,
      success: successCount,
      failure: failureCount
    },
    details
  };

  await persistHistory(historyEntry, settings.historyLimit);
  return historyEntry;
}

function buildSubmitPayload(workItem, entry, settings) {
  return {
    jobContent: truncateJobContent(entry.content),
    manHour: Number(settings.manHour),
    jobDate: entry.date,
    firstHourTypeId: Number(settings.firstHourTypeId),
    secondHourTypeId: Number(settings.secondHourTypeId),
    stepId: Number(settings.stepId),
    productId: settings.productId,
    customerId: settings.customerId,
    productLineId: settings.productLineId,
    projectId: resolveSubmitProjectId(workItem),
    issueId: workItem.issueId,
    issueType: settings.issueType || mapIssueType(workItem.typeClassify),
    estimateManHour: 0,
    surplusManHour: Number(settings.manHour) * -1,
    reviewer: settings.reviewer,
    firstReviewer: settings.firstReviewer,
    status: settings.status || 'PENDING',
    tenantId: settings.tenantId
  };
}

function resolveSubmitProjectId(workItem) {
  const candidates = [
    workItem?.ppmProjectId,
    workItem?.PpmProjectID,
    workItem?.projectGuid,
    workItem?.projectUUID,
    workItem?.projectUuid,
    workItem?.projectId
  ];
  const projectId = candidates.find(isGuid) ?? '';
  if (!projectId && workItem?.projectId) {
    console.warn('Skip non-GUID ERP projectId in submit payload:', workItem.projectId);
  }
  return projectId;
}

function isGuid(value) {
  return GUID_PATTERN.test(String(value ?? '').trim());
}

function mapIssueType(typeClassify) {
  const mapping = {
    TASK: '任务',
    BUG: '缺陷',
    STORY: '需求'
  };
  return mapping[typeClassify] ?? '任务';
}

function validateSettings(settings) {
  const requiredFields = [
    ['reviewer', '请先在配置页填写 reviewer'],
    ['firstReviewer', '请先在配置页填写 firstReviewer'],
    ['productId', '请先在配置页填写 productId'],
    ['productLineId', '请先在配置页填写 productLineId']
  ];

  for (const [field, message] of requiredFields) {
    if (!settings[field]) {
      throw new Error(message);
    }
  }
}

async function persistHistory(historyEntry, historyLimit) {
  const stored = await chrome.storage.local.get({ [STORAGE_KEYS.history]: [] });
  const nextHistory = [historyEntry, ...(stored[STORAGE_KEYS.history] ?? [])].slice(0, historyLimit);
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: nextHistory });
}

async function apiPost(baseUrl, path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(json?.message || json?.msg || `请求失败：${response.status}`);
  }

  const isSuccess = json?.status === 0 || json?.code === 0;
  if (!isSuccess) {
    throw new Error(json?.message || json?.msg || '接口返回失败');
  }

  return json;
}
