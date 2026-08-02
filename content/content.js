// ============================================================
// JobFit Pro — Content Script (Job Description & Company Scraper)
// Supports: LinkedIn, Indeed, Glassdoor, Greenhouse, Lever,
//           Workday, ZipRecruiter, Monster, Dice + Generic fallback
// ============================================================

(() => {
  // Prevent duplicate listener registration
  if (window.__jobfit_scraper_initialized) {
    console.log('[JobFit Pro] Content scraper already active.');
    return;
  }
  window.__jobfit_scraper_initialized = true;

  // Generic phrase blacklist for job titles
  const TITLE_BLACKLIST = /preferences|recommended|search result|jobs you may|people also|similar jobs|job collection|explore jobs|sign in|login|openings|career|apply now|messaging|notifications/i;

  // ============================================================
  // LINKEDIN EXTRACTOR
  // ============================================================
  function extractLinkedIn() {
    let title = '';
    let company = '';
    let description = '';

    // 1. Identify active detail container (crucial for 2-pane search views)
    const detailContainer =
      document.querySelector('.jobs-search__job-details') ||
      document.querySelector('.scaffold-layout__detail') ||
      document.querySelector('.jobs-details__main-content') ||
      document.querySelector('.job-view-layout') ||
      document.querySelector('.jobs-search-two-pane__job-section--detail') ||
      document.querySelector('.artdeco-modal') ||
      document;

    // 2. Title selectors (tested on LinkedIn 2024-2026 UI)
    const titleSelectors = [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title a',
      '.job-details-jobs-unified-top-card__job-title',
      'h1.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      'h1.jobs-unified-top-card__job-title',
      'h1.t-24.t-bold',
      'h1.t-24',
      '.jobs-details__main-content h1',
      '.scaffold-layout__detail h1',
      'h1.top-card-layout__title',
      'h1.topcard__title',
      '.topcard__title',
      'h1'
    ];

    for (const sel of titleSelectors) {
      try {
        const el = detailContainer.querySelector(sel) || (detailContainer !== document ? document.querySelector(sel) : null);
        if (el) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t.length >= 2 && t.length < 200 && !TITLE_BLACKLIST.test(t)) {
            title = t;
            break;
          }
        }
      } catch (_) {}
    }

    // 2b. Title fallback: active card in search list
    if (!title) {
      const activeCardTitleEl = document.querySelector(
        '.jobs-search-results-list__list-item--active .job-card-list__title, ' +
        '.job-card-container--clickable.active a, ' +
        '.jobs-search-results-list__list-item--active a.job-card-container__link, ' +
        '.job-card-list__title--link, ' +
        '.job-card-list__title'
      );
      if (activeCardTitleEl) {
        const t = (activeCardTitleEl.innerText || activeCardTitleEl.textContent || '').trim();
        if (t.length >= 2 && t.length < 200 && !TITLE_BLACKLIST.test(t)) {
          title = t;
        }
      }
    }

    // 2c. Title fallback: document.title parser
    if (!title && document.title) {
      const docTitle = document.title.replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      // E.g. "Al-Qadsiah Saudi Club hiring IT Specialist in Al Khobar"
      const hiringMatch = docTitle.match(/hiring\s+(.*?)\s+in\s+/i);
      if (hiringMatch && hiringMatch[1]) {
        title = hiringMatch[1].trim();
      } else {
        // E.g. "IT Specialist - Al-Qadsiah Saudi Club"
        const parts = docTitle.split(/[-–—|•·]/);
        if (parts.length > 0 && parts[0].trim().length >= 2 && !TITLE_BLACKLIST.test(parts[0])) {
          title = parts[0].trim();
        }
      }
    }

    // 3. Company selectors
    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.job-details-jobs-unified-top-card__primary-description-container a.app-aware-link',
      '.job-details-jobs-unified-top-card__primary-description-container a',
      '.jobs-unified-top-card__primary-description a',
      'a.topcard__org-name-link',
      '.topcard__flavor--black-link',
      'a[data-tracking-control-name="public_jobs_topcard-org-name"]',
      'a[href*="/company/"]',
      '.top-card-layout__first-subline a',
      '.jobs-details__main-content [href*="/company/"]'
    ];

    for (const sel of companySelectors) {
      try {
        const el = detailContainer.querySelector(sel) || (detailContainer !== document ? document.querySelector(sel) : null);
        if (el) {
          const t = (el.innerText || el.textContent || '').trim();
          const firstLine = t.split('\n')[0].replace(/^[•·\s\-]+/, '').trim();
          if (firstLine.length >= 2 && firstLine.length < 100) {
            company = firstLine;
            break;
          }
        }
      } catch (_) {}
    }

    // 4. Description selectors (sorted by specificity)
    const descSelectors = [
      '#job-details',
      '.jobs-description__content .jobs-box__html-content',
      '.jobs-description-content__text',
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.jobs-description',
      '.show-more-less-html__markup',
      'article.jobs-description__container',
      '.jobs-search__job-details article',
      '.scaffold-layout__detail article',
      '.description__text'
    ];

    let candidates = [];

    for (const sel of descSelectors) {
      try {
        const elements = detailContainer.querySelectorAll(sel);
        elements.forEach((el) => {
          let t = (el.innerText || el.textContent || '').trim();
          // If #job-details is a header or short label, grab parent container
          if (t.length < 120) {
            const parent = el.closest('.jobs-description__content, .jobs-box__html-content, .jobs-description, article, section');
            if (parent) {
              const pt = (parent.innerText || parent.textContent || '').trim();
              if (pt.length > t.length) t = pt;
            }
          }
          if (t.length >= 100) {
            candidates.push(t);
          }
        });
      } catch (_) {}
    }

    // Pick the longest valid description candidate
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.length - a.length);
      description = candidates[0];
    }

    return { title, company, description, portalName: 'LinkedIn' };
  }

  // ============================================================
  // INDEED EXTRACTOR
  // ============================================================
  function extractIndeed() {
    let title = '', company = '', description = '';

    const titleEl = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"], .jobsearch-JobInfoHeader-title, h1.icl-u-xs-mb--xs, h1.jobTitle, h2.jobTitle, h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"] a, [data-testid="inlineHeader-companyName"], [data-company-name="true"], .jobsearch-InlineCompanyRating-companyHeader a, .jobsearch-InlineCompanyRating-companyHeader, [data-testid="company-name"], [class*="companyName"]');
    if (companyEl) {
      const c = (companyEl.innerText || companyEl.textContent || '').trim().split('\n')[0];
      company = c.replace(/^[•·\s\-]+/, '').trim();
    }

    const descEl = document.querySelector('#jobDescriptionText, .jobsearch-jobDescriptionText, [data-testid="job-description"], .jobsearch-ViewJobLayout-jobDisplay, #jobDetailsSection');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Indeed' };
  }

  // ============================================================
  // GLASSDOOR EXTRACTOR
  // ============================================================
  function extractGlassdoor() {
    let title = '', company = '', description = '';

    const titleEl = document.querySelector('[data-test="job-title"], h1[data-test="jobTitle"], .e1tk4kwz1, [class*="JobDetails_jobTitle"], h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const companyEl = document.querySelector('[data-test="employer-name"], [data-test="empName"], .e1tk4kwz0, [class*="EmployerProfile_employerName"], [class*="employerName"]');
    if (companyEl) {
      const c = (companyEl.innerText || companyEl.textContent || '').trim().split('\n')[0];
      company = c.replace(/^[•·\s\-]+/, '').trim();
    }

    const descEl = document.querySelector('[data-test="jobDescriptionContent"], #JobDescriptionContainer, .jobDescriptionContent, .desc, [class*="JobDetails_jobDescription"]');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Glassdoor' };
  }

  // ============================================================
  // GREENHOUSE EXTRACTOR
  // ============================================================
  function extractGreenhouse() {
    let title = '', company = '', description = '';

    const titleEl = document.querySelector('.app-title, h1.app-title, h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const companyEl = document.querySelector('.company-name, .logo img[alt], [class*="company"]');
    if (companyEl) {
      company = companyEl.alt || (companyEl.innerText || companyEl.textContent || '').trim();
    }

    const descEl = document.querySelector('#content, .content, #main-content');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Greenhouse' };
  }

  // ============================================================
  // LEVER EXTRACTOR
  // ============================================================
  function extractLever() {
    let title = '', company = '', description = '';

    const titleEl = document.querySelector('.posting-header h2, h2.posting-header, h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const companyEl = document.querySelector('.main-header-logo img, a.main-header-logo');
    if (companyEl) {
      company = companyEl.alt || companyEl.title || '';
    }

    const descEl = document.querySelector('.section-wrapper.page-full-width, .posting-page, [data-qa="job-description"]');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Lever' };
  }

  // ============================================================
  // WORKDAY EXTRACTOR
  // ============================================================
  function extractWorkday() {
    let title = '', company = '', description = '';

    const titleEl = document.querySelector('[data-automation-id="jobPostingHeader"], h2[data-automation-id], .WGDC .GF2B, h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const companyEl = document.querySelector('[data-automation-id="employerName"], .WGDC [data-automation-id]');
    if (companyEl) company = (companyEl.innerText || companyEl.textContent || '').trim();

    const descEl = document.querySelector('[data-automation-id="jobPostingDescription"], [data-automation-id="job-requisition-description"], .RWpYed');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Workday' };
  }

  // ============================================================
  // GENERIC COMPANY NAME FALLBACK
  // ============================================================
  function genericExtractCompany() {
    const candidates = [
      document.querySelector('[itemprop="hiringOrganization"] [itemprop="name"]'),
      document.querySelector('[itemprop="hiringOrganization"]'),
      document.querySelector('[itemprop="name"]'),
      document.querySelector('[class*="company-name"] a'),
      document.querySelector('[class*="company-name"]'),
      document.querySelector('[class*="companyName"] a'),
      document.querySelector('[class*="companyName"]'),
      document.querySelector('[class*="employer-name"]'),
      document.querySelector('[class*="employerName"]'),
      document.querySelector('[data-company]'),
      document.querySelector('a[href*="/company/"]'),
      document.querySelector('[class*="org-name"]'),
    ];
    for (const el of candidates) {
      if (el) {
        const t = (el.innerText || el.textContent || el.getAttribute('data-company') || '').trim();
        const firstLine = t.split('\n')[0].replace(/^[•·\s\-]+/, '').trim();
        if (firstLine.length >= 2 && firstLine.length < 100) return firstLine;
      }
    }
    return '';
  }

  // ============================================================
  // GENERIC HEURISTIC FALLBACK
  // ============================================================
  function genericExtract() {
    let title = '';
    let description = '';

    const BLACKLIST_SELECTOR = 'nav, header, footer, aside, [class*="sidebar"], [class*="nav-"], [class*="menu"], [class*="results-list"], [class*="search-results"], [class*="jobs-list"], [class*="card-list"], [class*="related-jobs"], [class*="modal-backdrop"]';

    // Title candidates
    const titleCandidates = [
      document.querySelector('h1'),
      document.querySelector('[class*="job-title"] h1'),
      document.querySelector('[class*="jobtitle"] h1'),
      document.querySelector('[class*="position-title"]'),
      document.querySelector('[itemprop="title"]'),
      document.querySelector('[data-automation*="title"]'),
    ];

    for (const el of titleCandidates) {
      if (el && !el.closest(BLACKLIST_SELECTOR)) {
        const t = (el.innerText || el.textContent || '').trim();
        if (t && t.length >= 2 && t.length < 160 && !TITLE_BLACKLIST.test(t)) {
          title = t;
          break;
        }
      }
    }

    const JOB_KEYWORDS = [
      'responsibilities', 'requirements', 'qualifications', 'experience',
      'skills', 'duties', 'role', 'position', 'about the job', 'we are looking',
      'you will', 'candidate', 'benefits', 'salary', 'apply', 'team',
      'preferred', 'required', 'minimum', 'degree', 'opportunity'
    ];

    const BLOCK_SELECTORS = [
      'article', 'main', '[class*="job-description"]', '[id*="job-description"]',
      '[class*="jobDescription"]', '[id*="jobDescription"]', '[class*="job-detail"]',
      '[id*="job-detail"]', '[class*="job_description"]', '[class*="description"]',
      '[role="main"]', '.content', '#content'
    ];

    let bestEl = null;
    let bestScore = 0;

    for (const selector of BLOCK_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el.closest(BLACKLIST_SELECTOR)) continue;

        const text = (el.innerText || el.textContent || '').toLowerCase();
        const length = text.length;

        if (length < 200 || length > 30000) continue;

        let score = 0;
        for (const kw of JOB_KEYWORDS) {
          if (text.includes(kw)) score += 1;
        }

        if (score > bestScore) {
          bestScore = score;
          bestEl = el;
        }
      }
    }

    if (bestEl && bestScore >= 4) {
      description = (bestEl.innerText || bestEl.textContent || '').trim();
    }

    return { title, description };
  }

  // ============================================================
  // CLEAN TEXT
  // ============================================================
  function cleanText(text) {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^\s+|\s+$/gm, '')
      .trim()
      .substring(0, 8000);
  }

  // ============================================================
  // MAIN EXTRACT COORDINATOR
  // ============================================================
  function extractJobData() {
    let result = { title: '', company: '', description: '', portalName: 'Generic' };
    const host = location.hostname.toLowerCase();

    if (host.includes('linkedin.com')) {
      result = extractLinkedIn();
    } else if (host.includes('indeed.com')) {
      result = extractIndeed();
    } else if (host.includes('glassdoor.com')) {
      result = extractGlassdoor();
    } else if (host.includes('greenhouse.io')) {
      result = extractGreenhouse();
    } else if (host.includes('lever.co')) {
      result = extractLever();
    } else if (host.includes('workday.com') || host.includes('myworkday.com')) {
      result = extractWorkday();
    }

    // Fallback if description or title missing
    if (!result.description || result.description.length < 100) {
      const generic = genericExtract();
      if (!result.title && generic.title) result.title = generic.title;
      if (generic.description && generic.description.length > (result.description || '').length) {
        result.description = generic.description;
        if (!result.portalName) result.portalName = 'Generic';
      }
    }

    // Fallback company if missing
    if (!result.company) {
      result.company = genericExtractCompany();
    }

    // Sanitize title if it accidentally grabbed generic page header
    if (TITLE_BLACKLIST.test(result.title)) {
      result.title = '';
    }

    return {
      title:       cleanText(result.title),
      company:     cleanText(result.company),
      description: cleanText(result.description),
      portalName:  result.portalName || 'Generic',
      pageUrl:     location.href,
      pageTitle:   document.title,
    };
  }

  // Export extract function globally
  window.__jobFitExtractJobData = extractJobData;

  // ============================================================
  // MESSAGE LISTENER
  // ============================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'SCRAPE_JOB') {
      try {
        const data = extractJobData();

        if (data.description && data.description.length >= 60) {
          // Cache in session storage for auto-scan
          try {
            sessionStorage.setItem('jobfit_job_title',       data.title);
            sessionStorage.setItem('jobfit_job_company',     data.company);
            sessionStorage.setItem('jobfit_job_description', data.description);
            sessionStorage.setItem('jobfit_portal',          data.portalName);
          } catch (_) {}

          sendResponse({
            success:        true,
            jobTitle:       data.title,
            jobCompany:     data.company,
            jobDescription: data.description,
            portalName:     data.portalName,
          });
        } else {
          sendResponse({
            success: false,
            error:   'Could not detect a full job description on this page. Please open the job details page and try again.',
          });
        }
      } catch (err) {
        console.error('[JobFit Pro] Scrape error:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
  });

  console.log('[JobFit Pro] Content scraper initialized for:', location.hostname);
})();
