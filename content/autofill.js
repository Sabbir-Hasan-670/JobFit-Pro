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
    if (['combobox', 'listbox', 'button', 'option', 'tab', 'menu'].includes(role)) return true;

    const hasPopup = (el.getAttribute('aria-haspopup') || '').toLowerCase();
    if (hasPopup === 'true' || hasPopup === 'listbox' || hasPopup === 'dialog' || hasPopup === 'menu') return true;

    const autoComp = (el.getAttribute('aria-autocomplete') || '').toLowerCase();
    if (autoComp === 'list' || autoComp === 'both') return true;

    // Check if strictly inside custom Workday prompt / combobox widgets
    if (el.closest('[data-automation-id*="promptOption"], [data-automation-id*="searchBox"], [data-automation-id*="countryDropdown"], [data-automation-id*="sourcePrompt"]')) {
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

      // 1. Focus element to simulate user focus
      element.focus();

      // 2. Prototype setter for Virtual DOM / React override
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

      // 3. React 16/17/18/19 internal value tracker sync
      if (element._valueTracker) {
        element._valueTracker.setValue(strVal);
      }

      // 4. Dispatch standard bubbling input & change events
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      // 5. Blur element
      element.blur();
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
  // WORKDAY DEDICATED SAFE AUTOFILL ENGINE (Multi-Step & Tabs)
  // ============================================================

  function hasTrueAriaPopup(el) {
    if (!el) return false;
    const val = (el.getAttribute('aria-haspopup') || '').toLowerCase();
    return val === 'true' || val === 'listbox' || val === 'dialog' || val === 'menu';
  }

  function findWorkdayElement(labelSets, automationKeywords, excludeKeywords = []) {
    // 1. Try finding by data-automation-id (on element or container)
    for (const auto of automationKeywords) {
      const candidates = Array.from(document.querySelectorAll(
        `input[data-automation-id*="${auto}"]:not([type="hidden"]), textarea[data-automation-id*="${auto}"], select[data-automation-id*="${auto}"], [data-automation-id*="${auto}"] input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), [data-automation-id*="${auto}"] textarea, [data-automation-id*="${auto}"] select`
      ));
      for (const el of candidates) {
        if (!el.disabled && !el.readOnly && el.getAttribute('role') !== 'combobox' && !hasTrueAriaPopup(el)) {
          return el;
        }
      }
    }

    // 2. Try finding by label text & wrapping form fields
    const labels = Array.from(document.querySelectorAll('label, [data-automation-id*="formField"], [class*="formField"], .form-group'));
    for (const lbl of labels) {
      const txt = (lbl.innerText || '').toLowerCase();
      if (excludeKeywords.some(ex => txt.includes(ex.toLowerCase()))) continue;

      for (const set of labelSets) {
        const matches = set.every(k => txt.includes(k.toLowerCase()));
        if (matches) {
          let el = null;
          if (lbl.htmlFor) {
            el = document.getElementById(lbl.htmlFor);
          }
          if (!el) {
            el = lbl.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select') ||
                 lbl.closest('[data-automation-id*="formField"], [class*="formField"], .form-group, div')?.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select');
          }
          if (!el && lbl.nextElementSibling) {
            el = lbl.nextElementSibling.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select') ||
                 (['INPUT', 'TEXTAREA', 'SELECT'].includes(lbl.nextElementSibling.tagName) ? lbl.nextElementSibling : null);
          }
          if (el && !el.disabled && !el.readOnly && el.getAttribute('role') !== 'combobox' && !hasTrueAriaPopup(el)) {
            return el;
          }
        }
      }
    }

    return null;
  }

  function autofillWorkday(profile) {
    let filledCount = 0;

    const tryFill = (input, val) => {
      if (input && val !== undefined && val !== null && String(val).trim() !== '') {
        if (input.tagName === 'SELECT') {
          if (setSelectOption(input, val)) {
            filledCount++;
            return true;
          }
        } else {
          if (setNativeValue(input, val)) {
            filledCount++;
            return true;
          }
        }
      }
      return false;
    };

    const getProfileVal = (...keys) => {
      for (const k of keys) {
        if (profile[k] && String(profile[k]).trim() !== '') return String(profile[k]).trim();
      }
      return '';
    };

    // ==========================================
    // STEP 1: PERSONAL INFORMATION (My Information)
    // ==========================================

    // 1. Given Name (Latin Script)
    let firstName = getProfileVal('firstName', 'givenName', 'fname');
    if (!firstName && profile.fullName) {
      firstName = profile.fullName.trim().split(/\s+/)[0];
    }
    if (firstName) {
      const el = findWorkdayElement(
        [['given', 'latin'], ['first', 'latin'], ['given name'], ['given']],
        ['legalNameSection_firstName', 'legalNameSection_givenName', 'givenName', 'firstName'],
        ['arabic']
      );
      tryFill(el, firstName);
    }

    // 2. Family Name (Latin Script)
    let lastName = getProfileVal('lastName', 'familyName', 'lname', 'surname');
    if (!lastName && profile.fullName) {
      lastName = profile.fullName.trim().split(/\s+/).slice(1).join(' ');
    }
    if (lastName) {
      const el = findWorkdayElement(
        [['family', 'latin'], ['last', 'latin'], ['family name'], ['family']],
        ['legalNameSection_lastName', 'legalNameSection_familyName', 'familyName', 'lastName'],
        ['arabic']
      );
      tryFill(el, lastName);
    }

    // 3. Address Line 1
    const address = getProfileVal('address', 'addressLine1', 'streetAddress', 'city');
    if (address) {
      const el = findWorkdayElement(
        [['address line 1'], ['street address'], ['address line'], ['address']],
        ['addressSection_addressLine1', 'addressLine1', 'streetAddress'],
        ['country', 'state', 'city', 'postal']
      );
      tryFill(el, address);
    }

    // 4. City
    const city = getProfileVal('city', 'town', 'municipality');
    if (city) {
      const el = findWorkdayElement(
        [['city'], ['town']],
        ['addressSection_city', 'city']
      );
      tryFill(el, city);
    }

    // 5. Postal / Zip Code
    const zip = getProfileVal('zipCode', 'zip', 'postalCode', 'postal');
    if (zip) {
      const el = findWorkdayElement(
        [['postal code'], ['zip code'], ['postal'], ['zip']],
        ['addressSection_postalCode', 'postalCode', 'zipCode', 'postal']
      );
      tryFill(el, zip);
    }

    // 6. Phone Number
    const phone = getProfileVal('phone', 'phoneNumber', 'mobile');
    if (phone) {
      const el = findWorkdayElement(
        [['phone number'], ['mobile phone'], ['phone']],
        ['phone-number', 'phoneNumber', 'multimedia-phone-number'],
        ['device', 'country code', 'extension']
      );
      tryFill(el, phone);
    }

    // 7. Email Address
    const email = getProfileVal('email', 'emailAddress');
    if (email) {
      const el = findWorkdayElement(
        [['email address'], ['email']],
        ['email', 'emailAddress']
      );
      tryFill(el, email);
    }

    // 8. Online Profiles / URLs
    const linkedin = getProfileVal('linkedinUrl', 'linkedin');
    if (linkedin) {
      const el = findWorkdayElement(
        [['linkedin']],
        ['linkedin', 'LinkedIn']
      );
      tryFill(el, linkedin);
    }

    const github = getProfileVal('githubUrl', 'github');
    if (github) {
      const el = findWorkdayElement(
        [['github']],
        ['github', 'GitHub']
      );
      tryFill(el, github);
    }

    const portfolio = getProfileVal('portfolioUrl', 'portfolio', 'website');
    if (portfolio) {
      const el = findWorkdayElement(
        [['website'], ['portfolio']],
        ['website', 'portfolio']
      );
      tryFill(el, portfolio);
    }

    // ==========================================
    // STEP 2: WORK EXPERIENCE & EDUCATION (My Experience)
    // ==========================================

    // 9. Work Experience - Job Title
    const jobTitle = getProfileVal('currentTitle', 'jobTitle', 'title', 'experienceTitle');
    if (jobTitle) {
      const el = findWorkdayElement(
        [['job title'], ['title'], ['position'], ['role title']],
        ['jobTitle', 'job-title', 'title', 'position', 'jobTitle_0']
      );
      tryFill(el, jobTitle);
    }

    // 10. Work Experience - Company
    const company = getProfileVal('currentCompany', 'company', 'employer', 'organization');
    if (company) {
      const el = findWorkdayElement(
        [['company'], ['employer'], ['organization'], ['company name']],
        ['company', 'companyName', 'employer', 'company_0']
      );
      tryFill(el, company);
    }

    // 11. Work Experience - Location
    const jobLocation = getProfileVal('city', 'location', 'state');
    if (jobLocation) {
      const el = findWorkdayElement(
        [['location'], ['job location']],
        ['location', 'jobLocation', 'location_0'],
        ['country', 'postal']
      );
      tryFill(el, jobLocation);
    }

    // 12. "I currently work here" (Checkbox)
    const currentJobCheck = document.querySelector('input[type="checkbox"][data-automation-id*="currentlyWorkHere"], input[type="checkbox"][data-automation-id*="currentJob"]') ||
      Array.from(document.querySelectorAll('label')).find(l => (l.innerText || '').toLowerCase().includes('currently work here'))?.querySelector('input[type="checkbox"]') ||
      Array.from(document.querySelectorAll('label')).find(l => (l.innerText || '').toLowerCase().includes('currently work here'))?.closest('div')?.querySelector('input[type="checkbox"]');

    if (currentJobCheck && !currentJobCheck.checked) {
      currentJobCheck.checked = true;
      currentJobCheck.dispatchEvent(new Event('change', { bubbles: true }));
      currentJobCheck.dispatchEvent(new Event('input', { bubbles: true }));
      filledCount++;
    }

    // 13. Work Experience - Dates (From / To)
    const fromDate = getProfileVal('jobStartDate', 'startDate', 'fromYear') || '01/2022';
    const toDate = getProfileVal('jobEndDate', 'endDate', 'toYear') || '08/2026';
    const fromEl = findWorkdayElement([['from']], ['startDate', 'jobStartDate', 'fromDate'], ['school', 'education']);
    if (fromEl) tryFill(fromEl, fromDate);
    const toEl = findWorkdayElement([['to']], ['endDate', 'jobEndDate', 'toDate'], ['school', 'education', 'hear']);
    if (toEl && (!currentJobCheck || !currentJobCheck.checked)) tryFill(toEl, toDate);

    // 14. Work Experience - Role Description (Textarea)
    const roleDesc = getProfileVal('roleDescription', 'experienceSummary', 'summary') ||
      (jobTitle ? `Experienced ${jobTitle} with a proven track record of designing, deploying, and maintaining high-performance infrastructure and delivering reliable solutions.` : '');
    if (roleDesc) {
      const el = findWorkdayElement(
        [['role description'], ['job description'], ['description'], ['responsibilities'], ['summary']],
        ['jobDescription', 'roleDescription', 'description', 'responsibilities', 'workExperience']
      );
      tryFill(el, roleDesc);
    }

    // 14. Education - School / University
    const school = getProfileVal('university', 'school', 'institution', 'college');
    if (school) {
      const el = findWorkdayElement(
        [['school or university'], ['school'], ['university'], ['institution'], ['college']],
        ['school', 'university', 'institution', 'college', 'education', 'schoolName'],
        ['field of study', 'degree', 'gpa', 'year']
      );
      tryFill(el, school);
    }

    // 15. Education - Degree (Dropdown / Button / Select)
    const degreeVal = getProfileVal('degree', 'highestDegree', 'education') || 'Bachelor';
    const degreeEl = document.querySelector('button[data-automation-id*="degree"], [data-automation-id*="formField-degree"] button, [data-automation-id*="formField-degree"] [role="button"], select[data-automation-id*="degree"], [data-automation-id*="highestDegree"] button') ||
      Array.from(document.querySelectorAll('label')).find(l => (l.innerText || '').toLowerCase().includes('degree'))?.closest('div')?.querySelector('button, select, [role="button"]') ||
      Array.from(document.querySelectorAll('label')).find(l => (l.innerText || '').toLowerCase().includes('degree'))?.parentElement?.querySelector('button, select, [role="button"]');

    if (degreeEl) {
      if (degreeEl.tagName === 'SELECT') {
        if (setSelectOption(degreeEl, degreeVal)) filledCount++;
      } else {
        degreeEl.focus();
        degreeEl.click();
        setTimeout(() => {
          const options = Array.from(document.querySelectorAll('[role="option"], [data-automation-id*="promptOption"], [data-automation-id*="menu-item"], [data-automation-id*="dropdownOption"], li[role="option"]'));
          const targetLower = degreeVal.toLowerCase();
          let matchedOpt = options.find(o => o.innerText && o.innerText.toLowerCase().includes(targetLower));
          if (!matchedOpt) {
            matchedOpt = options.find(o => {
              const t = (o.innerText || '').toLowerCase();
              return t.includes('bachelor') || t.includes('master') || t.includes('degree') || t.includes('undergraduate') || t.includes('bsc');
            });
          }
          if (matchedOpt) {
            matchedOpt.click();
          } else if (options.length > 1) {
            const validOpt = options.find(o => o.innerText && !o.innerText.toLowerCase().includes('select one'));
            if (validOpt) validOpt.click();
          }
        }, 300);
        filledCount++;
      }
    }

    // 16. Education - Field of Study (Searchable Prompt Combobox)
    const majorVal = getProfileVal('fieldOfStudy', 'major', 'discipline') || 'Computer Science';
    const fieldOfStudyInput = document.querySelector('input[data-automation-id*="fieldOfStudy"], input[data-automation-id*="field-of-study"], [data-automation-id*="formField-fieldOfStudy"] input, input[placeholder*="Field of Study"]') ||
      Array.from(document.querySelectorAll('label')).find(l => (l.innerText || '').toLowerCase().includes('field of study'))?.closest('div')?.querySelector('input') ||
      Array.from(document.querySelectorAll('label')).find(l => (l.innerText || '').toLowerCase().includes('field of study'))?.parentElement?.querySelector('input');

    if (fieldOfStudyInput) {
      fieldOfStudyInput.focus();
      setNativeValue(fieldOfStudyInput, majorVal);
      fieldOfStudyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      fieldOfStudyInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

      setTimeout(() => {
        const promptOpts = Array.from(document.querySelectorAll('[role="option"], [data-automation-id*="promptOption"], [data-automation-id*="menu-item"], [role="treeitem"]'));
        const match = promptOpts.find(o => (o.innerText || '').toLowerCase().includes(majorVal.toLowerCase())) || promptOpts[0];
        if (match) match.click();
      }, 350);
      filledCount++;
    }

    // 17. Education - Dates (From: YYYY, To: YYYY)
    const eduContainer = document.querySelector('[data-automation-id*="education"], [data-automation-id*="Education"], #education, .education-section') ||
      Array.from(document.querySelectorAll('h2, h3, h4, [data-automation-id*="header"], label')).find(h => (h.innerText || '').toLowerCase().includes('education'))?.closest('div, section, fieldset');

    if (eduContainer) {
      const yyyyInputs = Array.from(eduContainer.querySelectorAll('input')).filter(inp => {
        const p = (inp.placeholder || '').toUpperCase();
        const l = (getElementContext(inp) || '').toLowerCase();
        return p === 'YYYY' || l.includes('from') || l.includes('to') || l.includes('year') || l.includes('grad');
      });

      const gradYear = parseInt(getProfileVal('gradYear', 'graduationYear') || '2021', 10);
      const fromYear = String(gradYear - 4);
      const toYear = String(gradYear);

      if (yyyyInputs.length >= 2) {
        tryFill(yyyyInputs[0], fromYear);
        tryFill(yyyyInputs[1], toYear);
      } else if (yyyyInputs.length === 1) {
        tryFill(yyyyInputs[0], toYear);
      }
    }

    // 18. Education - Overall Result / GPA
    const gpaVal = getProfileVal('gpa', 'overallResult', 'grade') || '3.5';
    const gpaEl = findWorkdayElement(
      [['overall result'], ['gpa'], ['grade'], ['cgpa']],
      ['overallResult', 'gpa', 'grade', 'cgpa']
    );
    if (gpaEl) tryFill(gpaEl, gpaVal);

    // 19. Skills - (Type to Add Skills Multiselect Prompt)
    const skillsInput = document.querySelector('input[data-automation-id*="skills"], input[data-automation-id*="skill"], [data-automation-id*="skillsPrompt"] input, [data-automation-id*="formField-skills"] input, [data-automation-id*="skills-prompt"] input') ||
      Array.from(document.querySelectorAll('label')).find(l => (l.innerText || '').toLowerCase().includes('skills') || (l.innerText || '').toLowerCase().includes('type to add skills'))?.closest('div')?.querySelector('input') ||
      Array.from(document.querySelectorAll('label')).find(l => (l.innerText || '').toLowerCase().includes('skills') || (l.innerText || '').toLowerCase().includes('type to add skills'))?.parentElement?.querySelector('input');

    if (skillsInput) {
      let skillsList = [];
      if (profile.skills) {
        if (Array.isArray(profile.skills)) skillsList = profile.skills;
        else if (typeof profile.skills === 'string') skillsList = profile.skills.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
      }

      if (skillsList.length === 0) {
        skillsList = ['Network Engineering', 'Cisco', 'Routing & Switching', 'TCP/IP', 'Linux', 'Python', 'Firewalls', 'Network Security'];
      }

      (async () => {
        for (const sk of skillsList.slice(0, 8)) {
          skillsInput.focus();
          setNativeValue(skillsInput, sk);
          skillsInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          skillsInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

          await new Promise(r => setTimeout(r, 350));
          const promptOpts = Array.from(document.querySelectorAll('[role="option"], [data-automation-id*="promptOption"], [data-automation-id*="menu-item"]'));
          const match = promptOpts.find(o => (o.innerText || '').toLowerCase().includes(sk.toLowerCase())) || promptOpts[0];
          if (match) {
            match.click();
            await new Promise(r => setTimeout(r, 200));
          }
        }
      })();
      filledCount++;
    }

    // ==========================================
    // STEP 3 & 4: APPLICATION QUESTIONS (Work Auth, Sponsorship, etc.)
    // ==========================================

    // 19. Notice Period
    const notice = getProfileVal('noticePeriod', 'notice');
    if (notice) {
      const el = findWorkdayElement(
        [['notice period'], ['notice']],
        ['noticePeriod', 'notice']
      );
      tryFill(el, notice);
    }

    // 20. Expected Salary
    const salary = getProfileVal('salary', 'expectedSalary', 'compensation');
    if (salary) {
      const el = findWorkdayElement(
        [['salary'], ['expected salary'], ['compensation']],
        ['salary', 'expectedSalary', 'compensation']
      );
      tryFill(el, salary);
    }

    // 21. Total Years of Experience
    const exp = getProfileVal('experience', 'yearsExperience', 'totalExperience');
    if (exp) {
      const el = findWorkdayElement(
        [['years of experience'], ['total experience'], ['experience']],
        ['experience', 'yearsExperience']
      );
      tryFill(el, exp);
    }

    // 22. Generic fallback for any other inputs/textareas
    const remainingInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).filter(el => {
      if (!el || el.disabled || el.readOnly || isComplexPromptWidget(el)) return false;
      const type = (el.type || '').toLowerCase();
      if (['submit', 'button', 'file', 'image', 'reset'].includes(type)) return false;
      return true;
    });

    for (const el of remainingInputs) {
      try {
        const ctx = getElementContext(el);
        const category = matchFieldCategory(ctx, el);
        if (category && profile[category]) {
          const val = profile[category];
          if (el.tagName === 'SELECT') {
            if (setSelectOption(el, val)) filledCount++;
          } else {
            if (setNativeValue(el, val)) filledCount++;
          }
        }
      } catch (_) {}
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

    // 1. Specific type checks first
    if (type === 'email' || ctx.includes('email') || ctx.includes('e-mail') || ctx.includes('email address')) {
      return 'email';
    }
    if (type === 'tel' || ctx.includes('phone') || ctx.includes('mobile') || ctx.includes('telephone') || ctx.includes('contact number')) {
      return 'phone';
    }

    // 2. Education & Skills Guard (Check before names!)
    if (ctx.includes('skill') || ctx.includes('skills') || ctx.includes('type to add skills')) {
      return 'skills';
    }
    if (ctx.includes('field of study') || ctx.includes('major') || ctx.includes('discipline')) {
      return 'fieldOfStudy';
    }
    if (ctx.includes('highest degree') || ctx.includes('education level') || (ctx.includes('degree') && !ctx.includes('agree'))) {
      return 'degree';
    }
    if (ctx.includes('university') || ctx.includes('school') || ctx.includes('college') || ctx.includes('institution') || ctx.includes('schoolname')) {
      return 'university';
    }
    if (ctx.includes('gpa') || ctx.includes('overall result') || ctx.includes('grade') || ctx.includes('cgpa')) {
      return 'gpa';
    }
    if (ctx.includes('graduation year') || ctx.includes('grad year') || ctx.includes('year of graduation')) {
      return 'gradYear';
    }

    // 3. Work Experience & Role Guard
    if (ctx.includes('role description') || ctx.includes('job description') || ctx.includes('responsibilities') || ctx.includes('work experience')) {
      return 'roleDescription';
    }
    if (ctx.includes('current title') || ctx.includes('recent title') || ctx.includes('job title') || ctx.includes('position title')) {
      return 'currentTitle';
    }
    if (ctx.includes('current company') || ctx.includes('current employer') || ctx.includes('recent employer') || ctx.includes('company name')) {
      return 'currentCompany';
    }
    if (ctx.includes('years of experience') || ctx.includes('total experience') || ctx.includes('how many years')) {
      return 'experience';
    }
    if (ctx.includes('notice period') || ctx.includes('availability') || ctx.includes('start date')) {
      return 'noticePeriod';
    }
    if (ctx.includes('desired salary') || ctx.includes('expected salary') || ctx.includes('salary expectation')) {
      return 'salary';
    }

    // 4. Workday Latin vs Non-Latin / Arabic separation
    const isArabic = ctx.includes('arabic');
    if (isArabic) {
      if (ctx.includes('given') || ctx.includes('first')) return 'arabicFirstName';
      if (ctx.includes('family') || ctx.includes('last')) return 'arabicLastName';
      return null;
    }

    // 5. Personal Names (Guarded against school/company)
    if (
      !ctx.includes('school') && !ctx.includes('company') && !ctx.includes('degree') &&
      (
        ctx.includes('given name') ||
        ctx.includes('first name') ||
        ctx.includes('fname') ||
        ctx.includes('firstname') ||
        ctx.includes('first_name') ||
        (ctx.includes('latin script') && ctx.includes('given')) ||
        ctx.includes('legalnamesection_firstname') ||
        ctx.includes('legalnamesection_givenname')
      )
    ) {
      return 'firstName';
    }

    if (
      !ctx.includes('school') && !ctx.includes('company') && !ctx.includes('degree') &&
      (
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
      )
    ) {
      return 'lastName';
    }

    if ((ctx.includes('full name') || ctx.includes('candidate name') || ctx.includes('your name')) && !ctx.includes('first') && !ctx.includes('last') && !ctx.includes('company') && !ctx.includes('school')) {
      return 'fullName';
    }

    // 6. URLs
    if (ctx.includes('linkedin') || ctx.includes('linked-in') || ctx.includes('linkedin.com')) {
      return 'linkedinUrl';
    }
    if (ctx.includes('github') || ctx.includes('github.com') || ctx.includes('git hub')) {
      return 'githubUrl';
    }
    if (ctx.includes('portfolio') || ctx.includes('personal site') || ctx.includes('personal url') || ctx.includes('website')) {
      return 'portfolioUrl';
    }

    // 7. Location
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

    // 8. Work Authorization & Sponsorship
    if (ctx.includes('authorized to work') || ctx.includes('legally authorized') || ctx.includes('right to work')) {
      return 'workAuth';
    }
    if (ctx.includes('sponsorship') || ctx.includes('visa sponsorship') || ctx.includes('require sponsorship')) {
      return 'sponsorship';
    }

    // 9. EEO / Diversity
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
    let pill = document.getElementById('jobfit-floating-pill');
    if (!pill) {
      const hasApplicationContext =
        document.querySelector('.jobs-easy-apply-modal, .jobs-apply-button, form, #job-application, .application-form, [data-view-name="job-details"]') ||
        window.location.href.includes('easy-apply') ||
        window.location.href.includes('greenhouse.io') ||
        window.location.href.includes('lever.co') ||
        window.location.href.includes('myworkdayjobs.com') ||
        window.location.href.includes('ashbyhq.com');

      if (!hasApplicationContext) return;

      pill = document.createElement('div');
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

      if (!document.getElementById('jobfit-pill-style')) {
        const style = document.createElement('style');
        style.id = 'jobfit-pill-style';
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
      }

      document.body.appendChild(pill);
    }

    const btn = document.getElementById('jobfitPillBtn');
    if (btn) {
      btn.onclick = async () => {
        const data = await chrome.storage.local.get(['userProfile']);
        if (!data.userProfile) {
          showPillToast('⚠️ Candidate Profile is empty! Open Settings to fill.', true);
          return;
        }

        const runner = window.__jobFitAutofillForm || autofillForm;
        const result = await runner(data.userProfile);
        showPillToast(result.message || `✨ Filled ${result.count} fields!`);
      };
    }
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
