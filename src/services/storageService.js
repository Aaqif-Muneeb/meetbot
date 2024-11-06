class StorageService {
    constructor() {
        this.STORAGE_KEY = 'savedMeetings';
    }

    async saveMeeting(meetingData) {
        try {
            // Get existing meetings
            const existingMeetings = await this.getSavedMeetings();
            
            // Add new meeting
            existingMeetings.push(meetingData);
            
            // Save to chrome storage
            await chrome.storage.local.set({
                [this.STORAGE_KEY]: existingMeetings
            });

            // Automatically trigger download after saving
            await this.exportMeeting(meetingData);
            
            return true;
        } catch (error) {
            console.error('Failed to save meeting:', error);
            throw error;
        }
    }

    async getSavedMeetings() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEY);
            return result[this.STORAGE_KEY] || [];
        } catch (error) {
            console.error('Failed to get saved meetings:', error);
            return [];
        }
    }

    async exportMeeting(meeting) {
        try {
            const content = `
Meeting: ${meeting.name}
Date: ${new Date(meeting.timestamp).toLocaleString()}

${meeting.summary ? `Summary:
${meeting.summary}

` : ''}Full Transcript:
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
            throw error;
        }
    }
}

// Initialize the service
window.storageService = new StorageService();