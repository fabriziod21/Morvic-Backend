const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

// GET /api/kardex/recuperar/:idProducto
router.get('/recuperar/:idProducto', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT k.fecha_movimiento, k.hora_movimiento, k.tipo_movimiento, k.cantidad, k.stock_resultante
       FROM kardex_inventario k
       INNER JOIN producto pr ON k.id_producto = pr.id_producto
       WHERE pr.id_producto = ?
       ORDER BY k.id_kardex_inventario ASC`,
      [req.params.idProducto]
    );
    if (rows.length === 0) return res.status(404).send();
    const result = rows.map(r => ({
      fechaMovimiento: r.fecha_movimiento,
      horaMovimiento: r.hora_movimiento,
      tipoMovimiento: r.tipo_movimiento,
      cantidad: r.cantidad,
      stockResultante: r.stock_resultante,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/kardex/entrada
router.post('/entrada', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { idProducto, cantidad, idProveedor } = req.body;

    if (!idProducto || !cantidad || cantidad <= 0) {
      return res.status(400).json({ message: 'idProducto y cantidad (>0) son requeridos.' });
    }

    // Obtener producto actual
    const [prodRows] = await conn.query('SELECT * FROM producto WHERE id_producto = ?', [idProducto]);
    if (prodRows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado.' });
    }
    const producto = prodRows[0];

    const nuevoStock = producto.stock_actual + cantidad;

    // Actualizar stock del producto
    await conn.query('UPDATE producto SET stock_actual = ? WHERE id_producto = ?', [nuevoStock, idProducto]);

    // Fecha y hora actuales
    const now = new Date();
    const fecha = now.toISOString().split('T')[0];
    const hora = now.toTimeString().split(' ')[0].substring(0, 5);

    // Registrar movimiento en kardex
    await conn.query(
      `INSERT INTO kardex_inventario (fecha_movimiento, hora_movimiento, tipo_movimiento, cantidad, stock_resultante, id_producto, id_proveedor)
       VALUES (?, ?, 'Entrada', ?, ?, ?, ?)`,
      [fecha, hora, cantidad, nuevoStock, idProducto, idProveedor || null]
    );

    await conn.commit();

    res.status(201).json({
      message: 'Entrada registrada correctamente.',
      stockAnterior: producto.stock_actual,
      stockNuevo: nuevoStock,
      cantidad,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
