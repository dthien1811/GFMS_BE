// src/service/authService.js
import db from '../models/index'
import bcrypt from 'bcryptjs'
import { createToken, getGroupWithRoles } from './JWTService'

const salt = bcrypt.genSaltSync(10)
const hashPassword = (userPassword) => bcrypt.hashSync(userPassword, salt)

const checkEmailExist = async (userEmail) => {
  const user = await db.User.findOne({ where: { email: userEmail } })
  return !!user
}

const checkPhoneExist = async (userPhone) => {
  const user = await db.User.findOne({ where: { phone: userPhone } })
  return !!user
}

const checkUsernameExist = async (username) => {
  const user = await db.User.findOne({ where: { username } })
  return !!user
}

// ================= REGISTER =================
// ✅ Marketplace: đăng ký chỉ tạo User. Member sẽ được auto-create theo gym khi mua gói/đặt lịch
const registerNewUser = async (rawUserData) => {
  const t = await db.sequelize.transaction()
  try {
    if (await checkEmailExist(rawUserData.email)) {
      return { EM: 'The email is already exist', EC: 1 }
    }
    if (await checkPhoneExist(rawUserData.phone)) {
      return { EM: 'The phone number is already exist', EC: 1 }
    }
    if (await checkUsernameExist(rawUserData.username)) {
      return { EM: 'The username is already exist', EC: 1 }
    }

    const hashPass = hashPassword(rawUserData.password)

    await db.User.create(
      {
        email: rawUserData.email,
        username: rawUserData.username,
        password: hashPass,
        phone: rawUserData.phone,
        groupId: 4, // Member group (tuỳ mapping group của bạn)
        status: 'active'
      },
      { transaction: t }
    )

    await t.commit()
    return { EM: 'Register success', EC: 0 }
  } catch (e) {
    await t.rollback()
    console.log('Register error:', e)
    return { EM: 'Something wrong in service.', EC: 1 }
  }
}

// ================= LOGIN =================
const loginUser = async (userData) => {
  try {
    const user = await db.User.findOne({
      where: { email: userData.email },
      raw: true
    })

    if (!user) return { EM: 'User not found', EC: 1, DT: '' }

    // check status
    const status = (user.status || 'active').toLowerCase()
    if (status !== 'active') {
      if (status === 'inactive')
        return { EM: 'Account inactive', EC: 2, DT: '' }
      if (status === 'suspended')
        return { EM: 'Account suspended', EC: 2, DT: '' }
      return { EM: 'Account not allowed', EC: 2, DT: '' }
    }

    const isCorrectPassword = bcrypt.compareSync(
      userData.password,
      user.password
    )
    if (!isCorrectPassword) return { EM: 'Wrong password', EC: 1, DT: '' }

    // update lastLogin (optional)
    try {
      await db.User.update(
        { lastLogin: new Date() },
        { where: { id: user.id } }
      )
    } catch (e) {
      console.log('Update lastLogin failed:', e?.message || e)
    }

    const roles = await getGroupWithRoles(user)

    const payload = {
      id: user.id,
      email: user.email,
      username: user.username,
      groupId: user.groupId
    }

    const accessToken = createToken(payload)
    delete user.password

    return {
      EM: 'Login success',
      EC: 0,
      DT: {
        user,
        accessToken,
        roles
      }
    }
  } catch (error) {
    console.log(error)
    return { EM: 'Something went wrong in service.', EC: -2, DT: '' }
  }
}

module.exports = {
  registerNewUser,
  loginUser
}
