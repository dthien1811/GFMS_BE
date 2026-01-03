'use strict';
const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    await queryInterface.bulkInsert('User', [ // SỐ ÍT
      {
        email: 'admin@gfms.com',
        password: hashedPassword,
        username: 'admin',
        address: 'Da Nang, Vietnam',
        sex: 'male',
        phone: '0901234567',
        groupId: 1, // Administrators
        avatar: 'admin-avatar.jpg',
        status: 'active',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        email: 'owner1@gfms.com',
        password: hashedPassword,
        username: 'gymowner1',
        address: '123 Main Street, Da Nang',
        sex: 'male',
        phone: '0901234568',
        groupId: 2, // Gym Owners
        avatar: 'owner-avatar.jpg',
        status: 'active',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        email: 'trainer1@gfms.com',
        password: hashedPassword,
        username: 'trainer_john',
        address: '456 Fitness St, Da Nang',
        sex: 'male',
        phone: '0901234569',
        groupId: 3, // Trainers
        avatar: 'trainer-avatar.jpg',
        status: 'active',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        email: 'member1@gfms.com',
        password: hashedPassword,
        username: 'member_mike',
        address: '789 Beach Rd, Da Nang',
        sex: 'male',
        phone: '0901234570',
        groupId: 4, // Members
        avatar: 'member-avatar.jpg',
        status: 'active',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('User', null, {}); // SỐ ÍT
  }
};