class BackgroundService {
    constructor() {
        this.setupListeners();
        this.currentRecordingTabId = null;
    }

    setupListeners() {
        // Handle installation
        chrome.runtime.onInstalled.addListener(async (details) => {
            // Initialize side panel only
            if (chrome.sidePanel) {
                await chrome.sidePanel.setOptions({
                    enabled: true,
                    path: 'src/side-panel/sidePanel.html'
                });
            }
        });

        // Handle action click (extension icon)
        chrome.action.onClicked.addListener(async (tab) => {
            if (chrome.sidePanel) {
                await chrome.sidePanel.open({ windowId: tab.windowId });
            }
        });

        // Handle messages
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'REQUEST_PERMISSIONS':
                    this.requestInitialPermissions()
                        .then(result => sendResponse({ success: result }));
                    return true;
                case 'START_RECORDING':
                    this.handleStartRecording(sender.tab?.id, sendResponse);
                    return true;
                case 'STOP_RECORDING':
                    this.handleStopRecording(message.data, sendResponse);
                    return true;
                case 'CHECK_RECORDING_STATUS':
                    sendResponse({ isRecording: this.currentRecordingTabId !== null });
                    return true;
                case 'CAPTURE_SYSTEM_AUDIO':
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (!tabs[0]?.id) {
                            sendResponse({ success: false, error: 'No active tab found' });
                            return;
                        }

                        try {
                            chrome.desktopCapture.chooseDesktopMedia(
                                ['tab', 'audio'],
                                tabs[0],
                                (streamId) => {
                                    if (!streamId) {
                                        sendResponse({ success: false, error: 'No source selected' });
                                        return;
                                    }
                                    sendResponse({ success: true, streamId: streamId });
                                }
                            );
                        } catch (error) {
                            console.error('Desktop capture error:', error);
                            sendResponse({ success: false, error: error.message });
                        }
                    });
                    return true;
            }
        });
    }

    async requestInitialPermissions() {
        try {
            // Request Chrome permissions
            const granted = await chrome.permissions.request({
                permissions: ['audioCapture', 'tabCapture'],
                origins: ['<all_urls>']
            });

            if (!granted) {
                console.error('Required permissions not granted');
                return false;
            }

            // Request microphone permission via getUserMedia
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());

            return true;
        } catch (error) {
            console.error('Error requesting permissions:', error);
            return false;
        }
    }

    async getSystemAudioStream(sender) {
        try {
            // Ensure we're capturing from the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || !tab.id) {
                throw new Error('No active tab found');
            }

            return new Promise((resolve) => {
                chrome.tabCapture.capture({
                    audio: true,
                    video: false
                }, (stream) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve({ success: true, stream });
                    }
                });
            });
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Initialize background service
const backgroundService = new BackgroundService(); 