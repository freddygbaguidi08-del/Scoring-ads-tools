// UrbanElectroStore Cockpit — Service Worker
// Version: incrémente pour forcer la mise à jour du cache
const CACHE_VERSION = "cockpit-v1";
const CACHE_STATIC  = CACHE_VERSION + "-static";
const CACHE_DYNAMIC = CACHE_VERSION + "-dynamic";

// Fichiers à mettre en cache immédiatement au premier chargement
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./icons/apple-touch-icon.png"
];

// CDN externe (Chart.js) — cache dynamique
const CDN_PATTERNS = [
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

// ============================================================
// INSTALL — précharge les fichiers essentiels
// ============================================================
self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      console.log("[SW] Pre-caching static assets");
      return cache.addAll(PRECACHE_URLS).catch(function(err) {
        console.warn("[SW] Pre-cache partial failure:", err);
      });
    }).then(function() {
      return self.skipWaiting(); // Active immédiatement sans attendre
    })
  );
});

// ============================================================
// ACTIVATE — supprime les anciens caches
// ============================================================
self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_STATIC && key !== CACHE_DYNAMIC;
        }).map(function(key) {
          console.log("[SW] Deleting old cache:", key);
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim(); // Prend contrôle immédiatement
    })
  );
});

// ============================================================
// FETCH — stratégie cache selon le type de ressource
// ============================================================
self.addEventListener("fetch", function(event) {
  var url = event.request.url;

  // Ne pas intercepter les API calls (JSONBin, Groq, Gemini, WooCommerce...)
  if (isAPICall(url)) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ error: "offline", message: "Pas de connexion internet. Les donnees locales sont utilisees." }),
          { headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // CDN externe — Network first, cache fallback
  if (isCDN(url)) {
    event.respondWith(networkFirstWithCache(event.request, CACHE_DYNAMIC));
    return;
  }

  // Fichiers locaux — Cache first, network fallback
  event.respondWith(cacheFirstWithNetwork(event.request));
});

// ============================================================
// STRATÉGIES
// ============================================================

// Cache first : sert depuis le cache, met à jour en arrière-plan
function cacheFirstWithNetwork(request) {
  return caches.match(request).then(function(cached) {
    var networkFetch = fetch(request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_STATIC).then(function(cache) {
          cache.put(request, clone);
        });
      }
      return response;
    }).catch(function() {
      return null;
    });
    // Retourne le cache immédiatement, met à jour en fond
    return cached || networkFetch;
  });
}

// Network first : essaie le réseau, tombe sur le cache si offline
function networkFirstWithCache(request, cacheName) {
  return fetch(request).then(function(response) {
    if (response && response.status === 200) {
      var clone = response.clone();
      caches.open(cacheName).then(function(cache) {
        cache.put(request, clone);
      });
    }
    return response;
  }).catch(function() {
    return caches.match(request);
  });
}

// ============================================================
// HELPERS
// ============================================================
function isAPICall(url) {
  var apiDomains = [
    "api.jsonbin.io",
    "api.groq.com",
    "generativelanguage.googleapis.com",
    "api.anthropic.com",
    "wp-json"  // WooCommerce REST API
  ];
  return apiDomains.some(function(domain) {
    return url.indexOf(domain) >= 0;
  });
}

function isCDN(url) {
  return CDN_PATTERNS.some(function(pattern) {
    return url.indexOf(pattern) >= 0;
  });
}

// ============================================================
// MESSAGE — permet de forcer la mise à jour depuis l'app
// ============================================================
self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        return caches.delete(key);
      }));
    }).then(function() {
      event.source.postMessage({ type: "CACHE_CLEARED" });
    });
  }
});
