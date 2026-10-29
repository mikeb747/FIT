# Garmin Connect Sync on GitHub Pages (Static Hosting)

When launching FIT Track from GitHub Pages (`https://mikeb747.github.io/FIT/`), you may receive:
> **`Server returned HTTP 405` / `405 Not Allowed`**

---

## 🔍 Why Does HTTP 405 Happen on GitHub Pages?

1. **GitHub Pages is a Static Host**:
   GitHub Pages serves static web files (HTML, CSS, JavaScript). It **does not run a Node.js backend** or Express server.
2. **Missing Backend for POST Requests**:
   When FIT Track calls `POST /api/garmin/sync-multiweek`, the request goes to `https://mikeb747.github.io/api/garmin/sync-multiweek`. Because GitHub Pages has no backend running to handle `POST` requests, it returns **`405 Method Not Allowed`**.
3. **Garmin Personal API Blocks Direct Browser CORS**:
   Garmin's Cloudflare security layer does not permit direct web browser cross-origin requests (`Access-Control-Allow-Origin: *` is not provided), requiring a server-side proxy.

---

## 🚀 Solutions for Garmin Data on GitHub Pages

### Option 1: CSV Export (Instant & 100% Client-Side) — Recommended

The easiest and most reliable method when hosting on GitHub Pages:

1. In FIT Track, open the **Garmin Connect Wellness Sync** modal.
2. Click the **CSV Export (Instant)** tab.
3. Log in to [Garmin Connect Web](https://connect.garmin.com/modern/daily-summary).
4. Export your daily summary or sleep CSV file.
5. Tap or drag the file into FIT Track.
6. **Result**: All your physiological recovery records (Resting HR, Sleep Duration, Sleep Score, HRV) are imported instantly directly in your browser without needing any server!

---

### Option 2: Use a Free Cloudflare Worker Proxy (For Live Personal API Key Sync)

If you want live automated synchronization using your Garmin Personal API Key on GitHub Pages:

1. Create a free account at [Cloudflare Workers](https://workers.cloudflare.com/) (100,000 requests/day for free).
2. Click **Create Application** &rarr; **Create Worker**.
3. Replace the worker code with the following snippet:

```export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
        },
      });
    }

    const url = new URL(request.url);
    const garminBase = "https://personal.connectapi.garmin.com";
    const targetUrl = `${garminBase}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    headers.set("Host", "personal.connectapi.garmin.com");

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    // The colon here was changed to a comma
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
```

4. Deploy the Worker and copy your worker URL (e.g. `https://my-garmin-proxy.yourname.workers.dev`).
5. In FIT Track on GitHub Pages, open the **Personal API Key / Token** tab &rarr; click **Configure Proxy URL** &rarr; paste your Worker URL.
6. Tap **Sync with Token**!

---

### Option 3: Run Locally with the Built-in Node.js Server

When running FIT Track locally or on a Node.js host (e.g. Render, Railway, Fly.io, Cloud Run):
- Start the server: `npm start` or `node server.ts`
- The built-in Express server automatically proxies your Garmin Personal API requests seamlessly.
