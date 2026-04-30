const CACHE_NAME = "construct-viewer-webgpu-v1";
const APP_ASSETS = [
    "./",
    "./cv.html",
    "./css/cv.css",
    "./js/cv.js",
    "./manifest.json",
    "./img/favicon.svg",
    "./img/icon.svg",
    "./img/icon-192.png",
    "./img/icon-512.png"
];

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                return cache.addAll(APP_ASSETS);
            })
            .then(function () {
                return self.skipWaiting();
            })
    );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (cacheNames) {
                return Promise.all(
                    cacheNames
                        .filter(function (cacheName) {
                            return cacheName !== CACHE_NAME;
                        })
                        .map(function (cacheName) {
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

self.addEventListener("fetch", function (event) {
    if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(function (cachedResponse) {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then(function (response) {
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        const responseCopy = response.clone();
                        caches.open(CACHE_NAME)
                            .then(function (cache) {
                                cache.put(event.request, responseCopy);
                            });

                        return response;
                    });
            })
            .catch(function () {
                if (event.request.mode === "navigate") {
                    return caches.match("./cv.html");
                }

                return undefined;
            })
    );
});
