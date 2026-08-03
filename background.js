// ============================================================
// JobFit Pro — Background Service Worker (Manifest V3)
// Handles: background AI analysis, cancellation, message relay, badge updates
// ============================================================

import './utils/api.js';

let activeAnalysisController = null;

// --- Extension Installed / Updated ---
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[JobFit Pro] Installed! Opening settings...');
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    console.log(`[JobFit Pro] Updated to v${chrome.runtime.getManifest().version}`);
  }
});

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ============================================================
  // START AI ANALYSIS IN BACKGROUND (Resilient to tab switching & popup closing)
  // ============================================================
  if (message.action === 'START_ANALYSIS') {
    const { jobDescription, jobTitle, jobCompany, portalName } = message;

    // Abort previous running request if any
    if (activeAnalysisController) {
      activeAnalysisController.abort();
      activeAnalysisController = null;
    }

    activeAnalysisController = new AbortController();
    const signal = activeAnalysisController.signal;

    (async () => {
      try {
        const data = await chrome.storage.local.get(['cvText', 'apiKey', 'apiProvider', 'openrouterModel']);

        if (!data.cvText || !data.apiKey) {
          throw new Error('CV text or API key is missing. Please configure them in Settings.');
        }

        // Set persistent analyzing state
        await chrome.storage.local.set({
          isAnalyzing: true,
          analysisStartTime: Date.now(),
          activeAnalysisJob: { jobTitle, jobCompany, jobDescription, portalName },
          analysisError: null,
        });

        // Set badge indicating in-progress analysis
        chrome.action.setBadgeText({ text: 'AI' });
        chrome.action.setBadgeBackgroundColor({ color: '#6c63ff' });

        const result = await globalThis.JobFitAPI.analyzeWithAI(
          data.apiProvider || 'gemini',
          data.apiKey,
          data.cvText,
          jobDescription,
          jobTitle,
          data.openrouterModel || '',
          signal
        );

        if (signal.aborted) return;

        // Persist analysis result
        await chrome.storage.local.set({
          isAnalyzing: false,
          lastAnalysisResult: result,
          lastAnalysisJob: { jobTitle, jobCompany, jobDescription, portalName },
          lastAnalyzedAt: Date.now(),
          analysisError: null,
        });

        // Update score badge on extension icon
        const score = Math.round(result.matchScore || 0);
        const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
        chrome.action.setBadgeText({ text: `${score}` });
        chrome.action.setBadgeBackgroundColor({ color });

        console.log('[JobFit Pro] Background analysis finished successfully. Score:', score);
        activeAnalysisController = null;

      } catch (err) {
        if (signal.aborted || err.name === 'AbortError') {
          console.log('[JobFit Pro] Analysis was stopped by user.');
          await chrome.storage.local.set({ isAnalyzing: false, analysisError: null });
          chrome.action.setBadgeText({ text: '' });
        } else {
          console.error('[JobFit Pro] Background analysis failed:', err);
          await chrome.storage.local.set({ isAnalyzing: false, analysisError: err.message });
          chrome.action.setBadgeText({ text: '!' });
          chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
        }
        activeAnalysisController = null;
      }
    })();

    sendResponse({ success: true, message: 'Analysis started in background.' });
    return true;
  }

  // ============================================================
  // CANCEL / STOP AI ANALYSIS
  // ============================================================
  if (message.action === 'CANCEL_ANALYSIS') {
    if (activeAnalysisController) {
      activeAnalysisController.abort();
      activeAnalysisController = null;
    }

    chrome.storage.local.set({ isAnalyzing: false, analysisError: null });
    chrome.action.setBadgeText({ text: '' });
    console.log('[JobFit Pro] Cancelled analysis request.');
    sendResponse({ success: true });
    return true;
  }

  // ============================================================
  // Relay: Popup → Content Script (get job description)
  // ============================================================
  if (message.action === 'GET_JOB_DESCRIPTION') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ success: false, error: 'No active browser tab found.' });
        return;
      }

      const tab = tabs[0];
      const tabId = tab.id;

      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
        sendResponse({
          success: false,
          error: 'Cannot scan browser internal pages. Please switch to a job posting tab (e.g. LinkedIn, Indeed) and click Scan again.',
        });
        return;
      }

      try {
        // Inject latest content script freshly
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content/content.js'],
        });

        // Directly call the extraction function
        const execResults = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            if (typeof window.__jobFitExtractJobData === 'function') {
              return window.__jobFitExtractJobData();
            }
            return null;
          },
        });

        const jobData = execResults && execResults[0] && execResults[0].result;

        if (jobData && jobData.description && jobData.description.length >= 40) {
          sendResponse({
            success:        true,
            jobTitle:       jobData.title,
            jobCompany:     jobData.company,
            jobDescription: jobData.description,
            portalName:     jobData.portalName,
          });
        } else {
          sendResponse({
            success: false,
            error:   'Could not detect a full job description on this page. Please make sure the job details are loaded on screen.',
          });
        }
      } catch (err) {
        console.error('[JobFit Pro] Script execution error:', err);
        sendResponse({
          success: false,
          error: 'Could not access page: ' + (err.message || 'Unknown error'),
        });
      }
    });

    return true;
  }


  // ============================================================
  // TRIGGER AUTOFILL (From Popup -> Direct Script Execution)
  // ============================================================
  if (message.action === 'TRIGGER_AUTOFILL') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
          sendResponse({ success: false, error: 'No active browser tab found.' });
          return;
        }

        const tab = tabs[0];
        const tabId = tab.id;

        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
          sendResponse({
            success: false,
            error: 'Cannot autofill internal browser pages. Please open an application form on a website.',
          });
          return;
        }

        const data = await chrome.storage.local.get(['userProfile']);
        if (!data.userProfile) {
          sendResponse({
            success: false,
            error: 'Candidate profile is empty. Please configure your profile in Settings first!',
          });
          return;
        }

        // Ensure script is injected fresh
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content/autofill.js'],
        });

        // Directly execute autofill runner in tab context
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (profile) => {
            if (typeof window.__jobFitAutofillForm === 'function') {
              return await window.__jobFitAutofillForm(profile);
            }
            return { count: 0, message: 'Autofill engine initialized on page.' };
          },
          args: [data.userProfile],
        });

        const res = results && results[0] && results[0].result;
        sendResponse({
          success: true,
          count: res?.count || 0,
          message: res?.message || 'Autofill executed!',
        });
      } catch (err) {
        console.error('[JobFit Pro] Autofill script execution error:', err);
        sendResponse({
          success: false,
          error: 'Autofill error: ' + (err.message || 'Could not access page'),
        });
      }
    })();

    return true;
  }

  // ============================================================
  // ANSWER APPLICATION QUESTION WITH AI
  // ============================================================
  if (message.action === 'ANSWER_APPLICATION_QUESTION') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(['cvText', 'apiKey', 'apiProvider', 'openrouterModel', 'lastAnalysisJob']);
        if (!data.apiKey || !data.cvText) {
          sendResponse({ success: false, error: 'API key or CV missing in settings.' });
          return;
        }

        const jobDesc = data.lastAnalysisJob?.jobDescription || '';
        const answer = await globalThis.JobFitAPI.answerApplicationQuestion(
          data.apiProvider || 'gemini',
          data.apiKey,
          data.cvText,
          jobDesc,
          message.questionText,
          data.openrouterModel || ''
        );

        sendResponse({ success: true, answer });
      } catch (err) {
        console.error('[JobFit Pro] AI question answer error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true;
  }

  // ============================================================
  // Badge Controls
  // ============================================================
  if (message.action === 'UPDATE_BADGE') {
    const score = Math.round(message.score);
    const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    chrome.action.setBadgeText({ text: `${score}` });
    chrome.action.setBadgeBackgroundColor({ color });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'CLEAR_BADGE') {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ success: true });
    return true;
  }
});
