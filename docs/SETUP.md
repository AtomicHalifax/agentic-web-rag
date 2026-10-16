# One-time setup (about 5 minutes)

The site runs on GitHub Pages. The AI runs on Cloudflare Workers AI (free tier: 10,000 neurons per day; Cloudflare doesn't list a card requirement for the free plan). You only do this once; after that, every push to `main` deploys both automatically.

## 1. Cloudflare account
1. Sign up at https://dash.cloudflare.com/sign-up (free).
2. In the left menu, open **Workers & Pages** once. This creates your free `*.workers.dev` subdomain; pick any name when asked.
3. Copy your **Account ID**. It's in the right sidebar of the Workers & Pages overview, or in the URL: `dash.cloudflare.com/<ACCOUNT_ID>/...`.

## 2. API token for GitHub to deploy with
1. Go to https://dash.cloudflare.com/profile/api-tokens and choose **Create Token**.
2. Use the template **"Edit Cloudflare Workers"**.
3. Add the permission **Account → Workers AI → Read** as well.
4. Choose **Continue → Create Token**, then copy the token. It's shown only once, and it should never go in chat or code.

## 3. Give both values to GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
- `CLOUDFLARE_API_TOKEN`: the token from step 2
- `CLOUDFLARE_ACCOUNT_ID`: the ID from step 1

## 4. Deploy
Repo → **Actions → deploy → Run workflow**. The `worker` job deploys the API, and the `pages` job points the site at it. Open https://atomichalifax.github.io/agentic-web-rag after about a minute.

## 5. Private observability (optional): New Relic
1. Sign up free at https://newrelic.com.
2. Go to **Add data → Browser monitoring → Copy/paste JavaScript**, and name the app `agentic-web-rag`.
3. Paste the snippet into `web/index.html` inside `<head>`, before `style.css`.

`web/telemetry.js` then sends `ingest` and `answer` events with numbers only. Questions and page text are never sent. Dashboards are visible only to you.

Prefer Cloudflare's built-in metrics instead? Workers & Pages → agentic-web-rag → **Metrics** shows requests, errors and CPU time with zero setup.
