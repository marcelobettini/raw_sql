# Todo API

## Sumario

- [Todo API](#todo-api)
  - [Sumario](#sumario)
  - [URL Base](#url-base)
  - [Endpoints](#endpoints)
  - [Referencia](#referencia)
    - [GET /tasks](#get-tasks)
    - [GET /tasks/:id](#get-tasksid)
    - [POST /tasks](#post-tasks)
    - [PATCH /tasks/:id](#patch-tasksid)
    - [PATCH /tasks/:id/toggle](#patch-tasksidtoggle)
    - [DELETE /tasks/:id](#delete-tasksid)
    - [GET /health](#get-health)
  - [Configuración](#configuración)

---

## URL Base

```
http://localhost:3001/api
```

---

## Endpoints

| Método   | Ruta                      | Descripción                          |
|----------|---------------------------|--------------------------------------|
| `GET`    | `/tasks`                  | Lista todas las tareas               |
| `GET`    | `/tasks/:id`              | Obtiene una tarea por id             |
| `POST`   | `/tasks`                  | Crea una nueva tarea                 |
| `PATCH`  | `/tasks/:id`              | Actualiza parcialmente una tarea     |
| `PATCH`  | `/tasks/:id/toggle`       | Invierte el estado `completed`       |
| `DELETE` | `/tasks/:id`              | Elimina una tarea                    |
| `GET`    | `/health`                 | Verifica el estado del servidor y la conexión a la base de datos |

---

## Referencia

### GET /tasks

Lista todas las tareas. Acepta query params opcionales para filtrar resultados.

| Query param  | Tipo      | Descripción                                       |
|--------------|-----------|---------------------------------------------------|
| `completed`  | `boolean` | Filtra por estado: `true` o `false`               |
| `search`     | `string`  | Busca por coincidencia en `title` o `description` |

**Listar todas las tareas**

```http
GET /api/tasks
```

**Filtrar por estado**

```http
GET /api/tasks?completed=false
```

**Buscar por texto**

```http
GET /api/tasks?search=compras
```

**Combinar filtros**

```http
GET /api/tasks?completed=false&search=compras
```

---

### GET /tasks/:id

Obtiene una tarea por su id.

```http
GET /api/tasks/1
```

---

### POST /tasks

Crea una nueva tarea.

| Campo         | Tipo     | Requerido | Valores válidos            | Default |
|---------------|----------|-----------|----------------------------|---------|
| `title`       | `string` | Sí        | Cualquier texto no vacío   | —       |
| `description` | `string` | No        | Cualquier texto            | `""`    |
| `priority`    | `string` | No        | `"low"`, `"mid"`, `"high"` | `"low"` |

```http
POST /api/tasks
Content-Type: application/json
```

```json
{
  "title": "Hacer las compras",
  "description": "Leche, pan y frutas",
  "priority": "mid"
}
```

---

### PATCH /tasks/:id

Actualiza parcialmente una tarea. Solo se modifican los campos enviados en el cuerpo.

| Campo         | Tipo      | Valores válidos            |
|---------------|-----------|----------------------------|
| `title`       | `string`  | Cualquier texto no vacío   |
| `description` | `string`  | Cualquier texto            |
| `priority`    | `string`  | `"low"`, `"mid"`, `"high"` |
| `completed`   | `boolean` | `true` o `false`           |

```http
PATCH /api/tasks/1
Content-Type: application/json
```

```json
{
  "priority": "high",
  "completed": true
}
```

---

### PATCH /tasks/:id/toggle

Invierte el valor de `completed` sin necesidad de enviar cuerpo.

```http
PATCH /api/tasks/1/toggle
```

---

### DELETE /tasks/:id

Elimina una tarea. Devuelve `204 No Content` si la operación fue exitosa.

```http
DELETE /api/tasks/1
```

---

### GET /health

Verifica que el servidor esté activo y que la conexión a MySQL responda. No está bajo el prefijo `/api`.

```http
GET /health
```

Respuesta exitosa (`200`):

```json
{
  "status": "ok",
  "db": "ok",
  "timestamp": "2024-05-23T14:32:00.000Z"
}
```

Respuesta cuando MySQL no responde (`503`):

```json
{
  "status": "error",
  "db": "unreachable",
  "timestamp": "2024-05-23T14:32:00.000Z"
}
```

---

## Configuración

La API usa **MySQL** (sin ORM: SQL directo con `mysql2`). Hace falta un MySQL
corriendo y accesible; el resto tiene defaults pensados para desarrollo local.
Si querés, podés crear un archivo `.env` en la raíz del proyecto para
sobreescribir los defaults:

```env
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=tododb
```

Al arrancar, el server crea la base si no existe (`CREATE DATABASE IF NOT EXISTS`)
y aplica el esquema de `src/db/schema.sql` (tablas con `IF NOT EXISTS`, es
idempotente), así que no hay que correr migraciones a mano.

> A diferencia de una base en memoria, los datos **persisten entre reinicios**.
