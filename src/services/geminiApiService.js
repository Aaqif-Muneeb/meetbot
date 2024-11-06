class GeminiApiService {
    constructor() {
        this.API_KEY = CONSTANTS.GEMINI_API_KEY;
        this.API_URL = CONSTANTS.GEMINI_API_URL;
    }

    async generateSummary(transcript) {
        if (!this.API_KEY) {
            throw new Error('Gemini API key not set');
        }

        try {
            const response = await fetch(`${this.API_URL}?key=${this.API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Please analyze this meeting transcript and provide:
                                1. A concise summary of the key points discussed
                                2. Main topics covered
                                3. Any action items or decisions made
                                
                                Transcript:
                                ${transcript}`
                        }]
                    }]
                })
            });

            if (!response.ok) {
                console.error('Gemini API error:', await response.text());
                throw new Error('Failed to generate summary');
            }

            const data = await response.json();
            
            // Check if we have valid response data
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
                throw new Error('Invalid response format from Gemini API');
            }

            const summary = data.candidates[0].content.parts[0].text;

            return {
                summary: summary || 'No summary generated',
                fullTranscript: transcript,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error generating summary:', error);
            // Return a default summary instead of throwing
            return {
                summary: 'Summary generation failed. Full transcript is preserved.',
                fullTranscript: transcript,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Initialize the service
window.geminiApiService = new GeminiApiService(); 