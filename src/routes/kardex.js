const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

// GET /api/kardex/recuperar/:idProducto
router.get('/recuperar/:idProducto', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT k.fecha_movimiento, k.hora_movimiento, k.cantidad, k.stock_resultante
       FROM kardex_inventario k
       INNER JOIN producto pr ON k.id_producto = pr.id_producto
       WHERE pr.id_producto = ?`,
      [req.params.idProducto]
    );
    if (rows.length === 0) return res.status(404).send();
    const result = rows.map(r => ({
      fechaMovimiento: r.fecha_movimiento,
      horaMovimiento: r.hora_movimiento,
      cantidad: r.cantidad,
      stockResultante: r.stock_resultante,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
