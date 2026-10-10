/* sw.js — funciona sin internet sin dejar a nadie en una versión vieja.
   Estrategia: RED PRIMERO para todo. Si hay internet, siempre se usa lo último publicado
   (y se actualiza la copia guardada). La copia guardada solo se usa si no hay conexión. */
var CACHE = "gastos-viaje-v11";
var BASE = ["./", "index.html", "styles.css", "app.js", "ui.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    // El HTML se pide salteando la caché HTTP para ver siempre la última versión publicada.
    (req.mode === "navigate" ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(req)).then(function (res) {
      if (res && res.ok) {
        var copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) {
        return r || (req.mode === "navigate" ? caches.match("index.html") : undefined) || Response.error();
      });
    })
  );
});
