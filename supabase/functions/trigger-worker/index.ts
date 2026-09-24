// @ts-ignore - Deno is the native runtime for Supabase Edge Functions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Tell the local Node.js TypeScript compiler to ignore the missing Deno global
declare const Deno: any;

serve(async (req: Request) => {
  try {
    // Only accept POST requests from Supabase Webhooks
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Parse the Webhook payload
    // Supabase sends { type: 'INSERT', table: 'story_messages', record: { id: 123, ... }, ... }
    const payload = await req.json();
    
    const record = payload.record;
    if (!record || !record.id) {
      return new Response('Invalid payload: Missing record ID', { status: 400 });
    }

    // Check if the message is actually pending and from the user
    if (record.role !== 'user' || record.status !== 'pending') {
      return new Response('Ignored: Not a pending user message', { status: 200 });
    }

    const jobId = record.id;
    console.log(`Received new pending job: ${jobId}. Triggering GitHub Actions...`);

    // Get GitHub Personal Access Token from Edge Function Secrets
    const githubToken = Deno.env.get('GITHUB_PAT');
    if (!githubToken) {
      console.error('GITHUB_PAT secret is missing in Supabase Edge Functions');
      return new Response('Server configuration error', { status: 500 });
    }

    // The GitHub repository details (extracted from your new git remote)
    const GITHUB_OWNER = 'siva1234new-ai'; 
    const GITHUB_REPO = 'actioncomic';
    const WORKFLOW_ID = 'worker.yml'; // The name of the workflow file we will create in Phase 2

    // Trigger GitHub Actions via workflow_dispatch
    const githubResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Supabase-Edge-Function'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            job_id: jobId.toString() // Pass the job ID to the GitHub Action
          }
        })
      }
    );

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text();
      console.error(`GitHub API Error (${githubResponse.status}): ${errorText}`);
      return new Response(`Failed to trigger GitHub Actions: ${errorText}`, { status: githubResponse.status });
    }

    console.log(`Successfully triggered GitHub Actions workflow for job ${jobId}`);
    return new Response(JSON.stringify({ success: true, job_id: jobId }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Edge Function Error:', error.message);
    return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
  }
});
