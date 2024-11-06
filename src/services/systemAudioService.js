class SystemAudioService {
    constructor() {
        this.isCapturing = false;
        this.stream = null;
        this.audioContext = null;
        this.recognition = null;
        this.onTranscriptUpdate = null;
    }

    async startCapture(onTranscriptUpdate) {
        if (this.isCapturing) {
            return;
        }

        try {
            this.onTranscriptUpdate = onTranscriptUpdate;
            
            this.stream = await this.getCaptureStream();
            
            const processedStream = await this.initializeAudioProcessing(this.stream);
            
            await this.setupSpeechRecognition(processedStream);
            
            this.isCapturing = true;
            return true;
        } catch (error) {
            this.cleanup();
            throw error;
        }
    }

    async getCaptureStream() {
        return new Promise((resolve, reject) => {
            chrome.tabCapture.capture({
                audio: true,
                video: false,
                audioConstraints: {
                    mandatory: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                }
            }, (stream) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Tab capture failed: ${chrome.runtime.lastError.message}`));
                } else if (!stream) {
                    reject(new Error('No audio stream returned'));
                } else {
                    resolve(stream);
                }
            });
        });
    }

    async initializeAudioProcessing(stream) {
        try {
            this.audioContext = new AudioContext();
            const source = this.audioContext.createMediaStreamSource(stream);
            const destination = this.audioContext.createMediaStreamDestination();
            
            // Add gain node for volume control
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 1.0; // Adjustable if needed
            
            source.connect(gainNode);
            gainNode.connect(destination);
            
            return destination.stream;
        } catch (error) {
            console.error('Audio processing setup failed:', error);
            throw error;
        }
    }

    async setupSpeechRecognition(stream) {
        if (!('webkitSpeechRecognition' in window)) {
            throw new Error('Speech recognition not supported');
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript = `[System Audio] ${transcript}`;
                } else {
                    interimTranscript = transcript;
                }
            }

            if (this.onTranscriptUpdate) {
                this.onTranscriptUpdate(finalTranscript, interimTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('System audio recognition error:', event.error);
            if (event.error === 'no-speech') {
                // Handle no speech detected
                this.restartRecognition();
            }
        };

        this.recognition.start();
    }

    restartRecognition() {
        if (this.recognition) {
            try {
                this.recognition.stop();
                setTimeout(() => {
                    this.recognition.start();
                }, 1000);
            } catch (error) {
                console.error('Error restarting recognition:', error);
            }
        }
    }

    stopCapture() {
        try {
            if (this.recognition) {
                this.recognition.stop();
                this.recognition = null;
            }

            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }

            this.isCapturing = false;
            this.onTranscriptUpdate = null;
            
            return true;
        } catch (error) {
            console.error('Error stopping system audio capture:', error);
            return false;
        }
    }

    cleanup() {
        this.stopCapture();
    }

    async recoverFromError() {
        try {
            if (this.isCapturing) {
                await this.stopCapture();
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.startCapture(this.onTranscriptUpdate);
            }
        } catch (error) {
            console.error('Failed to recover from error:', error);
        }
    }
} 