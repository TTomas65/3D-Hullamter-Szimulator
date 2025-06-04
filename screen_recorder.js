/**
 * Screen Recorder functionality for 3D Hullámtér Szimulátor
 * Uses MediaRecorder API to capture screen content and save as webm video
 */

// Global variables for recording
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Initialize screen recording functionality
window.addEventListener('DOMContentLoaded', () => {
    const recordScreenBtn = document.getElementById('recordScreenBtn');
    
    if (recordScreenBtn) {
        recordScreenBtn.addEventListener('click', toggleRecording);
    }
});

/**
 * Toggle recording state - start or stop recording
 */
async function toggleRecording() {
    const recordScreenBtn = document.getElementById('recordScreenBtn');
    
    if (!isRecording) {
        // Start recording
        try {
            // Get the canvas element from the renderer
            const canvas = renderer.domElement;
            
            // Create a stream from the canvas with maximum FPS for legjobb minőség
            const stream = canvas.captureStream(60); // 60 FPS a jobb minőségért
            
            // Ellenőrizzük a támogatott formátumokat
            const mimeTypes = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
                'video/mp4'
            ];
            
            // Keressünk egy támogatott formátumot
            let mimeType = '';
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
                    console.log(`Támogatott formátum: ${mimeType}`);
                    break;
                }
            }
            
            // Opciók beállítása a MediaRecorder számára a legjobb minőséghez
            const options = {
                videoBitsPerSecond: 8000000, // 8 Mbps - jelentősen magasabb bitráta a jobb minőségért
                audioBitsPerSecond: 128000   // 128 kbps audio (ha van hang)
            };
            
            // Ha találtunk támogatott formátumot, adjuk hozzá az opciókhoz
            if (mimeType) {
                options.mimeType = mimeType;
                console.log(`Felvétel minősége: ${options.videoBitsPerSecond/1000000} Mbps`);
            }
            
            // MediaRecorder inicializálása a megfelelő opciókkal
            mediaRecorder = new MediaRecorder(stream, options);
            
            // Event handler for data available
            mediaRecorder.ondataavailable = handleDataAvailable;
            
            // Event handler for recording stop
            mediaRecorder.onstop = handleStop;
            
            // Clear previous recordings
            recordedChunks = [];
            
            // Start recording
            mediaRecorder.start();
            
            // Update button text and state
            recordScreenBtn.textContent = 'Felvétel leállítása';
            recordScreenBtn.classList.add('recording');
            isRecording = true;
            
            console.log('Screen recording started');
        } catch (error) {
            console.error('Error starting screen recording:', error);
            alert('Hiba történt a képernyőfelvétel indításakor: ' + error.message);
        }
    } else {
        // Stop recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            
            // Reset button text and state
            recordScreenBtn.textContent = 'Képernyővideó';
            recordScreenBtn.classList.remove('recording');
            isRecording = false;
            
            console.log('Screen recording stopped');
        }
    }
}

/**
 * Handle data available event from MediaRecorder
 * @param {BlobEvent} event - The blob event containing recorded data
 */
function handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
    }
}

/**
 * Handle stop event from MediaRecorder
 * Creates a blob from recorded chunks and downloads it
 */
function handleStop() {
    // Create a blob from the recorded chunks
    const blob = new Blob(recordedChunks, {
        type: 'video/webm'
    });
    
    // Create a URL for the blob
    const url = URL.createObjectURL(blob);
    
    // Create a link element for downloading
    const a = document.createElement('a');
    
    // Get current date and time for filename
    const now = new Date();
    const fileName = `Rogzites_${now.toISOString().slice(0,19).replace(/[:T]/g,'-')}.webm`;
    
    // Set download attributes
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    
    // Add to document, trigger click and remove
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}
