// Manejador de errores centralizado: es el único lugar que decide status + shape
// de una respuesta de error. Los route handlers no arman respuestas de error a
// mano, tiran un AppError (o dejan que Express 5 reenvíe acá cualquier
// rejection/excepción).
//
// Con MySQL, la validación de campos y del id ya se resuelve en las rutas con
// AppError (400). Acá solo queda traducir errores nativos del driver.
export function errorHandler(err, req, res, next) {
    let status = err.status || err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // ER_DUP_ENTRY (1062): violación de un índice UNIQUE (ej. email repetido).
    // mysql2 expone el código SQL en err.code ('ER_DUP_ENTRY') y el número en
    // err.errno (1062); chequeamos ambos por robustez entre versiones.
    if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
        status = 409;
        // err.sqlMessage es algo como: Duplicate entry 'ana@x.com' for key 'users.uq_users_email'
        const key = err.sqlMessage?.match(/for key '([^']+)'/)?.[1]?.split(".").pop() || "";
        message = key.includes("email")
            ? "Ya existe un usuario con ese email"
            : "Ya existe un registro duplicado";
    }

    // Los errores >= 500 son inesperados (bug o falla real): se loguean con stack.
    // Los 4xx son esperables (input inválido, recurso no encontrado) y quedan silenciosos.
    if (status >= 500) console.error(err.stack);

    res.status(status).json({ status, error: message });
}
