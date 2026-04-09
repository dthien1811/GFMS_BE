'use strict';

const inferMaintenanceEventType = (row) => {
  const status = String(row?.status || '').toLowerCase();
  if (status === 'pending') return 'maintenance_requested';
  if (status === 'approve') return 'maintenance_approved';
  if (status === 'assigned') return 'maintenance_assigned';
  if (status === 'in_progress') return 'maintenance_started';
  if (status === 'completed') return 'maintenance_completed';
  if (status === 'cancelled') {
    return String(row?.notes || '').includes('[REJECT_REASON]:')
      ? 'maintenance_rejected'
      : 'maintenance_cancelled';
  }
  return 'maintenance_requested';
};

const inferMaintenanceEventAt = (row) => {
  const status = String(row?.status || '').toLowerCase();
  if (status === 'completed') return row.completionDate || row.updatedAt || row.createdAt || new Date();
  if (status === 'approve') return row.scheduledDate || row.updatedAt || row.createdAt || new Date();
  return row.updatedAt || row.createdAt || new Date();
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const maintenances = await queryInterface.sequelize.query(
      `SELECT
        id,
        equipmentUnitId,
        equipmentId,
        gymId,
        requestedBy,
        assignedTo,
        status,
        issueDescription,
        notes,
        estimatedCost,
        actualCost,
        scheduledDate,
        completionDate,
        createdAt,
        updatedAt
      FROM maintenance
      WHERE equipmentUnitId IS NOT NULL`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!maintenances.length) return;

    const existingEvents = await queryInterface.sequelize.query(
      `SELECT referenceId
      FROM equipmentunitevent
      WHERE referenceType = 'maintenance' AND referenceId IS NOT NULL`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const existingReferenceIds = new Set(
      existingEvents.map((row) => Number(row.referenceId)).filter((value) => Number.isInteger(value) && value > 0)
    );

    const rows = maintenances
      .filter((row) => !existingReferenceIds.has(Number(row.id)))
      .map((row) => ({
        equipmentUnitId: Number(row.equipmentUnitId),
        equipmentId: Number(row.equipmentId),
        gymId: Number(row.gymId),
        fromGymId: null,
        toGymId: null,
        eventType: inferMaintenanceEventType(row),
        referenceType: 'maintenance',
        referenceId: Number(row.id),
        performedBy: Number(row.assignedTo || row.requestedBy) || null,
        notes: row.issueDescription || row.notes || null,
        metadata: JSON.stringify({
          source: 'maintenance_backfill',
          maintenanceStatus: row.status,
          requestedBy: row.requestedBy || null,
          assignedTo: row.assignedTo || null,
          estimatedCost: row.estimatedCost,
          actualCost: row.actualCost,
        }),
        eventAt: inferMaintenanceEventAt(row),
        createdAt: row.createdAt || new Date(),
        updatedAt: row.updatedAt || new Date(),
      }))
      .filter((row) => row.equipmentUnitId && row.equipmentId && row.referenceId);

    if (rows.length > 0) {
      await queryInterface.bulkInsert('equipmentunitevent', rows);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('equipmentunitevent', {
      referenceType: 'maintenance',
    });
  },
};