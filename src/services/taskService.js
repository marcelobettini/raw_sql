// Servicio de negocio de tareas: orquesta el acceso a datos, sin saber SQL.
// El SQL (y su mapeo a la API) vive en src/repositories/taskRepository.js; acá
// solo queda la lógica de la capa de servicio.
import * as taskRepository from "../repositories/taskRepository.js";

export async function getAll(filters) {
    return taskRepository.getAll(filters);
}

export async function getById(id) {
    return taskRepository.getById(id);
}

export async function add(fields) {
    return taskRepository.create(fields);
}

export async function update(id, fields) {
    return taskRepository.update(id, fields);
}

export async function remove(id) {
    return taskRepository.remove(id);
}

export async function toggle(id) {
    // El "flip" atómico vive en el repository: un único UPDATE ... SET completed
    // = NOT completed, que invierte y lee en la misma sentencia (ACID: acá nos
    // interesa la atomicidad). Dos toggles concurrentes no pueden perder uno.
    // Es el equivalente SQL del pipeline $not de Mongo, sin transacción.
    return taskRepository.toggle(id);
}
