"use strict";

const { sequelize } = require("../models");

/**
 * Optional table:
 * webhook_events(provider, event_id UNIQUE, event_type, payload_json, status, processed_at, error_message, created_at)
 *
 * Nếu table chưa tồn tại -> safeInsert sẽ catch và ignore (demo vẫn chạy).
 */

async function safeInsert({ provider, eventId, eventType, payload }) {
  try {
    await sequelize.query(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload_json, status, processed_at, created_at)
       VALUES (:provider, :event_id, :event_type, :payload_json, 'PROCESSED', NOW(), NOW())`,
      {
        replacements: {
          provider: provider || "mock_signnow",
          event_id: eventId,
          event_type: eventType,
          payload_json: JSON.stringify(payload || {}),
        },
      }
    );
  } catch (e) {
    // ignore if table missing or duplicate event
    // console.warn("webhookEventStore safeInsert skipped:", e.message);
  }
}

async function safeInsertTx(t, { provider, eventId, eventType, payload }) {
  try {
    await sequelize.query(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload_json, status, processed_at, created_at)
       VALUES (:provider, :event_id, :event_type, :payload_json, 'PROCESSED', NOW(), NOW())`,
      {
        transaction: t,
        replacements: {
          provider: provider || "mock_signnow",
          event_id: eventId,
          event_type: eventType,
          payload_json: JSON.stringify(payload || {}),
        },
      }
    );
  } catch (e) {
    // ignore
  }
}

module.exports = { safeInsert, safeInsertTx };
