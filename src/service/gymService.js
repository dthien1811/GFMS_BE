import db from '../models/index';
import realtimeService from './realtime.service';



const emitGymLifecycleChanged = async (gym, action) => {
  const ownerId = Number(gym?.ownerId || 0);
  const gymId = Number(gym?.id || 0);
  if (!gymId) return;

  if (ownerId) {
    realtimeService.emitUser(ownerId, 'gym:changed', {
      gymId,
      ownerId,
      status: gym?.status || null,
      action,
    });

    try {
      await realtimeService.notifyUser(ownerId, {
        title: action === 'restored' ? 'Gym đã được khôi phục hoạt động' : 'Gym bị tạm ngưng hoạt động',
        message:
          action === 'restored'
            ? `Phòng gym ${gym?.name || `#${gymId}`} đã được admin khôi phục và có thể vận hành trở lại.`
            : `Phòng gym ${gym?.name || `#${gymId}`} đang bị admin tạm ngưng. Vui lòng xử lý tại mục Phòng tập hoặc liên hệ quản trị viên.`,
        notificationType: 'gym_status_changed',
        relatedType: 'gym',
        relatedId: gymId,
      });
    } catch (error) {
      console.error('[gymService] notify owner status changed:', error?.message || error);
    }
  }

  realtimeService.emitGroup('Administrators', 'gym:changed', {
    gymId,
    ownerId: ownerId || null,
    status: gym?.status || null,
    action,
  });
};

const gymService = {
  includeGymRelations(ownerAttrs = ['id', 'username', 'email', 'phone']) {
    return [
      {
        model: db.User,
        as: 'owner',
        attributes: ownerAttrs
      },
      {
        model: db.FranchiseRequest,
        attributes: ['id', 'contactPerson', 'contactPhone', 'contactEmail', 'businessName']
      }
    ];
  },

  /**
   * Lấy tất cả gym
   */
  getAllGyms: async () => {
    try {
      const gyms = await db.Gym.findAll({
        include: gymService.includeGymRelations(),
        order: [['createdAt', 'DESC']]
      });
      return {
        EM: 'Lấy danh sách gym thành công',
        EC: 0,
        DT: gyms
      };
    } catch (error) {
      console.error('Error in getAllGyms:', error && error.stack ? error.stack : error);
      return {
        EM: 'Lỗi khi lấy danh sách gym',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Lấy gym theo ID
   */
  getGymById: async (id) => {
    try {
      const gym = await db.Gym.findOne({
        where: { id },
        include: gymService.includeGymRelations()
      });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      return {
        EM: 'Lấy thông tin gym thành công',
        EC: 0,
        DT: gym
      };
    } catch (error) {
      console.log('Error in getGymById:', error);
      return {
        EM: 'Lỗi khi lấy thông tin gym',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Tạo gym mới
   */
  createGym: async (gymData) => {
    try {
      // Validation
      if (!gymData.name || !gymData.address || !gymData.phone || !gymData.email) {
        return {
          EM: 'Vui lòng điền đầy đủ thông tin: name, address, phone, email',
          EC: 1,
          DT: ''
        };
      }

      // Kiểm tra email đã tồn tại chưa
      const existingGym = await db.Gym.findOne({
        where: { email: gymData.email }
      });

      if (existingGym) {
        return {
          EM: 'Email gym đã tồn tại',
          EC: 1,
          DT: ''
        };
      }

      // Kiểm tra ownerId nếu có
      if (gymData.ownerId) {
        const owner = await db.User.findOne({
          where: { id: gymData.ownerId }
        });

        if (!owner) {
          return {
            EM: 'Owner không tồn tại',
            EC: 1,
            DT: ''
          };
        }
      }

      // Xử lý operatingHours nếu có
      let operatingHoursValue = null;
      if (gymData.operatingHours) {
        if (typeof gymData.operatingHours === 'object') {
          operatingHoursValue = JSON.stringify(gymData.operatingHours);
        } else {
          operatingHoursValue = gymData.operatingHours;
        }
      }

      // Xử lý images nếu có
      let imagesValue = null;
      if (gymData.images) {
        if (Array.isArray(gymData.images)) {
          imagesValue = JSON.stringify(gymData.images);
        } else if (typeof gymData.images === 'string') {
          imagesValue = gymData.images;
        }
      }

      const newGym = await db.Gym.create({
        name: gymData.name,
        address: gymData.address,
        phone: gymData.phone,
        email: gymData.email,
        description: gymData.description || null,
        status: gymData.status || 'active',
        operatingHours: operatingHoursValue,
        images: imagesValue,
        ownerId: gymData.ownerId || null,
        franchiseRequestId: gymData.franchiseRequestId || null
      });

      // Lấy lại gym với thông tin owner
      const gymWithOwner = await db.Gym.findOne({
        where: { id: newGym.id },
        include: gymService.includeGymRelations()
      });

      return {
        EM: 'Tạo gym thành công',
        EC: 0,
        DT: gymWithOwner
      };
    } catch (error) {
      console.log('Error in createGym:', error);
      return {
        EM: 'Lỗi khi tạo gym',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Cập nhật gym
   */
  updateGym: async (id, gymData) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Kiểm tra email trùng với gym khác (nếu có thay đổi email)
      if (gymData.email && gymData.email !== gym.email) {
        const existingGym = await db.Gym.findOne({
          where: { email: gymData.email }
        });

        if (existingGym) {
          return {
            EM: 'Email gym đã tồn tại',
            EC: 1,
            DT: ''
          };
        }
      }

      // Kiểm tra ownerId nếu có thay đổi
      if (gymData.ownerId && gymData.ownerId !== gym.ownerId) {
        const owner = await db.User.findOne({
          where: { id: gymData.ownerId }
        });

        if (!owner) {
          return {
            EM: 'Owner không tồn tại',
            EC: 1,
            DT: ''
          };
        }
      }

      // Xử lý operatingHours nếu có
      let operatingHoursValue = gym.operatingHours;
      if (gymData.operatingHours !== undefined) {
        if (gymData.operatingHours === null || gymData.operatingHours === '') {
          operatingHoursValue = null;
        } else if (typeof gymData.operatingHours === 'object') {
          operatingHoursValue = JSON.stringify(gymData.operatingHours);
        } else {
          operatingHoursValue = gymData.operatingHours;
        }
      }

      // Xử lý images nếu có
      let imagesValue = gym.images;
      if (gymData.images !== undefined) {
        if (gymData.images === null || gymData.images === '') {
          imagesValue = null;
        } else if (Array.isArray(gymData.images)) {
          imagesValue = JSON.stringify(gymData.images);
        } else if (typeof gymData.images === 'string') {
          imagesValue = gymData.images;
        }
      }

      // Cập nhật gym
      await gym.update({
        name: gymData.name || gym.name,
        address: gymData.address || gym.address,
        phone: gymData.phone || gym.phone,
        email: gymData.email || gym.email,
        description: gymData.description !== undefined ? gymData.description : gym.description,
        status: gymData.status || gym.status,
        operatingHours: operatingHoursValue,
        images: imagesValue,
        ownerId: gymData.ownerId !== undefined ? gymData.ownerId : gym.ownerId,
        franchiseRequestId: gymData.franchiseRequestId !== undefined ? gymData.franchiseRequestId : gym.franchiseRequestId
      });

      // Lấy lại gym đã cập nhật
      const updatedGym = await db.Gym.findOne({
        where: { id },
        include: gymService.includeGymRelations()
      });

      return {
        EM: 'Cập nhật gym thành công',
        EC: 0,
        DT: updatedGym
      };
    } catch (error) {
      console.log('Error in updateGym:', error);
      return {
        EM: 'Lỗi khi cập nhật gym',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Xóa gym
   */
  deleteGym: async (id) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      await db.Gym.destroy({
        where: { id }
      });

      return {
        EM: 'Xóa gym thành công',
        EC: 0,
        DT: ''
      };
    } catch (error) {
      console.log('Error in deleteGym:', error);
      // Kiểm tra nếu lỗi do foreign key constraint
      if (error.name === 'SequelizeForeignKeyConstraintError') {
        return {
          EM: 'Không thể xóa gym vì đang có dữ liệu liên quan (members, trainers, packages, etc.)',
          EC: 1,
          DT: ''
        };
      }
      return {
        EM: 'Lỗi khi xóa gym',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Tạm ngưng phòng gym
   */
  suspendGym: async (id) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Kiểm tra nếu đã bị tạm ngưng
      if (gym.status === 'suspended') {
        return {
          EM: 'Gym đã bị tạm ngưng trước đó',
          EC: 1,
          DT: ''
        };
      }

      await gym.update({
        status: 'suspended'
      });

      await emitGymLifecycleChanged(gym, 'suspended');

      // Lấy lại gym đã cập nhật
      const updatedGym = await db.Gym.findOne({
        where: { id },
        include: gymService.includeGymRelations()
      });

      return {
        EM: 'Tạm ngưng gym thành công',
        EC: 0,
        DT: updatedGym
      };
    } catch (error) {
      console.log('Error in suspendGym:', error);
      return {
        EM: 'Lỗi khi tạm ngưng gym',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Khôi phục phòng gym
   */
  restoreGym: async (id) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Kiểm tra nếu không phải đang bị tạm ngưng
      if (gym.status !== 'suspended') {
        return {
          EM: 'Gym không ở trạng thái tạm ngưng',
          EC: 1,
          DT: ''
        };
      }

      await gym.update({
        status: 'active'
      });

      await emitGymLifecycleChanged(gym, 'restored');

      // Lấy lại gym đã cập nhật
      const updatedGym = await db.Gym.findOne({
        where: { id },
        include: gymService.includeGymRelations()
      });

      return {
        EM: 'Khôi phục gym thành công',
        EC: 0,
        DT: updatedGym
      };
    } catch (error) {
      console.log('Error in restoreGym:', error);
      return {
        EM: 'Lỗi khi khôi phục gym',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Xem chi tiết phòng gym (với đầy đủ thông tin)
   */
  getGymDetail: async (id) => {
    try {
      const gym = await db.Gym.findOne({
        where: { id },
        include: [
          ...gymService.includeGymRelations(['id', 'username', 'email', 'phone', 'address', 'avatar']),
          {
            model: db.Member,
            attributes: ['id'],
            required: false
          },
          {
            model: db.Trainer,
            attributes: ['id'],
            required: false
          },
          {
            model: db.Package,
            attributes: ['id', 'name', 'price'],
            required: false
          },
          {
            model: db.Equipment,
            attributes: ['id', 'name', 'status'],
            required: false
          }
        ]
      });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Parse operatingHours nếu có
      let operatingHours = null;
      if (gym.operatingHours) {
        try {
          operatingHours = JSON.parse(gym.operatingHours);
        } catch (e) {
          operatingHours = gym.operatingHours; // Giữ nguyên nếu không parse được
        }
      }

      // Parse images nếu có
      let images = [];
      if (gym.images) {
        try {
          images = JSON.parse(gym.images);
          if (!Array.isArray(images)) {
            images = [];
          }
        } catch (e) {
          images = [];
        }
      }

      // Parse gym data
      const gymPlain = gym.get({ plain: true });

      // Tạo response với thống kê
      const gymDetail = {
        ...gymPlain,
        operatingHours: operatingHours,
        images: images,
        statistics: {
          totalMembers: gymPlain.Members ? gymPlain.Members.length : 0,
          totalTrainers: gymPlain.Trainers ? gymPlain.Trainers.length : 0,
          totalPackages: gymPlain.Packages ? gymPlain.Packages.length : 0,
          totalEquipment: gymPlain.Equipments ? gymPlain.Equipments.length : 0,
          totalImages: images.length
        }
      };

      // Xóa các association arrays khỏi response chính để tránh trùng lặp
      delete gymDetail.Members;
      delete gymDetail.Trainers;
      delete gymDetail.Packages;
      delete gymDetail.Equipments;

      return {
        EM: 'Lấy chi tiết gym thành công',
        EC: 0,
        DT: gymDetail
      };
    } catch (error) {
      console.log('Error in getGymDetail:', error);
      return {
        EM: 'Lỗi khi lấy chi tiết gym',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Cập nhật giờ hoạt động
   */
  updateOperatingHours: async (id, operatingHours) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Validate operatingHours format
      if (operatingHours) {
        // Nếu là object, convert sang JSON string
        if (typeof operatingHours === 'object') {
          try {
            operatingHours = JSON.stringify(operatingHours);
          } catch (e) {
            return {
              EM: 'Định dạng giờ hoạt động không hợp lệ',
              EC: 1,
              DT: ''
            };
          }
        }
        // Nếu là string, validate xem có phải JSON hợp lệ không
        else if (typeof operatingHours === 'string') {
          try {
            JSON.parse(operatingHours);
          } catch (e) {
            return {
              EM: 'Định dạng giờ hoạt động không hợp lệ. Vui lòng sử dụng JSON format',
              EC: 1,
              DT: ''
            };
          }
        }
      }

      await gym.update({
        operatingHours: operatingHours || null
      });

      // Lấy lại gym đã cập nhật
      const updatedGym = await db.Gym.findOne({
        where: { id },
        include: [
          {
            model: db.User,
            as: 'owner',
            attributes: ['id', 'username', 'email', 'phone']
          }
        ]
      });

      // Parse operatingHours trong response
      let parsedOperatingHours = null;
      if (updatedGym.operatingHours) {
        try {
          parsedOperatingHours = JSON.parse(updatedGym.operatingHours);
        } catch (e) {
          parsedOperatingHours = updatedGym.operatingHours;
        }
      }

      const response = {
        ...updatedGym.get({ plain: true }),
        operatingHours: parsedOperatingHours
      };

      return {
        EM: 'Cập nhật giờ hoạt động thành công',
        EC: 0,
        DT: response
      };
    } catch (error) {
      console.log('Error in updateOperatingHours:', error);
      return {
        EM: 'Lỗi khi cập nhật giờ hoạt động',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Thêm hình ảnh vào gym
   */
  addImage: async (id, imageUrl) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Validate imageUrl
      if (!imageUrl || typeof imageUrl !== 'string') {
        return {
          EM: 'URL hình ảnh không hợp lệ',
          EC: 1,
          DT: ''
        };
      }

      // Parse images hiện tại
      let images = [];
      if (gym.images) {
        try {
          images = JSON.parse(gym.images);
          if (!Array.isArray(images)) {
            images = [];
          }
        } catch (e) {
          images = [];
        }
      }

      // Kiểm tra imageUrl đã tồn tại chưa
      if (images.includes(imageUrl)) {
        return {
          EM: 'Hình ảnh đã tồn tại trong danh sách',
          EC: 1,
          DT: ''
        };
      }

      // Thêm imageUrl mới
      images.push(imageUrl);

      // Lưu lại
      await gym.update({
        images: JSON.stringify(images)
      });

      // Lấy lại gym đã cập nhật
      const updatedGym = await db.Gym.findOne({
        where: { id },
        include: [
          {
            model: db.User,
            as: 'owner',
            attributes: ['id', 'username', 'email', 'phone']
          }
        ]
      });

      // Parse images trong response
      let parsedImages = [];
      if (updatedGym.images) {
        try {
          parsedImages = JSON.parse(updatedGym.images);
        } catch (e) {
          parsedImages = [];
        }
      }

      const response = {
        ...updatedGym.get({ plain: true }),
        images: parsedImages
      };

      return {
        EM: 'Thêm hình ảnh thành công',
        EC: 0,
        DT: response
      };
    } catch (error) {
      console.log('Error in addImage:', error);
      return {
        EM: 'Lỗi khi thêm hình ảnh',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Xóa hình ảnh khỏi gym
   */
  removeImage: async (id, imageUrl) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Parse images hiện tại
      let images = [];
      if (gym.images) {
        try {
          images = JSON.parse(gym.images);
          if (!Array.isArray(images)) {
            images = [];
          }
        } catch (e) {
          images = [];
        }
      }

      // Kiểm tra imageUrl có tồn tại không
      const imageIndex = images.indexOf(imageUrl);
      if (imageIndex === -1) {
        return {
          EM: 'Hình ảnh không tồn tại trong danh sách',
          EC: 1,
          DT: ''
        };
      }

      // Xóa imageUrl
      images.splice(imageIndex, 1);

      // Lưu lại
      await gym.update({
        images: images.length > 0 ? JSON.stringify(images) : null
      });

      // Lấy lại gym đã cập nhật
      const updatedGym = await db.Gym.findOne({
        where: { id },
        include: [
          {
            model: db.User,
            as: 'owner',
            attributes: ['id', 'username', 'email', 'phone']
          }
        ]
      });

      // Parse images trong response
      let parsedImages = [];
      if (updatedGym.images) {
        try {
          parsedImages = JSON.parse(updatedGym.images);
        } catch (e) {
          parsedImages = [];
        }
      }

      const response = {
        ...updatedGym.get({ plain: true }),
        images: parsedImages
      };

      return {
        EM: 'Xóa hình ảnh thành công',
        EC: 0,
        DT: response
      };
    } catch (error) {
      console.log('Error in removeImage:', error);
      return {
        EM: 'Lỗi khi xóa hình ảnh',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Cập nhật toàn bộ danh sách hình ảnh
   */
  updateImages: async (id, images) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Validate images
      if (!Array.isArray(images)) {
        return {
          EM: 'Danh sách hình ảnh phải là một mảng',
          EC: 1,
          DT: ''
        };
      }

      // Validate từng imageUrl
      for (const imageUrl of images) {
        if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
          return {
            EM: 'Mỗi hình ảnh phải là một URL hợp lệ',
            EC: 1,
            DT: ''
          };
        }
      }

      // Loại bỏ trùng lặp
      const uniqueImages = [...new Set(images)];

      // Lưu lại
      await gym.update({
        images: uniqueImages.length > 0 ? JSON.stringify(uniqueImages) : null
      });

      // Lấy lại gym đã cập nhật
      const updatedGym = await db.Gym.findOne({
        where: { id },
        include: [
          {
            model: db.User,
            as: 'owner',
            attributes: ['id', 'username', 'email', 'phone']
          }
        ]
      });

      const response = {
        ...updatedGym.get({ plain: true }),
        images: uniqueImages
      };

      return {
        EM: 'Cập nhật danh sách hình ảnh thành công',
        EC: 0,
        DT: response
      };
    } catch (error) {
      console.log('Error in updateImages:', error);
      return {
        EM: 'Lỗi khi cập nhật danh sách hình ảnh',
        EC: -1,
        DT: ''
      };
    }
  },

  /**
   * Lấy danh sách hình ảnh của gym
   */
  getImages: async (id) => {
    try {
      const gym = await db.Gym.findOne({ where: { id } });

      if (!gym) {
        return {
          EM: 'Không tìm thấy gym',
          EC: 1,
          DT: ''
        };
      }

      // Parse images
      let images = [];
      if (gym.images) {
        try {
          images = JSON.parse(gym.images);
          if (!Array.isArray(images)) {
            images = [];
          }
        } catch (e) {
          images = [];
        }
      }

      return {
        EM: 'Lấy danh sách hình ảnh thành công',
        EC: 0,
        DT: {
          gymId: gym.id,
          gymName: gym.name,
          images: images,
          totalImages: images.length
        }
      };
    } catch (error) {
      console.log('Error in getImages:', error);
      return {
        EM: 'Lỗi khi lấy danh sách hình ảnh',
        EC: -1,
        DT: ''
      };
    }
  }
};

module.exports = gymService;
