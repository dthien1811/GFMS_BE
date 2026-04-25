'use strict';

/** Migration: Fix booking cũ - thêm [PT_SUBSTITUTE] marker cho các booking đã được gán PT khác
 * Khi owner gán PT mới vào lịch báo bận, cần đánh dấu để PT thế thấy đúng màu
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Tìm tất cả booking có [PT_BUSY_REQUEST] nhưng chưa có [PT_SUBSTITUTE]
      const [bookings] = await queryInterface.sequelize.query(`
        SELECT id, notes 
        FROM booking 
        WHERE notes LIKE '%[PT_BUSY_REQUEST]%' 
          AND notes NOT LIKE '%[PT_SUBSTITUTE]%'
        LIMIT 1000
      `);
      
      console.log(`[migration] Tìm thấy ${bookings.length} booking cần fix [PT_SUBSTITUTE]`);
      
      let updated = 0;
      for (const booking of bookings) {
        const newNotes = booking.notes + '\n[PT_SUBSTITUTE] Đã được gán PT thế (migrated)';
        await queryInterface.sequelize.query(
          `UPDATE booking SET notes = ? WHERE id = ?`,
          { replacements: [newNotes, booking.id] }
        );
        updated++;
      }
      
      console.log(`[migration] Đã update ${updated} booking với [PT_SUBSTITUTE] marker`);
      return { updated };
    } catch (error) {
      console.error('[migration] Lỗi khi fix [PT_SUBSTITUTE]:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // Không cần down - đây là fix data
  }
};
