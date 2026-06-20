const CACHE_NAME = 'equip-groceries-v1';
const DYNAMIC_CACHE = 'equip-groceries-dynamic-v1';
const DATA_CACHE = 'equip-groceries-data-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/browser.png',
  '/assets/appLogo.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js'
];

// Google Sheets CSV URLs (same as in your CONFIG)
const DATA_URLS = [
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2NXMDIXvt7qoiQyuUnYBF7ACqPyQZKcRZUm7A32HwnqYYgc4LX_rziLSuo8y_rKVtRsSyY8ntlJ5y/pub?gid=2080112419&single=true&output=csv',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2NXMDIXvt7qoiQyuUnYBF7ACqPyQZKcRZUm7A32HwnqYYgc4LX_rziLSuo8y_rKVtRsSyY8ntlJ5y/pub?gid=1510501093&single=true&output=csv',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2NXMDIXvt7qoiQyuUnYBF7ACqPyQZKcRZUm7A32HwnqYYgc4LX_rziLSuo8y_rKVtRsSyY8ntlJ5y/pub?gid=719955637&single=true&output=csv'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME && 
                cache !== DYNAMIC_CACHE && 
                cache !== DATA_CACHE) {
              console.log('Deleting old cache:', cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - handle offline functionality
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle Google Sheets data requests
  if (DATA_URLS.some(dataUrl => event.request.url.includes(dataUrl.split('/pub?')[1]))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh data
          const responseClone = response.clone();
          caches.open(DATA_CACHE)
            .then(cache => {
              cache.put(event.request, responseClone);
            });
          return response;
        })
        .catch(() => {
          // Return cached data if offline
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('Returning cached data for:', event.request.url);
                return cachedResponse;
              }
              // If no cached data, return a simple error response
              return new Response('', {
                status: 503,
                statusText: 'Service Unavailable - No cached data available'
              });
            });
        })
    );
    return;
  }
  
  // Handle static assets and navigation requests
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Return cached response immediately
          return cachedResponse;
        }
        
        // Fetch from network and cache dynamically
        return fetch(event.request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Cache the new resource
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then(cache => {
                cache.put(event.request, responseClone);
              });
            
            return response;
          })
          .catch(() => {
            // For navigation requests, return the cached index.html
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            // For other requests that fail, return nothing
            return new Response('Offline - Resource not available', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Background sync for data updates
self.addEventListener('sync', event => {
  if (event.tag === 'update-data') {
    event.waitUntil(updateCachedData());
  }
});

// Periodically update cached data
async function updateCachedData() {
  const cache = await caches.open(DATA_CACHE);
  
  for (const dataUrl of DATA_URLS) {
    try {
      const response = await fetch(dataUrl);
      if (response.ok) {
        await cache.put(dataUrl, response);
        console.log('Updated cached data:', dataUrl);
      }
    } catch (error) {
      console.error('Failed to update cached data:', error);
    }
  }
  
  // Notify all clients that new data is available
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'DATA_UPDATED',
      message: 'New data available'
    });
  });
}

// Handle messages from the client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'UPDATE_NOW') {
    updateCachedData();
  }
});

console.log('Equip Groceries Service Worker Active');
