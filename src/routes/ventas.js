const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

// POST /api/venta/registrar — Convierte un pedido en venta
router.post('/registrar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { idPedido, detalles, tipoComprobante } = req.body;
    // detalles: [{ idProducto, cantidad, precioUnitario }]

    // Verificar que el pedido existe y está pendiente
    const [pedRows] = await conn.query('SELECT * FROM pedido WHERE id_pedido = ?', [idPedido]);
    if (pedRows.length === 0) throw new Error('Pedido no encontrado');
    const pedido = pedRows[0];

    if (pedido.estado === 'Entregado') throw new Error('Este pedido ya fue procesado como venta');

    // Calcular totales de la venta
    let subtotalVenta = 0;
    const detallesVenta = [];

    for (const det of detalles) {
      const importe = parseFloat((det.precioUnitario * det.cantidad).toFixed(2));
      const igvDet = parseFloat((importe * 0.18).toFixed(2));
      const importeConIgv = parseFloat((importe + igvDet).toFixed(2));
      subtotalVenta += importe;

      detallesVenta.push({
        idProducto: det.idProducto,
        cantidad: det.cantidad,
        precioUnitario: det.precioUnitario,
        importe,
        igv: igvDet,
        importeConIgv,
      });
    }

    const igvVenta = parseFloat((subtotalVenta * 0.18).toFixed(2));
    const totalVenta = parseFloat((subtotalVenta + igvVenta).toFixed(2));

    // Generar número de comprobante
    const [lastComp] = await conn.query(
      "SELECT numero_comprobante FROM venta ORDER BY id_venta DESC LIMIT 1"
    );
    let numComprobante = 'B001-00001';
    if (lastComp.length > 0 && lastComp[0].numero_comprobante) {
      const parts = lastComp[0].numero_comprobante.split('-');
      const nextNum = (parseInt(parts[1]) + 1).toString().padStart(5, '0');
      numComprobante = `${parts[0]}-${nextNum}`;
    }

    const now = new Date();
    const fechaVenta = now.toISOString().split('T')[0];
    const horaVenta = now.toTimeString().split(' ')[0];

    // Insertar venta
    const [ventaResult] = await conn.query(
      `INSERT INTO venta (id_pedido, fecha_venta, hora_venta, subtotal, igv, total, tipo_comprobante, numero_comprobante, estado, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Completada', ?)`,
      [idPedido, fechaVenta, horaVenta, subtotalVenta, igvVenta, totalVenta,
       tipoComprobante || 'Boleta', numComprobante, pedido.id_usuario]
    );
    const idVenta = ventaResult.insertId;

    // Insertar detalles de venta
    for (const det of detallesVenta) {
      await conn.query(
        `INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unitario, importe, igv, importe_con_igv)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idVenta, det.idProducto, det.cantidad, det.precioUnitario, det.importe, det.igv, det.importeConIgv]
      );
    }

    // Actualizar estado del pedido
    await conn.query("UPDATE pedido SET estado = 'Entregado' WHERE id_pedido = ?", [idPedido]);

    await conn.commit();

    res.json({
      idVenta,
      idPedido,
      fechaVenta,
      horaVenta,
      subtotal: subtotalVenta,
      igv: igvVenta,
      total: totalVenta,
      tipoComprobante: tipoComprobante || 'Boleta',
      numeroComprobante: numComprobante,
      estado: 'Completada',
      detalles: detallesVenta,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/venta/listar
router.get('/listar', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.id_venta, v.id_pedido, v.fecha_venta, v.hora_venta, v.subtotal, v.igv, v.total,
              v.tipo_comprobante, v.numero_comprobante, v.estado,
              u.nombre, u.apellido, u.correo
       FROM venta v
       LEFT JOIN usuario u ON v.id_usuario = u.id_usuario
       ORDER BY v.id_venta DESC`
    );
    const result = rows.map(r => ({
      idVenta: r.id_venta,
      idPedido: r.id_pedido,
      fechaVenta: r.fecha_venta,
      horaVenta: r.hora_venta,
      subtotal: r.subtotal,
      igv: r.igv,
      total: r.total,
      tipoComprobante: r.tipo_comprobante,
      numeroComprobante: r.numero_comprobante,
      estado: r.estado,
      cliente: r.nombre ? `${r.nombre} ${r.apellido}` : null,
      correo: r.correo,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/venta/detalle/:id
router.get('/detalle/:id', async (req, res) => {
  try {
    const [ventaRows] = await pool.query(
      `SELECT v.*, u.nombre, u.apellido, u.correo, u.telefono, u.direccion
       FROM venta v
       LEFT JOIN usuario u ON v.id_usuario = u.id_usuario
       WHERE v.id_venta = ?`,
      [req.params.id]
    );
    if (ventaRows.length === 0) return res.status(404).json({ message: 'Venta no encontrada' });

    const venta = ventaRows[0];

    const [detalles] = await pool.query(
      `SELECT dv.*, p.nombre AS nombre_producto, p.precio AS precio_catalogo,
              (SELECT i.url FROM imagen_producto ip JOIN imagen i ON ip.id_imagen = i.id_imagen
               WHERE ip.id_producto = p.id_producto ORDER BY i.id_imagen LIMIT 1) AS url_imagen
       FROM detalle_venta dv
       JOIN producto p ON dv.id_producto = p.id_producto
       WHERE dv.id_venta = ?`,
      [req.params.id]
    );

    res.json({
      idVenta: venta.id_venta,
      idPedido: venta.id_pedido,
      fechaVenta: venta.fecha_venta,
      horaVenta: venta.hora_venta,
      subtotal: venta.subtotal,
      igv: venta.igv,
      total: venta.total,
      tipoComprobante: venta.tipo_comprobante,
      numeroComprobante: venta.numero_comprobante,
      estado: venta.estado,
      cliente: {
        nombre: venta.nombre,
        apellido: venta.apellido,
        correo: venta.correo,
        telefono: venta.telefono,
        direccion: venta.direccion,
      },
      detalles: detalles.map(d => ({
        idDetalleVenta: d.id_detalle_venta,
        idProducto: d.id_producto,
        nombreProducto: d.nombre_producto,
        precioCatalogo: d.precio_catalogo,
        precioUnitario: d.precio_unitario,
        cantidad: d.cantidad,
        importe: d.importe,
        igv: d.igv,
        importeConIgv: d.importe_con_igv,
        urlImagen: d.url_imagen,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/venta/totalVentas
router.get('/totalVentas', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT SUM(total) AS total_ventas, COUNT(*) AS cantidad_ventas FROM venta WHERE estado = 'Completada'");
    res.json({
      totalVentas: rows[0].total_ventas ? Number(rows[0].total_ventas) : 0,
      cantidadVentas: rows[0].cantidad_ventas,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/venta/ventasPorMes
router.get('/ventasPorMes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(STR_TO_DATE(fecha_venta, '%Y-%m-%d'), '%Y-%m') AS mes,
              COUNT(*) AS cantidad_ventas,
              SUM(subtotal) AS total_subtotal,
              SUM(igv) AS total_igv,
              SUM(total) AS total_ventas
       FROM venta WHERE estado = 'Completada' GROUP BY mes ORDER BY mes`
    );
    res.json(rows.map(r => ({
      mes: r.mes,
      cantidadVentas: r.cantidad_ventas,
      totalSubtotal: Number(r.total_subtotal),
      totalIgv: Number(r.total_igv),
      totalVentas: Number(r.total_ventas),
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/venta/porPedido/:idPedido
router.get('/porPedido/:idPedido', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.*, u.nombre, u.apellido FROM venta v
       LEFT JOIN usuario u ON v.id_usuario = u.id_usuario
       WHERE v.id_pedido = ? ORDER BY v.id_venta DESC LIMIT 1`,
      [req.params.idPedido]
    );
    if (rows.length === 0) return res.json(null);
    const v = rows[0];
    res.json({
      idVenta: v.id_venta,
      idPedido: v.id_pedido,
      fechaVenta: v.fecha_venta,
      horaVenta: v.hora_venta,
      subtotal: v.subtotal,
      igv: v.igv,
      total: v.total,
      tipoComprobante: v.tipo_comprobante,
      numeroComprobante: v.numero_comprobante,
      estado: v.estado,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/venta/anular/:id
router.put('/anular/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ventaRows] = await conn.query('SELECT * FROM venta WHERE id_venta = ?', [req.params.id]);
    if (ventaRows.length === 0) throw new Error('Venta no encontrada');
    if (ventaRows[0].estado === 'Anulada') throw new Error('La venta ya está anulada');

    // Anular venta (no devuelve stock — el stock se descontó al crear el pedido,
    // se devolverá solo si el pedido se cancela desde actualizarEstado)
    await conn.query("UPDATE venta SET estado = 'Anulada' WHERE id_venta = ?", [req.params.id]);

    // Revertir estado del pedido
    await conn.query("UPDATE pedido SET estado = 'Pendiente' WHERE id_pedido = ?", [ventaRows[0].id_pedido]);

    await conn.commit();
    res.json({ message: 'Venta anulada correctamente' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
