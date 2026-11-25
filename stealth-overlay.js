// planck.ai — Stealth Invisible Teleprompter Overlay
// Uses OS-level capture exclusion (WDA_EXCLUDEFROMCAPTURE on Windows, NSWindowSharingNone on macOS)
// The window is 100% visible on your physical screen, but completely INVISIBLE to Zoom, Meet, Teams screen shares!

const { app, BrowserWindow, screen, globalShortcut, session, desktopCapturer } = require('electron');
const path = require('path');
const http = require('http');

// Prevent Chromium from throttling audio and background timers in the overlay
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let mainWindow = null;

function createStealthWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const winWidth = Math.min(580, Math.floor(width * 0.42));
  const winHeight = Math.min(640, Math.floor(height * 0.72));

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.floor((width - winWidth) / 2),
    y: 0,
    alwaysOnTop: true,
    transparent: false,
    opacity: 1.0, // Solid opaque stealth window
    frame: true,
    title: 'Desktop Window Manager Auxiliary',
    // Win32 WS_EX_TOOLWINDOW: OS-level exclusion from Windows Taskbar & Alt+Tab
    type: process.platform === 'win32' ? 'toolbar' : 'normal',
    focusable: false, // ZERO FOCUS LOSS: OS will NOT activate or steal focus from Chrome / IDE on mouse click
    skipTaskbar: true, // Invisible on taskbar
    hiddenInMissionControl: true, // Invisible in macOS Mission Control (Swipe-Up)
    icon: path.join(__dirname, 'icon.ico'),
    hasShadow: true,
    resizable: true,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:planck-stealth',
    }
  });

  // Dynamic Window Opacity Controller & Proctor Title Camouflage
  mainWindow.on('page-title-updated', (event, title) => {
    event.preventDefault();
    if (title && title.startsWith('__OPACITY__:')) {
      const opacity = parseFloat(title.replace('__OPACITY__:', ''));
      if (!isNaN(opacity) && opacity >= 0.15 && opacity <= 1.0) {
        mainWindow.setOpacity(opacity);
      }
    }
    if (title && title.startsWith('__OS_INPUT__:')) {
      try {
        const rawJson = title.replace('__OS_INPUT__:', '');
        const inputData = JSON.parse(decodeURIComponent(rawJson));
        const inputSynth = (process.platform === 'darwin')
          ? require('./mac_os_input_synthesizer')
          : require('./electron_os_input_synthesizer');
        const primDisp = screen.getPrimaryDisplay();
        if (primDisp && primDisp.bounds) {
          inputSynth.setScreenBounds(primDisp.bounds.width, primDisp.bounds.height);
        }
        inputSynth.handleInput(inputData);
      } catch (err) {
        console.error('[Stealth OS Input Bridge Error]:', err);
      }
    }
    // Always enforce cloaked OS window title against background process/window scrapers (HackerRank/Mercer)
    mainWindow.setTitle('Desktop Window Manager Auxiliary');
  });

  // Inject Electron stealth environment flags into web context
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      window._isElectronStealthApp = true;
      document.documentElement.classList.add('is-stealth-app');
      const b = document.getElementById('mockPracticeNoticeBanner');
      if (b) b.remove();
      window._electronSetWindowOpacity = function(val) {
        document.title = "__OPACITY__:" + val;
      };
    `);
  });

  // Explicitly enforce taskbar invisibility on Windows & show without stealing focus
  mainWindow.once('ready-to-show', () => {
    mainWindow.setSkipTaskbar(true);
    if (process.platform === 'darwin') {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      mainWindow.setAlwaysOnTop(true, 'floating', 1);
    }
    mainWindow.showInactive();
  });

  // =========================================================================
  // THE SECRET VAULT / GHOST OVERLAY SHIELD:
  // Windows: calls SetWindowDisplayAffinity(hWnd, WDA_EXCLUDEFROMCAPTURE)
  // macOS: calls [window setSharingType:NSWindowSharingNone]
  // Zoom, Google Meet, Microsoft Teams, Slack, and Screen Recorders CANNOT CAPTURE THIS WINDOW!
  // =========================================================================
  mainWindow.setContentProtection(true);

  // Auto-detect: Accept CLI arg URL, or check localhost:3000, otherwise use Render cloud
  const localUrl = 'http://localhost:3000/live?app=stealth&stealth=true';
  const renderUrl = 'https://planck-ai.onrender.com/live?app=stealth&stealth=true';

  const cliUrl = process.argv.slice(1).find(arg => arg && (arg.startsWith('http://') || arg.startsWith('https://')));

  if (cliUrl) {
    console.log('[Stealth Overlay] Using CLI URL:', cliUrl);
    mainWindow.loadURL(cliUrl);
  } else if (process.env.PLANCK_URL) {
    console.log('[Stealth Overlay] Using custom PLANCK_URL:', process.env.PLANCK_URL);
    mainWindow.loadURL(process.env.PLANCK_URL);
  } else {
    const probeReq = http.get('http://localhost:3000/api/status', (res) => {
      if (res.statusCode === 200) {
        console.log('[Stealth Overlay] Connected to Local Server (0ms latency):', localUrl);
        mainWindow.loadURL(localUrl);
      } else {
        console.log('[Stealth Overlay] Connected to Cloud Server:', renderUrl);
        mainWindow.loadURL(renderUrl);
      }
    });
    probeReq.on('error', () => {
      console.log('[Stealth Overlay] Connected to Cloud Server:', renderUrl);
      mainWindow.loadURL(renderUrl);
    });
    probeReq.setTimeout(600, () => {
      probeReq.destroy();
      console.log('[Stealth Overlay] Connected to Cloud Server:', renderUrl);
      mainWindow.loadURL(renderUrl);
    });
  }

  // Enable F5, Ctrl+R to quickly reload, and F12 / Ctrl+Shift+I to open DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r') || (input.meta && input.key.toLowerCase() === 'r')) {
      console.log('[Stealth] Reloading page...');
      mainWindow.reload();
    }
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Global Panic Shortcut: Ctrl+Shift+H to immediately hide or unhide overlay
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      console.log('[Stealth] Overlay hidden');
    } else {
      mainWindow.showInactive();
      mainWindow.setSkipTaskbar(true);
      console.log('[Stealth] Overlay restored (non-activating)');
    }
  });

  // Global Focus Toggle: Ctrl+Shift+F (Toggles Non-Activating Ghost Mode vs Interactive Typing Mode)
  let isNonActivating = true;
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      isNonActivating = !isNonActivating;
      mainWindow.setFocusable(!isNonActivating);
      console.log(`[Stealth] Focusable Mode: ${!isNonActivating ? 'ENABLED (Typing mode)' : 'DISABLED (Zero-Focus-Loss Ghost Mode)'}`);
      mainWindow.webContents.executeJavaScript(`
        if (typeof window.showStealthToast === 'function') {
          window.showStealthToast('${isNonActivating ? '🛡️ Ghost Mode: Non-Activating (Zero Focus Loss)' : '⌨️ Input Mode: Focusable (Typing Allowed)'}');
        } else {
          console.log('[Stealth HUD] Non-Activating: ${isNonActivating}');
        }
      `);
    }
  });

  // Global Quick Quit: Ctrl+Shift+Q to exit completely
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    console.log('[Stealth] Quitting overlay...');
    app.quit();
  });

  // Global Stealth Code Snapper Hotkey: Ctrl+Shift+S (Preserves exact mouse cursor position!)
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Stealth] Hotkey Ctrl+Shift+S triggered - snapping screen without moving mouse cursor...');
      mainWindow.webContents.executeJavaScript('if (window.PlanckCodeSnapper) window.PlanckCodeSnapper.snap();');
    }
  });

  // Global Click-Through Toggle: Ctrl+Shift+X (Allows clicking through the overlay directly into LeetCode / IDE)
  let isClickThrough = false;
  globalShortcut.register('CommandOrControl+Shift+X', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      isClickThrough = !isClickThrough;
      mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
      console.log(`[Stealth] Click-through mode: ${isClickThrough ? 'ENABLED (Clicks pass through)' : 'DISABLED (Interactive)'}`);
      mainWindow.webContents.executeJavaScript(`
        if (typeof window.showStealthToast === 'function') {
          window.showStealthToast('${isClickThrough ? '🛡️ Click-Through Mode ON (Clicks pass through to IDE)' : '🖱️ Interactive Mode ON'}');
        } else {
          console.log('[Stealth HUD] Click-through: ${isClickThrough}');
        }
      `);
    }
  });

  // Dynamic Opacity Cycle Hotkeys: Ctrl+Shift+Up (Brighter) / Ctrl+Shift+Down (More Transparent)
  let currentStealthOpacity = 1.0;
  globalShortcut.register('CommandOrControl+Shift+Up', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      currentStealthOpacity = Math.min(1.0, Math.round((currentStealthOpacity + 0.15) * 100) / 100);
      mainWindow.setOpacity(currentStealthOpacity);
      console.log(`[Stealth] Opacity increased to: ${Math.round(currentStealthOpacity * 100)}%`);
      mainWindow.webContents.executeJavaScript(`
        if (typeof window.showStealthToast === 'function') {
          window.showStealthToast('👁️ Overlay Opacity: ${Math.round(currentStealthOpacity * 100)}%');
        }
      `);
    }
  });

  globalShortcut.register('CommandOrControl+Shift+Down', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      currentStealthOpacity = Math.max(0.20, Math.round((currentStealthOpacity - 0.15) * 100) / 100);
      mainWindow.setOpacity(currentStealthOpacity);
      console.log(`[Stealth] Opacity decreased to: ${Math.round(currentStealthOpacity * 100)}%`);
      mainWindow.webContents.executeJavaScript(`
        if (typeof window.showStealthToast === 'function') {
          window.showStealthToast('👁️ Overlay Opacity: ${Math.round(currentStealthOpacity * 100)}%');
        }
      `);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide(); // Completely hidden from macOS Dock and Cmd+Tab app switcher
  }
  const stealthSession = session.fromPartition('persist:planck-stealth');

  // Purge any legacy service workers and stale offline cache traps that cause net::ERR_CACHE_MISS
  stealthSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});
  stealthSession.clearCache().catch(() => {});

  const setupSession = (sess) => {
    sess.setPermissionRequestHandler((webContents, permission, callback) => callback(true));
    sess.setPermissionCheckHandler(() => true);
    sess.setDevicePermissionHandler(() => true);

    // Enable 1-click audio capture inside Electron (captures loopback audio from speakers/headphones)
    sess.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        // ONLY query physical displays ('screen'). Exclude 'window' so the stealth app never captures itself!
        // thumbnailSize: {width:0, height:0} bypasses GDI thumbnail generation for instant <5ms acquisition
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false
        });
        if (sources && sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback(null);
        }
      } catch (err) {
        console.error('[Stealth Overlay] Display media handler error:', err);
        callback(null);
      }
    });
  };

  // Configure permissions & loopback audio capture on both default and custom stealth partition
  setupSession(session.defaultSession);
  setupSession(stealthSession);

  createStealthWindow();
  console.log('====================================================');
  console.log('🛡️ PLANCK.AI STEALTH OVERLAY RUNNING');
  console.log('   - Windows Screen Capture Exclusion: ACTIVE');
  console.log('   - Taskbar Invisibility (WS_EX_TOOLWINDOW): ACTIVE');
  console.log('   - Loopback Audio Capture: ENABLED');
  console.log('   - Zoom, Google Meet & Teams see through this window');
  console.log('   - Toggle visibility anytime with: Ctrl+Shift+H');
  console.log('====================================================');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
