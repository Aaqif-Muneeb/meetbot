class SidePanelController {
    constructor() {
        document.querySelector('.container').classList.add('side-panel-controller');
        this.isRecording = false;
        this.startTime = null;
        this.timerInterval = null;
        this.isSystemAudioActive = false;

        // Initialize services properly
        this.transcriptionService = window.transcriptionService;
        this.systemAudioService = new SystemAudioService();

        this.elements = {
            recordButton: document.getElementById('recordButton'),
            transcriptArea: document.getElementById('transcriptArea'),
            meetingsList: document.getElementById('meetingsList'),
            timer: document.getElementById('timer'),
            statusText: document.querySelector('.status-text'),
            micStatus: document.querySelector('.mic-status'),
            systemStatus: document.querySelector('.system-status')
        };

        this.initialize();
    }

    async initialize() {
        try {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
            
            if (permissionStatus.state === 'granted') {
                this.elements.recordButton.disabled = false;
                this.elements.recordButton.textContent = 'Start Recording';
                this.setupEventListeners();
                this.loadSavedMeetings();
            } else {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                
                this.elements.recordButton.disabled = false;
                this.elements.recordButton.textContent = 'Start Recording';
                this.setupEventListeners();
                this.loadSavedMeetings();
            }

            permissionStatus.addEventListener('change', (e) => {
                this.elements.recordButton.disabled = e.target.state !== 'granted';
                this.elements.recordButton.textContent = e.target.state === 'granted' 
                    ? 'Start Recording' 
                    : 'Microphone Access Needed';
            });

        } catch (error) {
            console.error('Microphone permission error:', error);
            this.elements.recordButton.disabled = true;
            this.elements.recordButton.textContent = 'Microphone Access Needed';
            this.elements.statusText.textContent = 'Please enable microphone access and reload';
        }
    }

    setupEventListeners() {
        this.elements.recordButton.addEventListener('click', () => {
            if (!this.isRecording) {
                this.startRecording();
            } else {
                this.stopRecording();
            }
        });

        transcriptionService.setTranscriptUpdateCallback((finalTranscript, interimTranscript) => {
            this.updateTranscriptDisplay(finalTranscript, interimTranscript);
        });
    }

    async startRecording() {
        try {
            // Start microphone recording first
            await this.transcriptionService.startRecording();
            
            // Initialize system audio after microphone is confirmed working
            try {
                await this.systemAudioService.startCapture((finalTranscript, interimTranscript) => {
                    if (finalTranscript || interimTranscript) {
                        this.updateTranscriptDisplay(
                            finalTranscript ? "[Meeting Member(s)] " + finalTranscript : "",
                            interimTranscript ? "[Meeting Member(s)] " + interimTranscript : ""
                        );
                    }
                });
                this.isSystemAudioActive = true;
                this.elements.systemStatus.classList.add('active');
            } catch (error) {
                console.warn('System audio capture failed:', error);
                this.isSystemAudioActive = false;
                this.elements.systemStatus.classList.remove('active');
            }
            
            this.isRecording = true;
            this.updateUI(true);
            this.startTimer();
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showError('Failed to start recording. Please try again.');
        }
    }

    async stopRecording() {
        this.systemAudioService.stopCapture();
        this.isSystemAudioActive = false;
        this.elements.systemStatus.classList.remove('active');
        
        const transcript = this.transcriptionService.stopRecording();
        this.clearTranscriptArea();
        this.isRecording = false;
        this.updateUI(false);
        this.stopTimer();

        try {
            const meetingName = await this.promptMeetingName();
            if (meetingName) {
                const overlay = document.createElement('div');
                overlay.className = 'processing-overlay';
                overlay.innerHTML = `
                    <div class="processing-spinner"></div>
                    <div class="processing-text">Processing your meeting recording...</div>
                `;
                document.body.appendChild(overlay);

                try {
                    const summaryData = await geminiApiService.generateSummary(transcript);
                    await this.saveMeeting(meetingName, transcript, summaryData);
                    overlay.innerHTML = `
                        <div class="processing-spinner" style="border-top-color: #4CAF50;"></div>
                        <div class="processing-text">Meeting saved successfully!</div>
                    `;
                    setTimeout(() => {
                        overlay.remove();
                    }, 1500);
                } catch (error) {
                    console.error('Error processing meeting data:', error);
                    overlay.innerHTML = `
                        <div class="processing-spinner" style="border-top-color: #ff4444;"></div>
                        <div class="processing-text">Error processing meeting.<br>Saving transcript only...</div>
                    `;
                    const defaultSummaryData = {
                        summary: 'Summary generation failed. Full transcript is preserved.',
                        fullTranscript: transcript,
                        timestamp: new Date().toISOString()
                    };
                    await this.saveMeeting(meetingName, transcript, defaultSummaryData);
                    setTimeout(() => {
                        overlay.remove();
                    }, 1500);
                }
            }
        } catch (error) {
            console.error('Failed to save meeting:', error);
            alert('Failed to save meeting. Please try again.');
        }
    }

    updateUI(isRecording) {
        this.elements.recordButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
        this.elements.recordButton.classList.toggle('recording', isRecording);
        this.elements.statusText.textContent = `Recording Status: ${isRecording ? 'Recording' : 'Idle'}`;
        this.elements.micStatus.classList.toggle('active', isRecording);
        
        if (!isRecording || this.isSystemAudioActive) {
            this.elements.systemStatus.classList.toggle('active', this.isSystemAudioActive);
        }
    }

    updateTranscriptDisplay(finalTranscript, interimTranscript) {
        const transcriptArea = this.elements.transcriptArea;
        
        // Handle interim transcript
        if (interimTranscript) {
            let interimLine = transcriptArea.querySelector('.interim-line');
            if (!interimLine) {
                interimLine = document.createElement('div');
                interimLine.className = 'transcript-line interim-line';
                
                const timestamp = document.createElement('span');
                timestamp.className = 'transcript-timestamp';
                timestamp.textContent = new Date().toLocaleTimeString();
                
                const textSpan = document.createElement('span');
                textSpan.className = 'transcript-text interim';
                
                interimLine.appendChild(timestamp);
                interimLine.appendChild(textSpan);
                transcriptArea.appendChild(interimLine);
            }
            const textSpan = interimLine.querySelector('.transcript-text');
            if (textSpan.textContent !== interimTranscript) {
                textSpan.textContent = interimTranscript;
            }
        } else {
            const interimLine = transcriptArea.querySelector('.interim-line');
            if (interimLine) interimLine.remove();
        }

        // Handle final transcript
        if (finalTranscript && finalTranscript.trim()) {
            // Check if this exact transcript already exists
            const existingLines = transcriptArea.querySelectorAll('.final-line');
            const isDuplicate = Array.from(existingLines).some(line => 
                line.querySelector('.transcript-text').textContent === finalTranscript.trim()
            );

            if (!isDuplicate) {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'transcript-line final-line';
                
                const timestamp = document.createElement('span');
                timestamp.className = 'transcript-timestamp';
                timestamp.textContent = new Date().toLocaleTimeString();
                
                const textSpan = document.createElement('span');
                textSpan.className = 'transcript-text';
                textSpan.textContent = finalTranscript.trim();
                
                lineDiv.appendChild(timestamp);
                lineDiv.appendChild(textSpan);
                transcriptArea.appendChild(lineDiv);
                
                transcriptArea.scrollTop = transcriptArea.scrollHeight;
            }
        }
    }

    startTimer() {
        this.startTime = Date.now();
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            this.updateTimerDisplay();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.startTime = null;
        this.elements.timer.textContent = '00:00:00';
    }

    updateTimerDisplay() {
        if (!this.startTime) return;
        
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        
        this.elements.timer.textContent = 
            `${hours.toString().padStart(2, '0')}:${
             minutes.toString().padStart(2, '0')}:${
             seconds.toString().padStart(2, '0')}`;
    }

    async promptMeetingName() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'name-prompt-modal';
            
            const defaultName = `Meeting ${new Date().toLocaleString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: true
            })}`;

            modal.innerHTML = `
                <div class="name-prompt-content">
                    <h3>Save Meeting Recording</h3>
                    <input 
                        type="text" 
                        id="meetingNameInput" 
                        value="${defaultName}"
                        placeholder="Enter meeting name"
                        autofocus
                    >
                    <button id="saveMeetingBtn">Save Meeting</button>
                </div>
            `;

            document.body.appendChild(modal);

            const input = modal.querySelector('#meetingNameInput');
            const saveBtn = modal.querySelector('#saveMeetingBtn');

            input.addEventListener('focus', () => input.select());

            const handleSave = () => {
                const name = input.value.trim() || defaultName;
                modal.remove();
                resolve(name);
            };

            saveBtn.addEventListener('click', handleSave);

            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleSave();
                }
            });

            setTimeout(() => input.focus(), 100);
        });
    }

    async saveMeeting(meetingName, transcript, summaryData) {
        try {
            const meetingData = {
                id: Date.now().toString(),
                name: meetingName,
                timestamp: new Date().toISOString(),
                summary: summaryData.summary,
                fullTranscript: transcript
            };

            await storageService.saveMeeting(meetingData);
            await this.loadSavedMeetings();
            return true;
        } catch (error) {
            console.error('Failed to save meeting:', error);
            throw error;
        }
    }

    async loadMeetings() {
        const data = await chrome.storage.local.get('meetings');
        return data.meetings || [];
    }

    async loadSavedMeetings() {
        try {
            const meetings = await storageService.getSavedMeetings();
            const meetingsList = this.elements.meetingsList;
            meetingsList.innerHTML = '';

            meetings.reverse().forEach(meeting => {
                const meetingElement = document.createElement('div');
                meetingElement.className = 'meeting-item';
                
                meetingElement.innerHTML = `
                    <div class="meeting-header">
                        <h3>${meeting.name}</h3>
                        <span class="meeting-date">${new Date(meeting.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="meeting-actions">
                        <button class="view-btn">View</button>
                        <button class="download-btn">Download</button>
                    </div>
                `;

                const viewBtn = meetingElement.querySelector('.view-btn');
                const downloadBtn = meetingElement.querySelector('.download-btn');

                viewBtn.addEventListener('click', () => this.viewMeeting(meeting));
                downloadBtn.addEventListener('click', () => this.exportMeeting(meeting));

                meetingsList.appendChild(meetingElement);
            });
        } catch (error) {
            console.error('Failed to load meetings:', error);
        }
    }

    viewMeeting(meeting) {
        const modal = document.createElement('div');
        modal.className = 'meeting-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${meeting.name}</h2>
                    <span class="meeting-date">${new Date(meeting.timestamp).toLocaleString()}</span>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    ${meeting.summary ? `
                        <h3>Summary</h3>
                        <div class="summary-content">${meeting.summary.replace(/\n/g, '<br>')}</div>
                    ` : ''}
                    <h3>Full Transcript</h3>
                    <div class="transcript-content">
                        ${meeting.fullTranscript.split('\n')
                            .filter(line => line.trim())
                            .map(line => `<div class="transcript-line">${line}</div>`)
                            .join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => modal.remove());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    async exportMeeting(meeting) {
        try {
            const content = `
Meeting: ${meeting.name}
Date: ${new Date(meeting.timestamp).toLocaleString()}

${meeting.summary ? `Summary:
${meeting.summary}

` : ''}
Full Transcript:
${meeting.fullTranscript.split('\n')
    .filter(line => line.trim())
    .join('\n')}
`.trim();

            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const filename = `meeting_${meeting.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0,10)}.txt`;
            
            await chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
            });

            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return true;
        } catch (error) {
            console.error('Failed to export meeting:', error);
            alert('Failed to export meeting. Please try again.');
        }
    }

    showError(message) {
        console.error(message);
        alert(message);
    }

    clearTranscriptArea() {
        if (this.elements.transcriptArea) {
            this.elements.transcriptArea.innerHTML = '';
        }
    }

    handleSystemAudioStatus(isActive) {
        this.isSystemAudioActive = isActive;
        this.elements.systemStatus.classList.toggle('active', isActive);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SidePanelController();
}); 