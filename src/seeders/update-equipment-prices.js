'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Update existing equipment with default prices based on type
    // You can customize these prices based on your needs
    
    await queryInterface.sequelize.query(`
      UPDATE equipment 
      SET price = CASE
        WHEN LOWER(name) LIKE '%treadmill%' THEN 45000000
        WHEN LOWER(name) LIKE '%bike%' OR LOWER(name) LIKE '%xe đạp%' THEN 25000000
        WHEN LOWER(name) LIKE '%dumbbell%' OR LOWER(name) LIKE '%tạ%' THEN 500000
        WHEN LOWER(name) LIKE '%barbell%' THEN 2000000
        WHEN LOWER(name) LIKE '%bench%' OR LOWER(name) LIKE '%ghế%' THEN 3500000
        WHEN LOWER(name) LIKE '%mat%' OR LOWER(name) LIKE '%thảm%' THEN 350000
        WHEN LOWER(name) LIKE '%rope%' OR LOWER(name) LIKE '%dây%' THEN 200000
        WHEN LOWER(name) LIKE '%ball%' OR LOWER(name) LIKE '%bóng%' THEN 400000
        WHEN LOWER(name) LIKE '%elliptical%' THEN 37500000
        WHEN LOWER(name) LIKE '%cross trainer%' THEN 37500000
        WHEN LOWER(name) LIKE '%weight plate%' OR LOWER(name) LIKE '%đĩa tạ%' THEN 400000
        ELSE 1000000
      END
      WHERE price = 0 OR price IS NULL
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      UPDATE equipment SET price = 0
    `);
  }
};
