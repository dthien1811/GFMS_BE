'use strict';

const dbImport = require('../models');
const db = dbImport?.default || dbImport;

const normalizeInteger = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeMetadata = (metadata) => {
  if (metadata === null || metadata === undefined) return null;
  if (typeof metadata === 'string') return metadata;
  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
};

async function logEquipmentUnitEvents(entries = [], options = {}) {
  if (!db?.EquipmentUnitEvent) return [];

  const transaction = options.transaction;
  const now = new Date();
  const rows = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      equipmentUnitId: normalizeInteger(entry?.equipmentUnitId),
      equipmentId: normalizeInteger(entry?.equipmentId),
      gymId: normalizeInteger(entry?.gymId),
      fromGymId: normalizeInteger(entry?.fromGymId),
      toGymId: normalizeInteger(entry?.toGymId),
      eventType: String(entry?.eventType || '').trim(),
      referenceType: entry?.referenceType ? String(entry.referenceType).trim() : null,
      referenceId: normalizeInteger(entry?.referenceId),
      performedBy: normalizeInteger(entry?.performedBy),
      notes: entry?.notes ? String(entry.notes).trim() : null,
      metadata: normalizeMetadata(entry?.metadata),
      eventAt: entry?.eventAt ? new Date(entry.eventAt) : now,
      createdAt: now,
      updatedAt: now,
    }))
    .filter((entry) => entry.equipmentUnitId && entry.equipmentId && entry.eventType);

  if (!rows.length) return [];
  return db.EquipmentUnitEvent.bulkCreate(rows, { transaction });
}

module.exports = {
  logEquipmentUnitEvents,
};

module.exports.default = module.exports;