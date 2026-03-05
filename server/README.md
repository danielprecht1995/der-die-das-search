# AI Proxy Setup

This proxy keeps your OpenAI key off the mobile app.

## 1) Start the proxy locally

```bash
cd /Users/danielprecht/Der_die_das_search
OPENAI_API_KEY=your_real_key AI_PROXY_TOKEN=your_proxy_token npm run ai-proxy
```

Server runs on `http://localhost:8787`.

## 2) Deploy on Render (recommended)

This repo already includes `render.yaml`, so you can deploy in one flow:

1. Push this project to GitHub.
2. In Render, click **New** -> **Blueprint**.
3. Select this repository.
4. Render will detect `render.yaml` and create the service.
5. Set `OPENAI_API_KEY` in Render environment variables.
6. Set `AI_PROXY_TOKEN` in Render and the same value in app config (`AI_PROXY_TOKEN`) for simple request auth.
7. Deploy.

After deploy, your API base will be:

`https://<your-render-service>.onrender.com/api`

## 3) App config

In `src/config.ts`, set:

- `AI_PROXY_BASE_URL` to your backend URL with `/api` suffix.
- `AI_PROXY_TOKEN` to the same secret configured in Render.
- For local iOS simulator testing: `http://localhost:8787/api`
- For physical device or production: use your deployed HTTPS URL (for example Render), e.g. `https://your-service.onrender.com/api`

## 4) Endpoints

- `POST /api/lookup-noun` with `{ "input": "Haus" }`
- `POST /api/lookup-more` with `{ "prefix": "haus" }`
- `GET /health` for uptime/health checks
