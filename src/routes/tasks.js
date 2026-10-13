import { Router } from "express";
import { getAll, getById, add, update, remove, toggle } from "../services/taskService.js";
import { AppError } from "../errors/AppError.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const VALID_PRIORITIES = ["low", "mid", "high"];

// Con Mongo el :id era un ObjectId y Mongoose validaba su formato (CastError ->
// 400). Acá el id es un entero: lo validamos nosotros en el borde (la ruta) y
// tiramos 400 antes de que SQL compare un valor basura.
function parseTaskId(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
        throw new AppError(`Id inválido: ${raw}`, 400);
    }
    return id;
}

// Solo el usuario que creó la tarea puede editarla/borrarla. Las tareas son
// públicamente visibles igual (GET no requiere auth), así que no tiene
// sentido devolver 404 para ocultar su existencia -devolvemos 403.
// req.user.id viene del JWT como string (payload.sub); userId de la fila es un
// número: comparamos ambos como número.
function assertOwner(task, userId) {
    if (Number(task.userId) !== Number(userId)) {
        throw new AppError("No tenés permiso para modificar esta tarea", 403);
    }
}

// GET /api/tasks
router.get("/", async (req, res) => {
    const { completed, search } = req.query;
    const filters = {};
    if (completed !== undefined) filters.completed = completed === "true";
    if (search) filters.search = search;

    const tasks = await getAll(filters);
    if (!tasks.length) {
        throw new AppError("No se encontraron tareas", 404);
    }
    res.json(tasks);
});

// GET /api/tasks/:id
router.get("/:id", async (req, res) => {
    const id = parseTaskId(req.params.id);
    const task = await getById(id);
    if (!task) throw new AppError(`No se encontró la tarea con id ${id}`, 404);
    res.json(task);
});

// POST /api/tasks
router.post("/", requireAuth, async (req, res) => {
    // req.body puede ser undefined si la request no trae body (o JSON null):
    // Express 5 no lo inicializa. `?? {}` evita el 500 y deja que la validación
    // de abajo responda 400.
    const body = req.body ?? {};
    const title = body.title?.trim();
    const description = (body.description ?? "").trim();
    const { priority = "low" } = body;
    if (!title) throw new AppError("El campo title es obligatorio", 400);
    if (!VALID_PRIORITIES.includes(priority)) {
        throw new AppError(`El campo priority debe ser uno de: ${VALID_PRIORITIES.join(", ")}`, 400);
    }
    // createdAt/updatedAt los setea la base sola (schema.sql con DEFAULT
    // CURRENT_TIMESTAMP). req.user.id es string, la columna es INT: lo pasamos a número.
    const task = await add({
        title,
        description,
        priority,
        completed: false,
        userId: Number(req.user.id),
    });
    res.status(201).json(task);
});

// PATCH /api/tasks/:id/toggle — before /:id so Express doesn't treat "toggle" as an id
router.patch("/:id/toggle", requireAuth, async (req, res) => {
    const id = parseTaskId(req.params.id);
    const existing = await getById(id);
    if (!existing) throw new AppError(`No se encontró la tarea con id ${id}`, 404);
    assertOwner(existing, req.user.id);

    const task = await toggle(id);
    res.json(task);
});

// PATCH /api/tasks/:id
router.patch("/:id", requireAuth, async (req, res) => {
    const id = parseTaskId(req.params.id);
    const task = await getById(id);
    if (!task) throw new AppError(`No se encontró la tarea con id ${id}`, 404);
    assertOwner(task, req.user.id);

    const body = req.body ?? {};
    const title = body.title?.trim();
    const description = body.description?.trim();
    const { priority, completed } = body;
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
        throw new AppError(`El campo priority debe ser uno de: ${VALID_PRIORITIES.join(", ")}`, 400);
    }
    const fields = {};
    if (title !== undefined) fields.title = title;
    if (description !== undefined) fields.description = description;
    if (priority !== undefined) fields.priority = priority;
    if (completed !== undefined) fields.completed = completed;
    // updatedAt lo actualiza la base sola (ON UPDATE CURRENT_TIMESTAMP).

    const updated = await update(id, fields);
    res.json(updated);
});

// DELETE /api/tasks/:id
router.delete("/:id", requireAuth, async (req, res) => {
    const id = parseTaskId(req.params.id);
    const existing = await getById(id);
    if (!existing) throw new AppError(`No se encontró la tarea con id ${id}`, 404);
    assertOwner(existing, req.user.id);

    await remove(id);
    res.status(204).send();
});

export default router;
