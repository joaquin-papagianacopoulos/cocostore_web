// Páginas para buscadores en Netlify: home, ficha de producto, sitemap y robots, con el HTML armado en el servidor.
import * as C from '../lib/common.mjs';
import seo from '../../seo.js';

export default async (req) => {
  const url = new URL(req.url).pathname;
  const base = C.baseUrl(req);
  // El CDN de Netlify guarda la página 60 s: menos ejecuciones, y los cambios del panel se ven en ~1 minuto.
  const cdn = { 'Cache-Control': 'public, max-age=0, must-revalidate', 'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };
  const ctx = async () => ({ base, productos: seo.conSlugs(await C.productos()), whatsapp: (await C.config()).whatsapp || '' });

  if (url === '/robots.txt') return C.texto(200, 'text/plain; charset=utf-8', seo.robots(base), cdn);
  if (url === '/sitemap.xml') { const c = await ctx(); return C.texto(200, 'application/xml; charset=utf-8', seo.sitemap(base, c.productos), cdn); }
  const pm = /^\/p\/([a-z0-9-]+)\/?$/.exec(url);
  if (pm) {
    const c = await ctx(), p = c.productos.find((x) => x.slug === pm[1]);
    return p ? C.texto(200, 'text/html; charset=utf-8', seo.producto(p, c), cdn) : C.texto(404, 'text/html; charset=utf-8', seo.noEncontrado(), { 'Cache-Control': 'no-cache' });
  }
  if (url === '/') return C.texto(200, 'text/html; charset=utf-8', seo.home(C.indexHtml, await ctx()), cdn);
  return C.texto(404, 'text/html; charset=utf-8', seo.noEncontrado(), { 'Cache-Control': 'no-cache' });
};

export const config = { path: ['/', '/p/*', '/sitemap.xml', '/robots.txt'] };
