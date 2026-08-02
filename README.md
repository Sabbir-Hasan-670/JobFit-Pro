# 🚀 JobFit Pro — AI Job Analyzer & ATS Matcher

<div align="center">

![JobFit Pro Logo](icons/icon128.png)

### **Supercharge Your Job Search with Instant AI-Powered Resume Matching & ATS Optimization**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Powered by Aravals Inc](https://img.shields.io/badge/Powered%20by-Aravals%20Inc-8b5cf6?style=for-the-badge)](https://github.com/Sabbir-Hasan-670)
[![AI Providers](https://img.shields.io/badge/AI%20Providers-Gemini%20%7C%20OpenRouter%20%7C%20OpenAI-10b981?style=for-the-badge)](https://openrouter.ai/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

</div>

---

## 📖 About JobFit Pro

**JobFit Pro** is a cutting-edge Google Chrome extension developed and powered by **Aravals Inc**. It is engineered to bridge the gap between job seekers and applicant tracking systems (ATS).

With a single click on any job listing (LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, Workday, etc.), JobFit Pro extracts the job description, compares it against your stored CV/resume using state-of-the-art AI models, calculates an accurate **Match Score**, highlights **Missing Critical Skills**, suggests actionable **ATS Optimization Tips**, generates tailor-made **Cover Letters**, and exports professional **Executive PDF Reports**.

---

## ✨ Key Features

- 🎯 **Smart ATS Match Score (0–100%):** Instant visual circular score meter with dynamic grade badges (*Excellent, Good, Fair, Poor*).
- 🔍 **Universal Multi-Portal Scraper:** Seamlessly scrapes job titles, company names, and full job descriptions from:
  - **LinkedIn** (Full support for single-page & 2-pane search layouts)
  - **Indeed**
  - **Glassdoor**
  - **Greenhouse.io**
  - **Lever.co**
  - **Workday**
  - **Generic Job Boards & Company Career Portals**
- 🧠 **Multi-Model AI Engine:**
  - **Google Gemini** (Gemini 2.5 Flash, Gemini 1.5 Pro / Flash — *Free & Recommended*)
  - **OpenRouter** (Connect to 100+ models including DeepSeek-R1/V3, Llama 3.3, Claude 3.5 Sonnet, GPT-4o with integrated model search & dropdown picker)
  - **OpenAI** (GPT-4o, GPT-4 Turbo, GPT-3.5)
- ⚡ **Background Processing & Persistence:**
  - Background Service Worker execution ensures your analysis continues even if you switch tabs or close the popup.
  - Interactive **Stop Button** for full user control.
  - Persistent state caching across browser sessions.
- 🏷️ **Missing Skills Breakdown:** Interactive visual pill tags displaying missing qualifications and technologies.
- 💡 **Actionable ATS Optimization Tips:** Bulleted recommendations tailored specifically to your CV and target role.
- 📄 **Executive PDF Reports:** One-click generation of branded, printable PDF analysis reports for your job application records.
- ✉️ **Tailored Cover Letter Generator:** AI-crafted cover letters aligned with the scanned job requirements.
- 🔒 **100% Privacy First:** All CV data and API keys are stored locally in your browser (`chrome.storage.local`). No telemetry, no third-party data tracking.

---

## 🎨 UI & Design Aesthetics

- **Dark Glassmorphism Architecture:** Ultra-modern dark obsidian aesthetic (`#0a0c14`) with dynamic radial gradients and glass panels (`backdrop-filter: blur(16px)`).
- **Responsive Layout:** Fixed sticky frosted footer, animated progress rings, and smooth micro-animations.
- **Branding:** Powered by **Aravals Inc**.

---

## 🛠️ Installation Guide

### 1. Clone the Repository
```bash
git clone https://github.com/Sabbir-Hasan-670/JobFit-Pro.git
```

### 2. Load the Extension into Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the cloned `JobFit-Pro` project directory.
5. JobFit Pro is now installed and accessible from your extension toolbar! 📌

---

## ⚙️ Configuration & Quick Start

1. **Open Settings:** Click the **Gear icon (⚙️)** in the JobFit Pro popup header or right-click the extension icon and select **Options**.
2. **Select AI Provider:**
   - **Google Gemini (Recommended):** Get a free API key from [Google AI Studio](https://aistudio.google.com/).
   - **OpenRouter:** Get a key from [OpenRouter.ai](https://openrouter.ai/keys) to access DeepSeek, Claude, Llama, and more.
   - **OpenAI:** Get a key from [OpenAI Platform](https://platform.openai.com/).
3. **Paste Your CV:** Paste your resume/CV text into the Resume section and click **Save Settings**.
4. **Analyze a Job:**
   - Navigate to any job posting (e.g., on LinkedIn).
   - Click the **JobFit Pro** extension icon.
   - Click **Scan Job Description**.
   - Click **Analyze Match** to get instant feedback!

---

## 📁 Project Structure

```text
JobFit-Pro/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── background.js         # Service Worker for background AI tasks & lifecycle
├── content/
│   └── content.js        # Content script for universal job description scraping
├── popup/
│   ├── popup.html        # Extension popup interface
│   ├── popup.css         # Dark glassmorphic styling system
│   └── popup.js          # Popup UI controller, PDF generator, and event handling
├── settings/
│   ├── settings.html     # Settings & CV management page
│   ├── settings.css      # Settings design system
│   └── settings.js       # API key management, model search & CV parser
├── utils/
│   └── api.js            # Multi-provider AI API engine (Gemini, OpenRouter, OpenAI)
├── icons/                # Extension branding icons (16px, 48px, 128px)
├── .gitignore            # Git ignore rules
└── README.md             # Project documentation
```

---

## 🏢 About Aravals Inc

**JobFit Pro** is developed and maintained by **Aravals Inc**. We build intelligent, developer-centric, and productivity-boosting AI solutions designed to streamline workflows and empower individuals.

- **Developer:** [Sabbir Hasan](https://github.com/Sabbir-Hasan-670)
- **Organization:** Aravals Inc
- **GitHub Repository:** [JobFit-Pro](https://github.com/Sabbir-Hasan-670/JobFit-Pro)

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Built with ❤️ by <strong>Aravals Inc</strong></sub>
</div>
