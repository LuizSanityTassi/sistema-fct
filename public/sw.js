// Service worker do Sistema FCT: deixa o sistema instalável como aplicativo e mostra uma página amigável quando
// o celular está sem internet. NÃO guarda páginas nem dados (tudo é sigiloso e muda o tempo todo): só a
// página "sem conexão". Para trocar o conteúdo dela, suba a versão do CACHE.
const CACHE = "fct-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(OFFLINE, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

// só a navegação entre telas passa por aqui: com internet vai direto ao servidor; sem internet, a página offline
self.addEventListener("fetch", (evento) => {
  if (evento.request.mode !== "navigate") return;
  evento.respondWith(fetch(evento.request).catch(() => caches.match(OFFLINE)));
});
