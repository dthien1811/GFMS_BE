const { Trainer, TrainerShare, SessionProgress } = require('../models');

// Lấy danh sách tất cả các huấn luyện viên
const getTrainers = async () => {
  try {
    const trainers = await Trainer.findAll();
    return trainers;
  } catch (error) {
    throw new Error('Error fetching trainers');
  }
};

// Tạo mới một huấn luyện viên
const createTrainer = async (trainerData) => {
  try {
    const newTrainer = await Trainer.create(trainerData);
    return newTrainer;
  } catch (error) {
    throw new Error('Error creating trainer');
  }
};

// Cập nhật thông tin huấn luyện viên
const updateTrainer = async (id, trainerData) => {
  try {
    const trainer = await Trainer.findByPk(id);
    if (!trainer) throw new Error('Trainer not found');
    await trainer.update(trainerData);
    return trainer;
  } catch (error) {
    throw new Error('Error updating trainer');
  }
};

// Lấy thông tin chi tiết huấn luyện viên
const getTrainerDetails = async (id) => {
  try {
    const pt = await Trainer.findByPk(id, {
      include: [TrainerShare, SessionProgress],  // Bao gồm các mối quan hệ
    });
    if (!pt) throw new Error('Trainer not found');
    return pt;
  } catch (error) {
    throw new Error('Error fetching trainer details');
  }
};

// Cập nhật lịch làm việc của huấn luyện viên
const updateTrainerSchedule = async (id, scheduleData) => {
  try {
    const pt = await Trainer.findByPk(id);
    if (!pt) throw new Error('Trainer not found');
    pt.availableHours = scheduleData;
    await pt.save();
    return pt;
  } catch (error) {
    throw new Error('Error updating schedule');
  }
};

// Cập nhật kỹ năng/chứng chỉ của huấn luyện viên
const updateTrainerSkills = async (id, skillsData) => {
  try {
    const pt = await Trainer.findByPk(id);
    if (!pt) throw new Error('Trainer not found');
    pt.specialization = skillsData.specialization;
    pt.certification = skillsData.certification;
    await pt.save();
    return pt;
  } catch (error) {
    throw new Error('Error updating skills');
  }
};

module.exports = {
  getTrainers,
  createTrainer,
  updateTrainer,
  getTrainerDetails,
  updateTrainerSchedule,
  updateTrainerSkills,
};
