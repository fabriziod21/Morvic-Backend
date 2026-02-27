const { Router } = require('express');
const multer = require('multer');
const pool = require('../config/db');
const { subirImagen } = require('../config/s3');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/producto/registrar
router.post('/registrar', upload.array('imagenes'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const producto = JSON.parse(req.body.producto);
    const [result] = await conn.query(
      `INSERT INTO producto (nombre, descripcion, precio, estado, stock_minimo, stock_maximo, stock_actual, id_categoria, id_proveedor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        producto.nombre, producto.descripcion, producto.precio,
        producto.estado || 'Disponible',
        producto.stockMinimo, producto.stockMaximo, producto.stockActual,
        producto.categoria?.idCategoria, producto.proveedor?.idProveedor,
      ]
    );
    const idProducto = result.insertId;

    // Subir imágenes a S3
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await subirImagen(file);
        const [imgResult] = await conn.query('INSERT INTO imagen (url) VALUES (?)', [url]);
        await conn.query('INSERT INTO imagen_producto (id_imagen, id_producto) VALUES (?, ?)', [imgResult.insertId, idProducto]);
      }
    }

    await conn.commit();

    // Devolver producto con imágenes
    const [rows] = await pool.query(
      `SELECT p.*, c.nombre AS nombre_categoria, pr.nombre AS nombre_proveedor
       FROM producto p
       LEFT JOIN categoria c ON p.id_categoria = c.id_categoria
       LEFT JOIN proveedor pr ON p.id_proveedor = pr.id_proveedor
       WHERE p.id_producto = ?`,
      [idProducto]
    );
    const [imgs] = await pool.query(
      `SELECT i.url FROM imagen_producto ip JOIN imagen i ON ip.id_imagen = i.id_imagen WHERE ip.id_producto = ?`,
      [idProducto]
    );

    const p = rows[0];
    res.status(201).json({
      idProducto: p.id_producto,
      nombre: p.nombre, descripcion: p.descripcion, precio: p.precio,
      estado: p.estado, stockMinimo: p.stock_minimo, stockMaximo: p.stock_maximo, stockActual: p.stock_actual,
      categoria: { idCategoria: p.id_categoria, nombre: p.nombre_categoria },
      proveedor: { idProveedor: p.id_proveedor, nombre: p.nombre_proveedor },
      imagenes: imgs.map(img => ({ imagen: { url: img.url } })),
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/producto/listar
router.get('/listar', async (req, res) => {
  try {
    const [productos] = await pool.query(
      `SELECT p.*, c.id_categoria, c.nombre AS nombre_categoria,
              pr.id_proveedor, pr.nombre AS nombre_proveedor
       FROM producto p
       LEFT JOIN categoria c ON p.id_categoria = c.id_categoria
       LEFT JOIN proveedor pr ON p.id_proveedor = pr.id_proveedor`
    );

    const [imagenes] = await pool.query(
      `SELECT ip.id_producto, i.id_imagen, i.url
       FROM imagen_producto ip
       JOIN imagen i ON ip.id_imagen = i.id_imagen`
    );

    const imgMap = {};
    for (const img of imagenes) {
      if (!imgMap[img.id_producto]) imgMap[img.id_producto] = [];
      imgMap[img.id_producto].push({ id: img.id_imagen, imagen: { idImagen: img.id_imagen, url: img.url } });
    }

    const result = productos.map(p => ({
      idProducto: p.id_producto,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      estado: p.estado,
      stockMinimo: p.stock_minimo,
      stockMaximo: p.stock_maximo,
      stockActual: p.stock_actual,
      categoria: { idCategoria: p.id_categoria, nombre: p.nombre_categoria },
      proveedor: { idProveedor: p.id_proveedor, nombre: p.nombre_proveedor },
      imagenes: imgMap[p.id_producto] || [],
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/producto/listarPro
router.get('/listarPro', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id_producto, p.nombre, p.precio, pr.nombre AS nombre_proveedor,
              p.stock_actual, p.estado, c.nombre AS nombre_categoria
       FROM producto p
       INNER JOIN proveedor pr ON p.id_proveedor = pr.id_proveedor
       INNER JOIN categoria c ON p.id_categoria = c.id_categoria`
    );
    const result = rows.map(r => ({
      idProducto: r.id_producto,
      nombre: r.nombre,
      precio: r.precio,
      nombreProveedor: r.nombre_proveedor,
      stockActual: r.stock_actual,
      estado: r.estado,
      nombreCategoria: r.nombre_categoria,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
