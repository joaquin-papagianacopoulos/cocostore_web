// Panel simple de Coco Store: subir, editar, marcar agotado y borrar productos.
const CATEGORIAS = ['Descartables', 'Recargables', 'Pods', 'Líquidos', 'Perfumes', 'Otros'];
const $ = (id) => document.getElementById(id);
const peso = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

let token = '';
try { token = sessionStorage.getItem('cocoTok') || ''; } catch {}
let productos = [];
let fotoNueva = ''; // dataURL ya achicada
let editando = null;

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } , body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { salir(); throw new Error(d.error || 'Ingresá de nuevo'); }
  if (!r.ok) throw new Error(d.error || 'Algo salió mal');
  return d;
}
function msg(id, txt, mal) { const m = $(id); m.textContent = txt; m.className = 'msg' + (mal ? ' mal' : ''); }

function mostrar(ok) { $('login').hidden = ok; $('panel').hidden = !ok; }
function salir() { token = ''; try { sessionStorage.removeItem('cocoTok'); } catch {} mostrar(false); }

// Achica la foto del celu (suele pesar varios MB) a 1000px
function achicar(file) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => fail(new Error('No se pudo leer la foto'));
    // data: URL en vez de blob:, porque la CSP (img-src 'self' data:) bloquea blob:
    const lector = new FileReader();
    lector.onload = () => { img.src = lector.result; };
    lector.onerror = () => fail(new Error('No se pudo leer la foto'));
    lector.readAsDataURL(file);
  });
}

function vistaPrevia(src) {
  const p = $('prev');
  p.hidden = !src; if (src) p.src = src;
  $('zona-txt').hidden = !!src;
}

function limpiarForm() {
  editando = null; fotoNueva = '';
  $('f-prod').reset(); vistaPrevia('');
  $('t-form').textContent = 'Subir un producto';
  $('guardar').textContent = 'Subir producto';
  $('cancelar').hidden = true;
}

// ---------- Selección y cambio de precios en masa ----------
const elegidos = new Set(); // ids tildados (se mantienen aunque cambies el filtro)
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function visibles() {
  const q = sinTildes($('buscar').value.trim()), cat = $('f-cat').value;
  return productos.filter((p) => (!cat || p.categoria === cat) && (!q || sinTildes(p.nombre).includes(q)));
}

// Lee el valor escrito: en % acepta decimales con coma ("7,5"); en pesos ignora puntos ("18.000")
function valorEscrito() {
  const t = $('valor').value.trim();
  if (!t) return null;
  const v = $('modo').value.endsWith('%') ? Number(t.replace(',', '.').replace(/[^\d.]/g, '')) : Number(t.replace(/\D/g, ''));
  return Number.isFinite(v) ? v : null;
}

// Precio nuevo para un producto según lo elegido en la barra (null = todavía no hay cambio válido)
function precioNuevo(p) {
  const modo = $('modo').value, v = valorEscrito();
  if (v === null) return null;
  const r = Number($('redondeo').value) || 1;
  const red = (x) => Math.max(0, Math.round(x / r) * r);
  if (modo === 'fijo') return Math.max(0, Math.round(v));
  if (!(p.precio > 0)) return null; // sin precio: no hay de dónde calcular
  if (modo === 'subir%') return red(p.precio * (1 + v / 100));
  if (modo === 'bajar%') return v >= 100 ? null : red(p.precio * (1 - v / 100));
  if (modo === 'sumar') return red(p.precio + v);
  if (modo === 'restar') return red(p.precio - v);
  return null;
}

function cambiosPendientes() {
  return productos.filter((p) => elegidos.has(p.id)).map((p) => ({ p, nuevo: precioNuevo(p) }))
    .filter((c) => c.nuevo !== null && c.nuevo !== p_precio(c.p));
}
const p_precio = (p) => Number(p.precio) || 0;

function pintarBarra() {
  const n = elegidos.size, bar = $('masivo');
  bar.hidden = !n; document.body.classList.toggle('con-masivo', !!n);
  const vis = visibles(), marcados = vis.filter((p) => elegidos.has(p.id)).length;
  $('todos').checked = vis.length > 0 && marcados === vis.length;
  $('todos').indeterminate = marcados > 0 && marcados < vis.length;
  $('todos-txt').textContent = $('buscar').value || $('f-cat').value ? `Seleccionar los ${vis.length} que se ven` : 'Seleccionar todos';
  if (!n) return;
  $('m-cant').textContent = n === 1 ? '1 seleccionado' : `${n} seleccionados`;
  const modo = $('modo').value, pct = modo.endsWith('%');
  $('valor').placeholder = modo === 'fijo' ? 'Ej: 18000' : pct ? 'Ej: 10' : 'Ej: 1000';
  $('redondeo').hidden = modo === 'fijo';
  const c = cambiosPendientes();
  $('aplicar').disabled = !c.length;
  $('aplicar').textContent = c.length ? `Cambiar ${c.length} precio${c.length > 1 ? 's' : ''}` : 'Aplicar';
  const sinPrecio = productos.filter((p) => elegidos.has(p.id) && !(p.precio > 0)).length;
  msg('m-masivo', modo !== 'fijo' && sinPrecio && valorEscrito() !== null ? `${sinPrecio} no tienen precio cargado y quedan igual.` : '');
}

function pintarTodo() { pintarLista(); pintarBarra(); }

function pintarLista() {
  const l = $('lista'); l.replaceChildren();
  if (!productos.length) {
    const p = document.createElement('p'); p.textContent = 'Todavía no cargaste productos. Subí el primero arriba.'; p.style.fontWeight = '600'; l.append(p); return;
  }
  const lista = visibles();
  if (!lista.length) {
    const p = document.createElement('p'); p.textContent = 'No hay productos que coincidan con la búsqueda.'; p.style.fontWeight = '600'; l.append(p); return;
  }
  lista.forEach((p) => {
    const f = document.createElement('div'); f.className = 'fila' + (elegidos.has(p.id) ? ' sel' : '');
    const lab = document.createElement('label');
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = elegidos.has(p.id);
    chk.setAttribute('aria-label', 'Seleccionar ' + p.nombre);
    chk.onchange = () => { if (chk.checked) elegidos.add(p.id); else elegidos.delete(p.id); pintarTodo(); };
    const img = document.createElement('img'); img.alt = '';
    if (p.imagen) img.src = p.imagen; else { img.src = '/img/mascota.svg'; img.className = 'vacia'; }
    const t = document.createElement('div');
    const b = document.createElement('b'); b.textContent = p.nombre;
    const s = document.createElement('small'); s.textContent = `${p.categoria} · ${p.precio > 0 ? peso.format(p.precio) : 'Sin precio'}${p.agotado ? ' · Agotado' : ''}`;
    t.append(b, s);
    if (elegidos.has(p.id)) {
      const n = precioNuevo(p);
      if (n !== null && n !== p_precio(p)) { const x = document.createElement('span'); x.className = 'nuevo'; x.textContent = '→ ' + peso.format(n); t.append(document.createElement('br'), x); }
    }
    lab.append(chk, img, t);
    const acc = document.createElement('div'); acc.className = 'acc';
    const mk = (txt, fn, cls) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = txt; if (cls) x.className = cls; x.onclick = fn; acc.append(x); };
    mk('Editar', () => editar(p));
    mk(p.agotado ? 'Hay stock' : 'Agotado', async () => { await api('/api/products/' + p.id, { method: 'PUT', body: { agotado: !p.agotado } }); cargar(); });
    mk('Borrar', async () => { if (confirm(`¿Borrar "${p.nombre}"? No se puede deshacer.`)) { await api('/api/products/' + p.id, { method: 'DELETE' }); cargar(); } }, 'borrar');
    f.append(lab, acc); l.append(f);
  });
}

async function guardarPrecios(cambios) {
  return api('/api/precios', { method: 'PUT', body: { cambios } });
}

$('aplicar').onclick = async () => {
  const c = cambiosPendientes();
  if (!c.length) return;
  if (!confirm(`¿Cambiar el precio de ${c.length} producto${c.length > 1 ? 's' : ''}?`)) return;
  const antes = c.map(({ p }) => ({ id: p.id, precio: p_precio(p) }));
  $('aplicar').disabled = true;
  try {
    await guardarPrecios(c.map(({ p, nuevo }) => ({ id: p.id, precio: nuevo })));
    elegidos.clear(); $('valor').value = '';
    await cargar();
    const m = $('m-lista'); m.className = 'msg';
    m.textContent = `Listo: ${c.length} precio${c.length > 1 ? 's' : ''} actualizado${c.length > 1 ? 's' : ''}.`;
    const d = document.createElement('button'); d.type = 'button'; d.className = 'deshacer'; d.textContent = 'Deshacer';
    d.onclick = async () => {
      d.disabled = true;
      try { await guardarPrecios(antes); await cargar(); msg('m-lista', 'Volvieron los precios de antes.'); }
      catch (er) { msg('m-lista', er.message, true); d.disabled = false; }
    };
    m.append(d);
  } catch (er) { msg('m-masivo', er.message, true); $('aplicar').disabled = false; }
};
$('desel').onclick = () => { elegidos.clear(); pintarTodo(); };
$('todos').onchange = () => {
  const vis = visibles();
  vis.forEach((p) => ($('todos').checked ? elegidos.add(p.id) : elegidos.delete(p.id)));
  pintarTodo();
};
['buscar', 'f-cat'].forEach((id) => $(id).addEventListener('input', pintarTodo));
['modo', 'valor', 'redondeo'].forEach((id) => $(id).addEventListener('input', pintarTodo));
$('valor').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('aplicar').click(); });
$('f-cat').append(...CATEGORIAS.map((c) => { const o = document.createElement('option'); o.textContent = c; return o; }));

function editar(p) {
  editando = p.id; fotoNueva = '';
  $('nombre').value = p.nombre; $('precio').value = p.precio || ''; $('cat').value = p.categoria;
  vistaPrevia(p.imagen);
  $('t-form').textContent = 'Editar producto';
  $('guardar').textContent = 'Guardar cambios';
  $('cancelar').hidden = false;
  $('f-prod').scrollIntoView({ behavior: 'smooth' });
}

async function cargar() {
  productos = await fetch('/api/products?t=' + Date.now()).then((r) => r.json());
  for (const id of elegidos) if (!productos.some((p) => p.id === id)) elegidos.delete(id); // se borró
  pintarTodo();
  const c = await fetch('/api/config?t=' + Date.now()).then((r) => r.json());
  $('wa').value = c.whatsapp || '';
}

function iniciar() {
  mostrar(true);
  cargar();
}

$('cat').replaceChildren(...CATEGORIAS.map((c) => { const o = document.createElement('option'); o.textContent = c; return o; }));

$('foto').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { fotoNueva = await achicar(f); vistaPrevia(fotoNueva); msg('m-prod', ''); } catch (er) { msg('m-prod', er.message, true); }
});
$('cancelar').onclick = () => { limpiarForm(); msg('m-prod', ''); };
$('salir').onclick = async () => { try { await api('/api/logout', { method: 'POST' }); } catch {} salir(); };

$('f-pass').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const d = await api('/api/password', { method: 'PUT', body: { actual: $('p-actual').value, nueva: $('p-nueva').value } });
    if (d.token) { token = d.token; try { sessionStorage.setItem('cocoTok', token); } catch {} } // en Netlify el cambio renueva la sesión
    $('f-pass').reset(); msg('m-pass', 'Contraseña cambiada. Las demás sesiones se cerraron.');
  } catch (er) { msg('m-pass', er.message, true); }
});

$('f-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const d = await api('/api/login', { method: 'POST', body: { password: $('pass').value } });
    token = d.token; try { sessionStorage.setItem('cocoTok', token); } catch {}
    $('pass').value = ''; msg('m-login', ''); iniciar();
  } catch (er) { msg('m-login', er.message, true); }
});

$('f-prod').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { nombre: $('nombre').value.trim(), precio: Number($('precio').value.replace(/\D/g, '')) || 0, categoria: $('cat').value };
  if (fotoNueva) body.foto = fotoNueva;
  $('guardar').disabled = true;
  try {
    if (editando) await api('/api/products/' + editando, { method: 'PUT', body });
    else await api('/api/products', { method: 'POST', body });
    msg('m-prod', editando ? 'Cambios guardados' : 'Producto subido. Ya está en la tienda.');
    limpiarForm(); await cargar();
  } catch (er) { msg('m-prod', er.message, true); }
  $('guardar').disabled = false;
});

$('f-conf').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/config', { method: 'PUT', body: { whatsapp: $('wa').value } }); msg('m-conf', 'Número guardado'); } catch (er) { msg('m-conf', er.message, true); }
});

// El servidor guarda las sesiones en memoria: si se reinició, el primer guardado pide entrar de nuevo.
mostrar(false);
if (token) iniciar();
