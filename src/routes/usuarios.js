const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

// POST /api/usuarios/login
router.post('/login', async (req, res) => {
  try {
    const { correo, contrasena } = req.body;
    const [rows] = await pool.query(
      `SELECT u.*, r.id_rol, r.roles
       FROM usuario u
       LEFT JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.correo = ? AND u.contrasena = ?`,
      [correo, contrasena]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    const user = rows[0];
    res.json({
      idUsuario: user.id_usuario,
      nombre: user.nombre,
      apellido: user.apellido,
      telefono: user.telefono,
      correo: user.correo,
      login: user.login,
      contrasena: user.contrasena,
      estado: user.estado,
      direccion: user.direccion,
      rol: { idRol: user.id_rol, roles: user.roles },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/usuarios  (registro)
router.post('/', async (req, res) => {
  try {
    const { nombre, apellido, telefono, correo, login, contrasena, estado, direccion, rol } = req.body;
    const idRol = rol?.idRol || 1;
    const [result] = await pool.query(
      `INSERT INTO usuario (nombre, apellido, telefono, correo, login, contrasena, estado, direccion, id_rol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre, apellido, telefono, correo, login, contrasena, estado || 'Activo', direccion, idRol]
    );
    res.json({
      idUsuario: result.insertId,
      nombre, apellido, telefono, correo, login, contrasena,
      estado: estado || 'Activo', direccion,
      rol: { idRol, roles: idRol === 1 ? 'cliente' : 'vendedor' },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/usuarios/listar
router.get('/listar', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.*, r.id_rol, r.roles
       FROM usuario u
       LEFT JOIN rol r ON u.id_rol = r.id_rol`
    );
    const usuarios = rows.map(u => ({
      idUsuario: u.id_usuario,
      nombre: u.nombre,
      apellido: u.apellido,
      telefono: u.telefono,
      correo: u.correo,
      login: u.login,
      contrasena: u.contrasena,
      estado: u.estado,
      direccion: u.direccion,
      rol: { idRol: u.id_rol, roles: u.roles },
    }));
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/usuarios/devolverEstadisticas
router.get('/devolverEstadisticas', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT YEAR(v.fecha_visita) AS anio, MONTH(v.fecha_visita) AS mes, SUM(v.numero_visita) AS total_visitas
       FROM visitas v
       GROUP BY YEAR(v.fecha_visita), MONTH(v.fecha_visita)`
    );
    const estadisticas = rows.map(r => ({
      year: r.anio,
      mes: r.mes,
      totalVisitas: Number(r.total_visitas),
    }));
    res.json(estadisticas);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/usuarios/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.*, r.id_rol, r.roles
       FROM usuario u
       LEFT JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
    const u = rows[0];
    res.json({
      idUsuario: u.id_usuario,
      nombre: u.nombre, apellido: u.apellido, telefono: u.telefono,
      correo: u.correo, login: u.login, contrasena: u.contrasena,
      estado: u.estado, direccion: u.direccion,
      rol: { idRol: u.id_rol, roles: u.roles },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
  try {
    const { nombre, apellido, telefono, correo, login, contrasena, estado, direccion, rol } = req.body;
    const idRol = rol?.idRol || 1;
    await pool.query(
      `UPDATE usuario SET nombre=?, apellido=?, telefono=?, correo=?, login=?, contrasena=?, estado=?, direccion=?, id_rol=?
       WHERE id_usuario=?`,
      [nombre, apellido, telefono, correo, login, contrasena, estado, direccion, idRol, req.params.id]
    );
    res.json({
      idUsuario: parseInt(req.params.id),
      nombre, apellido, telefono, correo, login, contrasena, estado, direccion,
      rol: { idRol, roles: idRol === 1 ? 'cliente' : 'vendedor' },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/usuarios/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuario WHERE id_usuario = ?', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/usuarios/actualizar/:id  (toggle estado)
router.patch('/actualizar/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM usuario WHERE id_usuario = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
    const nuevoEstado = rows[0].estado === 'Activo' ? 'Baneado' : 'Activo';
    await pool.query('UPDATE usuario SET estado = ? WHERE id_usuario = ?', [nuevoEstado, req.params.id]);

    const [updated] = await pool.query(
      `SELECT u.*, r.id_rol, r.roles FROM usuario u LEFT JOIN rol r ON u.id_rol = r.id_rol WHERE u.id_usuario = ?`,
      [req.params.id]
    );
    const u = updated[0];
    res.json({
      idUsuario: u.id_usuario, nombre: u.nombre, apellido: u.apellido,
      telefono: u.telefono, correo: u.correo, login: u.login, contrasena: u.contrasena,
      estado: u.estado, direccion: u.direccion,
      rol: { idRol: u.id_rol, roles: u.roles },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/usuarios/actualizarRol/:id  (toggle rol)
router.put('/actualizarRol/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.*, r.roles FROM usuario u LEFT JOIN rol r ON u.id_rol = r.id_rol WHERE u.id_usuario = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

    const rolActual = rows[0].roles;
    const nuevoRolNombre = rolActual === 'cliente' ? 'vendedor' : 'cliente';
    const [rolRows] = await pool.query('SELECT * FROM rol WHERE roles = ?', [nuevoRolNombre]);
    if (rolRows.length === 0) return res.status(404).json({ message: 'Rol no encontrado' });

    await pool.query('UPDATE usuario SET id_rol = ? WHERE id_usuario = ?', [rolRows[0].id_rol, req.params.id]);

    const [updated] = await pool.query(
      `SELECT u.*, r.id_rol, r.roles FROM usuario u LEFT JOIN rol r ON u.id_rol = r.id_rol WHERE u.id_usuario = ?`,
      [req.params.id]
    );
    const u = updated[0];
    res.json({
      idUsuario: u.id_usuario, nombre: u.nombre, apellido: u.apellido,
      telefono: u.telefono, correo: u.correo, login: u.login, contrasena: u.contrasena,
      estado: u.estado, direccion: u.direccion,
      rol: { idRol: u.id_rol, roles: u.roles },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
