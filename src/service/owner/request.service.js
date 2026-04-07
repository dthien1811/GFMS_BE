
const { Request, User, Trainer, Gym, Member, Booking, sequelize } = require("../../models");
const { Sequelize } = require('sequelize');
const realtimeServiceModule = require("../realtime.service");
const realtimeService = realtimeServiceModule.default || realtimeServiceModule;
const BUSY_REQUEST_NOTE_MARKER = "[PT_BUSY_REQUEST]";

const emitOwnerRequestChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "request:changed", payload);
  });
};

const getRequestNotificationTemplates = (requestType, rejectNote) => {
  const type = String(requestType || "").trim().toUpperCase();
  if (type === "BUSY_SLOT") {
    return {
      approved: {
        title: "Yêu cầu báo bận đã được duyệt",
        message: "Chủ phòng tập đã duyệt yêu cầu báo bận khung giờ dạy của bạn.",
      },
      rejected: {
        title: "Yêu cầu báo bận bị từ chối",
        message: rejectNote || "Chủ phòng tập đã từ chối yêu cầu báo bận khung giờ dạy của bạn.",
      },
    };
  }

  return {
    approved: {
      title: "Đơn đăng ký huấn luyện viên đã được duyệt",
      message: "Chủ gym đã duyệt đơn đăng ký trở thành huấn luyện viên của bạn.",
    },
    rejected: {
      title: "Đơn đăng ký huấn luyện viên bị từ chối",
      message: rejectNote || "Chủ gym đã từ chối đơn đăng ký trở thành huấn luyện viên của bạn.",
    },
  };
};

module.exports = {
  async getRequests({ page = 1, limit = 10, gymId } = {}) {
    try {
      const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0
        ? Math.min(Number(limit), 50)
        : 10;
      const scopedGymId = Number.isInteger(Number(gymId)) && Number(gymId) > 0 ? Number(gymId) : null;

      const requests = await Request.findAll({
        where: {
          status: {
            [Sequelize.Op.ne]: 'cancelled',  // Lọc bỏ những yêu cầu có trạng thái 'cancelled'
          }
        },
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        include: [
          {
            model: User,
            as: 'requester',
            attributes: ['id', 'username'],  // Lấy cột 'username' của người gửi
          },
          {
            model: User,
            as: 'approver',
            attributes: ['id', 'username'],  // Lấy cột 'username' của người duyệt
          }
        ]
      });

      const gymIds = [...new Set(
        requests
          .map((r) => Number(r?.data?.application?.gymId))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];

      let gymMap = new Map();
      if (gymIds.length > 0) {
        const gyms = await Gym.findAll({
          where: { id: { [Sequelize.Op.in]: gymIds } },
          attributes: ["id", "name"],
          raw: true,
        });
        gyms.forEach((g) => gymMap.set(Number(g.id), g.name));
      }

      const busySlotMemberIds = [...new Set(
        requests
          .filter((request) => String(request?.requestType || "").trim().toUpperCase() === "BUSY_SLOT")
          .map((request) => Number(request?.data?.memberId))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];

      let memberNameMap = new Map();
      if (busySlotMemberIds.length > 0 && Member) {
        const members = await Member.findAll({
          where: { id: { [Sequelize.Op.in]: busySlotMemberIds } },
          attributes: ["id"],
          include: [{ model: User, as: "User", attributes: ["username"], required: false }],
        });
        members.forEach((member) => {
          memberNameMap.set(Number(member.id), member?.User?.username || null);
        });
      }

      const mapped = requests.map((request) => {
        const application = request?.data?.application || {};
        const requestData = request?.data || null;
        const requestMemberId = Number(requestData?.memberId || 0);
        const requestGymId = Number(requestData?.gymId || 0);
        const gymId = Number(application.gymId);
        const gymName = Number.isInteger(gymId) && gymId > 0
          ? gymMap.get(gymId) || null
          : null;
        const spec = Array.isArray(application.specializations)
          ? application.specializations.filter(Boolean).join(", ")
          : "";
        const cert = String(application.certification || "").trim();
        const links = Array.isArray(application.certificationLinks)
          ? application.certificationLinks.filter(Boolean)
          : [];
        const images = Array.isArray(application.certificateImageUrls)
          ? application.certificateImageUrls.filter(Boolean)
          : [];
        const hr = Number(application.hourlyRate);

        const applicationSummary = [
          Number.isInteger(gymId) && gymId > 0 ? `Gym: #${gymId}` : "",
          spec ? `Chuyên môn: ${spec}` : "",
          cert ? `Chứng chỉ: ${cert}` : "",
          links.length ? `Link chứng chỉ: ${links.join(", ")}` : "",
          images.length ? `Ảnh chứng chỉ: ${images.length} ảnh` : "",
          Number.isFinite(hr) && hr > 0 ? `Giá/giờ: ${hr}` : "",
        ].filter(Boolean).join(" | ");

        return {
          id: request.id,
          requestType: request.requestType,
          status: request.status,
          reason: request.reason,
          requestData: requestData
            ? {
                ...requestData,
                memberName: requestData.memberName || (requestMemberId ? memberNameMap.get(requestMemberId) || null : null),
                gymName:
                  requestData.gymName
                  || (requestGymId ? gymMap.get(requestGymId) || null : null),
              }
            : null,
          requestContent: request?.data?.content || applicationSummary,
          requestApplication: {
            gymId: Number.isInteger(gymId) && gymId > 0 ? gymId : null,
            gymName,
            specializations: Array.isArray(application.specializations)
              ? application.specializations.filter(Boolean)
              : [],
            certification: cert || null,
            certificationLinks: links,
            certificateImageUrls: images,
            hourlyRate: Number.isFinite(hr) && hr > 0 ? hr : null,
          },
          requesterUsername: request.requester ? request.requester.username : null,
          approverUsername: request.approver ? request.approver.username : null,
        };
      });

      const filtered = scopedGymId
        ? mapped.filter((request) => {
            const candidateGymIds = [
              request?.requestApplication?.gymId,
              request?.requestData?.gymId,
              request?.requestData?.application?.gymId,
              request?.requestData?.fromGymId,
              request?.requestData?.toGymId,
              request?.requestData?.targetGymId,
            ]
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && value > 0);

            return candidateGymIds.includes(scopedGymId);
          })
        : mapped;

      const total = filtered.length;
      const offset = (safePage - 1) * safeLimit;
      const pagedData = filtered.slice(offset, offset + safeLimit);

      const totalPages = Math.max(1, Math.ceil(total / safeLimit));
      return {
        data: pagedData,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error("Error fetching requests:", error);
      throw new Error('Error fetching requests: ' + error.message);
    }
  },

  async approveRequest(requestId, approverId, approveNote) {
    return sequelize.transaction(async (t) => {
      const request = await Request.findByPk(requestId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!request) throw new Error('Request not found');

      request.status = 'approved';
      request.approverId = approverId;
      request.approveNote = approveNote || '';
      request.processedAt = new Date();
      await request.save({ transaction: t });

      const normalizedType = String(request.requestType || '').trim().toUpperCase();
      if (normalizedType === 'BECOME_TRAINER') {
        const application = request?.data?.application || {};
        const requester = await User.findByPk(request.requesterId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        const specialization = Array.isArray(application.specializations)
          ? application.specializations.filter(Boolean).join(', ')
          : String(application.specializations || '').trim();

        const certification = String(application.certification || '').trim() || null;
        const gymId = Number.isInteger(Number(application.gymId)) && Number(application.gymId) > 0
          ? Number(application.gymId)
          : null;
        const hourlyRate = Number(application.hourlyRate) > 0 ? Number(application.hourlyRate) : null;
        const socialLinks = {
          certificateLinks: Array.isArray(application.certificationLinks)
            ? application.certificationLinks.filter(Boolean)
            : [],
          certificateImageUrls: Array.isArray(application.certificateImageUrls)
            ? application.certificateImageUrls.filter(Boolean)
            : [],
        };

        const existingTrainer = await Trainer.findOne({
          where: { userId: request.requesterId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (existingTrainer) {
          if (gymId) existingTrainer.gymId = gymId;
          if (specialization) existingTrainer.specialization = specialization;
          if (certification) existingTrainer.certification = certification;
          if (hourlyRate) existingTrainer.hourlyRate = hourlyRate;
          existingTrainer.socialLinks = {
            ...(existingTrainer.socialLinks || {}),
            ...socialLinks,
          };
          if (existingTrainer.isActive === false) existingTrainer.isActive = true;
          await existingTrainer.save({ transaction: t });
        } else {
          await Trainer.create(
            {
              userId: request.requesterId,
              gymId,
              specialization: specialization || null,
              certification,
              hourlyRate,
              socialLinks,
              status: 'active',
              isActive: true,
            },
            { transaction: t }
          );
        }

        if (requester && Number(requester.groupId) !== 3) {
          requester.groupId = 3;
          await requester.save({ transaction: t });
        }
      } else if (normalizedType === 'BUSY_SLOT') {
        const bookingId = Number(request?.data?.bookingId || 0);
        if (bookingId > 0) {
          const booking = await Booking.findByPk(bookingId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (booking) {
            const currentNotes = String(booking.notes || "");
            if (!currentNotes.includes(BUSY_REQUEST_NOTE_MARKER)) {
              const note = `${BUSY_REQUEST_NOTE_MARKER} Owner đã duyệt yêu cầu báo bận #${request.id}`;
              booking.notes = currentNotes ? `${currentNotes}\n${note}` : note;
              await booking.save({ transaction: t });
            }
          }
        }
      }

      emitOwnerRequestChanged([approverId, request.requesterId], {
        requestId: request.id,
        status: request.status,
        action: "approved",
        requestType: request.requestType,
      });

      const templates = getRequestNotificationTemplates(request.requestType);
      if (request.requesterId) {
        await realtimeService.notifyUser(request.requesterId, {
          title: templates.approved.title,
          message: templates.approved.message,
          notificationType: "trainer_request",
          relatedType: "request",
          relatedId: request.id,
        });
      }

      return request;
    });
  },

  async rejectRequest(requestId, approverId, rejectNote) {
    const request = await Request.findByPk(requestId);
    if (!request) throw new Error('Request not found');

    request.status = 'rejected';
    request.approverId = approverId;
    request.approveNote = rejectNote || '';
    request.processedAt = new Date();

    await request.save();

    emitOwnerRequestChanged([approverId, request.requesterId], {
      requestId: request.id,
      status: request.status,
      action: "rejected",
      requestType: request.requestType,
    });

    const templates = getRequestNotificationTemplates(request.requestType, rejectNote);
    if (request.requesterId) {
      await realtimeService.notifyUser(request.requesterId, {
        title: templates.rejected.title,
        message: templates.rejected.message,
        notificationType: "trainer_request",
        relatedType: "request",
        relatedId: request.id,
      });
    }

    return request;
  },
};