const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

// GET /api/proveedor/listar
router.get('/listar', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM proveedor');
    const result = rows.map(r => ({ idProveedor: r.id_proveedor, nombre: r.nombre }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
