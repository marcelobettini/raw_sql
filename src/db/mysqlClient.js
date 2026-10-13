// Módulo de conexión a MySQL usando el driver nativo mysql2 (sin ORM).
// En este proyecto el nombre de la base de datos está hardcodeado a "tododb" a
// propósito (simplicidad educativa), para evitar parametrización innecesaria.
import { createPool, createConnection } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SCHEMA_PATH = fileURLToPath(new URL("./schema.sql", import.meta.url));
const DATABASE = "tododb";

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

// El pool principal no puede conectarse a una base que todavía no existe, así
// que primero creamos la base con una conexión corta sin `database` seleccionada.
async function ensureDatabase() {
    const connection = await createConnection(connectionSettings());
    try {
        await connection.query(
            `CREATE DATABASE IF NOT EXISTS \`${DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
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
        database: DATABASE,
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
        database: DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        charset: "utf8mb4",
        timezone: "Z",
    });

    await pool.query("SELECT 1");
    await initSchema();

    console.log(`Conectado a MySQL en ${host}:${port} - base de datos: ${DATABASE}`);
}

export function getPool() {
    if (!pool) throw new Error("Pool no inicializado. Debes correr connectDB() antes.");
    return pool;
}

export async function disconnectDB() {
    if (pool) await pool.end();
    pool = undefined;
}
