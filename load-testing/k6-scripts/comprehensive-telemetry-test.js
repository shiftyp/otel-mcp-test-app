import { browser } from 'k6/browser';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Metrics for tracking telemetry coverage
const telemetryRequests = new Counter('telemetry_requests');
const telemetryBytes = new Counter('telemetry_bytes');
const telemetrySpans = new Counter('telemetry_spans_created');
const instrumentedFunctionsCalled = new Counter('instrumented_functions_called');
const telemetryByEndpoint = new Counter('telemetry_by_endpoint');

// Telemetry type breakdown
const telemetryTraceData = new Counter('telemetry_trace_data_bytes');
const telemetryTraceCount = new Counter('telemetry_trace_requests');
const telemetryMetricData = new Counter('telemetry_metric_data_bytes');
const telemetryMetricCount = new Counter('telemetry_metric_requests');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:80';

export const options = {
  scenarios: {
    comprehensiveTelemetry: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      options: {
        browser: {
          type: 'chromium',
          headless: true,
        },
      },
    },
  },
};

// Track all telemetry operations
const telemetryOperations = new Set();
const tracedFunctions = new Set();

export default async function () {
  console.log('\n========== Comprehensive Telemetry Test ==========');
  
  let page;
  const telemetryData = {
    traces: { count: 0, bytes: 0, spans: [] },
    metrics: { count: 0, bytes: 0 },
    operations: new Set(),
    endpoints: new Set(),
    tracedFunctions: new Set()
  };
  
  try {
    page = await browser.newPage();
    
    // Enhanced monitoring with operation tracking
    await setupComprehensiveMonitoring(page, telemetryData);
    
    // Execute all frontend operations systematically
    console.log('\n--- Phase 1: Initial Page Load ---');
    await testInitialPageLoad(page, telemetryData);
    
    console.log('\n--- Phase 2: User Registration with Validation ---');
    await testUserRegistration(page, telemetryData);
    
    console.log('\n--- Phase 3: User Login ---');
    await testUserLogin(page, telemetryData);
    
    console.log('\n--- Phase 4: Product Browsing ---');
    await testProductBrowsing(page, telemetryData);
    
    console.log('\n--- Phase 5: Product Search ---');
    await testProductSearch(page, telemetryData);
    
    console.log('\n--- Phase 6: Product Details ---');
    await testProductDetails(page, telemetryData);
    
    console.log('\n--- Phase 7: Cart Operations ---');
    await testCartOperations(page, telemetryData);
    
    console.log('\n--- Phase 8: Account Management ---');
    await testAccountManagement(page, telemetryData);
    
    console.log('\n--- Phase 9: Signal Telemetry ---');
    await testSignalTelemetry(page, telemetryData);
    
    // Wait for final telemetry flush
    console.log('\nWaiting for telemetry flush...');
    await page.waitForTimeout(5000);
    
    // Generate comprehensive report
    generateComprehensiveReport(telemetryData);
    
  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    if (page) {
      await page.close();
    }
  }
}

function setupComprehensiveMonitoring(page, telemetryData) {
  // Monitor console for telemetry logs
  page.on('console', msg => {
    const text = msg.text();
    
    // Track telemetry operations
    if (text.includes('[Telemetry]')) {
      console.log(`Browser: ${text}`);
      
      // Extract operation names
      const spanMatch = text.match(/Creating span: ([^\s]+)/);
      if (spanMatch) {
        telemetryData.operations.add(spanMatch[1]);
        telemetryOperations.add(spanMatch[1]);
      }
      
      // Track traced functions
      const tracedMatch = text.match(/@Traced: ([^\s]+)/);
      if (tracedMatch) {
        telemetryData.tracedFunctions.add(tracedMatch[1]);
        tracedFunctions.add(tracedMatch[1]);
      }
    }
  });
  
  // Enhanced request monitoring
  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    
    request._startTime = Date.now();
    request._size = 0;
    
    const headers = request.headers();
    if (headers) {
      request._size += JSON.stringify(headers).length;
    }
    
    const postData = request.postData();
    if (postData) {
      request._size += postData.length;
      
      // Parse telemetry data to count spans
      if (url.includes('/telemetry/') || url.includes('/v1/traces')) {
        try {
          const data = JSON.parse(postData);
          if (data.resourceSpans) {
            data.resourceSpans.forEach(rs => {
              rs.scopeSpans?.forEach(ss => {
                ss.spans?.forEach(span => {
                  telemetryData.traces.spans.push({
                    name: span.name,
                    attributes: span.attributes,
                    duration: span.endTimeUnixNano - span.startTimeUnixNano
                  });
                  telemetrySpans.add(1);
                  console.log(`[SPAN] ${span.name}`);
                });
              });
            });
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
    
    // Detect telemetry type
    if (url.includes('/telemetry/') || url.includes(':4318')) {
      let type = 'unknown';
      if (url.includes('/v1/traces')) type = 'TRACE';
      else if (url.includes('/v1/metrics')) type = 'METRIC';
      
      request._telemetryType = type;
      console.log(`[${type}] Request: ${method} ${url} (${request._size} bytes)`);
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
      
      if (request._telemetryType === 'TRACE') {
        telemetryData.traces.count++;
        telemetryData.traces.bytes += totalSize;
        telemetryTraceData.add(totalSize);
        telemetryTraceCount.add(1);
      } else if (request._telemetryType === 'METRIC') {
        telemetryData.metrics.count++;
        telemetryData.metrics.bytes += totalSize;
        telemetryMetricData.add(totalSize);
        telemetryMetricCount.add(1);
      }
      
      console.log(`[${request._telemetryType}] Response: ${status} (${totalSize} bytes, ${duration}ms)`);
    }
    
    // Track API endpoints
    if (url.includes('/api/')) {
      const endpoint = url.substring(url.indexOf('/api/'));
      telemetryData.endpoints.add(endpoint);
      telemetryByEndpoint.add(1, { endpoint });
    }
  });
  
  // Inject telemetry tracking
  page.evaluateOnNewDocument(() => {
    window.__telemetryOperations = [];
    window.__tracedFunctions = [];
    
    // Override console to capture telemetry operations
    const originalLog = console.log;
    console.log = function(...args) {
      if (args[0] && typeof args[0] === 'string') {
        if (args[0].includes('withSpan') || args[0].includes('createSpan')) {
          window.__telemetryOperations.push(args[0]);
        }
      }
      return originalLog.apply(console, args);
    };
  });
}

async function testInitialPageLoad(page, telemetryData) {
  console.log('Testing initial page load telemetry...');
  
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Check for document load instrumentation
  const documentLoadSpans = telemetryData.traces.spans.filter(s => 
    s.name.includes('documentFetch') || s.name.includes('documentLoad')
  );
  console.log(`Document load spans: ${documentLoadSpans.length}`);
  instrumentedFunctionsCalled.add(documentLoadSpans.length);
}

async function testUserRegistration(page, telemetryData) {
  const timestamp = Date.now();
  const testUser = {
    username: `teltest_${timestamp}`,
    email: `teltest_${timestamp}@example.com`,
    password: 'TelemetryTest123!',
    firstName: 'Telemetry',
    lastName: 'Test'
  };
  
  // Navigate to register
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Test form validation telemetry
  console.log('Testing form validation telemetry...');
  
  // Type invalid data first to trigger validation
  await page.type('input[name="username"]', 'ab', { delay: 50 }); // Too short
  await page.type('input[name="email"]', 'invalid', { delay: 50 }); // Invalid email
  await page.type('input[name="password"]', '123', { delay: 50 }); // Too weak
  
  // Clear and type valid data
  await page.click('input[name="username"]', { clickCount: 3 });
  await page.type('input[name="username"]', testUser.username, { delay: 50 });
  
  await page.click('input[name="email"]', { clickCount: 3 });
  await page.type('input[name="email"]', testUser.email, { delay: 50 });
  
  await page.click('input[name="password"]', { clickCount: 3 });
  await page.type('input[name="password"]', testUser.password, { delay: 50 });
  
  await page.type('input[name="confirmPassword"]', testUser.password, { delay: 50 });
  await page.type('input[name="firstName"]', testUser.firstName, { delay: 50 });
  await page.type('input[name="lastName"]', testUser.lastName, { delay: 50 });
  
  // Submit registration
  console.log('Submitting registration...');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    console.log('Registration completed');
    
    // Check for registration spans
    const registrationSpans = telemetryData.traces.spans.filter(s => 
      s.name.includes('register') || s.name.includes('validation')
    );
    console.log(`Registration spans: ${registrationSpans.length}`);
    instrumentedFunctionsCalled.add(registrationSpans.length);
  } catch (error) {
    console.error('Registration navigation timeout');
  }
  
  await page.waitForTimeout(2000);
  
  // Store user for later tests
  page._testUser = testUser;
}

async function testUserLogin(page, telemetryData) {
  console.log('Testing login telemetry...');
  
  // Logout first if logged in
  const logoutBtn = await page.$('button.logout-btn');
  if (logoutBtn) {
    await logoutBtn.click();
    await page.waitForTimeout(1000);
  }
  
  // Navigate to login
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  const user = page._testUser || { username: 'testuser1', password: 'password123' };
  
  // Fill login form
  await page.type('input[name="username"]', user.username, { delay: 50 });
  await page.type('input[name="password"]', user.password, { delay: 50 });
  
  // Submit login
  console.log('Submitting login...');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    console.log('Login completed');
    
    // Check for login spans
    const loginSpans = telemetryData.traces.spans.filter(s => 
      s.name.includes('login') || s.name.includes('auth')
    );
    console.log(`Login spans: ${loginSpans.length}`);
    instrumentedFunctionsCalled.add(loginSpans.length);
  } catch (error) {
    console.error('Login navigation timeout');
  }
  
  await page.waitForTimeout(2000);
}

async function testProductBrowsing(page, telemetryData) {
  console.log('Testing product browsing telemetry...');
  
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Test product list telemetry
  const products = await page.$$('.product-card');
  console.log(`Found ${products.length} products`);
  
  // Click on multiple products to test navigation telemetry
  for (let i = 0; i < Math.min(3, products.length); i++) {
    const productLink = await products[i].$('a');
    if (productLink) {
      console.log(`Clicking product ${i + 1}...`);
      await productLink.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
      await page.waitForTimeout(1000);
      
      // Go back
      await page.goBack({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
    }
  }
  
  // Check for product browsing spans
  const browsingSpans = telemetryData.traces.spans.filter(s => 
    s.name.includes('product') || s.name.includes('browse')
  );
  console.log(`Product browsing spans: ${browsingSpans.length}`);
  instrumentedFunctionsCalled.add(browsingSpans.length);
}

async function testProductSearch(page, telemetryData) {
  console.log('Testing product search telemetry...');
  
  const searchTerms = ['laptop', 'phone', 'camera'];
  
  for (const term of searchTerms) {
    const searchInput = await page.$('input[placeholder*="Search"]');
    if (searchInput) {
      await searchInput.click({ clickCount: 3 });
      await searchInput.type(term, { delay: 100 });
      
      // Submit search
      await searchInput.press('Enter');
      await page.waitForTimeout(2000);
      
      console.log(`Searched for: ${term}`);
    }
  }
  
  // Check for search spans
  const searchSpans = telemetryData.traces.spans.filter(s => 
    s.name.includes('search') || s.name.includes('filter')
  );
  console.log(`Search spans: ${searchSpans.length}`);
  instrumentedFunctionsCalled.add(searchSpans.length);
}

async function testProductDetails(page, telemetryData) {
  console.log('Testing product detail telemetry...');
  
  // Make sure we're on products page
  if (!page.url().includes('/products')) {
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  }
  
  const products = await page.$$('.product-card');
  if (products.length > 0) {
    const productLink = await products[0].$('a');
    if (productLink) {
      await productLink.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
      await page.waitForTimeout(2000);
      
      // Test various product detail interactions
      // Check for quantity selector
      const quantityInput = await page.$('input[type="number"]');
      if (quantityInput) {
        await quantityInput.click({ clickCount: 3 });
        await quantityInput.type('3');
        console.log('Updated quantity');
      }
      
      // Add to cart
      const addButton = await page.$('button.add-to-cart-btn');
      if (addButton) {
        await addButton.click();
        console.log('Added to cart from detail page');
        await page.waitForTimeout(1000);
      }
    }
  }
  
  // Check for detail page spans
  const detailSpans = telemetryData.traces.spans.filter(s => 
    s.name.includes('detail') || s.name.includes('view')
  );
  console.log(`Product detail spans: ${detailSpans.length}`);
  instrumentedFunctionsCalled.add(detailSpans.length);
}

async function testCartOperations(page, telemetryData) {
  console.log('Testing cart operations telemetry...');
  
  // Add items to cart first
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  const products = await page.$$('.product-card');
  for (let i = 0; i < Math.min(3, products.length); i++) {
    const addButton = await products[i].$('button');
    if (addButton) {
      await addButton.click();
      console.log(`Added item ${i + 1} to cart`);
      await page.waitForTimeout(500);
    }
  }
  
  // Go to cart
  await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Test cart operations
  const cartItems = await page.$$('.cart-item');
  console.log(`Cart has ${cartItems.length} items`);
  
  if (cartItems.length > 0) {
    // Update quantity
    const quantityInput = await cartItems[0].$('input[type="number"]');
    if (quantityInput) {
      await quantityInput.click({ clickCount: 3 });
      await quantityInput.type('5');
      console.log('Updated item quantity');
      await page.waitForTimeout(1000);
    }
    
    // Remove item
    if (cartItems.length > 1) {
      const removeButton = await cartItems[1].$('button:has-text("Remove")');
      if (removeButton) {
        await removeButton.click();
        console.log('Removed item from cart');
        await page.waitForTimeout(1000);
      }
    }
  }
  
  // Check for cart operation spans
  const cartSpans = telemetryData.traces.spans.filter(s => 
    s.name.includes('cart') || s.name.includes('update') || s.name.includes('remove')
  );
  console.log(`Cart operation spans: ${cartSpans.length}`);
  instrumentedFunctionsCalled.add(cartSpans.length);
}

async function testAccountManagement(page, telemetryData) {
  console.log('Testing account management telemetry...');
  
  // Navigate to account page
  const accountLink = await page.$('a[routerlink="/account"]');
  if (accountLink) {
    await accountLink.click();
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
    await page.waitForTimeout(2000);
    
    // Test profile editing
    const editButton = await page.$('button:has-text("Edit Profile")');
    if (editButton) {
      await editButton.click();
      console.log('Editing profile');
      await page.waitForTimeout(1000);
      
      // Update a field
      const firstNameInput = await page.$('input[name="firstName"]');
      if (firstNameInput) {
        await firstNameInput.click({ clickCount: 3 });
        await firstNameInput.type(`Updated${Date.now()}`);
        
        // Save changes
        const saveButton = await page.$('button:has-text("Save")');
        if (saveButton) {
          await saveButton.click();
          console.log('Saved profile changes');
          await page.waitForTimeout(1000);
        }
      }
    }
  }
  
  // Check for account management spans
  const accountSpans = telemetryData.traces.spans.filter(s => 
    s.name.includes('account') || s.name.includes('profile')
  );
  console.log(`Account management spans: ${accountSpans.length}`);
  instrumentedFunctionsCalled.add(accountSpans.length);
}

async function testSignalTelemetry(page, telemetryData) {
  console.log('Testing Angular signal telemetry...');
  
  // Execute JavaScript to check for traced signals
  const signalInfo = await page.evaluate(() => {
    const results = {
      tracedSignals: [],
      tracedComputeds: [],
      tracedEffects: []
    };
    
    // Look for components with telemetry
    const components = document.querySelectorAll('[ng-version]');
    console.log(`Found ${components.length} Angular components`);
    
    // Check window for telemetry operations
    if (window.__telemetryOperations) {
      results.operations = window.__telemetryOperations;
    }
    
    return results;
  });
  
  console.log('Signal telemetry info:', JSON.stringify(signalInfo, null, 2));
}

function generateComprehensiveReport(telemetryData) {
  console.log('\n============ Comprehensive Telemetry Report ============');
  
  console.log('\n--- Telemetry Overview ---');
  console.log(`Total trace requests: ${telemetryData.traces.count}`);
  console.log(`Total trace bytes: ${telemetryData.traces.bytes}`);
  console.log(`Total spans created: ${telemetryData.traces.spans.length}`);
  console.log(`Total metric requests: ${telemetryData.metrics.count}`);
  console.log(`Total metric bytes: ${telemetryData.metrics.bytes}`);
  
  console.log('\n--- Instrumented Operations ---');
  console.log(`Unique operations tracked: ${telemetryData.operations.size}`);
  telemetryData.operations.forEach(op => {
    console.log(`  - ${op}`);
  });
  
  console.log('\n--- API Endpoints Hit ---');
  console.log(`Unique endpoints: ${telemetryData.endpoints.size}`);
  telemetryData.endpoints.forEach(endpoint => {
    console.log(`  - ${endpoint}`);
  });
  
  console.log('\n--- Traced Functions ---');
  console.log(`Unique traced functions: ${telemetryData.tracedFunctions.size}`);
  telemetryData.tracedFunctions.forEach(func => {
    console.log(`  - ${func}`);
  });
  
  console.log('\n--- Span Analysis ---');
  const spansByType = {};
  telemetryData.traces.spans.forEach(span => {
    const type = span.name.split('.')[0];
    spansByType[type] = (spansByType[type] || 0) + 1;
  });
  
  console.log('Spans by type:');
  Object.entries(spansByType).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });
  
  console.log('\n--- Missing Telemetry ---');
  const expectedOperations = [
    'register', 'login', 'logout',
    'loadProducts', 'searchProducts', 'getProductDetails',
    'addToCart', 'updateCartItem', 'removeFromCart',
    'getProfile', 'updateProfile'
  ];
  
  const missingOperations = expectedOperations.filter(op => 
    !Array.from(telemetryData.operations).some(trackedOp => 
      trackedOp.toLowerCase().includes(op.toLowerCase())
    )
  );
  
  if (missingOperations.length > 0) {
    console.log('Expected operations not found:');
    missingOperations.forEach(op => {
      console.log(`  - ${op}`);
    });
  } else {
    console.log('All expected operations were tracked!');
  }
  
  console.log('\n--- Performance Metrics ---');
  const avgSpanDuration = telemetryData.traces.spans.reduce((sum, span) => 
    sum + (span.duration || 0), 0
  ) / telemetryData.traces.spans.length;
  console.log(`Average span duration: ${(avgSpanDuration / 1000000).toFixed(2)}ms`);
  
  console.log('\n======================================================\n');
}

export function teardown(data) {
  console.log('\nTelemetry test completed');
  console.log(`Total telemetry operations tracked: ${telemetryOperations.size}`);
  console.log(`Total traced functions: ${tracedFunctions.size}`);
}