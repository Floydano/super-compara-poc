const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/api/productos/real', async (req, res) => {
    const query = req.query.q ? req.query.q.trim() : '';
    
    if (!query) {
        return res.json([
            { id: "sample1", name: "Escribe un producto arriba (Ej: Aceite, Arroz, Leche)", prices: { "Lider": 0 } }
        ]);
    }

    try {
        const response = await fetch("https://lider.cl", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Tenant": "Lider",
                // Clonamos la identidad de un navegador real para evitar el bloqueo anti-bot
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Origin": "https://lider.cl",
                "Referer": "https://lider.cl/"
            },
            body: JSON.stringify({
                searchQuery: query,
                page: 1,
                perPage: 12
            })
        });

        // Verificamos si la respuesta realmente contiene JSON antes de procesarla
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            console.error("Lider bloqueó la solicitud de Node y devolvió código HTML.");
            return res.status(403).json({ error: "Bloqueo temporal de la plataforma externa." });
        }

        const data = await response.json();
        const apiProducts = data.products || [];

        const productosFormateados = apiProducts.map(prod => {
            const precioBase = prod.price?.priceInStore || prod.price?.itemPrice || prod.price?.salePrice || 0;
            return {
                id: prod.sku || prod.id || Math.random().toString(),
                name: `${prod.brand || ''} ${prod.displayName || prod.name || 'Producto sin nombre'}`.trim(),
                prices: {
                    "Lider Real": precioBase,
                    "Jumbo (Simulado)": Math.round(precioBase * 1.05),
                    "Unimarc (Simulado)": Math.round(precioBase * 1.03)
                }
            };
        });

        res.json(productosFormateados);

    } catch (error) {
        console.error("Error crítico al procesar la API:", error);
        res.status(500).json({ error: "Falla de comunicación con los servidores externos." });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
