// Servicio de tareas: lógica de negocio + acceso a datos (SQL) juntos en un
// mismo archivo.
//
// ============================================================================
// SIMPLIFICACIÓN EDUCATIVA (a propósito, no por descuido)
// ============================================================================
// El SQL vive acá dentro del servicio en vez de en una capa aparte
// ("repository"). Así, cuando seguís un request, ves el camino completo en un
// solo lugar: ruta -> servicio (negocio + SQL) -> fila de MySQL -> objeto de
// API. Menos archivos que saltar para entender cómo se conecta todo.
//
// ¿POR QUÉ EN UN PROYECTO REAL USARÍAMOS UN REPOSITORY PATTERN?
// (una capa que encapsula el SQL detrás de funciones del dominio, ej.
//  taskRepository.getAll(), y que el servicio consume sin saber que existe SQL)
//   1. Separación de responsabilidades: el servicio decide *qué* hace la app
//      (reglas de negocio); el repository, *cómo* se guarda (SQL). Acá están
//      mezclados: si cambia una regla de negocio, tocás el mismo archivo que el SQL.
//   2. Testeabilidad: se puede testear el servicio reemplazando el repository por
//      un doble (mock/stub) y sin levantar una base real. Con el SQL embebido,
//      testear el servicio obliga a tener MySQL.
//   3. Portabilidad de la base: si mañana se pasa de MySQL a otro motor, se
//      reescribe solo el repository; el servicio y las rutas no se enteran.
//   4. Evitar duplicación: hoy cada tabla tiene un único consumidor, pero con más
//      casos de uso el mismo SQL (o variantes) se repetiría por todo el servicio.
//   5. Mapeo centralizado: la traducción fila -> objeto de API (alias de columnas,
//      conversión de tipos) queda en un solo punto, no repartida por el servicio.
//
// En este proyecto esas ventajas no compensan: son pocas queries, con un único
// consumidor cada una y un solo motor de base. Por eso el repository se eliminó.
// Si el proyecto creciera, este es el primer refactor que conviene hacer.
// ============================================================================
import { getPool } from "../db/mysqlClient.js";

// El alias de SQL hace el renombre de columnas de snake_case (base) a camelCase
// (API), así el mapeo es casi automático y queda a la vista en la propia query.
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
// (Los *valores* sí van como parámetros ?; los identificadores no pueden ir como
// parámetro, por eso la whitelist es la única defensa contra inyección ahí.)
const UPDATABLE = {
    title: "title",
    description: "description",
    priority: "priority",
    completed: "completed",
};

// MySQL devuelve TINYINT(1) como 0/1; la API responde un booleano de verdad.
// Es el único tipo que hay que convertir a mano: el resto de columnas ya llegan
// con el tipo correcto (VARCHAR -> string, DATETIME -> Date -> ISO en JSON).
function mapRow(row) {
    return { ...row, completed: Boolean(row.completed) };
}

// Escapamos los comodines de LIKE para que la búsqueda sea literal: sin esto un
// search "%" matchearía todo y "_" matchearía cualquier carácter. El carácter de
// escape (\) está declarado en la query de getAll con ESCAPE.
function escapeLike(text) {
    return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function getAll({ completed, search } = {}) {
    // Armamos el WHERE de forma dinámica pero SIEMPRE parametrizando los valores:
    // los ? los escapa el driver (prepared statement), y solo agregamos fragmentos
    // de SQL fijos, nunca texto del usuario.
    const where = [];
    const params = [];

    if (completed !== undefined) {
        where.push("completed = ?");
        params.push(completed ? 1 : 0);
    }
    if (search) {
        where.push("(title LIKE ? ESCAPE '\\\\' OR description LIKE ? ESCAPE '\\\\')");
        const pattern = `%${escapeLike(search)}%`;
        // Dos parámetros: el patrón se usa tanto en title como en description.
        params.push(pattern, pattern);
    }

    const sql = `SELECT ${COLUMNS} FROM tasks ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id`;
    const [rows] = await getPool().execute(sql, params);
    return rows.map(mapRow);
}

export async function getById(id) {
    const [rows] = await getPool().execute(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`, [id]);
    return rows[0] ? mapRow(rows[0]) : null;
}

export async function add({ title, description, priority, completed = false, userId }) {
    const [result] = await getPool().execute(
        "INSERT INTO tasks (title, description, priority, completed, user_id) VALUES (?, ?, ?, ?, ?)",
        [title, description, priority, completed ? 1 : 0, userId]
    );
    // insertId lo provee el driver; releemos la fila para devolver created_at/
    // updated_at tal como los generó la base (la base es la única fuente de
    // verdad de los timestamps; la app nunca los escribe a mano).
    return getById(result.insertId);
}

export async function update(id, fields) {
    // Nos quedamos solo con las claves conocidas: aunque la ruta ya valide, acá
    // no confiamos en el llamador para no interpolar cualquier cosa en el SET.
    const columns = Object.keys(fields).filter((key) => key in UPDATABLE);
    // Nada que actualizar: devolvemos la fila tal cual (updated_at no cambia).
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
    // pueden perder uno (ACID: acá nos interesa la atomicidad). Es el equivalente
    // SQL del pipeline $not de Mongo. No hace falta una transacción para un solo
    // statement: la transacción sería para agrupar varias operaciones relacionadas.
    await getPool().execute("UPDATE tasks SET completed = NOT completed WHERE id = ?", [id]);
    return getById(id);
}
