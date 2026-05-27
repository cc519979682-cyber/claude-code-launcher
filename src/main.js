const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

let pty;
try {
  pty = require('@homebridge/node-pty-prebuilt-multiarch');
} catch (error) {
  pty = require('node-pty');
}

const appRoot = path.resolve(__dirname, '..');
const configDir = path.join(appRoot, 'config');
const providersPath = path.join(configDir, 'providers.json');
const settingsPath = path.join(configDir, 'settings.json');
const claudeCmd = 'D:\\ClaudeCode\\claude.cmd';
const gitBashPath = 'D:\\Git\\bin\\bash.exe';
const claudeHome = path.join(app.getPath('home'), '.claude');
const projectsDir = path.join(claudeHome, 'projects');
const historyPath = path.join(claudeHome, 'history.jsonl');
const fallbackMinWidth = 980;
const fallbackMinHeight = 560;

const defaultProviders = [
  {
    id: 'mimo',
    name: 'Mimo',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    authType: 'apiKey',
    apiKeyEnv: 'MIMO_API_KEY',
    defaultModel: 'mimo-v2.5-pro',
    haikuModel: 'mimo-v2.5',
    subagentModel: 'mimo-v2.5',
    models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-pro'],
    extraEnv: {
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1'
    }
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    authType: 'authToken',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-v4-pro[1m]',
    haikuModel: 'deepseek-v4-flash',
    subagentModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-pro[1m]', 'deepseek-v4-flash'],
    extraEnv: {
      CLAUDE_CODE_EFFORT_LEVEL: 'max'
    }
  }
];

const defaultSettings = {
  selectedProviderId: 'mimo',
  selectedModel: 'mimo-v2.5-pro',
  selectedProject: app.getPath('home'),
  recentProjects: []
};

let mainWindow;
let currentProcess = null;

function ensureConfig() {
  fs.mkdirSync(configDir, { recursive: true });
  if (!fs.existsSync(providersPath)) {
    writeJson(providersPath, defaultProviders);
  }
  if (!fs.existsSync(settingsPath)) {
    writeJson(settingsPath, defaultSettings);
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeProvider(provider) {
  return {
    id: String(provider.id || '').trim(),
    name: String(provider.name || '').trim(),
    baseUrl: String(provider.baseUrl || '').trim().replace(/\/+$/, ''),
    authType: provider.authType === 'authToken' ? 'authToken' : 'apiKey',
    apiKeyEnv: String(provider.apiKeyEnv || '').trim(),
    defaultModel: String(provider.defaultModel || '').trim(),
    haikuModel: String(provider.haikuModel || provider.defaultModel || '').trim(),
    subagentModel: String(provider.subagentModel || provider.haikuModel || provider.defaultModel || '').trim(),
    models: Array.isArray(provider.models)
      ? [...new Set(provider.models.map((model) => String(model).trim()).filter(Boolean))]
      : [],
    extraEnv: provider.extraEnv && typeof provider.extraEnv === 'object' ? provider.extraEnv : {}
  };
}

function getProviders() {
  const providers = readJson(providersPath, defaultProviders);
  return providers.map(normalizeProvider).filter((provider) => provider.id && provider.name && provider.baseUrl);
}

function getSettings() {
  return { ...defaultSettings, ...readJson(settingsPath, defaultSettings) };
}

function getProviderStatus(providers) {
  return providers.reduce((status, provider) => {
    status[provider.id] = {
      hasKey: Boolean(envValue(provider.apiKeyEnv)),
      apiKeyEnv: provider.apiKeyEnv
    };
    return status;
  }, {});
}

function envValue(name) {
  if (process.env[name]) return process.env[name];
  if (process.platform !== 'win32') return '';
  try {
    const output = execFileSync('reg.exe', ['query', 'HKCU\\Environment', '/v', name], {
      encoding: 'utf8',
      windowsHide: true
    });
    const line = output.split(/\r?\n/).find((item) => item.includes(name));
    if (!line) return '';
    const match = line.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.+)$`));
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: fallbackMinWidth,
    minHeight: fallbackMinHeight,
    title: 'Claude Code 图形启动器',
    backgroundColor: '#f6f4ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function updateRecentProject(settings, projectPath) {
  const recent = [projectPath, ...(settings.recentProjects || []).filter((item) => item !== projectPath)];
  settings.selectedProject = projectPath;
  settings.recentProjects = recent.slice(0, 10);
  writeJson(settingsPath, settings);
  return settings;
}

function buildClaudeEnv(provider, model) {
  const env = { ...process.env };
  env.PATH = `D:\\ClaudeCode;${env.PATH || ''}`;
  env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath;
  env.ANTHROPIC_BASE_URL = provider.baseUrl;
  env.ANTHROPIC_MODEL = model;
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = provider.haikuModel || model;
  env.CLAUDE_CODE_SUBAGENT_MODEL = provider.subagentModel || provider.haikuModel || model;
  env.ANTHROPIC_API_KEY = '';
  env.ANTHROPIC_AUTH_TOKEN = '';

  const key = envValue(provider.apiKeyEnv);
  env[provider.apiKeyEnv] = key;
  if (provider.authType === 'authToken') {
    env.ANTHROPIC_AUTH_TOKEN = key;
  } else {
    env.ANTHROPIC_API_KEY = key;
  }

  for (const [keyName, value] of Object.entries(provider.extraEnv || {})) {
    env[keyName] = String(value);
  }
  return env;
}

function buildClaudeArgs(mode, sessionId) {
  if (mode === 'continue') return ['--continue'];
  if (mode === 'resume' && sessionId) return ['--resume', sessionId];
  return [];
}

function sendTerminalData(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:data', data);
  }
}

function startClaude(payload) {
  if (currentProcess) {
    throw new Error('Claude Code 已经在运行，请先停止或重启。');
  }

  const providers = getProviders();
  const provider = providers.find((item) => item.id === payload.providerId);
  if (!provider) throw new Error('找不到选择的服务商。');
  if (!envValue(provider.apiKeyEnv)) throw new Error(`缺少密钥环境变量：${provider.apiKeyEnv}`);
  if (!fs.existsSync(claudeCmd)) throw new Error(`找不到 Claude Code：${claudeCmd}`);
  if (!payload.projectPath || !fs.existsSync(payload.projectPath)) throw new Error('请选择有效的项目文件夹。');

  const model = payload.model || provider.defaultModel;
  const args = buildClaudeArgs(payload.mode, payload.sessionId);
  const env = buildClaudeEnv(provider, model);

  currentProcess = pty.spawn('cmd.exe', ['/d', '/c', claudeCmd, ...args], {
    name: 'xterm-256color',
    cols: Number(payload.cols) || 100,
    rows: Number(payload.rows) || 30,
    cwd: payload.projectPath,
    env
  });

  currentProcess.onData(sendTerminalData);
  currentProcess.onExit(({ exitCode }) => {
    sendTerminalData(`\r\n\r\n[Claude Code 已退出，退出码 ${exitCode}]\r\n`);
    currentProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:exit', exitCode);
    }
  });

  const settings = getSettings();
  settings.selectedProviderId = provider.id;
  settings.selectedModel = model;
  updateRecentProject(settings, payload.projectPath);

  return { ok: true };
}

function stopClaude() {
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
  }
  return { ok: true };
}

function resizeClaude({ cols, rows }) {
  if (currentProcess) {
    currentProcess.resize(Math.max(20, Number(cols) || 100), Math.max(5, Number(rows) || 30));
  }
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function messageText(message) {
  if (!message) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function compactText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readHistoryActivityMap() {
  const activity = new Map();
  if (!fs.existsSync(historyPath)) return activity;
  const lines = fs.readFileSync(historyPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const entry = parseJsonLine(line);
    if (!entry || !entry.sessionId) continue;
    const value = timestampMs(entry.timestamp);
    if (value > (activity.get(entry.sessionId) || 0)) {
      activity.set(entry.sessionId, value);
    }
  }
  return activity;
}

function readSessionFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const fileStat = fs.statSync(filePath);
  let sessionId = path.basename(filePath, '.jsonl');
  let projectPath = '';
  let title = '';
  let lastTimestamp = '';
  let activityMs = fileStat.mtimeMs;
  let model = '';

  for (const line of lines) {
    const entry = parseJsonLine(line);
    if (!entry) continue;
    if (entry.sessionId) sessionId = entry.sessionId;
    if (entry.cwd) projectPath = entry.cwd;
    if (entry.timestamp) {
      const entryMs = timestampMs(entry.timestamp);
      if (entryMs >= activityMs) {
        activityMs = entryMs;
        lastTimestamp = entry.timestamp;
      } else if (!lastTimestamp) {
        lastTimestamp = entry.timestamp;
      }
    }
    if (entry.message && entry.message.model) model = entry.message.model;
    if (!title && entry.type === 'user') {
      title = compactText(messageText(entry.message));
    }
  }

  const activityTime = new Date(activityMs).toISOString();
  if (!lastTimestamp) lastTimestamp = activityTime;
  if (!title) title = 'Untitled session';
  return {
    sessionId,
    projectPath,
    title,
    lastTimestamp,
    activityTime,
    activityMs,
    model,
    filePath
  };
}

function listSessionFiles() {
  if (!fs.existsSync(projectsDir)) return [];
  const result = [];
  const stack = [projectsDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'tool-results' && entry.name !== 'memory') stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

function normalizePathForCompare(value) {
  return path.resolve(value || '').toLowerCase();
}

function listSessions({ projectPath, showAll }) {
  const currentProject = normalizePathForCompare(projectPath);
  const historyActivity = readHistoryActivityMap();
  const sessions = [];
  for (const filePath of listSessionFiles()) {
    try {
      const session = readSessionFile(filePath);
      const historyMs = historyActivity.get(session.sessionId) || 0;
      if (historyMs > (session.activityMs || 0)) {
        session.activityMs = historyMs;
        session.activityTime = new Date(historyMs).toISOString();
        session.lastTimestamp = session.activityTime;
      }
      if (!showAll && currentProject && normalizePathForCompare(session.projectPath) !== currentProject) {
        continue;
      }
      sessions.push(session);
    } catch {
      // Ignore unreadable or partial session files.
    }
  }

  sessions.sort((a, b) => (b.activityMs || 0) - (a.activityMs || 0));
  return sessions.slice(0, 100);
}

function testProvider(providerInput, model) {
  const provider = normalizeProvider(providerInput);
  const key = envValue(provider.apiKeyEnv);
  if (!key) {
    return Promise.resolve({ ok: false, message: `缺少密钥环境变量：${provider.apiKeyEnv}` });
  }

  const body = JSON.stringify({
    model: model || provider.defaultModel,
    max_tokens: 16,
    messages: [{ role: 'user', content: [{ type: 'text', text: '只回复OK' }] }]
  });

  const url = new URL(`${provider.baseUrl.replace(/\/+$/, '')}/v1/messages`);
  const headers = {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body)
  };
  if (provider.authType === 'authToken') {
    headers.authorization = `Bearer ${key}`;
  } else {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  }

  return new Promise((resolve) => {
    const request = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        headers,
        timeout: 30000
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve({ ok: true, message: '测试成功' });
          } else {
            resolve({ ok: false, message: `测试失败：HTTP ${response.statusCode} ${data.slice(0, 240)}` });
          }
        });
      }
    );
    request.on('timeout', () => {
      request.destroy(new Error('连接超时'));
    });
    request.on('error', (error) => {
      resolve({ ok: false, message: `测试失败：${error.message}` });
    });
    request.write(body);
    request.end();
  });
}

app.whenReady().then(() => {
  ensureConfig();
  createWindow();
});

app.on('window-all-closed', () => {
  stopClaude();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app:getInitialData', () => {
  const providers = getProviders();
  return {
    providers,
    settings: getSettings(),
    providerStatus: getProviderStatus(providers),
    paths: { appRoot, claudeCmd, gitBashPath, providersPath, settingsPath }
  };
});

ipcMain.handle('app:setMinimumSize', (_event, size) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  const width = Math.max(fallbackMinWidth, Math.ceil(Number(size?.width) || fallbackMinWidth));
  const height = Math.max(fallbackMinHeight, Math.ceil(Number(size?.height) || fallbackMinHeight));
  mainWindow.setMinimumSize(width, height);
  const [currentWidth, currentHeight] = mainWindow.getSize();
  if (currentWidth < width || currentHeight < height) {
    mainWindow.setSize(Math.max(currentWidth, width), Math.max(currentHeight, height));
  }
  return { ok: true, width, height };
});

ipcMain.handle('project:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择项目文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const settings = updateRecentProject(getSettings(), result.filePaths[0]);
  return { projectPath: result.filePaths[0], settings };
});

ipcMain.handle('settings:save', (_event, settings) => {
  writeJson(settingsPath, { ...getSettings(), ...settings });
  return getSettings();
});

ipcMain.handle('providers:save', (_event, providers) => {
  const normalized = providers.map(normalizeProvider).filter((provider) => provider.id && provider.name && provider.baseUrl);
  writeJson(providersPath, normalized);
  return normalized;
});

ipcMain.handle('providers:reset', () => {
  writeJson(providersPath, defaultProviders);
  return defaultProviders;
});

ipcMain.handle('provider:test', (_event, { provider, model }) => testProvider(provider, model));

ipcMain.handle('sessions:list', (_event, options) => listSessions(options || {}));

ipcMain.handle('claude:start', (_event, payload) => startClaude(payload));

ipcMain.handle('claude:stop', () => stopClaude());

ipcMain.handle('claude:resize', (_event, size) => {
  resizeClaude(size || {});
  return { ok: true };
});

ipcMain.on('claude:write', (_event, data) => {
  if (currentProcess) currentProcess.write(data);
});
