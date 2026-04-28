import { DEFAULT_SETTINGS, STORAGE_KEYS, normalizeSettings } from './utils.js';

const form = document.getElementById('settingsForm');
const saveStatus = document.getElementById('saveStatus');
const resetButton = document.getElementById('resetButton');

const fields = {
  reviewer: document.getElementById('reviewerInput'),
  firstReviewer: document.getElementById('firstReviewerInput'),
  manHour: document.getElementById('manHourInput'),
  reportDateStrategy: document.getElementById('reportDateStrategyInput'),
  issueType: document.getElementById('issueTypeInput'),
  firstHourTypeId: document.getElementById('firstHourTypeIdInput'),
  secondHourTypeId: document.getElementById('secondHourTypeIdInput'),
  stepId: document.getElementById('stepIdInput'),
  productId: document.getElementById('productIdInput'),
  productLineId: document.getElementById('productLineIdInput'),
  customerId: document.getElementById('customerIdInput'),
  tenantId: document.getElementById('tenantIdInput'),
  status: document.getElementById('statusInput'),
  baseUrl: document.getElementById('baseUrlInput'),
  historyLimit: document.getElementById('historyLimitInput')
};

document.addEventListener('DOMContentLoaded', loadSettings);
form.addEventListener('submit', saveSettings);
resetButton.addEventListener('click', resetSettings);

async function loadSettings() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  fillForm(normalizeSettings(stored[STORAGE_KEYS.settings]));
}

function fillForm(settings) {
  Object.entries(fields).forEach(([key, input]) => {
    input.value = settings[key] ?? '';
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = normalizeSettings({
    reviewer: fields.reviewer.value.trim(),
    firstReviewer: fields.firstReviewer.value.trim(),
    manHour: fields.manHour.value,
    reportDateStrategy: fields.reportDateStrategy.value,
    issueType: fields.issueType.value.trim(),
    firstHourTypeId: fields.firstHourTypeId.value,
    secondHourTypeId: fields.secondHourTypeId.value,
    stepId: fields.stepId.value,
    productId: fields.productId.value.trim(),
    productLineId: fields.productLineId.value.trim(),
    customerId: fields.customerId.value.trim(),
    tenantId: fields.tenantId.value.trim(),
    status: fields.status.value.trim(),
    baseUrl: fields.baseUrl.value.trim(),
    historyLimit: fields.historyLimit.value
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
  saveStatus.textContent = '配置已保存。';
}

async function resetSettings() {
  fillForm(DEFAULT_SETTINGS);
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  saveStatus.textContent = '已恢复默认配置。';
}
