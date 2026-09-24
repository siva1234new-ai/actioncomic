const { chromium } = require('playwright');
const fs = require('fs');

async function setupAuth() {
  console.log("Launching browser for manual login...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://gemini.google.com/app');
  
  console.log("\n=======================================================");
  console.log("Please log in to your Google Account in the browser.");
  console.log("Once you can fully see the Gemini chat interface,");
  console.log("CLOSE the browser window manually.");
  console.log("=======================================================\n");
  
  // Wait for the user to close the browser
  await new Promise(resolve => browser.on('disconnected', resolve));

  // Save the full session (Cookies + Local Storage)
  await context.storageState({ path: 'state.json' });
  console.log("✅ Authentication state successfully saved to 'state.json'!");
  
  // Also print the cookies so they can easily paste them into Supabase if they want
  const state = JSON.parse(fs.readFileSync('state.json', 'utf8'));
  console.log(`\nExtracted ${state.cookies.length} cookies natively.`);
}

setupAuth().catch(console.error);
