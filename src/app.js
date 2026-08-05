const API_URL = 'https://super-compara-poc-production.up.railway.app/api/productos/real';
const STORAGE_KEY = 'superCompara:v1';

let currentFetchController = null;
let debounceTimer = null;
let currentProducts = [];
let selectedStore = 'Lider Real';
let activeCartStore = 'Lider Real';
let carts = { 'Lider Real': [], 'Jumbo Real': [] };

// Cached DOM
let el = {};

init();

function init() {
  el.searchInput = document.getElementById('searchInput');
  el.storeSelect = document.getElementById('storeSelect');
  el.searchButton = document.getElementById('searchButton');
  el.productsContainer = document.getElementById('productsContainer');
  el.cartList = document.getElementById('cartList');
  el.cartCount = document.getElementById('cartCount');
  el.cartTotal = document.getElementById('cartTotal');
  el.totalLider = document.getElementById('total-Lider');
  el.totalJumbo = document.getElementById('total-Jumbo');
  el.cheapestStore = document.getElementById('cheapestStore');
  el.status = document.getElementById('status');
  el.tabLider = document.getElementById('tab-Lider');
  el.tabJumbo = document.getElementById('tab-Jumbo');
  el.clearCartBtn = document.getElementById('clearCart');

  // Events
  el.searchInput.addEventListener('keyup', () => debounceFilter());
  el.searchButton.addEventListener('click', buscarAhora);
  el.storeSelect.addEventListener('change', changeStore);
  el.tabLider.addEventListener('click', () => showCart('Lider Real'));
  el.tabJumbo.addEventListener('click', () => showCart('Jumbo Real'));
  el.clearCartBtn.addEventListener('click', clearCurrentCart);

  // Delegation: add to cart from products
  el.productsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    addToCart(btn.dataset.id);
  });

  // Delegation: cart actions (plus, minus, remove)
  el.cartList.addEventListener('click', (e) => {
    const plus = e.target.closest('button[data-action="plus"]');
    if (plus) return changeQuantity(plus.dataset.id, 1);
    const minus = e.target.closest('button[data-action="minus"]');
    if (minus) return changeQuantity(minus.dataset.id, -1);
    const remove = e.target.closest('button[data-action="remove"]');
    if (remove) return removeFromCart(remove.dataset.id);
  });

  loadCarts();
  renderCart();
  loadProducts();
}

function showStatus(message, { error = false, hideAfter = 4000 } = {}) {
  if (!el.status) return;
  el.status.style.display = message ? 'block' : 'none';
  el.status.textContent = message || '';
  el.status.classList.toggle('error', !!error);
  if (message && hideAfter) {
    setTimeout(() => {
      // only hide if content unchanged
      if (el.status.textContent === message) el.status.style.display = 'none';
    }, hideAfter);
  }
}

function debounceFilter() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    loadProducts(el.searchInput.value.trim());
  }, 500);
}

async function loadProducts(query = '') {
  el.productsContainer.innerHTML = '<p class="message">Cargando productos...</p>';
  showStatus('Cargando productos...');

  if (currentFetchController) currentFetchController.abort();
  currentFetchController = new AbortController();

  try {
    const res = await fetch(`${API_URL}?q=${encodeURIComponent(query)}`, {
      signal: currentFetchController.signal,
      headers: { 'Accept': 'application/json' }
    });

    const ct = res.headers.get('content-type') || '';

    if (!res.ok) {
      const body = ct.includes('application/json') ? await res.json().catch(() => null) : null;
      const msg = body?.error || body?.detail || `Error ${res.status}`;
      el.productsContainer.innerHTML = `<p class="message error">${escapeHtml(msg)}</p>`;
      showStatus(msg, { error: true });
      return;
    }

    if (!ct.includes('application/json')) {
      const msg = 'Respuesta del servidor no es JSON.';
      el.productsContainer.innerHTML = `<p class="message error">${escapeHtml(msg)}</p>`;
      showStatus(msg, { error: true });
      return;
    }

    const products = await res.json();
    currentProducts = Array.isArray(products) ? products : [];
    renderProducts();
    showStatus('Productos cargados', { hideAfter: 1200 });
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    el.productsContainer.innerHTML = `<p class="message error">Error de conexión con el backend.</p>`;
    showStatus('Error de conexión con el backend.', { error: true });
  } finally {
    currentFetchController = null;
  }
}

function renderProducts() {
  const container = el.productsContainer;
  container.innerHTML = '';

  const filtered = currentProducts.filter(product => {
    const p = Number(product.prices && product.prices[selectedStore]);
    return Number.isFinite(p) && p > 0;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="message">No hay productos con precio para ${escapeHtml(storeShort(selectedStore))}.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();

  filtered.forEach(product => {
    const price = Number(product.prices[selectedStore]);
    const link = product.links && product.links[selectedStore];

    const card = document.createElement('div');
    card.className = 'product-card';

    const img = document.createElement('img');
    img.className = 'product-image';
    if (product.image) {
      img.src = product.image;
      img.alt = product.name || 'Imagen del producto';
      img.loading = 'lazy';
    } else {
      img.alt = '';
      img.style.background = '#fafafa';
    }

    const name = document.createElement('div');
    name.className = 'product-name';
    name.textContent = product.name || '';

    const store = document.createElement('div');
    store.className = 'product-store';
    store.textContent = storeShort(selectedStore);

    const priceEl = document.createElement('div');
    priceEl.className = 'price';
    priceEl.textContent = formatPrice(price);

    const linkEl = document.createElement('div');
    if (link) {
      const a = document.createElement('a');
      a.className = 'product-link';
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Ver producto';
      linkEl.appendChild(a);
    }

    const btn = document.createElement('button');
    btn.className = 'add-button';
    btn.dataset.id = product.id;
    btn.textContent = 'Agregar al carrito';

    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(store);
    card.appendChild(priceEl);
    if (link) card.appendChild(linkEl);
    card.appendChild(btn);

    frag.appendChild(card);
  });

  container.appendChild(frag);
}

function addToCart(productId) {
  const product = currentProducts.find(item => String(item.id) === String(productId));
  if (!product) return;
  const price = Number(product.prices && product.prices[selectedStore]);
  if (!Number.isFinite(price) || price <= 0) {
    showStatus('Producto sin precio válido para este supermercado.', { error: true });
    return;
  }

  const existing = carts[selectedStore].find(item => String(item.id) === String(product.id));
  if (existing) {
    existing.quantity += 1;
  } else {
    carts[selectedStore].push({
      id: product.id,
      name: product.name,
      price,
      quantity: 1,
      store: selectedStore,
      image: product.image || '',
      url: product.links ? product.links[selectedStore] || '' : ''
    });
  }

  activeCartStore = selectedStore;
  saveCarts();
  renderCart();
  showStatus('Producto agregado al carrito');
}

function renderCart() {
  const list = el.cartList;
  const cart = carts[activeCartStore] || [];
  list.innerHTML = '';

  if (cart.length === 0) {
    list.innerHTML = `<p class="message">Carrito de ${escapeHtml(storeShort(activeCartStore))} vacío.</p>`;
  } else {
    const frag = document.createDocumentFragment();
    cart.forEach(item => {
      const subtotal = item.price * item.quantity;
      const div = document.createElement('div');
      div.className = 'cart-item';

      const name = document.createElement('div');
      name.className = 'cart-item-name';
      name.textContent = item.name;

      const bottom = document.createElement('div');
      bottom.className = 'cart-bottom';

      const info = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = formatPrice(item.price);
      info.appendChild(strong);
      info.appendChild(document.createElement('br'));
      const small = document.createElement('small');
      small.textContent = `Subtotal: ${formatPrice(subtotal)}`;
      info.appendChild(small);

      const qty = document.createElement('div');
      qty.className = 'qty';

      const minus = document.createElement('button');
      minus.dataset.action = 'minus';
      minus.dataset.id = item.id;
      minus.textContent = '-';

      const spanQty = document.createElement('span');
      spanQty.textContent = item.quantity;

      const plus = document.createElement('button');
      plus.dataset.action = 'plus';
      plus.dataset.id = item.id;
      plus.textContent = '+';

      qty.appendChild(minus);
      qty.appendChild(spanQty);
      qty.appendChild(plus);

      const remove = document.createElement('button');
      remove.dataset.action = 'remove';
      remove.dataset.id = item.id;
      remove.className = 'remove';
      remove.textContent = 'X';

      bottom.appendChild(info);
      bottom.appendChild(qty);
      bottom.appendChild(remove);

      div.appendChild(name);
      div.appendChild(bottom);

      frag.appendChild(div);
    });
    list.appendChild(frag);
  }

  updateSummary();
  updateTabs();
}

function changeQuantity(productId, delta) {
  const cart = carts[activeCartStore];
  const item = cart.find(product => String(product.id) === String(productId));
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    carts[activeCartStore] = cart.filter(product => String(product.id) !== String(productId));
  }
  saveCarts();
  renderCart();
}

function removeFromCart(productId) {
  carts[activeCartStore] = carts[activeCartStore].filter(product => String(product.id) !== String(productId));
  saveCarts();
  renderCart();
}

function clearCurrentCart() {
  carts[activeCartStore] = [];
  saveCarts();
  renderCart();
}

function updateSummary() {
  const cart = carts[activeCartStore] || [];
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  el.cartCount.textContent = count;
  el.cartTotal.textContent = formatPrice(total);

  const liderTotal = getTotal('Lider Real');
  const jumboTotal = getTotal('Jumbo Real');
  el.totalLider.textContent = formatPrice(liderTotal);
  el.totalJumbo.textContent = formatPrice(jumboTotal);

  const totals = [ ['Lider', liderTotal], ['Jumbo', jumboTotal] ].filter(item => item[1] > 0);
  if (totals.length === 0) {
    el.cheapestStore.textContent = '---';
    return;
  }
  totals.sort((a,b) => a[1] - b[1]);
  el.cheapestStore.textContent = `${totals[0][0]} (${formatPrice(totals[0][1])})`;
}

function getTotal(store) {
  return (carts[store] || []).reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function showCart(store) {
  activeCartStore = store;
  renderCart();
}

function changeStore() {
  selectedStore = el.storeSelect.value;
  activeCartStore = selectedStore;
  renderProducts();
  renderCart();
}

function buscarAhora() {
  loadProducts(el.searchInput.value.trim());
}

function saveCarts() {
  const payload = { version: 1, carts };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('No se pudo guardar en localStorage', err);
  }
}

function loadCarts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || typeof parsed.carts !== 'object') throw new Error('incompatible');
    carts = {
      'Lider Real': Array.isArray(parsed.carts['Lider Real']) ? parsed.carts['Lider Real'] : [],
      'Jumbo Real': Array.isArray(parsed.carts['Jumbo Real']) ? parsed.carts['Jumbo Real'] : []
    };
  } catch (err) {
    localStorage.removeItem(STORAGE_KEY);
    carts = { 'Lider Real': [], 'Jumbo Real': [] };
  }
}

function storeShort(store) {
  if (store === 'Lider Real') return 'Lider';
  if (store === 'Jumbo Real') return 'Jumbo';
  return store;
}

function formatPrice(n) {
  try { return `$${Number(n).toLocaleString('es-CL')}`; } catch { return `$${n}`; }
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
