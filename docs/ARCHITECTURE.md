# DeskAI System Architecture & Technical Workflows

This document outlines the core architectural flows of the **DeskAI** platform, covering document ingestion, question-answering via Retrieval-Augmented Generation (RAG), and server-side session authentication.

---

## 1. Document Ingestion Flow

The ingestion pipeline processes company knowledge documents (`.pdf`, `.docx`, `.txt`), chunks them into semantic passages, computes vector embeddings using Google Gemini, and indexes them in Supabase PostgreSQL using `pgvector` with an HNSW index.

```mermaid
flowchart TD
    A["📄 Document Uploaded<br/>(.txt / .pdf / .docx via POST /api/documents/upload)"] --> B["📥 Upload Stored in Private Bucket<br/>(Supabase Storage 'company-documents')"]
    B --> C["✂️ Text Extraction & Chunking<br/>(backend/services/chunker.py)"]
    C --> D["🧩 Chunks Embedded via Gemini<br/>(gemini-embedding-001 / Embedder service)"]
    D --> E["🗄️ Stored in Supabase Database<br/>(pgvector 'document_chunks' table)"]
    E --> F["⚡ Indexed with HNSW<br/>(halfvec_cosine_ops index for fast similarity lookups)"]
```

### Ingestion Steps:
1. **Upload & Validation**: Document is received via `/api/documents/upload`, validated for format/size, and saved to Supabase Storage.
2. **Text Extraction**: Text is extracted page-by-page from PDF, DOCX, or TXT documents.
3. **Chunking**: Content is split into chunks with overlap for contextual integrity.
4. **Vector Embedding**: Each chunk is converted into high-dimensional vector representations using Google Gemini.
5. **Storage & Indexing**: Vector embeddings and chunk metadata are persisted into PostgreSQL using the `pgvector` extension and indexed using an HNSW (Hierarchical Navigable Small World) index for sub-millisecond vector similarity search.

---

## 2. Question & Answer Flow (RAG Pipeline)

When an employee submits a question, DeskAI performs vector similarity retrieval against indexed knowledge chunks and prompts Google Gemini with strict grounding instructions to ensure factual, hallucination-free answers with source citations.

```mermaid
flowchart TD
    A["👤 Employee Asks a Question<br/>(POST /api/chat)"] --> B["🧩 Question Embedded<br/>(Same Gemini Embedding Model)"]
    B --> C["🔍 Vector Search via Supabase pgvector<br/>(HNSW Cosine Similarity Query)"]
    C --> D{"Chunks pass similarity<br/>threshold (> 0.40 default)?"}
    
    D -- "No relevant chunks" --> E["⚠️ Fallback Message Returned<br/>('I couldn't find reliable information...')"]
    
    D -- "Relevant chunks found" --> F["🤖 Gemini Generates Answer<br/>(Strictly grounded on retrieved chunks only)"]
    F --> G{"Grounded answer<br/>found in context?"}
    G -- "Yes" --> H["✅ Answer Returned with Cited Sources<br/>(Document name, page, similarity score)"]
    G -- "Refusal / No facts" --> E
```

### Retrieval & Generation Details:
1. **Embedding**: The employee's question is embedded using the identical Gemini embedding model used during document ingestion.
2. **Vector Similarity Search**: Cosine similarity is computed against all stored chunks via `pgvector` / HNSW index.
3. **Threshold Filtering**: Only chunks exceeding the strict similarity score threshold are selected. If no chunks qualify, a fallback message is immediately returned without making an unnecessary LLM generation call.
4. **Strict Grounding**: Gemini is invoked with temperature `0.0` and system instructions requiring answers to derive exclusively from the retrieved context.
5. **Output Delivery**: The user receives either a fully cited answer with source document references or a graceful fallback message.

---

## 3. Authentication Flow (Flask Server-Side Sessions)

DeskAI utilizes **Flask server-side signed sessions** (not stateless JWTs) to secure application state and protect API endpoints.

```mermaid
flowchart TD
    A["👤 Employee / Admin Logs In<br/>(Email + Password via POST /api/auth/login)"] --> B["🔐 Password Verified Against Stored Hash<br/>(werkzeug.security check_password_hash)"]
    B --> C{"Credentials Valid?"}
    C -- "Invalid" --> D["❌ 401 Unauthorized Error"]
    C -- "Valid" --> E["🍪 Flask Creates Signed Server-Side Session<br/>(session['user'] stored with id, email, role, department)"]
    
    E --> F["🔒 Protected Routes Guarded by @login_required<br/>(/api/chat, /api/tickets, /api/auth/me)"]
    
    F --> G{"Valid Flask Session<br/>Cookie Present?"}
    G -- "No / Expired" --> H["🚫 401 Authentication Required"]
    G -- "Yes" --> I{"User Role Check<br/>(session['user']['role'])"}
    
    I -- "employee" --> J["💻 Employee Dashboard<br/>(Chat with Knowledge Base & Submit Tickets)"]
    I -- "admin" --> K["🛠️ Admin Dashboard<br/>(Manage, Filter, and Update All Tickets)"]
```

### Key Authentication Features:
- **Server-Side Session Storage**: Sessions are cryptographically signed using `FLASK_SECRET_KEY` and managed on the server via Flask's `session` object.
- **No JWT Tokens**: Authentication does not use JWT generation, bearer header tokens, or client-side token verification.
- **Route Protection**: The `@login_required` decorator validates `session.get('user')` on every protected endpoint (`/api/chat`, `/api/tickets`, etc.).
- **Role-Based Access Control (RBAC)**: Redirects and dashboard permissions are governed according to the verified user role (`employee` vs `admin`).
