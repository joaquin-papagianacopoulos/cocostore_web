// Se ejecuta en el build de Netlify (y a mano para probar en local: node scripts/netlify-prep.js).
// 1) Copia uploads/ a public/uploads/ para que las fotos iniciales las sirva el CDN.
// 2) Genera netlify/lib/generated.json con el catálogo inicial y el index.html, que las funciones
//    empaquetan. Se usa solo la primera vez: después el catálogo vive en Netlify Blobs.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch { return def; } };

const origen = path.join(root, 'uploads');
const destino = path.join(root, 'public', 'uploads');
fs.mkdirSync(destino, { recursive: true });
let n = 0;
if (fs.existsSync(origen)) for (const f of fs.readdirSync(origen)) { fs.copyFileSync(path.join(origen, f), path.join(destino, f)); n++; }

const out = path.join(root, 'netlify', 'lib');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'generated.json'), JSON.stringify({
  products: leer('data/products.json', []),
  config: leer('data/config.json', { whatsapp: '' }),
  indexHtml: fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8'),
}));
console.log(`netlify-prep: ${n} fotos copiadas, catálogo inicial generado`);
