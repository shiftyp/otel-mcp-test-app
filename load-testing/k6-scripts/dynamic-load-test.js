import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const apiTrend = new Trend('api_response_time');

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const FLAGD_URL = __ENV.FLAGD_URL || 'http://localhost:8013';
const USERS_API = `${BASE_URL}:3001/api/users`;
const PRODUCTS_API = `${BASE_URL}:3002/api/products`;

// Global feature flags cache
let featureFlags = {};

// Dynamic test configuration based on feature flags
export function options() {
  // Fetch initial configuration from flagd
  const configFlags = getFeatureFlags({
    testType: __ENV.TEST_TYPE || 'normal',
    environment: __ENV.ENVIRONMENT || 'test'
  });
  
  // Build dynamic scenarios based on flags
  const scenarios = {};
  
  // Load test configuration
  const loadTestConfig = configFlags.loadTestConfiguration || {
    smokeVUs: 1,
    loadVUs: 50,
    stressVUs: 200,
    smokeDuration: '1m',
    loadDuration: '5m',
    stressDuration: '10m'
  };
  
  // Smoke test
  if (configFlags.smokeTestEnabled !== false) {
    scenarios.smoke = {
      executor: 'constant-vus',
      vus: loadTestConfig.smokeVUs,
      duration: loadTestConfig.smokeDuration,
      tags: { scenario: 'smoke' },
    };
  }
  
  // Load test
  if (configFlags.loadTestEnabled !== false) {
    scenarios.load = {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: loadTestConfig.loadVUs },
        { duration: loadTestConfig.loadDuration, target: loadTestConfig.loadVUs },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { scenario: 'load' },
    };
  }
  
  // Stress test - controlled by feature flag
  if (configFlags.stressTestEnabled === true) {
    scenarios.stress = {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: loadTestConfig.stressVUs / 2 },
        { duration: '3m', target: loadTestConfig.stressVUs / 2 },
        { duration: '2m', target: loadTestConfig.stressVUs },
        { duration: loadTestConfig.stressDuration, target: loadTestConfig.stressVUs },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { scenario: 'stress' },
      startTime: configFlags.stressTestDelay || '10m',
    };
  }
  
  // Chaos test - controlled by feature flag
  if (configFlags.chaosTestEnabled === true) {
    scenarios.chaos = {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 200 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 300 },
        { duration: '30s', target: 0 },
      ],
      tags: { scenario: 'chaos' },
    };
  }
  
  // Dynamic thresholds based on flags
  const thresholds = {};
  
  const performanceTargets = configFlags.performanceTargets || {
    p95Duration: 500,
    p99Duration: 1000,
    errorRate: 0.1,
    apiP95: 400
  };
  
  thresholds.http_req_duration = [
    `p(95)<${performanceTargets.p95Duration}`,
    `p(99)<${performanceTargets.p99Duration}`
  ];
  thresholds.errors = [`rate<${performanceTargets.errorRate}`];
  thresholds.api_response_time = [`p(95)<${performanceTargets.apiP95}`];
  
  return {
    scenarios,
    thresholds,
  };
}

// Fetch feature flags from flagd
function getFeatureFlags(context) {
  try {
    const payload = JSON.stringify({
      context: {
        ...context,
        timestamp: new Date().toISOString(),
        k6Version: __ENV.K6_VERSION || '0.45.0',
      }
    });
    
    const res = http.post(
      `${FLAGD_URL}/schema.v1.Service/ResolveAll`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: '5s',
      }
    );
    
    if (res.status === 200) {
      const flags = JSON.parse(res.body);
      console.log('Feature flags loaded:', Object.keys(flags).length);
      return flags;
    }
  } catch (error) {
    console.error('Failed to fetch feature flags:', error);
  }
  
  // Return default flags if fetch fails
  return {
    loadTestConfiguration: {
      smokeVUs: 1,
      loadVUs: 50,
      stressVUs: 200,
    },
    performanceTargets: {
      p95Duration: 500,
      p99Duration: 1000,
    },
    scenarioWeights: {
      browse: 30,
      search: 20,
      purchase: 10,
      heavyCart: 15,
      rapidActions: 10,
      mobileUser: 15,
    }
  };
}

// Get headers with dynamic configuration
function getHeaders(context = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  
  // Add context headers for optimization triggering
  if (context.cartSize) {
    headers['X-Cart-Size'] = context.cartSize.toString();
  }
  if (context.scrollDepth) {
    headers['X-Scroll-Depth'] = context.scrollDepth.toString();
  }
  if (context.requestRate) {
    headers['X-Request-Rate'] = context.requestRate.toString();
  }
  if (context.concurrentRequests) {
    headers['X-Concurrent-Requests'] = context.concurrentRequests.toString();
  }
  if (context.userId) {
    headers['X-User-Id'] = context.userId;
  }
  
  // Dynamic user agent based on flags
  const userAgentConfig = featureFlags.userAgentDistribution || {
    desktop: 60,
    mobile: 30,
    tablet: 10
  };
  
  const rand = Math.random() * 100;
  if (rand < userAgentConfig.mobile) {
    headers['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  } else if (rand < userAgentConfig.mobile + userAgentConfig.tablet) {
    headers['User-Agent'] = 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15';
  } else {
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }
  
  return headers;
}

// Main test function
export default function () {
  // Build context for this VU
  const context = {
    testType: __ENV.TEST_TYPE || 'normal',
    hour: new Date().getHours(),
    concurrentRequests: __VU,
    sessionId: `session_${__VU}_${Date.now()}`,
    userId: `user_${__VU}`,
    iteration: __ITER,
    scenario: __ENV.SCENARIO_NAME,
  };
  
  // Get scenario weights from feature flags
  const scenarioWeights = featureFlags.scenarioWeights || {
    browse: 30,
    search: 20,
    purchase: 10,
    heavyCart: 15,
    rapidActions: 10,
    mobileUser: 15,
  };
  
  // Calculate total weight
  const totalWeight = Object.values(scenarioWeights).reduce((sum, weight) => sum + weight, 0);
  
  // Select scenario based on weights
  let rand = Math.random() * totalWeight;
  let selectedScenario = 'browse';
  
  for (const [scenario, weight] of Object.entries(scenarioWeights)) {
    rand -= weight;
    if (rand <= 0) {
      selectedScenario = scenario;
      break;
    }
  }
  
  // Execute scenario
  switch (selectedScenario) {
    case 'browse':
      browseProducts(context);
      break;
    case 'search':
      searchProducts(context);
      break;
    case 'purchase':
      purchaseFlow(context);
      break;
    case 'heavyCart':
      heavyCartScenario(context);
      break;
    case 'rapidActions':
      rapidActionsScenario(context);
      break;
    case 'mobileUser':
      mobileUserScenario(context);
      break;
    default:
      browseProducts(context);
  }
  
  // Dynamic sleep based on flags
  const sleepConfig = featureFlags.sleepConfiguration || {
    min: 1,
    max: 3,
    distribution: 'uniform'
  };
  
  if (sleepConfig.distribution === 'exponential') {
    // Exponential distribution for more realistic user behavior
    const avgSleep = (sleepConfig.min + sleepConfig.max) / 2;
    sleep(-Math.log(1 - Math.random()) * avgSleep);
  } else {
    // Uniform distribution
    sleep(sleepConfig.min + Math.random() * (sleepConfig.max - sleepConfig.min));
  }
}

// Browse products scenario
function browseProducts(context) {
  // Dynamic request rate simulation
  const requestRate = calculateRequestRate();
  context.requestRate = requestRate;
  
  const productsRes = http.get(PRODUCTS_API, {
    headers: getHeaders(context),
    tags: { name: 'GetProducts' },
  });
  
  check(productsRes, {
    'products status is 200': (r) => r.status === 200,
    'products returned': (r) => JSON.parse(r.body).products.length > 0,
  });
  
  errorRate.add(productsRes.status !== 200);
  apiTrend.add(productsRes.timings.duration);
  
  if (productsRes.status === 200) {
    const products = JSON.parse(productsRes.body).products;
    
    // Dynamic product view depth based on flags
    const viewDepth = featureFlags.productViewDepth || { min: 1, max: 3 };
    const viewCount = Math.floor(viewDepth.min + Math.random() * (viewDepth.max - viewDepth.min));
    
    for (let i = 0; i < Math.min(viewCount, products.length); i++) {
      const product = randomItem(products);
      const detailRes = http.get(`${PRODUCTS_API}/${product.id}`, {
        headers: getHeaders(context),
        tags: { name: 'GetProductDetail' },
      });
      
      check(detailRes, {
        'product detail status is 200': (r) => r.status === 200,
      });
      
      sleep(0.5 + Math.random() * 0.5);
    }
  }
}

// Search products with dynamic terms
function searchProducts(context) {
  // Get search terms from feature flags
  const searchConfig = featureFlags.searchConfiguration || {
    terms: ['laptop', 'phone', 'headphones', 'camera', 'watch'],
    multiWordProbability: 0.2,
    typosProbability: 0.05
  };
  
  let searchTerm = randomItem(searchConfig.terms);
  
  // Add multi-word searches based on probability
  if (Math.random() < searchConfig.multiWordProbability) {
    searchTerm += ' ' + randomItem(['pro', 'max', 'mini', 'plus', 'ultra']);
    context.searchType = 'multi-word';
  }
  
  // Add typos based on probability
  if (Math.random() < searchConfig.typosProbability) {
    const chars = searchTerm.split('');
    const idx = Math.floor(Math.random() * chars.length);
    chars[idx] = String.fromCharCode(chars[idx].charCodeAt(0) + 1);
    searchTerm = chars.join('');
    context.searchType = 'typo';
  }
  
  const searchRes = http.get(`${PRODUCTS_API}?search=${encodeURIComponent(searchTerm)}`, {
    headers: getHeaders(context),
    tags: { name: 'SearchProducts', searchType: context.searchType || 'normal' },
  });
  
  check(searchRes, {
    'search status is 200': (r) => r.status === 200,
    'search has results': (r) => JSON.parse(r.body).products.length >= 0,
  });
  
  errorRate.add(searchRes.status !== 200);
}

// Heavy cart scenario with dynamic sizes
function heavyCartScenario(context) {
  // Get cart configuration from flags
  const cartConfig = featureFlags.heavyCartConfiguration || {
    sizes: [6, 8, 10, 12, 15],
    addDelay: 0.1,
    triggerOptimization: true
  };
  
  const itemCount = randomItem(cartConfig.sizes);
  context.cartSize = itemCount;
  
  // Create user
  const userPayload = JSON.stringify({
    email: `heavy${Date.now()}@k6test.com`,
    password: 'testpass123',
    firstName: 'Heavy',
    lastName: 'Shopper',
  });
  
  http.post(USERS_API, userPayload, {
    headers: getHeaders(context),
    tags: { name: 'CreateHeavyUser' },
  });
  
  // Get products with dynamic limit
  const productsRes = http.get(`${PRODUCTS_API}?limit=${Math.min(itemCount * 2, 50)}`, {
    headers: getHeaders(context),
    tags: { name: 'GetManyProducts' },
  });
  
  if (productsRes.status === 200) {
    const products = JSON.parse(productsRes.body).products;
    
    // Add items to cart with configurable delay
    for (let i = 0; i < Math.min(itemCount, products.length); i++) {
      sleep(cartConfig.addDelay);
      
      context.cartSize = i + 1;
      
      http.post(`${PRODUCTS_API}/${products[i].id}/inventory`, 
        JSON.stringify({ action: 'reserve', quantity: 1 }),
        {
          headers: getHeaders(context),
          tags: { name: 'AddToHeavyCart', cartSize: context.cartSize.toString() },
        }
      );
    }
  }
}

// Rapid actions scenario with dynamic patterns
function rapidActionsScenario(context) {
  const rapidConfig = featureFlags.rapidActionsConfiguration || {
    patterns: [
      ['reserve', 'reserve', 'release', 'reserve'],
      ['reserve', 'release', 'reserve', 'release'],
      ['reserve', 'reserve', 'reserve', 'release', 'release']
    ],
    targetProducts: 100,
    delayBetweenActions: 0
  };
  
  const product = 'product-' + Math.floor(Math.random() * rapidConfig.targetProducts);
  const actions = randomItem(rapidConfig.patterns);
  
  actions.forEach((action, index) => {
    http.post(`${PRODUCTS_API}/${product}/inventory`,
      JSON.stringify({ action, quantity: 1 }),
      {
        headers: getHeaders(context),
        tags: { 
          name: 'RapidInventoryAction',
          sequence: index.toString(),
          pattern: actions.join('-')
        },
      }
    );
    
    if (rapidConfig.delayBetweenActions > 0) {
      sleep(rapidConfig.delayBetweenActions);
    }
  });
}

// Mobile user scenario with dynamic behavior
function mobileUserScenario(context) {
  const mobileConfig = featureFlags.mobileConfiguration || {
    scrollDepth: { min: 3, max: 7 },
    scrollDelay: 0.5,
    corsTestEnabled: true,
    userAgents: [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      'Mozilla/5.0 (Android 11; Mobile; rv:89.0) Gecko/89.0 Firefox/89.0'
    ]
  };
  
  const mobileHeaders = {
    ...getHeaders(context),
    'User-Agent': randomItem(mobileConfig.userAgents),
    'X-Requested-With': 'XMLHttpRequest',
  };
  
  if (mobileConfig.corsTestEnabled) {
    mobileHeaders['Origin'] = 'http://localhost:4000';
  }
  
  // Mobile user flow
  const productsRes = http.get(PRODUCTS_API, {
    headers: mobileHeaders,
    tags: { name: 'MobileGetProducts' },
  });
  
  check(productsRes, {
    'mobile products status OK': (r) => r.status === 200,
    'no CORS error': (r) => !r.headers['Access-Control-Allow-Origin']?.includes('null'),
  });
  
  // Dynamic scrolling depth
  const maxScroll = Math.floor(
    mobileConfig.scrollDepth.min + 
    Math.random() * (mobileConfig.scrollDepth.max - mobileConfig.scrollDepth.min)
  );
  
  for (let page = 1; page <= maxScroll; page++) {
    sleep(mobileConfig.scrollDelay);
    
    context.scrollDepth = page;
    
    http.get(`${PRODUCTS_API}?page=${page}`, {
      headers: { ...mobileHeaders, ...getHeaders(context) },
      tags: { name: 'MobileScroll', scrollDepth: page.toString() },
    });
  }
}

// Purchase flow with dynamic behavior
function purchaseFlow(context) {
  const purchaseConfig = featureFlags.purchaseConfiguration || {
    checkoutDelay: { min: 2, max: 4 },
    completionRate: 0.7,
    abandonmentReasons: ['price', 'shipping', 'timeout', 'error']
  };
  
  // Create user
  const userPayload = JSON.stringify({
    email: `user${Date.now()}@k6test.com`,
    password: 'testpass123',
    firstName: 'Load',
    lastName: 'Test',
  });
  
  const createUserRes = http.post(USERS_API, userPayload, {
    headers: getHeaders(context),
    tags: { name: 'CreateUser' },
  });
  
  check(createUserRes, {
    'user created': (r) => r.status === 201,
  });
  
  if (createUserRes.status === 201) {
    const user = JSON.parse(createUserRes.body);
    context.userId = user.id;
    
    // Browse products
    const productsRes = http.get(PRODUCTS_API, {
      headers: getHeaders(context),
      tags: { name: 'GetProductsForPurchase' },
    });
    
    if (productsRes.status === 200) {
      const products = JSON.parse(productsRes.body).products;
      
      if (products.length > 0) {
        const product = randomItem(products);
        
        // Reserve inventory
        const reserveRes = http.post(
          `${PRODUCTS_API}/${product.id}/inventory`,
          JSON.stringify({ action: 'reserve', quantity: 1 }),
          {
            headers: getHeaders(context),
            tags: { name: 'ReserveInventory' },
          }
        );
        
        check(reserveRes, {
          'inventory reserved': (r) => r.status === 200,
        });
        
        // Dynamic checkout delay
        const checkoutDelay = purchaseConfig.checkoutDelay.min + 
          Math.random() * (purchaseConfig.checkoutDelay.max - purchaseConfig.checkoutDelay.min);
        sleep(checkoutDelay);
        
        // Complete or abandon based on configuration
        if (Math.random() < purchaseConfig.completionRate) {
          http.post(
            `${PRODUCTS_API}/${product.id}/inventory`,
            JSON.stringify({ action: 'release', quantity: 1 }),
            {
              headers: getHeaders(context),
              tags: { name: 'CompleteCheckout' },
            }
          );
        } else {
          // Track abandonment reason
          const reason = randomItem(purchaseConfig.abandonmentReasons);
          http.post(
            `${PRODUCTS_API}/${product.id}/inventory`,
            JSON.stringify({ action: 'release', quantity: 1 }),
            {
              headers: getHeaders(context),
              tags: { name: 'AbandonCheckout', reason },
            }
          );
        }
      }
    }
  }
}

// Helper function to calculate dynamic request rate
function calculateRequestRate() {
  // Simulate varying request rates throughout the test
  const minute = Math.floor(__ITER / 60);
  const baseRate = 50;
  
  // Add some variance
  const variance = Math.sin(minute * 0.1) * 30;
  const spike = (minute % 5 === 0) ? Math.random() * 100 : 0;
  
  return Math.max(1, Math.floor(baseRate + variance + spike));
}

// Setup function - fetch initial feature flags
export function setup() {
  console.log('Starting dynamic load test...');
  
  // Fetch initial feature flags
  featureFlags = getFeatureFlags({
    testType: __ENV.TEST_TYPE || 'normal',
    environment: __ENV.ENVIRONMENT || 'test',
    testId: Date.now().toString(),
  });
  
  console.log('Feature flags loaded:', featureFlags);
  
  // Verify services are available
  const healthChecks = [
    { url: `${BASE_URL}:3001/health`, name: 'User Service' },
    { url: `${BASE_URL}:3002/health`, name: 'Product Service' },
  ];
  
  if (featureFlags.checkFlagdHealth !== false) {
    healthChecks.push({ url: `${FLAGD_URL}/health`, name: 'Feature Flag Service' });
  }
  
  healthChecks.forEach((hc) => {
    const res = http.get(hc.url, { timeout: '5s' });
    if (res.status !== 200) {
      if (hc.name === 'Feature Flag Service' && featureFlags.allowFlagdFailure) {
        console.warn(`${hc.name} is not healthy, continuing with defaults`);
      } else {
        throw new Error(`${hc.name} is not healthy`);
      }
    }
  });
  
  return { 
    startTime: Date.now(),
    featureFlags: featureFlags 
  };
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Dynamic load test completed in ${duration}s`);
  
  // Log feature flag usage summary
  console.log('Feature flags used:', Object.keys(data.featureFlags).join(', '));
}