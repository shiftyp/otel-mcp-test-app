import { browser } from 'k6/browser';

export const options = {
  scenarios: {
    browserDebug: {
      executor: 'per-vu-iterations',
      vus: 2,
      iterations: 2,
      options: {
        browser: {
          type: 'chromium',
          headless: true,
        },
      },
    },
  },
};

export default async function () {
  console.log(`VU ${__VU}, iteration ${__ITER} starting`);
  
  let context = null;
  let page = null;
  
  try {
    console.log(`VU ${__VU}: Creating context...`);
    context = await browser.newContext();
    
    console.log(`VU ${__VU}: Creating page...`);
    page = await context.newPage();
    
    console.log(`VU ${__VU}: Navigating to ${__ENV.BASE_URL || 'http://localhost:80'}...`);
    await page.goto(__ENV.BASE_URL || 'http://localhost:80');
    
    console.log(`VU ${__VU}: Waiting 2 seconds...`);
    await page.waitForTimeout(2000);
    
    console.log(`VU ${__VU}: Success!`);
  } catch (error) {
    console.error(`VU ${__VU}: Error:`, error);
  } finally {
    if (page) {
      await page.close();
    }
    if (context) {
      await context.close();
    }
    console.log(`VU ${__VU}: Cleanup complete`);
  }
  
  console.log(`VU ${__VU}, iteration ${__ITER} complete`);
}