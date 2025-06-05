import { browser } from 'k6/experimental/browser';
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('browser_errors');
const pageLoadTime = new Trend('browser_page_load_time');
const interactionTime = new Trend('browser_interaction_time');
const apiCallTime = new Trend('browser_api_call_time');
const duplicateProducts = new Counter('duplicate_products_found');
const syncFailures = new Counter('tab_sync_failures');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4200';
const FLAGD_URL = __ENV.FLAGD_URL || 'http://localhost:8013';
const FLAGD_BROWSER_URL = __ENV.FLAGD_BROWSER_URL || 'http://localhost:8013';

// Global state
let featureFlags = {};
let flagdAvailable = false;

// Dynamic options function that fetches configuration from flagd
export function options() {
  // Try to fetch test configuration from flagd
  try {
    const res = http.post(
      `${FLAGD_URL}/schema.v1.Service/ResolveAll`,
      JSON.stringify({
        context: {
          testType: 'browser-load-test',
          environment: __ENV.ENVIRONMENT || 'test',
          timestamp: new Date().toISOString(),
        }
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: '5s',
      }
    );
    
    if (res.status === 200) {
      const flags = JSON.parse(res.body);
      featureFlags = flags;
      flagdAvailable = true;
      
      // Build dynamic configuration
      const testConfig = flags.browserTestConfiguration || {};
      
      return {
        scenarios: buildScenarios(testConfig),
        thresholds: buildThresholds(testConfig),
      };
    }
  } catch (error) {
    console.warn('Could not fetch feature flags, using defaults:', error);
  }
  
  // Default configuration
  return {
    scenarios: {
      browserDefault: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
          { duration: '1m', target: 3 },
          { duration: '3m', target: 5 },
          { duration: '1m', target: 0 },
        ],
        options: {
          browser: {
            type: 'chromium',
            headless: true,
          },
        },
      },
    },
    thresholds: {
      browser_errors: ['rate<0.1'],
      browser_page_load_time: ['p(95)<3000'],
      browser_interaction_time: ['p(95)<1000'],
    },
  };
}

// Build scenarios based on feature flags
function buildScenarios(config) {
  const scenarios = {};
  
  // Smoke test
  if (config.enableSmokeTest !== false) {
    scenarios.browserSmoke = {
      executor: 'constant-vus',
      vus: config.smokeVUs || 1,
      duration: config.smokeDuration || '2m',
      options: {
        browser: {
          type: config.browserType || 'chromium',
          headless: config.headless !== false,
        },
      },
    };
  }
  
  // Progressive load test
  if (config.enableProgressiveLoad !== false) {
    const stages = config.progressiveStages || [
      { duration: '1m', target: 2 },
      { duration: '2m', target: 5 },
      { duration: '3m', target: 8 },
      { duration: '2m', target: 5 },
      { duration: '1m', target: 0 },
    ];
    
    scenarios.browserProgressive = {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stages,
      gracefulRampDown: '30s',
      options: {
        browser: {
          type: config.browserType || 'chromium',
          headless: config.headless !== false,
        },
      },
    };
  }
  
  // Spike test
  if (config.enableSpikeTest === true) {
    scenarios.browserSpike = {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 20,
      stages: [
        { duration: '30s', target: 1 },
        { duration: '10s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '10s', target: 1 },
      ],
      options: {
        browser: {
          type: config.browserType || 'chromium',
          headless: config.headless !== false,
        },
      },
    };
  }
  
  return scenarios;
}

// Build thresholds based on feature flags
function buildThresholds(config) {
  const targets = config.performanceTargets || {};
  
  return {
    browser_errors: [`rate<${targets.errorRate || 0.1}`],
    browser_page_load_time: [`p(95)<${targets.pageLoadP95 || 3000}`],
    browser_interaction_time: [`p(95)<${targets.interactionP95 || 1000}`],
    browser_api_call_time: [`p(95)<${targets.apiCallP95 || 500}`],
    duplicate_products_found: targets.maxDuplicates ? [`count<${targets.maxDuplicates}`] : [],
    tab_sync_failures: targets.maxSyncFailures ? [`count<${targets.maxSyncFailures}`] : [],
  };
}

// Main test function
export default async function () {
  const page = browser.newPage();
  
  try {
    // Setup page with monitoring
    await setupPageMonitoring(page);
    
    // Set device profile based on feature flags
    const deviceProfile = await setDeviceProfile(page);
    
    // Navigate to the application
    const startTime = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    pageLoadTime.add(Date.now() - startTime);
    
    // Inject feature flag client for browser
    if (flagdAvailable) {
      await injectFeatureFlagClient(page);
    }
    
    // Build test context
    const context = {
      sessionId: `browser_${__VU}_${Date.now()}`,
      deviceProfile,
      testType: __ENV.TEST_TYPE || 'browser',
      hour: new Date().getHours(),
      iteration: __ITER,
      vu: __VU,
    };
    
    // Store context in browser
    await page.evaluate((ctx) => {
      window.__testContext = ctx;
      localStorage.setItem('testContext', JSON.stringify(ctx));
      sessionStorage.setItem('sessionId', ctx.sessionId);
    }, context);
    
    // Select and execute scenario
    const scenario = await selectScenario(page);
    console.log(`Executing scenario: ${scenario}`);
    
    switch (scenario) {
      case 'browseProducts':
        await browseProductsScenario(page, context);
        break;
      case 'searchProducts':
        await searchProductsScenario(page, context);
        break;
      case 'purchaseFlow':
        await purchaseFlowScenario(page, context);
        break;
      case 'heavyCart':
        await heavyCartScenario(page, context);
        break;
      case 'infiniteScroll':
        await infiniteScrollScenario(page, context);
        break;
      case 'multiTab':
        await multiTabScenario(page, context);
        break;
      case 'performanceStress':
        await performanceStressScenario(page, context);
        break;
      default:
        await browseProductsScenario(page, context);
    }
    
    // Collect final metrics
    await collectPageMetrics(page);
    
  } catch (error) {
    console.error('Test error:', error);
    errorRate.add(1);
    await captureErrorDetails(page, error);
  } finally {
    await page.close();
  }
}

// Setup page monitoring and interceptors
async function setupPageMonitoring(page) {
  // Monitor console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('Browser console error:', msg.text());
      errorRate.add(1);
    }
  });
  
  // Monitor page errors
  page.on('pageerror', error => {
    console.error('Page error:', error.message);
    errorRate.add(1);
  });
  
  // Monitor network requests
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      request.timing = { start: Date.now() };
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      const request = response.request();
      if (request.timing) {
        const duration = Date.now() - request.timing.start;
        apiCallTime.add(duration);
      }
    }
  });
  
  // Inject performance monitoring
  await page.evaluateOnNewDocument(() => {
    window.__performanceMetrics = {
      apiCalls: [],
      interactions: [],
      errors: [],
    };
    
    // Override fetch to monitor API calls
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = performance.now();
      try {
        const response = await originalFetch(...args);
        const duration = performance.now() - start;
        window.__performanceMetrics.apiCalls.push({
          url: args[0],
          duration,
          status: response.status,
        });
        return response;
      } catch (error) {
        window.__performanceMetrics.errors.push({
          type: 'fetch',
          message: error.message,
        });
        throw error;
      }
    };
  });
}

// Set device profile based on feature flags
async function setDeviceProfile(page) {
  const deviceConfig = featureFlags.deviceConfiguration || {
    profiles: {
      desktop: { width: 1920, height: 1080, userAgent: 'desktop' },
      tablet: { width: 768, height: 1024, userAgent: 'tablet' },
      mobile: { width: 375, height: 667, userAgent: 'mobile' },
    },
    distribution: { desktop: 60, tablet: 20, mobile: 20 },
  };
  
  // Select profile based on distribution
  const rand = Math.random() * 100;
  let profileName = 'desktop';
  let cumulative = 0;
  
  for (const [name, weight] of Object.entries(deviceConfig.distribution)) {
    cumulative += weight;
    if (rand <= cumulative) {
      profileName = name;
      break;
    }
  }
  
  const profile = deviceConfig.profiles[profileName];
  
  // Set viewport
  await page.setViewportSize({ width: profile.width, height: profile.height });
  
  // Set user agent
  if (profile.userAgent === 'mobile') {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148');
  } else if (profile.userAgent === 'tablet') {
    await page.setUserAgent('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15');
  }
  
  return profileName;
}

// Inject feature flag client
async function injectFeatureFlagClient(page) {
  await page.evaluate((flagdUrl) => {
    window.__featureFlags = {
      async getFlag(key, defaultValue, context = {}) {
        try {
          const response = await fetch(`${flagdUrl}/schema.v1.Service/ResolveBoolean`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              flagKey: key,
              context: {
                ...window.__testContext,
                ...context,
              },
            }),
          });
          
          if (response.ok) {
            const result = await response.json();
            return result.value !== undefined ? result.value : defaultValue;
          }
        } catch (error) {
          console.error('Feature flag error:', error);
        }
        return defaultValue;
      },
    };
  }, FLAGD_BROWSER_URL);
}

// Select scenario based on feature flags
async function selectScenario(page) {
  // Try to get scenario weights from page context
  const weights = await page.evaluate(async () => {
    if (window.__featureFlags) {
      return await window.__featureFlags.getFlag('browserScenarioWeights', {
        browseProducts: 25,
        searchProducts: 20,
        purchaseFlow: 15,
        heavyCart: 10,
        infiniteScroll: 15,
        multiTab: 10,
        performanceStress: 5,
      });
    }
    return null;
  });
  
  const scenarioWeights = weights || featureFlags.browserScenarioWeights || {
    browseProducts: 30,
    searchProducts: 20,
    purchaseFlow: 15,
    heavyCart: 10,
    infiniteScroll: 15,
    multiTab: 10,
  };
  
  // Calculate total weight
  const totalWeight = Object.values(scenarioWeights).reduce((sum, weight) => sum + weight, 0);
  let rand = Math.random() * totalWeight;
  
  for (const [scenario, weight] of Object.entries(scenarioWeights)) {
    rand -= weight;
    if (rand <= 0) {
      return scenario;
    }
  }
  
  return 'browseProducts';
}

// Browse products scenario
async function browseProductsScenario(page, context) {
  const config = featureFlags.browseProductsConfig || {};
  
  // Check if should use beta features
  const useBeta = await page.evaluate(async () => {
    if (window.__featureFlags) {
      return await window.__featureFlags.getFlag('useBetaProductList', false);
    }
    return false;
  });
  
  const productsUrl = useBeta ? `${BASE_URL}/products-beta` : `${BASE_URL}/products`;
  
  // Navigate to products
  const navStart = Date.now();
  await page.goto(productsUrl, { waitUntil: 'networkidle' });
  interactionTime.add(Date.now() - navStart);
  
  // Wait for products
  await page.waitForSelector('.product-card', { timeout: 10000 });
  
  // Get products and interact
  const products = await page.$$('.product-card');
  const interactCount = Math.min(config.maxInteractions || 3, products.length);
  
  for (let i = 0; i < interactCount; i++) {
    const product = products[Math.floor(Math.random() * products.length)];
    
    // Hover to trigger any lazy loading
    await product.hover();
    sleep(0.2);
    
    // Click product
    const clickStart = Date.now();
    await product.click();
    
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
      await page.waitForSelector('.product-detail', { timeout: 5000 });
      
      // Add to cart
      const addButton = await page.$('button[aria-label*="Add to cart"], button:has-text("Add to Cart")');
      if (addButton) {
        await addButton.click();
        sleep(0.5);
      }
      
      // Go back
      await page.goBack({ waitUntil: 'networkidle' });
    } catch (error) {
      console.error('Product interaction error:', error);
    }
    
    interactionTime.add(Date.now() - clickStart);
    sleep(config.delayBetweenProducts || 1);
  }
}

// Search products scenario
async function searchProductsScenario(page, context) {
  const config = featureFlags.searchConfig || {};
  
  // Navigate to search
  await page.goto(`${BASE_URL}/search`, { waitUntil: 'networkidle' });
  
  // Get search terms
  const terms = config.searchTerms || ['laptop', 'phone', 'headphones'];
  const term = terms[Math.floor(Math.random() * terms.length)];
  
  // Add variations based on feature flags
  let searchTerm = term;
  if (Math.random() < (config.multiWordProbability || 0.2)) {
    searchTerm += ' ' + ['pro', 'max', 'plus'][Math.floor(Math.random() * 3)];
  }
  
  // Find and fill search input
  const searchInput = await page.$('input[type="search"], input[placeholder*="Search"]');
  if (!searchInput) {
    throw new Error('Search input not found');
  }
  
  // Type with realistic speed
  const typeStart = Date.now();
  await searchInput.type(searchTerm, { delay: config.typeDelay || 100 });
  
  // Wait for results or validation
  try {
    await page.waitForSelector('.search-results, .validation-message', { timeout: 5000 });
  } catch (error) {
    console.error('Search results timeout');
  }
  
  interactionTime.add(Date.now() - typeStart);
  
  // Check results
  const results = await page.$$('.result-item');
  if (results.length > 0 && Math.random() < 0.5) {
    await results[0].click();
    sleep(1);
  }
}

// Heavy cart scenario
async function heavyCartScenario(page, context) {
  const config = featureFlags.heavyCartConfig || {
    itemCount: 8,
    useQuickAdd: true,
  };
  
  // Set cart size context
  context.cartSize = config.itemCount;
  
  // Navigate to products
  await page.goto(`${BASE_URL}/products-beta`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.product-card');
  
  // Add items rapidly
  for (let i = 0; i < config.itemCount; i++) {
    const products = await page.$$('.product-card');
    if (products.length === 0) break;
    
    const product = products[i % products.length];
    
    // Try quick add first
    if (config.useQuickAdd) {
      const quickAdd = await product.$('.quick-add-btn');
      if (quickAdd) {
        await quickAdd.click();
        sleep(0.1);
        continue;
      }
    }
    
    // Fall back to regular add
    await product.click();
    await page.waitForNavigation({ waitUntil: 'networkidle' });
    
    const addBtn = await page.$('button[aria-label*="Add to cart"]');
    if (addBtn) {
      await addBtn.click();
      sleep(0.2);
    }
    
    await page.goBack();
  }
  
  // Check cart state
  const cartCount = await page.$eval('.cart-count', el => el.textContent);
  console.log(`Cart has ${cartCount} items`);
}

// Infinite scroll scenario
async function infiniteScrollScenario(page, context) {
  const config = featureFlags.infiniteScrollConfig || {
    maxScrolls: 5,
    scrollSpeed: 300,
  };
  
  // Navigate to products with infinite scroll
  await page.goto(`${BASE_URL}/products-beta`, { waitUntil: 'networkidle' });
  
  const seenProducts = new Set();
  let duplicateCount = 0;
  
  for (let i = 0; i < config.maxScrolls; i++) {
    // Get current products
    const productIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.product-card')).map(card => {
        return card.getAttribute('data-product-id') || 
               card.querySelector('h3')?.textContent || 
               Math.random().toString();
      });
    });
    
    // Check for duplicates
    productIds.forEach(id => {
      if (seenProducts.has(id)) {
        duplicateCount++;
        duplicateProducts.add(1);
      } else {
        seenProducts.add(id);
      }
    });
    
    // Scroll to bottom
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    // Wait for new content
    sleep(1);
    
    // Update scroll depth context
    context.scrollDepth = i + 1;
  }
  
  console.log(`Found ${duplicateCount} duplicate products in infinite scroll`);
}

// Multi-tab scenario
async function multiTabScenario(page, context) {
  const config = featureFlags.multiTabConfig || {
    tabCount: 2,
    testSync: true,
  };
  
  // Add item in first tab
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  
  const firstProduct = await page.$('.product-card');
  if (firstProduct) {
    await firstProduct.click();
    await page.waitForNavigation();
    
    const addBtn = await page.$('button[aria-label*="Add to cart"]');
    if (addBtn) {
      await addBtn.click();
      sleep(0.5);
    }
  }
  
  // Get initial cart state
  const initialCart = await page.evaluate(() => localStorage.getItem('cart'));
  
  // Open second tab
  const page2 = await browser.newPage();
  
  try {
    await page2.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });
    
    // Check sync
    const secondTabCart = await page2.evaluate(() => localStorage.getItem('cart'));
    
    if (initialCart !== secondTabCart) {
      syncFailures.add(1);
      console.error('Cart sync failed between tabs');
    }
    
    // Test real-time sync
    if (config.testSync) {
      // Add item in second tab
      await page2.goto(`${BASE_URL}/products`);
      const products = await page2.$$('.product-card');
      
      if (products.length > 1) {
        await products[1].click();
        await page2.waitForNavigation();
        
        const addBtn2 = await page2.$('button[aria-label*="Add to cart"]');
        if (addBtn2) {
          await addBtn2.click();
          sleep(1);
        }
      }
      
      // Check if first tab updated
      const finalCart1 = await page.evaluate(() => localStorage.getItem('cart'));
      const finalCart2 = await page2.evaluate(() => localStorage.getItem('cart'));
      
      if (finalCart1 !== finalCart2) {
        syncFailures.add(1);
      }
    }
  } finally {
    await page2.close();
  }
}

// Performance stress scenario
async function performanceStressScenario(page, context) {
  const config = featureFlags.performanceStressConfig || {
    componentCount: 30,
    animationCount: 10,
  };
  
  // Navigate to a heavy page
  await page.goto(`${BASE_URL}/products-beta`, { waitUntil: 'networkidle' });
  
  // Trigger performance optimizations
  await page.evaluate((config) => {
    // Add many components to the DOM
    for (let i = 0; i < config.componentCount; i++) {
      const div = document.createElement('div');
      div.className = 'stress-component';
      div.innerHTML = `<h3>Component ${i}</h3><p>Stress test content</p>`;
      document.body.appendChild(div);
    }
    
    // Trigger animations
    for (let i = 0; i < config.animationCount; i++) {
      const elem = document.createElement('div');
      elem.style.cssText = `
        position: fixed;
        width: 50px;
        height: 50px;
        background: red;
        animation: spin 1s linear infinite;
        top: ${Math.random() * 100}%;
        left: ${Math.random() * 100}%;
      `;
      document.body.appendChild(elem);
    }
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }, config);
  
  // Perform interactions while under stress
  sleep(2);
  
  // Scroll rapidly
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    sleep(0.2);
  }
  
  // Measure jank
  const metrics = await page.evaluate(() => performance.getEntriesByType('measure'));
  console.log('Performance measures:', metrics.length);
}

// Purchase flow scenario
async function purchaseFlowScenario(page, context) {
  // Execute browse and add to cart
  await browseProductsScenario(page, context);
  
  // Go to cart
  await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });
  
  // Check for checkout button
  const checkoutBtn = await page.$('button[aria-label*="Checkout"], button:has-text("Checkout")');
  if (checkoutBtn) {
    await checkoutBtn.click();
    
    // Fill form if present
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      await emailInput.type(`test${Date.now()}@example.com`);
    }
  }
}

// Collect page metrics
async function collectPageMetrics(page) {
  const metrics = await page.evaluate(() => {
    return {
      performance: window.__performanceMetrics || {},
      errors: window.__consoleErrors || [],
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      } : null,
    };
  });
  
  console.log('Page metrics:', JSON.stringify(metrics, null, 2));
}

// Capture error details
async function captureErrorDetails(page, error) {
  try {
    // Take screenshot (Optional)
    // const screenshot = await page.screenshot({ fullPage: true });
    // console.log('Screenshot captured, size:', screenshot.length);
    
    // Get console logs
    const logs = await page.evaluate(() => window.__consoleErrors || []);
    console.log('Console errors:', logs);
  } catch (e) {
    console.error('Failed to capture error details:', e);
  }
}

// Setup function
export function setup() {
  console.log('Starting unified browser load test...');
  
  // Try to connect to flagd
  try {
    const res = http.get(`${FLAGD_URL}/health`, { timeout: '2s' });
    if (res.status === 200) {
      console.log('Feature flag service is available');
      flagdAvailable = true;
    }
  } catch (error) {
    console.warn('Feature flag service not available, using defaults');
  }
  
  return {
    startTime: Date.now(),
    flagdAvailable,
  };
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Unified browser test completed in ${duration}s`);
  console.log(`Feature flags available: ${data.flagdAvailable}`);
}