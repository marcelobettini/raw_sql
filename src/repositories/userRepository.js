// Acceso a datos de usuarios: SQL crudo + mapeo fila -> objeto de API.
// Igual que en taskRepository, el alias de SQL renombra las columnas y acá queda
// centralizado qué se expone.
import { getPool } from "../db/mysqlClient.js";

// Columnas "públicas": NUNCA incluyen password_hash. Es el equivalente SQL del
// select:false de Mongoose: por defecto el hash ni siquiera entra al proceso.
const PUBLIC_COLUMNS = `
    id,
    first_name AS firstName,
    last_name AS lastName,
    email,
    created_at AS createdAt,
    updated_at AS updatedAt
`;

export async function create({ firstName, lastName, email, passwordHash }) {
    const [result] = await getPool().execute(
        "INSERT INTO users (first_name, last_name, email, password_hash) VALUES (?, ?, ?, ?)",
        [firstName, lastName, email, passwordHash]
    );
    // Releemos por id para devolver la fila pública (sin el hash) con los
    // timestamps que generó la base.
    return getById(result.insertId);
}

export async function getById(id) {
    const [rows] = await getPool().execute(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
    return rows[0] ?? null;
}

// Único lugar que pide el hash: el login lo necesita para comparar con bcrypt.
// Es el equivalente explícito y auditable del .select('+passwordHash'): la
// excepción queda a la vista, no es el comportamiento por defecto.
export async function findByEmailWithPassword(email) {
    const [rows] = await getPool().execute(
        `SELECT ${PUBLIC_COLUMNS}, password_hash AS passwordHash FROM users WHERE email = ?`,
        [email]
    );
    return rows[0] ?? null;
}
