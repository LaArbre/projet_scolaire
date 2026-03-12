/**
 * reset.js — Réinitialisation complète de la base de données
 * Appelé uniquement si NODE_ENV=development ET RESET_DB=true dans .env
 * Ouvre sa propre connexion, droppe tout, recrée les tables, insère les comptes de test.
 */

const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetDatabase() {
    console.log('\n⚠️  [RESET] Démarrage de la réinitialisation de la base...');

    const pool = await mysql.createPool({
        host:             process.env.DB_HOST,
        user:             process.env.DB_USER,
        password:         process.env.DB_PASSWORD,
        database:         process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit:  3,
    });

    // ── Suppression (respecter l'ordre des FK) ────────────────────────────────
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['messages', 'attachments', 'audit_logs', 'reports', 'sessions', 'users']) {
        await pool.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ [RESET] Tables supprimées');

    // ── Recréation ─────────────────────────────────────────────────────────────
    await pool.query(`
        CREATE TABLE users (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            fullname       VARCHAR(100) NOT NULL,
            email          VARCHAR(255) UNIQUE NOT NULL,
            password       VARCHAR(255) NOT NULL,
            role           ENUM('employee','hr','legal','admin') NOT NULL DEFAULT 'employee',
            failed_attempts INT DEFAULT 0,
            locked_until   TIMESTAMP NULL,
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
        CREATE TABLE sessions (
            session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
            expires    INT(11) UNSIGNED NOT NULL,
            data       TEXT COLLATE utf8mb4_bin,
            PRIMARY KEY (session_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
        CREATE TABLE reports (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            tracking_code  VARCHAR(64) UNIQUE NOT NULL,
            title          VARCHAR(255) NOT NULL,
            user_id        INT NULL,
            category       ENUM('Harcèlement moral','Harcèlement sexuel','Discrimination','Conflit hiérarchique','Atteinte à l''éthique','Autre') NOT NULL,
            description    TEXT NOT NULL,
            status         ENUM('open','in_progress','waiting_info','closed_founded','closed_unfounded') DEFAULT 'open',
            is_anonymous   BOOLEAN DEFAULT FALSE,
            ai_category    VARCHAR(100) NULL,
            ai_confidence  FLOAT NULL,
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            closed_at      TIMESTAMP NULL,
            closed_by      INT NULL,
            close_reason   TEXT NULL,
            INDEX idx_tracking (tracking_code),
            INDEX idx_status (status),
            FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
        CREATE TABLE messages (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            report_id   INT NOT NULL,
            sender_id   INT NULL,
            sender_role ENUM('employee','hr','legal','system') NOT NULL,
            content     TEXT NOT NULL,
            is_anonymous BOOLEAN DEFAULT FALSE,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_report (report_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
        CREATE TABLE attachments (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            report_id   INT NOT NULL,
            message_id  INT NULL,
            filename    VARCHAR(255) NOT NULL,
            filepath    VARCHAR(512) NOT NULL,
            filesize    INT NOT NULL,
            mime_type   VARCHAR(100),
            uploaded_by INT NULL,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (report_id)  REFERENCES reports(id) ON DELETE CASCADE,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_report (report_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
        CREATE TABLE audit_logs (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT NULL,
            action      VARCHAR(100) NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            entity_id   INT NULL,
            old_data    JSON NULL,
            new_data    JSON NULL,
            ip_address  VARCHAR(45) NULL,
            user_agent  TEXT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_entity (entity_type, entity_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ [RESET] Tables recréées');

    // ── Seed : un compte par rôle ─────────────────────────────────────────────
    const seedUsers = [
        { fullname: 'Employé Test',  email: 'employee@test.com', password: 'Test1234!', role: 'employee' },
        { fullname: 'RH Test',       email: 'hr@test.com',       password: 'Test1234!', role: 'hr'       },
        { fullname: 'Juriste Test',  email: 'legal@test.com',    password: 'Test1234!', role: 'legal'    },
        { fullname: 'Admin Test',    email: 'admin@test.com',    password: 'Test1234!', role: 'admin'    },
    ];

    for (const u of seedUsers) {
        const hashed = await bcrypt.hash(u.password, 12);
        await pool.query(
            'INSERT INTO users (fullname, email, password, role) VALUES (?, ?, ?, ?)',
            [u.fullname, u.email, hashed, u.role]
        );
        console.log(`✅ [RESET] Seed : ${u.email} (${u.role})`);
    }

    await pool.end();
    console.log('✅ [RESET] Terminé — connexion temporaire fermée\n');
}

module.exports = { resetDatabase };
