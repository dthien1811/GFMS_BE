// authService.js
import db from '../models/index';
import bcrypt from 'bcryptjs';
import jwtAction from '../middleware/JWTAction'; // ✅ thêm dòng này
import { getGroupWithRoles } from './JWTService'; // ✅ thêm dòng này
const salt = bcrypt.genSaltSync(10);

const hashPassword = (userPassword) => {
  return bcrypt.hashSync(userPassword, salt);
};

const checkEmailExist = async (userEmail) => {
  let user = await db.User.findOne({
    where: { email: userEmail },
  });
  return !!user;
};

const checkPhoneExist = async (userPhone) => {
  let user = await db.User.findOne({
    where: { phone: userPhone },
  });
  return !!user;
};

const checkUsernameExist = async (username) => {
  let user = await db.User.findOne({
    where: { username: username },
  });
  return !!user;
};

const registerNewUser = async (rawUserData) => {
  try {
    // check email
    let isEmailExist = await checkEmailExist(rawUserData.email);
    if (isEmailExist) {
      return {
        EM: 'The email is already exist',
        EC: 1,
      };
    }

    // check phone
    let isPhoneExist = await checkPhoneExist(rawUserData.phone);
    if (isPhoneExist) {
      return {
        EM: 'The phone number is already exist',
        EC: 1,
      };
    }

    // check username
    let isUsernameExist = await checkUsernameExist(rawUserData.username);
    if (isUsernameExist) {
      return {
        EM: 'The username is already exist',
        EC: 1,
      };
    }

    // hash password
    let hashPass = hashPassword(rawUserData.password);

    await db.User.create({
      email: rawUserData.email,
      username: rawUserData.username,
      password: hashPass,
      phone: rawUserData.phone,
      groupId: 5
    });

    return {
      EM: 'A user is created successfully',
      EC: 0,
    };
  } catch (e) {
    console.log(e);
    return {
      EM: 'Something wrong in service...',
      EC: 1,
    };
  }
};

const loginUser = async (userData) => {
  try {
    let user = await db.User.findOne({
      where: { email: userData.email },
    });

    if (!user) {
      return {
        EM: 'User not found',
        EC: 1,
        DT: '',
      };
    }

    let isCorrectPassword = bcrypt.compareSync(userData.password, user.password);
    if (!isCorrectPassword) {
      return {
        EM: 'Wrong password',
        EC: 1,
        DT: '',
      };
    }
    let groupWithRoles = await getGroupWithRoles(user); // load roles
    // ✅ Tạo token
    const payload = {
      id: user.id,
      email: user.email,
      username: user.username,
    };

    const access_Token = jwtAction.createJWT(payload);

    // ✅ Trả user dạng plain và bỏ password
    const userPlain = user.get ? user.get({ plain: true }) : user;
    if (userPlain && userPlain.password) delete userPlain.password;

    return {
      EM: 'Login success',
      EC: 0,
      DT: {
        
        access_Token,
        user: userPlain,
        
      },
    };
  } catch (error) {
    console.log(error);
    return {
      EM: 'Something went wrong in service...',
      EC: -2,
      DT: '',
    };
  }
};

module.exports = {
  registerNewUser,
  loginUser,
};
