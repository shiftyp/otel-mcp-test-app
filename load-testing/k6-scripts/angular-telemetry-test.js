import { browser } from 'k6/browser';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Metrics for Angular-specific telemetry
const angularSpans = new Counter('angular_spans');
const lifecycleSpans = new Counter('angular_lifecycle_spans');
const signalSpans = new Counter('angular_signal_spans');
const httpInterceptorSpans = new Counter('http_interceptor_spans');
const routerSpans = new Counter('router_navigation_spans');
const componentRenderSpans = new Counter('component_render_spans');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:80';

export const options = {
  scenarios: {
    angularTelemetry: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      options: {
        browser: {
          type: 'chromium',
          headless: false, // Set to false to see browser for debugging
        },
      },
    },
  },
};

export default async function () {
  console.log('\n========== Angular Telemetry Test ==========');
  
  let page;
  const telemetryData = {
    angularOperations: new Set(),
    lifecycleMethods: new Set(),
    signals: new Set(),
    httpCalls: new Set(),
    routerEvents: new Set(),
    components: new Set()
  };
  
  try {
    page = await browser.newPage();
    
    // Enable Angular DevTools API access
    await page.evaluateOnNewDocument(() => {
      window.__ngTelemetryTest = true;
    });
    
    // Setup Angular-specific monitoring
    await setupAngularMonitoring(page, telemetryData);
    
    // Execute Angular-specific test scenarios
    console.log('\n--- Testing Angular App Bootstrap ---');
    await testAngularBootstrap(page, telemetryData);
    
    console.log('\n--- Testing Component Lifecycle ---');
    await testComponentLifecycle(page, telemetryData);
    
    console.log('\n--- Testing Angular Signals ---');
    await testAngularSignals(page, telemetryData);
    
    console.log('\n--- Testing HTTP Interceptors ---');
    await testHttpInterceptors(page, telemetryData);
    
    console.log('\n--- Testing Router Navigation ---');
    await testRouterNavigation(page, telemetryData);
    
    console.log('\n--- Testing Reactive Forms ---');
    await testReactiveForms(page, telemetryData);
    
    console.log('\n--- Testing Component Interactions ---');
    await testComponentInteractions(page, telemetryData);
    
    // Wait for telemetry flush
    await page.waitForTimeout(5000);
    
    // Generate Angular-specific report
    generateAngularReport(telemetryData);
    
  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    if (page) {
      await page.close();
    }
  }
}

function setupAngularMonitoring(page, telemetryData) {
  // Monitor console for Angular telemetry
  page.on('console', msg => {
    const text = msg.text();
    
    // Track Angular-specific telemetry
    if (text.includes('Angular')) {
      console.log(`[Angular] ${text}`);
    }
    
    // Track lifecycle methods
    if (text.includes('ngOnInit') || text.includes('ngOnDestroy') || 
        text.includes('ngOnChanges') || text.includes('ngAfterViewInit')) {
      const match = text.match(/(ng\w+)/);
      if (match) {
        telemetryData.lifecycleMethods.add(match[1]);
        lifecycleSpans.add(1);
      }
    }
    
    // Track signals
    if (text.includes('signal') || text.includes('computed') || text.includes('effect')) {
      telemetryData.signals.add(text);
      signalSpans.add(1);
    }
    
    // Track component operations
    if (text.includes('Component')) {
      const componentMatch = text.match(/(\w+Component)/);
      if (componentMatch) {
        telemetryData.components.add(componentMatch[1]);
        componentRenderSpans.add(1);
      }
    }
  });
  
  // Inject Angular telemetry helpers
  page.evaluateOnNewDocument(() => {
    // Helper to access Angular internals
    window.__getAngularInfo = () => {
      const results = {
        components: [],
        services: [],
        signals: [],
        routes: []
      };
      
      // Try to access Angular DevTools API
      if (window.ng) {
        try {
          const allComponents = window.getAllAngularRootElements?.() || [];
          results.componentCount = allComponents.length;
        } catch (e) {
          console.warn('Could not access Angular DevTools:', e);
        }
      }
      
      // Track telemetry service usage
      window.__telemetryServiceCalls = [];
      
      return results;
    };
    
    // Override telemetry service methods to track calls
    const originalWithSpan = window.TelemetryService?.prototype?.withSpan;
    if (originalWithSpan) {
      window.TelemetryService.prototype.withSpan = function(name, fn, attributes) {
        window.__telemetryServiceCalls.push({ type: 'withSpan', name, attributes });
        return originalWithSpan.call(this, name, fn, attributes);
      };
    }
  });
  
  // Track network requests with Angular context
  page.on('request', request => {
    const url = request.url();
    const headers = request.headers();
    
    // Check for trace context headers (added by HTTP interceptor)
    if (headers['traceparent'] || headers['x-trace-id']) {
      telemetryData.httpCalls.add(url);
      httpInterceptorSpans.add(1);
      console.log(`[HTTP Interceptor] ${request.method()} ${url}`);
    }
  });
}

async function testAngularBootstrap(page, telemetryData) {
  console.log('Loading Angular application...');
  
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  
  // Wait for Angular to bootstrap
  await page.waitForFunction(() => {
    return window.getAllAngularRootElements?.()?.length > 0 || 
           document.querySelector('[ng-version]') !== null;
  }, { timeout: 10000 });
  
  console.log('Angular application loaded');
  
  // Check Angular version
  const ngVersion = await page.evaluate(() => {
    const versionAttr = document.querySelector('[ng-version]');
    return versionAttr?.getAttribute('ng-version') || 'unknown';
  });
  console.log(`Angular version: ${ngVersion}`);
  
  // Count initial components
  const componentInfo = await page.evaluate(() => {
    const components = document.querySelectorAll('[_nghost-ng-c\\d+], [_ngcontent-ng-c\\d+]');
    const uniqueComponents = new Set();
    components.forEach(el => {
      const match = el.outerHTML.match(/_nghost-ng-c(\d+)|_ngcontent-ng-c(\d+)/);
      if (match) {
        uniqueComponents.add(match[1] || match[2]);
      }
    });
    return {
      totalElements: components.length,
      uniqueComponents: uniqueComponents.size
    };
  });
  
  console.log(`Found ${componentInfo.uniqueComponents} unique Angular components`);
  angularSpans.add(componentInfo.uniqueComponents);
}

async function testComponentLifecycle(page, telemetryData) {
  console.log('Testing component lifecycle telemetry...');
  
  // Navigate to trigger component lifecycle
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Navigate away to trigger destroy
  await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Go back to trigger init again
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  console.log(`Lifecycle methods tracked: ${telemetryData.lifecycleMethods.size}`);
}

async function testAngularSignals(page, telemetryData) {
  console.log('Testing Angular signals telemetry...');
  
  // Test register component which uses signals
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Interact with form to trigger signal updates
  const inputs = [
    { name: 'username', value: 'signaltest' },
    { name: 'email', value: 'signal@test.com' },
    { name: 'password', value: 'Signal123!' }
  ];
  
  for (const input of inputs) {
    const field = await page.$(`input[name="${input.name}"]`);
    if (field) {
      await field.type(input.value, { delay: 50 });
      console.log(`Updated signal for ${input.name}`);
      await page.waitForTimeout(200);
    }
  }
  
  // Check if signals are being tracked
  const signalInfo = await page.evaluate(() => {
    // Look for signal-related console logs or telemetry
    return window.__telemetryServiceCalls?.filter(call => 
      call.name?.includes('signal') || call.name?.includes('computed')
    ) || [];
  });
  
  console.log(`Signal operations tracked: ${signalInfo.length}`);
}

async function testHttpInterceptors(page, telemetryData) {
  console.log('Testing HTTP interceptor telemetry...');
  
  // Trigger various API calls
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Search to trigger API call
  const searchInput = await page.$('input[placeholder*="Search"]');
  if (searchInput) {
    await searchInput.type('laptop', { delay: 50 });
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);
  }
  
  // Login to trigger auth API call
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  const usernameInput = await page.$('input[name="username"]');
  const passwordInput = await page.$('input[name="password"]');
  
  if (usernameInput && passwordInput) {
    await usernameInput.type('testuser', { delay: 50 });
    await passwordInput.type('password', { delay: 50 });
    
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }
  }
  
  console.log(`HTTP calls with trace context: ${telemetryData.httpCalls.size}`);
}

async function testRouterNavigation(page, telemetryData) {
  console.log('Testing router navigation telemetry...');
  
  const routes = [
    { path: '/', name: 'Home' },
    { path: '/products', name: 'Products' },
    { path: '/cart', name: 'Cart' },
    { path: '/login', name: 'Login' },
    { path: '/register', name: 'Register' }
  ];
  
  for (const route of routes) {
    console.log(`Navigating to ${route.name}...`);
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    
    // Track router events
    const routerEvents = await page.evaluate(() => {
      return window.__telemetryServiceCalls?.filter(call => 
        call.name?.includes('router') || call.name?.includes('navigation')
      ) || [];
    });
    
    if (routerEvents.length > 0) {
      telemetryData.routerEvents.add(route.path);
      routerSpans.add(1);
    }
  }
  
  console.log(`Router navigation events tracked: ${telemetryData.routerEvents.size}`);
}

async function testReactiveForms(page, telemetryData) {
  console.log('Testing reactive forms telemetry...');
  
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Test form validation telemetry
  const testCases = [
    { field: 'username', invalid: 'ab', valid: 'validuser' },
    { field: 'email', invalid: 'notanemail', valid: 'valid@email.com' },
    { field: 'password', invalid: '123', valid: 'ValidPass123!' }
  ];
  
  for (const test of testCases) {
    const input = await page.$(`input[name="${test.field}"]`);
    if (input) {
      // Type invalid value
      await input.click({ clickCount: 3 });
      await input.type(test.invalid, { delay: 50 });
      await page.click('body'); // Blur to trigger validation
      await page.waitForTimeout(300);
      
      // Check for validation telemetry
      const validationSpan = await page.evaluate((fieldName) => {
        return window.__telemetryServiceCalls?.find(call => 
          call.name?.includes('validation') && call.name?.includes(fieldName)
        );
      }, test.field);
      
      if (validationSpan) {
        console.log(`Validation telemetry for ${test.field}: tracked`);
      }
      
      // Type valid value
      await input.click({ clickCount: 3 });
      await input.type(test.valid, { delay: 50 });
      await page.waitForTimeout(300);
    }
  }
}

async function testComponentInteractions(page, telemetryData) {
  console.log('Testing component interaction telemetry...');
  
  // Test product list interactions
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Test hover effects
  const products = await page.$$('.product-card');
  for (let i = 0; i < Math.min(3, products.length); i++) {
    await products[i].hover();
    console.log(`Hovered over product ${i + 1}`);
    await page.waitForTimeout(200);
  }
  
  // Test click interactions
  if (products.length > 0) {
    const firstProduct = products[0];
    const addButton = await firstProduct.$('button');
    if (addButton) {
      await addButton.click();
      console.log('Clicked add to cart button');
      await page.waitForTimeout(500);
    }
  }
  
  // Test cart badge update
  const cartBadge = await page.$('.cart-badge, .badge');
  if (cartBadge) {
    const badgeText = await cartBadge.textContent();
    console.log(`Cart badge shows: ${badgeText}`);
  }
  
  // Check for interaction telemetry
  const interactionSpans = await page.evaluate(() => {
    return window.__telemetryServiceCalls?.filter(call => 
      call.name?.includes('click') || 
      call.name?.includes('hover') || 
      call.name?.includes('interaction')
    ) || [];
  });
  
  console.log(`Component interactions tracked: ${interactionSpans.length}`);
}

function generateAngularReport(telemetryData) {
  console.log('\n============ Angular Telemetry Report ============');
  
  console.log('\n--- Angular Operations ---');
  console.log(`Unique Angular operations: ${telemetryData.angularOperations.size}`);
  
  console.log('\n--- Lifecycle Methods ---');
  console.log(`Lifecycle methods tracked: ${telemetryData.lifecycleMethods.size}`);
  telemetryData.lifecycleMethods.forEach(method => {
    console.log(`  - ${method}`);
  });
  
  console.log('\n--- Signal Operations ---');
  console.log(`Signal operations: ${telemetryData.signals.size}`);
  
  console.log('\n--- HTTP Interceptor ---');
  console.log(`HTTP calls with trace context: ${telemetryData.httpCalls.size}`);
  const endpoints = Array.from(telemetryData.httpCalls).map(url => {
    const urlObj = new URL(url);
    return urlObj.pathname;
  });
  console.log('Traced endpoints:');
  [...new Set(endpoints)].forEach(endpoint => {
    console.log(`  - ${endpoint}`);
  });
  
  console.log('\n--- Router Navigation ---');
  console.log(`Routes navigated: ${telemetryData.routerEvents.size}`);
  telemetryData.routerEvents.forEach(route => {
    console.log(`  - ${route}`);
  });
  
  console.log('\n--- Components ---');
  console.log(`Unique components tracked: ${telemetryData.components.size}`);
  telemetryData.components.forEach(component => {
    console.log(`  - ${component}`);
  });
  
  console.log('\n--- Coverage Summary ---');
  const features = [
    { name: 'Component Lifecycle', tracked: telemetryData.lifecycleMethods.size > 0 },
    { name: 'Angular Signals', tracked: telemetryData.signals.size > 0 },
    { name: 'HTTP Interceptors', tracked: telemetryData.httpCalls.size > 0 },
    { name: 'Router Navigation', tracked: telemetryData.routerEvents.size > 0 },
    { name: 'Component Rendering', tracked: telemetryData.components.size > 0 }
  ];
  
  const covered = features.filter(f => f.tracked).length;
  console.log(`Features covered: ${covered}/${features.length} (${(covered/features.length*100).toFixed(0)}%)`);
  
  features.forEach(feature => {
    console.log(`  ${feature.tracked ? '✓' : '✗'} ${feature.name}`);
  });
  
  console.log('\n==============================================\n');
}

export function teardown(data) {
  console.log('\nAngular telemetry test completed');
}