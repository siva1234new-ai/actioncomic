require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runWorker() {
  const jobId = process.env.JOB_ID || process.argv[2];
  let pendingJob;
  
  if (jobId) {
    console.log(`Fetching specific job: ${jobId}`);
    const { data } = await supabase.from('job_queue').select('*').eq('id', jobId).single();
    pendingJob = data;
  } else {
    console.log("No JOB_ID provided. Fetching oldest pending job from job_queue...");
    const { data } = await supabase
      .from('job_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);
    pendingJob = data?.[0];
  }

  if (!pendingJob || pendingJob.status !== 'pending') {
    console.log("No pending jobs found. Exiting gracefully.");
    process.exit(0);
  }

  console.log(`Processing job ${pendingJob.id}: [${pendingJob.job_type}]`);

  // Update status to processing
  await supabase.from('job_queue').update({ status: 'processing' }).eq('id', pendingJob.id);

  console.log("Fetching cookies and conversation URL from Supabase...");
  const { data: authData } = await supabase.from('auth_sessions').select('*').eq('id', 1).single();

  if (!authData || !authData.cookies_json) {
    console.error("No valid cookies found in database. Cannot run worker.");
    await supabase.from('job_queue').update({ status: 'failed' }).eq('id', pendingJob.id);
    process.exit(1);
  }

  // --- Browser Launch ---
  console.log("Launching browser...");
  let launchOptions = {
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  };
  
  const browser = await chromium.launch(launchOptions);
  
  // Sanitize cookies before injecting
  let sanitizedCookies = authData.cookies_json.map(c => {
    let sanitized = { ...c };
    if (sanitized.sameSite) {
      const lower = sanitized.sameSite.toLowerCase();
      if (lower === 'no_restriction' || lower === 'none' || lower === 'unspecified') sanitized.sameSite = 'None';
      else if (lower === 'lax') sanitized.sameSite = 'Lax';
      else if (lower === 'strict') sanitized.sameSite = 'Strict';
    }
    return sanitized;
  });

  let context = await browser.newContext({
    storageState: {
      cookies: sanitizedCookies,
      origins: []
    }
  });

  const page = await context.newPage();
  
  let targetUrl = 'https://gemini.google.com/app';
  let episodeData = null;
  let sceneData = null;
  
  if (pendingJob.job_type === 'brainstorm' || pendingJob.job_type === 'finalize_episode') {
    // Global Master Chat
    targetUrl = authData.conversation_url ? authData.conversation_url : 'https://gemini.google.com/app';
  } else if (pendingJob.job_type === 'scene_script') {
    // Parallel Scene Chat
    const { data: ep } = await supabase.from('episodes').select('summary').eq('id', pendingJob.payload.episode_id).single();
    episodeData = ep;
    const { data: sc } = await supabase.from('scenes').select('*').eq('id', pendingJob.payload.scene_id).single();
    sceneData = sc;
    targetUrl = sceneData?.conversation_url ? sceneData.conversation_url : 'https://gemini.google.com/app';
  }
  
  console.log(`Navigating to Gemini: ${targetUrl}`);
  await page.goto(targetUrl);
  
  const inputSelector = 'div[contenteditable="true"]';
  
  try {
    await page.waitForSelector(inputSelector, { timeout: 30000 });
    console.log('Gemini loaded. Waiting 3 seconds for old chat history to populate...');
    await page.waitForTimeout(3000);
  } catch (e) {
    console.error("Timeout waiting for Gemini input box. Cookies might be expired.");
    await supabase.from('job_queue').update({ status: 'failed' }).eq('id', pendingJob.id);
    await browser.close();
    process.exit(1);
  }

  try {
    const preSendElements = await page.$$('.message-content, model-response, [data-test-id="model-response"]');
    const expectedResponseCount = preSendElements.length + 1;

    let promptToType = "";
    
    // -------------------------------------------------------------
    // ROUTING LOGIC based on job_type
    // -------------------------------------------------------------
    if (pendingJob.job_type === 'brainstorm') {
      promptToType = pendingJob.payload.prompt;
      
      if (!authData.conversation_url) {
        console.log("New chat detected. Injecting Director System Prompt...");
        promptToType = `[SYSTEM INSTRUCTION]
You are an elite YouTube Shorts Director. The user will pitch a story idea.
Your goal is to brainstorm a high-retention 60-second video script with them.
1. Ensure the story has a 3-second visual hook, build-up, and twist/payoff.
2. The final video will be exactly 60 seconds, split into exactly 6 scenes (8-10 seconds each).
3. Chat interactively, ask for their preferences, and suggest pacing.
4. DO NOT output the final script yet. Just brainstorm the overall story arc.
[END SYSTEM INSTRUCTION]

User's Pitch: ` + promptToType;
      }
    } 
    else if (pendingJob.job_type === 'finalize_episode') {
      promptToType = `[SYSTEM AUTOMATION] We have finalized today's episode. 
Please write a highly detailed summary of the finalized 6-scene story arc so another AI can use it as a system prompt to write the final scripts.
Wrap your summary perfectly inside a Markdown block like this:
\`\`\`summary
<insert summary here>
\`\`\``;
    }
    else if (pendingJob.job_type === 'scene_script') {
      const sceneNum = pendingJob.payload.scene_number;
      let contextInjection = "";
      
      // If this is a fresh chat for this scene, inject the master summary!
      if (!sceneData?.conversation_url) {
         contextInjection = `[STORY CONTEXT]\n${episodeData?.summary || 'No summary provided'}\n\n`;
      }
      
      promptToType = contextInjection + `[SYSTEM AUTOMATION - Do not chat, just output JSON]
Please expand **Scene ${sceneNum}** into a highly detailed script for a 10-second video clip.
You MUST output your response as a strict JSON block wrapped in \`\`\`json
{
  "visual_prompt": "Highly detailed, cinematic visual prompt for Veo video generator",
  "voiceover": "The exact voiceover text (max 15 words)"
}
\`\`\`
Do not include any other text outside the JSON block.`;
    }
    
    // Type the prompt
    await page.fill(inputSelector, promptToType);
    await page.keyboard.press('Enter');
    console.log(`Sent [${pendingJob.job_type}] to Gemini. Waiting for response...`);

    let lastText = "";
    let stableCount = 0;
    
    // Long polling loop
    for (let i = 0; i < 1200; i++) {
      await page.waitForTimeout(100);
      const responseElements = await page.$$('.message-content, model-response, [data-test-id="model-response"]');
      
      if (responseElements.length >= expectedResponseCount) {
        let currentText = await responseElements[responseElements.length - 1].innerText();
        currentText = currentText.trim();
        
        if (currentText.length > 0 && currentText === lastText) {
          stableCount++;
          if (stableCount >= 30) break; // 3 seconds stable
        } else {
          lastText = currentText;
          stableCount = 0;
        }
      }
    }

    const responseElements = await page.$$('.message-content, model-response, [data-test-id="model-response"]'); 
    if (responseElements.length > 0) {
      let responseText = await responseElements[responseElements.length - 1].innerText();
      responseText = responseText.replace(/^Gemini said\s*/i, '').trim();
      
      console.log(`Gemini Replied: ${responseText.substring(0, 100)}...`);
      
      // -------------------------------------------------------------
      // PROCESS RESPONSE BASED ON JOB TYPE
      // -------------------------------------------------------------
      if (pendingJob.job_type === 'brainstorm') {
        await supabase.from('story_chats').insert({
          episode_id: pendingJob.payload.episode_id,
          role: 'assistant',
          content: responseText,
          status: 'completed'
        });
      } 
      else if (pendingJob.job_type === 'finalize_episode') {
        const summaryMatch = responseText.match(/```summary\s*([\s\S]*?)\s*```/i);
        const summaryText = summaryMatch && summaryMatch[1] ? summaryMatch[1].trim() : responseText;
        
        await supabase.from('episodes').update({ summary: summaryText }).eq('id', pendingJob.payload.episode_id);
        
        // Start PARALLEL processing by queuing ALL 6 scenes simultaneously!
        for(let i=1; i<=6; i++) {
          const { data: newSceneData } = await supabase.from('scenes').insert({ episode_id: pendingJob.payload.episode_id, scene_number: i }).select().single();
          if (newSceneData) {
            await supabase.from('job_queue').insert({
              job_type: 'scene_script',
              payload: { episode_id: pendingJob.payload.episode_id, scene_id: newSceneData.id, scene_number: i }
            });
          }
        }
      }
      else if (pendingJob.job_type === 'scene_script') {
        // Extract JSON block using regex
        const jsonMatch = responseText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        let parsedJson = { visual_prompt: "Error parsing response.", voiceover: "Error parsing response." };
        
        if (jsonMatch && jsonMatch[1]) {
          try {
            parsedJson = JSON.parse(jsonMatch[1]);
          } catch (e) {
            console.error("Failed to parse JSON from Gemini.", e);
          }
        } else {
            console.warn("Regex failed to find JSON. Raw response:", responseText);
        }
        
        const { data: versions } = await supabase
          .from('scene_versions')
          .select('version_number')
          .eq('scene_id', pendingJob.payload.scene_id)
          .order('version_number', { ascending: false })
          .limit(1);
          
        const nextVersion = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;
        
        await supabase.from('scene_versions').insert({
          scene_id: pendingJob.payload.scene_id,
          version_number: nextVersion,
          visual_prompt: parsedJson.visual_prompt,
          voiceover: parsedJson.voiceover,
          status: 'completed'
        });
      }

      // Mark Job as Completed
      await supabase.from('job_queue').update({ status: 'completed' }).eq('id', pendingJob.id);
      
      // Save New URL
      const currentUrl = page.url();
      if (currentUrl !== targetUrl && currentUrl.includes('/app/')) {
        if (pendingJob.job_type === 'brainstorm' || pendingJob.job_type === 'finalize_episode') {
          console.log(`Saving new conversation URL to global auth_sessions: ${currentUrl}`);
          await supabase.from('auth_sessions').update({ conversation_url: currentUrl }).eq('id', 1);
        } else if (pendingJob.job_type === 'scene_script') {
          console.log(`Saving new conversation URL to scene: ${currentUrl}`);
          await supabase.from('scenes').update({ conversation_url: currentUrl }).eq('id', pendingJob.payload.scene_id);
        }
      }
      
    } else {
      console.log("Could not find response element.");
      await supabase.from('job_queue').update({ status: 'failed' }).eq('id', pendingJob.id);
    }
  } catch (err) {
    console.error("Error during interaction:", err);
    await supabase.from('job_queue').update({ status: 'failed' }).eq('id', pendingJob.id);
  }

  await browser.close();
}

runWorker();
