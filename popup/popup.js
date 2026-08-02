// ============================================================
// JobFit Pro — Popup Logic
// Handles: Background AI Analysis, Scan, Stop/Cancel, PDF Report, Cover Letter
// ============================================================

// ---- DOM References ----
const settingsBtnEl        = document.getElementById('settingsBtn');
const goToSettingsEl       = document.getElementById('goToSettings');
const noCvAlertEl          = document.getElementById('noCvAlert');
const scanJobBtnEl         = document.getElementById('scanJobBtn');
const jobPreviewEl         = document.getElementById('jobPreview');
const analyzeBtnEl         = document.getElementById('analyzeBtn');
const analyzeBtnTextEl     = document.getElementById('analyzeBtnText');
const analyzeSpinnerEl     = document.getElementById('analyzeSpinner');
const stopAnalyzeBtnEl     = document.getElementById('stopAnalyzeBtn');
const scoreSectionEl       = document.getElementById('scoreSection');
const ringFillEl           = document.getElementById('ringFill');
const scoreValueEl         = document.getElementById('scoreValue');
const scoreGradeEl         = document.getElementById('scoreGrade');
const resultsSectionEl     = document.getElementById('resultsSection');
const skillsGridEl         = document.getElementById('skillsGrid');
const skillCountEl         = document.getElementById('skillCount');
const tipsListEl           = document.getElementById('tipsList');
const coverSectionEl       = document.getElementById('coverLetterSection');
const coverLetterBtnEl     = document.getElementById('coverLetterBtn');
const coverBtnTextEl       = document.getElementById('coverBtnText');
const coverSpinnerEl       = document.getElementById('coverSpinner');
const coverOutputEl        = document.getElementById('coverLetterOutput');
const coverLetterTextEl    = document.getElementById('coverLetterText');
const copyBtnEl            = document.getElementById('copyBtn');
const copyBtnTextEl        = document.getElementById('copyBtnText');
const downloadReportBtnEl  = document.getElementById('downloadReportBtn');
const cachedResultBarEl    = document.getElementById('cachedResultBar');
const cachedResultTimeEl   = document.getElementById('cachedResultTime');
const clearCachedResultEl  = document.getElementById('clearCachedResult');

// ---- State ----
let extractedJobDescription = '';
let extractedJobTitle       = '';
let extractedJobCompany     = '';
let extractedPortal         = '';
let analysisResult          = null;

// ============================================================
// INIT — On popup open
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Check if CV and API key are saved
  const data = await chrome.storage.local.get([
    'cvText', 'apiKey', 'autoScan',
    'lastAnalysisResult', 'lastAnalysisJob',
    'isAnalyzing', 'activeAnalysisJob', 'analysisError'
  ]);

  if (!data.cvText || !data.apiKey) {
    noCvAlertEl.style.display = 'flex';
  }

  // 2. Check if an analysis is currently running in the background
  if (data.isAnalyzing) {
    setAnalyzeLoading(true);

    if (data.activeAnalysisJob) {
      const job = data.activeAnalysisJob;
      extractedJobTitle       = job.jobTitle       || job.title       || '';
      extractedJobCompany     = job.jobCompany     || job.company     || '';
      extractedJobDescription = job.jobDescription || job.description || '';
      extractedPortal         = job.portalName     || job.portal      || '';

      showJobPreview(extractedJobTitle, extractedJobDescription, extractedPortal, extractedJobCompany);
    }
  } else if (data.analysisError) {
    showScanError('Analysis failed: ' + data.analysisError);
    chrome.storage.local.remove('analysisError');
  } else if (data.lastAnalysisResult && data.lastAnalysisJob) {
    // 3. Restore last completed analysis result (persistent state!)
    const cached = data.lastAnalysisResult;
    const job    = data.lastAnalysisJob;

    extractedJobTitle       = job.title       || '';
    extractedJobCompany     = job.company     || '';
    extractedJobDescription = job.description || '';
    extractedPortal         = job.portal      || '';
    analysisResult          = cached;

    if (job.description) {
      showJobPreview(job.title, job.description, job.portal, job.company);
      analyzeBtnEl.disabled = false;
    }

    displayResults(cached, true);

    if (cached._savedAt) {
      const ago = getTimeAgo(new Date(cached._savedAt));
      cachedResultTimeEl.textContent = `Last analyzed: ${ago}`;
    }
    cachedResultBarEl.style.display = 'flex';
  }

  // 4. Auto-scan if enabled
  if (data.autoScan && !data.isAnalyzing && !data.lastAnalysisResult) {
    await tryLoadAutoScannedJob();
  }
});

// ============================================================
// REACTIVE STORAGE LISTENER (Sync background AI progress to popup UI)
// ============================================================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // Background analyzing state changed
  if (changes.isAnalyzing) {
    if (changes.isAnalyzing.newValue === true) {
      setAnalyzeLoading(true);
    } else {
      setAnalyzeLoading(false);
    }
  }

  // Background finished analysis successfully
  if (changes.lastAnalysisResult?.newValue) {
    analysisResult = changes.lastAnalysisResult.newValue;
    displayResults(analysisResult, true);
    if (cachedResultTimeEl) cachedResultTimeEl.textContent = 'Last analyzed: just now';
    if (cachedResultBarEl) cachedResultBarEl.style.display = 'flex';
  }

  // Background encountered an error
  if (changes.analysisError?.newValue) {
    showScanError('Analysis error: ' + changes.analysisError.newValue);
  }
});

function getTimeAgo(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---- Try to load auto-scanned job from active tab ----
async function tryLoadAutoScannedJob() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title:       sessionStorage.getItem('jobfit_job_title')       || '',
        company:     sessionStorage.getItem('jobfit_job_company')     || '',
        description: sessionStorage.getItem('jobfit_job_description') || '',
        portal:      sessionStorage.getItem('jobfit_portal')          || '',
      }),
    });

    if (results && results[0] && results[0].result) {
      const cached = results[0].result;
      if (cached.description && cached.description.length > 100) {
        extractedJobTitle       = cached.title;
        extractedJobCompany     = cached.company || '';
        extractedJobDescription = cached.description;
        extractedPortal         = cached.portal || '';
        showJobPreview(cached.title, cached.description, cached.portal, cached.company);
        analyzeBtnEl.disabled = false;
      }
    }
  } catch (_) { /* Silently fail */ }
}

// ============================================================
// NAVIGATION
// ============================================================
settingsBtnEl.addEventListener('click', () => chrome.runtime.openOptionsPage());
goToSettingsEl?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ============================================================
// SCAN JOB DESCRIPTION
// ============================================================
scanJobBtnEl.addEventListener('click', async () => {
  scanJobBtnEl.classList.add('loading');
  const scanSpan = scanJobBtnEl.querySelector('span');
  scanSpan.textContent = 'Scanning...';

  try {
    const response = await sendMessageToBackground({ action: 'GET_JOB_DESCRIPTION' });

    if (response && response.success && response.jobDescription) {
      // New scan succeeded — reset old data
      resetResults();

      extractedJobTitle       = response.jobTitle   || '';
      extractedJobCompany     = response.jobCompany || '';
      extractedJobDescription = response.jobDescription;
      extractedPortal         = response.portalName || '';

      showJobPreview(
        response.jobTitle,
        response.jobDescription,
        response.portalName,
        response.jobCompany
      );
      analyzeBtnEl.disabled = false;

    } else {
      const errMsg = response?.error || 'No job description found on this page.';
      showScanError(errMsg);
    }

  } catch (err) {
    showScanError('Scan failed: ' + (err.message || 'Unknown error'));
  } finally {
    scanJobBtnEl.classList.remove('loading');
    scanSpan.textContent = 'Scan Job Description';
  }
});

function sendMessageToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: 'No response received.' });
      }
    });
  });
}

// ---- Show job preview in the box ----
function showJobPreview(title, description, portal, company) {
  jobPreviewEl.innerHTML = '';
  jobPreviewEl.classList.add('has-content');

  // Header row: Company (left) + Portal badge (right)
  const headerEl = document.createElement('div');
  headerEl.className = 'job-preview-top-bar';

  if (company) {
    const companyEl = document.createElement('div');
    companyEl.className = 'job-company-preview';
    companyEl.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
        <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16"/>
      </svg>
      <span title="${company}">${company}</span>
    `;
    headerEl.appendChild(companyEl);
  } else {
    const dummyEl = document.createElement('div');
    headerEl.appendChild(dummyEl);
  }

  if (portal && portal !== 'Generic' && portal !== 'Unknown') {
    const portalBadge = document.createElement('span');
    portalBadge.className = 'job-portal-badge';
    portalBadge.textContent = portal;
    headerEl.appendChild(portalBadge);
  }

  jobPreviewEl.appendChild(headerEl);

  // Job Title
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'job-title-preview';
    titleEl.textContent = title;
    titleEl.title = title;
    jobPreviewEl.appendChild(titleEl);
  }

  // Description Excerpt
  const textEl = document.createElement('p');
  textEl.className = 'job-preview-text';
  const preview = (description || '').substring(0, 220).replace(/\s+/g, ' ').trim();
  textEl.textContent = preview + (description && description.length > 220 ? '...' : '');
  jobPreviewEl.appendChild(textEl);
}

function showJobPreviewError(message) {
  jobPreviewEl.classList.remove('has-content');
  jobPreviewEl.innerHTML = `
    <p class="job-preview-placeholder" style="color:#f87171;">
      ⚠️ ${message}
    </p>`;
}

// Shows a non-destructive scan error
function showScanError(message) {
  document.getElementById('scanErrorBanner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'scanErrorBanner';
  banner.style.cssText = `
    display:flex; align-items:center; gap:8px;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 11.5px;
    color: #fca5a5;
    margin: 6px 0;
    animation: fadeIn 0.2s ease;
  `;
  banner.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span style="flex:1">${message}</span>
    <span onclick="this.parentElement.remove()" style="cursor:pointer;font-size:14px;color:#6b7280;padding:0 2px;line-height:1" title="Dismiss">✕</span>
  `;

  scanJobBtnEl.parentElement.insertBefore(banner, scanJobBtnEl);
  setTimeout(() => banner?.remove(), 6000);
}

function resetResults() {
  scoreSectionEl.style.display  = 'none';
  resultsSectionEl.style.display = 'none';
  coverSectionEl.style.display  = 'none';
  coverOutputEl.style.display   = 'none';
  downloadReportBtnEl.style.display = 'none';
  cachedResultBarEl.style.display   = 'none';
  analysisResult = null;
  chrome.runtime.sendMessage({ action: 'CLEAR_BADGE' }, () => {});
  chrome.storage.local.remove(['lastAnalysisResult', 'lastAnalysisJob']);
}

// ---- Clear cached result button ----
clearCachedResultEl?.addEventListener('click', () => {
  resetResults();
  jobPreviewEl.innerHTML = `<p class="job-preview-placeholder">Navigate to a job listing page, then click <strong>Scan Job</strong> to extract the description.</p>`;
  jobPreviewEl.classList.remove('has-content');
  extractedJobTitle = '';
  extractedJobCompany = '';
  extractedJobDescription = '';
  extractedPortal = '';
  analyzeBtnEl.disabled = true;
});

// ============================================================
// ANALYZE — Dispatches to Background Worker
// ============================================================
analyzeBtnEl.addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['cvText', 'apiKey']);

  if (!data.cvText || !data.apiKey) {
    noCvAlertEl.style.display = 'flex';
    return;
  }

  if (!extractedJobDescription) {
    showJobPreviewError('Please scan a job description first.');
    return;
  }

  setAnalyzeLoading(true);
  scoreSectionEl.style.display  = 'none';
  resultsSectionEl.style.display = 'none';
  coverSectionEl.style.display  = 'none';
  coverOutputEl.style.display   = 'none';
  downloadReportBtnEl.style.display = 'none';

  chrome.runtime.sendMessage({
    action: 'START_ANALYSIS',
    jobDescription: extractedJobDescription,
    jobTitle: extractedJobTitle,
    jobCompany: extractedJobCompany,
    portalName: extractedPortal || 'Generic',
  }, (res) => {
    if (chrome.runtime.lastError) {
      console.error('[JobFit Pro] Start analysis error:', chrome.runtime.lastError.message);
      setAnalyzeLoading(false);
      showScanError('Failed to start background analysis: ' + chrome.runtime.lastError.message);
    }
  });
});

// ---- Stop / Cancel Ongoing Analysis ----
stopAnalyzeBtnEl?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'CANCEL_ANALYSIS' }, () => {
    setAnalyzeLoading(false);
    showScanError('Analysis stopped.');
  });
});

function setAnalyzeLoading(on) {
  if (on) {
    analyzeBtnEl.classList.add('loading');
    analyzeBtnTextEl.textContent = 'Analyzing in background...';
    analyzeSpinnerEl.style.display = 'block';
    const svgEl = analyzeBtnEl.querySelector('svg');
    if (svgEl) svgEl.style.display = 'none';
    if (stopAnalyzeBtnEl) stopAnalyzeBtnEl.style.display = 'inline-flex';
  } else {
    analyzeBtnEl.classList.remove('loading');
    analyzeBtnTextEl.textContent = 'Analyze Match';
    analyzeSpinnerEl.style.display = 'none';
    const svgEl = analyzeBtnEl.querySelector('svg');
    if (svgEl) svgEl.style.display = '';
    if (stopAnalyzeBtnEl) stopAnalyzeBtnEl.style.display = 'none';
  }
}

// ============================================================
// DISPLAY RESULTS
// ============================================================
function displayResults(result, fromCache = false) {
  const score = Math.min(100, Math.max(0, result.matchScore || 0));

  setScore(score);
  scoreSectionEl.style.display = 'flex';

  if (result.matchSummary) {
    let summaryEl = document.getElementById('matchSummary');
    if (!summaryEl) {
      summaryEl = document.createElement('p');
      summaryEl.id = 'matchSummary';
      summaryEl.style.cssText = [
        'font-size:11px', 'color:#94a3b8', 'text-align:center',
        'line-height:1.5', 'max-width:320px', 'margin: 0 auto',
        'padding: 0 8px',
      ].join(';');
      scoreSectionEl.appendChild(summaryEl);
    }
    summaryEl.textContent = result.matchSummary;
  }

  renderSkillGap(result.missingSkills || []);
  renderAtsTips(result.atsTips || []);

  resultsSectionEl.style.display = 'flex';
  coverSectionEl.style.display   = 'flex';
  downloadReportBtnEl.style.display = 'flex';

  if (!fromCache) {
    chrome.storage.local.get('showBadge', ({ showBadge }) => {
      if (showBadge !== false) {
        chrome.runtime.sendMessage({ action: 'UPDATE_BADGE', score });
      }
    });

    const toSave = { ...result, _savedAt: new Date().toISOString() };
    chrome.storage.local.set({
      lastAnalysisResult: toSave,
      lastAnalysisJob: {
        title:       extractedJobTitle,
        company:     extractedJobCompany,
        description: extractedJobDescription,
        portal:      extractedPortal || '',
      },
    });
  }
}

function setScore(score) {
  const CIRCUMFERENCE = 2 * Math.PI * 50;
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

  requestAnimationFrame(() => {
    ringFillEl.style.strokeDasharray  = CIRCUMFERENCE;
    ringFillEl.style.strokeDashoffset = offset;
  });

  scoreValueEl.textContent = `${score}%`;

  ringFillEl.classList.remove('score-high', 'score-medium', 'score-low');
  if      (score >= 75) ringFillEl.classList.add('score-high');
  else if (score >= 50) ringFillEl.classList.add('score-medium');
  else                  ringFillEl.classList.add('score-low');

  scoreGradeEl.className = 'score-grade';
  let gradeClass = '', gradeText = '';
  if      (score >= 85) { gradeClass = 'grade-excellent'; gradeText = '🌟 Excellent Match'; }
  else if (score >= 70) { gradeClass = 'grade-good';      gradeText = '✅ Good Match'; }
  else if (score >= 50) { gradeClass = 'grade-fair';      gradeText = '⚠️ Fair Match'; }
  else                  { gradeClass = 'grade-poor';      gradeText = '❌ Poor Match'; }

  scoreGradeEl.classList.add(gradeClass);
  scoreGradeEl.querySelector('.grade-text').textContent = gradeText;
}

function renderSkillGap(skills) {
  skillsGridEl.innerHTML = '';
  skillCountEl.textContent = skills.length;

  if (skills.length === 0) {
    const empty = document.createElement('span');
    empty.style.cssText = 'font-size:12px; color: var(--green); font-weight: 500;';
    empty.textContent = '🎉 No major skill gaps detected!';
    skillsGridEl.appendChild(empty);
    return;
  }

  skills.forEach((skill) => {
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.textContent = skill;
    skillsGridEl.appendChild(tag);
  });
}

function renderAtsTips(tips) {
  tipsListEl.innerHTML = '';

  if (tips.length === 0) {
    const li = document.createElement('li');
    li.className = 'tip-item';
    li.textContent = 'Your CV is well optimized for ATS scanners for this role.';
    tipsListEl.appendChild(li);
    return;
  }

  tips.forEach((tip) => {
    const li = document.createElement('li');
    li.className = 'tip-item';
    li.textContent = tip;
    tipsListEl.appendChild(li);
  });
}


// ============================================================
// COVER LETTER GENERATOR
// ============================================================
coverLetterBtnEl.addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['cvText', 'apiKey', 'apiProvider', 'openrouterModel']);

  if (!data.cvText || !data.apiKey) {
    noCvAlertEl.style.display = 'flex';
    return;
  }

  if (!extractedJobDescription) {
    showJobPreviewError('Please scan a job description first.');
    return;
  }

  setCoverLoading(true);

  try {
    const letter = await generateCoverLetter(
      data.apiProvider || 'gemini',
      data.apiKey,
      data.cvText,
      extractedJobDescription,
      extractedJobTitle,
      analysisResult,
      data.openrouterModel || ''
    );

    coverLetterTextEl.textContent = letter;
    coverOutputEl.style.display   = 'block';

    coverOutputEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('[JobFit Pro] Cover letter error:', err);
    showScanError('Cover letter generation failed: ' + err.message);
  } finally {
    setCoverLoading(false);
  }
});

function setCoverLoading(on) {
  if (on) {
    coverLetterBtnEl.classList.add('loading');
    coverBtnTextEl.textContent = 'Writing Cover Letter...';
    coverSpinnerEl.style.display = 'block';
    coverLetterBtnEl.querySelector('svg').style.display = 'none';
  } else {
    coverLetterBtnEl.classList.remove('loading');
    coverBtnTextEl.textContent = 'Generate Cover Letter';
    coverSpinnerEl.style.display = 'none';
    coverLetterBtnEl.querySelector('svg').style.display = '';
  }
}

// ============================================================
// COPY COVER LETTER
// ============================================================
copyBtnEl.addEventListener('click', async () => {
  const text = coverLetterTextEl.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    copyBtnTextEl.textContent = 'Copied!';
    copyBtnEl.classList.add('copied');
    setTimeout(() => {
      copyBtnTextEl.textContent = 'Copy';
      copyBtnEl.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('[JobFit Pro] Clipboard copy failed:', err);
  }
});

// ============================================================
// DOWNLOAD PDF REPORT
// ============================================================
downloadReportBtnEl?.addEventListener('click', () => {
  if (!analysisResult) return;
  generatePDFReport(analysisResult, extractedJobTitle, extractedJobCompany);
});

function generatePDFReport(result, jobTitle, company) {
  const score = Math.min(100, Math.max(0, result.matchScore || 0));
  const gradeColor = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const gradeText  = score >= 85 ? 'Excellent Match' : score >= 70 ? 'Good Match' : score >= 50 ? 'Fair Match' : 'Poor Match';

  const missingSkillsHtml = (result.missingSkills || []).length > 0
    ? result.missingSkills.map(s => `<span class="skill-tag">${s}</span>`).join('')
    : '<span style="color:#22c55e;font-weight:600;">No critical skill gaps identified!</span>';

  const atsTipsHtml = (result.atsTips || []).length > 0
    ? result.atsTips.map(t => `<li>${t}</li>`).join('')
    : '<li>Your CV is well-tailored for this position.</li>';

  const coverLetterContent = coverLetterTextEl.textContent.trim();
  const coverLetterSection = coverLetterContent
    ? `<div class="section">
         <h2>AI Generated Cover Letter</h2>
         <div class="cover-letter-box">${coverLetterContent.replace(/\n/g, '<br>')}</div>
       </div>`
    : '';

  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>JobFit Pro Report - ${company ? company + ' - ' : ''}${jobTitle || 'Match Analysis'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
    body { background: #ffffff; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #6c63ff; padding-bottom: 16px; margin-bottom: 24px; }
    .brand-name { font-size: 20px; font-weight: 800; color: #6c63ff; }
    .brand-tag  { font-size: 11px; color: #6b7280; margin-top: 1px; }
    .report-date { font-size: 11px; color: #6b7280; text-align: right; }
    .job-title-row { margin-bottom: 24px; }
    .company-lbl { font-size: 12px; font-weight: 700; color: #6c63ff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .job-title-row h1 { font-size: 18px; font-weight: 700; color: #111827; }
    .job-title-row p  { font-size: 12px; color: #6b7280; margin-top: 3px; }
    .score-row { display: flex; align-items: center; gap: 32px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
    .score-circle { width: 88px; height: 88px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 6px solid ${gradeColor}; flex-shrink: 0; }
    .score-num  { font-size: 26px; font-weight: 800; color: #111827; line-height: 1; }
    .score-lbl  { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .score-info h2  { font-size: 20px; font-weight: 700; color: ${gradeColor}; }
    .score-info p   { font-size: 12px; color: #6b7280; margin-top: 6px; line-height: 1.6; max-width: 400px; }
    .section { margin-bottom: 28px; }
    .section h2 { font-size: 14px; font-weight: 700; color: #374151; border-left: 3px solid #6c63ff; padding-left: 10px; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .skills-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .skill-tag { background: #f3f0ff; border: 1px solid #c4b5fd; color: #6c63ff; font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 6px; }
    .tips-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
    .tips-list li { font-size: 13px; color: #374151; line-height: 1.6; padding-left: 16px; position: relative; }
    .tips-list li::before { content: "->"; position: absolute; left: 0; color: #6c63ff; font-weight: 700; }
    .cover-letter-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; font-size: 13px; line-height: 1.8; color: #374151; }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 14px; }
    @media print { body { padding: 24px; } .section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-name">JobFit Pro</div>
      <div class="brand-tag">AI Job Analyzer Report</div>
    </div>
    <div class="report-date">Generated: ${now}</div>
  </div>
  <div class="job-title-row">
    ${company ? `<div class="company-lbl">🏢 ${company}</div>` : ''}
    <h1>${jobTitle || 'Job Analysis Report'}</h1>
    <p>AI-powered ATS match analysis</p>
  </div>
  <div class="score-row">
    <div class="score-circle">
      <span class="score-num">${score}%</span>
      <span class="score-lbl">Match</span>
    </div>
    <div class="score-info">
      <h2>${gradeText}</h2>
      ${result.matchSummary ? `<p>${result.matchSummary}</p>` : ''}
    </div>
  </div>
  <div class="section">
    <h2>Missing Skills (${(result.missingSkills || []).length})</h2>
    <div class="skills-grid">${missingSkillsHtml}</div>
  </div>
  <div class="section">
    <h2>ATS Optimization Tips</h2>
    <ul class="tips-list">${atsTipsHtml}</ul>
  </div>
  ${coverLetterSection}
  <div class="footer">Generated by <strong>JobFit Pro v1.0</strong> &middot; Powered by Aravals Inc</div>
</body>
</html>`;


  const printWin = window.open('', '_blank', 'width=800,height=900');
  if (!printWin) {
    alert('Please allow popups for this extension to download the PDF.');
    return;
  }
  printWin.document.write(htmlContent);
  printWin.document.close();
  printWin.onload = () => setTimeout(() => { printWin.print(); }, 400);
}

// ============================================================
// AI FUNCTIONS
// ============================================================
async function generateCoverLetter(provider, apiKey, cvText, jobDescription, jobTitle, analysisResult, customModel = '') {
  if (!globalThis.JobFitAPI) {
    throw new Error('API module not loaded. Please reload the extension.');
  }
  return await globalThis.JobFitAPI.generateCoverLetter(
    provider, apiKey, cvText, jobDescription, jobTitle, analysisResult, customModel
  );
}
