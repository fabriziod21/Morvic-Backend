require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://parte-frontend.vercel.app',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());

// Rutas
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/producto', require('./routes/productos'));
app.use('/api/pedido', require('./routes/pedidos'));
app.use('/api/categoria', require('./routes/categorias'));
app.use('/api/proveedor', require('./routes/proveedores'));
app.use('/api/comentarios', require('./routes/comentarios'));
app.use('/api/kardex', require('./routes/kardex'));

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ message: 'API Morvic - Node.js/Express' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
