# DeskAI

**DeskAI** is a lightweight, Flask‑based ticket‑management system that combines a classic support workflow with AI‑augmented assistance using Google Gemini. It provides employee ticket submission, an admin dashboard, and a knowledge‑base powered Retrieval‑Augmented Generation (RAG).

---

## Table of Contents
- [Problem Statement](#problem-statement)
- [Solution Overview](#solution-overview)
- [Key Features](#key-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation (Windows PowerShell)](#setup--installation-windows-powershell)
- [Running the Application](#running-the-application)
- [Running Tests](#running-tests)
- [Environment Variables & Security](#environment-variables--security)
- [Responsive UI](#responsive-ui)
- [Future Improvements (optional)](#future-improvements)

---

## Problem Statement
Small teams often lack an easy‑to‑deploy internal help‑desk that also offers AI‑driven suggestions for ticket resolution.

## Solution Overview
DeskAI delivers a self‑contained Flask backend, a vanilla‑HTML/CSS/JavaScript frontend, and AI support via Google Gemini. Knowledge‑base documents (PDF, DOCX, plain‑text) are ingested and queried through a RAG pipeline.

## Key Features
- Employee ticket creation and personal view.
- Admin dashboard with filtering, sorting, and bulk actions.
- **Mobile‑first ticket cards** (≤ 600 px) that replace the desktop table on narrow viewports (tested at 375 px).
- Success (green) and error (red) alert styling with auto‑hide.
- Supabase/PostgreSQL persistence (configurable via environment variables).
- Google Gemini integration for AI‑generated ticket suggestions.
- Retrieval‑Augmented Generation (RAG) over a structured knowledge base.

## Architecture & Tech Stack
| Layer | Technology |
|-------|------------|
| **Backend** | Flask 3.1.3, Supabase Python client 2.31.0 |
| **AI** | Google Gemini (`google‑genai` 2.19.0) |
| **Frontend** | HTML5, vanilla CSS (custom design), vanilla JavaScript |
| **Database** | Supabase (PostgreSQL) – credentials supplied via environment variables |
| **Testing** | `pytest` 8.2.2 |

> 📐 **System Architecture & Workflows**: For interactive Mermaid sequence and flow diagrams detailing Document Ingestion, Q&A (RAG), and Server-Side Authentication, refer to [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project Structure
```
DeskAI/
├─ .env.example               # Sample env file – do NOT commit real secrets
├─ .git/                      # Git metadata (already initialized)
├─ .gitignore                # Ignores .env, caches, virtual‑env folders, etc.
├─ app.py                     # Flask entry point
├─ backend/                  # Flask blueprint, config, Supabase client
├─ docs/                     # Architecture & workflow documentation
│   └─ ARCHITECTURE.md
├─ frontend/                 # HTML / CSS / JS assets (admin UI, ticket UI)
├─ knowledge_base/           # Domain folders with plain‑text, PDF, DOCX files
│   ├─ CYBERSECURITY/
│   ├─ HR/
│   ├─ IT_SUPPORT/
│   └─ OFFICE_FINANCE/
├─ migrations/               # Database migration scripts
├─ requirements.txt          # Python dependencies
├─ sample_test.pdf            # Example document for RAG ingestion
├─ tests/                    # Automated test suite
│   ├─ test_ingestion.py
│   └─ test_rag.py
└─ README.md                 # **This file**
```

## Setup & Installation (Windows PowerShell)
```powershell
# 1️⃣ Clone the repository (if you haven't already)
git clone <repository‑url>
cd DeskAI

# 2️⃣ (Optional) Create a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Activate the venv

# 3️⃣ Install required packages
pip install -r requirements.txt

# 4️⃣ Copy the example env and configure your secrets
Copy-Item .env.example .env
notepad .env   # Edit with your Supabase URL/key and Flask secret key
```

## Running the Application
```powershell
python app.py
# The app will start on http://0.0.0.0:5000 (or the PORT defined in .env)
```

## Running Tests
```powershell
python -m pytest tests -q
# Expected output: 1 passed, 2 skipped
```

## Environment Variables & Security
| Variable | Purpose |
|----------|---------|
| `FLASK_SECRET_KEY` | Flask session secret (keep secret). |
| `SUPABASE_URL` | Supabase project endpoint. |
| `SUPABASE_KEY` **or** `SUPABASE_SECRET_KEY` | Supabase service‑role key (do NOT commit). |
| `PORT` (optional) | Port for the Flask server (default 5000). |

**Never commit** the real `.env` file. The repository’s `.gitignore` already excludes `.env` and related temporary files.

## Responsive UI
- **Desktop (≥ 600 px)** – Admin view shows a sortable ticket table.
- **Mobile (≤ 600 px, verified at 375 px)** – Table is replaced by full‑width ticket cards displaying ID, subject, employee, department, priority, status, creation date, and a ‘View’ button. No horizontal overflow occurs.

---

## Future Improvements (optional)
- Add a CI workflow (GitHub Actions) to run tests on push.
- Integrate a linter (e.g., `ruff`) with a pre‑commit hook.
- Extend AI capabilities (conversation history, fine‑tuning).

---

*All information above reflects the current implementation of DeskAI. No features are claimed beyond what exists in the codebase.*
