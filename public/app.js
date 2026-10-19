// Tienda Coco Store: carga productos del servidor y los muestra con filtros.
const CATEGORIAS = ['Descartables', 'Recargables', 'Pods', 'Líquidos', 'Perfumes', 'Otros'];
const IG_DM = 'https://ig.me/m/cocostoreba';
const $ = (id) => document.getElementById(id);
const peso = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

let productos = [];
let whatsapp = '';
let filtro = 'Todos';
let texto = '';

function el(tag, clase, txt) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

function linkPedido(msg) {
  return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}` : IG_DM;
}

function pintarNav() {
  const nav = $('nav');
  nav.replaceChildren();
  ['Todos', ...CATEGORIAS].forEach((c) => {
    const b = el('button', '', c);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(c === filtro));
    b.onclick = () => { filtro = c; pintar(); $('productos').scrollIntoView(); };
    nav.append(b);
  });
}

function pintarCats() {
  const cont = $('cats');
  cont.replaceChildren();
  CATEGORIAS.slice(0, 4).forEach((c) => {
    const n = productos.filter((p) => p.categoria === c).length;
    const b = el('button', 'cat');
    b.type = 'button';
    b.append(el('b', '', c), el('span', '', n === 1 ? '1 producto' : `${n} productos`));
    b.onclick = () => { filtro = c; pintar(); $('productos').scrollIntoView(); };
    cont.append(b);
  });
}

function tarjeta(p) {
  const art = el('article', 'prod' + (p.agotado ? ' agotado' : ''));
  const foto = el('div', 'foto');
  const img = el('img');
  img.alt = p.nombre; img.loading = 'lazy';
  if (p.imagen) img.src = p.imagen; else { img.src = '/img/mascota.svg'; img.className = 'vacia'; img.alt = ''; }
  foto.append(img);
  if (p.agotado) foto.append(el('span', 'cinta', 'Agotado'));
  const info = el('div', 'info');
  info.append(el('span', 'cat-nombre', p.categoria), el('h3', '', p.nombre),
    el('div', 'precio', p.precio > 0 ? peso.format(p.precio) : 'Consultar precio'));
  const a = el('a', 'btn', p.agotado ? 'Sin stock' : 'Pedir por WhatsApp');
  a.href = linkPedido(`Hola Coco Store! Quiero pedir: ${p.nombre}${p.precio > 0 ? ' (' + peso.format(p.precio) + ')' : ''}`);
  a.target = '_blank'; a.rel = 'noopener';
  info.append(a);
  art.append(foto, info);
  return art;
}

function pintar() {
  pintarNav();
  const q = texto.trim().toLowerCase();
  const lista = productos.filter((p) => (filtro === 'Todos' || p.categoria === filtro) && (!q || p.nombre.toLowerCase().includes(q)));
  $('t-prod').textContent = filtro === 'Todos' ? 'Todos los productos' : filtro;
  $('cuenta').textContent = lista.length === 1 ? '1 producto' : `${lista.length} productos`;
  const g = $('grilla');
  g.replaceChildren();
  if (!lista.length) {
    const v = el('div', 'vacio');
    v.append(el('h3', '', 'No encontramos productos acá'), el('p', '', 'Escribinos y te decimos qué hay disponible.'));
    const a = el('a', 'btn', 'Consultar por WhatsApp');
    a.href = linkPedido('Hola Coco Store! Quería consultar por un producto.'); a.target = '_blank'; a.rel = 'noopener';
    v.append(a); g.append(v);
    return;
  }
  lista.forEach((p) => g.append(tarjeta(p)));
}

function enlacesWA() {
  const h = linkPedido('Hola Coco Store! Quería hacer una consulta.');
  ['wa-cab', 'wa-hero', 'wa-pie', 'wa-flota'].forEach((id) => { $(id).href = h; });
}

async function cargar() {
  try {
    const [p, c] = await Promise.all([fetch('/api/products').then((r) => r.json()), fetch('/api/config').then((r) => r.json())]);
    productos = p; whatsapp = c.whatsapp || '';
  } catch { productos = []; }
  enlacesWA(); pintarCats(); pintar();
}

$('q').addEventListener('input', (e) => { texto = e.target.value; pintar(); });

// Verificación +18 (se recuerda en este dispositivo)
try {
  if (localStorage.getItem('coco18') !== '1') {
    $('edad').hidden = false;
    $('edad-si').focus();
    $('edad-si').onclick = () => { try { localStorage.setItem('coco18', '1'); } catch {} $('edad').hidden = true; };
  }
} catch { /* sin storage: no se muestra el cartel */ }

cargar();
