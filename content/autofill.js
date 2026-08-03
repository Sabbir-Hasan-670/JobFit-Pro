// ============================================================
// JobFit Pro — Smart 1-Click Application Form Autofill Engine
// Supports: LinkedIn Easy Apply, Greenhouse, Lever, Workday,
//           Indeed, Ashby, Taleo, ZipRecruiter & Generic Forms
// ============================================================

(() => {
  console.log('[JobFit Pro] Autofill engine updated & active.');

  // ============================================================
  // REACT / VUE / ANGULAR SAFE VALUE SETTERS
  // ============================================================

  function isComplexPromptWidget(el) {
    if (!el) return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'combobox' || role === 'listbox' || role === 'button' || role === 'option') return true;
    if (el.getAttribute('aria-haspopup')) return true;
    if (el.getAttribute('aria-autocomplete')) return true;

    // Check if inside custom Workday prompt or select box
    if (el.closest('[data-automation-id*="prompt"], [data-automation-id*="dropdown"], [data-automation-id*="select-widget"], [data-automation-id*="countryDropdown"], [data-automation-id*="sourcePrompt"]')) {
      return true;
    }
    return false;
  }

  function setNativeValue(element, value) {
    if (!element || value === undefined || value === null || value === '') return false;
    if (element.readOnly || element.disabled) return false;
    if (isComplexPromptWidget(element)) return false;

    try {
      const strVal = String(value).trim();
      if (!strVal) return false;
      if (element.value === strVal) return true;

      // 1. Prototype setter for Virtual DOM sync
      const isTextArea = element instanceof HTMLTextAreaElement;
      const prototype = isTextArea
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, strVal);
      } else {
        element.value = strVal;
      }

      // 2. React 16/17/18/19 internal value tracker sync
      if (element._valueTracker) {
        element._valueTracker.setValue(strVal);
      }

      // 3. Dispatch standard bubbling events
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return true;
    } catch (e) {
      console.warn('[JobFit Pro] Could not set input value safely:', e);
      return false;
    }
  }

  function setSelectOption(select, targetValue) {
    if (!select || !targetValue || select.disabled) return false;
    const target = String(targetValue).toLowerCase().trim();
    const options = Array.from(select.options || []);

    // 1. Exact match by text or value
    let match = options.find(o =>
      o.text.toLowerCase().trim() === target ||
      o.value.toLowerCase().trim() === target
    );

    // 2. Partial match
    if (!match) {
      match = options.find(o => {
        const txt = o.text.toLowerCase().trim();
        return txt.length > 1 && (target.includes(txt) || txt.includes(target));
      });
    }

    if (match) {
      try {
        select.selectedIndex = match.index;
        select.value = match.value;
        if (select._valueTracker) {
          select._valueTracker.setValue(match.value);
        }
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  function setRadioOption(radios, desiredChoice) {
    if (!radios || radios.length === 0 || !desiredChoice) return false;
    const isYes = /yes|true|authorized|agree|1/i.test(desiredChoice);

    for (const radio of radios) {
      if (radio.disabled) continue;
      const text = getElementContext(radio);
      const isRadioYes = /yes|authorized|eligible|true|1/i.test(text) || /yes|true/i.test(radio.value);
      const isRadioNo  = /no|not|false|0/i.test(text) || /no|false/i.test(radio.value);

      if (isYes && isRadioYes && !isRadioNo) {
        try {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        } catch (_) {}
      }
      if (!isYes && isRadioNo) {
        try {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        } catch (_) {}
      }
    }
    return false;
  }

  // ============================================================
  // WORKDAY DEDICATED SAFE AUTOFILL ENGINE
  // ============================================================

  function autofillWorkday(profile) {
    let filledCount = 0;

    const fillTarget = (selectors, value) => {
      if (!value) return;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && !el.disabled && !el.readOnly && !isComplexPromptWidget(el) && (!el.value || el.value === '')) {
          if (setNativeValue(el, value)) {
            filledCount++;
            return;
          }
        }
      }
    };

    // 1. Given Name (Latin Script)
    const firstName = profile.firstName || (profile.fullName ? profile.fullName.split(' ')[0] : '');
    fillTarget([
      'input[data-automation-id*="legalNameSection_firstName"]',
      'input[data-automation-id*="legalNameSection_givenName"]',
      'input[data-automation-id="legalNameSection_firstName"]',
      'input[data-automation-id="givenName"]',
      'input[data-automation-id="firstName"]'
    ], firstName);

    // 2. Family Name (Latin Script)
    const lastName = profile.lastName || (profile.fullName ? profile.fullName.split(' ').slice(1).join(' ') : '');
    fillTarget([
      'input[data-automation-id*="legalNameSection_lastName"]',
      'input[data-automation-id*="legalNameSection_familyName"]',
      'input[data-automation-id="legalNameSection_lastName"]',
      'input[data-automation-id="familyName"]',
      'input[data-automation-id="lastName"]'
    ], lastName);

    // 3. Address Line 1
    const address = profile.address || profile.city || '';
    fillTarget([
      'input[data-automation-id*="addressSection_addressLine1"]',
      'input[data-automation-id="addressSection_addressLine1"]',
      'input[data-automation-id="addressLine1"]'
    ], address);

    // 4. City
    if (profile.city) {
      fillTarget([
        'input[data-automation-id*="addressSection_city"]',
        'input[data-automation-id="addressSection_city"]',
        'input[data-automation-id="city"]'
      ], profile.city);
    }

    // 5. Postal / Zip Code
    const zip = profile.zip || profile.zipCode || '';
    if (zip) {
      fillTarget([
        'input[data-automation-id*="addressSection_postalCode"]',
        'input[data-automation-id="addressSection_postalCode"]',
        'input[data-automation-id="postalCode"]'
      ], zip);
    }

    // 6. Phone Number
    const phone = profile.phone || profile.mobile || '';
    if (phone) {
      fillTarget([
        'input[data-automation-id*="phone-number"]',
        'input[data-automation-id="phone-number"]',
        'input[data-automation-id*="phoneNumber"]',
        'input[data-automation-id="multimedia-phone-number"]'
      ], phone);
    }

    // 7. Email
    if (profile.email) {
      fillTarget([
        'input[data-automation-id*="email"]',
        'input[data-automation-id="email"]',
        'input[type="email"]'
      ], profile.email);
    }

    // 8. Online Profiles / URLs
    if (profile.linkedin || profile.linkedinUrl) {
      fillTarget([
        'input[data-automation-id*="linkedin"]',
        'input[data-automation-id*="LinkedIn"]'
      ], profile.linkedin || profile.linkedinUrl);
    }
    if (profile.github || profile.githubUrl) {
      fillTarget([
        'input[data-automation-id*="github"]',
        'input[data-automation-id*="GitHub"]'
      ], profile.github || profile.githubUrl);
    }
    if (profile.portfolio || profile.portfolioUrl) {
      fillTarget([
        'input[data-automation-id*="website"]',
        'input[data-automation-id*="portfolio"]'
      ], profile.portfolio || profile.portfolioUrl);
    }

    return filledCount;
  }

  // ============================================================
  // FIELD CONTEXT EXTRACTOR (Label, placeholder, aria, name, id)
  // ============================================================

  function getElementContext(el) {
    if (!el) return '';
    const parts = [];

    // 1. Standard attributes
    if (el.name) parts.push(el.name);
    if (el.id) parts.push(el.id);
    if (el.placeholder) parts.push(el.placeholder);
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    if (el.getAttribute('autocomplete')) parts.push(el.getAttribute('autocomplete'));

    // 2. Associated <label> via 'for' attribute
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label && label.innerText) parts.push(label.innerText);
      } catch (_) {}
    }

    // 3. Associated label via aria-labelledby
    if (el.getAttribute('aria-labelledby')) {
      const ids = el.getAttribute('aria-labelledby').split(/\s+/);
      ids.forEach(id => {
        try {
          const lbl = document.getElementById(id);
          if (lbl && lbl.innerText) parts.push(lbl.innerText);
        } catch (_) {}
      });
    }

    // 4. Closest direct field wrapper
    const directWrapper = el.closest('label, [data-automation-id*="formField-"], [data-automation-id*="form-item"], .form-group, .field, [class*="formField-"], [class*="form-element"]');
    if (directWrapper && directWrapper.innerText && directWrapper.innerText.length < 120) {
      parts.push(directWrapper.innerText);
    }

    // 5. Preceding sibling label or text
    let prev = el.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL' || prev.tagName === 'SPAN') {
        if (prev.innerText && prev.innerText.length < 80) {
          parts.push(prev.innerText);
        }
        break;
      }
      prev = prev.previousElementSibling;
    }

    return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ============================================================
  // FIELD CLASSIFIER & MATCHER
  // ============================================================

  function matchFieldCategory(ctx, el) {
    const type = (el.type || '').toLowerCase();

    // Specific type checks first
    if (type === 'email' || ctx.includes('email') || ctx.includes('e-mail') || ctx.includes('email address')) {
      return 'email';
    }
    if (type === 'tel' || ctx.includes('phone') || ctx.includes('mobile') || ctx.includes('telephone') || ctx.includes('contact number')) {
      return 'phone';
    }

    // Workday Latin vs Non-Latin / Arabic separation
    const isArabic = ctx.includes('arabic');
    if (isArabic) {
      if (ctx.includes('given') || ctx.includes('first')) return 'arabicFirstName';
      if (ctx.includes('family') || ctx.includes('last')) return 'arabicLastName';
      return null;
    }

    if (
      ctx.includes('given name') ||
      ctx.includes('first name') ||
      ctx.includes('fname') ||
      ctx.includes('firstname') ||
      ctx.includes('first_name') ||
      (ctx.includes('latin script') && ctx.includes('given')) ||
      ctx.includes('legalnamesection_firstname') ||
      ctx.includes('legalnamesection_givenname')
    ) {
      return 'firstName';
    }

    if (
      ctx.includes('family name') ||
      ctx.includes('last name') ||
      ctx.includes('lname') ||
      ctx.includes('familyname') ||
      ctx.includes('surname') ||
      ctx.includes('lastname') ||
      ctx.includes('last_name') ||
      (ctx.includes('latin script') && ctx.includes('family')) ||
      ctx.includes('legalnamesection_lastname') ||
      ctx.includes('legalnamesection_familyname')
    ) {
      return 'lastName';
    }

    if ((ctx.includes('full name') || ctx.includes('candidate name') || ctx.includes('your name')) && !ctx.includes('first') && !ctx.includes('last') && !ctx.includes('company')) {
      return 'fullName';
    }

    // URLs
    if (ctx.includes('linkedin') || ctx.includes('linked-in') || ctx.includes('linkedin.com')) {
      return 'linkedinUrl';
    }
    if (ctx.includes('github') || ctx.includes('github.com') || ctx.includes('git hub')) {
      return 'githubUrl';
    }
    if (ctx.includes('portfolio') || ctx.includes('personal site') || ctx.includes('personal url') || ctx.includes('website')) {
      return 'portfolioUrl';
    }

    // Location
    if (ctx.includes('addresssection_city') || ctx.includes('city') || ctx.includes('town')) {
      return 'city';
    }
    if (ctx.includes('addresssection_countryregion') || ctx.includes('state') || ctx.includes('province') || ctx.includes('region')) {
      return 'state';
    }
    if (ctx.includes('country') || ctx.includes('nationality')) {
      return 'country';
    }
    if (ctx.includes('addresssection_postalcode') || ctx.includes('zip') || ctx.includes('postal') || ctx.includes('postcode')) {
      return 'zipCode';
    }

    // Work Authorization & Sponsorship
    if (ctx.includes('authorized to work') || ctx.includes('legally authorized') || ctx.includes('right to work')) {
      return 'workAuth';
    }
    if (ctx.includes('sponsorship') || ctx.includes('visa sponsorship') || ctx.includes('require sponsorship')) {
      return 'sponsorship';
    }

    // Experience & Role
    if (ctx.includes('years of experience') || ctx.includes('total experience') || ctx.includes('how many years')) {
      return 'experience';
    }
    if (ctx.includes('current title') || ctx.includes('recent title') || ctx.includes('current role') || ctx.includes('job title')) {
      return 'currentTitle';
    }
    if (ctx.includes('current company') || ctx.includes('current employer') || ctx.includes('recent employer')) {
      return 'currentCompany';
    }
    if (ctx.includes('notice period') || ctx.includes('availability') || ctx.includes('start date')) {
      return 'noticePeriod';
    }
    if (ctx.includes('desired salary') || ctx.includes('expected salary') || ctx.includes('salary expectation')) {
      return 'salary';
    }

    // Education
    if (ctx.includes('highest degree') || ctx.includes('education level') || ctx.includes('degree')) {
      return 'degree';
    }
    if (ctx.includes('university') || ctx.includes('school') || ctx.includes('college') || ctx.includes('institution')) {
      return 'university';
    }
    if (ctx.includes('graduation year') || ctx.includes('grad year') || ctx.includes('year of graduation')) {
      return 'gradYear';
    }

    // EEO / Diversity
    if (ctx.includes('gender') || ctx.includes('sex')) {
      return 'gender';
    }
    if (ctx.includes('veteran') || ctx.includes('military')) {
      return 'veteran';
    }
    if (ctx.includes('disability') || ctx.includes('handicap')) {
      return 'disability';
    }

    return null;
  }

  // ============================================================
  // MAIN AUTOFILL FUNCTION
  // ============================================================

  async function autofillForm(profile, fillAiQuestions = false) {
    if (!profile) {
      console.warn('[JobFit Pro] No profile data available to autofill.');
      return { count: 0, message: 'No candidate profile found. Please set it in Settings.' };
    }

    // 1. If on Workday, use dedicated Workday engine
    const isWorkday = Boolean(
      window.location.hostname.includes('myworkdayjobs.com') ||
      document.querySelector('[data-automation-id*="legalNameSection"], [data-automation-id*="addressSection"], [data-automation-id*="formField"]')
    );

    if (isWorkday) {
      const workdayCount = autofillWorkday(profile);
      console.log(`[JobFit Pro] Workday autofill completed. Total fields filled: ${workdayCount}`);
      return { count: workdayCount, message: `✨ Filled ${workdayCount} Workday fields!` };
    }

    let filledCount = 0;

    // 2. Generic scan for other platforms (LinkedIn, Greenhouse, Lever, etc.)
    const allElements = Array.from(document.querySelectorAll('input, select, textarea'));
    const inputs = allElements.filter(el => {
      if (!el || el.disabled || el.readOnly) return false;
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'file', 'image', 'reset'].includes(type)) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (isComplexPromptWidget(el)) return false;
      return true;
    });

    const radioGroups = {};

    for (const el of inputs) {
      try {
        if (el.type === 'radio') {
          const groupName = el.name || 'unnamed_radio';
          if (!radioGroups[groupName]) radioGroups[groupName] = [];
          radioGroups[groupName].push(el);
          continue;
        }

        const ctx = getElementContext(el);
        const category = matchFieldCategory(ctx, el);

        if (category && profile[category]) {
          const val = profile[category];
          if (el.tagName === 'SELECT') {
            if (setSelectOption(el, val)) filledCount++;
          } else {
            if (setNativeValue(el, val)) filledCount++;
          }
        } else if (category === 'fullName' && (profile.fullName || (profile.firstName && profile.lastName))) {
          const val = profile.fullName || `${profile.firstName} ${profile.lastName}`.trim();
          if (setNativeValue(el, val)) filledCount++;
        }
      } catch (err) {
        console.warn('[JobFit Pro] Field fill warning:', err);
      }
    }

    // Radio Groups
    for (const groupName of Object.keys(radioGroups)) {
      try {
        const radios = radioGroups[groupName];
        const ctx = getElementContext(radios[0]);
        const category = matchFieldCategory(ctx, radios[0]);

        if (category && profile[category]) {
          if (setRadioOption(radios, profile[category])) filledCount++;
        }
      } catch (err) {
        console.warn('[JobFit Pro] Radio group warning:', err);
      }
    }

    console.log(`[JobFit Pro] Autofill completed. Total fields filled: ${filledCount}`);
    return { count: filledCount, message: `✨ Successfully filled ${filledCount} fields!` };
  }

  // ============================================================
  // FLOATING ON-PAGE WIDGET (Pill button on Job Portals)
  // ============================================================

  function injectFloatingWidget() {
    if (document.getElementById('jobfit-floating-pill')) return;

    // Only inject if there's a visible form or application modal
    const hasApplicationContext =
      document.querySelector('.jobs-easy-apply-modal, .jobs-apply-button, form, #job-application, .application-form, [data-view-name="job-details"]') ||
      window.location.href.includes('easy-apply') ||
      window.location.href.includes('greenhouse.io') ||
      window.location.href.includes('lever.co') ||
      window.location.href.includes('myworkdayjobs.com') ||
      window.location.href.includes('ashbyhq.com');

    if (!hasApplicationContext) return;

    const pill = document.createElement('div');
    pill.id = 'jobfit-floating-pill';
    pill.innerHTML = `
      <div class="jobfit-pill-btn" id="jobfitPillBtn" title="Autofill Application Form with JobFit Pro">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>⚡ Autofill Form</span>
      </div>
      <div class="jobfit-pill-toast" id="jobfitPillToast" style="display:none;"></div>
    `;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #jobfit-floating-pill {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .jobfit-pill-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, #6c63ff, #7c3aed);
        color: #ffffff;
        padding: 10px 18px;
        border-radius: 30px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(108, 99, 255, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: all 0.2s ease;
        user-select: none;
      }
      .jobfit-pill-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 25px rgba(108, 99, 255, 0.6);
      }
      .jobfit-pill-btn:active {
        transform: translateY(0);
      }
      .jobfit-pill-toast {
        position: absolute;
        bottom: 48px;
        right: 0;
        background: rgba(13, 15, 23, 0.95);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.35);
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(pill);

    // Event listener for floating button
    document.getElementById('jobfitPillBtn').addEventListener('click', async () => {
      const data = await chrome.storage.local.get(['userProfile']);
      if (!data.userProfile) {
        showPillToast('⚠️ Please configure Profile in Settings first!', true);
        return;
      }

      const result = await autofillForm(data.userProfile);
      showPillToast(result.message || `✨ Filled ${result.count} fields!`);
    });
  }

  function showPillToast(msg, isError = false) {
    const toast = document.getElementById('jobfitPillToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.color = isError ? '#f87171' : '#4ade80';
    toast.style.borderColor = isError ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.35)';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }

  // Expose global runner for direct scripting execution
  window.__jobFitAutofillForm = autofillForm;

  // Inject floating button after page idle and on URL change
  setTimeout(injectFloatingWidget, 1500);
  setInterval(injectFloatingWidget, 4000);

  // ============================================================
  // MESSAGE LISTENER (From Popup / Background)
  // ============================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TRIGGER_AUTOFILL') {
      (async () => {
        try {
          const data = await chrome.storage.local.get(['userProfile']);
          const result = await autofillForm(data.userProfile);
          sendResponse({ success: true, count: result.count, message: result.message });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // Keep channel open for async response
    }
  });

})();
