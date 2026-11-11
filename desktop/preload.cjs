const { contextBridge, ipcRenderer } = require('electron');
// No tokens, arbitrary URLs, filesystem access or generic IPC exposed to the page.
contextBridge.exposeInMainWorld('coachDesktop', Object.freeze({
  status: () => ipcRenderer.invoke('mcs:status'),
  connect: () => ipcRenderer.invoke('mcs:connect'),
  cancel: () => ipcRenderer.invoke('mcs:cancel'),
  disconnect: () => ipcRenderer.invoke('mcs:disconnect'),
  models: () => ipcRenderer.invoke('mcs:models'),
  test: model => ipcRenderer.invoke('mcs:test', model),
  ask: body => ipcRenderer.invoke('mcs:ask', body),
  usage: () => ipcRenderer.invoke('mcs:usage'),
  ecoledirecte: (body, token) => ipcRenderer.invoke('mcs:ed', body, token),
}));
