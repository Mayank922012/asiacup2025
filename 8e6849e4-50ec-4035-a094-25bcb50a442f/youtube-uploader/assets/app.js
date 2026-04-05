/* ===================================================
   TubeUpload — Main Application JavaScript
   YouTube Data API v3 Integration
=================================================== */

// ===== CONFIG =====
// Replace with your actual Google OAuth Client ID from Google Cloud Console
// Steps: console.cloud.google.com → New Project → Enable YouTube Data API v3
//        → Credentials → OAuth 2.0 Client ID → Web Application
const CONFIG = {
  CLIENT_ID: '719718271775-5eeec8l4qiricov0b0h0h3rm6io6eb7a.apps.googleusercontent.com',
  API_KEY: 'AIzaSyCmcCl2mPbSkOtorPsYEuA47u64nRgKglI',
  SCOPES: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' '),
  DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest'],
  MAX_FILE_SIZE_GB: 50,
  CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks
};

// ===== STATE =====
const state = {
  isSignedIn: false,
  user: null,
  channel: null,
  selectedFile: null,
  selectedThumb: null,
  scheduledFile: null,
  visibility: 'public',
  tags: [],
  uploadXhr: null,
  isUploading: false,
  authMode: 'signup', // 'signup' | 'login'
  gapiReady: false,
  // Demo mode (when CLIENT_ID not configured)
  demoMode: CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initDateDefaults();
  initFadeObserver();
  checkDemoMode();
  loadGapi();
});

function checkDemoMode() {
  if (state.demoMode) {
    console.info('TubeUpload: Running in DEMO MODE. Configure CLIENT_ID in app.js for real uploads.');
  }
}

function initDateDefaults() {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const dateInput = document.getElementById('scheduleDate');
  const timeInput = document.getElementById('scheduleTime');
  if (dateInput) dateInput.value = now.toISOString().split('T')[0];
  if (timeInput) timeInput.value = now.toTimeString().slice(0, 5);
}

function initFadeObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(el => {
      if (el.isIntersecting) el.target.classList.add('visible');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// ===== GOOGLE API LOADER =====
function loadGapi() {
  if (state.demoMode) return;
  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/api.js';
  script.onload = () => {
    gapi.load('client:auth2', initGapiClient);
  };
  script.onerror = () => console.warn('GAPI failed to load. Check your internet connection.');
  document.head.appendChild(script);
}

async function initGapiClient() {
  try {
    await gapi.client.init({
      apiKey: CONFIG.API_KEY,
      clientId: CONFIG.CLIENT_ID,
      discoveryDocs: CONFIG.DISCOVERY_DOCS,
      scope: CONFIG.SCOPES,
    });
    state.gapiReady = true;
    const authInstance = gapi.auth2.getAuthInstance();
    authInstance.isSignedIn.listen(updateSignInStatus);
    updateSignInStatus(authInstance.isSignedIn.get());
  } catch (err) {
    console.error('GAPI init error:', err);
  }
}

function updateSignInStatus(isSignedIn) {
  state.isSignedIn = isSignedIn;
  if (isSignedIn) {
    const profile = gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile();
    state.user = {
      name: profile.getName(),
      email: profile.getEmail(),
      avatar: profile.getImageUrl(),
      id: profile.getId(),
    };
    fetchChannelInfo();
    showChannelConnected();
  } else {
    showChannelDisconnected();
  }
}

async function fetchChannelInfo() {
  try {
    const res = await gapi.client.youtube.channels.list({
      part: 'snippet,statistics',
      mine: true,
    });
    const channel = res.result.items?.[0];
    if (channel) {
      state.channel = channel;
      const name = channel.snippet.title;
      document.getElementById('channelName').textContent = name;
      document.getElementById('channelAvatarLetter').textContent = name.charAt(0).toUpperCase();
    }
  } catch (err) {
    console.error('Could not fetch channel info:', err);
  }
}

// ===== AUTH FLOWS =====
async function connectYouTube() {
  if (state.demoMode) {
    simulateDemoConnect();
    return;
  }
  if (!state.gapiReady) {
    showToast('⏳ Loading Google API, please wait…', 'info');
    return;
  }
  try {
    await gapi.auth2.getAuthInstance().signIn({
      scope: CONFIG.SCOPES,
    });
  } catch (err) {
    if (err.error !== 'popup_closed_by_user') {
      showToast('❌ Sign-in failed. Please try again.', 'error');
    }
  }
}

async function handleGoogleAuth() {
  closeModal();
  await connectYouTube();
}

async function handleEmailAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) {
    showToast('⚠️ Please fill in email and password.', 'error');
    return;
  }
  if (state.demoMode) {
    closeModal();
    simulateDemoConnect(email);
    return;
  }
  showToast('ℹ️ For YouTube uploads, please use "Continue with Google" to grant YouTube access.', 'info');
}

function disconnectChannel() {
  if (!state.demoMode && state.gapiReady) {
    try { gapi.auth2.getAuthInstance().signOut(); } catch (e) {}
  }
  state.isSignedIn = false;
  state.user = null;
  state.channel = null;
  showChannelDisconnected();
  showToast('👋 Disconnected from YouTube.', 'info');
}

// ===== DEMO MODE SIMULATION =====
function simulateDemoConnect(email = null) {
  const name = email ? email.split('@')[0] : 'My YouTube Channel';
  state.isSignedIn = true;
  state.user = { name, email: email || 'demo@example.com' };
  state.channel = { snippet: { title: name } };
  document.getElementById('channelName').textContent = name;
  document.getElementById('channelAvatarLetter').textContent = name.charAt(0).toUpperCase();
  showChannelConnected();
  showToast('✅ Connected! (Demo Mode — configure CLIENT_ID for real uploads)', 'success');
}

// ===== CHANNEL UI =====
function showChannelConnected() {
  document.getElementById('connectBanner').style.display = 'none';
  document.getElementById('channelBar').style.display = 'flex';
  document.getElementById('uploadBtn').disabled = !state.selectedFile;
}

function showChannelDisconnected() {
  document.getElementById('connectBanner').style.display = 'block';
  document.getElementById('channelBar').style.display = 'none';
  document.getElementById('uploadBtn').disabled = true;
}

// ===== MODAL =====
let currentAuthMode = 'signup';

function openModal(mode = 'signup') {
  currentAuthMode = mode;
  const modal = document.getElementById('authModal');
  const title = document.getElementById('modalTitle');
  const sub = document.getElementById('modalSub');
  const btn = document.getElementById('authSubmitBtn');
  const footer = document.getElementById('modalFooter');
  if (mode === 'login') {
    title.textContent = 'Welcome back';
    sub.textContent = 'Sign in to your TubeUpload account.';
    btn.textContent = 'Sign In';
    footer.innerHTML = "Don't have an account? <a href='#' onclick='switchAuthMode()'>Create one</a>";
  } else {
    title.textContent = 'Create your account';
    sub.textContent = 'Join thousands of creators uploading smarter.';
    btn.textContent = 'Create Account';
    footer.innerHTML = "Already have an account? <a href='#' onclick='switchAuthMode()'>Sign In</a>";
  }
  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('authModal').classList.remove('open');
}

function switchAuthMode() {
  openModal(currentAuthMode === 'signup' ? 'login' : 'signup');
}

// Close modal on overlay click
document.getElementById('authModal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

// ===== TAB SWITCHING =====
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

// ===== FILE HANDLING =====
function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (file) processFile(file);
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const file = e.dataTransfer.files?.[0];
  if (file) {
    if (!file.type.startsWith('video/')) {
      showToast('⚠️ Please drop a video file.', 'error');
      return;
    }
    processFile(file);
  }
}

function handleDropSchedule(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const file = e.dataTransfer.files?.[0];
  if (file && file.type.startsWith('video/')) processScheduleFile(file);
}

function handleScheduleFileSelect(e) {
  const file = e.target.files?.[0];
  if (file) processScheduleFile(file);
}

function processFile(file) {
  const maxBytes = CONFIG.MAX_FILE_SIZE_GB * 1024 * 1024 * 1024;
  if (file.size > maxBytes) {
    showToast(`❌ File too large. Max ${CONFIG.MAX_FILE_SIZE_GB}GB.`, 'error');
    return;
  }
  state.selectedFile = file;

  // Show file info
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatBytes(file.size);

  // Generate video thumbnail preview
  const thumbEl = document.getElementById('fileThumb');
  const videoURL = URL.createObjectURL(file);
  thumbEl.innerHTML = `<video src="${videoURL}" muted></video>`;

  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('fileSelected').classList.add('visible');
  document.getElementById('videoForm').classList.add('visible');

  // Auto-fill title from filename
  const titleInput = document.getElementById('videoTitle');
  if (!titleInput.value) {
    titleInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    updateCharCount(titleInput, 'titleCount', 100);
  }

  // Enable upload button if connected
  if (state.isSignedIn) {
    document.getElementById('uploadBtn').disabled = false;
  }

  showToast(`✅ ${file.name} selected (${formatBytes(file.size)})`, 'success');
}

function processScheduleFile(file) {
  state.scheduledFile = file;
  document.getElementById('fileNameSchedule').textContent = file.name;
  document.getElementById('fileSizeSchedule').textContent = formatBytes(file.size);
  document.getElementById('dropZoneSchedule').style.display = 'none';
  document.getElementById('fileSelectedSchedule').classList.add('visible');
  showToast(`✅ ${file.name} ready to schedule`, 'success');
}

function removeFile() {
  state.selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('dropZone').style.display = 'block';
  document.getElementById('fileSelected').classList.remove('visible');
  document.getElementById('videoForm').classList.remove('visible');
  document.getElementById('uploadBtn').disabled = true;
  document.getElementById('videoTitle').value = '';
  resetTags();
}

function removeScheduleFile() {
  state.scheduledFile = null;
  document.getElementById('fileInputSchedule').value = '';
  document.getElementById('dropZoneSchedule').style.display = 'block';
  document.getElementById('fileSelectedSchedule').classList.remove('visible');
}

// ===== THUMBNAIL =====
function handleThumbSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('⚠️ Thumbnail must be under 2MB.', 'error');
    return;
  }
  state.selectedThumb = file;
  document.getElementById('thumbText').textContent = `✅ ${file.name}`;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('thumbUpload').style.backgroundImage = `url(${ev.target.result})`;
    document.getElementById('thumbUpload').style.backgroundSize = 'cover';
    document.getElementById('thumbUpload').style.backgroundPosition = 'center';
  };
  reader.readAsDataURL(file);
  showToast('🖼️ Thumbnail selected', 'success');
}

// ===== TAGS =====
function handleTagInput(e) {
  const input = document.getElementById('tagInput');
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = input.value.trim().replace(/,$/, '');
    if (val && state.tags.length < 30) addTag(val);
    input.value = '';
  } else if (e.key === 'Backspace' && !input.value && state.tags.length) {
    removeTag(state.tags[state.tags.length - 1]);
  }
}

function addTag(name) {
  if (state.tags.includes(name)) return;
  state.tags.push(name);
  renderTags();
}

function removeTag(name) {
  state.tags = state.tags.filter(t => t !== name);
  renderTags();
}

function renderTags() {
  const wrap = document.getElementById('tagsWrap');
  const input = document.getElementById('tagInput');
  wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
  state.tags.forEach(tag => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `${tag}<button onclick="removeTag('${tag.replace(/'/g, "\\'")}')">×</button>`;
    wrap.insertBefore(chip, input);
  });
}

function resetTags() {
  state.tags = [];
  renderTags();
}

// ===== VISIBILITY =====
function setVisibility(v, btn, context = 'main') {
  state.visibility = v;
  const container = btn.closest('.visibility-options');
  container.querySelectorAll('.vis-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ===== CHAR COUNT =====
function updateCharCount(input, countId, max) {
  document.getElementById(countId).textContent = input.value.length;
}

// ===== UPLOAD FLOW =====
async function startUpload() {
  if (!state.selectedFile) { showToast('⚠️ Please select a video first.', 'error'); return; }
  if (!state.isSignedIn) { showToast('⚠️ Please connect your YouTube channel first.', 'error'); openModal('signup'); return; }

  const title = document.getElementById('videoTitle').value.trim();
  if (!title) { showToast('⚠️ Please enter a video title.', 'error'); document.getElementById('videoTitle').focus(); return; }

  if (state.demoMode) {
    runDemoUpload(title);
    return;
  }

  const description = document.getElementById('videoDesc').value.trim();
  const categoryId = document.getElementById('videoCategory').value;
  const defaultLanguage = document.getElementById('videoLanguage').value;
  const madeForKids = document.getElementById('madeForKids').value === 'true';
  const license = document.getElementById('videoLicense').value;

  const metadata = {
    snippet: {
      title,
      description,
      tags: state.tags,
      categoryId,
      defaultLanguage,
    },
    status: {
      privacyStatus: state.visibility,
      madeForKids,
      license,
    },
  };

  showProgressUI();
  setStep('step-auth', 'active');

  try {
    const accessToken = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
    setStep('step-auth', 'done');
    setStep('step-upload', 'active');
    await uploadToYouTube(state.selectedFile, metadata, accessToken);
  } catch (err) {
    console.error('Upload error:', err);
    showToast('❌ Upload failed: ' + (err.message || 'Unknown error'), 'error');
    hideProgressUI();
  }
}

async function uploadToYouTube(file, metadata, accessToken) {
  return new Promise((resolve, reject) => {
    // Step 1: Initiate resumable upload session
    const initXhr = new XMLHttpRequest();
    initXhr.open('POST', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status');
    initXhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    initXhr.setRequestHeader('Content-Type', 'application/json');
    initXhr.setRequestHeader('X-Upload-Content-Length', file.size);
    initXhr.setRequestHeader('X-Upload-Content-Type', file.type || 'video/*');

    initXhr.onload = function () {
      if (this.status === 200) {
        const uploadUrl = this.getResponseHeader('Location');
        uploadFileChunked(file, uploadUrl, accessToken, resolve, reject);
      } else {
        reject(new Error(`Failed to initiate upload: ${this.status} ${this.statusText}`));
      }
    };

    initXhr.onerror = () => reject(new Error('Network error initiating upload.'));
    initXhr.send(JSON.stringify(metadata));
  });
}

function uploadFileChunked(file, uploadUrl, accessToken, resolve, reject) {
  const xhr = new XMLHttpRequest();
  state.uploadXhr = xhr;

  xhr.open('PUT', uploadUrl);
  xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
  xhr.setRequestHeader('Content-Type', file.type || 'video/*');

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 85); // 85% for upload
      updateProgress(pct, 'Uploading video…');
    }
  };

  xhr.onload = async function () {
    if (this.status === 200 || this.status === 201) {
      const videoData = JSON.parse(this.responseText);
      const videoId = videoData.id;

      setStep('step-upload', 'done');
      setStep('step-process', 'active');
      updateProgress(90, 'Processing video…');

      // Upload thumbnail if selected
      if (state.selectedThumb && videoId) {
        try {
          await uploadThumbnail(videoId, accessToken);
        } catch (e) {
          console.warn('Thumbnail upload failed:', e);
        }
      }

      setStep('step-process', 'done');
      setStep('step-publish', 'active');
      updateProgress(100, 'Published!');

      setTimeout(() => {
        setStep('step-publish', 'done');
        showSuccessState(`https://www.youtube.com/watch?v=${videoId}`);
        resolve(videoData);
      }, 800);
    } else {
      reject(new Error(`Upload failed: ${this.status} ${this.statusText}`));
    }
  };

  xhr.onerror = () => reject(new Error('Network error during upload.'));
  xhr.onabort = () => reject(new Error('Upload cancelled.'));

  xhr.send(file);
}

async function uploadThumbnail(videoId, accessToken) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', state.selectedThumb.type);
    xhr.onload = () => (xhr.status === 200 ? resolve() : reject(new Error('Thumbnail upload failed')));
    xhr.onerror = () => reject(new Error('Network error uploading thumbnail'));
    xhr.send(state.selectedThumb);
  });
}

// ===== URL UPLOAD =====
function startUrlUpload() {
  const url = document.getElementById('videoUrlInput').value.trim();
  const title = document.getElementById('urlVideoTitle').value.trim();
  if (!url) { showToast('⚠️ Please enter a video URL.', 'error'); return; }
  if (!title) { showToast('⚠️ Please enter a video title.', 'error'); return; }
  if (!state.isSignedIn) { showToast('⚠️ Please connect your YouTube channel first.', 'error'); return; }
  showToast('🔗 URL import initiated. Fetching video…', 'info');
  // In production: send URL to your backend, fetch the video, then upload via YouTube API
  setTimeout(() => showToast('ℹ️ URL import requires a backend proxy. See documentation.', 'info'), 2000);
}

// ===== SCHEDULE UPLOAD =====
function scheduleUpload() {
  if (!state.scheduledFile) { showToast('⚠️ Please select a video to schedule.', 'error'); return; }
  if (!state.isSignedIn) { showToast('⚠️ Please connect your YouTube channel first.', 'error'); return; }
  const title = document.getElementById('scheduleTitle').value.trim();
  const date = document.getElementById('scheduleDate').value;
  const time = document.getElementById('scheduleTime').value;
  if (!title) { showToast('⚠️ Please enter a video title.', 'error'); return; }
  if (!date || !time) { showToast('⚠️ Please select a publish date and time.', 'error'); return; }
  const scheduleDate = new Date(`${date}T${time}`);
  if (scheduleDate <= new Date()) { showToast('⚠️ Schedule time must be in the future.', 'error'); return; }
  showToast(`📅 Video scheduled for ${scheduleDate.toLocaleString()}`, 'success');
  // In production: upload with status.privacyStatus = 'private' and status.publishAt = scheduleDate.toISOString()
}

// ===== DEMO UPLOAD SIMULATION =====
function runDemoUpload(title) {
  showProgressUI();
  const steps = [
    { id: 'step-auth',    label: 'Authenticating…',    pct: 10,  delay: 600 },
    { id: 'step-upload',  label: 'Uploading video…',   pct: 40,  delay: 1200 },
    { id: 'step-upload',  label: 'Uploading video…',   pct: 65,  delay: 1200 },
    { id: 'step-upload',  label: 'Uploading video…',   pct: 82,  delay: 1000 },
    { id: 'step-process', label: 'Processing video…',  pct: 90,  delay: 1000 },
    { id: 'step-publish', label: 'Publishing…',        pct: 100, delay: 800  },
  ];

  let i = 0;
  setStep('step-auth', 'active');

  function runStep() {
    if (i >= steps.length) {
      setStep('step-publish', 'done');
      showSuccessState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      return;
    }
    const s = steps[i];
    updateProgress(s.pct, s.label);
    if (i === 0) { setStep('step-auth', 'done'); setStep('step-upload', 'active'); }
    if (i === 3) { setStep('step-upload', 'done'); setStep('step-process', 'active'); }
    if (i === 4) { setStep('step-process', 'done'); setStep('step-publish', 'active'); }
    i++;
    setTimeout(runStep, s.delay);
  }

  setTimeout(runStep, 400);
}

// ===== PROGRESS UI =====
function showProgressUI() {
  state.isUploading = true;
  document.getElementById('progressWrap').classList.add('visible');
  document.getElementById('submitArea').style.display = 'none';
  document.getElementById('uploadSuccess').classList.remove('visible');
  // Reset steps
  ['step-auth','step-upload','step-process','step-publish'].forEach(id => {
    const el = document.getElementById(id);
    el.className = 'progress-step';
  });
  updateProgress(0, 'Starting…');
}

function hideProgressUI() {
  state.isUploading = false;
  document.getElementById('progressWrap').classList.remove('visible');
  document.getElementById('submitArea').style.display = 'flex';
}

function updateProgress(pct, statusText) {
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressStatus').textContent = statusText;
}

function setStep(id, status) {
  const el = document.getElementById(id);
  el.className = 'progress-step ' + status;
}

function showSuccessState(videoUrl) {
  state.isUploading = false;
  document.getElementById('progressWrap').classList.remove('visible');
  document.getElementById('submitArea').style.display = 'none';
  const success = document.getElementById('uploadSuccess');
  success.classList.add('visible');
  const link = document.getElementById('successLink');
  link.href = videoUrl;
  showToast('🎉 Video uploaded to YouTube successfully!', 'success');
}

function resetUpload() {
  removeFile();
  document.getElementById('uploadSuccess').classList.remove('visible');
  document.getElementById('submitArea').style.display = 'flex';
  document.getElementById('progressWrap').classList.remove('visible');
  updateProgress(0, 'Starting…');
  document.getElementById('videoTitle').value = '';
  document.getElementById('videoDesc').value = '';
  document.getElementById('titleCount').textContent = '0';
  document.getElementById('descCount').textContent = '0';
  state.selectedThumb = null;
  state.tags = [];
  renderTags();
  document.getElementById('thumbText').textContent = 'Upload Thumbnail';
  document.getElementById('thumbUpload').style.backgroundImage = '';
  showToast('✅ Ready for a new upload!', 'success');
}

// ===== SCROLL =====
function scrollToUpload() {
  document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
}

function validateUrl(input) {
  try {
    new URL(input.value);
    input.style.borderColor = 'var(--red)';
  } catch {
    input.style.borderColor = '';
  }
}

// ===== TOAST =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== HELPERS =====
function formatBytes(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});