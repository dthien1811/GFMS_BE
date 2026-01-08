import db from '../models/index';
import jwt from "jsonwebtoken";

const getGroupWithRoles = async (user) => {
    //scope

    let roles = await db.Group.findOne({
        where: { id: user.groupId },
        include: [{ model: db.Role, attributes: ["id", "url", "description"], through: { attributes: [] } }]

    })

    return roles ? roles : {};
}
const createToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
};

const verifyToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = {
    getGroupWithRoles,
    createToken,
    verifyToken,
}