-- Esquema de la base (DDL). Se aplica en cada arranque desde connectDB()
-- (src/db/mysqlClient.js): todas las sentencias son IF NOT EXISTS, así que es
-- idempotente y no hace falta un sistema de migraciones para este proyecto.
--
-- Convenciones:
-- - snake_case en las columnas; el renombre a camelCase para la API lo hace el
--   alias de SQL en los repositories (first_name AS firstName, etc.).
-- - created_at/updated_at los mantiene la base sola (DEFAULT CURRENT_TIMESTAMP
--   y ON UPDATE CURRENT_TIMESTAMP): no los escribe la aplicación.
-- - utf8mb4 para soportar acentos y emoji en title/description.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  -- Hash bcrypt (60 chars). Dejamos margen por si algún día cambia el algoritmo.
  password_hash VARCHAR(72)  NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- UNIQUE: la base misma garantiza que no haya dos usuarios con el mismo email
  -- (un intento duplicado tira ER_DUP_ENTRY, que errorHandler.js traduce a 409).
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority    ENUM('low','mid','high') NOT NULL DEFAULT 'low',
  completed   TINYINT(1) NOT NULL DEFAULT 0,
  user_id     INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Índice sobre la FK: lo usa el JOIN/filtro por dueño.
  KEY idx_tasks_user_id (user_id),
  -- Integridad referencial: no se puede crear una tarea de un usuario inexistente,
  -- y si se borra el usuario se borran sus tareas (ON DELETE CASCADE).
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
