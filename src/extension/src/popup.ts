document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement | null;
  const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement | null;
  const statusLiveRegion = document.getElementById('statusLiveRegion');

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

  /**
   * Write a message to the ARIA live region for screen reader feedback.
   */
  function updateLiveRegion(message: string) {
    if (statusLiveRegion) {
      statusLiveRegion.textContent = message;
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
    cancelBtn.setAttribute('aria-disabled', String(disabled));
    if (color !== undefined) cancelBtn.style.color = color;
  }

  /**
   * Centralized UI update for all connection states. Respects local cancel warning state.
   * Also updates the ARIA live region for screen reader feedback.
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
        connectBtn.setAttribute('aria-disabled', 'false');
        cancelWarningActive = false;
        setCancelButton({ text: config.CANCEL_DEFAULT, color: config.CANCEL_GREY, disabled: true, aria: 'Cancel (inactive)' });
        updateLiveRegion('Disconnected. Ready to connect.');
        connectBtn.focus();
        break;
      case 'connecting':
        setCancelButton({ text: cancelWarningActive ? config.CANCEL_WARNING : config.CANCEL_DEFAULT, color: '', disabled: false, aria: cancelWarningActive ? 'Force kill warning: one more press will force kill' : 'Cancel/Disconnect' });
        connectBtn.textContent = 'Connecting... ⏳';
        connectBtn.style.backgroundColor = 'orange';
        connectBtn.disabled = true;
        connectBtn.setAttribute('aria-disabled', 'true');
        updateLiveRegion('Connecting. Please wait.');
        break;
      case 'connected':
        setCancelButton({ text: cancelWarningActive ? config.CANCEL_WARNING : config.CANCEL_DEFAULT, color: '', disabled: false, aria: cancelWarningActive ? 'Force kill warning: one more press will force kill' : 'Cancel/Disconnect' });
        connectBtn.textContent = 'Connected ✅';
        connectBtn.style.backgroundColor = 'green';
        connectBtn.disabled = false;
        connectBtn.setAttribute('aria-disabled', 'false');
        updateLiveRegion('Connected.');
        connectBtn.focus();
        break;
      case 'reconnecting':
        setCancelButton({ text: cancelWarningActive ? config.CANCEL_WARNING : config.CANCEL_DEFAULT, color: '', disabled: false, aria: cancelWarningActive ? 'Force kill warning: one more press will force kill' : 'Cancel/Disconnect' });
        connectBtn.textContent = 'Reconnecting... ⏳';
        connectBtn.style.backgroundColor = 'red';
        connectBtn.disabled = true;
        connectBtn.setAttribute('aria-disabled', 'true');
        updateLiveRegion('Reconnecting. Please wait.');
        break;
      case 'disconnecting':
        setCancelButton({ text: cancelWarningActive ? config.CANCEL_WARNING : config.CANCEL_DEFAULT, color: '', disabled: false, aria: cancelWarningActive ? 'Force kill warning: one more press will force kill' : 'Cancel/Disconnect' });
        connectBtn.textContent = 'Disconnecting... 🟡';
        connectBtn.style.backgroundColor = 'yellow';
        connectBtn.disabled = true;
        connectBtn.setAttribute('aria-disabled', 'true');
        updateLiveRegion('Disconnecting.');
        break;
      case 'force_killing':
        connectBtn.textContent = '❌ Force Killing... ❌';
        connectBtn.style.backgroundColor = 'red';
        connectBtn.disabled = true;
        connectBtn.setAttribute('aria-disabled', 'true');
        cancelWarningActive = false;
        setCancelButton({ text: config.CANCEL_WARNING, color: '', disabled: true, aria: 'Force killing in progress' });
        updateLiveRegion('Force killing connection.');
        break;
    }
  }

  if (connectBtn) {
    // Request initial status
    chrome.runtime.sendMessage({ type: 'getConnectionStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        updateLiveRegion('Error getting initial connection status: ' + chrome.runtime.lastError.message);
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
          updateLiveRegion('Error connecting: ' + chrome.runtime.lastError.message);
          console.error(chrome.runtime.lastError.message);
        } else {
          updateLiveRegion('Connecting...');
          console.log(response.status);
        }
      });
    });
  }

  if (cancelBtn) {
    cancelBtn.textContent = config.CANCEL_DEFAULT;
    cancelBtn.disabled = true;
    cancelBtn.setAttribute('aria-disabled', 'true');
    cancelBtn.onclick = () => {
      if (cancelBtn.disabled) return;
      const now = Date.now();
      cancelState.timestamps = cancelState.timestamps.filter(ts => now - ts < config.CANCEL_WARNING_TIMEOUT_MS);
      cancelState.timestamps.push(now);

      // --- Show warning emoji after two fast presses, persist for 3s ---
      if (cancelState.timestamps.length >= config.CANCEL_FORCE_KILL_THRESHOLD) {
        cancelWarningActive = false;
        clearCancelWarningTimer();
        updateLiveRegion('Force kill triggered.');
        // Let background handle force kill, UI will update on status event
      } else if (cancelState.timestamps.length >= config.CANCEL_WARNING_THRESHOLD) {
        cancelWarningActive = true;
        setCancelButton({ text: config.CANCEL_WARNING, color: '', disabled: false, aria: 'Force kill warning: one more press will force kill' });
        updateLiveRegion('Warning: one more press will force kill the connection.');
        if (!cancelState.warningTimeout) {
          cancelState.warningTimeout = setTimeout(() => {
            cancelWarningActive = false;
            setCancelButton({ text: config.CANCEL_DEFAULT, color: '', disabled: false, aria: 'Cancel/Disconnect' });
            updateLiveRegion('Force kill warning cleared.');
            cancelState.warningTimeout = null;
          }, config.CANCEL_WARNING_TIMEOUT_MS);
        }
      } else {
        cancelWarningActive = false;
        setCancelButton({ text: config.CANCEL_DEFAULT, color: '', disabled: false, aria: 'Cancel/Disconnect' });
        updateLiveRegion('Cancel/Disconnect requested.');
      }

      chrome.runtime.sendMessage({ type: 'disconnect' }, (response) => {
        if (chrome.runtime.lastError) {
          updateLiveRegion('Error disconnecting: ' + chrome.runtime.lastError.message);
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
    updateLiveRegion('Popup closed.');
  });
});