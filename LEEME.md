# Coco Store BA

Tienda + panel de productos (sin dependencias, solo Node 18+).

    cd cocostore
    node server.js

- Tienda: http://localhost:3000
- Panel:  http://localhost:3000/admin
- La primera vez que arranca genera una contraseña al azar y la muestra UNA vez en la consola: guardala. Se cambia desde el panel ("Cambiar contraseña").
- Alternativa: fijarla con `$env:ADMIN_PASS="tuclave-larga"; node server.js` (mín. 10 caracteres; en ese caso no se cambia desde el panel).
- Se guarda solo el hash en `data/admin.json`. Si la perdés, borrá ese archivo y reiniciá: genera una nueva.
- Seguridad: 5 intentos fallidos bloquean la IP 15 min, la sesión dura 8 h, y las fotos se validan. Al publicar en internet usá HTTPS (Render/Railway lo dan solo) y poné `TRUST_PROXY=1`.
- Productos en `data/products.json`, fotos en `uploads/`. Hacé copia de esas dos carpetas.
- Para publicarla en internet necesita un hosting que corra Node con disco persistente (Render, Railway, un VPS).
