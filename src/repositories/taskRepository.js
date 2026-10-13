// Acceso a datos de tareas: SQL crudo con mysql2 + mapeo fila -> objeto de API.
// Esta capa es la que reemplaza a los modelos de Mongoose: no hay schema ni ORM,
// solo queries parametrizadas. Todo lo que sale de acá ya tiene la forma de la
// API (camelCase y `id`), nunca columnas sueltas ni `_id`.
import { getPool } from "../db/mysqlClient.js";

// El alias de SQL hace el renombre de columnas, así el mapeo a la API queda casi
// automático y a la vista en la propia query.
const COLUMNS = `
    id,
    title,
    description,
    priority,
    completed,
    user_id AS userId,
    created_at AS createdAt,
    updated_at AS updatedAt
`;

// Columnas que un cliente puede modificar en un UPDATE. Nunca interpolamos un
// nombre de columna que venga del request: solo estos literales de la whitelist.
const UPDATABLE = {
    title: "title",
    description: "description",
    priority: "priority",
    completed: "completed",
};

// MySQL devuelve TINYINT(1) como 0/1; la API responde un booleano.
function mapRow(row) {
    return { ...row, completed: Boolean(row.completed) };
}

// Escapamos los comodines de LIKE para que la búsqueda sea literal: sin esto un
// search "%" matchearía todo y "_" matchearía cualquier carácter. El carácter de
// escape (\) está declarado en la query con ESCAPE.
function escapeLike(text) {
    return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function getAll({ completed, search } = {}) {
    const where = [];
    const params = [];

    if (completed !== undefined) {
        where.push("completed = ?");
        params.push(completed ? 1 : 0);
    }
    if (search) {
        where.push("(title LIKE ? ESCAPE '\\\\' OR description LIKE ? ESCAPE '\\\\')");
        const pattern = `%${escapeLike(search)}%`;
        params.push(pattern, pattern);
    }

    const sql = `SELECT ${COLUMNS} FROM tasks ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id`;
    const [rows] = await getPool().execute(sql, params);
    return rows.map(mapRow);
}

// CAracterística para evitar SQL Injection: la query está parametrizada y no interpolamos el id directamente. Esto evita que un atacante envíe algo así: `1; DROP TABLE tasks; --` y borre la tabla de tareas. El driver de MySQL se encarga de escapar el valor del id y tratarlo como un parámetro, no como parte de la query. En la query maliciosa, el `;` indica el final de una sentencia SQL y el `--` indica un comentario, por lo que todo lo que sigue se ignora. Al usar parámetros, el driver no permite que se ejecute código adicional, solo busca la fila con el id proporcionado.
export async function getById(id) {
    const [rows] = await getPool().execute(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`, [id]);
    return rows[0] ? mapRow(rows[0]) : null;
}

export async function create({ title, description, priority, completed = false, userId }) {
    const [result] = await getPool().execute(
        "INSERT INTO tasks (title, description, priority, completed, user_id) VALUES (?, ?, ?, ?, ?)",
        [title, description, priority, completed ? 1 : 0, userId]
    );
    // insertId lo provee el driver; releemos para devolver created_at/updated_at
    // tal como los generó la base (la base es la única fuente de verdad de los
    // timestamps, igual que antes lo era Mongoose).
    return getById(result.insertId);
}

export async function update(id, fields) {
    // Nos quedamos solo con las claves conocidas: aunque la ruta ya valide, acá
    // no confiamos en el llamador para no interpolar cualquier cosa en el SET.
    const columns = Object.keys(fields).filter((key) => key in UPDATABLE);
    // Nada que actualizar: devolvemos la fila tal cual.
    if (!columns.length) return getById(id);

    const setClause = columns.map((key) => `${UPDATABLE[key]} = ?`).join(", ");
    const values = columns.map((key) => (key === "completed" ? (fields[key] ? 1 : 0) : fields[key]));

    // updated_at lo actualiza la base sola (ON UPDATE CURRENT_TIMESTAMP).
    await getPool().execute(`UPDATE tasks SET ${setClause} WHERE id = ?`, [...values, id]);
    return getById(id);
}

export async function remove(id) {
    const [result] = await getPool().execute("DELETE FROM tasks WHERE id = ?", [id]);
    // affectedRows = 0 significa que no existía: la función devuelve false.
    return result.affectedRows > 0;
}

export async function toggle(id) {
    // El "flip" es un único UPDATE, atómico: `NOT completed` invierte leyendo y
    // escribiendo en la misma sentencia, así que dos toggles concurrentes no
    // pueden perder uno (equivalente al pipeline $not de Mongo). No hace falta
    // una transacción para un solo statement.
    await getPool().execute("UPDATE tasks SET completed = NOT completed WHERE id = ?", [id]);
    return getById(id);
}
