-- Schema NB — sito vetrina cantante
-- Eseguire su MySQL 8.0 come: mysql -u admin -p -e "CREATE DATABASE nb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
-- Poi: mysql -u admin -p nb < schema.sql

-- ---------------------------------------------------------------------------
-- eventi
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventi (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId       VARCHAR(36)  NOT NULL UNIQUE,
  titolo         VARCHAR(255) NOT NULL,
  immagineS3Path VARCHAR(500),
  descrizioneIT  TEXT,
  descrizioneEN  TEXT,
  linkBiglietti  VARCHAR(500),
  luogo          VARCHAR(255),
  emailSentAt    TIMESTAMP NULL DEFAULT NULL,
  createdAt      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_createdAt (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrations per DB esistente:
-- ALTER TABLE eventi ADD COLUMN luogo VARCHAR(255) AFTER linkBiglietti;
-- ALTER TABLE eventi ADD COLUMN emailSentAt TIMESTAMP NULL DEFAULT NULL AFTER luogo;

-- ---------------------------------------------------------------------------
-- event_dates — date e orari per ogni evento (1:N)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_dates (
  id       INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  eventoId INT UNSIGNED NOT NULL,
  data     DATE NOT NULL,
  ora      TIME,
  INDEX idx_eventoId (eventoId),
  INDEX idx_data (data),
  FOREIGN KEY (eventoId) REFERENCES eventi(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- press — rassegna stampa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS press (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId        VARCHAR(36)  NOT NULL UNIQUE,
  nomeTestata     VARCHAR(255) NOT NULL,
  citazioneIT     TEXT,
  citazioneEN     TEXT,
  nomeGiornalista VARCHAR(255),
  ordine          SMALLINT UNSIGNED DEFAULT 0,
  createdAt       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ordine (ordine)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- album_fotografici
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS album_fotografici (
  id       INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId VARCHAR(36)  NOT NULL UNIQUE,
  nome     VARCHAR(255) NOT NULL,
  ordine   SMALLINT UNSIGNED DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ordine (ordine)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- immagini — immagini degli album fotografici (1:N)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS immagini (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId      VARCHAR(36)  NOT NULL UNIQUE,
  albumId       INT UNSIGNED NOT NULL,
  ordine        SMALLINT UNSIGNED NOT NULL,
  s3Path        VARCHAR(500),
  titolo        VARCHAR(255),
  ruoloIT       VARCHAR(255),
  ruoloEN       VARCHAR(255),
  conIT         VARCHAR(500),
  conEN         VARCHAR(500),
  descrizioneIT TEXT,
  descrizioneEN TEXT,
  createdAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_albumId_ordine (albumId, ordine),
  FOREIGN KEY (albumId) REFERENCES album_fotografici(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- album_musicali
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS album_musicali (
  id                 INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId           VARCHAR(36)  NOT NULL UNIQUE,
  titolo             VARCHAR(255) NOT NULL,
  fotoS3Path         VARCHAR(500),
  streamingLinks     JSON,
  audioPreviewS3Path VARCHAR(500),
  ordine             SMALLINT UNSIGNED DEFAULT 0,
  emailSentAt        TIMESTAMP NULL DEFAULT NULL,
  createdAt          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ordine (ordine)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration per DB esistente:
-- ALTER TABLE album_musicali ADD COLUMN emailSentAt TIMESTAMP NULL DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- content_blocks — blocchi di contenuto testuale generici (About, ecc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_blocks (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId     VARCHAR(36)  NOT NULL UNIQUE,
  sezione      VARCHAR(100) NOT NULL,
  titoloIT     VARCHAR(255),
  titoloEN     VARCHAR(255),
  contenutoIT  LONGTEXT,
  contenutoEN  LONGTEXT,
  createdAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sezione (sezione)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- newsletter_invii — storico comunicazioni newsletter inviate
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_invii (
  id        INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId  VARCHAR(36)  NOT NULL UNIQUE,
  titolo    VARCHAR(255) NOT NULL,
  corpo     TEXT         NOT NULL,
  sentCount INT UNSIGNED DEFAULT 0,
  inviatoAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inviatoAt (inviatoAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- immagini_download — immagini scaricabili per stampa/giornalisti
-- Separate dagli album fotografici: sono foto autorizzate al download con
-- credit fotografo, anno e risoluzione.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS immagini_download (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId     VARCHAR(36)  NOT NULL UNIQUE,
  titolo       VARCHAR(255) NOT NULL,
  s3Path       VARCHAR(500),
  anno         SMALLINT UNSIGNED,
  credit       VARCHAR(255),
  risoluzione  VARCHAR(50),
  ordine       SMALLINT UNSIGNED DEFAULT 0,
  createdAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ordine (ordine)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration per DB esistente (prima del deploy):
-- CREATE TABLE immagini_download (...) AS SOPRA;
-- La tabella non ha foreign key: può essere creata in qualsiasi momento.

-- ---------------------------------------------------------------------------
-- subscribers — iscritti alla newsletter
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscribers (
  id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  publicId   VARCHAR(36)  NOT NULL UNIQUE,
  email      VARCHAR(255) NOT NULL UNIQUE,
  token      VARCHAR(64)  NOT NULL UNIQUE,
  confermato TINYINT(1)   NOT NULL DEFAULT 0,
  createdAt  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
