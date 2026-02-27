const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

// GET /api/categoria/listar
router.get('/listar', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categoria');
    const result = rows.map(r => ({ idCategoria: r.id_categoria, nombre: r.nombre }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
