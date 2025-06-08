// Wrapper that loads instrumentation before the Angular SSR server
// This avoids bundling issues with require-in-the-middle

// Import instrumentation first
import './src/instrumentation.js';

// Then import and run the Angular SSR server
// @ts-ignore - This path will be correct after compilation
import('./server.mjs').then(() => {
  console.log('Angular SSR server started');
}).catch((err: any) => {
  console.error('Failed to start Angular SSR server:', err);
  process.exit(1);
});