// Akirapa Standalone Messaging App - Lightbox & Media Viewer Module

function openImageModal(url, altName = 'Image preview') {
  const modal = document.getElementById('mediaModal');
  const container = document.getElementById('modalMediaContainer');
  if (!modal || !container) return;

  container.innerHTML = `<img src="${url}" alt="${altName}" />`;
  modal.classList.remove('hidden');
}

function openVideoModal(url) {
  const modal = document.getElementById('mediaModal');
  const container = document.getElementById('modalMediaContainer');
  if (!modal || !container) return;

  container.innerHTML = `
    <video src="${url}" controls autoplay style="max-width: 90vw; max-height: 80vh; border-radius: 12px;"></video>
  `;
  modal.classList.remove('hidden');
}

function closeMediaModal(e) {
  const modal = document.getElementById('mediaModal');
  const container = document.getElementById('modalMediaContainer');
  if (modal) {
    modal.classList.add('hidden');
  }
  if (container) {
    container.innerHTML = '';
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMediaModal();
  }
});
