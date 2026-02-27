const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

// POST /api/comentarios/registrar
router.post('/registrar', async (req, res) => {
  try {
    const { contenido, estrellas, estado, fechaComentario, usuario } = req.body;
    if (!usuario?.idUsuario) return res.status(400).json({ message: 'El usuario no puede ser nulo' });

    const [result] = await pool.query(
      'INSERT INTO comentario (contenido, estrellas, estado, fecha_comentario, id_usuario) VALUES (?, ?, ?, ?, ?)',
      [contenido, estrellas, estado || 'Activo', fechaComentario, usuario.idUsuario]
    );
    res.json({
      idComentario: result.insertId,
      contenido, estrellas, estado: estado || 'Activo', fechaComentario,
      usuario,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/comentarios/listar
router.get('/listar', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.nombre, c.fecha_comentario, c.estrellas, c.contenido, c.id_comentario, c.estado
       FROM usuario u JOIN comentario c ON u.id_usuario = c.id_usuario`
    );
    const result = rows.map(r => ({
      nombre: r.nombre,
      fechaComentario: r.fecha_comentario,
      estrellas: r.estrellas,
      contenido: r.contenido,
      idComentario: r.id_comentario,
      estado: r.estado,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/comentarios/listarActivos
router.get('/listarActivos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.nombre, c.fecha_comentario, c.estrellas, c.contenido, c.id_comentario, c.estado
       FROM usuario u JOIN comentario c ON u.id_usuario = c.id_usuario
       WHERE c.estado = 'Activo'`
    );
    const result = rows.map(r => ({
      nombre: r.nombre,
      fechaComentario: r.fecha_comentario,
      estrellas: r.estrellas,
      contenido: r.contenido,
      idComentario: r.id_comentario,
      estado: r.estado,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/comentarios/actualizar/:id
router.patch('/actualizar/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM comentario WHERE id_comentario = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Comentario no encontrado' });

    const nuevoEstado = rows[0].estado === 'Activo' ? 'Inactivo' : 'Activo';
    await pool.query('UPDATE comentario SET estado = ? WHERE id_comentario = ?', [nuevoEstado, req.params.id]);

    const [updated] = await pool.query('SELECT * FROM comentario WHERE id_comentario = ?', [req.params.id]);
    const c = updated[0];
    res.json({
      idComentario: c.id_comentario,
      contenido: c.contenido,
      estrellas: c.estrellas,
      estado: c.estado,
      fechaComentario: c.fecha_comentario,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
