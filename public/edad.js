// Verificación +18 en las páginas de producto (se recuerda en este dispositivo, igual que en la home)
try {
  if (localStorage.getItem('coco18') !== '1') {
    const m = document.getElementById('edad'), b = document.getElementById('edad-si');
    m.hidden = false; b.focus();
    b.onclick = () => { try { localStorage.setItem('coco18', '1'); } catch {} m.hidden = true; };
  }
} catch { /* sin storage: no se muestra el cartel */ }
