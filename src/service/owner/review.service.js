import db from "../../models/index";

const { Review, Gym, Trainer, Member, User, Sequelize } = db;
const { Op } = Sequelize;

const toPositiveInt = (value, fallback) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : fallback;
};

const normalizeText = (value) => String(value || "").trim();

const getOwnerGymIds = async (ownerUserId) => {
  const gyms = await Gym.findAll({
    where: { ownerId: ownerUserId },
    attributes: ["id"],
    raw: true,
  });
  return gyms.map((g) => Number(g.id)).filter((id) => Number.isInteger(id) && id > 0);
};

const listOwnerReviews = async (ownerUserId, query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 10), 50);
  const offset = (page - 1) * limit;

  const ownerGymIds = await getOwnerGymIds(ownerUserId);
  if (ownerGymIds.length === 0) {
    return {
      data: [],
      pagination: { page, limit, total: 0, totalPages: 1 },
    };
  }

  const trainers = await Trainer.findAll({
    where: { gymId: { [Op.in]: ownerGymIds } },
    attributes: ["id"],
    raw: true,
  });
  const ownerTrainerIds = trainers
    .map((t) => Number(t.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const requestedType = normalizeText(query.reviewType).toLowerCase();
  const reviewTypeFilter = requestedType === "gym" || requestedType === "trainer"
    ? requestedType
    : null;

  const scopeConditions = [
    {
      reviewType: "gym",
      gymId: { [Op.in]: ownerGymIds },
    },
    {
      reviewType: "trainer",
      [Op.or]: [
        { gymId: { [Op.in]: ownerGymIds } },
        ...(ownerTrainerIds.length > 0 ? [{ trainerId: { [Op.in]: ownerTrainerIds } }] : []),
      ],
    },
  ];

  const where = {
    status: "active",
    reviewType: reviewTypeFilter || { [Op.in]: ["gym", "trainer"] },
    [Op.and]: [
      {
        [Op.or]: scopeConditions,
      },
    ],
  };

  const q = normalizeText(query.q);
  if (q) {
    const likePattern = `%${q}%`;
    where[Op.and].push({
      [Op.or]: [
        { comment: { [Op.like]: likePattern } },
        Sequelize.where(Sequelize.col("Member->User.username"), { [Op.like]: likePattern }),
        Sequelize.where(Sequelize.col("Trainer->User.username"), { [Op.like]: likePattern }),
        Sequelize.where(Sequelize.col("Gym.name"), { [Op.like]: likePattern }),
        Sequelize.where(Sequelize.col("Trainer->Gym.name"), { [Op.like]: likePattern }),
      ],
    });
  }

  if (query.gymId) {
    const gymId = Number(query.gymId);
    if (Number.isInteger(gymId) && gymId > 0 && ownerGymIds.includes(gymId)) {
      where[Op.and].push({
        [Op.or]: [
          {
            reviewType: "gym",
            gymId,
          },
          {
            reviewType: "trainer",
            [Op.or]: [
              { gymId },
              { "$Trainer.gymId$": gymId },
            ],
          },
        ],
      });
    }
  }

  const { rows, count } = await Review.findAndCountAll({
    where,
    subQuery: false,
    include: [
      {
        model: Member,
        attributes: ["id", "userId"],
        required: false,
        include: [
          {
            model: User,
            attributes: ["id", "username", "email"],
            required: false,
          },
        ],
      },
      {
        model: Trainer,
        attributes: ["id", "gymId"],
        required: false,
        include: [
          {
            model: User,
            attributes: ["id", "username", "email"],
            required: false,
          },
          {
            model: Gym,
            attributes: ["id", "name"],
            required: false,
          },
        ],
      },
      {
        model: Gym,
        attributes: ["id", "name"],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  const data = rows.map((row) => {
    const memberUser = row.Member?.User || null;
    const trainerUser = row.Trainer?.User || null;
    const gymRef = row.Gym || row.Trainer?.Gym || null;

    return {
      id: row.id,
      reviewType: row.reviewType,
      rating: row.rating,
      comment: row.comment || "",
      trainerReply: row.trainerReply || "",
      createdAt: row.createdAt,
      member: {
        id: row.memberId || null,
        userId: memberUser?.id || row.Member?.userId || null,
        username: memberUser?.username || "N/A",
        email: memberUser?.email || null,
      },
      trainer: {
        id: row.trainerId || null,
        username: trainerUser?.username || null,
        email: trainerUser?.email || null,
      },
      gym: {
        id: row.gymId || gymRef?.id || null,
        name: gymRef?.name || null,
      },
    };
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    },
  };
};

const ownerReviewService = {
  listOwnerReviews,
};

export default ownerReviewService;
