const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/*
    POC controlada:
    Puedes dejar credenciales en duro aquí.
    Recomendación: no subir este archivo con credenciales reales a repositorios públicos.
*/
const CREDENTIALS = {
    jumbo: {
        user: process.env.JUMBO_USER || '13055906-9',
        pass: process.env.JUMBO_PASS || 'bonta5-kuCzor-pamcaw'
    },
    lider: {
        user: process.env.LIDER_USER || 'TU_USUARIO_LIDER',
        pass: process.env.LIDER_PASS || 'TU_PASSWORD_LIDER'
    }
};

/*
    HEADLESS true evita que aparezca popup/ventana visible en cada búsqueda.
*/
const HEADLESS = true;

/*
    Si está en true, el backend intenta iniciar sesión automáticamente usando
    las credenciales de arriba antes de buscar.
*/
const AUTO_LOGIN_ON_SEARCH = true;

const CACHE = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

const SESSIONS_ROOT = path.join(__dirname, 'sessions');

const STORES = [
    {
        key: 'lider',
        name: 'Lider',
        priceKey: 'Lider Real',
        sessionDir: path.join(SESSIONS_ROOT, 'lider'),
        loginUrl: 'https://www.lider.cl/tu-cuenta/iniciar-sesion?tp=AuthMiddlewareSsr&vid=oaoh&tid=0',
        searchUrl: query => `https://www.lider.cl/search?q=${encodeURIComponent(query)}`
    },
    {
        key: 'jumbo',
        name: 'Jumbo',
        priceKey: 'Jumbo Real',
        sessionDir: path.join(SESSIONS_ROOT, 'jumbo'),
        loginUrl: 'https://www.jumbo.cl/login-page',
        searchUrl: query => `https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(query)}&page=1`
    }
];

function ensureSessionsFolder() {
    if (!fs.existsSync(SESSIONS_ROOT)) {
        fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
    }
}

function getFromCache(key) {
    const cached = CACHE.get(key);

    if (!cached) return null;

    if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
        CACHE.delete(key);
        return null;
    }

    return cached.data;
}

function saveToCache(key, data) {
    CACHE.set(key, {
        createdAt: Date.now(),
        data
    });
}

function cleanText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parsePrice(value) {
    if (!value) return 0;

    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.round(value) : 0;
    }

    const clean = String(value).replace(/[^\d]/g, '');
    const number = Number(clean);

    return Number.isFinite(number) ? number : 0;
}

function normalizeText(text) {
    return cleanText(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9ñ ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getQueryTokens(query) {
    const ignored = new Set([
        'de',
        'la',
        'el',
        'los',
        'las',
        'con',
        'sin',
        'y',
        'en',
        'x',
        'un',
        'una',
        'pack',
        'producto'
    ]);

    return normalizeText(query)
        .split(' ')
        .filter(token => token.length > 2 && !ignored.has(token));
}

function productMatchesQuery(productName, query) {
    const name = normalizeText(productName);
    const tokens = getQueryTokens(query);

    if (tokens.length === 0) return true;

    /*
        Filtro estricto:
        Si buscas arroz, solo acepta productos cuyo nombre contenga arroz.
        Evita que aparezcan productos irrelevantes como fernet.
    */
    return tokens.every(token => name.includes(token));
}

function createProductId(storeName, name, price, index) {
    return `${storeName}-${name}-${price}-${index}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 120);
}

function dedupeProducts(products) {
    const seen = new Set();

    return products.filter(product => {
        const key = `${product.store}-${normalizeText(product.name)}-${product.price}`;

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

async function safeClick(page, selectors) {
    for (const selector of selectors) {
        try {
            const locator = page.locator(selector).first();

            if (await locator.count()) {
                await locator.click({ timeout: 3000 });
                await page.waitForTimeout(800);
                return true;
            }
        } catch (error) {
            // Selector no disponible.
        }
    }

    return false;
}

async function safeFill(page, selectors, value) {
    for (const selector of selectors) {
        try {
            const locator = page.locator(selector).first();

            if (await locator.count()) {
                await locator.fill(value, { timeout: 4000 });
                await page.waitForTimeout(500);
                return true;
            }
        } catch (error) {
            // Selector no disponible.
        }
    }

    return false;
}

async function closeCommonModals(page) {
    const selectors = [
        'button:has-text("Aceptar")',
        'button:has-text("Acepto")',
        'button:has-text("Entendido")',
        'button:has-text("Cerrar")',
        'button:has-text("No gracias")',
        'button[aria-label="Cerrar"]',
        'button[aria-label="Close"]'
    ];

    for (const selector of selectors) {
        try {
            const button = page.locator(selector).first();

            if (await button.count()) {
                await button.click({ timeout: 1500 });
                await page.waitForTimeout(500);
            }
        } catch (error) {
            // Ignorar.
        }
    }
}

async function bodyText(page) {
    try {
        return normalizeText(await page.locator('body').innerText({ timeout: 5000 }));
    } catch (error) {
        return '';
    }
}

async function isLoginPage(page) {
    const text = await bodyText(page);

    return (
        text.includes('inicia sesion') ||
        text.includes('iniciar sesion') ||
        text.includes('ingresa tu correo') ||
        text.includes('contraseña') ||
        text.includes('password')
    );
}

async function loginJumbo(page, store) {
    const credentials = CREDENTIALS.jumbo;

    if (!credentials.user || !credentials.pass || credentials.user.includes('TU_USUARIO')) {
        console.log('Jumbo: credenciales no configuradas.');
        return false;
    }

    await page.goto(store.loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    await page.waitForTimeout(3000);
    await closeCommonModals(page);

    const filledUser = await safeFill(page, [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[placeholder*="correo" i]',
        'input[placeholder*="rut" i]',
        'input'
    ], credentials.user);

    if (!filledUser) {
        console.log('Jumbo: no se encontró input de usuario.');
        return false;
    }

    await safeClick(page, [
        'button:has-text("Continuar")',
        'button:has-text("Siguiente")',
        'button[type="submit"]'
    ]);

    await page.waitForTimeout(2500);

    const filledPass = await safeFill(page, [
        'input[type="password"]',
        'input[name="password"]',
        'input[placeholder*="contraseña" i]',
        'input[placeholder*="password" i]'
    ], credentials.pass);

    if (!filledPass) {
        console.log('Jumbo: no se encontró input de contraseña. Puede existir captcha/2FA.');
        return false;
    }

    await safeClick(page, [
        'button:has-text("Iniciar sesión")',
        'button:has-text("Ingresar")',
        'button:has-text("Login")',
        'button[type="submit"]'
    ]);

    await page.waitForTimeout(6000);

    const stillLogin = await isLoginPage(page);

    if (stillLogin) {
        console.log('Jumbo: login no confirmado. Puede requerir captcha/2FA.');
        return false;
    }

    console.log('Jumbo: login ejecutado.');
    return true;
}

async function loginLider(page, store) {
    const credentials = CREDENTIALS.lider;

    if (!credentials.user || !credentials.pass || credentials.user.includes('TU_USUARIO')) {
        console.log('Lider: credenciales no configuradas.');
        return false;
    }

    await page.goto(store.loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    await page.waitForTimeout(3000);
    await closeCommonModals(page);

    const filledUser = await safeFill(page, [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[placeholder*="correo" i]',
        'input'
    ], credentials.user);

    if (!filledUser) {
        console.log('Lider: no se encontró input de correo.');
        return false;
    }

    await safeClick(page, [
        'button:has-text("Continuar")',
        'button:has-text("Siguiente")',
        'button[type="submit"]'
    ]);

    await page.waitForTimeout(3000);

    const filledPass = await safeFill(page, [
        'input[type="password"]',
        'input[name="password"]',
        'input[placeholder*="contraseña" i]',
        'input[placeholder*="password" i]'
    ], credentials.pass);

    if (!filledPass) {
        console.log('Lider: no se encontró input de contraseña. Puede requerir código/captcha.');
        return false;
    }

    await safeClick(page, [
        'button:has-text("Iniciar sesión")',
        'button:has-text("Ingresar")',
        'button:has-text("Login")',
        'button[type="submit"]'
    ]);

    await page.waitForTimeout(6000);

    const stillLogin = await isLoginPage(page);

    if (stillLogin) {
        console.log('Lider: login no confirmado. Puede requerir captcha/2FA.');
        return false;
    }

    console.log('Lider: login ejecutado.');
    return true;
}

async function ensureLogin(page, store) {
    if (!AUTO_LOGIN_ON_SEARCH) {
        return false;
    }

    if (store.key === 'jumbo') {
        return loginJumbo(page, store);
    }

    if (store.key === 'lider') {
        return loginLider(page, store);
    }

    return false;
}

async function scrollPage(page) {
    for (let i = 0; i < 7; i++) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(900);
    }
}

async function extractProductsFromPage(page, store, query) {
    const rawProducts = await page.evaluate(() => {
        function clean(text) {
            return String(text || '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function getPrice(text) {
            const matches = String(text || '').match(/\$\s?[\d.]+/g);

            if (!matches || matches.length === 0) {
                return '';
            }

            return matches[0];
        }

        function validName(text) {
            const value = clean(text);

            if (value.length < 4) return false;
            if (value.length > 180) return false;
            if (/^\$/.test(value)) return false;

            if (
                /agregar|rebaja|ahorra|despacho|pickup|ordenar|resultados|iniciar|sesion|categorias|carrito|comprar/i.test(value)
            ) {
                return false;
            }

            return true;
        }

        const products = [];
        const elements = Array.from(document.querySelectorAll('article, li, section, div'));

        for (const element of elements) {
            const text = clean(element.innerText);

            if (!text) continue;
            if (!text.includes('$')) continue;
            if (text.length < 20 || text.length > 1500) continue;

            const price = getPrice(text);

            if (!price) continue;

            let name = '';

            const img = element.querySelector('img[alt]');
            const imgAlt = img ? clean(img.getAttribute('alt')) : '';

            if (validName(imgAlt)) {
                name = imgAlt;
            }

            if (!name) {
                const linkText = Array.from(element.querySelectorAll('a'))
                    .map(a => clean(a.innerText))
                    .find(validName);

                if (linkText) {
                    name = linkText;
                }
            }

            if (!name) {
                const candidates = Array.from(element.querySelectorAll('h1, h2, h3, h4, p, span'))
                    .map(node => clean(node.innerText))
                    .filter(validName);

                candidates.sort((a, b) => b.length - a.length);

                name = candidates[0] || '';
            }

            if (!name) {
                name = text
                    .replace(/\$\s?[\d.]+/g, '')
                    .replace(/Agregar/gi, '')
                    .replace(/Rebaja/gi, '')
                    .replace(/Ahorra/gi, '')
                    .replace(/Despacho gratis/gi, '')
                    .replace(/Despacho/gi, '')
                    .replace(/Pickup/gi, '')
                    .slice(0, 160);
            }

            name = clean(name);

            let href = '';
            const link = element.querySelector('a[href]');

            if (link) {
                href = link.getAttribute('href') || '';
            }

            let image = '';

            if (img) {
                image = img.getAttribute('src') || '';
            }

            if (name.length > 3) {
                products.push({
                    name,
                    price,
                    image,
                    url: href
                });
            }
        }

        return products;
    });

    const baseUrl = store.key === 'jumbo'
        ? 'https://www.jumbo.cl'
        : 'https://www.lider.cl';

    const normalized = rawProducts
        .map((product, index) => {
            const price = parsePrice(product.price);

            let url = product.url || '';

            if (url && !url.startsWith('http')) {
                url = baseUrl + url;
            }

            return {
                id: createProductId(store.name, product.name, price, index),
                name: cleanText(product.name),
                image: product.image || '',
                url,
                store: store.name,
                priceKey: store.priceKey,
                price
            };
        })
        .filter(product => {
            return (
                product.name.length > 3 &&
                product.price > 0 &&
                productMatchesQuery(product.name, query)
            );
        });

    return dedupeProducts(normalized).slice(0, 24);
}

async function searchStore(store, query) {
    ensureSessionsFolder();

    let context;

    try {
        context = await chromium.launchPersistentContext(store.sessionDir, {
            headless: HEADLESS,
            locale: 'es-CL',
            viewport: {
                width: 1366,
                height: 1000
            },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
        });

        const page = context.pages()[0] || await context.newPage();

        if (AUTO_LOGIN_ON_SEARCH) {
            await ensureLogin(page, store);
        }

        const searchUrl = store.searchUrl(query);

        await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(6000);
        await closeCommonModals(page);
        await scrollPage(page);

        /*
            Debug opcional:
            En Railway puede quedar como archivo temporal.
            Localmente sirve para ver qué renderizó el navegador.
        */
        try {
            await page.screenshot({
                path: path.join(__dirname, `${store.key}-debug.png`),
                fullPage: true
            });
        } catch (error) {
            // Ignorar screenshot si falla.
        }

        const products = await extractProductsFromPage(page, store, query);

        console.log(`${store.name}: ${products.length} productos encontrados`);

        return products;

    } catch (error) {
        console.error(`${store.name}: error`, error.message);
        return [];
    } finally {
        if (context) {
            await context.close();
        }
    }
}

function toApiProducts(storeResults) {
    const output = [];

    for (const store of STORES) {
        const products = storeResults[store.name] || [];

        products.forEach(product => {
            output.push({
                id: product.id,
                name: product.name,
                brand: '',
                image: product.image,
                url: product.url,
                availability: '',
                seller: store.name,
                prices: {
                    "Lider Real": store.name === 'Lider' ? product.price : 0,
                    "Jumbo Real": store.name === 'Jumbo' ? product.price : 0
                },
                links: {
                    "Lider Real": store.name === 'Lider' ? product.url : '',
                    "Jumbo Real": store.name === 'Jumbo' ? product.url : ''
                }
            });
        });
    }

    return output;
}

app.get('/api/productos/real', async (req, res) => {
    const query = req.query.q ? req.query.q.trim() : '';

    if (!query) {
        return res.json([
            {
                id: "sample1",
                name: "Busca un producto, por ejemplo: arroz, leche, aceite",
                brand: "",
                image: "",
                url: "",
                availability: "",
                seller: "",
                prices: {
                    "Lider Real": 0,
                    "Jumbo Real": 0
                },
                links: {
                    "Lider Real": "",
                    "Jumbo Real": ""
                }
            }
        ]);
    }

    const cacheKey = `productos-${query.toLowerCase()}`;
    const cached = getFromCache(cacheKey);

    if (cached) {
        return res.json(cached);
    }

    try {
        const storeResults = {};

        await Promise.all(
            STORES.map(async store => {
                storeResults[store.name] = await searchStore(store, query);
            })
        );

        console.log('Resumen:', {
            Lider: storeResults.Lider?.length || 0,
            Jumbo: storeResults.Jumbo?.length || 0
        });

        const products = toApiProducts(storeResults);

        saveToCache(cacheKey, products);

        res.json(products);
    } catch (error) {
        console.error('Error general:', error);

        res.status(500).json({
            error: 'No se pudieron obtener productos.',
            detail: error.message
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        stores: STORES.map(store => store.name),
        headless: HEADLESS,
        autoLoginOnSearch: AUTO_LOGIN_ON_SEARCH
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
