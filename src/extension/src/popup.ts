document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.getElementById('connectBtn');

  function updateButtonUI(status) {
    if (!connectBtn) return;

    switch (status) {
      case 'disconnected':
        connectBtn.textContent = 'Connect';
        connectBtn.style.backgroundColor = 'grey';
        break;
      case 'connecting':
        connectBtn.textContent = 'Connecting...';
        connectBtn.style.backgroundColor = 'orange';
        break;
      case 'connected':
        connectBtn.textContent = 'Connected';
        connectBtn.style.backgroundColor = 'green';
        break;
      case 'reconnecting':
        connectBtn.textContent = 'Reconnecting...';
        connectBtn.style.backgroundColor = 'red';
        break;
    }
  }

  if (connectBtn) {
    // Request initial status
    chrome.runtime.sendMessage({ type: 'getConnectionStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting initial connection status:", chrome.runtime.lastError.message);
      } else if (response && response.status) {
        updateButtonUI(response.status);
      }
    });

    // Listen for status updates
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'connectionStatusUpdate' && request.status) {
        updateButtonUI(request.status);
      }
    });

    connectBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'connect' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
        } else {
          console.log(response.status);
          window.close(); // Re-introducing window.close() as per user preference.
        }
      });
    });
  }
});