// API de Coco Store en Netlify Functions (equivale a /api/* de server.js, con datos en Netlify Blobs).
import crypto from 'node:crypto';
import * as C from '../lib/common.mjs';
import seo from '../../seo.js';

const leerJson = async (req, max = 4.5e6) => {
  const t = await req.text();
  if (t.length > max) throw new Error('grande');
  return t ? JSON.parse(t) : {};
};
const FOTO_MAL = 'La foto no es válida (JPG, PNG o WebP, hasta 3 MB)';

export default async (req, context) => {
  try {
    const url = new URL(req.url).pathname.replace(/\/+$/, '');
    const m = req.method;
    // Público: el CDN lo guarda 30 s para no ejecutar la función en cada visita. El panel agrega ?t= para ver cambios al instante.
    const cdn = { 'Netlify-CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' };

    if (url === '/api/products' && m === 'GET') return C.json(200, seo.conSlugs(await C.productos()), cdn);
    if (url === '/api/config' && m === 'GET') return C.json(200, await C.config(), cdn);

    if (url === '/api/login' && m === 'POST') {
      const ip = context.ip || 'sin-ip';
      if (await C.bloqueado(ip)) return C.json(429, { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
      const { password } = await leerJson(req, 2e3);
      const cred = await C.credencial();
      if (!cred) return C.json(503, { error: 'Falta configurar la variable ADMIN_PASS en Netlify (mínimo 10 caracteres).' });
      if (typeof password !== 'string' || !C.coincide(password, cred)) {
        await C.falla(ip); await C.esperar(800);
        return C.json(401, { error: 'Contraseña incorrecta' });
      }
      await C.limpiarFallas(ip);
      return C.json(200, { token: await C.crearToken() });
    }
    if (!(await C.esAdmin(req))) return C.json(401, { error: 'Tenés que ingresar de nuevo' });

    if (url === '/api/logout' && m === 'POST') return C.json(200, { ok: true }); // el token vence solo a las 8 h
    if (url === '/api/password' && m === 'PUT') {
      const { actual, nueva } = await leerJson(req, 2e3);
      const cred = await C.credencial();
      if (typeof actual !== 'string' || !C.coincide(actual, cred)) { await C.esperar(800); return C.json(401, { error: 'La contraseña actual no es correcta' }); }
      if (typeof nueva !== 'string' || nueva.length < 10) return C.json(400, { error: 'La nueva tiene que tener al menos 10 caracteres' });
      await C.store().setJSON('admin', C.hashear(nueva));
      return C.json(200, { ok: true, token: await C.crearToken() }); // las demás sesiones quedan invalidadas
    }
    if (url === '/api/config' && m === 'PUT') {
      const { whatsapp } = await leerJson(req, 2e3);
      const num = String(whatsapp || '').replace(/\D/g, '');
      if (num && (num.length < 8 || num.length > 15)) return C.json(400, { error: 'El número no parece válido' });
      const conf = { whatsapp: num };
      await C.store().setJSON('config', conf);
      return C.json(200, conf);
    }
    if (url === '/api/products' && m === 'POST') {
      const d = await leerJson(req);
      let imagen = '';
      if (d.foto && !(imagen = await C.guardarFoto(d.foto))) return C.json(400, { error: FOTO_MAL });
      const p = { id: crypto.randomUUID(), nombre: String(d.nombre || '').trim().slice(0, 120), precio: Math.max(0, Number(d.precio) || 0),
        categoria: C.CATEGORIAS.includes(d.categoria) ? d.categoria : 'Otros', imagen, agotado: false, creado: Date.now() };
      if (!p.nombre) { await C.borrarFoto(imagen); return C.json(400, { error: 'Falta el nombre' }); }
      const lista = await C.productos(); lista.unshift(p); await C.guardarProductos(lista);
      return C.json(201, p);
    }
    const mm = /^\/api\/products\/([\w-]+)$/.exec(url);
    if (mm) {
      const lista = await C.productos();
      const i = lista.findIndex((p) => p.id === mm[1]);
      if (i < 0) return C.json(404, { error: 'No existe' });
      if (m === 'DELETE') { await C.borrarFoto(lista[i].imagen); lista.splice(i, 1); await C.guardarProductos(lista); return C.json(200, { ok: true }); }
      if (m === 'PUT') {
        const d = await leerJson(req), p = lista[i];
        if (d.nombre !== undefined) p.nombre = String(d.nombre).trim().slice(0, 120) || p.nombre;
        if (d.precio !== undefined) p.precio = Math.max(0, Number(d.precio) || 0);
        if (d.categoria !== undefined && C.CATEGORIAS.includes(d.categoria)) p.categoria = d.categoria;
        if (d.agotado !== undefined) p.agotado = !!d.agotado;
        if (d.foto) {
          const f = await C.guardarFoto(d.foto);
          if (!f) return C.json(400, { error: FOTO_MAL });
          await C.borrarFoto(p.imagen); p.imagen = f;
        }
        await C.guardarProductos(lista);
        return C.json(200, p);
      }
    }
    return C.json(404, { error: 'No encontrado' });
  } catch (e) {
    console.error(e);
    return C.json(400, { error: 'Pedido inválido' });
  }
};

export const config = { path: '/api/*' };
