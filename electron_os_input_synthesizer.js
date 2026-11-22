/**
 * ============================================================================
 * Planck.ai Windows OS Input Synthesizer (Zero-Dependency Daemon)
 * ============================================================================
 * Synthesizes hardware mouse and keyboard events at the Windows OS level.
 * Allows the Companion Laptop to control candidate applications (VS Code,
 * Chrome, terminal, LeetCode) with zero OS driver installation and zero npm bloat.
 * ============================================================================
 */
const { spawn } = require('child_process');

class PlanckOSInputSynthesizer {
  constructor() {
    this.psProc = null;
    this.isReady = false;
    this.screenWidth = 1920;
    this.screenHeight = 1080;
    this.initProcess();
  }

  /**
   * Initialize long-lived PowerShell daemon for instant (<5ms) input execution
   */
  initProcess() {
    if (process.platform !== 'win32') {
      console.log('[OS Input Synthesizer] Non-Windows OS detected. Native simulation disabled.');
      return;
    }

    try {
      this.psProc = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', '-'
      ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore']
      });

      // Bootstrap Windows Forms and Drawing assemblies into the persistent session
      const bootstrapScript = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        'Add-Type -AssemblyName System.Drawing;',
        '$signature = @"',
        '[DllImport("user32.dll")]',
        'public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);',
        '@"',
        'Add-Type -MemberDefinition $signature -Name Win32Mouse -Namespace Planck;',
        'Write-Output "PLANCK_OS_INPUT_READY";\n'
      ].join('\r\n');

      this.psProc.stdin.write(bootstrapScript);

      this.psProc.stdout.on('data', (data) => {
        const text = data.toString();
        if (text.includes('PLANCK_OS_INPUT_READY')) {
          this.isReady = true;
          console.log('[OS Input Synthesizer] ✅ Windows OS input engine initialized & ready');
        }
      });

      this.psProc.on('exit', (code) => {
        console.warn('[OS Input Synthesizer] PowerShell daemon exited. Code:', code);
        this.isReady = false;
        this.psProc = null;
      });

      this.psProc.on('error', (err) => {
        console.error('[OS Input Synthesizer] Process error:', err);
        this.isReady = false;
      });
    } catch (e) {
      console.error('[OS Input Synthesizer] Init failure:', e);
    }
  }

  /**
   * Set target physical screen resolution
   * @param {number} width 
   * @param {number} height 
   */
  setScreenBounds(width, height) {
    if (width > 0 && height > 0) {
      this.screenWidth = width;
      this.screenHeight = height;
    }
  }

  /**
   * Execute synthetic OS input command
   * @param {Object} input 
   */
  handleInput(input) {
    if (!input || !this.psProc || !this.psProc.stdin.writable) return false;
    const { action, x, y, button, text, key, ctrlKey, altKey, shiftKey } = input;

    // Map normalized (0.0000 - 1.0000) to actual host physical screen pixels
    const targetX = (typeof x === 'number') ? Math.round(x * this.screenWidth) : null;
    const targetY = (typeof y === 'number') ? Math.round(y * this.screenHeight) : null;

    let psCommand = '';

    switch (action) {
      case 'mouse_move': {
        if (targetX !== null && targetY !== null) {
          psCommand = `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${targetX}, ${targetY});`;
        }
        break;
      }

      case 'mouse_down': {
        if (targetX !== null && targetY !== null) {
          psCommand += `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${targetX}, ${targetY});`;
        }
        // 0x0002 = LEFTDOWN, 0x0008 = RIGHTDOWN, 0x0020 = MIDDLEDOWN
        const flag = (button === 'right') ? 0x0008 : (button === 'middle' ? 0x0020 : 0x0002);
        psCommand += `[Planck.Win32Mouse]::mouse_event(${flag}, 0, 0, 0, 0);`;
        break;
      }

      case 'mouse_up': {
        if (targetX !== null && targetY !== null) {
          psCommand += `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${targetX}, ${targetY});`;
        }
        // 0x0004 = LEFTUP, 0x0010 = RIGHTUP, 0x0040 = MIDDLEUP
        const flag = (button === 'right') ? 0x0010 : (button === 'middle' ? 0x0040 : 0x0004);
        psCommand += `[Planck.Win32Mouse]::mouse_event(${flag}, 0, 0, 0, 0);`;
        break;
      }

      case 'mouse_wheel': {
        const delta = input.deltaY || 120;
        // 0x0800 = MOUSEEVENTF_WHEEL
        psCommand = `[Planck.Win32Mouse]::mouse_event(0x0800, 0, 0, ${-delta}, 0);`;
        break;
      }

      case 'key_press': {
        let sendKeyStr = '';
        if (key === 'Enter') sendKeyStr = '{ENTER}';
        else if (key === 'Backspace') sendKeyStr = '{BACKSPACE}';
        else if (key === 'Tab') sendKeyStr = '{TAB}';
        else if (key === 'Escape') sendKeyStr = '{ESC}';
        else if (key === 'Delete') sendKeyStr = '{DELETE}';
        else if (key === 'ArrowUp') sendKeyStr = '{UP}';
        else if (key === 'ArrowDown') sendKeyStr = '{DOWN}';
        else if (key === 'ArrowLeft') sendKeyStr = '{LEFT}';
        else if (key === 'ArrowRight') sendKeyStr = '{RIGHT}';
        else if (key === 'Home') sendKeyStr = '{HOME}';
        else if (key === 'End') sendKeyStr = '{END}';
        else if (key === 'PageUp') sendKeyStr = '{PGUP}';
        else if (key === 'PageDown') sendKeyStr = '{PGDN}';
        else if (key === 'Space' || key === ' ') sendKeyStr = ' ';
        else if (key && key.length === 1) {
          // Escape SendKeys special characters: + ^ % ~ ( ) { } [ ]
          if (['+', '^', '%', '~', '(', ')', '{', '}', '[', ']'].includes(key)) {
            sendKeyStr = `{${key}}`;
          } else {
            sendKeyStr = key;
          }
        }

        if (sendKeyStr) {
          let prefix = '';
          if (ctrlKey) prefix += '^';
          if (shiftKey && key.length > 1) prefix += '+';
          if (altKey) prefix += '%';
          psCommand = `[System.Windows.Forms.SendKeys]::SendWait('${prefix}${sendKeyStr.replace(/'/g, "''")}');`;
        }
        break;
      }

      case 'type_string': {
        if (text) {
          // Escapes single quotes for PowerShell string
          const safeText = text.replace(/'/g, "''");
          psCommand = `[System.Windows.Forms.SendKeys]::SendWait('${safeText}');`;
        }
        break;
      }
    }

    if (psCommand) {
      try {
        this.psProc.stdin.write(psCommand + '\r\n');
        return true;
      } catch (err) {
        console.error('[OS Input Synthesizer] Stdin write error:', err);
      }
    }
    return false;
  }

  /**
   * Terminate persistent process cleanly
   */
  destroy() {
    if (this.psProc) {
      try {
        this.psProc.stdin.end();
        this.psProc.kill();
      } catch (e) {}
      this.psProc = null;
      this.isReady = false;
    }
  }
}

module.exports = new PlanckOSInputSynthesizer();
