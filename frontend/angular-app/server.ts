import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createProxyMiddleware } from 'http-proxy-middleware';
import bootstrap from './src/main.server';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  console.log('Server dist folder:', serverDistFolder);
  
  // Try different path resolutions
  const fs = require('fs');
  let browserDistFolder = resolve(serverDistFolder, '../browser');
  
  // Check if we're in the container environment
  if (!fs.existsSync(browserDistFolder)) {
    // In container, the structure is /app/dist/ecommerce-frontend/[server|browser]
    browserDistFolder = join(dirname(serverDistFolder), '../browser');
  }
  
  // Final fallback
  if (!fs.existsSync(browserDistFolder)) {
    console.error('Browser dist folder not found at:', browserDistFolder);
    console.error('Current directory:', process.cwd());
    console.error('Directory contents:', fs.readdirSync(dirname(serverDistFolder)));
    browserDistFolder = join(dirname(serverDistFolder), '../browser');
  }
  
  console.log('Browser dist folder:', browserDistFolder);
  const indexHtml = join(browserDistFolder, 'index.csr.html');
  console.log('Index HTML path:', indexHtml);

  const engine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // Serve static files from /browser
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y'
  }));

  // All regular routes use the Angular SSR engine
  server.get('*', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    engine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => res.send(html))
      .catch((err) => next(err));
  });
  // Global error handler
  server.use((err: any, _req: any, res: any, _next: any) => {
    console.error('Server error:', err.stack);
    res.status(500).send('Internal Server Error');
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 80;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();