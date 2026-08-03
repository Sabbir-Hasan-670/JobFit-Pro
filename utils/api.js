// ============================================================
// JobFit Pro — AI API Utility Module
// Supports: Google Gemini, OpenAI, OpenRouter with AbortSignal
// ============================================================

// ============================================================
// PROMPTS
// ============================================================

/**
 * Build the analysis prompt sent to the AI.
 * Returns a structured JSON response.
 */
function buildAnalysisPrompt(cvText, jobDescription, jobTitle) {
  return `
You are an expert ATS (Applicant Tracking System) analyst and career coach.

Analyze the following CV against the job description and return a JSON object ONLY — no markdown, no explanation, no code fences.

JOB TITLE: ${jobTitle || 'Not specified'}

JOB DESCRIPTION:
"""
${jobDescription.substring(0, 4000)}
"""

CANDIDATE CV:
"""
${cvText.substring(0, 3000)}
"""

Return ONLY this JSON structure (valid JSON, no comments):
{
  "matchScore": <integer 0-100>,
  "matchSummary": "<2-3 sentence summary of the overall fit>",
  "matchingSkills": ["skill1", "skill2", "skill3"],
  "missingSkills": ["skill1", "skill2", "skill3"],
  "atsTips": [
    "Tip 1: specific actionable ATS optimization advice",
    "Tip 2: ...",
    "Tip 3: ...",
    "Tip 4: ...",
    "Tip 5: ..."
  ],
  "experienceGap": "<short note on experience level match or mismatch>",
  "keywordDensity": "<low|medium|high>"
}

Rules:
- matchScore: 0-100 based on skills overlap, experience alignment, keyword match
- missingSkills: max 10 items, only hard skills/technologies missing from the CV
- atsTips: exactly 4-5 actionable items about keywords, formatting, sections to add
- Be honest and specific, not generic
`.trim();
}

/**
 * Build the cover letter generation prompt.
 */
function buildCoverLetterPrompt(cvText, jobDescription, jobTitle, analysisResult) {
  const matchingSkills = analysisResult?.matchingSkills?.slice(0, 8).join(', ') || '';

  return `
You are a professional cover letter writer specializing in ATS-optimized applications.

Write a compelling, personalized cover letter based on the following:

JOB TITLE: ${jobTitle || 'the advertised position'}

JOB DESCRIPTION (excerpt):
"""
${jobDescription.substring(0, 2500)}
"""

CANDIDATE'S CV:
"""
${cvText.substring(0, 2000)}
"""

${matchingSkills ? `KEY MATCHING SKILLS TO HIGHLIGHT: ${matchingSkills}` : ''}

INSTRUCTIONS:
- Write in a confident, professional but warm tone
- 3-4 paragraphs: Opening hook, Skills/Experience match, Value proposition, Call to action
- Naturally weave in relevant keywords from the job description for ATS optimization
- DO NOT use placeholder text like [Your Name] or [Company Name] — infer from the CV and JD
- If company name is not clear, use "your organization"
- Keep it under 350 words
- Start directly with "Dear Hiring Manager," — no preamble
- End with a professional closing like "Sincerely," followed by the candidate's name from the CV

Write ONLY the cover letter text. No explanations, no JSON.
`.trim();
}

// ============================================================
// GEMINI API CALL (Dynamic Auto-Discovery & Resilient Fallback)
// ============================================================

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
let cachedWorkingModel = null;

const GEMINI_FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

/**
 * Helper to fetch with timeout
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(url, { ...options, signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError' && !options.signal?.aborted) {
      throw new Error('Request timed out. Please check your internet connection or API key.');
    }
    throw err;
  }
}

/**
 * Discover the best available Gemini model for the user's API key
 */
async function discoverGeminiModel(apiKey, signal = null) {
  if (cachedWorkingModel) return cachedWorkingModel;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`, { signal });
    if (res.ok) {
      const data = await res.json();
      const models = data?.models || [];

      const contentModels = models.filter(m =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent')
      );

      if (contentModels.length > 0) {
        const preferred =
          contentModels.find(m => m.name.includes('2.0-flash')) ||
          contentModels.find(m => m.name.includes('1.5-flash') && !m.name.includes('8b')) ||
          contentModels.find(m => m.name.includes('flash')) ||
          contentModels.find(m => m.name.includes('1.5-pro')) ||
          contentModels.find(m => m.name.includes('pro')) ||
          contentModels[0];

        if (preferred?.name) {
          const cleanName = preferred.name.replace(/^models\//, '');
          console.log(`[JobFit Pro] Auto-discovered available Gemini model: ${cleanName}`);
          cachedWorkingModel = cleanName;
          return cleanName;
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn('[JobFit Pro] Model discovery failed, using fallback list:', e.message);
  }

  return 'gemini-1.5-flash';
}

/**
 * Call Gemini API with dynamic model discovery, fallback, and AbortSignal
 */
async function callGemini(apiKey, prompt, jsonMode = false, signal = null) {
  const discoveredModel = await discoverGeminiModel(apiKey, signal);
  const modelsToTry = [
    discoveredModel,
    ...GEMINI_FALLBACK_MODELS.filter(m => m !== discoveredModel)
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    if (signal?.aborted) {
      const abortErr = new Error('Analysis cancelled.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    try {
      const url = `${GEMINI_API_BASE}/models/${modelName}:generateContent?key=${apiKey}`;

      const generationConfig = {
        temperature:     0.3,
        topK:            40,
        topP:            0.95,
        maxOutputTokens: 2048,
      };

      if (jsonMode && !modelName.includes('gemini-pro') && !modelName.includes('-001')) {
        generationConfig.responseMimeType = 'application/json';
      }

      const requestBody = {
        contents: [
          {
            parts: [{ text: prompt }],
            role: 'user',
          },
        ],
        generationConfig,
      };

      const response = await fetchWithTimeout(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
        signal,
      }, 15000);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg  = errData?.error?.message || `HTTP ${response.status}`;

        if (response.status === 400) {
          if (errMsg.includes('API key') || errMsg.includes('API_KEY_INVALID')) {
            throw new Error('Invalid Gemini API key. Please check your key in Settings.');
          }
          throw new Error(`Gemini Error: ${errMsg}`);
        }

        if (response.status === 429) {
          throw new Error('Gemini API rate limit or quota exceeded. Please wait a moment or check your Google AI Studio quota.');
        }

        if (response.status === 404 || errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('not supported')) {
          console.warn(`[JobFit Pro] Model ${modelName} not available (${errMsg}), trying next model...`);
          lastError = new Error(errMsg);
          continue;
        }

        throw new Error(errMsg);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        const reason = data?.candidates?.[0]?.finishReason;
        throw new Error(`Gemini returned no content. (Reason: ${reason || 'unknown'})`);
      }

      cachedWorkingModel = modelName;
      console.log(`[JobFit Pro] Successfully generated content using Gemini model: ${modelName}`);
      return text.trim();

    } catch (err) {
      if (signal?.aborted || err.name === 'AbortError') throw err;
      lastError = err;
      if (err.message.includes('Invalid Gemini API key') || err.message.includes('quota exceeded')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Failed to connect to Gemini API with available models.');
}

// ============================================================
// OPENAI API CALL
// ============================================================

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const OPENAI_MODEL    = 'gpt-4o-mini';

async function callOpenAI(apiKey, prompt, jsonMode = false, signal = null) {
  const url = `${OPENAI_API_BASE}/chat/completions`;

  const requestBody = {
    model: OPENAI_MODEL,
    messages: [
      {
        role:    'system',
        content: 'You are an expert ATS analyst and professional career coach. You always respond with exactly what is requested — JSON when asked for JSON, plain text when asked for text.',
      },
      {
        role:    'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens:  2048,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || `OpenAI API error: HTTP ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) throw new Error('OpenAI returned no content.');
  return text.trim();
}

// ============================================================
// OPENROUTER API CALL
// ============================================================

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

const OPENROUTER_FALLBACK_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'openai/gpt-oss-20b:free',
  'inclusionai/ling-3.0-flash:free',
  'poolside/laguna-s-2.1:free',
  'openrouter/auto',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
];

async function callOpenRouter(apiKey, prompt, jsonMode = false, customModel = '', signal = null) {
  const userRequestedModel = customModel && customModel.trim();
  const modelsToTry = userRequestedModel
    ? [userRequestedModel, ...OPENROUTER_FALLBACK_MODELS.filter(m => m !== userRequestedModel)]
    : OPENROUTER_FALLBACK_MODELS;

  let lastError = null;

  for (const modelToUse of modelsToTry) {
    if (signal?.aborted) {
      const abortErr = new Error('Analysis cancelled.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    try {
      const url = `${OPENROUTER_API_BASE}/chat/completions`;

      const requestBody = {
        model: modelToUse,
        messages: [
          {
            role:    'system',
            content: 'You are an expert ATS analyst and professional career coach. You always respond with exactly what is requested — JSON when asked for JSON, plain text when asked for text.',
          },
          {
            role:    'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens:  2048,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      };

      const response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer':  'https://jobfitpro.extension',
          'X-Title':       'JobFit Pro Extension',
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg  = errData?.error?.message || `HTTP ${response.status}`;

        if (response.status === 401 || errMsg.toLowerCase().includes('user key') || errMsg.toLowerCase().includes('invalid api key') || errMsg.toLowerCase().includes('unauthorized')) {
          throw new Error('Invalid OpenRouter API key. Please check your key in Settings.');
        }

        console.warn(`[JobFit Pro] OpenRouter model "${modelToUse}" failed (${errMsg}), switching to next model...`);
        lastError = new Error(errMsg);
        continue;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;

      if (!text) {
        console.warn(`[JobFit Pro] OpenRouter model "${modelToUse}" returned empty text, trying next model...`);
        lastError = new Error(`OpenRouter (${modelToUse}) returned no content.`);
        continue;
      }

      console.log(`[JobFit Pro] Successfully generated response using OpenRouter model: ${modelToUse}`);
      return text.trim();

    } catch (err) {
      if (signal?.aborted || err.name === 'AbortError') throw err;
      lastError = err;
      if (err.message.includes('Invalid OpenRouter API key')) {
        throw err;
      }
      console.warn(`[JobFit Pro] OpenRouter attempt error for "${modelToUse}":`, err.message);
    }
  }

  throw lastError || new Error('All OpenRouter candidate models failed. Please try another model or check your key in Settings.');
}

// ============================================================
// JSON PARSER
// ============================================================
function parseJsonResponse(text) {
  let cleaned = (text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/,        '')
    .trim();

  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');

  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[JobFit Pro] JSON parse failed, returning fallback object:', e.message);
    return {
      matchScore:     50,
      matchSummary:   'Match analysis complete. Review missing skills below.',
      matchingSkills: [],
      missingSkills:  [],
      atsTips:        ['Ensure your key technical skills are highlighted near the top of your resume.'],
      experienceGap:  '',
      keywordDensity: 'medium',
    };
  }
}

// ============================================================
// VALIDATE & NORMALIZE ANALYSIS RESULT
// ============================================================
function normalizeAnalysisResult(raw) {
  return {
    matchScore:     Math.min(100, Math.max(0, parseInt(raw.matchScore, 10) || 0)),
    matchSummary:   raw.matchSummary    || '',
    matchingSkills: Array.isArray(raw.matchingSkills) ? raw.matchingSkills.slice(0, 12) : [],
    missingSkills:  Array.isArray(raw.missingSkills)  ? raw.missingSkills.slice(0, 10)  : [],
    atsTips:        Array.isArray(raw.atsTips)         ? raw.atsTips.slice(0, 5)         : [],
    experienceGap:  raw.experienceGap  || '',
    keywordDensity: raw.keywordDensity || 'medium',
  };
}

// ============================================================
// PUBLIC: analyzeWithAI
// ============================================================
async function analyzeWithAI(provider, apiKey, cvText, jobDescription, jobTitle = '', customModel = '', signal = null) {
  const prompt = buildAnalysisPrompt(cvText, jobDescription, jobTitle);

  let rawText;
  if (provider === 'openrouter') {
    rawText = await callOpenRouter(apiKey, prompt, /* jsonMode= */ true, customModel, signal);
  } else if (provider === 'openai') {
    rawText = await callOpenAI(apiKey, prompt, /* jsonMode= */ true, signal);
  } else {
    rawText = await callGemini(apiKey, prompt, /* jsonMode= */ true, signal);
  }

  const parsed     = parseJsonResponse(rawText);
  const normalized = normalizeAnalysisResult(parsed);

  console.log('[JobFit Pro] Analysis result:', normalized);
  return normalized;
}

// ============================================================
// PUBLIC: generateCoverLetter
// ============================================================
async function generateCoverLetter(provider, apiKey, cvText, jobDescription, jobTitle = '', analysisResult = null, customModel = '', signal = null) {
  const prompt = buildCoverLetterPrompt(cvText, jobDescription, jobTitle, analysisResult);

  let letter;
  if (provider === 'openrouter') {
    letter = await callOpenRouter(apiKey, prompt, /* jsonMode= */ false, customModel, signal);
  } else if (provider === 'openai') {
    letter = await callOpenAI(apiKey, prompt, /* jsonMode= */ false, signal);
  } else {
    letter = await callGemini(apiKey, prompt, /* jsonMode= */ false, signal);
  }

  return letter.trim();
}

/**
 * Build profile extraction prompt.
 */
function buildProfileExtractionPrompt(cvText) {
  return `
You are an expert resume parser. Extract structured candidate profile information from the following CV text.
Return a JSON object ONLY — no markdown, no explanation, no code fences.

CV TEXT:
"""
${cvText.substring(0, 5000)}
"""

Return ONLY this JSON structure (fill empty string "" if not found):
{
  "firstName": "",
  "lastName": "",
  "fullName": "",
  "email": "",
  "phone": "",
  "city": "",
  "state": "",
  "country": "",
  "zipCode": "",
  "linkedinUrl": "",
  "githubUrl": "",
  "portfolioUrl": "",
  "currentCompany": "",
  "currentTitle": "",
  "highestDegree": "",
  "university": "",
  "graduationYear": "",
  "totalYearsExperience": 0,
  "summary": ""
}
`.trim();
}

/**
 * Build application question answering prompt.
 */
function buildQuestionAnswerPrompt(cvText, jobDescription, questionText) {
  return `
You are a job applicant filling out a job application form.
Answer the following application question honestly, professionally, and concisely based on the candidate's CV and the job details.

JOB DESCRIPTION:
"""
${(jobDescription || '').substring(0, 2000)}
"""

CANDIDATE CV:
"""
${(cvText || '').substring(0, 2500)}
"""

APPLICATION QUESTION:
"${questionText}"

INSTRUCTIONS:
- Write in the first person ("I have...", "In my recent experience...").
- Keep it concise: 2-3 impactful sentences (under 75 words).
- Highlight relevant tools/skills from the CV that match the question.
- Return ONLY the exact answer text. No quotation marks, no preamble.
`.trim();
}

// ============================================================
// PUBLIC: extractProfileFromCV
// ============================================================
async function extractProfileFromCV(provider, apiKey, cvText, customModel = '', signal = null) {
  const prompt = buildProfileExtractionPrompt(cvText);

  let rawText;
  if (provider === 'openrouter') {
    rawText = await callOpenRouter(apiKey, prompt, /* jsonMode= */ true, customModel, signal);
  } else if (provider === 'openai') {
    rawText = await callOpenAI(apiKey, prompt, /* jsonMode= */ true, signal);
  } else {
    rawText = await callGemini(apiKey, prompt, /* jsonMode= */ true, signal);
  }

  const parsed = parseJsonResponse(rawText);
  return {
    firstName:            parsed.firstName || '',
    lastName:             parsed.lastName  || '',
    fullName:             parsed.fullName  || `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim(),
    email:                parsed.email     || '',
    phone:                parsed.phone     || '',
    city:                 parsed.city      || '',
    state:                parsed.state     || '',
    country:              parsed.country   || '',
    zipCode:              parsed.zipCode   || '',
    linkedinUrl:          parsed.linkedinUrl || '',
    githubUrl:            parsed.githubUrl   || '',
    portfolioUrl:         parsed.portfolioUrl || '',
    currentCompany:       parsed.currentCompany || '',
    currentTitle:         parsed.currentTitle   || '',
    highestDegree:        parsed.highestDegree  || '',
    university:           parsed.university     || '',
    graduationYear:       parsed.graduationYear || '',
    totalYearsExperience: parseInt(parsed.totalYearsExperience, 10) || 0,
    summary:              parsed.summary || '',
  };
}

// ============================================================
// PUBLIC: answerApplicationQuestion
// ============================================================
async function answerApplicationQuestion(provider, apiKey, cvText, jobDescription, questionText, customModel = '', signal = null) {
  const prompt = buildQuestionAnswerPrompt(cvText, jobDescription, questionText);

  let answer;
  if (provider === 'openrouter') {
    answer = await callOpenRouter(apiKey, prompt, /* jsonMode= */ false, customModel, signal);
  } else if (provider === 'openai') {
    answer = await callOpenAI(apiKey, prompt, /* jsonMode= */ false, signal);
  } else {
    answer = await callGemini(apiKey, prompt, /* jsonMode= */ false, signal);
  }

  return answer.trim().replace(/^["']|["']$/g, '');
}

// ============================================================
// EXPORTS (Support globalThis and ES module)
// ============================================================
const JobFitAPI = {
  analyzeWithAI,
  generateCoverLetter,
  extractProfileFromCV,
  answerApplicationQuestion,
  discoverGeminiModel,
  callGemini,
  callOpenAI,
  callOpenRouter,
};

globalThis.JobFitAPI = JobFitAPI;
