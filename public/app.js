// Tienda Coco Store: carga productos del servidor y los muestra con filtros.
const CATEGORIAS = ['Descartables', 'Recargables', 'Pods', 'Líquidos', 'Perfumes', 'Otros'];
const IG_DM = 'https://ig.me/m/cocostoreba';

// ---- Datos del negocio: editá acá ----
const TIENDA = {
  corte: 18,                              // hora límite (Buenos Aires) para recibir el pedido el mismo día
  pagos: 'Efectivo o transferencia',      // formas de pago que se muestran en la web
  // Reseñas REALES de clientes (copialas de WhatsApp/Instagram con su permiso). Si queda vacío, la sección no aparece.
  // Ejemplo: { nombre: 'Martín, Palermo', texto: 'Pedí a las 4 y a las 6 lo tenía en casa.' }
  resenas: [],
};
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

// ---- Envío en el día: cuenta regresiva hasta el corte, en hora de Buenos Aires ----
function segundosBA() {
  const f = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
  const v = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, Number(x.value)]));
  return v.hour * 3600 + v.minute * 60 + v.second;
}
const dos = (n) => String(n).padStart(2, '0');
const llegaHoy = () => TIENDA.corte * 3600 - segundosBA() > 0;

function pintarCorte() {
  const resta = TIENDA.corte * 3600 - segundosBA();
  const h = Math.floor(resta / 3600), m = Math.floor((resta % 3600) / 60), s = resta % 60;
  const corto = h > 0 ? `${h} h ${m} min` : `${m} min`;
  document.querySelectorAll('[data-corte="aviso"]').forEach((e) => {
    e.innerHTML = resta > 0
      ? `<span class="largo"><b>Envío en el día</b> · Pedí en las próximas <b>${corto}</b> y lo recibís hoy</span><span class="corto"><b>Llega hoy</b> si pedís en <b>${corto}</b></span>`
      : '<span class="largo"><b>Envío en el día</b> en CABA y GBA · Pedí ahora y sale mañana temprano</span><span class="corto"><b>Envío en el día</b> · Pedí ahora, sale mañana</span>';
  });
  document.querySelectorAll('[data-corte="reloj"]').forEach((e) => {
    e.innerHTML = resta > 0
      ? `<small>Pedí en las próximas</small><span class="digitos"><b>${dos(h)}</b>:<b>${dos(m)}</b>:<b>${dos(s)}</b></span><small>y lo recibís <strong>hoy</strong></small>`
      : `<small>Hoy ya cerramos los envíos.</small><span class="digitos manana">Pedí ahora</span><small>y sale <strong>mañana temprano</strong></small>`;
  });
  document.querySelectorAll('[data-corte="texto"]').forEach((e) => {
    e.textContent = resta > 0 ? `Te quedan ${corto} para recibirlo hoy.` : 'Pedí ahora y te lo llevamos mañana temprano.';
  });
  document.querySelectorAll('.llega').forEach((e) => { e.lastChild.textContent = resta > 0 ? 'Llega hoy' : 'Llega mañana'; });
}

const WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.8-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.4Z"/></svg>';
const MOTO_SVG = '<svg viewBox="0 0 32 20" aria-hidden="true"><circle cx="6" cy="15" r="4"/><circle cx="26" cy="15" r="4"/><path d="M6 15h9l4-7h5l2 7M19 8l-2-4h-4M13 9h-6"/></svg>';

function linkPedido(msg) {
  return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}` : IG_DM;
}

// Solo las categorías que tienen al menos un producto cargado
const categoriasConProductos = () => CATEGORIAS.filter((c) => productos.some((p) => p.categoria === c));

function pintarNav() {
  const nav = $('nav');
  nav.replaceChildren();
  ['Todos', ...categoriasConProductos()].forEach((c) => {
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
  categoriasConProductos().forEach((c) => {
    const n = productos.filter((p) => p.categoria === c).length;
    const b = el('button', 'cat');
    b.type = 'button';
    b.append(el('b', '', c), el('span', '', n === 1 ? '1 producto' : `${n} productos`));
    b.onclick = () => { filtro = c; pintar(); $('productos').scrollIntoView(); };
    cont.append(b);
  });
}

// Los 6 productos con stock cargados más recientemente llevan la etiqueta "Nuevo"
let idsNuevos = new Set();
const recientes = () => productos.filter((p) => !p.agotado).sort((a, b) => (b.creado || 0) - (a.creado || 0));

function mensajePedido(p) {
  return `Hola Coco Store! Quiero pedir: ${p.nombre}${p.precio > 0 ? ' (' + peso.format(p.precio) + ')' : ''}. ` +
    `¿Me lo pueden mandar ${llegaHoy() ? 'hoy' : 'mañana'}? Mi zona es: `;
}

function tarjeta(p) {
  const art = el('article', 'prod' + (p.agotado ? ' agotado' : ''));
  const foto = el('div', 'foto');
  const img = el('img');
  img.alt = p.nombre; img.loading = 'lazy';
  if (p.imagen) img.src = p.imagen; else { img.src = '/img/mascota.svg'; img.className = 'vacia'; img.alt = ''; }
  foto.append(img);
  if (p.agotado) foto.append(el('span', 'cinta', 'Agotado'));
  else if (idsNuevos.has(p.id)) foto.append(el('span', 'cinta nuevo', 'Nuevo'));
  const info = el('div', 'info');
  const h3 = el('h3');
  if (p.slug) { const l = el('a', '', p.nombre); l.href = '/p/' + p.slug; h3.append(l); } else h3.textContent = p.nombre;
  info.append(el('span', 'cat-nombre', p.categoria), h3,
    el('div', 'precio', p.precio > 0 ? peso.format(p.precio) : 'Consultar precio'));
  if (!p.agotado) {
    const ll = el('span', 'llega');
    ll.innerHTML = MOTO_SVG;
    ll.append(document.createTextNode(llegaHoy() ? 'Llega hoy' : 'Llega mañana'));
    info.append(ll);
  }
  const a = el('a', 'btn');
  if (p.agotado) a.textContent = 'Sin stock';
  else a.innerHTML = `${WA_ICON}<span class="largo">Pedir por WhatsApp</span><span class="corto">Pedir</span>`;
  a.href = linkPedido(mensajePedido(p));
  a.target = '_blank'; a.rel = 'noopener';
  info.append(a);
  art.append(foto, info);
  return art;
}

// En celular se muestran de a 12 productos (de a 20 en pantallas grandes) con un botón "Ver más"
const porPagina = () => (matchMedia('(min-width: 960px)').matches ? 20 : 12);
let mostrar = 12;

function pintar(mas) {
  mostrar = mas === true ? mostrar + porPagina() : porPagina();
  if (filtro !== 'Todos' && !categoriasConProductos().includes(filtro)) filtro = 'Todos';
  pintarNav();
  const q = texto.trim().toLowerCase();
  const lista = productos
    .filter((p) => (filtro === 'Todos' || p.categoria === filtro) && (!q || p.nombre.toLowerCase().includes(q)))
    // los agotados van siempre al final de todo; el resto se agrupa por categoría (el sort es estable)
    .sort((a, b) => Number(!!a.agotado) - Number(!!b.agotado) || CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria));
  $('t-prod').textContent = filtro === 'Todos' ? 'Todos los productos' : filtro;
  $('cuenta').textContent = lista.length === 1 ? '1 producto' : `${lista.length} productos`;
  const g = $('grilla');
  g.replaceChildren();
  const vm = $('ver-mas');
  vm.replaceChildren();
  if (!lista.length) {
    const v = el('div', 'vacio');
    v.append(el('h3', '', 'No encontramos productos acá'), el('p', '', 'Escribinos y te decimos qué hay disponible.'));
    const a = el('a', 'btn', 'Consultar por WhatsApp');
    a.href = linkPedido('Hola Coco Store! Quería consultar por un producto.'); a.target = '_blank'; a.rel = 'noopener';
    v.append(a); g.append(v);
    return;
  }
  lista.slice(0, mostrar).forEach((p) => g.append(tarjeta(p)));
  const resto = lista.length - mostrar;
  if (resto > 0) {
    const b = el('button', 'btn negro', `Ver más productos (${resto})`);
    b.type = 'button';
    b.onclick = () => pintar(true);
    vm.append(b);
  }
}

function pintarNuevos() {
  const lista = recientes().slice(0, 10);
  $('sec-nuevos').hidden = lista.length < 4;
  const r = $('nuevos');
  r.replaceChildren(...lista.map(tarjeta));
}

// Banners: reemplaza el dibujo por fotos reales de los 3 productos más nuevos de la categoría (si hay al menos 3 con foto)
function pintarVitrinas() {
  document.querySelectorAll('[data-vitrina]').forEach((cont) => {
    const lista = recientes().filter((p) => p.categoria === cont.dataset.vitrina && p.imagen).slice(0, 3);
    if (lista.length < 3) return;
    const v = el('div', 'vitrina');
    const badge = cont.querySelector('.hoy-badge');
    if (badge) v.append(badge);
    lista.forEach((p, i) => {
      const a = el('a', `vit v${i + 1}`);
      a.href = p.slug ? '/p/' + p.slug : '#productos';
      const img = el('img'); img.src = p.imagen; img.alt = p.nombre; img.width = 400; img.height = 400;
      const t = el('span', 'vit-txt');
      t.append(el('b', '', p.nombre), el('i', '', p.precio > 0 ? peso.format(p.precio) : 'Consultar'));
      a.append(img, t); v.append(a);
    });
    cont.replaceWith(v);
  });
}

function pintarResenas() {
  const cont = $('resenas');
  if (!TIENDA.resenas.length) return;
  cont.hidden = false;
  TIENDA.resenas.slice(0, 4).forEach((r) => {
    const f = el('figure', 'resena');
    f.append(el('div', 'estrellas', '★★★★★'), el('blockquote', '', `“${r.texto}”`), el('figcaption', '', r.nombre));
    cont.append(f);
  });
}

function enlacesWA() {
  const h = linkPedido(`Hola Coco Store! Quería hacer un pedido para recibir ${llegaHoy() ? 'hoy' : 'mañana'}. Mi zona es: `);
  ['wa-cab', 'wa-pie', 'wa-flota'].forEach((id) => { $(id).href = h; });
  document.querySelectorAll('[data-wa]').forEach((a) => { a.href = h; });
}

async function cargar() {
  try {
    const [p, c] = await Promise.all([fetch('/api/products').then((r) => r.json()), fetch('/api/config').then((r) => r.json())]);
    productos = p; whatsapp = c.whatsapp || '';
  } catch { productos = []; }
  idsNuevos = new Set(recientes().slice(0, 6).map((p) => p.id));
  enlacesWA(); pintarVitrinas(); pintarCats(); pintarNuevos(); pintar();
}

// Datos fijos del negocio en la página
document.querySelectorAll('[data-pagos]').forEach((e) => { e.textContent = TIENDA.pagos; });
document.querySelectorAll('[data-corte-hora]').forEach((e) => { e.textContent = `${TIENDA.corte} h`; });
pintarResenas();
pintarCorte();
setInterval(pintarCorte, 1000);

// Flechas de la fila "Recién llegados"
document.querySelectorAll('[data-riel]').forEach((b) => {
  b.addEventListener('click', () => { const r = $('nuevos'); r.scrollBy({ left: Number(b.dataset.riel) * r.clientWidth * 0.8, behavior: 'smooth' }); });
});

$('q').addEventListener('input', (e) => { texto = e.target.value; pintar(); });

// Verificación +18 (se recuerda en este dispositivo)
try {
  if (localStorage.getItem('coco18') !== '1') {
    $('edad').hidden = false;
    $('edad-si').focus();
    $('edad-si').onclick = () => { try { localStorage.setItem('coco18', '1'); } catch {} $('edad').hidden = true; };
  }
} catch { /* sin storage: no se muestra el cartel */ }

// Botones del banner que filtran la grilla
document.querySelectorAll('[data-filtro]').forEach((a) => {
  a.addEventListener('click', () => { filtro = a.dataset.filtro; pintar(); });
});

// Slider del banner: cada slide dura lo que dura la barra de progreso (animationend avanza)
(function slider() {
  const slides = [...document.querySelectorAll('.slide')];
  const cont = $('puntos');
  let i = 0;
  const dots = slides.map((s, n) => {
    const d = el('button', 'punto');
    d.type = 'button'; d.setAttribute('role', 'tab'); d.setAttribute('aria-label', `Banner ${n + 1} de ${slides.length}`);
    d.style.setProperty('--dur', (Number(s.dataset.t) || 6500) + 'ms');
    d.append(el('i'));
    d.onclick = () => ir(n);
    d.querySelector('i').addEventListener('animationend', () => ir(i + 1));
    cont.append(d); return d;
  });
  function ir(n) {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', String(k !== i)); });
    dots.forEach((d, k) => {
      d.setAttribute('aria-selected', String(k === i));
      d.classList.remove('on'); void d.offsetWidth; // reinicia la barra
      if (k === i) d.classList.add('on');
    });
  }
  $('prev').onclick = () => ir(i - 1);
  $('next').onclick = () => ir(i + 1);
  const b = $('banner');
  const pausa = (p) => b.classList.toggle('pausa', p);
  b.addEventListener('mouseenter', () => pausa(true));
  b.addEventListener('mouseleave', () => pausa(false));
  b.addEventListener('focusin', () => pausa(true));
  b.addEventListener('focusout', () => pausa(false));
  // deslizar con el dedo
  let x0 = null;
  b.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  b.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) ir(i + (dx < 0 ? 1 : -1));
  });
  document.addEventListener('visibilitychange', () => pausa(document.hidden));
  ir(0);
})();

cargar();
