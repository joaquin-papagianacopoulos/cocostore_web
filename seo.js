// SEO de Coco Store: páginas de producto con HTML ya armado en el servidor (Google no tiene que ejecutar JS),
// datos estructurados, sitemap y robots. Sin dependencias.
const WA_SVG = "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.300 1.200-1.800 1.200-.5.100-1 .2-3.300-.7-2.800-1.100-4.600-4-4.800-4.200-.1-.2-1.100-1.500-1.100-2.800s.7-2 1-2.300c.2-.3.500-.3.700-.3h.5c.2 0 .4 0 .6.500l.9 2.100c.1.200.1.400 0 .600l-.4.600c-.2.200-.3.400-.1.700.2.300.8 1.300 1.700 2.100 1.200 1 2.100 1.300 2.400 1.500.3.100.5.100.7-.1l1-1.200c.2-.3.400-.2.700-.1l2 1c.3.100.5.200.5.300.1.200.1.800-.1 1.400Z\"/></svg>";
const NOMBRE = 'Coco Store BA';
const peso = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON dentro de <script>: evita que un "</script>" en un nombre cierre el bloque
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' y ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'producto';
}

// Agrega p.slug a cada producto. El slug limpio se lo queda el más antiguo, así las URLs no cambian al cargar productos nuevos.
function conSlugs(lista) {
  const usados = new Set(), por = new Map();
  [...lista].sort((a, b) => (a.creado || 0) - (b.creado || 0)).forEach((p) => {
    let s = slugify(p.nombre);
    if (usados.has(s)) s = `${s}-${String(p.id).slice(0, 4)}`;
    usados.add(s); por.set(p.id, s);
  });
  return lista.map((p) => ({ ...p, slug: por.get(p.id) }));
}

const abs = (base, ruta) => (ruta ? (/^https?:/.test(ruta) ? ruta : base + ruta) : base + '/img/mascota.png');
const marca = (n) => (/^elf\s?bar/i.test(n) ? 'Elf Bar' : NOMBRE);

function ofertaLd(p, base) {
  if (!(p.precio > 0)) return undefined;
  return { '@type': 'Offer', url: `${base}/p/${p.slug}`, priceCurrency: 'ARS', price: String(Math.round(p.precio)),
    availability: p.agotado ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: NOMBRE } };
}

function tarjetaHtml(p) {
  const img = p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy">` : '<img class="vacia" src="/img/mascota.svg" alt="" loading="lazy">';
  return `<article class="prod${p.agotado ? ' agotado' : ''}"><div class="foto">${img}${p.agotado ? '<span class="cinta">Agotado</span>' : ''}</div>` +
    `<div class="info"><span class="cat-nombre">${esc(p.categoria)}</span><h3><a href="/p/${esc(p.slug)}">${esc(p.nombre)}</a></h3>` +
    `<div class="precio">${p.precio > 0 ? peso.format(p.precio) : 'Consultar precio'}</div></div></article>`;
}

function waLink(whatsapp, msg) {
  return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}` : 'https://ig.me/m/cocostoreba';
}

// ---------- Home ----------
function home(html, { base, productos, whatsapp }) {
  const hayIceKing = productos.some((p) => /ice\s?king/i.test(p.nombre));
  const titulo = (hayIceKing ? 'Elfbar Ice King 40K y vapes descartables' : 'Vapes descartables, pods y perfumes') + ' en Buenos Aires | ' + NOMBRE;
  const desc = (hayIceKing ? 'Comprá Elfbar Ice King 40K, vapes descartables, pods y perfumes en Buenos Aires. ' : 'Vapes descartables, recargables, pods, líquidos y perfumes en Buenos Aires. ') +
    'Envíos a todo el país y moto en CABA y GBA. Pedí por WhatsApp.';
  const og = abs(base, (productos.find((p) => p.imagen) || {}).imagen);
  const head = `<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${base}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="${NOMBRE}"><meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${base}/"><meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
${jsonLd({ '@context': 'https://schema.org', '@type': 'Store', name: NOMBRE, url: base + '/', image: base + '/img/logo.png',
    areaServed: 'AR', sameAs: ['https://www.instagram.com/cocostoreba/'] })}
${jsonLd({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: productos.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/p/${p.slug}`, name: p.nombre })) })}`;
  return html
    .replace(/<title>[^<]*<\/title>\s*<meta name="description"[^>]*>/, head)
    .replace('<div class="grilla" id="grilla" aria-live="polite"></div>', `<div class="grilla" id="grilla" aria-live="polite">${productos.map(tarjetaHtml).join('')}</div>`);
}

// ---------- Producto ----------
function producto(p, { base, productos, whatsapp }) {
  const url = `${base}/p/${p.slug}`;
  const precioTxt = p.precio > 0 ? peso.format(p.precio) : '';
  const titulo = `${p.nombre} | ${NOMBRE}`;
  const desc = `${p.nombre}${precioTxt ? ' a ' + precioTxt : ''} en ${NOMBRE}. ${p.agotado ? 'Sin stock por el momento.' : 'Disponible.'} Envíos a todo el país y moto en CABA y GBA. Pedilo por WhatsApp.`;
  const img = abs(base, p.imagen);
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.nombre, image: [img], description: desc, sku: String(p.id),
    category: p.categoria, brand: { '@type': 'Brand', name: marca(p.nombre) }, offers: ofertaLd(p, base) };
  const migas = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: base + '/' },
    { '@type': 'ListItem', position: 2, name: p.categoria, item: base + '/' },
    { '@type': 'ListItem', position: 3, name: p.nombre, item: url }] };
  const msg = `Hola ${NOMBRE}! Quiero pedir: ${p.nombre}${precioTxt ? ' (' + precioTxt + ')' : ''}`;
  const relacionados = productos.filter((x) => x.id !== p.id).sort((a, b) => (b.categoria === p.categoria) - (a.categoria === p.categoria)).slice(0, 8);
  const foto = p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" width="900" height="900">` : '<img class="vacia" src="/img/mascota.svg" alt="">';
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/img/mascota.svg">
<meta property="og:type" content="product"><meta property="og:site_name" content="${NOMBRE}"><meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
${jsonLd(ld)}
${jsonLd(migas)}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/producto.css">
</head>
<body>
<div class="edad" id="edad" hidden role="dialog" aria-modal="true" aria-labelledby="edad-t">
  <div>
    <img src="/img/mascota.svg" alt="">
    <h2 id="edad-t">¿Sos mayor de 18?</h2>
    <p>Los productos de esta tienda son solo para adultos.</p>
    <div class="fila">
      <button class="btn negro" id="edad-si">Sí, soy mayor</button>
      <a class="btn blanco" style="background:#fff;color:#000" href="https://www.google.com">No</a>
    </div>
  </div>
</div>
<div class="aviso">Envíos a todo el país · <b>Moto en CABA y GBA</b></div>
<header class="cab"><div class="wrap">
  <a class="logo" href="/" aria-label="${NOMBRE}, inicio"><img src="/img/logo.svg" alt="${NOMBRE}"></a>
  <a class="btn" href="${esc(waLink(whatsapp, msg))}" target="_blank" rel="noopener" aria-label="Escribinos por WhatsApp">${WA_SVG}<span>Escribinos</span></a>
</div></header>
<main class="wrap">
  <nav class="migas" aria-label="Ruta"><a href="/">Inicio</a> › <a href="/">${esc(p.categoria)}</a> › <span>${esc(p.nombre)}</span></nav>
  <article class="ficha">
    <div class="ficha-foto">${foto}</div>
    <div class="ficha-info">
      <span class="cat-nombre">${esc(p.categoria)}</span>
      <h1>${esc(p.nombre)}</h1>
      <div class="precio">${precioTxt || 'Consultar precio'}</div>
      <p class="estado ${p.agotado ? 'no' : 'si'}">${p.agotado ? 'Sin stock por el momento' : 'Disponible'}</p>
      <a class="btn negro" ${p.agotado ? 'aria-disabled="true"' : ''} href="${esc(waLink(whatsapp, msg))}" target="_blank" rel="noopener">${p.agotado ? 'Consultar disponibilidad' : 'Pedir por WhatsApp'}</a>
      <p class="texto">${esc(p.nombre)} en ${NOMBRE}. Se abre WhatsApp con el pedido listo y confirmamos stock y forma de pago. Moto en CABA y GBA, o envío a todo el país.</p>
    </div>
  </article>
  ${relacionados.length ? `<section class="otros"><h2>Más productos</h2><div class="grilla">${relacionados.map(tarjetaHtml).join('')}</div></section>` : ''}
</main>
<footer><div class="wrap"><div><img src="/img/logo.svg" alt="${NOMBRE}"></div><div><h4>Contacto</h4><a href="https://www.instagram.com/cocostoreba/" target="_blank" rel="noopener">Instagram @cocostoreba</a><a href="/">Ver toda la tienda</a></div>
<p class="legal">Venta exclusiva a mayores de 18 años. Los precios y el stock pueden cambiar sin aviso.</p></div></footer>
<script src="/edad.js"></script>
</body>
</html>`;
}

function noEncontrado() {
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex"><title>Producto no encontrado | ${NOMBRE}</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/producto.css"></head>
<body><main class="wrap" style="padding-block:60px;text-align:center"><h1>No encontramos ese producto</h1><p style="margin:12px 0 24px">Puede que ya no esté disponible.</p><a class="btn negro" href="/">Ver la tienda</a></main></body></html>`;
}

function sitemap(base, productos) {
  const f = (t) => new Date(t || Date.now()).toISOString().slice(0, 10);
  const u = [`<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...productos.map((p) => `<url><loc>${esc(base + '/p/' + p.slug)}</loc><lastmod>${f(p.creado)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${u.join('\n')}\n</urlset>\n`;
}

const robots = (base) => `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`;

module.exports = { conSlugs, home, producto, noEncontrado, sitemap, robots };
