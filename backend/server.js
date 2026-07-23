const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Datos de ejemplo de productos
const productosBase = [
    { id: 1, name: "Leche Entera 1L", category: "leche" },
    { id: 2, name: "Arroz Integral 1kg", category: "arroz" },
    { id: 3, name: "Aceite de Oliva 500ml", category: "aceite" },
    { id: 4, name: "Pan Integral 600g", category: "pan" },
    { id: 5, name: "Huevos Docena", category: "huevos" },
    { id: 6, name: "Queso Mantecoso 250g", category: "queso" },
    { id: 7, name: "Yogur Natural 400g", category: "yogur" },
    { id: 8, name: "Fideos Tallarín 500g", category: "fideos" },
    { id: 9, name: "Tomate Fresco kg", category: "tomate" },
    { id: 10, name: "Pollo Entero kg", category: "pollo" },
];

// Función para generar precios aleatorios
function generarPrecios(basePrice) {
    return {
        "Lider": Math.round(basePrice),
        "Jumbo": Math.round(basePrice * 1.05),
        "Unimarc": Math.round(basePrice * 1.03),
        "Carrefour": Math.round(basePrice * 1.08)
    };
}

app.get('/api/productos/real', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase().trim() : '';
    
    if (!query) {
        return res.json([
            { 
                id: "sample1", 
                name: "Escribe un producto arriba (Ej: Aceite, Arroz, Leche)", 
                prices: { "Lider": 0 } 
            }
        ]);
    }

    // Filtrar productos por búsqueda
    const productosFiltrados = productosBase.filter(prod => 
        prod.name.toLowerCase().includes(query) || 
        prod.category.toLowerCase().includes(query)
    );

    // Si no hay coincidencias exactas, retornar productos relacionados
    if (productosFiltrados.length === 0) {
        return res.json([
            { 
                id: "notfound", 
                name: `No encontramos "${query}". Intenta con: Leche, Arroz, Aceite, Pan, Queso, Huevos, Yogur`, 
                prices: { "Info": 0 } 
            }
        ]);
    }

    // Mapear productos con precios simulados
    const productosConPrecios = productosFiltrados.map(prod => ({
        id: prod.id,
        name: prod.name,
        prices: generarPrecios(10000 + Math.random() * 15000)
    }));

    res.json(productosConPrecios);
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
