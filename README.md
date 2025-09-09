Secure Order Service Backend

A minimal Order Management API built with Node.js + Express + PostgreSQL.
Implements secure authentication, RBAC, idempotency, concurrency safety, payments integration, caching, and observability as per the technical assessment requirements.

🚀 Features

Auth & RBAC: Signup/Login with JWT (HS256). Roles = ADMIN, USER.

Orders: Create, list (with pagination + search), detail, and update status.

Idempotency: Duplicate order requests prevented via client_token.

Concurrency: Safe status updates with optimistic locking.

Payments:

Initiate payment intent.

Handle provider webhooks with HMAC verification + retry & exponential backoff.

Caching: Order details cached for 30s (invalidated on update).

Observability: Health check, request logging, /metrics endpoint.

Tests: Unit + integration tests for auth, RBAC, idempotency, concurrency, and webhook handling.

📋 Endpoints
POST   /api/auth/signup             - Create new user
POST   /api/auth/login              - Login & receive JWT
POST   /api/orders                  - Create order (idempotent with client_token)
GET    /api/orders                  - List orders (filters, pagination, search by SKU)
GET    /api/orders/:id              - Get order details
PATCH  /api/orders/:id/status       - Update order status (ADMIN only)

POST   /api/payments/initiate       - Create payment intent
POST   /api/payments/webhook        - Provider webhook (idempotent)

GET    /health                      - Health check
GET    /metrics                     - Metrics (orders_created_total, etc.)


Base URL (dev): http://localhost:3000

🛠️ Tech Stack

Backend: Node.js, Express, TypeScript

Database: PostgreSQL (via @neondatabase/serverless) from neon

Migrations: Postgres neon

Auth: JWT (HS256)

Tests: Jest + Supertest

Dev tools: tsx for TS runtime, dotenv for env config

⚙️ Setup

Clone repo:

git clone <your-repo-url>
cd secure_order_service


Install dependencies:

npm install


Setup env:

cp .env.example .env


Configure DB URL, JWT secret, and webhook secret.


Start dev server:

npm run dev:simple


Example output:

✅ Database connected successfully
🚀 Server running on port 3000
🌐 Environment: development

🧪 Tests

Run full test suite:

npm test


Covers:

Auth (signup/login, role restrictions)

Orders (idempotency, concurrency safety)

Payments (webhook replay handling, retries)

Errors & validation

📈 Scale & Design Notes

Scaling to 10k req/s:

Use Postgres read replicas for reads.

Redis cache for hot reads (orders, metrics).

Queue (e.g., RabbitMQ/Kafka) for webhook retries & background jobs.

Horizontal scaling behind load balancer.

Monitoring:

Orders created/failed count

Payment webhook success/fail

DB latency

API request rate

Failure scenario: Payment provider downtime → mitigate via retries + dead-letter logging.

📂 Submission Checklist

✅ Full backend implementation

✅ Tests runnable with npm test

✅ .env.example provided (no real secrets)

✅ README with setup + architecture notes

✅ Health + metrics endpoints
