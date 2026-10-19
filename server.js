// Servidor mínimo de Coco Store (sin dependencias). Node 18+.
// Guarda productos en data/products.json y las fotos en uploads/.
// Uso: node server.js   ->  http://localhost:3000  (panel: /admin)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seo = require('./seo');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(ROOT, 'uploads');
const DATA = path.join(ROOT, 'data');
const F_PROD = path.join(DATA, 'products.json');
const F_CONF = path.join(DATA, 'config.json');
const F_ADMIN = path.join(DATA, 'admin.json'); // hash de la contraseña (nunca la contraseña en sí)

const CATEGORIAS = ['Descartables', 'Recargables', 'Pods', 'Líquidos', 'Perfumes', 'Otros'];
const SESION_MS = 8 * 3600e3;          // la sesión del panel dura 8 horas
const MAX_INTENTOS = 5;                // intentos fallidos por IP antes de bloquear
const BLOQUEO_MS = 15 * 60e3;          // bloqueo de 15 minutos
const MAX_FOTO = 5 * 1024 * 1024;      // 5 MB por foto
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // activar solo detrás de un proxy propio (Render, nginx...)

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const guardar = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));

// ---------- Contraseña ----------
function hashear(pass, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pass, salt, 64).toString('hex') };
}
function coincide(pass, reg) {
  const h = crypto.scryptSync(String(pass), reg.salt, 64);
  const e = Buffer.from(reg.hash, 'hex');
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}
const claveEnv = process.env.ADMIN_PASS || '';
let admin = leer(F_ADMIN, null);
if (claveEnv) {
  if (claveEnv.length < 10) { console.error('ADMIN_PASS tiene que tener al menos 10 caracteres.'); process.exit(1); }
  admin = hashear(claveEnv);
} else if (!admin) {
  const inicial = crypto.randomBytes(12).toString('base64url'); // 16 caracteres al azar
  admin = hashear(inicial); guardar(F_ADMIN, admin);
  console.log('\n  CONTRASEÑA DEL PANEL (se muestra una sola vez, guardala): ' + inicial);
  console.log('  Podés cambiarla desde el panel, en "Cambiar contraseña".\n');
}

// ---------- Sesiones e intentos ----------
const sesiones = new Map();  // token -> vence
const intentos = new Map();  // ip -> { n, hasta }
const limpiar = () => { const t = Date.now(); for (const [k, v] of sesiones) if (v < t) sesiones.delete(k); for (const [k, v] of intentos) if (v.hasta < t && v.n < MAX_INTENTOS) intentos.delete(k); };
setInterval(limpiar, 10 * 60e3).unref();

const tokenDe = (req) => (req.headers.authorization || '').replace(/^Bearer /, '');
const esAdmin = (req) => { const v = sesiones.get(tokenDe(req)); return !!v && v > Date.now(); };
function ipDe(req) {
  if (TRUST_PROXY) { const f = (req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (f) return f; }
  return req.socket.remoteAddress || '?';
}
// URL pública del sitio para canonical/sitemap: SITE_URL si está definida (recomendado), si no se deduce del pedido
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
function baseUrl(req) {
  if (SITE_URL) return SITE_URL;
  const host = /^[a-z0-9.-]+(:\d+)?$/i.test(req.headers.host || '') ? req.headers.host : 'localhost';
  const proto = TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Utilidades ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
function cabeceras(extra = {}) {
  return { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', ...extra };
}
function json(res, code, obj) {
  res.writeHead(code, cabeceras({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }));
  res.end(JSON.stringify(obj));
}
function body(req, max = 8e6) {
  return new Promise((ok, fail) => {
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > max) { fail(new Error('grande')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString() || '{}')); } catch (e) { fail(e); } });
  });
}

// Guarda un dataURL (jpeg/png/webp) en uploads/ verificando que de verdad sea esa imagen
const FIRMA = { jpeg: (b) => b[0] === 0xff && b[1] === 0xd8, png: (b) => b.slice(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  webp: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' };
function guardarFoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_FOTO || !FIRMA[m[1]](buf)) return null;
  const nombre = crypto.randomUUID() + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UPLOADS, nombre), buf);
  return '/uploads/' + nombre;
}
function borrarFoto(ruta) {
  if (!ruta || !ruta.startsWith('/uploads/')) return;
  const f = path.join(UPLOADS, path.basename(ruta));
  fs.rm(f, { force: true }, () => {});
}

async function api(req, res, url) {
  const m = req.method;
  if (url === '/api/products' && m === 'GET') return json(res, 200, seo.conSlugs(leer(F_PROD, [])));
  if (url === '/api/config' && m === 'GET') return json(res, 200, leer(F_CONF, { whatsapp: '' }));

  if (url === '/api/login' && m === 'POST') {
    const ip = ipDe(req), reg = intentos.get(ip) || { n: 0, hasta: 0 };
    if (reg.n >= MAX_INTENTOS && reg.hasta > Date.now()) return json(res, 429, { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    if (reg.n >= MAX_INTENTOS) { reg.n = 0; }
    const { password } = await body(req, 2e3);
    if (typeof password !== 'string' || !coincide(password, admin)) {
      reg.n++; reg.hasta = Date.now() + BLOQUEO_MS; intentos.set(ip, reg);
      await esperar(800); // frena la fuerza bruta
      return json(res, 401, { error: 'Contraseña incorrecta' });
    }
    intentos.delete(ip);
    const t = crypto.randomBytes(32).toString('hex'); sesiones.set(t, Date.now() + SESION_MS);
    return json(res, 200, { token: t });
  }
  if (!esAdmin(req)) return json(res, 401, { error: 'Tenés que ingresar de nuevo' });

  if (url === '/api/logout' && m === 'POST') { sesiones.delete(tokenDe(req)); return json(res, 200, { ok: true }); }
  if (url === '/api/password' && m === 'PUT') {
    if (claveEnv) return json(res, 400, { error: 'La contraseña la define la variable ADMIN_PASS del servidor.' });
    const { actual, nueva } = await body(req, 2e3);
    if (typeof actual !== 'string' || !coincide(actual, admin)) { await esperar(800); return json(res, 401, { error: 'La contraseña actual no es correcta' }); }
    if (typeof nueva !== 'string' || nueva.length < 10) return json(res, 400, { error: 'La nueva tiene que tener al menos 10 caracteres' });
    admin = hashear(nueva); guardar(F_ADMIN, admin);
    const yo = tokenDe(req); for (const k of sesiones.keys()) if (k !== yo) sesiones.delete(k); // cierra las demás sesiones
    return json(res, 200, { ok: true });
  }
  if (url === '/api/config' && m === 'PUT') {
    const { whatsapp } = await body(req, 2e3);
    const num = String(whatsapp || '').replace(/\D/g, '');
    if (num && (num.length < 8 || num.length > 15)) return json(res, 400, { error: 'El número no parece válido' });
    const conf = { whatsapp: num };
    guardar(F_CONF, conf);
    return json(res, 200, conf);
  }
  if (url === '/api/products' && m === 'POST') {
    const d = await body(req);
    if (d.foto && !(d.foto = guardarFoto(d.foto))) return json(res, 400, { error: 'La foto no es válida (JPG, PNG o WebP, hasta 5 MB)' });
    const p = { id: crypto.randomUUID(), nombre: String(d.nombre || '').trim().slice(0, 120), precio: Math.max(0, Number(d.precio) || 0),
      categoria: CATEGORIAS.includes(d.categoria) ? d.categoria : 'Otros', imagen: d.foto || '', agotado: false, creado: Date.now() };
    if (!p.nombre) { borrarFoto(p.imagen); return json(res, 400, { error: 'Falta el nombre' }); }
    const lista = leer(F_PROD, []); lista.unshift(p); guardar(F_PROD, lista);
    return json(res, 201, p);
  }
  const mm = /^\/api\/products\/([\w-]+)$/.exec(url);
  if (mm) {
    const lista = leer(F_PROD, []);
    const i = lista.findIndex((p) => p.id === mm[1]);
    if (i < 0) return json(res, 404, { error: 'No existe' });
    if (m === 'DELETE') { borrarFoto(lista[i].imagen); lista.splice(i, 1); guardar(F_PROD, lista); return json(res, 200, { ok: true }); }
    if (m === 'PUT') {
      const d = await body(req);
      const p = lista[i];
      if (d.nombre !== undefined) p.nombre = String(d.nombre).trim().slice(0, 120) || p.nombre;
      if (d.precio !== undefined) p.precio = Math.max(0, Number(d.precio) || 0);
      if (d.categoria !== undefined && CATEGORIAS.includes(d.categoria)) p.categoria = d.categoria;
      if (d.agotado !== undefined) p.agotado = !!d.agotado;
      if (d.foto) {
        const f = guardarFoto(d.foto);
        if (!f) return json(res, 400, { error: 'La foto no es válida (JPG, PNG o WebP, hasta 5 MB)' });
        borrarFoto(p.imagen); p.imagen = f;
      }
      guardar(F_PROD, lista);
      return json(res, 200, p);
    }
  }
  json(res, 404, { error: 'No encontrado' });
}

http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url.includes('\0')) { res.writeHead(400, cabeceras()); return res.end(); }
    if (url.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, cabeceras()); return res.end(); }

    // Páginas para buscadores: el HTML sale armado desde el servidor
    const ctx = () => ({ base: baseUrl(req), productos: seo.conSlugs(leer(F_PROD, [])), whatsapp: leer(F_CONF, { whatsapp: '' }).whatsapp || '' });
    const texto = (code, tipo, s) => { res.writeHead(code, cabeceras({ 'Content-Type': tipo, 'Cache-Control': 'no-cache' })); res.end(req.method === 'HEAD' ? undefined : s); };
    if (url === '/robots.txt') return texto(200, 'text/plain; charset=utf-8', seo.robots(baseUrl(req)));
    if (url === '/sitemap.xml') { const c = ctx(); return texto(200, 'application/xml; charset=utf-8', seo.sitemap(c.base, c.productos)); }
    const pm = /^\/p\/([a-z0-9-]+)\/?$/.exec(url);
    if (pm) {
      const c = ctx(), p = c.productos.find((x) => x.slug === pm[1]);
      return p ? texto(200, 'text/html; charset=utf-8', seo.producto(p, c)) : texto(404, 'text/html; charset=utf-8', seo.noEncontrado());
    }
    if (url === '/') {
      return fs.readFile(path.join(PUBLIC, 'index.html'), 'utf8', (err, html) => err ? json(res, 500, { error: 'Error' }) : texto(200, 'text/html; charset=utf-8', seo.home(html, ctx())));
    }

    const rel = url === '/' ? '/index.html' : url === '/admin' ? '/admin.html' : url;
    const enUploads = rel.startsWith('/uploads/');
    const base = enUploads ? UPLOADS : PUBLIC;
    const file = path.resolve(base, '.' + (enUploads ? rel.slice(8) : rel));
    if (!file.startsWith(base + path.sep)) { res.writeHead(403, cabeceras()); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, cabeceras()); return res.end('No encontrado'); }
      const priv = rel === '/admin.html';
      res.writeHead(200, cabeceras({ 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': priv ? 'no-store' : 'no-cache',
        ...(priv ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) }));
      res.end(buf);
    });
  } catch (e) {
    json(res, 400, { error: 'Pedido inválido' });
  }
}).listen(PORT, () => console.log(`Coco Store en http://localhost:${PORT}  (panel: /admin)`));
