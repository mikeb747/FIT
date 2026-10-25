# Deploying IronFIT to GitHub Pages (https://mikeb747.github.io/IronFIT)

This project is fully configured to deploy automatically to your GitHub Pages URL at:
**`https://mikeb747.github.io/IronFIT`**

---

## 🛠️ Step-by-Step Setup

### Step 1: Create or Open Repository on GitHub
1. Go to [https://github.com/new](https://github.com/new).
2. Repository name: **`IronFIT`**
3. Visibility: **Public** (or Private if you have GitHub Pro).
4. Do not initialize with README (we will push this existing project).

### Step 2: Push the Code
In your terminal where the code is located, run:

```bash
# Initialize git if not already done
git init
git add .
git commit -m "feat: IronFIT v1.0.1 with duration sets, Strava FIT generator, and GitHub Pages workflow"

# Set main branch
git branch -M main

# Link your GitHub repository
git remote add origin https://github.com/mikeb747/IronFIT.git

# Push to GitHub
git push -u origin main
```

---

### Step 3: Configure Settings on GitHub (Takes 1 Minute)

#### A. Set Pages Source to GitHub Actions
1. Open your repository: [https://github.com/mikeb747/IronFIT](https://github.com/mikeb747/IronFIT)
2. Go to **Settings** &rarr; **Pages** (in the left sidebar).
3. Under **Build and deployment** &rarr; **Source**, click the dropdown and select **GitHub Actions** (do NOT leave it as "Deploy from a branch").
   *Direct link:* [https://github.com/mikeb747/IronFIT/settings/pages](https://github.com/mikeb747/IronFIT/settings/pages)

#### B. Verify Workflow Permissions
1. Go to **Settings** &rarr; **Actions** &rarr; **General**.
2. Scroll to the bottom to **Workflow permissions**.
3. Select **"Read and write permissions"** and check **"Allow GitHub Actions to create and approve pull requests"**.
4. Click **Save**.
   *Direct link:* [https://github.com/mikeb747/IronFIT/settings/actions](https://github.com/mikeb747/IronFIT/settings/actions)

#### C. Ensure Repository Visibility
- Under **Settings** &rarr; **General** &rarr; **Danger Zone**, verify the repository visibility is **Public** (GitHub Pages requires a Public repo on free GitHub accounts).

Once enabled, every `git push` to `main` will automatically trigger `.github/workflows/deploy.yml` and publish your app at:
👉 **`https://mikeb747.github.io/IronFIT`**

---

## ⚠️ Fixed Issue: "Dependencies lock file is not found"
If you saw this GitHub Actions annotation error:
> `Dependencies lock file is not found in /home/runner/work/IronFIT/IronFIT. Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock`

### Why it happened & how it's fixed:
1. **Root cause:** The `actions/setup-node` action had `cache: 'npm'` enabled, which strictly halts if `package-lock.json` is not present in the repository.
2. **Fixed in `.github/workflows/deploy.yml`:** Removed the strict cache requirement and updated the installer step to `npm install --legacy-peer-deps`.
3. **Generated `package-lock.json`:** A clean `package-lock.json` has now been created in the repository root.

Simply commit and push the updated files:
```bash
git add .
git commit -m "fix: add package-lock.json and update deploy.yml for GitHub Pages"
git push
```
The GitHub Action will re-run and deploy cleanly!

---

## 📱 Features on GitHub Pages
- **Fully Offline & Standalone**: You can download Strava-compatible `.FIT` files directly from your phone even without an internet connection at the gym.
- **Installable PWA**: When opening `https://mikeb747.github.io/IronFIT/` on your phone in Chrome, tap the `⋮` menu and choose **"Install app"** to add IronFIT directly to your home screen!

---

## 💡 Notes on PWA & Strava

### 1. PWA "Already Installed" Message
If Chrome gave you an "App already installed" message when you have another app (like `https://mikeb747.github.io/Lists/`):
- This happens on GitHub Pages when opening the URL without the trailing slash (`/IronFIT`), which causes Chrome to resolve the manifest scope to the root domain (`mikeb747.github.io`).
- We updated `public/manifest.json` with a dedicated unique ID (`ironfit-strength-workout-tracker`) and added an automatic redirect script in `index.html` to ensure the trailing slash (`/IronFIT/`) is always preserved, isolating IronFIT from any other apps on your domain.

### 2. Strava Token Scope (read vs activity:write)
- The default token generated on Strava's developer page (`7eedf173...`) has `scope: read`.
- Strava strictly requires `scope: activity:write` to upload workouts.
- On GitHub Pages, IronFIT's 1-Tap **"Download .FIT & Open Strava"** lets you upload in seconds without needing server-side token exchange.
- In the preview environment with the Node.js backend, the 1-Click Strava Authorization button uses your Client ID & Secret to prompt for upload permission and automatically obtain an `activity:write` token.
