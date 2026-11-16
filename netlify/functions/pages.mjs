// Páginas para buscadores en Netlify: home, ficha de producto, sitemap y robots, con el HTML armado en el servidor.
import * as C from '../lib/common.mjs';
import seo from '../../seo.js';

// Dominio viejo: todo se manda con 301 al dominio nuevo (las funciones con ruta propia no pasan por netlify.toml)
const DOMINIO_VIEJO = 'cocostoreba.netlify.app';
const DOMINIO_NUEVO = 'https://cocostoreba.com';

export default async (req) => {
  const u = new URL(req.url);
  if (u.host === DOMINIO_VIEJO) {
    return new Response(null, { status: 301, headers: { Location: DOMINIO_NUEVO + u.pathname + u.search, 'Cache-Control': 'public, max-age=3600' } });
  }
  const url = u.pathname;
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
  const cm = /^\/([a-z0-9-]+)\/?$/.exec(url);
  if (cm && seo.COLECCIONES.some((x) => x.slug === cm[1])) {
    const html = seo.coleccion(cm[1], await ctx());
    return html ? C.texto(200, 'text/html; charset=utf-8', html, cdn) : C.texto(404, 'text/html; charset=utf-8', seo.noEncontrado(), { 'Cache-Control': 'no-cache' });
  }
  if (url === '/') return C.texto(200, 'text/html; charset=utf-8', seo.home(C.indexHtml, await ctx()), cdn);
  return C.texto(404, 'text/html; charset=utf-8', seo.noEncontrado(), { 'Cache-Control': 'no-cache' });
};

// Las rutas de colecciones tienen que coincidir con COLECCIONES en seo.js (Netlify necesita la lista escrita acá)
export const config = { path: ['/', '/p/*', '/sitemap.xml', '/robots.txt',
  '/vapes-descartables', '/elfbar', '/ignite', '/dinner-lady', '/the-black-sheep', '/perfumes', '/perfumes-arabes'] };
