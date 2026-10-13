// Servicio de persistencia/credenciales de usuario. No sabe nada de JWT ni de
// cookies -esa orquestación vive en authService.js-, solo hashea passwords y
// lee/escribe el usuario a través de userRepository. Sin refresh token, no hay
// ningún estado de sesión que persistir acá: solo credenciales.
import bcrypt from "bcryptjs";
import * as userRepository from "../repositories/userRepository.js";

const SALT_ROUNDS = 10;

export async function createUser({ firstName, lastName, email, password }) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // Un email duplicado tira un error nativo de MySQL (ER_DUP_ENTRY, por el
    // índice UNIQUE) que errorHandler.js traduce a 409 -no lo chequeamos acá a
    // mano para evitar una race condition entre el SELECT y el INSERT.
    return userRepository.create({ firstName, lastName, email, passwordHash });
}

// findByEmailWithPassword: busca un usuario por su email y devuelve la fila con
// el campo passwordHash incluido, que por defecto no se selecciona. Usado
// durante el login para verificar la contraseña.
export async function findByEmailWithPassword(email) {
    return userRepository.findByEmailWithPassword(email);
}

export async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
