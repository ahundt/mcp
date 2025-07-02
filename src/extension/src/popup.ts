document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement | null;
  const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement | null;

  const config = {
    CANCEL_WARNING_TIMEOUT_MS: 3000,
    CANCEL_WARNING_THRESHOLD: 2,
    CANCEL_FORCE_KILL_THRESHOLD: 3,
    CANCEL_DEFAULT: '\u2A09', // ⨉
    CANCEL_WARNING: '❌',
    CANCEL_GREY: '#aaa'
  };

  const cancelState = {
    timestamps: [] as number[],
    warningTimeout: null as ReturnType<typeof setTimeout> | null,
  };

  function clearCancelWarningTimer() {
    if (cancelState.warningTimeout) {
      clearTimeout(cancelState.warningTimeout);
      cancelState.warningTimeout = null;
    }
  }

  // --- Cancel button warning state: ensures ❌ is shown for 3s after two fast presses, not overwritten by status updates ---
  let cancelWarningActive = false;

  /**
   * Helper to set cancel button state in a single place for clarity and accessibility.
   */
  function setCancelButton({ text, color, disabled, aria }: { text: string, color?: string, disabled: boolean, aria: string }) {
    if (!cancelBtn) return;
    cancelBtn.textContent = text;
    cancelBtn.disabled = disabled;
    cancelBtn.setAttribute('aria-label', aria);
    if (color !== undefined) cancelBtn.style.color = color;
  }

  /**
   * Centralized UI update for all connection states. Respects local cancel warning state.
   */
  function updateUI(status: string) {
    if (!connectBtn || !cancelBtn) return;
    clearCancelWarningTimer();
    // Accessibility
    connectBtn.setAttribute('aria-label', 'Connect/Disconnect');
    switch (status) {
      case 'disconnected':
        connectBtn.textContent = 'Connect 🚀';
        connectBtn.style.backgroundColor = '#e0e0e0'; // light grey
        connectBtn.disabled = false;
        cancelWarningActive = false;
        setCancelButton({ text: config.CANCEL_DEFAULT, color: config.CANCEL_GREY, disabled: true, aria: 'Cancel (inactive)' });
        break;
      case 'connecting':
      case 'connected':
      case 'reconnecting':
      case 'disconnecting':
        // If warning is active, keep ❌, else show ⨉
        if (cancelWarningActive) {
          setCancelButton({ text: config.CANCEL_WARNING, color: '', disabled: false, aria: 'Force kill warning: one more press will force kill' });
        } else {
          setCancelButton({ text: config.CANCEL_DEFAULT, color: '', disabled: false, aria: 'Cancel/Disconnect' });
        }
        // ...connectBtn logic for each state...
        switch (status) {
          case 'connecting':
            connectBtn.textContent = 'Connecting... ⏳';
            connectBtn.style.backgroundColor = 'orange';
            connectBtn.disabled = true;
            break;
          case 'connected':
            connectBtn.textContent = 'Connected ✅';
            connectBtn.style.backgroundColor = 'green';
            connectBtn.disabled = false;
            break;
          case 'reconnecting':
            connectBtn.textContent = 'Reconnecting... ⏳';
            connectBtn.style.backgroundColor = 'red';
            connectBtn.disabled = true;
            break;
          case 'disconnecting':
            connectBtn.textContent = 'Disconnecting... 🟡';
            connectBtn.style.backgroundColor = 'yellow';
            connectBtn.disabled = true;
            break;
        }
        break;
      case 'force_killing':
        connectBtn.textContent = '❌ Force Killing... ❌';
        connectBtn.style.backgroundColor = 'red';
        connectBtn.disabled = true;
        cancelWarningActive = false;
        setCancelButton({ text: config.CANCEL_WARNING, color: '', disabled: true, aria: 'Force killing in progress' });
        break;
    }
  }

  if (connectBtn) {
    // Request initial status
    chrome.runtime.sendMessage({ type: 'getConnectionStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting initial connection status:", chrome.runtime.lastError.message);
      } else if (response && response.status) {
        updateUI(response.status);
      }
    });

    // Listen for status updates
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'connectionStatusUpdate' && request.status) {
        updateUI(request.status);
      }
    });

    connectBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'connect' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
        } else {
          console.log(response.status);
        }
      });
    });
  }

  if (cancelBtn) {
    cancelBtn.textContent = config.CANCEL_DEFAULT;
    cancelBtn.disabled = true;
    cancelBtn.onclick = () => {
      if (cancelBtn.disabled) return;
      const now = Date.now();
      cancelState.timestamps = cancelState.timestamps.filter(ts => now - ts < config.CANCEL_WARNING_TIMEOUT_MS);
      cancelState.timestamps.push(now);

      // --- Show warning emoji after two fast presses, persist for 3s ---
      if (cancelState.timestamps.length >= config.CANCEL_FORCE_KILL_THRESHOLD) {
        cancelWarningActive = false;
        clearCancelWarningTimer();
        // Let background handle force kill, UI will update on status event
      } else if (cancelState.timestamps.length >= config.CANCEL_WARNING_THRESHOLD) {
        cancelWarningActive = true;
        setCancelButton({ text: config.CANCEL_WARNING, color: '', disabled: false, aria: 'Force kill warning: one more press will force kill' });
        if (!cancelState.warningTimeout) {
          cancelState.warningTimeout = setTimeout(() => {
            cancelWarningActive = false;
            setCancelButton({ text: config.CANCEL_DEFAULT, color: '', disabled: false, aria: 'Cancel/Disconnect' });
            cancelState.warningTimeout = null;
          }, config.CANCEL_WARNING_TIMEOUT_MS);
        }
      } else {
        cancelWarningActive = false;
        setCancelButton({ text: config.CANCEL_DEFAULT, color: '', disabled: false, aria: 'Cancel/Disconnect' });
      }

      chrome.runtime.sendMessage({ type: 'disconnect' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error disconnecting:', chrome.runtime.lastError.message);
        } else {
          updateUI('disconnecting');
        }
      });
    };
  }

  // --- Always clear warning timer and reset warning state on popup close ---
  window.addEventListener('unload', () => {
    clearCancelWarningTimer();
    cancelWarningActive = false;
  });
});