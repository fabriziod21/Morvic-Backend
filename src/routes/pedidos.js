const { Router } = require('express');
const pool = require('../config/db');
const { enviarCorreo } = require('../config/mail');

const router = Router();

// POST /api/pedido/registrar
router.post('/registrar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { pedido, detallesPedido } = req.body;

    // Guardar pedido
    const [pedidoResult] = await conn.query(
      `INSERT INTO pedido (fecha, hora, metodo_pago, total, estado, direccion_entrega, fecha_entrega, responsable_recojo1, responsable_recojo2, tipo_entrega, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pedido.fecha, pedido.hora, pedido.metodoPago, pedido.total,
        pedido.estado || 'Pendiente',
        pedido.direccionEntrega || '', pedido.fechaEntrega || '',
        pedido.responsableRecojo1 || '', pedido.responsableRecojo2 || '',
        pedido.tipoEntrega || '', pedido.usuario?.idUsuario,
      ]
    );
    const idPedido = pedidoResult.insertId;

    // Procesar detalles
    const detallesGuardados = [];
    for (const detalle of detallesPedido) {
      const idProducto = detalle.producto?.idProducto;

      // Verificar stock
      const [prodRows] = await conn.query('SELECT * FROM producto WHERE id_producto = ?', [idProducto]);
      if (prodRows.length === 0) throw new Error('Producto no encontrado');
      const producto = prodRows[0];

      if (producto.stock_actual < detalle.cantidad) {
        throw new Error(`Stock insuficiente para: ${producto.nombre}`);
      }

      // Guardar detalle
      const [detResult] = await conn.query(
        'INSERT INTO detalle_pedido (cantidad, importe, id_pedido, id_producto) VALUES (?, ?, ?, ?)',
        [detalle.cantidad, detalle.importe, idPedido, idProducto]
      );

      // Actualizar stock
      const nuevoStock = producto.stock_actual - detalle.cantidad;
      await conn.query('UPDATE producto SET stock_actual = ? WHERE id_producto = ?', [nuevoStock, idProducto]);

      // Registrar kardex
      await conn.query(
        `INSERT INTO kardex_inventario (fecha_movimiento, hora_movimiento, tipo_movimiento, cantidad, stock_resultante, id, id_producto)
         VALUES (?, ?, 'Salida', ?, ?, ?, ?)`,
        [pedido.fecha, pedido.hora, detalle.cantidad, nuevoStock, detResult.insertId, idProducto]
      );

      detallesGuardados.push({
        id: detResult.insertId,
        cantidad: detalle.cantidad,
        importe: detalle.importe,
        producto: { idProducto, nombre: detalle.producto?.nombre || producto.nombre },
      });
    }

    await conn.commit();

    const pedidoResponse = {
      idPedido,
      fecha: pedido.fecha, hora: pedido.hora, metodoPago: pedido.metodoPago,
      total: pedido.total, estado: pedido.estado || 'Pendiente',
      direccionEntrega: pedido.direccionEntrega, fechaEntrega: pedido.fechaEntrega,
      responsableRecojo1: pedido.responsableRecojo1, responsableRecojo2: pedido.responsableRecojo2,
      tipoEntrega: pedido.tipoEntrega,
      usuario: pedido.usuario,
      detalles: detallesGuardados,
    };

    // Enviar email
    if (pedido.usuario?.correo) {
      const html = buildEmailHtml(pedidoResponse, pedido.usuario);
      enviarCorreo(pedido.usuario.correo, 'Confirmación de Pedido', html).catch(console.error);
    }

    res.json(pedidoResponse);
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/pedido/listar
router.get('/listar', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id_pedido, p.fecha, p.metodo_pago, pr.nombre AS nombre_producto, pr.precio,
              p.total, p.id_usuario, p.estado, dp.importe, dp.cantidad,
              (SELECT i.url FROM imagen_producto ip JOIN imagen i ON ip.id_imagen = i.id_imagen
               WHERE ip.id_producto = pr.id_producto ORDER BY i.id_imagen LIMIT 1) AS url_imagen
       FROM pedido p
       JOIN detalle_pedido dp ON p.id_pedido = dp.id_pedido
       JOIN producto pr ON dp.id_producto = pr.id_producto
       ORDER BY p.id_pedido`
    );
    const result = rows.map(r => ({
      idPedido: r.id_pedido,
      fecha: r.fecha,
      metodoPago: r.metodo_pago,
      nombreProducto: r.nombre_producto,
      precioProducto: r.precio,
      total: r.total,
      idUsuario: r.id_usuario,
      estado: r.estado,
      importe: r.importe,
      cantidad: r.cantidad,
      urlImagen: r.url_imagen,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/pedido/listarPedidos
router.get('/listarPedidos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.telefono, u.direccion, u.estado AS estado_usuario,
              p.estado AS estado_pedido, p.id_pedido, p.fecha, p.hora, p.metodo_pago, p.total,
              p.direccion_entrega, p.fecha_entrega, p.responsable_recojo1, p.responsable_recojo2,
              pro.nombre AS nombre_producto, dp.cantidad, dp.importe,
              pro.id_producto, pro.descripcion, pro.precio, cat.nombre AS nombre_categoria, i.url
       FROM usuario u
       INNER JOIN pedido p ON u.id_usuario = p.id_usuario
       INNER JOIN detalle_pedido dp ON p.id_pedido = dp.id_pedido
       INNER JOIN producto pro ON dp.id_producto = pro.id_producto
       LEFT JOIN imagen_producto ip ON pro.id_producto = ip.id_producto
       LEFT JOIN imagen i ON ip.id_imagen = i.id_imagen
       INNER JOIN categoria cat ON pro.id_categoria = cat.id_categoria`
    );

    const pedidosMap = {};
    for (const d of rows) {
      if (!pedidosMap[d.id_pedido]) {
        pedidosMap[d.id_pedido] = {
          idPedido: d.id_pedido, fecha: d.fecha, hora: d.hora, metodoPago: d.metodo_pago,
          total: d.total, estadoPedido: d.estado_pedido,
          idUsuario: d.id_usuario, nombre: d.nombre, apellido: d.apellido,
          correo: d.correo, telefono: d.telefono, direccion: d.direccion, estadoUsuario: d.estado_usuario,
          productos: [],
        };
      }
      const pedido = pedidosMap[d.id_pedido];
      let producto = pedido.productos.find(p => p.idProducto === d.id_producto);
      if (!producto) {
        producto = {
          idProducto: d.id_producto, nombreProducto: d.nombre_producto,
          descripcionProducto: d.descripcion, precioProducto: d.precio,
          cantidad: d.cantidad, imagenes: [],
        };
        pedido.productos.push(producto);
      }
      if (d.url && !producto.imagenes.includes(d.url)) {
        producto.imagenes.push(d.url);
      }
    }

    const result = Object.values(pedidosMap);
    if (result.length === 0) return res.status(404).json({ message: 'No se encontraron pedidos.' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/pedido/listarPedMes
router.get('/listarPedMes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(STR_TO_DATE(fecha, '%Y-%m-%d'), '%Y-%m') AS mes,
              COUNT(id_pedido) AS total_pedidos
       FROM pedido GROUP BY mes ORDER BY mes`
    );
    res.json(rows.map(r => ({ mes: r.mes, totalPedidos: r.total_pedidos })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/pedido/listarMejorMes
router.get('/listarMejorMes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(STR_TO_DATE(fecha, '%Y-%m-%d'), '%Y-%m') AS mes,
              COUNT(pedido.id_pedido) AS total_pedidos,
              SUM(importe) AS total_importe
       FROM pedido INNER JOIN detalle_pedido ON pedido.id_pedido = detalle_pedido.id_pedido
       GROUP BY mes ORDER BY total_importe DESC LIMIT 1`
    );
    if (rows.length === 0) return res.json(null);
    res.json({ mes: rows[0].mes, totalPedidos: rows[0].total_pedidos, totalImporte: Number(rows[0].total_importe) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/pedido/listarPeorMes
router.get('/listarPeorMes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(STR_TO_DATE(fecha, '%Y-%m-%d'), '%Y-%m') AS mes,
              COUNT(pedido.id_pedido) AS total_pedidos,
              SUM(importe) AS total_importe
       FROM pedido INNER JOIN detalle_pedido ON pedido.id_pedido = detalle_pedido.id_pedido
       GROUP BY mes ORDER BY total_importe ASC LIMIT 1`
    );
    if (rows.length === 0) return res.json(null);
    res.json({ mes: rows[0].mes, totalPedidos: rows[0].total_pedidos, totalImporte: Number(rows[0].total_importe) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/pedido/obtenerTotalVentas
router.get('/obtenerTotalVentas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT SUM(importe) AS total_importe FROM detalle_pedido');
    res.json({ totalImporte: rows[0].total_importe ? Number(rows[0].total_importe) : 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function buildEmailHtml(pedido, usuario) {
  const detalles = pedido.detalles || [];
  let subtotal = 0;
  let detallesHtml = '';

  for (const det of detalles) {
    subtotal += det.importe;
    detallesHtml += `<tr><td>${det.producto?.nombre || ''}</td><td>${det.cantidad}</td><td>S/ ${det.importe.toFixed(2)}</td></tr>`;
  }

  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Boleta de Compra</title>
<style>
body{font-family:'Courier New',Courier,monospace;background:#f9f9f9;padding:20px;text-align:center}
.boleta{width:320px;margin:auto;background:white;padding:15px;border-radius:8px;border:1px solid #ccc;box-shadow:2px 2px 8px rgba(0,0,0,.1)}
.header{font-size:18px;font-weight:bold;padding:10px;background:red;color:white;border-radius:8px 8px 0 0}
.cliente-info{background:#f1f1f1;padding:10px;border-radius:5px;box-shadow:inset 0 0 5px rgba(0,0,0,.1);margin-bottom:10px;text-align:left}
.details,.footer{font-size:14px;text-align:left}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border-bottom:1px dashed #333;padding:5px;text-align:left}
.total{font-size:16px;font-weight:bold;text-align:right;margin-top:10px}
.footer{margin-top:15px;padding-top:10px;border-top:1px dashed #333;font-size:12px}
</style></head><body>
<div class="boleta">
<div class="header">BOLETA DE COMPRA</div>
<div class="cliente-info">
<p><strong>Cliente:</strong> ${usuario.nombre || ''}</p>
<p><strong>Email:</strong> ${usuario.correo || ''}</p>
<p><strong>Direccion:</strong> ${usuario.direccion || ''}</p>
<p><strong>Telefono:</strong> ${usuario.telefono || ''}</p>
</div>
<p><strong>Fecha:</strong> ${pedido.fecha || ''}</p>
<div class="details"><table>
<tr><th>Producto</th><th>Cant.</th><th>Importe</th></tr>
${detallesHtml}
</table></div>
<p class="total">Subtotal: <strong>S/ ${subtotal.toFixed(2)}</strong></p>
<p class="total">IGV (18%): <strong>S/ ${igv.toFixed(2)}</strong></p>
<p class="total" style="border-top:1px dashed #333;padding-top:5px">Total: <strong>S/ ${total.toFixed(2)}</strong></p>
<p>Gracias por su compra!</p>
<div class="footer">
<p>Nombre de la Tienda</p>
<p><a href="https://www.tutienda.com" style="color:black;text-decoration:none">www.tutienda.com</a></p>
<p>Tel: +51 987 654 321 | Email: soporte@tutienda.com</p>
</div></div></body></html>`;
}

module.exports = router;
