// authService.js
import db from '../models/index';
import bcrypt from 'bcryptjs';
const salt = bcrypt.genSaltSync(10);

const hashPassword = (userPassword) => {
    return bcrypt.hashSync(userPassword, salt);
}

const checkEmailExist = async (userEmail) => {
    let user = await db.User.findOne({
        where: { email: userEmail }
    });
    return !!user;
}

const checkPhoneExist = async (userPhone) => {
    let user = await db.User.findOne({
        where: { phone: userPhone }
    });
    return !!user;
}

// THÊM hàm check username
const checkUsernameExist = async (username) => {
    let user = await db.User.findOne({
        where: { username: username }
    });
    return !!user;
}

const registerNewUser = async (rawUserData) => {
    try {
        // check email
        let isEmailExist = await checkEmailExist(rawUserData.email);
        if (isEmailExist) {
            return {
                EM: 'The email is already exist',
                EC: 1
            }
        }

        // check phone
        let isPhoneExist = await checkPhoneExist(rawUserData.phone);
        if (isPhoneExist) {
            return {
                EM: 'The phone number is already exist',
                EC: 1
            }
        }

        // check username (nếu cần) <-- BẠN ĐÃ CÓ NHƯNG CHƯA GỌI!
        let isUsernameExist = await checkUsernameExist(rawUserData.username);
        if (isUsernameExist) {
            return {
                EM: 'The username is already exist',
                EC: 1
            }
        }

        // hash password
        let hashPass = hashPassword(rawUserData.password);

        // create new user
        await db.User.create({
            email: rawUserData.email,
            username: rawUserData.username,
            password: hashPass,
            phone: rawUserData.phone
        });

        return {
            EM: 'Create new user success',
            EC: 0
        }

    } catch (error) {
        console.log(error);
        return {
            EM: 'Something went wrong in service...',
            EC: -2
        };
    }
}

const loginUser = async (userData) => {
    try {
        let user = await db.User.findOne({
            where: { email: userData.email }
        });
        if (user) {
            let isCorrectPassword = bcrypt.compareSync(userData.password, user.password);
            if (isCorrectPassword) {
                return {
                    EM: 'Login success',
                    EC: 0,
                    DT: user
                }
            } else {
                return {
                    EM: 'Wrong password',
                    EC: 1,
                    DT: ''
                }
            }
        } else {
            return {
                EM: 'User not found',
                EC: 1,
                DT: ''
            }
        }
    } catch (error) {
        console.log(error);
        return {
            EM: 'Something went wrong in service...',
            EC: -2,
            DT: ''
        };
    }
}

module.exports = {
    registerNewUser,
    loginUser
}