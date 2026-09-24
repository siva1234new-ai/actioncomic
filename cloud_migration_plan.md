# POC 1: Cloud Migration Implementation Plan

This document outlines the exact steps to migrate the local Express.js architecture to the infinitely scalable, ₹0 cloud architecture using Supabase and GitHub Actions.

## Phase 1: Worker Refactor (Job Queue Mode)
Currently, `worker.js` runs continuously as an Express API server on port 4000. We must revert this so it runs as a single-execution script that processes one specific job and shuts down.

1. **Remove Express:** Delete all Express server logic (`app.post`, `app.listen`).
2. **Accept Job ID:** Update `worker.js` to accept a `JOB_ID` environment variable (provided by GitHub Actions).
3. **Execution Flow:** 
   - Connect to Supabase and fetch the specific row from `story_messages` matching `JOB_ID`.
   - Mark status as `processing`.
   - Inject cookies and launch `headless: true` Chromium.
   - Submit prompt to Gemini and run the 100ms text-stabilization loop.
   - Update the row status to `completed` with the Gemini response.
   - Run `process.exit(0)` to gracefully kill the GitHub runner.

## Phase 2: GitHub Actions Configuration
We need to create the workflow file that tells GitHub how to spin up the Chromium runner.

1. **Create Workflow File:** Create `.github/workflows/worker.yml`.
2. **Configure Triggers:** Use `on: workflow_dispatch` with an input parameter for `job_id`.
3. **Define the Job:**
   - Use `runs-on: ubuntu-latest`.
   - Steps: Checkout code -> Setup Node 20 -> `npm install` -> Install Playwright browsers (`npx playwright install --with-deps chromium`) -> Run `node worker.js`.
4. **Environment Variables:** Map GitHub Secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) to the script execution environment.

## Phase 3: Supabase Edge Function (The Manager)
We need a secure middleman to hold the GitHub Personal Access Token (PAT).

1. **Initialize Function:** Use the Supabase CLI to create an Edge Function (e.g., `trigger-worker`).
2. **Write Logic:** 
   - Parse the incoming webhook payload to extract the newly inserted `story_messages` ID.
   - Securely read the `GITHUB_PAT` secret.
   - Send an authenticated `POST` request to `https://api.github.com/repos/Ponmurugaiya/auto-ai/actions/workflows/worker.yml/dispatches` with the `job_id`.
3. **Deploy:** Deploy the function to Supabase and set the `GITHUB_PAT` secret in the cloud.

## Phase 4: Supabase Database Webhook (The Trigger)
We need the database to automatically alert the Edge Function when the frontend inserts a new prompt.

1. **Configure Webhook:** Go to the Supabase Dashboard -> Database -> Webhooks.
2. **Set Conditions:** 
   - Trigger on `INSERT` to the `story_messages` table.
3. **Set Action:** Send an HTTP `POST` request to the Edge Function URL created in Phase 3.

## Phase 5: Frontend Refactor
The frontend no longer needs to wait for an API response. It just drops the job into the database and watches for updates.

1. **Remove API Call:** Delete the `fetch('http://localhost:4000/api/chat')` logic in `page.tsx`.
2. **Restore Database Insert:** Re-add the logic to insert the user's prompt directly into the `story_messages` table as `pending`.
3. **Rely on Realtime:** Because we already implemented Supabase Realtime in a previous step, the UI will automatically update on the screen the millisecond the GitHub Action changes the row to `completed`.

---
*Note: Before executing Phase 2, we will need to generate a GitHub Personal Access Token (PAT) and add it to the Supabase Edge Function secrets.*
