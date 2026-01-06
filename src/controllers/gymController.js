import gymService from '../service/gymService';

/**
 * Lấy tất cả gym
 * GET /api/gym
 */
const getAllGyms = async (req, res) => {
  try {
    const data = await gymService.getAllGyms();
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in getAllGyms controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Lấy gym theo ID
 * GET /api/gym/:id
 */
const getGymById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.getGymById(parseInt(id));
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(404).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in getGymById controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Tạo gym mới
 * POST /api/gym
 */
const createGym = async (req, res) => {
  try {
    const data = await gymService.createGym(req.body);
    
    if (data.EC === 0) {
      return res.status(201).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in createGym controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Cập nhật gym
 * PUT /api/gym/:id
 */
const updateGym = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.updateGym(parseInt(id), req.body);
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in updateGym controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Xóa gym
 * DELETE /api/gym/:id
 */
const deleteGym = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.deleteGym(parseInt(id));
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in deleteGym controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Tạm ngưng phòng gym
 * PUT /api/gym/:id/suspend
 */
const suspendGym = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.suspendGym(parseInt(id));
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in suspendGym controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Khôi phục phòng gym
 * PUT /api/gym/:id/restore
 */
const restoreGym = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.restoreGym(parseInt(id));
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in restoreGym controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Xem chi tiết phòng gym
 * GET /api/gym/:id/detail
 */
const getGymDetail = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.getGymDetail(parseInt(id));
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(404).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in getGymDetail controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Cập nhật giờ hoạt động
 * PUT /api/gym/:id/operating-hours
 */
const updateOperatingHours = async (req, res) => {
  try {
    const { id } = req.params;
    const { operatingHours } = req.body;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    if (!operatingHours) {
      return res.status(400).json({
        EM: 'Giờ hoạt động là bắt buộc',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.updateOperatingHours(parseInt(id), operatingHours);
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in updateOperatingHours controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Thêm hình ảnh vào gym
 * POST /api/gym/:id/images
 */
const addImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { imageUrl } = req.body;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        EM: 'URL hình ảnh là bắt buộc',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.addImage(parseInt(id), imageUrl);
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in addImage controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Xóa hình ảnh khỏi gym
 * DELETE /api/gym/:id/images
 */
const removeImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { imageUrl } = req.body;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        EM: 'URL hình ảnh là bắt buộc',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.removeImage(parseInt(id), imageUrl);
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in removeImage controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Cập nhật toàn bộ danh sách hình ảnh
 * PUT /api/gym/:id/images
 */
const updateImages = async (req, res) => {
  try {
    const { id } = req.params;
    const { images } = req.body;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    if (!images) {
      return res.status(400).json({
        EM: 'Danh sách hình ảnh là bắt buộc',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.updateImages(parseInt(id), images);
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in updateImages controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

/**
 * Lấy danh sách hình ảnh của gym
 * GET /api/gym/:id/images
 */
const getImages = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        EM: 'ID không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    const data = await gymService.getImages(parseInt(id));
    
    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    } else {
      return res.status(404).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT
      });
    }
  } catch (error) {
    console.error('Error in getImages controller:', error);
    return res.status(500).json({
      EM: 'Lỗi server',
      EC: -1,
      DT: ''
    });
  }
};

module.exports = {
  getAllGyms,
  getGymById,
  createGym,
  updateGym,
  deleteGym,
  suspendGym,
  restoreGym,
  getGymDetail,
  updateOperatingHours,
  addImage,
  removeImage,
  updateImages,
  getImages
};
