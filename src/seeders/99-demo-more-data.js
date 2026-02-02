'use strict';

const bcrypt = require('bcryptjs');

function buildInsertIgnoreSQL(table, rows) {
  if (!rows || rows.length === 0) return null;

  const cols = Object.keys(rows[0]);
  const colSql = cols.map((c) => `\`${c}\``).join(', ');

  const rowPlaceholders = `(${cols.map(() => '?').join(', ')})`;
  const allPlaceholders = rows.map(() => rowPlaceholders).join(', ');

  const values = [];
  for (const r of rows) for (const c of cols) values.push(r[c]);

  const sql = `INSERT IGNORE INTO \`${table}\` (${colSql}) VALUES ${allPlaceholders};`;
  return { sql, values };
}

async function insertIgnore(queryInterface, table, rows) {
  const built = buildInsertIgnoreSQL(table, rows);
  if (!built) return;
  await queryInterface.sequelize.query(built.sql, { replacements: built.values });
}

function pick(arr, idx) {
  return arr[idx % arr.length];
}

function dt(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const hashed = await bcrypt.hash('password123', 10);

    // =========================================================
    // CONFIG: bạn có thể tăng số ở đây để “nhiều hơn nữa”
    // =========================================================
    const NUM_EXTRA_ADMINS = 3;      // thêm admin
    const NUM_EXTRA_OWNERS = 8;      // thêm owner
    const NUM_EXTRA_TRAINER_USERS = 18;
    const NUM_EXTRA_MEMBER_USERS = 40;

    const NUM_EXTRA_GYMS = 6;        // thêm gym
    const NUM_EXTRA_FR_REQUESTS = 12;
    const NUM_EXTRA_POLICIES = 8;    // policy system + theo gym
    const NUM_EXTRA_TRAINERS = 18;   // trainer table rows
    const NUM_EXTRA_MEMBERS = 40;    // member table rows
    const NUM_EXTRA_MAINTENANCES = 40;
    const NUM_EXTRA_TRAINER_SHARES = 30;

    const NUM_EXTRA_PACKAGES = 12;
    const NUM_EXTRA_PACKAGE_ACTIVATIONS = 30;
    const NUM_EXTRA_TRANSACTIONS = 40;

    const NUM_EXTRA_AUDITLOGS = 80;

    // =========================================================
    // 1) USERS (append) — groupId: 1 admin, 2 owner, 3 trainer, 4 member
    // =========================================================
    let users = [];

    // Admins
    for (let i = 0; i < NUM_EXTRA_ADMINS; i++) {
      const id = 2000 + i;
      users.push({
        id,
        email: `admin_more_${i + 1}@gfms.com`,
        password: hashed,
        username: `admin_more_${i + 1}`,
        address: pick(['HCM', 'Da Nang', 'Ha Noi'], i),
        sex: pick(['male', 'female'], i),
        phone: `0908${(100000 + i).toString().slice(-6)}`,
        groupId: 1,
        avatar: `admin_more_${i + 1}.jpg`,
        status: 'active',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Owners
    for (let i = 0; i < NUM_EXTRA_OWNERS; i++) {
      const id = 2100 + i;
      users.push({
        id,
        email: `owner_more_${i + 1}@gfms.com`,
        password: hashed,
        username: `owner_more_${i + 1}`,
        address: pick(['Thu Duc, HCM', 'Binh Thanh, HCM', 'Hai Chau, Da Nang', 'Cau Giay, Ha Noi'], i),
        sex: pick(['male', 'female'], i),
        phone: `0917${(200000 + i).toString().slice(-6)}`,
        groupId: 2,
        avatar: `owner_more_${i + 1}.jpg`,
        status: 'active',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Trainer users
    for (let i = 0; i < NUM_EXTRA_TRAINER_USERS; i++) {
      const id = 2200 + i;
      users.push({
        id,
        email: `trainer_more_${i + 1}@gfms.com`,
        password: hashed,
        username: `trainer_more_${i + 1}`,
        address: pick(['HCM', 'Da Nang', 'Ha Noi'], i),
        sex: pick(['male', 'female'], i),
        phone: `0926${(300000 + i).toString().slice(-6)}`,
        groupId: 3,
        avatar: `trainer_more_${i + 1}.jpg`,
        status: 'active',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Member users
    for (let i = 0; i < NUM_EXTRA_MEMBER_USERS; i++) {
      const id = 2400 + i;
      users.push({
        id,
        email: `member_more_${i + 1}@gfms.com`,
        password: hashed,
        username: `member_more_${i + 1}`,
        address: pick(['HCM', 'Da Nang', 'Ha Noi'], i),
        sex: pick(['male', 'female'], i),
        phone: `0935${(400000 + i).toString().slice(-6)}`,
        groupId: 4,
        avatar: `member_more_${i + 1}.jpg`,
        status: 'active',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    await insertIgnore(queryInterface, 'user', users);

    // =========================================================
    // 2) GYMS (append)
    // =========================================================
    // gym id: bắt đầu từ 100 để tránh trùng demo
    const gyms = [];
    for (let i = 0; i < NUM_EXTRA_GYMS; i++) {
      const id = 100 + i;
      const ownerId = 2100 + (i % NUM_EXTRA_OWNERS);
      gyms.push({
        id,
        name: `Demo Gym ${id} - ${pick(['Elite', 'Plus', 'Prime', 'Fit', 'Pro'], i)}`,
        address: pick(['HCM', 'Da Nang', 'Ha Noi'], i),
        phone: `0909${(500000 + i).toString().slice(-6)}`,
        email: `gym_${id}@demo.com`,
        description: `Gym demo seed ${id} for reports & flows.`,
        status: 'active',
        ownerId,
        franchiseRequestId: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'gym', gyms);

    // =========================================================
    // 3) FRANCHISE REQUESTS (append)
    // =========================================================
    const frStatuses = ['pending', 'approved', 'rejected'];
    const franchiseRequests = [];
    for (let i = 0; i < NUM_EXTRA_FR_REQUESTS; i++) {
      const id = 300 + i;
      const requesterId = 2100 + (i % NUM_EXTRA_OWNERS);
      const status = pick(frStatuses, i);
      franchiseRequests.push({
        id,
        requesterId,
        businessName: `Franchise Request ${id}`,
        location: pick(['HCM', 'Da Nang', 'Ha Noi'], i),
        contactPerson: `Owner ${requesterId}`,
        contactPhone: `0911${(600000 + i).toString().slice(-6)}`,
        contactEmail: `owner_more_${(i % NUM_EXTRA_OWNERS) + 1}@gfms.com`,
        investmentAmount: pick([150000000, 300000000, 550000000, 900000000], i),
        businessPlan: `Plan for request ${id}`,
        status,
        reviewedBy: status === 'pending' ? null : 1,
        reviewNotes: status === 'rejected' ? 'Rejected: demo reason' : (status === 'approved' ? 'Approved: demo note' : null),
        approvedDate: status === 'approved' ? dt(60 - i) : null,
        contractSigned: status === 'approved',
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'franchiserequest', franchiseRequests);

    // =========================================================
    // 4) TRAINER table (append)
    // =========================================================
    const trainers = [];
    const trainerSpecs = ['Strength', 'Cardio', 'Yoga', 'CrossFit', 'Nutrition'];
    const certs = ['NASM', 'ACE', 'ISSA', 'NSCA', 'ACSM'];
    for (let i = 0; i < NUM_EXTRA_TRAINERS; i++) {
      const id = 400 + i;
      const userId = 2200 + i; // map 1-1 to trainer user
      trainers.push({
        id,
        userId,
        specialization: pick(trainerSpecs, i),
        certification: pick(certs, i),
        experienceYears: (i % 6) + 1,
        hourlyRate: 200000 + (i % 8) * 20000,
        commissionRate: 0.45 + (i % 6) * 0.05,
        rating: 4.0 + (i % 6) * 0.1,
        totalSessions: 20 + i * 3,
        status: 'active',
        bio: `Trainer ${id} bio`,
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'trainer', trainers);

    // =========================================================
    // 5) MEMBERS (append)
    // =========================================================
    const members = [];
    for (let i = 0; i < NUM_EXTRA_MEMBERS; i++) {
      const id = 500 + i;
      const userId = 2400 + i;
      const gymId = 100 + (i % NUM_EXTRA_GYMS);
      members.push({
        id,
        userId,
        gymId,
        membershipNumber: `MB${id}`,
        joinDate: dt(200 - i),
        status: pick(['active', 'active', 'active', 'inactive'], i), // đa số active
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'member', members);

    // =========================================================
    // 6) POLICIES (append)
    // =========================================================
    const policies = [];
    for (let i = 0; i < NUM_EXTRA_POLICIES; i++) {
      const id = 600 + i;
      const isGymPolicy = i % 2 === 1;
      const gymId = isGymPolicy ? (100 + (i % NUM_EXTRA_GYMS)) : null;
      const split = 0.6 + (i % 5) * 0.05; // 0.60..0.80
      const maxHours = 8 + (i % 6) * 2;   // 8..18
      policies.push({
        id,
        policyType: 'trainer_share',
        name: `Trainer Share Policy ${id}`,
        description: isGymPolicy ? `Gym policy for gym ${gymId}` : 'System policy',
        value: JSON.stringify({ commissionSplit: split, maxHoursPerWeek: maxHours }),
        isActive: i % 4 !== 0, // 75% active
        appliesTo: isGymPolicy ? 'gym' : 'system',
        gymId,
        effectiveFrom: dt(120 - i * 3),
        effectiveTo: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'policy', policies);

    // =========================================================
    // 7) TRAINER SHARES (append)
    // =========================================================
    const shareStatuses = ['pending', 'approved', 'rejected'];
    const trainerShares = [];
    for (let i = 0; i < NUM_EXTRA_TRAINER_SHARES; i++) {
      const id = 700 + i;
      const trainerId = 400 + (i % NUM_EXTRA_TRAINERS);
      const fromGymId = 100 + (i % NUM_EXTRA_GYMS);
      const toGymId = 100 + ((i + 2) % NUM_EXTRA_GYMS);
      const status = pick(shareStatuses, i);
      const policyId = 600 + (i % NUM_EXTRA_POLICIES);
      const requestedBy = 2100 + (i % NUM_EXTRA_OWNERS);
      trainerShares.push({
        id,
        trainerId,
        fromGymId,
        toGymId,
        shareType: pick(['temporary', 'temporary', 'long_term'], i),
        startDate: dt(40 - i),
        endDate: dt(10 - i),
        commissionSplit: 0.6 + (i % 5) * 0.05,
        status,
        requestedBy,
        approvedBy: status === 'approved' ? 1 : null,
        notes: status === 'rejected' ? 'Rejected: conflict schedule' : 'Demo share request',
        policyId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'trainershare', trainerShares);

    // =========================================================
    // 8) MAINTENANCE (append)
    // =========================================================
    // equipmentId: dùng 1..7 như demo bạn có sẵn (nếu khác thì đổi mảng này)
    const equipmentIds = [1, 2, 3, 4, 5, 6, 7];
    const maintStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
    const priorities = ['low', 'medium', 'high', 'urgent'];

    const maintenances = [];
    for (let i = 0; i < NUM_EXTRA_MAINTENANCES; i++) {
      const id = 800 + i;
      const status = pick(maintStatuses, i);
      const gymId = 100 + (i % NUM_EXTRA_GYMS);
      const equipmentId = pick(equipmentIds, i);
      const requestedBy = 2100 + (i % NUM_EXTRA_OWNERS);

      const estimated = 200000 + (i % 10) * 150000;
      const actual = status === 'completed' ? Math.max(100000, estimated - (i % 3) * 50000) : null;

      maintenances.push({
        id,
        equipmentId,
        gymId,
        issueDescription: `Issue #${id}: ${pick(
          ['Noise', 'Overheat', 'Broken cable', 'Loose bolt', 'Display error', 'Vibration'],
          i
        )}`,
        priority: pick(priorities, i),
        requestedBy,
        assignedTo: status === 'assigned' || status === 'in_progress' || status === 'completed' ? 1 : null,
        estimatedCost: estimated,
        actualCost: actual,
        status,
        scheduledDate: status !== 'pending' ? dt(30 - i) : null,
        completionDate: status === 'completed' ? dt(15 - i) : null,
        notes:
          status === 'cancelled'
            ? 'Cancelled: replaced equipment'
            : status === 'pending'
              ? 'Waiting for approve'
              : 'Demo maintenance flow',
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'maintenance', maintenances);

    // =========================================================
    // 9) PACKAGES (append)
    // =========================================================
    const pkgTypes = ['basic', 'standard', 'premium'];
    const packages = [];
    for (let i = 0; i < NUM_EXTRA_PACKAGES; i++) {
      const id = 900 + i;
      const gymId = 100 + (i % NUM_EXTRA_GYMS);
      const type = pick(pkgTypes, i);
      const durationDays = pick([30, 60, 90], i);
      const price = type === 'basic' ? 1200000 : (type === 'standard' ? 2400000 : 4200000);
      const sessions = type === 'premium' ? 6 : (type === 'standard' ? 2 : 0);
      packages.push({
        id,
        name: `Package ${id} - ${type.toUpperCase()}`,
        description: `Demo package ${type} for gym ${gymId}`,
        type,
        durationDays,
        price,
        sessions,
        gymId,
        status: 'active',
        pricePerSession: sessions > 0 ? Math.floor(price / sessions) : 0,
        commissionRate: sessions > 0 ? 0.6 : 0,
        isActive: true,
        validityType: 'months',
        maxSessionsPerWeek: sessions > 0 ? 2 : 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'package', packages);

    // =========================================================
    // 10) PACKAGE ACTIVATIONS (append) + TRANSACTIONS (append)
    // =========================================================
    // Strategy: insert activation (transactionId NULL) -> insert transaction (packageActivationId set)
    // -> update activation.transactionId back.
    const activations = [];
    for (let i = 0; i < NUM_EXTRA_PACKAGE_ACTIVATIONS; i++) {
      const id = 1000 + i;
      const memberId = 500 + (i % NUM_EXTRA_MEMBERS);
      const packageId = 900 + (i % NUM_EXTRA_PACKAGES);
      const activationDate = dt(90 - i);
      const expiryDate = new Date(activationDate);
      expiryDate.setDate(expiryDate.getDate() + 30);

      const totalSessions = pick([0, 2, 6], i);
      const used = totalSessions === 0 ? 0 : (i % (totalSessions + 1));
      activations.push({
        id,
        memberId,
        packageId,
        transactionId: null,
        activationDate,
        expiryDate,
        totalSessions,
        sessionsUsed: used,
        sessionsRemaining: Math.max(0, totalSessions - used),
        pricePerSession: totalSessions > 0 ? 300000 : 0,
        status: 'active',
        notes: `Activation ${id}`,
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'packageactivation', activations);

    const transactions = [];
    // package purchase transactions
    for (let i = 0; i < NUM_EXTRA_TRANSACTIONS; i++) {
      const id = 1100 + i;
      const actId = 1000 + (i % NUM_EXTRA_PACKAGE_ACTIVATIONS);
      const memberId = 500 + (i % NUM_EXTRA_MEMBERS);
      const gymId = 100 + (i % NUM_EXTRA_GYMS);
      const packageId = 900 + (i % NUM_EXTRA_PACKAGES);

      const amount = pick([1200000, 2400000, 4200000], i);
      transactions.push({
        id,
        transactionCode: `TRX_MORE_${id}`,
        memberId,
        trainerId: null,
        gymId,
        packageId,
        amount,
        transactionType: 'package_purchase',
        paymentMethod: pick(['momo', 'cash', 'bank_transfer'], i),
        paymentStatus: 'completed',
        description: `Package purchase ${packageId}`,
        metadata: JSON.stringify({ source: 'seed_more' }),
        transactionDate: dt(120 - i),
        packageActivationId: actId,
        processedBy: 1,
        commissionAmount: 0,
        ownerAmount: Math.floor(amount * 0.9),
        platformFee: Math.floor(amount * 0.1),
        createdAt: now,
        updatedAt: now,
      });
    }

    // maintenance cost transactions (để reports có cost)
    for (let i = 0; i < 15; i++) {
      const id = 2000 + i; // transaction id high - nhưng table transaction đã có user table id 2000, khác bảng ok
      const mId = 800 + (i % NUM_EXTRA_MAINTENANCES);
      const gymId = 100 + (i % NUM_EXTRA_GYMS);
      const amount = 300000 + (i % 12) * 100000;
      transactions.push({
        id,
        transactionCode: `TRX_MAINT_${id}`,
        memberId: null,
        trainerId: null,
        gymId,
        packageId: null,
        amount,
        transactionType: 'maintenance',
        paymentMethod: pick(['bank_transfer', 'cash'], i),
        paymentStatus: 'completed',
        description: `Maintenance cost for maintenanceId=${mId}`,
        metadata: JSON.stringify({ maintenanceId: mId }),
        transactionDate: dt(60 - i),
        packageActivationId: null,
        processedBy: 1,
        commissionAmount: 0,
        ownerAmount: 0,
        platformFee: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    await insertIgnore(queryInterface, 'transaction', transactions);

    // Update activation.transactionId (best-effort) for the first N (safe)
    // (Nếu activation đã có transactionId thì ignore bằng điều kiện)
    for (let i = 0; i < NUM_EXTRA_PACKAGE_ACTIVATIONS; i++) {
      const actId = 1000 + i;
      const trxId = 1100 + (i % NUM_EXTRA_TRANSACTIONS);
      await queryInterface.sequelize.query(
        `UPDATE \`packageactivation\` SET \`transactionId\` = ${trxId}
         WHERE \`id\` = ${actId} AND (\`transactionId\` IS NULL OR \`transactionId\` = 0);`
      );
    }

    // =========================================================
    // 11) AUDIT LOGS (append) — đa dạng action cho AuditLogs page
    // =========================================================
    const actions = [
      'MAINTENANCE_APPROVED',
      'MAINTENANCE_ASSIGNED',
      'MAINTENANCE_STARTED',
      'MAINTENANCE_COMPLETED',
      'FRANCHISE_APPROVED',
      'FRANCHISE_REJECTED',
      'POLICY_CREATED',
      'POLICY_UPDATED',
      'POLICY_TOGGLED',
      'TRAINERSHARE_APPROVED',
      'TRAINERSHARE_REJECTED',
      'TRAINERSHARE_OVERRIDDEN',
      'REPORT_VIEWED',
    ];
    const tables = ['maintenance', 'franchiserequest', 'policy', 'trainershare', 'transaction', 'reports'];

    const auditLogs = [];
    for (let i = 0; i < NUM_EXTRA_AUDITLOGS; i++) {
      const id = 3000 + i;
      const action = pick(actions, i);
      const tableName = pick(tables, i);

      // map recordId theo table để nhìn “thật”
      let recordId = null;
      if (tableName === 'maintenance') recordId = 800 + (i % NUM_EXTRA_MAINTENANCES);
      if (tableName === 'franchiserequest') recordId = 300 + (i % NUM_EXTRA_FR_REQUESTS);
      if (tableName === 'policy') recordId = 600 + (i % NUM_EXTRA_POLICIES);
      if (tableName === 'trainershare') recordId = 700 + (i % NUM_EXTRA_TRAINER_SHARES);
      if (tableName === 'transaction') recordId = 1100 + (i % NUM_EXTRA_TRANSACTIONS);

      auditLogs.push({
        id,
        userId: 1, // admin
        action,
        tableName,
        recordId,
        oldValues: null,
        newValues: JSON.stringify({ seed: '99-more', action, recordId }),
        ipAddress: '127.0.0.1',
        userAgent: 'seed-script',
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertIgnore(queryInterface, 'auditlog', auditLogs);
  },

  down: async () => {
    // append-only, intentionally empty
  },
};
