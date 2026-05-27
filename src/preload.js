const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getInitialData: () => ipcRenderer.invoke('app:getInitialData'),
  setMinimumSize: (size) => ipcRenderer.invoke('app:setMinimumSize', size),
  selectProject: () => ipcRenderer.invoke('project:select'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  saveProviders: (providers) => ipcRenderer.invoke('providers:save', providers),
  resetProviders: () => ipcRenderer.invoke('providers:reset'),
  testProvider: (payload) => ipcRenderer.invoke('provider:test', payload),
  listSessions: (options) => ipcRenderer.invoke('sessions:list', options),
  startClaude: (payload) => ipcRenderer.invoke('claude:start', payload),
  stopClaude: () => ipcRenderer.invoke('claude:stop'),
  resizeClaude: (size) => ipcRenderer.invoke('claude:resize', size),
  writeTerminal: (data) => ipcRenderer.send('claude:write', data),
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal:data', (_event, data) => callback(data));
  },
  onTerminalExit: (callback) => {
    ipcRenderer.on('terminal:exit', (_event, code) => callback(code));
  }
});
