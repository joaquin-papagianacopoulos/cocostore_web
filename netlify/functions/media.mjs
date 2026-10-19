// Sirve las fotos que se suben desde el panel (guardadas en Netlify Blobs). Las fotos iniciales salen de /uploads (CDN).
import * as C from '../lib/common.mjs';

export default async (req) => {
  const nombre = new URL(req.url).pathname.replace(/^\/media\//, '');
  if (!/^[\w-]+\.(jpg|png|webp)$/.test(nombre)) return C.texto(404, 'text/plain; charset=utf-8', 'No encontrado');
  const r = await C.store().getWithMetadata('img/' + nombre, { type: 'arrayBuffer' });
  if (!r || !r.data) return C.texto(404, 'text/plain; charset=utf-8', 'No encontrado');
  // Los nombres son únicos (uuid) y nunca cambian de contenido: se pueden guardar para siempre.
  return new Response(r.data, { status: 200, headers: C.cabeceras({ 'Content-Type': (r.metadata && r.metadata.tipo) || 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable' }) });
};

export const config = { path: '/media/*' };
