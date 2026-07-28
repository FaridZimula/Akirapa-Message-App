// Akirapa Standalone Messaging App - Audio Voice Recording Module

let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = 0;
let recordingTimerInterval = null;

function cleanupExistingRecording() {
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }
  if (mediaRecorder) {
    try {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
      }
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
    } catch (e) {
      console.warn('Error cleaning up media recorder:', e);
    }
    mediaRecorder = null;
  }
  audioChunks = [];
}

async function startAudioRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Voice recording is not supported in your browser or connection requires HTTPS.');
    return;
  }

  cleanupExistingRecording();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start();
    recordingStartTime = Date.now();
    updateRecordingTimer();
    recordingTimerInterval = setInterval(updateRecordingTimer, 1000);

    document.getElementById('standardInputBar').classList.add('hidden');
    document.getElementById('recordingBar').classList.remove('hidden');
  } catch (err) {
    console.error('Microphone access denied or error:', err);
    alert('Unable to access microphone. Please check permissions.');
  }
}

function updateRecordingTimer() {
  const elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
  const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const secs = String(elapsedSeconds % 60).padStart(2, '0');
  const timerEl = document.getElementById('recordingTimer');
  if (timerEl) {
    timerEl.textContent = `${mins}:${secs}`;
  }
}

function stopAudioRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      cleanupExistingRecording();
      resolve(null);
      return;
    }

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      mediaRecorder = null;
      resolve(audioBlob);
    };

    mediaRecorder.stop();
    if (recordingTimerInterval) {
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = null;
    }
  });
}

async function cancelAudioRecording() {
  cleanupExistingRecording();

  document.getElementById('standardInputBar').classList.remove('hidden');
  document.getElementById('recordingBar').classList.add('hidden');
}

async function stopAndSendAudioRecording() {
  const audioBlob = await stopAudioRecording();
  document.getElementById('standardInputBar').classList.remove('hidden');
  document.getElementById('recordingBar').classList.add('hidden');

  if (audioBlob && audioBlob.size > 0 && window.sendAudioMessage) {
    window.sendAudioMessage(audioBlob);
  }
}
