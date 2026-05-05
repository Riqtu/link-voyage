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
