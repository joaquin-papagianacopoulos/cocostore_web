// Lógica compartida de las funciones de Netlify: almacenamiento (Blobs), contraseña, sesiones y respuestas.
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import generated from './generated.json';

export const CATEGORIAS = ['Descartables', 'Recargables', 'Pods', 'Líquidos', 'Perfumes', 'Otros'];
export const SESION_MS = 8 * 3600e3;
export const MAX_INTENTOS = 5;
export const BLOQUEO_MS = 15 * 60e3;
export const MAX_FOTO = 3 * 1024 * 1024;

export const store = () => getStore({ name: 'cocostore', consistency: 'strong' });

// ---------- Respuestas ----------
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
export const cabeceras = (extra = {}) => ({ 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', ...extra });
export const json = (code, obj, extra = {}) => new Response(JSON.stringify(obj), { status: code,
  headers: cabeceras({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }) });
export const texto = (code, tipo, s, extra = {}) => new Response(s, { status: code, headers: cabeceras({ 'Content-Type': tipo, ...extra }) });

export const baseUrl = (req) => (process.env.SITE_URL || '').replace(/\/+$/, '') || new URL(req.url).origin;

// ---------- Datos ----------
// Primera vez: se siembra desde el catálogo del repo. Si Blobs falla, se propaga el error (nunca se pisa con el catálogo inicial).
// Después, los productos que se agreguen al repo se suman una sola vez (la lista 'sembrados' recuerda cuáles ya entraron,
// así lo editado o borrado desde el panel no vuelve a aparecer).
export async function productos() {
  const s = store();
  let p = await s.get('products', { type: 'json' });
  if (p === null) { p = generated.products; await s.setJSON('products', p); }
  const previos = await s.get('sembrados', { type: 'json' });
  const sembrados = previos || p.map((x) => x.id);
  const vistos = new Set([...sembrados, ...p.map((x) => x.id)]);
  const nuevos = generated.products.filter((x) => !vistos.has(x.id));
  if (nuevos.length) { p = [...nuevos, ...p]; await s.setJSON('products', p); }
  if (nuevos.length || !previos) await s.setJSON('sembrados', [...sembrados, ...nuevos.map((x) => x.id)]);
  return p;
}
export const guardarProductos = (lista) => store().setJSON('products', lista);
export async function config() {
  const s = store();
  let c = await s.get('config', { type: 'json' });
  if (c === null) { c = generated.config; await s.setJSON('config', c); }
  return c;
}
export const indexHtml = generated.indexHtml;

// ---------- Contraseña ----------
export const hashear = (pass, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pass, salt, 64).toString('hex') });
export function coincide(pass, reg) {
  const h = crypto.scryptSync(String(pass), reg.salt, 64), e = Buffer.from(reg.hash, 'hex');
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}
const claveEnv = () => process.env.ADMIN_PASS || '';
// La contraseña guardada desde el panel manda; si no hay, se usa la variable ADMIN_PASS de Netlify.
export async function credencial() {
  const a = await store().get('admin', { type: 'json' });
  if (a) return { ...a, origen: 'panel' };
  const env = claveEnv();
  if (env.length < 10) return null;
  const salt = crypto.createHash('sha256').update('cocostore:' + env).digest('hex').slice(0, 32);
  return { ...hashear(env, salt), origen: 'env' };
}
const versionCred = async () => {
  const a = await store().get('admin', { type: 'json' });
  return a ? a.salt.slice(0, 16) : crypto.createHash('sha256').update(claveEnv()).digest('hex').slice(0, 16);
};

// ---------- Sesiones (sin estado: token firmado con vencimiento) ----------
async function secreto() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const s = store();
  let k = await s.get('secret', { type: 'json' });
  if (!k) { await s.setJSON('secret', { k: crypto.randomBytes(32).toString('hex') }, { onlyIfNew: true }); k = await s.get('secret', { type: 'json' }); }
  return k.k;
}
const b64 = (s) => Buffer.from(s).toString('base64url');
const firma = (sec, p) => crypto.createHmac('sha256', sec).update(p).digest('base64url');
export async function crearToken() {
  const p = b64(JSON.stringify({ e: Date.now() + SESION_MS, v: await versionCred() }));
  return p + '.' + firma(await secreto(), p);
}
export async function esAdmin(req) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const [p, f] = t.split('.');
  if (!p || !f) return false;
  const esperada = firma(await secreto(), p);
  if (f.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperada))) return false;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.e > Date.now() && d.v === await versionCred(); } catch { return false; }
}

// ---------- Límite de intentos (compartido entre instancias, guardado en Blobs) ----------
const claveIp = (ip) => 'rl-' + crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 24);
export async function bloqueado(ip) {
  const r = await store().get(claveIp(ip), { type: 'json' });
  return !!r && r.n >= MAX_INTENTOS && r.hasta > Date.now();
}
export async function falla(ip) {
  const s = store(), k = claveIp(ip), r = (await s.get(k, { type: 'json' })) || { n: 0 };
  const n = r.hasta && r.hasta < Date.now() && r.n >= MAX_INTENTOS ? 1 : r.n + 1;
  await s.setJSON(k, { n, hasta: Date.now() + BLOQUEO_MS });
}
export const limpiarFallas = (ip) => store().delete(claveIp(ip));
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Fotos ----------
const FIRMA = { jpeg: (b) => b[0] === 0xff && b[1] === 0xd8, png: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  webp: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' };
export async function guardarFoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_FOTO || !FIRMA[m[1]](buf)) return null;
  const nombre = crypto.randomUUID() + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  await store().set('img/' + nombre, buf, { metadata: { tipo: 'image/' + m[1] } });
  return '/media/' + nombre;
}
export async function borrarFoto(ruta) {
  if (ruta && ruta.startsWith('/media/')) await store().delete('img/' + ruta.slice(7).replace(/[^\w.-]/g, ''));
}
