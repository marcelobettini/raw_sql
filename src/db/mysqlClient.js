// Módulo de conexión a MySQL usando el driver nativo mysql2 (sin ORM).
// Reemplaza a mongoClient.js: en lugar de levantar un mongod efímero en memoria,
// nos conectamos a un MySQL real usando un pool de conexiones.
// El pool es un singleton: connectDB() se llama una sola vez al arrancar el
// server, antes de app.listen(), y getPool() lo reutiliza en cada query.
import { createPool, createConnection } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SCHEMA_PATH = fileURLToPath(new URL("./schema.sql", import.meta.url));

let pool;

// Leemos process.env DENTRO de las funciones, no en una const de módulo: los
// imports se evalúan antes que el process.loadEnvFile() de src/index.js, así
// que una const de módulo ignoraría en silencio un valor seteado solo en .env
// (mismo motivo que baseOptions() en src/utils/cookies.js y getAccessSecret()
// en src/services/authService.js).
function connectionSettings() {
    return {
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
    };
}

function getDatabaseName() {
    const name = process.env.DB_NAME || "tododb";
    // El nombre de la base se interpola como identificador (no puede viajar como
    // parámetro ?), así que lo validamos. DB_NAME viene de config y no de un
    // request, pero un nombre con backticks rompería el SQL.
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
        throw new Error(`DB_NAME inválido: "${name}" (solo letras, números y guión bajo)`);
    }
    return name;
}

// El pool principal no puede conectarse a una base que todavía no existe, así
// que primero creamos la base con una conexión corta sin `database` seleccionada.
async function ensureDatabase() {
    const connection = await createConnection(connectionSettings());
    try {
        await connection.query(
            `CREATE DATABASE IF NOT EXISTS \`${getDatabaseName()}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
    } finally {
        await connection.end();
    }
}

// Aplica schema.sql en cada arranque. Ejecutamos el archivo entero en una
// conexión corta con multipleStatements: el contenido es un archivo local
// nuestro (no input del usuario), así que no hay riesgo de inyección, y así el
// DDL puede tener comentarios con ";" sin que haya que parsearlo. El pool de
// runtime NO tiene multipleStatements habilitado.
async function initSchema() {
    const sql = await readFile(SCHEMA_PATH, "utf8");
    const connection = await createConnection({
        ...connectionSettings(),
        database: getDatabaseName(),
        multipleStatements: true,
    });
    try {
        await connection.query(sql);
    } finally {
        await connection.end();
    }
}

export async function connectDB() {
    await ensureDatabase();

    const { host, port } = connectionSettings();
    pool = createPool({
        ...connectionSettings(),
        database: getDatabaseName(),
        waitForConnections: true,
        connectionLimit: 10,
        charset: "utf8mb4",
        // Interpretamos los DATETIME como UTC para que, al serializarse a JSON,
        // salgan como ISO ...Z (el mismo formato que devolvía la API con Mongo).
        timezone: "Z",
    });

    // Falla temprano y con un error claro si MySQL no está disponible, en vez de
    // dejar el server escuchando requests que después van a explotar.
    await pool.query("SELECT 1");
    await initSchema();

    console.log(`Conectado a MySQL en ${host}:${port} - base de datos: ${getDatabaseName()}`);
}

// Único punto de acceso al pool para el resto de la app (repositories y health
// check). Lanza si se llama antes de connectDB(), igual que el viejo getDB().
export function getPool() {
    if (!pool) throw new Error("Pool no inicializado. Debes correr connectDB() antes.");
    return pool;
}

// Cierra todas las conexiones del pool. A diferencia de mongodb-memory-server no
// hay un proceso externo que apagar, pero igual conviene cerrar limpio en
// SIGINT/SIGTERM y en tests futuros.
export async function disconnectDB() {
    if (pool) await pool.end();
    pool = undefined;
}
