## DocSaarthi — Quick Start Guide

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- Git

---

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
