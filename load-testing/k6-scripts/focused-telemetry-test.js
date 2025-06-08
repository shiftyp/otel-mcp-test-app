import { browser } from 'k6/browser';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Metrics for tracking telemetry
const telemetryRequests = new Counter('telemetry_requests');
const telemetryBytes = new Counter('telemetry_bytes');
const apiRequests = new Counter('api_requests');
const apiBytes = new Counter('api_bytes');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:80';

export const options = {
  scenarios: {
    telemetryFocus: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 3,
      options: {
        browser: {
          type: 'chromium',
          headless: true,
        },
      },
    },
  },
};

// Create a persistent test user
const TEST_USER = {
  username: `telemetrytest_${Date.now()}`,
  email: `telemetrytest_${Date.now()}@example.com`,
  password: 'TelemetryTest123!',
  firstName: 'Telemetry',
  lastName: 'Test'
};

let userRegistered = false;

export default async function () {
  console.log(`\n========== Iteration ${__ITER + 1} ==========`);
  
  let page;
  const telemetryData = {
    traces: { count: 0, bytes: 0 },
    metrics: { count: 0, bytes: 0 },
    logs: { count: 0, bytes: 0 },
    api: { count: 0, bytes: 0 }
  };
  
  try {
    page = await browser.newPage();
    
    // Setup monitoring
    await setupDetailedMonitoring(page, telemetryData);
    
    // Execute focused test flow
    if (!userRegistered) {
      await testRegistration(page);
      userRegistered = true;
    } else {
      await testLogin(page);
    }
    
    // Test product browsing
    await testProductBrowsing(page);
    
    // Test cart operations
    await testCartOperations(page);
    
    // Wait for final telemetry flush
    console.log('\nWaiting for telemetry flush...');
    await page.waitForTimeout(5000);
    
    // Report detailed results
    reportTelemetryDetails(telemetryData);
    
  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    if (page) {
      await page.close();
    }
  }
}

function setupDetailedMonitoring(page, telemetryData) {
  // Enhanced request monitoring
  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    
    // Calculate request size
    let size = 0;
    const headers = request.headers();
    if (headers) {
      size += JSON.stringify(headers).length;
    }
    const postData = request.postData();
    if (postData) {
      size += postData.length;
    }
    
    request._size = size;
    request._startTime = Date.now();
    
    // Log telemetry requests
    if (url.includes('/telemetry/') || url.includes(':4318')) {
      let type = 'unknown';
      if (url.includes('/v1/traces')) type = 'TRACE';
      else if (url.includes('/v1/metrics')) type = 'METRIC';
      else if (url.includes('/v1/logs')) type = 'LOG';
      
      console.log(`[${type}] Request: ${method} ${url.substring(url.lastIndexOf('/'))} (${size} bytes)`);
    }
  });
  
  page.on('response', response => {
    const request = response.request();
    const url = response.url();
    const status = response.status();
    
    if (!request._startTime) return;
    
    const duration = Date.now() - request._startTime;
    const headers = response.headers();
    let responseSize = 0;
    
    if (headers && headers['content-length']) {
      responseSize = parseInt(headers['content-length'], 10);
    }
    
    const totalSize = (request._size || 0) + responseSize;
    
    // Track telemetry
    if (url.includes('/telemetry/') || url.includes(':4318')) {
      telemetryRequests.add(1);
      telemetryBytes.add(totalSize);
      
      if (url.includes('/v1/traces')) {
        telemetryData.traces.count++;
        telemetryData.traces.bytes += totalSize;
        console.log(`[TRACE] Response: ${status} (${totalSize} bytes, ${duration}ms)`);
      } else if (url.includes('/v1/metrics')) {
        telemetryData.metrics.count++;
        telemetryData.metrics.bytes += totalSize;
        console.log(`[METRIC] Response: ${status} (${totalSize} bytes, ${duration}ms)`);
      } else if (url.includes('/v1/logs')) {
        telemetryData.logs.count++;
        telemetryData.logs.bytes += totalSize;
        console.log(`[LOG] Response: ${status} (${totalSize} bytes, ${duration}ms)`);
      }
    }
    // Track API calls
    else if (url.includes('/api/')) {
      apiRequests.add(1);
      apiBytes.add(totalSize);
      telemetryData.api.count++;
      telemetryData.api.bytes += totalSize;
      
      const endpoint = url.substring(url.indexOf('/api/'));
      console.log(`[API] ${endpoint}: ${status} (${totalSize} bytes, ${duration}ms)`);
    }
  });
  
  // Log console messages related to telemetry
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Telemetry') || text.includes('OTEL') || text.includes('trace') || text.includes('span')) {
      console.log(`[Browser Console] ${text}`);
    }
  });
}

async function testRegistration(page) {
  console.log('\n--- Testing Registration (generates multiple spans) ---');
  
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Fill registration form
  console.log('Filling registration form...');
  await page.type('input[name="username"]', TEST_USER.username, { delay: 20 });
  await page.type('input[name="email"]', TEST_USER.email, { delay: 20 });
  await page.type('input[name="password"]', TEST_USER.password, { delay: 20 });
  await page.type('input[name="confirmPassword"]', TEST_USER.password, { delay: 20 });
  await page.type('input[name="firstName"]', TEST_USER.firstName, { delay: 20 });
  await page.type('input[name="lastName"]', TEST_USER.lastName, { delay: 20 });
  
  // Submit and wait
  console.log('Submitting registration...');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    console.log('Registration completed successfully');
  } catch (error) {
    console.error('Registration navigation timeout');
  }
  
  await page.waitForTimeout(2000);
}

async function testLogin(page) {
  console.log('\n--- Testing Login (generates multiple spans) ---');
  
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Fill login form
  console.log('Filling login form...');
  await page.type('input[name="username"]', TEST_USER.username, { delay: 20 });
  await page.type('input[name="password"]', TEST_USER.password, { delay: 20 });
  
  // Submit and wait
  console.log('Submitting login...');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    console.log('Login completed successfully');
  } catch (error) {
    console.error('Login navigation timeout');
  }
  
  await page.waitForTimeout(2000);
}

async function testProductBrowsing(page) {
  console.log('\n--- Testing Product Browsing ---');
  
  // Go to products page
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Click on first product
  const products = await page.$$('.product-card a');
  if (products.length > 0) {
    console.log('Clicking on product...');
    await products[0].click();
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
    await page.waitForTimeout(2000);
    
    // Go back
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  }
  
  // Search for a product
  console.log('Searching for products...');
  const searchInput = await page.$('input[placeholder*="Search"]');
  if (searchInput) {
    await searchInput.type('laptop', { delay: 50 });
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);
  }
}

async function testCartOperations(page) {
  console.log('\n--- Testing Cart Operations ---');
  
  // Make sure we're on products page
  if (!page.url().includes('/products')) {
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  }
  
  // Add items to cart
  const addButtons = await page.$$('.product-card button');
  for (let i = 0; i < Math.min(3, addButtons.length); i++) {
    console.log(`Adding item ${i + 1} to cart...`);
    await addButtons[i].click();
    await page.waitForTimeout(1000);
  }
  
  // View cart
  console.log('Viewing cart...');
  await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Update quantity if possible
  const quantityInputs = await page.$$('input[type="number"]');
  if (quantityInputs.length > 0) {
    console.log('Updating item quantity...');
    await quantityInputs[0].click({ clickCount: 3 });
    await quantityInputs[0].type('3');
    await page.waitForTimeout(1000);
  }
}

function reportTelemetryDetails(telemetryData) {
  console.log('\n============ Telemetry Report ============');
  
  const totalTelemetry = telemetryData.traces.bytes + telemetryData.metrics.bytes + telemetryData.logs.bytes;
  const totalRequests = telemetryData.traces.count + telemetryData.metrics.count + telemetryData.logs.count;
  
  console.log(`Total Telemetry: ${totalTelemetry} bytes (${totalRequests} requests)`);
  console.log(`Total API: ${telemetryData.api.bytes} bytes (${telemetryData.api.count} requests)`);
  
  if (totalTelemetry > 0) {
    console.log('\nTelemetry Breakdown:');
    console.log(`  Traces: ${telemetryData.traces.count} requests, ${telemetryData.traces.bytes} bytes`);
    console.log(`  Metrics: ${telemetryData.metrics.count} requests, ${telemetryData.metrics.bytes} bytes`);
    console.log(`  Logs: ${telemetryData.logs.count} requests, ${telemetryData.logs.bytes} bytes`);
    
    const totalData = totalTelemetry + telemetryData.api.bytes;
    const telemetryPercent = (totalTelemetry / totalData) * 100;
    console.log(`\nTelemetry Overhead: ${telemetryPercent.toFixed(1)}% of total data`);
  }
  
  console.log('=========================================\n');
}