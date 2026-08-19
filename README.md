<div align="center">
  <img src="docs/assets/logo.jpg" alt="DocSaarthi Logo" width="220" style="border-radius: 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);" />
  <h1 align="center">DocSaarthi (दस्तावेज़ सारथी)</h1>
  <p align="center">
    <strong>AI-Powered Multilingual Document Intelligence Platform</strong><br>
    <em>Full OCR, Semantic Search, Hybrid RAG, Auto-Classification, and Schema Extraction for Hindi & English Documents</em>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/OCR-PaddleOCR%20v4-blue.svg" alt="PaddleOCR" />
    <img src="https://img.shields.io/badge/Database-PostgreSQL%20%2B%20pgvector-teal.svg" alt="pgvector" />
    <img src="https://img.shields.io/badge/LLM-Groq%20%2B%20OpenAI-orange.svg" alt="LLM" />
    <img src="https://img.shields.io/badge/Framework-Next.js%2015%20%2B%20NestJS-purple.svg" alt="Framework" />
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
  </p>
</div>

---

## ⚡ Quick Start Guide

### 1. Clone and Install

```bash
git clone <repo-url> docsaarthi
cd docsaarthi
cp .env.example .env
npm install
```

### 2. Start Infrastructure (Docker)

```bash
npm run docker:up
```

This starts:
| Service | Port | URL |
|---|---|---|
| PostgreSQL (pgvector) | 5432 | `postgresql://docsaarthi:docsaarthi_dev@localhost:5432/docsaarthi` |
| Redis | 6379 | `redis://localhost:6379` |
| MinIO | 9000 / 9001 | http://localhost:9000 / http://localhost:9001 |
| PaddleOCR Sidecar | 8081 | http://localhost:8081 |

**MinIO Console:** http://localhost:9001 (user: `docsaarthi_minio`, pass: `docsaarthi_minio_secret`)

### 3. Run Database Migrations

```bash
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run migrations (creates all tables + indexes)
```

### 4. Start the Apps

```bash
npm run dev
```

This starts in parallel:
- **API** → http://localhost:3001
- **Swagger UI** → http://localhost:3001/api/docs
- **Worker** → background (no HTTP)
- **Web App** → http://localhost:3000

### 5. Verify Everything Works

```bash
# Health check
curl http://localhost:3001/api/health

# Register a user
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Password123"}'
```

---

### Environment Variables

Edit `.env` to configure:
- `DATABASE_URL` — PostgreSQL connection string
- `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` — Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `OPENAI_API_KEY` — Required for Checkpoint 2+ features
- `MINIO_*` — Object storage settings

---

### Project Structure

```
docsaarthi/
├── apps/
│   ├── api/          # NestJS REST API (port 3001)
│   ├── worker/       # BullMQ document processing worker
│   └── web/          # Next.js 15 frontend (port 3000)
├── packages/
│   ├── database/     # Prisma schema + DatabaseService
│   └── shared/       # Queue constants + utilities
├── infra/
│   ├── docker-compose.yml
│   └── docker/       # Service configs
└── docs/             # PRD, Architecture, Plan, Checkpoints
```

---

### Checkpoint 1 Verification

After setup, you should be able to:

1. ✅ Visit http://localhost:3000 and be redirected to `/login`
2. ✅ Register a new account
3. ✅ Login and see the dashboard
4. ✅ Upload a PDF or image via the Upload page
5. ✅ See the file appear in MinIO (http://localhost:9001)
6. ✅ See the processing job enqueued in BullMQ
7. ✅ Poll `/api/v1/documents/{id}/status` and see stage progress
8. ✅ Visit `/api/health` and see all services healthy
