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
// Texto alternativo de las fotos: describe qué es el producto (lo que Google Imágenes lee)
const altDe = (p) => {
  const n = String(p.nombre).replace(/\s+/g, ' ').trim();
  if (p.categoria === 'Descartables') return `Vape descartable ${n} – Coco Store BA`;
  if (p.categoria === 'Perfumes') return `Perfume ${n} original – Coco Store BA`;
  return `${n} – Coco Store BA`;
};
const marca = (n) => (/^elf\s?bar/i.test(n) ? 'Elf Bar' : NOMBRE);

function ofertaLd(p, base) {
  if (!(p.precio > 0)) return undefined;
  return { '@type': 'Offer', url: `${base}/p/${p.slug}`, priceCurrency: 'ARS', price: String(Math.round(p.precio)),
    availability: p.agotado ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: NOMBRE } };
}

function tarjetaHtml(p) {
  const img = p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(altDe(p))}" loading="lazy">` : '<img class="vacia" src="/img/mascota.svg" alt="" loading="lazy">';
  return `<article class="prod${p.agotado ? ' agotado' : ''}"><div class="foto">${img}${p.agotado ? '<span class="cinta">Agotado</span>' : ''}</div>` +
    `<div class="info"><span class="cat-nombre">${esc(p.categoria)}</span><h3><a href="/p/${esc(p.slug)}">${esc(p.nombre)}</a></h3>` +
    `<div class="precio">${p.precio > 0 ? peso.format(p.precio) : 'Consultar precio'}</div></div></article>`;
}

function waLink(whatsapp, msg) {
  return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}` : 'https://ig.me/m/cocostoreba';
}

// ---------- Home ----------
function home(html, { base, productos, whatsapp }) {
  const titulo = `Vapes y pods descartables en Buenos Aires | Elfbar, Ignite | ${NOMBRE}`;
  const desc = 'Vapers y pods descartables originales en Buenos Aires: Elf Bar Ice King 40K, Ignite, Dinner Lady, The Black Sheep y perfumes importados. Envío en el día en CABA y GBA. Pedí por WhatsApp.';
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
    .replace('<p class="seo-links" id="seo-links"></p>', `<p class="seo-links chips" id="seo-links">${coleccionesCon(productos).map((c) => `<a class="chip" href="/${c.slug}">${esc(c.nombre)}</a>`).join('')}</p>`)
    .replace('<div class="grilla" id="grilla" aria-live="polite"></div>', `<div class="grilla" id="grilla" aria-live="polite">${[...productos].sort((a, b) => !!a.agotado - !!b.agotado).map(tarjetaHtml).join('')}</div>`);
}

// ---------- Colecciones: páginas por categoría y por marca (una página para cada búsqueda) ----------
// Si agregás una, sumá también su ruta a netlify/functions/pages.mjs (config.path).
const COLECCIONES = [
  { slug: 'vapes-descartables', nombre: 'Vapes descartables', filtro: (p) => p.categoria === 'Descartables',
    titulo: 'Vapes y vapers descartables en Buenos Aires con envío en el día',
    h1: 'Vapes descartables en Buenos Aires',
    faq: [
      ['¿Cuánto dura un vape descartable?', 'Depende del modelo: se mide en pitadas. Un Elfbar Ice King 40K llega a unas 40.000 pitadas y un Dinner Lady 50K a unas 50.000. En uso diario, un equipo grande puede durar varias semanas.'],
      ['¿Los vapes descartables se cargan?', 'Los modelos de gran duración como Elfbar Ice King 40K, EBCREATE y Dinner Lady traen batería recargable por USB-C. Cuando se termina el líquido, se tiran.'],
      ['¿Hacen envíos?', 'Sí. En CABA y GBA enviamos en el día en moto si pedís antes de las 18 h, y despachamos al resto del país por correo con número de seguimiento.'],
      ['¿Cómo se paga?', 'En efectivo o por transferencia. Armás el pedido y confirmamos stock, zona y forma de pago por WhatsApp.'],
      ['¿Los productos son originales?', 'Sí, todos son originales y llegan sellados.']],
    intro: 'Comprá vapes descartables originales en CABA y GBA: Elfbar Ice King 40K, Ignite V400, Dinner Lady 50K, The Black Sheep y más. Pedí por WhatsApp antes de las 18 h y lo recibís hoy en moto.',
    texto: ['Todos nuestros vapes descartables son originales y vienen sellados. Trabajamos con las marcas más pedidas en Argentina y sumamos sabores nuevos todas las semanas.',
      'Hacemos envío en el día en moto por toda la Ciudad de Buenos Aires y el Gran Buenos Aires, y despachamos por correo al resto del país con número de seguimiento.'] },
  { slug: 'pods-descartables', nombre: 'Pods descartables', filtro: (p) => p.categoria === 'Descartables',
    titulo: 'Pods descartables en Buenos Aires: Elfbar, Ignite y más, envío en el día',
    h1: 'Pods descartables en Buenos Aires',
    intro: 'Pods descartables originales de Elfbar, Ignite, Dinner Lady y The Black Sheep, con sabores frutales y con hielo. Envío en el día en CABA y GBA y a todo el país.',
    texto: ['Un pod descartable es un vape listo para usar: viene cargado con líquido y batería, sin mantenimiento ni recargas de líquido. Es la forma más simple de empezar o de tener siempre a mano tu sabor favorito.',
      'Elegí por duración (de 30K a 50K pitadas), por marca o por sabor. Tocá “Pedir” y se abre WhatsApp con el pedido listo; si pedís antes de las 18 h lo recibís hoy.'],
    faq: [
      ['¿Qué es un pod descartable?', 'Es un vape de un solo uso que ya trae líquido y batería. No hay que armar ni rellenar nada.'],
      ['¿Cuál es la diferencia entre un pod descartable y un vape recargable?', 'El descartable se usa hasta que se termina el líquido y se tira. El recargable permite cambiar cartuchos o rellenar el líquido.'],
      ['¿Qué marcas de pods descartables tienen?', 'Trabajamos con Elfbar (Ice King 40K y EBCREATE), Ignite V400, Dinner Lady 50K y The Black Sheep.'],
      ['¿Cuánto tarda el envío?', 'En CABA y GBA llega en el día si pedís antes de las 18 h. Al interior, por correo con seguimiento.']] },
  { slug: 'elfbar', nombre: 'Elfbar', filtro: (p) => /elf\s?bar/i.test(p.nombre),
    titulo: 'Elfbar en Argentina: Ice King 40K y EBCREATE, precio y envío en el día',
    h1: 'Elfbar en Buenos Aires: Ice King 40K y EBCREATE',
    faq: [
      ['¿Cuántas pitadas tiene el Elf Bar Ice King 40K?', 'Hasta 40.000 pitadas, con pantalla que muestra batería y nivel de líquido, y carga por USB-C.'],
      ['¿Qué diferencia hay entre Elfbar Ice King y EBCREATE?', 'Los dos son descartables de larga duración. El Ice King se destaca por sus sabores con hielo; el EBCREATE tiene un catálogo amplio de sabores frutales. Consultanos cuál tenemos en stock.'],
      ['¿Cuánto sale un Elfbar en Argentina?', 'El precio figura en cada producto de esta página y se actualiza con el stock. Pagás en efectivo o transferencia.'],
      ['¿Hacen envío en el día?', 'Sí, en CABA y GBA pidiendo antes de las 18 h. Al resto del país enviamos por correo.']],
    intro: 'Elfbar Ice King 40K y Elfbar EBCREATE originales, con todos los sabores disponibles en stock. Envío en el día en CABA y GBA.',
    texto: ['El Elfbar Ice King 40K es uno de los vapes descartables más vendidos de Argentina: hasta 40.000 pitadas, pantalla de batería y sabores frutales con y sin hielo.',
      'Elegí tu sabor, tocá “Pedir” y se abre WhatsApp con el pedido listo. Si pedís antes de las 18 h te lo llevamos hoy.'] },
  { slug: 'ignite', nombre: 'Ignite', filtro: (p) => /ignite/i.test(p.nombre),
    titulo: 'Ignite V400 en Buenos Aires: precio y envío en el día',
    h1: 'Ignite V400 en Buenos Aires',
    intro: 'Vapes Ignite V400 Mix originales con dos sabores en un mismo equipo. Envío en el día en CABA y GBA.',
    texto: ['El Ignite V400 Mix trae dos sabores que podés alternar, ideal si te aburrís de uno solo. Consultanos por WhatsApp los sabores que entraron esta semana.'] },
  { slug: 'dinner-lady', nombre: 'Dinner Lady', filtro: (p) => /dinner\s?lady/i.test(p.nombre),
    titulo: 'Dinner Lady 50K en Buenos Aires: precio y envío en el día',
    h1: 'Dinner Lady 50K en Buenos Aires',
    intro: 'Vapes Dinner Lady 50K originales con doble sabor. Envío en el día en CABA y GBA y a todo el país.',
    texto: ['El Dinner Lady 50K combina dos sabores en un solo descartable de gran duración. Pedilo por WhatsApp y te lo llevamos hoy si pedís antes de las 18 h.'] },
  { slug: 'the-black-sheep', nombre: 'The Black Sheep', filtro: (p) => /black\s?sheep/i.test(p.nombre),
    titulo: 'The Black Sheep 30K e Ice Master en Buenos Aires: precio y envío en el día',
    h1: 'The Black Sheep 30K e Ice Master en Buenos Aires',
    intro: 'Vapes The Black Sheep 30K y The Black Sheep Ice Master originales, con doble sabor. Envío en el día en CABA y GBA.',
    texto: ['La línea The Black Sheep tiene dos sabores por equipo y la versión Ice Master suma un golpe de frío extra. Elegí tu combinación y pedila por WhatsApp.'] },
  { slug: 'perfumes', nombre: 'Perfumes', filtro: (p) => p.categoria === 'Perfumes',
    titulo: 'Perfumes importados en Buenos Aires: árabes, de nicho y de diseñador',
    h1: 'Perfumes importados en Buenos Aires',
    intro: 'Perfumes originales importados: árabes de Lattafa y Rasasi y de diseñador como Paco Rabanne, Lancôme, Jean Paul Gaultier y Armani. Envío en el día en CABA y GBA.',
    texto: ['Todos los perfumes son originales y vienen sellados en su caja. Si tenés dudas sobre una fragancia, escribinos y te asesoramos por WhatsApp.'] },
  { slug: 'perfumes-arabes', nombre: 'Perfumes árabes', filtro: (p) => p.categoria === 'Perfumes' && /lattafa|rasasi|hawas|bade.?e|al oud|yara|qaed|jasoor|armaf|afnan/i.test(p.nombre),
    titulo: 'Perfumes árabes originales en Buenos Aires: Lattafa y Rasasi',
    h1: 'Perfumes árabes en Buenos Aires',
    intro: 'Perfumes árabes originales: Lattafa Yara, Bade’e Al Oud, Qaed Al Fursan, Rasasi Hawas y más. Envío en el día en CABA y GBA.',
    texto: ['Los perfumes árabes se hicieron famosos por su duración y su relación precio-calidad. Tenemos los más buscados de Lattafa y Rasasi, originales y sellados.'] },
];

const coleccionesCon = (productos) => COLECCIONES.filter((c) => productos.some(c.filtro));
const slugCategoria = (cat) => (cat === 'Descartables' ? 'vapes-descartables' : cat === 'Perfumes' ? 'perfumes' : '');

// Esqueleto común de las páginas armadas en el servidor (ficha de producto y colecciones)
function marco({ titulo, desc, url, img, tipo, ld, cuerpo, whatsapp, msg, productos }) {
  const enlaces = coleccionesCon(productos).map((c) => `<a href="/${c.slug}">${esc(c.nombre)}</a>`).join('');
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/img/mascota.svg">
<meta property="og:type" content="${tipo}"><meta property="og:site_name" content="${NOMBRE}"><meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
${ld.map(jsonLd).join('\n')}
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
<div class="aviso"><span class="largo"><b>Envío en el día</b> en CABA y GBA pidiendo antes de las 18 h</span><span class="corto"><b>Llega hoy</b> pidiendo antes de las 18 h</span><span class="sep" aria-hidden="true">·</span><span class="extra">Productos <b>100% originales</b></span></div>
<header class="cab"><div class="wrap">
  <a class="logo" href="/" aria-label="${NOMBRE}, inicio"><img src="/img/logo.svg" alt="${NOMBRE}"></a>
  <a class="btn" href="${esc(waLink(whatsapp, msg))}" target="_blank" rel="noopener" aria-label="Escribinos por WhatsApp">${WA_SVG}<span>Escribinos</span></a>
</div>
<nav class="nav" aria-label="Categorías"><div class="wrap"><a href="/">Todos</a>${enlaces}</div></nav></header>
<main class="wrap">
${cuerpo}
</main>
<footer><div class="wrap"><div><img src="/img/logo.svg" alt="${NOMBRE}"><p style="margin-top:14px;max-width:26em">Vapes originales y perfumes importados. Envío en el día en CABA y GBA y a todo el país.</p></div>
<div><h4>Categorías</h4>${enlaces}</div>
<div><h4>Contacto</h4><a href="${esc(waLink(whatsapp, 'Hola Coco Store! Quería hacer una consulta.'))}" target="_blank" rel="noopener">WhatsApp</a><a href="https://www.instagram.com/cocostoreba/" target="_blank" rel="noopener">Instagram @cocostoreba</a><a href="/">Ver toda la tienda</a></div>
<p class="legal">Venta exclusiva a mayores de 18 años. Los precios y el stock pueden cambiar sin aviso.</p></div></footer>
<script src="/edad.js"></script>
</body>
</html>`;
}

// ---------- Producto ----------
function producto(p, { base, productos, whatsapp }) {
  const url = `${base}/p/${p.slug}`;
  const precioTxt = p.precio > 0 ? peso.format(p.precio) : '';
  const tipoTxt = p.categoria === 'Descartables' ? 'Vape descartable ' : p.categoria === 'Perfumes' ? 'Perfume ' : '';
  const titulo = `${tipoTxt}${p.nombre}${precioTxt ? ' – ' + precioTxt : ''} | Envío en el día | ${NOMBRE}`;
  const desc = `Comprá ${tipoTxt.toLowerCase()}${p.nombre}${precioTxt ? ' a ' + precioTxt : ''} en ${NOMBRE}. ${p.agotado ? 'Sin stock por el momento.' : 'Original y en stock.'} Envío en el día en CABA y GBA y a todo el país. Pedilo por WhatsApp.`;
  const img = abs(base, p.imagen);
  const col = COLECCIONES.find((c) => c.slug === slugCategoria(p.categoria));
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.nombre, image: [img], description: desc, sku: String(p.id),
    category: p.categoria, brand: { '@type': 'Brand', name: marca(p.nombre) }, offers: ofertaLd(p, base) };
  const migas = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: base + '/' },
    { '@type': 'ListItem', position: 2, name: col ? col.nombre : p.categoria, item: col ? `${base}/${col.slug}` : base + '/' },
    { '@type': 'ListItem', position: 3, name: p.nombre, item: url }] };
  const msg = `Hola ${NOMBRE}! Quiero pedir: ${p.nombre}${precioTxt ? ' (' + precioTxt + ')' : ''}. ¿Me lo pueden mandar hoy? Mi zona es: `;
  const relacionados = productos.filter((x) => x.id !== p.id).sort((a, b) => !!a.agotado - !!b.agotado || (b.categoria === p.categoria) - (a.categoria === p.categoria)).slice(0, 8);
  const foto = p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(altDe(p))}" width="900" height="900">` : '<img class="vacia" src="/img/mascota.svg" alt="">';
  const cuerpo = `  <nav class="migas" aria-label="Ruta"><a href="/">Inicio</a> › <a href="${col ? '/' + col.slug : '/'}">${esc(col ? col.nombre : p.categoria)}</a> › <span>${esc(p.nombre)}</span></nav>
  <article class="ficha">
    <div class="ficha-foto">${foto}</div>
    <div class="ficha-info">
      <span class="cat-nombre">${esc(p.categoria)}</span>
      <h1>${esc(p.nombre)}</h1>
      <div class="precio">${precioTxt || 'Consultar precio'}</div>
      <p class="estado ${p.agotado ? 'no' : 'si'}">${p.agotado ? 'Sin stock por el momento' : 'Disponible'}</p>
      <a class="btn negro" ${p.agotado ? 'aria-disabled="true"' : ''} href="${esc(waLink(whatsapp, msg))}" target="_blank" rel="noopener">${p.agotado ? 'Consultar disponibilidad' : 'Pedir por WhatsApp'}</a>
      ${p.agotado ? '' : '<ul class="garantias"><li><b>Llega hoy</b> en moto a CABA y GBA pidiendo antes de las 18 h</li><li><b>Original</b> y sellado</li><li><b>Pagás fácil:</b> efectivo o transferencia</li><li><b>Envíos a todo el país</b> con seguimiento</li></ul>'}
      <p class="texto">${esc(p.nombre)} en ${NOMBRE}. Se abre WhatsApp con el pedido listo y confirmamos stock, zona y forma de pago.</p>
    </div>
  </article>
  ${relacionados.length ? `<section class="otros"><h2>Más productos</h2><div class="grilla">${relacionados.map(tarjetaHtml).join('')}</div></section>` : ''}`;
  return marco({ titulo, desc, url, img, tipo: 'product', ld: [ld, migas], cuerpo, whatsapp, msg, productos });
}

// ---------- Colección ----------
function coleccion(slug, { base, productos, whatsapp }) {
  const c = COLECCIONES.find((x) => x.slug === slug);
  if (!c) return null;
  const lista = productos.filter(c.filtro).sort((a, b) => !!a.agotado - !!b.agotado);
  if (!lista.length) return null;
  const url = `${base}/${c.slug}`;
  const conPrecio = lista.filter((p) => p.precio > 0 && !p.agotado).map((p) => p.precio);
  const desde = conPrecio.length ? ` Desde ${peso.format(Math.min(...conPrecio))}.` : '';
  const desc = c.intro + desde;
  const img = abs(base, (lista.find((p) => p.imagen) || {}).imagen);
  const msg = `Hola ${NOMBRE}! Quería consultar por ${c.nombre}. ¿Me lo pueden mandar hoy? Mi zona es: `;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.h1, url, description: desc,
      mainEntity: { '@type': 'ItemList', itemListElement: lista.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/p/${p.slug}`, name: p.nombre })) } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: base + '/' },
      { '@type': 'ListItem', position: 2, name: c.nombre, item: url }] }];
  if (c.faq) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  const faqHtml = c.faq ? `<section class="col-texto"><h2>Preguntas frecuentes sobre ${esc(c.nombre.toLowerCase())}</h2>${c.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}</section>` : '';
  const otras = coleccionesCon(productos).filter((x) => x.slug !== c.slug).map((x) => `<a class="chip" href="/${x.slug}">${esc(x.nombre)}</a>`).join('');
  const cuerpo = `  <nav class="migas" aria-label="Ruta"><a href="/">Inicio</a> › <span>${esc(c.nombre)}</span></nav>
  <header class="col-cab">
    <h1>${esc(c.h1)}</h1>
    <p>${esc(c.intro)}${esc(desde)}</p>
    <a class="btn negro" href="${esc(waLink(whatsapp, msg))}" target="_blank" rel="noopener">Pedir por WhatsApp</a>
  </header>
  <section class="col-prod"><h2 class="sr">${lista.length} productos</h2><div class="grilla">${lista.map(tarjetaHtml).join('')}</div></section>
  <section class="col-texto">
    <h2>Sobre ${esc(c.nombre)} en ${NOMBRE}</h2>
    ${c.texto.map((t) => `<p>${esc(t)}</p>`).join('\n    ')}
    ${otras ? `<p class="chips">Mirá también: ${otras}</p>` : ''}
  </section>
  ${faqHtml}`;
  return marco({ titulo: `${c.titulo} | ${NOMBRE}`, desc, url, img, tipo: 'website', ld, cuerpo, whatsapp, msg, productos });
}

function noEncontrado() {
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex"><title>Producto no encontrado | ${NOMBRE}</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/producto.css"></head>
<body><main class="wrap" style="padding-block:60px;text-align:center"><h1>No encontramos ese producto</h1><p style="margin:12px 0 24px">Puede que ya no esté disponible.</p><a class="btn negro" href="/">Ver la tienda</a></main></body></html>`;
}

function sitemap(base, productos) {
  const f = (t) => new Date(t || Date.now()).toISOString().slice(0, 10);
  const u = [`<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...coleccionesCon(productos).map((c) => `<url><loc>${base}/${c.slug}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`),
    ...productos.map((p) => `<url><loc>${esc(base + '/p/' + p.slug)}</loc><lastmod>${f(p.creado)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${u.join('\n')}\n</urlset>\n`;
}

const robots = (base) => `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`;

module.exports = { conSlugs, home, producto, coleccion, COLECCIONES, noEncontrado, sitemap, robots };
