-- Word Wizards Database Schema
-- Run this once against your SQL Server instance

CREATE DATABASE WordWizards;
GO

USE WordWizards;
GO

-- Players
CREATE TABLE Players (
    PlayerId   INT IDENTITY(1,1) PRIMARY KEY,
    Username   NVARCHAR(50) UNIQUE NOT NULL,
    Avatar     NVARCHAR(10) NOT NULL DEFAULT '🧙',
    CreatedAt  DATETIME2 DEFAULT GETDATE()
);

-- Game sessions (one row per completed game)
CREATE TABLE GameSessions (
    SessionId     INT IDENTITY(1,1) PRIMARY KEY,
    PlayerId      INT NOT NULL REFERENCES Players(PlayerId),
    GameType      NVARCHAR(20) NOT NULL,  -- letters | spell | trace | story
    Score         INT NOT NULL,
    TotalQuestions INT NOT NULL,
    Pct           AS CAST(Score * 100.0 / TotalQuestions AS DECIMAL(5,1)) PERSISTED,
    PlayedAt      DATETIME2 DEFAULT GETDATE()
);

-- Index for quick per-player queries
CREATE INDEX IX_GameSessions_Player ON GameSessions(PlayerId, GameType, PlayedAt DESC);

-- Helpful view: best score per player per game type
CREATE VIEW vw_BestScores AS
SELECT
    p.Username,
    p.Avatar,
    gs.GameType,
    MAX(gs.Pct)   AS BestPct,
    COUNT(*)      AS TimesPlayed,
    MAX(gs.PlayedAt) AS LastPlayed
FROM GameSessions gs
JOIN Players p ON p.PlayerId = gs.PlayerId
GROUP BY p.Username, p.Avatar, gs.GameType;
GO
