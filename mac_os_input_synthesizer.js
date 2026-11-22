/**
 * ============================================================================
 * Planck.ai macOS OS Input Synthesizer (Native AppleScript / JXA Bridge)
 * ============================================================================
 * Synthesizes hardware mouse and keyboard events at the macOS OS level.
 * Allows the Companion Laptop to control candidate applications on Mac (VS Code,
 * Chrome, terminal, LeetCode) with zero compilation or native addon dependencies.
 * ============================================================================
 */
const { exec } = require('child_process');

class PlanckMacOSInputSynthesizer {
  constructor() {
    this.screenWidth = 1920;
    this.screenHeight = 1080;
    this.isReady = (process.platform === 'darwin');
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
   * Execute synthetic OS input command on macOS
   * @param {Object} input 
   */
  handleInput(input) {
    if (!input || process.platform !== 'darwin') return false;
    const { action, x, y, button, text, key, ctrlKey, altKey, shiftKey, metaKey } = input;

    // Map normalized (0.0000 - 1.0000) to actual host physical screen pixels
    const targetX = (typeof x === 'number') ? Math.round(x * this.screenWidth) : null;
    const targetY = (typeof y === 'number') ? Math.round(y * this.screenHeight) : null;

    let osaScript = '';

    switch (action) {
      case 'mouse_move':
      case 'mouse_down':
      case 'mouse_up': {
        if (targetX !== null && targetY !== null) {
          if (action === 'mouse_down') {
            if (button === 'right') {
              // Right-click context menu via AppleScript
              osaScript = `osascript -e 'tell application "System Events" to click at {${targetX}, ${targetY}} with control down'`;
            } else {
              // Left click at coordinates
              osaScript = `osascript -e 'tell application "System Events" to click at {${targetX}, ${targetY}}'`;
            }
          } else if (action === 'mouse_move') {
            // macOS mouse pointer move via Python Quartz or AppleScript positioning
            osaScript = `osascript -e 'tell application "System Events" to set position of cursor to {${targetX}, ${targetY}}' 2>/dev/null || python3 -c 'import Quartz; Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (${targetX}, ${targetY}), Quartz.kCGMouseButtonLeft))' 2>/dev/null`;
          }
        }
        break;
      }

      case 'mouse_wheel': {
        const delta = input.deltaY || 120;
        const scrollLines = delta > 0 ? -3 : 3;
        osaScript = `python3 -c 'import Quartz; Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 1, ${scrollLines}))' 2>/dev/null`;
        break;
      }

      case 'key_press': {
        if (key === 'Enter') {
          osaScript = `osascript -e 'tell application "System Events" to key code 36'`;
        } else if (key === 'Backspace') {
          osaScript = `osascript -e 'tell application "System Events" to key code 51'`;
        } else if (key === 'Tab') {
          osaScript = `osascript -e 'tell application "System Events" to key code 48'`;
        } else if (key === 'Escape') {
          osaScript = `osascript -e 'tell application "System Events" to key code 53'`;
        } else if (key === 'ArrowUp') {
          osaScript = `osascript -e 'tell application "System Events" to key code 126'`;
        } else if (key === 'ArrowDown') {
          osaScript = `osascript -e 'tell application "System Events" to key code 125'`;
        } else if (key === 'ArrowLeft') {
          osaScript = `osascript -e 'tell application "System Events" to key code 123'`;
        } else if (key === 'ArrowRight') {
          osaScript = `osascript -e 'tell application "System Events" to key code 124'`;
        } else if (key && key.length === 1) {
          const safeKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          let modifierStr = '';
          const modifiers = [];
          if (metaKey || ctrlKey) modifiers.push('command down');
          if (altKey) modifiers.push('option down');
          if (shiftKey) modifiers.push('shift down');
          if (modifiers.length > 0) {
            modifierStr = ` using {${modifiers.join(', ')}}`;
          }
          osaScript = `osascript -e 'tell application "System Events" to keystroke "${safeKey}"${modifierStr}'`;
        }
        break;
      }

      case 'type_string': {
        if (text) {
          const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          osaScript = `osascript -e 'tell application "System Events" to keystroke "${safeText}"'`;
        }
        break;
      }
    }

    if (osaScript) {
      exec(osaScript, (err) => {
        if (err && !err.message.includes('System Events')) {
          console.warn('[macOS Input Synthesizer] Execution notice:', err.message);
        }
      });
      return true;
    }
    return false;
  }

  destroy() {
    this.isReady = false;
  }
}

module.exports = new PlanckMacOSInputSynthesizer();
