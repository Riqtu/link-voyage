# link-voyage

Monorepo bootstrap for collaborative trip planning:

- `apps/web`: Next.js + shadcn/ui + Tailwind + PWA
- `apps/api`: NestJS + tRPC + Mongoose + Redis

## Prerequisites

- Node.js 22+
- pnpm 10+
- MongoDB
- Redis

## Setup

```bash
pnpm install
cp .env.example .env
```

## Run

```bash
pnpm dev
```

Or run apps separately:

```bash
pnpm dev:web
pnpm dev:api
```

## Deploy (Coolify / Docker)

Monorepo собирается из **корня** репозитория: `docker-compose.yml` поднимает `api` (Nest) и `web` (Next.js standalone).

```bash
cp .env.example .env
# Заполните MONGODB_URI, REDIS_URL, JWT_SECRET, WEB_ORIGIN, NEXT_PUBLIC_API_URL и остальное.

docker compose build
docker compose up -d
```

**Coolify:** новый ресурс → Docker Compose → репозиторий link-voyage. Переменные окружения — в UI (как в `.env.example`). Для web и api назначьте домены в настройках сервисов.

Ускорение повторных деплоев:

- Advanced → **Include Source Commit in Build** — выкл.
- При ручном Dockerfile: **Inject Build Args to Dockerfile** — выкл.
- Образы используют BuildKit cache mounts для pnpm и `.next/cache`.

API-образ включает системный Chromium (Alpine) для превью ссылок. Порты по умолчанию: api `3100`, web `3110`.

Отдельные приложения вместо compose: build context `.`, Dockerfile `apps/web/Dockerfile` или `apps/api/Dockerfile`.
