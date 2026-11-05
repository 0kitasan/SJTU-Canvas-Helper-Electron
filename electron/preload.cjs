const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("canvas", {
  canvasStatus: () => ipcRenderer.invoke("canvas:status"),
  canvasLogin: (provider) => ipcRenderer.invoke("canvas:login", provider),
  canvasConnectToken: (provider, token) => ipcRenderer.invoke("canvas:token", provider, token),
  canvasLogout: () => ipcRenderer.invoke("canvas:logout"),
  canvasCourses: (force) => ipcRenderer.invoke("canvas:courses", force),
  canvasResources: (id, kind, force) => ipcRenderer.invoke("canvas:resources", id, kind, force),
  videoTracks: (id) => ipcRenderer.invoke("video:tracks", id),
  downloadVideo: (id, index, title) => ipcRenderer.invoke("video:download", id, index, title),
  downloadVideos: (selections) => ipcRenderer.invoke("video:download-batch", selections),
  downloadTasks: () => ipcRenderer.invoke("downloads:list"),
  cancelDownload: (id) => ipcRenderer.invoke("downloads:cancel", id),
  retryDownload: (id) => ipcRenderer.invoke("downloads:retry", id),
  onDownloads: (callback) => {
    const listener = (_event, tasks) => callback(tasks);
    ipcRenderer.on("downloads:changed", listener);
    return () => ipcRenderer.removeListener("downloads:changed", listener);
  },
  connection: () => ipcRenderer.invoke("connection:status"),
  connect: (token) => ipcRenderer.invoke("connection:connect", token),
  loginVideo: () => ipcRenderer.invoke("connection:login"),
  demo: () => ipcRenderer.invoke("connection:demo"),
  courses: (force) => ipcRenderer.invoke("library:courses", force),
  recordings: (id, force) => ipcRenderer.invoke("library:recordings", id, force),
  transcript: (id, force) => ipcRenderer.invoke("library:transcript", id, force),
  save: (id, title) => ipcRenderer.invoke("library:save", id, title),
  openWindow: (page) => ipcRenderer.invoke("workspace:open", page),
});
