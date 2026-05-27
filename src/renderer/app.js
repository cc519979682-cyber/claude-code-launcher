const { Terminal } = window;
const { FitAddon } = window.FitAddon;
const MIN_TERMINAL_COLS = 100;
const MIN_WINDOW_HEIGHT = 560;

const state = {
  providers: [],
  settings: {},
  providerStatus: {},
  selectedMode: 'new',
  selectedSessionId: '',
  selectedSession: null,
  running: false,
  editingProviderId: ''
};

const elements = {
  providerSelect: document.querySelector('#providerSelect'),
  providerHint: document.querySelector('#providerHint'),
  modelSelect: document.querySelector('#modelSelect'),
  providerManageButton: document.querySelector('#providerManageButton'),
  projectButton: document.querySelector('#projectButton'),
  projectPath: document.querySelector('#projectPath'),
  recentProjects: document.querySelector('#recentProjects'),
  showAllSessions: document.querySelector('#showAllSessions'),
  sessionList: document.querySelector('#sessionList'),
  startButton: document.querySelector('#startButton'),
  stopButton: document.querySelector('#stopButton'),
  restartButton: document.querySelector('#restartButton'),
  statusText: document.querySelector('#statusText'),
  terminalMeta: document.querySelector('#terminalMeta'),
  clearTerminalButton: document.querySelector('#clearTerminalButton'),
  providerDialog: document.querySelector('#providerDialog'),
  providerEditorList: document.querySelector('#providerEditorList'),
  providerNameInput: document.querySelector('#providerNameInput'),
  providerBaseUrlInput: document.querySelector('#providerBaseUrlInput'),
  providerAuthTypeInput: document.querySelector('#providerAuthTypeInput'),
  providerEnvInput: document.querySelector('#providerEnvInput'),
  providerModelsInput: document.querySelector('#providerModelsInput'),
  providerDefaultModelInput: document.querySelector('#providerDefaultModelInput'),
  providerHaikuModelInput: document.querySelector('#providerHaikuModelInput'),
  providerSubagentModelInput: document.querySelector('#providerSubagentModelInput'),
  providerTestResult: document.querySelector('#providerTestResult'),
  newProviderButton: document.querySelector('#newProviderButton'),
  deleteProviderButton: document.querySelector('#deleteProviderButton'),
  testProviderButton: document.querySelector('#testProviderButton'),
  saveProvidersButton: document.querySelector('#saveProvidersButton'),
  resetProvidersButton: document.querySelector('#resetProvidersButton')
};

const term = new Terminal({
  cursorBlink: true,
  convertEol: true,
  fontFamily: 'Cascadia Mono, Consolas, monospace',
  fontSize: 16,
  theme: {
    background: '#111318',
    foreground: '#e8edf2',
    cursor: '#f7d774',
    black: '#6f7683',
    brightBlack: '#aeb6c3',
    selectionBackground: '#334155',
    selectionForeground: '#ffffff'
  }
});
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.querySelector('#terminal'));
fitTerminal();
updateMinimumWindowSize();

window.launcher.onTerminalData((data) => term.write(data));
window.launcher.onTerminalExit(() => setRunning(false));
term.onData((data) => {
  if (state.running) window.launcher.writeTerminal(data);
});

function fitTerminal() {
  fitAddon.fit();
  window.launcher.resizeClaude({ cols: term.cols, rows: term.rows }).catch(() => {});
}

function terminalCellWidth() {
  const cellWidth = term._core?._renderService?.dimensions?.css?.cell?.width;
  if (cellWidth && Number.isFinite(cellWidth)) return cellWidth;

  const probe = document.createElement('span');
  probe.textContent = 'M'.repeat(MIN_TERMINAL_COLS);
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'pre';
  probe.style.font = '16px "Cascadia Mono", Consolas, monospace';
  document.body.append(probe);
  const measured = probe.getBoundingClientRect().width / MIN_TERMINAL_COLS;
  probe.remove();
  return measured || 8.5;
}

function horizontalPadding(element) {
  const style = getComputedStyle(element);
  return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
}

function updateMinimumWindowSize() {
  const sidebar = document.querySelector('.sidebar');
  const terminal = document.querySelector('#terminal');
  const sidebarWidth = sidebar?.getBoundingClientRect().width || 360;
  const terminalPadding = terminal ? horizontalPadding(terminal) : 20;
  const chromeDelta = Math.max(0, window.outerWidth - window.innerWidth);
  const minTerminalWidth = Math.ceil(MIN_TERMINAL_COLS * terminalCellWidth() + terminalPadding + 36);
  const minContentWidth = Math.ceil(sidebarWidth + minTerminalWidth + 2);
  window.launcher
    .setMinimumSize({ width: minContentWidth + chromeDelta, height: MIN_WINDOW_HEIGHT })
    .catch(() => {});
}

let fitTimer = 0;
function scheduleTerminalFit() {
  fitTerminal();
  updateMinimumWindowSize();
  window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(() => {
    updateMinimumWindowSize();
    fitTerminal();
  }, 160);
}

window.addEventListener('resize', scheduleTerminalFit);

if ('ResizeObserver' in window) {
  const observer = new ResizeObserver(scheduleTerminalFit);
  observer.observe(document.querySelector('.terminal-pane'));
  observer.observe(document.querySelector('#terminal'));
}

function providerById(id) {
  return state.providers.find((provider) => provider.id === id) || state.providers[0];
}

function currentProvider() {
  return providerById(elements.providerSelect.value);
}

function modelList(provider) {
  const models = Array.isArray(provider.models) ? provider.models : [];
  return models.length ? models : [provider.defaultModel].filter(Boolean);
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function setRunning(running) {
  state.running = running;
  elements.startButton.disabled = running || !canStart();
  elements.stopButton.disabled = !running;
  elements.restartButton.disabled = !running;
}

function canStart() {
  const provider = currentProvider();
  if (!provider) return false;
  const status = state.providerStatus[provider.id];
  return Boolean(status && status.hasKey && state.settings.selectedProject);
}

function renderProviders() {
  elements.providerSelect.innerHTML = '';
  for (const provider of state.providers) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.name;
    elements.providerSelect.append(option);
  }
  elements.providerSelect.value = state.settings.selectedProviderId || state.providers[0]?.id || '';
  renderModels();
  renderProviderHint();
}

function renderModels() {
  const provider = currentProvider();
  elements.modelSelect.innerHTML = '';
  if (!provider) return;
  for (const model of modelList(provider)) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    elements.modelSelect.append(option);
  }
  const preferred = state.settings.selectedModel || provider.defaultModel;
  elements.modelSelect.value = modelList(provider).includes(preferred) ? preferred : provider.defaultModel;
}

function renderProviderHint() {
  const provider = currentProvider();
  if (!provider) {
    elements.providerHint.textContent = '还没有服务商配置。';
    return;
  }
  const status = state.providerStatus[provider.id];
  elements.providerHint.textContent = status?.hasKey
    ? `已读取密钥环境变量：${provider.apiKeyEnv}`
    : `缺少密钥环境变量：${provider.apiKeyEnv}`;
  setRunning(state.running);
}

function renderProject() {
  elements.projectPath.textContent = state.settings.selectedProject || '还没有选择项目文件夹';
  elements.recentProjects.innerHTML = '';
  const recent = state.settings.recentProjects || [];
  if (!recent.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = '暂无最近项目';
    elements.recentProjects.append(empty);
    return;
  }
  for (const project of recent) {
    const button = document.createElement('button');
    button.className = 'recent-item';
    button.textContent = project;
    button.title = project;
    button.addEventListener('click', async () => {
      state.settings.selectedProject = project;
      state.settings.recentProjects = [project, ...recent.filter((item) => item !== project)].slice(0, 10);
      state.settings = await window.launcher.saveSettings(state.settings);
      renderProject();
      refreshSessions();
    });
    elements.recentProjects.append(button);
  }
}

function renderModes() {
  document.querySelectorAll('.mode-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.selectedMode);
  });
}

function formatTime(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

async function refreshSessions() {
  const sessions = await window.launcher.listSessions({
    projectPath: state.settings.selectedProject,
    showAll: elements.showAllSessions.checked
  });
  elements.sessionList.innerHTML = '';
  state.selectedSessionId = sessions[0]?.sessionId || '';
  state.selectedSession = sessions[0] || null;
  if (state.selectedMode !== 'resume') {
    return;
  }
  if (!sessions.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = elements.showAllSessions.checked ? '没有找到历史对话。' : '这个项目还没有历史对话，建议新建对话。';
    elements.sessionList.append(empty);
    return;
  }
  for (const session of sessions) {
    const button = document.createElement('button');
    button.className = 'session-item';
    if (session.sessionId === state.selectedSessionId) button.classList.add('active');
    button.innerHTML = `
      <div class="session-title"></div>
      <div class="session-meta"></div>
      <div class="session-meta"></div>
    `;
    button.querySelector('.session-title').textContent = session.title;
    button.querySelectorAll('.session-meta')[0].textContent = `${formatTime(session.activityTime || session.lastTimestamp)} · ${session.model || '未知模型'}`;
    button.querySelectorAll('.session-meta')[1].textContent = session.projectPath || '未知项目';
    button.addEventListener('click', async () => {
      state.selectedSessionId = session.sessionId;
      state.selectedSession = session;
      document.querySelectorAll('.session-item').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      if (session.projectPath && session.projectPath !== state.settings.selectedProject) {
        state.settings.selectedProject = session.projectPath;
        state.settings.recentProjects = [
          session.projectPath,
          ...(state.settings.recentProjects || []).filter((item) => item !== session.projectPath)
        ].slice(0, 10);
        state.settings = await window.launcher.saveSettings(state.settings);
        renderProject();
        setStatus(`已选择历史会话，将从项目目录启动：${session.projectPath}`);
      }
    });
    elements.sessionList.append(button);
  }
}

function selectedLaunchMode() {
  return state.selectedMode;
}

async function startClaude() {
  const provider = currentProvider();
  if (!provider) return;
  if (!canStart()) {
    setStatus('请先选择项目，并确认当前服务商密钥已经设置。');
    return;
  }
  if (state.selectedMode === 'resume' && !state.selectedSessionId) {
    setStatus('请选择一个历史对话，或者切换到新建对话。');
    return;
  }
  const launchProjectPath =
    state.selectedMode === 'resume' && state.selectedSession?.projectPath
      ? state.selectedSession.projectPath
      : state.settings.selectedProject;
  term.clear();
  setStatus('正在启动 Claude Code...');
  elements.terminalMeta.textContent = `${provider.name} · ${elements.modelSelect.value} · ${launchProjectPath}`;
  try {
    await window.launcher.startClaude({
      providerId: provider.id,
      model: elements.modelSelect.value,
      projectPath: launchProjectPath,
      mode: selectedLaunchMode(),
      sessionId: state.selectedSessionId,
      cols: term.cols,
      rows: term.rows
    });
    state.settings.selectedProviderId = provider.id;
    state.settings.selectedModel = elements.modelSelect.value;
    state.settings.selectedProject = launchProjectPath;
    state.settings.recentProjects = [
      launchProjectPath,
      ...(state.settings.recentProjects || []).filter((item) => item !== launchProjectPath)
    ].slice(0, 10);
    state.settings = await window.launcher.saveSettings(state.settings);
    renderProject();
    setRunning(true);
    setStatus('Claude Code 正在运行');
  } catch (error) {
    setRunning(false);
    setStatus(error.message || String(error));
  }
}

async function stopClaude() {
  await window.launcher.stopClaude();
  setRunning(false);
  setStatus('已停止');
}

async function restartClaude() {
  await stopClaude();
  await startClaude();
}

function providerDraftFromForm() {
  const id = state.editingProviderId || slugify(elements.providerNameInput.value);
  const models = elements.providerModelsInput.value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    id,
    name: elements.providerNameInput.value.trim(),
    baseUrl: elements.providerBaseUrlInput.value.trim(),
    authType: elements.providerAuthTypeInput.value,
    apiKeyEnv: elements.providerEnvInput.value.trim(),
    models,
    defaultModel: elements.providerDefaultModelInput.value.trim() || models[0] || '',
    haikuModel: elements.providerHaikuModelInput.value.trim() || elements.providerDefaultModelInput.value.trim() || models[0] || '',
    subagentModel: elements.providerSubagentModelInput.value.trim() || elements.providerHaikuModelInput.value.trim() || elements.providerDefaultModelInput.value.trim() || models[0] || '',
    extraEnv: {}
  };
}

function slugify(value) {
  return String(value || 'provider')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `provider-${Date.now()}`;
}

function renderProviderEditor() {
  elements.providerEditorList.innerHTML = '';
  for (const provider of state.providers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'provider-editor-item';
    button.textContent = provider.name;
    if (provider.id === state.editingProviderId) button.classList.add('active');
    button.addEventListener('click', () => editProvider(provider.id));
    elements.providerEditorList.append(button);
  }
}

function editProvider(providerId) {
  const provider = providerById(providerId);
  if (!provider) return;
  state.editingProviderId = provider.id;
  elements.providerNameInput.value = provider.name || '';
  elements.providerBaseUrlInput.value = provider.baseUrl || '';
  elements.providerAuthTypeInput.value = provider.authType || 'apiKey';
  elements.providerEnvInput.value = provider.apiKeyEnv || '';
  elements.providerModelsInput.value = modelList(provider).join('\n');
  elements.providerDefaultModelInput.value = provider.defaultModel || '';
  elements.providerHaikuModelInput.value = provider.haikuModel || '';
  elements.providerSubagentModelInput.value = provider.subagentModel || '';
  elements.providerTestResult.textContent = '';
  renderProviderEditor();
}

function saveProviderFormToState() {
  const draft = providerDraftFromForm();
  const index = state.providers.findIndex((provider) => provider.id === draft.id);
  if (index >= 0) state.providers[index] = { ...state.providers[index], ...draft };
  else state.providers.push(draft);
  state.editingProviderId = draft.id;
}

async function reloadInitialData() {
  const data = await window.launcher.getInitialData();
  state.providers = data.providers;
  state.settings = data.settings;
  state.providerStatus = data.providerStatus;
  renderProviders();
  renderProject();
  renderModes();
  await refreshSessions();
  setRunning(false);
}

elements.providerSelect.addEventListener('change', async () => {
  const provider = currentProvider();
  state.settings.selectedProviderId = provider.id;
  state.settings.selectedModel = provider.defaultModel;
  await window.launcher.saveSettings(state.settings);
  renderModels();
  renderProviderHint();
});

elements.modelSelect.addEventListener('change', async () => {
  state.settings.selectedModel = elements.modelSelect.value;
  await window.launcher.saveSettings(state.settings);
});

elements.projectButton.addEventListener('click', async () => {
  const result = await window.launcher.selectProject();
  if (!result) return;
  state.settings = result.settings;
  renderProject();
  await refreshSessions();
});

elements.showAllSessions.addEventListener('change', refreshSessions);

document.querySelectorAll('.mode-button').forEach((button) => {
  button.addEventListener('click', async () => {
    state.selectedMode = button.dataset.mode;
    renderModes();
    await refreshSessions();
  });
});

elements.startButton.addEventListener('click', startClaude);
elements.stopButton.addEventListener('click', stopClaude);
elements.restartButton.addEventListener('click', restartClaude);
elements.clearTerminalButton.addEventListener('click', () => term.clear());

elements.providerManageButton.addEventListener('click', () => {
  state.editingProviderId = elements.providerSelect.value || state.providers[0]?.id || '';
  renderProviderEditor();
  editProvider(state.editingProviderId);
  elements.providerDialog.showModal();
});

elements.newProviderButton.addEventListener('click', () => {
  state.editingProviderId = '';
  elements.providerNameInput.value = '';
  elements.providerBaseUrlInput.value = '';
  elements.providerAuthTypeInput.value = 'apiKey';
  elements.providerEnvInput.value = '';
  elements.providerModelsInput.value = '';
  elements.providerDefaultModelInput.value = '';
  elements.providerHaikuModelInput.value = '';
  elements.providerSubagentModelInput.value = '';
  elements.providerTestResult.textContent = '填写完成后请先测试连接。';
  renderProviderEditor();
});

elements.deleteProviderButton.addEventListener('click', () => {
  if (!state.editingProviderId) return;
  state.providers = state.providers.filter((provider) => provider.id !== state.editingProviderId);
  state.editingProviderId = state.providers[0]?.id || '';
  renderProviderEditor();
  if (state.editingProviderId) editProvider(state.editingProviderId);
});

elements.testProviderButton.addEventListener('click', async () => {
  const draft = providerDraftFromForm();
  elements.providerTestResult.textContent = '正在测试...';
  const result = await window.launcher.testProvider({ provider: draft, model: draft.defaultModel });
  elements.providerTestResult.textContent = result.message;
});

elements.saveProvidersButton.addEventListener('click', async () => {
  saveProviderFormToState();
  state.providers = await window.launcher.saveProviders(state.providers);
  elements.providerDialog.close();
  await reloadInitialData();
});

elements.resetProvidersButton.addEventListener('click', async () => {
  state.providers = await window.launcher.resetProviders();
  state.editingProviderId = state.providers[0]?.id || '';
  renderProviderEditor();
  editProvider(state.editingProviderId);
});

reloadInitialData();
