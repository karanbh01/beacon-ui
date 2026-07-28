import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerIpcHandlers } from './ipc'

// Windows: gives notifications and the taskbar a stable identity.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.beacon.ui')
}

void app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    // macOS: re-open a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
