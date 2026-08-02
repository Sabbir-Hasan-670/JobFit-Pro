// ============================================================
// JobFit Pro — Content Script (Job Description & Company Scraper)
// Supports: LinkedIn, Indeed, Glassdoor, Greenhouse, Lever,
//           Workday, ZipRecruiter, Monster, Dice + Generic fallback
// ============================================================

(() => {
  // Generic phrase blacklist for job titles
  const TITLE_BLACKLIST = /preferences|recommended|search result|jobs you may|people also|similar jobs|job collection|explore jobs|sign in|login|openings|career|apply now|messaging|notifications/i;

  // Helper to ensure an element is never inside a job search list / card sidebar
  function isInsideSearchList(el) {
    if (!el) return false;
    return Boolean(
      el.closest(
        '.scaffold-layout__list, ' +
        '.scaffold-layout__list-container, ' +
        '.jobs-search-results-list, ' +
        '.jobs-search-results, ' +
        '[data-view-name="job-search-results-list"], ' +
        '[data-occludable-job-id], ' +
        '.job-card-container, ' +
        '.job-card-list, ' +
        '.jobs-search-results__list, ' +
        '.jobs-search-results__list-item, ' +
        'aside, ' +
        '.jobs-search-two-pane__job-section--list'
      )
    );
  }

  // ============================================================
  // LINKEDIN EXTRACTOR
  // ============================================================
  function extractLinkedIn() {
    let title = '';
    let company = '';
    let description = '';

    // 1. Identify active detail container (the right pane on LinkedIn 2-pane view)
    let detailPane =
      document.querySelector('.scaffold-layout__detail') ||
      document.querySelector('.jobs-search__job-details') ||
      document.querySelector('.jobs-details__main-content') ||
      document.querySelector('[data-view-name="job-details"]') ||
      document.querySelector('.job-view-layout') ||
      document.querySelector('.jobs-search-two-pane__job-section--detail') ||
      document.querySelector('.artdeco-modal') ||
      document.querySelector('main > div:nth-child(2)') ||
      document.querySelector('main > section:nth-child(2)');

    // Fallback: If no dedicated pane found, find container of #job-details
    if (!detailPane) {
      const jd = document.getElementById('job-details') || document.querySelector('#job-details');
      if (jd) {
        detailPane = jd.closest('article, section, div.scaffold-layout__detail') || jd.parentElement;
      }
    }

    const searchContext = detailPane || document;

    // 2. Title selectors (must NOT be inside left search list)
    const titleSelectors = [
      'h1.job-details-jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title a',
      '.job-details-jobs-unified-top-card__job-title',
      'h1.jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      'h1.t-24.t-bold',
      'h1.t-24',
      '.jobs-details__main-content h1',
      '.scaffold-layout__detail h1',
      'h1.top-card-layout__title',
      'h1.topcard__title',
      'h1'
    ];

    for (const sel of titleSelectors) {
      try {
        const el = searchContext.querySelector(sel);
        if (el && !isInsideSearchList(el)) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t.length >= 2 && t.length < 200 && !TITLE_BLACKLIST.test(t)) {
            title = t;
            break;
          }
        }
      } catch (_) {}
    }

    // 3. Company selectors (must NOT be inside left search list)
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
      '.top-card-layout__first-subline a',
      '.jobs-details__main-content [href*="/company/"]',
      'a[href*="/company/"]'
    ];

    for (const sel of companySelectors) {
      try {
        const el = searchContext.querySelector(sel);
        if (el && !isInsideSearchList(el)) {
          const t = (el.innerText || el.textContent || '').trim();
          const firstLine = t.split('\n')[0].split('•')[0].replace(/^[•·\s\-]+/, '').trim();
          if (firstLine.length >= 2 && firstLine.length < 100 && !TITLE_BLACKLIST.test(firstLine)) {
            company = firstLine;
            break;
          }
        }
      } catch (_) {}
    }

    // 4. Job Description Extraction
    // Step 4A: Check #job-details directly (exclusive to LinkedIn active job details)
    const jobDetailsEl = document.getElementById('job-details') || document.querySelector('#job-details');
    if (jobDetailsEl && !isInsideSearchList(jobDetailsEl)) {
      const text = (jobDetailsEl.innerText || jobDetailsEl.textContent || '').trim();
      if (text.length >= 40) {
        description = text;
      }
    }

    // Step 4B: Query inside detailPane exclusively
    if (!description && detailPane) {
      const paneDescSelectors = [
        '.jobs-description-content__text',
        '.jobs-description__content .jobs-box__html-content',
        '.jobs-box__html-content',
        '.jobs-description__content',
        '.jobs-description',
        '.show-more-less-html__markup',
        '.jobs-details__main-content article',
        '.scaffold-layout__detail article',
        'article'
      ];

      for (const sel of paneDescSelectors) {
        try {
          const el = detailPane.querySelector(sel);
          if (el) {
            const text = (el.innerText || el.textContent || '').trim();
            if (text.length >= 40 && !text.includes('How promoted jobs are ranked') && !text.includes('99+ results')) {
              description = text;
              break;
            }
          }
        } catch (_) {}
      }
    }

    // Step 4C: Slice from detailPane text starting at "About the job" or "Job Purpose"
    if (!description && detailPane) {
      try {
        const fullText = (detailPane.innerText || detailPane.textContent || '').trim();
        const aboutIdx = fullText.search(/About the job/i);
        if (aboutIdx !== -1) {
          description = fullText.substring(aboutIdx).trim();
        } else {
          const purposeIdx = fullText.search(/Job Purpose/i);
          if (purposeIdx !== -1) {
            description = fullText.substring(purposeIdx).trim();
          } else if (fullText.length >= 100 && !fullText.includes('99+ results')) {
            description = fullText;
          }
        }
      } catch (_) {}
    }

    // Step 4D: Whole page scan for "About the job" that is not inside the search list
    if (!description || description.length < 40) {
      try {
        const allEls = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, span, div, p'));
        const aboutEl = allEls.find(el => {
          if (isInsideSearchList(el)) return false;
          const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
          return txt === 'about the job' || txt === 'about the role';
        });

        if (aboutEl) {
          let p = aboutEl.parentElement;
          while (p && p !== document.body && p !== document.documentElement) {
            if (isInsideSearchList(p)) break;
            const txt = (p.innerText || p.textContent || '').trim();
            if (txt.length >= 60 && !txt.includes('99+ results')) {
              description = txt;
            }
            p = p.parentElement;
          }
        }
      } catch (_) {}
    }

    if (description) {
      description = description.replace(/^About the job\s*/i, '').trim();
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

    const titleEl = document.querySelector('[data-test="jobTitle"], .JobDetails_jobTitle__RvNS6, h1.heading_Heading__21nSG, h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const companyEl = document.querySelector('[data-test="employerName"], .EmployerProfile_employerName__8aAaf, .JobDetails_employerName__ZgWld');
    if (companyEl) {
      const c = (companyEl.innerText || companyEl.textContent || '').trim().split('\n')[0];
      company = c.replace(/^[•·\s\-]+/, '').trim();
    }

    const descEl = document.querySelector('.JobDetails_jobDescription__uWvhp, [data-test="jobDescription"], .jobDescriptionContent, #JobDescriptionContainer');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Glassdoor' };
  }

  // ============================================================
  // GREENHOUSE EXTRACTOR
  // ============================================================
  function extractGreenhouse() {
    let title = '', company = '', description = '';

    const titleEl = document.querySelector('.app-title, h1.job-title, h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const companyEl = document.querySelector('.company-name, [class*="company"], .org-name');
    if (companyEl) company = (companyEl.innerText || companyEl.textContent || '').trim();

    const descEl = document.querySelector('#content, .job-post-content, #job-post, .body');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Greenhouse' };
  }

  // ============================================================
  // LEVER EXTRACTOR
  // ============================================================
  function extractLever() {
    let title = '', company = '', description = '';

    const titleEl = document.querySelector('.posting-headline h2, h2.posting-headline, h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const companyEl = document.querySelector('.main-header-logo img[alt], .posting-headline .company-name');
    if (companyEl) {
      company = companyEl.getAttribute('alt') || (companyEl.innerText || '').trim();
    }

    const descEl = document.querySelector('.posting-page, [data-qa="job-description"], .section-wrapper');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Lever' };
  }

  // ============================================================
  // WORKDAY EXTRACTOR
  // ============================================================
  function extractWorkday() {
    let title = '', company = '', description = '';

    const titleEl = document.querySelector('[data-automation-id="jobPostingHeader"], h1[data-automation-id="jobPostingTitle"], h1');
    if (titleEl) title = (titleEl.innerText || titleEl.textContent || '').trim();

    const descEl = document.querySelector('[data-automation-id="jobPostingDescription"], .job-description, [id*="job-description"]');
    if (descEl) description = (descEl.innerText || descEl.textContent || '').trim();

    return { title, company, description, portalName: 'Workday' };
  }

  // ============================================================
  // GENERIC COMPANY EXTRACTOR
  // ============================================================
  function genericExtractCompany() {
    const metaCompany =
      document.querySelector('meta[property="og:site_name"]')?.content ||
      document.querySelector('meta[name="author"]')?.content;
    if (metaCompany) return metaCompany.trim();

    const companyCandidates = [
      document.querySelector('[class*="company-name"]'),
      document.querySelector('[class*="companyName"]'),
      document.querySelector('[class*="employer"]'),
      document.querySelector('[data-automation*="company"]'),
      document.querySelector('[itemprop="hiringOrganization"]'),
    ];

    for (const el of companyCandidates) {
      if (el) {
        const t = (el.innerText || el.textContent || '').trim().split('\n')[0];
        if (t && t.length >= 2 && t.length < 80) return t.replace(/^[•·\s\-]+/, '').trim();
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

    // Priority 0: If user has highlighted / selected text on page, grab it immediately!
    try {
      const selectedText = (window.getSelection ? window.getSelection().toString() : '').trim();
      if (selectedText && selectedText.length >= 30) {
        result.description = selectedText;
      }
    } catch (_) {}

    if (host.includes('linkedin.com')) {
      const li = extractLinkedIn();
      if (!result.description) result.description = li.description;
      result.title = li.title;
      result.company = li.company;
      result.portalName = 'LinkedIn';
    } else if (host.includes('indeed.com')) {
      const ind = extractIndeed();
      if (!result.description) result.description = ind.description;
      result.title = ind.title;
      result.company = ind.company;
      result.portalName = 'Indeed';
    } else if (host.includes('glassdoor.com')) {
      const gd = extractGlassdoor();
      if (!result.description) result.description = gd.description;
      result.title = gd.title;
      result.company = gd.company;
      result.portalName = 'Glassdoor';
    } else if (host.includes('greenhouse.io')) {
      const gh = extractGreenhouse();
      if (!result.description) result.description = gh.description;
      result.title = gh.title;
      result.company = gh.company;
      result.portalName = 'Greenhouse';
    } else if (host.includes('lever.co')) {
      const lv = extractLever();
      if (!result.description) result.description = lv.description;
      result.title = lv.title;
      result.company = lv.company;
      result.portalName = 'Lever';
    } else if (host.includes('workday.com') || host.includes('myworkday.com')) {
      const wd = extractWorkday();
      if (!result.description) result.description = wd.description;
      result.title = wd.title;
      result.company = wd.company;
      result.portalName = 'Workday';
    }

    // Fallback if description is still missing
    if (!result.description || result.description.length < 50) {
      const generic = genericExtract();
      if (!result.title && generic.title) result.title = generic.title;
      if (generic.description && generic.description.length >= 50) {
        result.description = generic.description;
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
