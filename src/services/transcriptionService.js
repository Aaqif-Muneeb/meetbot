class TranscriptionService {
    constructor() {
        if (!('webkitSpeechRecognition' in window)) {
            throw new Error('Speech recognition is not supported in this browser');
        }
        this.recognition = new webkitSpeechRecognition();
        this.systemRecognition = null;
        this.isRecording = false;
        this.isSystemAudioActive = false;
        this.transcript = '';
        this.onTranscriptUpdate = null;
        this.audioContext = null;
        this.audioStream = null;
        this.configureRecognition();
    }

    async requestPermissions() {
        try {
            await chrome.runtime.sendMessage({ type: 'CHECK_PERMISSIONS' });
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Failed to get microphone permission:', error);
            return false;
        }
    }

    configureRecognition() {
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (this.isRecording) {
                setTimeout(() => {
                    try {
                        this.recognition.start();
                    } catch (error) {
                        console.warn('Failed to restart recognition:', error);
                    }
                }, 300);
            }
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript.trim();
                
                if (event.results[i].isFinal) {
                    finalTranscript = transcript;
                    const timestamp = new Date().toLocaleTimeString();
                    this.transcript += `[${timestamp}] [Me] ${finalTranscript}\n`;
                } else {
                    interimTranscript = transcript;
                }
            }

            if (this.onTranscriptUpdate) {
                this.onTranscriptUpdate(
                    finalTranscript ? `[Me] ${finalTranscript}` : '',
                    interimTranscript ? `[Me] ${interimTranscript}` : ''
                );
            }
        };

        this.recognition.onend = () => {
            if (this.isRecording) {
                setTimeout(() => {
                    try {
                        this.recognition.start();
                    } catch (error) {
                        console.warn('Failed to restart recognition on end:', error);
                    }
                }, 100);
            }
        };
    }

    async startRecording() {
        try {
            const hasPermission = await this.requestPermissions();
            if (!hasPermission) {
                throw new Error('Microphone permission required');
            }
            
            this.isRecording = true;
            this.transcript = '';
            
            if (this.recognition) {
                try {
                    this.recognition.stop();
                } catch (e) {
                    console.warn('Error stopping existing recognition:', e);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            this.recognition.start();
            
            return true;
        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }

    stopRecording() {
        this.isRecording = false;
        this.isSystemAudioActive = false;

        if (this.recognition) {
            this.recognition.stop();
        }
        if (this.systemRecognition) {
            this.systemRecognition.stop();
        }
        
        const finalTranscript = this.transcript.trim();
        
        const formattedTranscript = finalTranscript.split('\n')
            .filter(line => line.trim())
            .map(line => {
                if (!line.startsWith('[')) {
                    const timestamp = new Date().toLocaleTimeString();
                    return `[${timestamp}] ${line}`;
                }
                return line;
            })
            .join('\n');
        
        if (!formattedTranscript.trim()) {
            console.warn('Empty transcript detected, attempting recovery...');
            return '[WARNING] Transcript may be incomplete. Please try recording again.';
        }
        
        return formattedTranscript;
    }

    setTranscriptUpdateCallback(callback) {
        this.onTranscriptUpdate = callback;
    }

    async setupSystemAudio() {
        try {
            if (this.systemRecognition) {
                console.warn('System audio recognition already exists');
                return this.systemRecognition;
            }

            // Create separate recognition instance for system audio
            this.systemRecognition = new webkitSpeechRecognition();
            this.configureSystemRecognition(this.systemRecognition);
            
            // Initialize system audio service
            const systemAudioService = new SystemAudioService();
            await systemAudioService.startCapture((finalTranscript, interimTranscript) => {
                this.handleSystemAudioTranscript(finalTranscript, interimTranscript);
            });

            this.isSystemAudioActive = true;
            return this.systemRecognition;
        } catch (error) {
            console.error('Failed to setup system audio:', error);
            this.isSystemAudioActive = false;
            return null;
        }
    }

    configureSystemRecognition(recognition) {
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onerror = (event) => {
            console.error('System audio recognition error:', event.error);
            if (event.error === 'no-speech' && this.isSystemAudioActive) {
                this.restartSystemRecognition();
            }
        };

        recognition.onend = () => {
            if (this.isSystemAudioActive) {
                setTimeout(() => {
                    try {
                        recognition.start();
                    } catch (error) {
                        console.error('Failed to restart system recognition:', error);
                    }
                }, 100);
            }
        };
    }

    handleSystemAudioTranscript(finalTranscript, interimTranscript) {
        const timestamp = new Date().toLocaleTimeString();
        
        if (finalTranscript) {
            const formattedTranscript = `[${timestamp}] [System Audio] ${finalTranscript}`;
            this.transcript += formattedTranscript + '\n';
        }

        if (this.onTranscriptUpdate) {
            this.onTranscriptUpdate(
                finalTranscript ? `[System Audio] ${finalTranscript}` : '',
                interimTranscript ? `[System Audio] ${interimTranscript}` : ''
            );
        }
    }

    restartSystemRecognition() {
        if (this.systemRecognition && this.isSystemAudioActive) {
            try {
                this.systemRecognition.stop();
                setTimeout(() => {
                    this.systemRecognition.start();
                }, 1000);
            } catch (error) {
                console.error('Error restarting system recognition:', error);
            }
        }
    }
}

window.transcriptionService = new TranscriptionService();