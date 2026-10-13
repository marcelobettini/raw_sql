// Servicio de usuarios: credenciales (bcrypt) + acceso a datos (SQL) juntos.
//
// ============================================================================
// SIMPLIFICACIÓN EDUCATIVA (a propósito, no por descuido)
// ============================================================================
// Igual que en taskService.js, el SQL vive acá dentro del servicio en vez de en
// un "repository" aparte, para que el camino completo se lea en un solo archivo:
// ruta -> servicio (negocio + SQL) -> fila de MySQL.
//
// En un proyecto real usaríamos un repository pattern (una capa que encapsula el
// SQL y expone funciones del dominio) porque: separa negocio de persistencia,
// permite testear el servicio con un doble sin base real, deja cambiar de motor
// de base tocando un solo archivo y centraliza el mapeo fila -> objeto de API.
// La explicación larga está en taskService.js; acá se omite para no repetirla.
// ============================================================================
import bcrypt from "bcryptjs";
import { getPool } from "../db/mysqlClient.js";

// Cantidad de rondas de bcrypt. A más rondas, más lento de hashear -> más difícil
// de atacar por fuerza bruta, pero también más lento para el usuario legítimo.
// 10 es el default habitual.
const SALT_ROUNDS = 10;

// Columnas "públicas": NUNCA incluyen password_hash. Es el equivalente SQL del
// select:false de Mongoose: por defecto el hash ni siquiera entra al proceso
// (la segunda capa es la ruta de login, que lo saca del objeto antes de
// responder: `const { passwordHash, ...publicUser } = user`).
const PUBLIC_COLUMNS = `
    id,
    first_name AS firstName,
    last_name AS lastName,
    email,
    created_at AS createdAt,
    updated_at AS updatedAt
`;

export async function createUser({ firstName, lastName, email, password }) {
    // Hasheamos SIEMPRE acá: la contraseña en texto plano no debe salir de esta
    // función ni llegar a la base. bcrypt usa salt propio embebido en el hash.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Un email duplicado tira un error nativo de MySQL (ER_DUP_ENTRY, por el
    // índice UNIQUE) que errorHandler.js traduce a 409 -no lo chequeamos acá a
    // mano (un SELECT previo + INSERT tendría una race condition entre ambos).
    const [result] = await getPool().execute(
        "INSERT INTO users (first_name, last_name, email, password_hash) VALUES (?, ?, ?, ?)",
        [firstName, lastName, email, passwordHash]
    );

    // Releemos por id para devolver la fila pública (sin el hash) con los
    // timestamps que generó la base.
    return getById(result.insertId);
}

// Helper privado (no se exporta): solo lo usa createUser. Al no exponerlo, el
// resto de la app no puede pedir un usuario sin pasar por las reglas de acá.
async function getById(id) {
    const [rows] = await getPool().execute(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
    return rows[0] ?? null;
}

// findByEmailWithPassword: el ÚNICO lugar de todo el código que selecciona
// password_hash, y lo hace de forma explícita. Es el equivalente auditable del
// .select('+passwordHash') de Mongoose. Solo lo usa el login, para comparar.
export async function findByEmailWithPassword(email) {
    const [rows] = await getPool().execute(
        `SELECT ${PUBLIC_COLUMNS}, password_hash AS passwordHash FROM users WHERE email = ?`,
        [email]
    );
    return rows[0] ?? null;
}

// Compara texto plano contra el hash. bcrypt.compare recalcula el hash con el
// mismo salt (que viene embebido en el propio hash) y compara; nunca desencripta
// (bcrypt es de un solo sentido).
export async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
