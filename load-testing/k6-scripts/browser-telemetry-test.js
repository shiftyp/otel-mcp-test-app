import { browser } from 'k6/browser';
import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Helper function for random wait times
function randomWait(min = 500, max = 2000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper to safely execute async functions
async function safeExecute(fn, errorMessage) {
  try {
    return await fn();
  } catch (error) {
    console.error(errorMessage, error?.message || error);
    return null;
  }
}

// Custom metrics
const errorRate = new Rate('browser_errors');
const pageLoadTime = new Trend('browser_page_load_time');
const telemetryDataSent = new Counter('telemetry_data_sent_bytes');
const telemetryRequestCount = new Counter('telemetry_requests_total');
const applicationDataSent = new Counter('application_data_sent_bytes');
const applicationRequestCount = new Counter('application_requests_total');

// Telemetry breakdown by type
const telemetryTraceData = new Counter('telemetry_trace_data_bytes');
const telemetryTraceCount = new Counter('telemetry_trace_requests');
const telemetryMetricData = new Counter('telemetry_metric_data_bytes');
const telemetryMetricCount = new Counter('telemetry_metric_requests');
const telemetryLogData = new Counter('telemetry_log_data_bytes');
const telemetryLogCount = new Counter('telemetry_log_requests');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:80';
const TEST_DURATION = __ENV.TEST_DURATION || '2m';
const VUS = parseInt(__ENV.VUS) || 1;

export const options = {
  scenarios: {
    telemetryTest: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 5,  // Limit iterations per VU
      maxDuration: TEST_DURATION,
      gracefulStop: '30s',  // Give more time to complete iterations
      options: {
        browser: {
          type: 'chromium',
          headless: true,
        },
      },
    },
  },
  thresholds: {
    browser_errors: ['rate<0.2'],  // Allow up to 20% errors for multi-VU scenarios
    browser_page_load_time: ['p(95)<5000'],  // More lenient for concurrent load
  },
};

// Track data per VU
let vuData = {
  telemetryBytes: 0,
  applicationBytes: 0,
  telemetryTraceBytes: 0,
  telemetryMetricBytes: 0,
  telemetryLogBytes: 0,
  telemetryRequests: 0,
  applicationRequests: 0,
  telemetryTraceRequests: 0,
  telemetryMetricRequests: 0,
  telemetryLogRequests: 0
};

// Store registered users per VU to reuse across iterations
const vuUsers = new Map();
// Track which VUs have completed registration
const registrationComplete = new Map();
// Generate a unique run ID for this test execution
const RUN_ID = Date.now() + '_' + Math.random().toString(36).substring(7);

export async function setup() {
  console.log('Starting browser telemetry test...');
  console.log(`BASE_URL: ${BASE_URL}`);
  
  return {
    startTime: Date.now()
  };
}

export default async function (data) {
  console.log(`VU ${__VU}, iteration ${__ITER} starting`);
  
  // Stagger VU start times on first iteration to avoid registration race
  if (__ITER === 0 && __VU > 1) {
    const baseDelay = 300;
    const staggerDelay = (__VU - 1) * baseDelay + randomWait(0, 500);
    console.log(`VU ${__VU} waiting ${staggerDelay}ms before starting...`);
    await new Promise(resolve => setTimeout(resolve, staggerDelay));
  }
  
  // Reset VU data for this iteration
  vuData = {
    telemetryBytes: 0,
    applicationBytes: 0,
    telemetryTraceBytes: 0,
    telemetryMetricBytes: 0,
    telemetryLogBytes: 0,
    telemetryRequests: 0,
    applicationRequests: 0,
    telemetryTraceRequests: 0,
    telemetryMetricRequests: 0,
    telemetryLogRequests: 0
  };
  
  let page = null;
  let context = null;
  
  try {
    // Check if browser is available
    if (!browser || typeof browser.newContext !== 'function') {
      throw new Error('Browser module not available. Ensure k6 is running with browser support.');
    }
    
    // Create a new browser context for better isolation
    context = await browser.newContext();
    if (!context) {
      throw new Error('Failed to create browser context');
    }
    
    page = await context.newPage();
    if (!page) {
      throw new Error('Failed to create page');
    }
    
    // Set reasonable timeouts
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    
    await setupPageMonitoring(page);
    
    // Execute test scenario
    await executeTestScenario(page);
    
    // Report metrics
    reportIterationMetrics();
    
  } catch (error) {
    // Log full error details
    console.error('Test error:', error);
    console.error('Error message:', error?.message || 'Unknown error');
    console.error('Error stack:', error?.stack || 'No stack trace');
    errorRate.add(1);
  } finally {
    // Clean up properly
    try {
      if (page) {
        await page.close();
      }
      if (context) {
        await context.close();
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    // Add a small delay between iterations to prevent resource exhaustion
    if (__ITER < 4) { // Don't delay after the last iteration
      await new Promise(resolve => setTimeout(resolve, randomWait(1000, 2000)));
    }
  }
}

async function setupPageMonitoring(page) {
  const telemetryUrls = ['/telemetry/', '/v1/traces', '/v1/metrics', '/v1/logs'];
  
  // Detect telemetry type
  const detectTelemetryType = (url) => {
    if (url.includes('/v1/traces') || url.includes('/telemetry/v1/traces')) return 'trace';
    if (url.includes('/v1/metrics') || url.includes('/telemetry/v1/metrics')) return 'metric';
    if (url.includes('/v1/logs') || url.includes('/telemetry/v1/logs')) return 'log';
    return 'unknown';
  };
  
  // Monitor console for errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      console.error('Browser console error:', text);
      
      // Only count as error if it's not a known/expected warning
      if (!text.includes('DevTools') && 
          !text.includes('favicon') && 
          !text.includes('Failed to load resource') &&
          !text.includes('401') &&  // Authentication errors during test flow
          !text.includes('403')) {  // Forbidden errors during test flow
        errorRate.add(1);
      }
    }
  });
  
  // Monitor network requests
  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    
    // Track request timing and size
    request.timing = { start: Date.now() };
    
    let requestSize = 0;
    const headers = request.headers();
    if (headers) {
      requestSize += Object.entries(headers).reduce((sum, [key, value]) => {
        return sum + key.length + value.length + 4;
      }, 0);
    }
    
    const postData = request.postData();
    if (postData) {
      requestSize += postData.length;
    }
    
    request.estimatedSize = requestSize;
    
    // Check if it's telemetry
    const isTelemetry = telemetryUrls.some(telUrl => url.includes(telUrl));
    request.isTelemetry = isTelemetry;
    
    if (isTelemetry) {
      const telemetryType = detectTelemetryType(url);
      request.telemetryType = telemetryType;
      console.log(`[TELEMETRY] ${telemetryType.toUpperCase()} request: ${method} ${url} (${requestSize} bytes)`);
    }
  });
  
  page.on('response', response => {
    const url = response.url();
    const status = response.status();
    const request = response.request();
    const headers = response.headers();
    
    if (request.timing) {
      const duration = Date.now() - request.timing.start;
      
      // Estimate response size
      let responseSize = 0;
      if (headers) {
        const contentLength = headers['content-length'];
        if (contentLength) {
          responseSize = parseInt(contentLength, 10);
        }
      }
      
      const totalSize = (request.estimatedSize || 0) + responseSize;
      
      if (request.isTelemetry) {
        // Track telemetry data
        telemetryDataSent.add(totalSize);
        telemetryRequestCount.add(1);
        vuData.telemetryBytes += totalSize;
        vuData.telemetryRequests += 1;
        
        // Track by type
        const telemetryType = request.telemetryType || 'unknown';
        switch (telemetryType) {
          case 'trace':
            telemetryTraceData.add(totalSize);
            telemetryTraceCount.add(1);
            vuData.telemetryTraceBytes += totalSize;
            vuData.telemetryTraceRequests += 1;
            console.log(`[TELEMETRY] TRACE response: ${status} (${totalSize} bytes)`);
            break;
          case 'metric':
            telemetryMetricData.add(totalSize);
            telemetryMetricCount.add(1);
            vuData.telemetryMetricBytes += totalSize;
            vuData.telemetryMetricRequests += 1;
            console.log(`[TELEMETRY] METRIC response: ${status} (${totalSize} bytes)`);
            break;
          case 'log':
            telemetryLogData.add(totalSize);
            telemetryLogCount.add(1);
            vuData.telemetryLogBytes += totalSize;
            vuData.telemetryLogRequests += 1;
            console.log(`[TELEMETRY] LOG response: ${status} (${totalSize} bytes)`);
            break;
        }
      } else if (url.includes('/api/')) {
        // Track application data
        applicationDataSent.add(totalSize);
        applicationRequestCount.add(1);
        vuData.applicationBytes += totalSize;
        vuData.applicationRequests += 1;
      }
    }
  });
}

async function executeTestScenario(page) {
  const startTime = Date.now();
  
  // Get or create user for this VU
  let vuUser = vuUsers.get(__VU);
  if (!vuUser) {
    // Create a unique user for this VU and run
    vuUser = {
      username: `k6test_${RUN_ID}_vu${__VU}`,
      email: `k6test_${RUN_ID}_vu${__VU}@example.com`,
      password: 'TestPassword123',
      firstName: 'K6',
      lastName: `VU${__VU}`
    };
    vuUsers.set(__VU, vuUser);
  }
  
  // 1. Navigate to home page
  console.log('\n=== Step 1: Navigate to home page ===');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    pageLoadTime.add(Date.now() - startTime);
  } catch (navError) {
    console.error('Failed to navigate to home page:', navError);
    throw navError;
  }
  
  // Wait for telemetry to be sent
  await page.waitForTimeout(randomWait(500, 1500));
  
  // 2. Register a new user (first iteration only for each VU)
  try {
    if (!registrationComplete.get(__VU)) {
      console.log('\n=== Step 2: Register new user ===');
      console.log(`Creating user: ${vuUser.username}`);
      const registered = await registerUser(page, vuUser);
      if (registered) {
        registrationComplete.set(__VU, true);
      }
      await page.waitForTimeout(randomWait(800, 1500));
    } else {
      console.log('\n=== Step 2: Login existing user ===');
      console.log(`Logging in as: ${vuUser.username}`);
      await loginUser(page, vuUser);
      await page.waitForTimeout(randomWait(800, 1500));
    }
  } catch (authError) {
    console.error('Authentication step failed:', authError);
    // Continue with test even if auth fails
  }
  
  // 3. Browse products
  try {
    console.log('\n=== Step 3: Browse products ===');
    await browseProducts(page);
    await page.waitForTimeout(randomWait(700, 1300));
  } catch (browseError) {
    console.error('Browse products failed:', browseError);
  }
  
  // 4. Search for products
  try {
    console.log('\n=== Step 4: Search products ===');
    await searchProducts(page);
    await page.waitForTimeout(randomWait(600, 1200));
  } catch (searchError) {
    console.error('Search products failed:', searchError);
  }
  
  // 5. Add items to cart
  try {
    console.log('\n=== Step 5: Add to cart ===');
    await addToCart(page);
    await page.waitForTimeout(randomWait(500, 1000));
  } catch (cartError) {
    console.error('Add to cart failed:', cartError);
  }
  
  // 6. View cart
  try {
    console.log('\n=== Step 6: View cart ===');
    await viewCart(page);
    await page.waitForTimeout(randomWait(700, 1300));
  } catch (viewError) {
    console.error('View cart failed:', viewError);
  }
  
  // 7. Logout
  try {
    console.log('\n=== Step 7: Logout ===');
    await logout(page);
    await page.waitForTimeout(randomWait(500, 1000));
  } catch (logoutError) {
    console.error('Logout failed:', logoutError);
  }
}

async function registerUser(page, user) {
  // Navigate to register page
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
  
  // Wait for form to be ready
  await page.waitForSelector('input[name="username"]', { timeout: 5000 });
  
  console.log('Filling registration form...');
  
  // Fill form
  await page.type('input[name="username"]', user.username);
  await page.type('input[name="email"]', user.email);
  await page.type('input[name="password"]', user.password);
  await page.type('input[name="confirmPassword"]', user.password);
  await page.type('input[name="firstName"]', user.firstName);
  await page.type('input[name="lastName"]', user.lastName);
  
  console.log('Submitting registration form...');
  
  // Submit
  await page.click('button[type="submit"]');
  
  // Wait for registration to complete
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    
    // Check if we're redirected to login or products page
    const currentUrl = page.url();
    console.log(`After registration, current URL: ${currentUrl}`);
    
    // Check for any error messages on the page
    const errorElement = await page.$('.error, .alert-danger, [role="alert"]');
    if (errorElement) {
      const errorText = await errorElement.textContent();
      console.error(`Registration error on page: ${errorText}`);
      errorRate.add(1);
      return false;
    } else {
      console.log('Registration successful');
      return true;
    }
  } catch (error) {
    console.error('Registration navigation failed:', error.message);
    
    // Try to capture any error message on the current page
    const pageContent = await page.content();
    if (pageContent.includes('error') || pageContent.includes('Error')) {
      console.error('Page contains error - check browser console');
    }
    
    errorRate.add(1);
    return false;
  }
}

async function loginUser(page, user) {
  // Navigate to login page
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  
  // Fill form
  await page.type('input[name="username"]', user.username);
  await page.type('input[name="password"]', user.password);
  
  // Submit
  await page.click('button[type="submit"]');
  
  // Wait for login to complete
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    console.log('Login successful');
  } catch (error) {
    console.error('Login failed:', error.message);
    errorRate.add(1);
  }
}

async function browseProducts(page) {
  // Navigate to products
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  
  // Wait for products to load
  await page.waitForSelector('.product-card', { timeout: 10000 });
  
  // Click on a random product
  const products = await page.$$('.product-card');
  if (products.length > 0) {
    const randomIndex = Math.floor(Math.random() * products.length);
    const productLink = await products[randomIndex].$('a');
    if (productLink) {
      await productLink.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
      console.log('Viewed product detail');
      
      // Navigate back to products page
      await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    }
  }
}

async function searchProducts(page) {
  const searchTerms = ['laptop', 'phone', 'camera', 'headphones'];
  const searchTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
  
  // Find search input
  const searchInput = await page.$('input[placeholder*="Search"]');
  if (searchInput) {
    await searchInput.click({ clickCount: 3 }); // Clear existing text
    await searchInput.type(searchTerm);
    
    // Submit search
    const searchButton = await page.$('.search-bar button');
    if (searchButton) {
      await searchButton.click();
    } else {
      await searchInput.press('Enter');
    }
    
    // Wait for results
    await page.waitForTimeout(randomWait(800, 1200));
    console.log(`Searched for: ${searchTerm}`);
  }
}

async function addToCart(page) {
  // Make sure we're on products page
  if (!page.url().includes('/products')) {
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  }
  
  // Add 2-3 items
  const itemsToAdd = Math.floor(Math.random() * 2) + 2;
  const products = await page.$$('.product-card');
  
  for (let i = 0; i < Math.min(itemsToAdd, products.length); i++) {
    const product = products[i];
    const addButton = await product.$('button');
    
    if (addButton) {
      await addButton.click();
      console.log(`Added item ${i + 1} to cart`);
      await page.waitForTimeout(randomWait(300, 700));
    }
  }
}

async function viewCart(page) {
  await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(randomWait(800, 1200));
  console.log('Viewed cart');
}

async function logout(page) {
  // Look for logout button
  const logoutButton = await page.$('button:has-text("Logout")');
  if (logoutButton) {
    await logoutButton.click();
    await page.waitForTimeout(randomWait(500, 1000));
    console.log('Logged out');
  }
}

function reportIterationMetrics() {
  const totalBytes = vuData.telemetryBytes + vuData.applicationBytes;
  
  if (totalBytes > 0) {
    const telemetryPercent = (vuData.telemetryBytes / totalBytes) * 100;
    
    console.log('\n=== Iteration Telemetry Summary ===');
    console.log(`Total data: ${totalBytes} bytes`);
    console.log(`Application: ${vuData.applicationBytes} bytes (${((vuData.applicationBytes / totalBytes) * 100).toFixed(1)}%)`);
    console.log(`Telemetry: ${vuData.telemetryBytes} bytes (${telemetryPercent.toFixed(1)}%)`);
    
    if (vuData.telemetryBytes > 0) {
      console.log('\nTelemetry breakdown:');
      console.log(`  Traces: ${vuData.telemetryTraceBytes} bytes (${vuData.telemetryTraceRequests} requests)`);
      console.log(`  Metrics: ${vuData.telemetryMetricBytes} bytes (${vuData.telemetryMetricRequests} requests)`);
      console.log(`  Logs: ${vuData.telemetryLogBytes} bytes (${vuData.telemetryLogRequests} requests)`);
    }
    console.log('===================================\n');
  }
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\nBrowser telemetry test completed in ${duration}s`);
}