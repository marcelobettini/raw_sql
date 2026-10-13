import { Router } from "express";
import { getPool } from "../db/mysqlClient.js";
const router = Router();

router.get('/', async (req, res) => {
    const timestamp = new Date().toISOString();
    try {
        // Consulta trivial que confirma que el pool y MySQL responden.
        await getPool().query('SELECT 1');
        res.json({ status: 'ok', db: 'ok', timestamp });

    } catch (err) {
        console.log(err);
        // 503 Service Unavailable: el server corre pero la dependencia crítica no responde
        res.status(503).json({ status: 'error', db: 'unreachable', timestamp });
    }
});

export default router;
