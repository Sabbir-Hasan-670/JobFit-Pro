// ============================================================
// JobFit Pro — Settings Page Logic
// Handles: API key auto-detection, key removal, CV stats, preferences
// ============================================================

// ---- DOM References ----
const apiProviderEl          = document.getElementById('apiProvider');
const autoDetectBadgeEl      = document.getElementById('autoDetectBadge');
const openrouterModelGroupEl = document.getElementById('openrouterModelGroup');
const openrouterModelEl      = document.getElementById('openrouterModel');
const apiKeyEl               = document.getElementById('apiKey');
const apiKeyHintEl           = document.getElementById('apiKeyHint');
const toggleKeyBtn           = document.getElementById('toggleApiKey');
const eyeIcon                = document.getElementById('eyeIcon');
const pasteApiKeyBtnEl       = document.getElementById('pasteApiKeyBtn');
const removeApiKeyBtnEl      = document.getElementById('removeApiKeyBtn');
const apiStatusTextEl        = document.getElementById('apiStatusText');

const cvTextEl               = document.getElementById('cvText');
const charCountEl            = document.getElementById('charCount');
const wordCountEl            = document.getElementById('wordCount');
const lineCountEl            = document.getElementById('lineCount');
const cvStrengthEl           = document.getElementById('cvStrength');
const cvStatsEl              = document.getElementById('cvStats');
const clearCvBtn             = document.getElementById('clearCvBtn');
const pasteCvBtn             = document.getElementById('pasteCvBtn');

const autoScanEl             = document.getElementById('autoScan');
const showBadgeEl            = document.getElementById('showBadge');
const saveBtnEl              = document.getElementById('saveBtn');
const saveToastEl            = document.getElementById('saveToast');
const toastMsgEl             = document.getElementById('toastMessage');

// ---- Profile DOM References (Autofill) ----
const autoPopulateProfileBtnEl = document.getElementById('autoPopulateProfileBtn');
const autoPopulateSpinnerEl   = document.getElementById('autoPopulateSpinner');

const profileFields = {
  firstName:      document.getElementById('profileFirstName'),
  lastName:       document.getElementById('profileLastName'),
  email:          document.getElementById('profileEmail'),
  phone:          document.getElementById('profilePhone'),
  city:           document.getElementById('profileCity'),
  state:          document.getElementById('profileState'),
  country:        document.getElementById('profileCountry'),
  zipCode:        document.getElementById('profileZip'),
  linkedinUrl:    document.getElementById('profileLinkedin'),
  githubUrl:      document.getElementById('profileGithub'),
  portfolioUrl:   document.getElementById('profilePortfolio'),
  workAuth:       document.getElementById('profileWorkAuth'),
  sponsorship:    document.getElementById('profileSponsorship'),
  experience:     document.getElementById('profileExperience'),
  currentTitle:   document.getElementById('profileCurrentTitle'),
  currentCompany: document.getElementById('profileCurrentCompany'),
  noticePeriod:   document.getElementById('profileNoticePeriod'),
  salary:         document.getElementById('profileSalary'),
  degree:         document.getElementById('profileDegree'),
  university:     document.getElementById('profileUniversity'),
  gradYear:       document.getElementById('profileGradYear'),
  gender:         document.getElementById('profileGender'),
  veteran:        document.getElementById('profileVeteran'),
  disability:     document.getElementById('profileDisability'),
};

// ---- API Key hints per provider ----
const API_HINTS = {
  gemini:     'Get your key from Google AI Studio (aistudio.google.com)',
  openrouter: 'Get your key from OpenRouter (openrouter.ai/keys) — Supports 200+ AI Models!',
  openai:     'Get your key from platform.openai.com/api-keys',
};

// ============================================================
// AUTO-DETECT PROVIDER FROM KEY FORMAT
// ============================================================
function detectAndApplyProvider(key) {
  const cleanKey = (key || '').trim();

  if (!cleanKey) {
    if (autoDetectBadgeEl) autoDetectBadgeEl.style.display = 'none';
    updateApiKeyStatus(false);
    return;
  }

  // OpenRouter keys start with 'sk-or-v1-'
  if (cleanKey.startsWith('sk-or-v1-')) {
    apiProviderEl.value = 'openrouter';
    if (autoDetectBadgeEl) {
      autoDetectBadgeEl.textContent = '⚡ Auto-detected: OpenRouter';
      autoDetectBadgeEl.style.display = 'inline-block';
    }
  }
  // Google Gemini API keys typically start with 'AIza'
  else if (cleanKey.startsWith('AIza')) {
    apiProviderEl.value = 'gemini';
    if (autoDetectBadgeEl) {
      autoDetectBadgeEl.textContent = '⚡ Auto-detected: Gemini';
      autoDetectBadgeEl.style.display = 'inline-block';
    }
  } 
  // OpenAI API keys typically start with 'sk-' or 'sk-proj-'
  else if (cleanKey.startsWith('sk-')) {
    apiProviderEl.value = 'openai';
    if (autoDetectBadgeEl) {
      autoDetectBadgeEl.textContent = '⚡ Auto-detected: OpenAI';
      autoDetectBadgeEl.style.display = 'inline-block';
    }
  } else {
    if (autoDetectBadgeEl) autoDetectBadgeEl.style.display = 'none';
  }

  updateApiHint();
  updateApiKeyStatus(true);
}

function updateApiKeyStatus(hasKey) {
  if (hasKey) {
    apiStatusTextEl.textContent = '● Key entered';
    apiStatusTextEl.className = 'api-status-text saved';
    if (removeApiKeyBtnEl) removeApiKeyBtnEl.style.display = 'inline-flex';
  } else {
    apiStatusTextEl.textContent = 'No key saved';
    apiStatusTextEl.className = 'api-status-text';
    if (removeApiKeyBtnEl) removeApiKeyBtnEl.style.display = 'none';
  }
}

// ============================================================
// INIT — Load saved settings & candidate profile
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get([
    'apiProvider', 'apiKey', 'openrouterModel', 'cvText', 'autoScan', 'showBadge',
    'userProfile'
  ]);

  if (data.apiProvider) apiProviderEl.value = data.apiProvider;
  if (data.openrouterModel && openrouterModelEl) openrouterModelEl.value = data.openrouterModel;

  if (data.apiKey) {
    apiKeyEl.value = data.apiKey;
    detectAndApplyProvider(data.apiKey);
    apiStatusTextEl.textContent = '✓ Saved in browser';
    apiStatusTextEl.className = 'api-status-text saved';
    if (removeApiKeyBtnEl) removeApiKeyBtnEl.style.display = 'inline-flex';
  } else {
    updateApiKeyStatus(false);
  }

  if (data.cvText) cvTextEl.value = data.cvText;
  if (data.autoScan  !== undefined) autoScanEl.checked  = data.autoScan;
  if (data.showBadge !== undefined) showBadgeEl.checked = data.showBadge;

  // Load user profile fields if saved
  if (data.userProfile) {
    const p = data.userProfile;
    Object.keys(profileFields).forEach(key => {
      if (profileFields[key] && p[key] !== undefined && p[key] !== '') {
        profileFields[key].value = p[key];
      }
    });
  }

  updateApiHint();
  updateCvStats();
});

// ---- API Key Input Listeners (Auto-Detection) ----
apiKeyEl.addEventListener('input', () => {
  detectAndApplyProvider(apiKeyEl.value);
});

apiKeyEl.addEventListener('paste', () => {
  setTimeout(() => detectAndApplyProvider(apiKeyEl.value), 50);
});

// ---- Provider change manually ----
apiProviderEl.addEventListener('change', () => {
  if (autoDetectBadgeEl) autoDetectBadgeEl.style.display = 'none';
  updateApiHint();
});

function updateApiHint() {
  const provider = apiProviderEl.value;
  apiKeyHintEl.textContent = API_HINTS[provider] || '';

  // Show/hide OpenRouter model field
  if (openrouterModelGroupEl) {
    openrouterModelGroupEl.style.display = provider === 'openrouter' ? 'flex' : 'none';
  }
}

// ---- OpenRouter Model Catalog Data ----
const PRELOADED_OPENROUTER_MODELS = [
  // Smart Auto Router
  { id: 'openrouter/auto', name: 'OpenRouter Auto (Best & Fast)', category: '🌟 Recommended (Auto)', badge: 'AUTO', badgeClass: 'badge-pro' },

  // Live 100% Free Models
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Google Gemma 4 26B', category: 'Free Models (Active)', badge: 'FREE', badgeClass: 'badge-free' },
  { id: 'google/gemma-4-31b-it:free', name: 'Google Gemma 4 31B', category: 'Free Models (Active)', badge: 'FREE', badgeClass: 'badge-free' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nvidia Nemotron 30B', category: 'Free Models (Active)', badge: 'FREE', badgeClass: 'badge-free' },
  { id: 'openai/gpt-oss-20b:free', name: 'OpenAI GPT OSS 20B', category: 'Free Models (Active)', badge: 'FREE', badgeClass: 'badge-free' },
  { id: 'inclusionai/ling-3.0-flash:free', name: 'Ling 3.0 Flash', category: 'Free Models (Active)', badge: 'FREE', badgeClass: 'badge-free' },
  { id: 'poolside/laguna-s-2.1:free', name: 'Poolside Laguna S 2.1', category: 'Free Models (Active)', badge: 'FREE', badgeClass: 'badge-free' },
  
  // Flagship & Paid Models
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', category: 'Top Flagship Models', badge: 'FAST', badgeClass: 'badge-fast' },
  { id: 'openai/gpt-4o', name: 'GPT-4o (Omni)', category: 'Top Flagship Models', badge: 'PRO', badgeClass: 'badge-pro' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', category: 'Top Flagship Models', badge: 'PRO', badgeClass: 'badge-pro' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', category: 'Top Flagship Models', badge: 'FAST', badgeClass: 'badge-fast' },
  { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', category: 'Top Flagship Models', badge: 'PRO', badgeClass: 'badge-pro' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 Official', category: 'Top Flagship Models', badge: 'PRO', badgeClass: 'badge-pro' },
];

let availableModelsList = [...PRELOADED_OPENROUTER_MODELS];

const toggleModelListBtnEl   = document.getElementById('toggleModelListBtn');
const modelDropdownCatalogEl = document.getElementById('modelDropdownCatalog');
const modelListScrollableEl  = document.getElementById('modelListScrollable');
const fetchLiveModelsBtnEl   = document.getElementById('fetchLiveModelsBtn');
const fetchBtnTextEl         = document.getElementById('fetchBtnText');
const browseChevronEl        = document.getElementById('browseChevron');

function renderModelDropdown(filterQuery = '') {
  if (!modelListScrollableEl) return;
  const q = filterQuery.toLowerCase().trim();

  const filtered = availableModelsList.filter(m => 
    !q || 
    m.name.toLowerCase().includes(q) || 
    m.id.toLowerCase().includes(q) || 
    m.category.toLowerCase().includes(q) ||
    (m.badge && m.badge.toLowerCase().includes(q))
  );

  if (filtered.length === 0) {
    modelListScrollableEl.innerHTML = `
      <div style="padding: 14px; text-align: center; color: var(--text-muted); font-size: 11.5px;">
        No models found matching "<strong>${filterQuery}</strong>".<br>
        <span style="font-size:10.5px; opacity:0.8;">You can still keep this custom ID entered!</span>
      </div>
    `;
    return;
  }

  // Group by category
  const categories = {};
  filtered.forEach(m => {
    if (!categories[m.category]) categories[m.category] = [];
    categories[m.category].push(m);
  });

  let html = '';
  for (const [catName, models] of Object.entries(categories)) {
    html += `<div class="model-category-label">${catName}</div>`;
    models.forEach(m => {
      const isSelected = openrouterModelEl && openrouterModelEl.value === m.id;
      html += `
        <div class="model-item ${isSelected ? 'selected' : ''}" data-model-id="${m.id}">
          <div class="model-item-info">
            <div class="model-item-name">${m.name}</div>
            <div class="model-item-id">${m.id}</div>
          </div>
          <span class="model-item-badge ${m.badgeClass || 'badge-free'}">${m.badge || 'AI'}</span>
        </div>
      `;
    });
  }

  modelListScrollableEl.innerHTML = html;

  // Add click listeners to items
  modelListScrollableEl.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const modelId = item.getAttribute('data-model-id');
      if (modelId && openrouterModelEl) {
        openrouterModelEl.value = modelId;
        syncQuickPickTags(modelId);
        closeModelDropdown();
      }
    });
  });
}

function syncQuickPickTags(selectedModelId) {
  document.querySelectorAll('.quick-pick-tag').forEach(tag => {
    if (tag.getAttribute('data-model') === selectedModelId) {
      tag.classList.add('active');
    } else {
      tag.classList.remove('active');
    }
  });
}

function openModelDropdown() {
  if (modelDropdownCatalogEl) {
    renderModelDropdown(openrouterModelEl ? openrouterModelEl.value : '');
    modelDropdownCatalogEl.style.display = 'block';
    if (browseChevronEl) browseChevronEl.style.transform = 'rotate(180deg)';
  }
}

function closeModelDropdown() {
  if (modelDropdownCatalogEl) {
    modelDropdownCatalogEl.style.display = 'none';
    if (browseChevronEl) browseChevronEl.style.transform = '';
  }
}

// ---- Toggle browse dropdown ----
toggleModelListBtnEl?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (modelDropdownCatalogEl.style.display === 'block') {
    closeModelDropdown();
  } else {
    openModelDropdown();
  }
});

// ---- Filter models as user types ----
openrouterModelEl?.addEventListener('input', () => {
  const val = openrouterModelEl.value.trim();
  syncQuickPickTags(val);
  if (modelDropdownCatalogEl) {
    modelDropdownCatalogEl.style.display = 'block';
    renderModelDropdown(val);
  }
});

openrouterModelEl?.addEventListener('focus', () => {
  openModelDropdown();
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#openrouterModelGroup')) {
    closeModelDropdown();
  }
});

// ---- Fetch Live Models from OpenRouter API ----
fetchLiveModelsBtnEl?.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (fetchBtnTextEl) fetchBtnTextEl.textContent = 'Fetching...';

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (res.ok) {
      const data = await res.json();
      const models = data?.data || [];

      if (models.length > 0) {
        const liveList = models.map(m => {
          const isFree = m.id.endsWith(':free') || (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0');
          return {
            id: m.id,
            name: m.name || m.id,
            category: isFree ? 'Free Models (Live)' : 'Live OpenRouter Models',
            badge: isFree ? 'FREE' : 'LIVE',
            badgeClass: isFree ? 'badge-free' : 'badge-pro',
          };
        });

        // Sort so free models come first
        liveList.sort((a, b) => (b.badge === 'FREE' ? 1 : 0) - (a.badge === 'FREE' ? 1 : 0));
        availableModelsList = liveList;
        renderModelDropdown(openrouterModelEl ? openrouterModelEl.value : '');
        showToast(`Loaded ${models.length} live models from OpenRouter!`);
      }
    } else {
      showToast('Could not fetch live models. Using built-in catalog.', 'error');
    }
  } catch (err) {
    showToast('Failed to fetch live models: ' + err.message, 'error');
  } finally {
    if (fetchBtnTextEl) fetchBtnTextEl.textContent = 'Fetch Live';
  }
});

// ---- Quick-pick tags for OpenRouter ----
document.querySelectorAll('.quick-pick-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    const model = tag.getAttribute('data-model');
    if (model && openrouterModelEl) {
      openrouterModelEl.value = model;
      syncQuickPickTags(model);
      closeModelDropdown();
    }
  });
});

// ---- Paste API Key Button ----
pasteApiKeyBtnEl?.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      apiKeyEl.value = text.trim();
      detectAndApplyProvider(apiKeyEl.value);
      showToast('API Key pasted from clipboard!');
    }
  } catch {
    apiKeyEl.focus();
  }
});

// ---- Remove / Clear API Key Button ----
removeApiKeyBtnEl?.addEventListener('click', async () => {
  apiKeyEl.value = '';
  await chrome.storage.local.remove('apiKey');
  detectAndApplyProvider('');
  updateApiKeyStatus(false);
  showToast('API Key removed! You can now enter another key.', 'success');
});

// ---- Toggle API key visibility ----
let keyVisible = false;
toggleKeyBtn.addEventListener('click', () => {
  keyVisible = !keyVisible;
  apiKeyEl.type = keyVisible ? 'text' : 'password';
  eyeIcon.innerHTML = keyVisible
    ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>`;
});

// ============================================================
// CV SECTION
// ============================================================
cvTextEl.addEventListener('input', updateCvStats);

function updateCvStats() {
  const text = cvTextEl.value.trim();
  const chars = cvTextEl.value.length;
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const lines = text ? text.split('\n').filter(l => l.trim()).length : 0;

  charCountEl.textContent = `${chars.toLocaleString()} characters`;

  if (text) {
    wordCountEl.textContent = words.toLocaleString();
    lineCountEl.textContent = lines.toLocaleString();
    cvStatsEl.style.display = 'flex';

    let strength = 'Weak';
    let strengthColor = '#ef4444';
    if (words >= 300 && words < 600) { strength = 'Good';      strengthColor = '#f59e0b'; }
    else if (words >= 600)            { strength = 'Excellent'; strengthColor = '#22c55e'; }
    cvStrengthEl.textContent = strength;
    cvStrengthEl.style.color = strengthColor;
  } else {
    cvStatsEl.style.display = 'none';
  }
}

clearCvBtn.addEventListener('click', () => {
  cvTextEl.value = '';
  updateCvStats();
  cvTextEl.focus();
});

pasteCvBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    cvTextEl.value = text;
    updateCvStats();
  } catch {
    showToast('Could not access clipboard. Please paste manually.', 'error');
  }
});

// ============================================================
// AUTO-POPULATE PROFILE FROM CV USING AI
// ============================================================
if (autoPopulateProfileBtnEl) {
  autoPopulateProfileBtnEl.addEventListener('click', async () => {
    const apiKey      = apiKeyEl.value.trim();
    const apiProvider = apiProviderEl.value;
    const customModel = openrouterModelEl ? openrouterModelEl.value.trim() : '';
    const cvText      = cvTextEl.value.trim();

    if (!apiKey) {
      showToast('Please enter your API key first.', 'error');
      apiKeyEl.focus();
      return;
    }

    if (!cvText || cvText.length < 50) {
      showToast('Please paste your full CV text in the box above.', 'error');
      cvTextEl.focus();
      return;
    }

    autoPopulateProfileBtnEl.disabled = true;
    if (autoPopulateSpinnerEl) autoPopulateSpinnerEl.style.display = 'inline-block';

    try {
      showToast('AI is extracting your profile details from CV...', 'success');
      const profile = await globalThis.JobFitAPI.extractProfileFromCV(apiProvider, apiKey, cvText, customModel);

      if (profile) {
        if (profile.firstName && profileFields.firstName) profileFields.firstName.value = profile.firstName;
        if (profile.lastName && profileFields.lastName)   profileFields.lastName.value  = profile.lastName;
        if (profile.email && profileFields.email)         profileFields.email.value     = profile.email;
        if (profile.phone && profileFields.phone)         profileFields.phone.value     = profile.phone;
        if (profile.city && profileFields.city)           profileFields.city.value      = profile.city;
        if (profile.state && profileFields.state)         profileFields.state.value     = profile.state;
        if (profile.country && profileFields.country)     profileFields.country.value   = profile.country;
        if (profile.zipCode && profileFields.zipCode)     profileFields.zipCode.value   = profile.zipCode;

        if (profile.linkedinUrl && profileFields.linkedinUrl) profileFields.linkedinUrl.value = profile.linkedinUrl;
        if (profile.githubUrl && profileFields.githubUrl)     profileFields.githubUrl.value   = profile.githubUrl;
        if (profile.portfolioUrl && profileFields.portfolioUrl) profileFields.portfolioUrl.value = profile.portfolioUrl;

        if (profile.currentTitle && profileFields.currentTitle) profileFields.currentTitle.value = profile.currentTitle;
        if (profile.currentCompany && profileFields.currentCompany) profileFields.currentCompany.value = profile.currentCompany;
        if (profile.highestDegree && profileFields.degree) profileFields.degree.value = profile.highestDegree;
        if (profile.university && profileFields.university) profileFields.university.value = profile.university;
        if (profile.graduationYear && profileFields.gradYear) profileFields.gradYear.value = profile.graduationYear;
        if (profile.totalYearsExperience && profileFields.experience) profileFields.experience.value = profile.totalYearsExperience;

        showToast('✨ Profile details extracted! Click "Save Settings" to store.', 'success');
      }
    } catch (err) {
      console.error('[JobFit Pro] Profile extraction error:', err);
      showToast('Extraction failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      autoPopulateProfileBtnEl.disabled = false;
      if (autoPopulateSpinnerEl) autoPopulateSpinnerEl.style.display = 'none';
    }
  });
}

// ============================================================
// SAVE SETTINGS & PROFILE
// ============================================================
saveBtnEl.addEventListener('click', saveSettings);

async function saveSettings() {
  const apiProvider     = apiProviderEl.value;
  const apiKey          = apiKeyEl.value.trim();
  const openrouterModel = openrouterModelEl ? openrouterModelEl.value.trim() : '';
  const cvText          = cvTextEl.value.trim();
  const autoScan        = autoScanEl.checked;
  const showBadge       = showBadgeEl.checked;

  if (!apiKey) {
    showToast('Please enter or paste your API key.', 'error');
    apiKeyEl.focus();
    return;
  }

  if (!cvText) {
    showToast('Please paste your CV text.', 'error');
    cvTextEl.focus();
    return;
  }

  // Collect user profile data
  const userProfile = {};
  Object.keys(profileFields).forEach(key => {
    if (profileFields[key]) {
      userProfile[key] = profileFields[key].value.trim();
    }
  });

  // Save to Chrome Local Storage
  await chrome.storage.local.set({
    apiProvider,
    apiKey,
    openrouterModel,
    cvText,
    autoScan,
    showBadge,
    userProfile
  });

  updateApiKeyStatus(true);
  apiStatusTextEl.textContent = '✓ Saved in browser';
  showToast('Settings & Profile saved successfully! ✓');
}

// ---- Toast Notification ----
function showToast(message, type = 'success') {
  toastMsgEl.textContent = message;
  saveToastEl.style.background = type === 'error'
    ? 'rgba(239, 68, 68, 0.12)'
    : 'rgba(34, 197, 94, 0.12)';
  saveToastEl.style.borderColor = type === 'error'
    ? 'rgba(239, 68, 68, 0.3)'
    : 'rgba(34, 197, 94, 0.3)';
  saveToastEl.style.color = type === 'error' ? '#f87171' : '#4ade80';
  saveToastEl.classList.add('show');

  setTimeout(() => saveToastEl.classList.remove('show'), 3000);
}
