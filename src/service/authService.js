// src/service/authService.js
import db from "../models/index";
import bcrypt from "bcryptjs";
import { createToken, getGroupWithRoles } from "./JWTService";

const salt = bcrypt.genSaltSync(10);

const hashPassword = (userPassword) => bcrypt.hashSync(userPassword, salt);

const checkEmailExist = async (userEmail) => {
  const user = await db.User.findOne({ where: { email: userEmail } });
  return !!user;
};

const checkPhoneExist = async (userPhone) => {
  const user = await db.User.findOne({ where: { phone: userPhone } });
  return !!user;
};

const checkUsernameExist = async (username) => {
  const user = await db.User.findOne({ where: { username } });
  return !!user;
};

const registerNewUser = async (rawUserData) => {
  try {
    if (await checkEmailExist(rawUserData.email)) {
      return { EM: "The email is already exist", EC: 1 };
    }

    if (await checkPhoneExist(rawUserData.phone)) {
      return { EM: "The phone number is already exist", EC: 1 };
    }

    if (await checkUsernameExist(rawUserData.username)) {
      return { EM: "The username is already exist", EC: 1 };
    }

    const hashPass = hashPassword(rawUserData.password);

    await db.User.create({
      email: rawUserData.email,
      username: rawUserData.username,
      password: hashPass,
      phone: rawUserData.phone,
      groupId: 5, // default group (Guest)
    });

    return { EM: "A user is created successfully", EC: 0 };
  } catch (e) {
    console.log(e);
    return { EM: "Something wrong in service...", EC: 1 };
  }
};

const loginUser = async (userData) => {
  try {
    const user = await db.User.findOne({
      where: { email: userData.email },
      raw: true,
    });

    if (!user) return { EM: "User not found", EC: 1, DT: "" };

    const isCorrectPassword = bcrypt.compareSync(userData.password, user.password);
    if (!isCorrectPassword) return { EM: "Wrong password", EC: 1, DT: "" };

    // roles (optional) - nếu FE cần hiển thị/ẩn chức năng theo role
    const roles = await getGroupWithRoles(user);

    // payload token (quan trọng: có groupId để middleware permission dùng)
    const payload = {
      id: user.id,
      email: user.email,
      username: user.username,
      groupId: user.groupId,
    };

    const accessToken = createToken(payload);

    // không trả password về client
    delete user.password;

    return {
      EM: "Login success",
      EC: 0,
      DT: {
        user,
        accessToken,
        roles,
      },
    };
  } catch (error) {
    console.log(error);
    return { EM: "Something went wrong in service...", EC: -2, DT: "" };
  }
};

module.exports = {
  registerNewUser,
  loginUser,
};
