// src/service/authService.js
import crypto from 'crypto'
import db from '../models/index'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { createToken, getGroupWithRoles } from './JWTService'

const salt = bcrypt.genSaltSync(10)
const hashPassword = (userPassword) => bcrypt.hashSync(userPassword, salt)

const MAX_AVATAR_URL_LEN = 250

const slugBaseUsername = (name, email) => {
  const fromName = (name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  const fromEmail = (email || '').split('@')[0] || 'user'
  const base = (fromName || fromEmail || 'user').slice(0, 28)
  return base || 'user'
}

const pickAvatarFromPicture = (picture) => {
  if (!picture || typeof picture !== 'string') return 'default-avatar.png'
  return picture.length <= MAX_AVATAR_URL_LEN ? picture : 'default-avatar.png'
}

const issueLoginSuccess = async (userRow) => {
  const roles = await getGroupWithRoles(userRow)
  const payload = {
    id: userRow.id,
    email: userRow.email,
    username: userRow.username,
    groupId: userRow.groupId
  }
  const accessToken = createToken(payload)
  const user = { ...userRow }
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
}

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

// ================= LOGIN WITH GOOGLE (ID token) =================
// - Verify JWT từ Google bằng google-auth-library (audience = GOOGLE_CLIENT_ID)
// - User đã tồn tại (kể cả đăng ký email/password): cho đăng nhập nếu Google xác minh email (không đổi password)
// - User mới: tạo Member (groupId = 4), password = random hash (không dùng cho Google flow)
const loginWithGoogle = async ({ credential }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId || !String(clientId).trim()) {
    return {
      EM: 'Google login is not configured on server (missing GOOGLE_CLIENT_ID)',
      EC: 1,
      DT: ''
    }
  }

  if (!credential || typeof credential !== 'string') {
    return { EM: 'Missing Google credential', EC: 1, DT: '' }
  }

  const client = new OAuth2Client(clientId)
  let payload
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId
    })
    payload = ticket.getPayload()
  } catch (err) {
    console.error('Google verifyIdToken failed:', err?.message || err)
    return {
      EM: 'Invalid or expired Google token',
      EC: 1,
      DT: ''
    }
  }

  if (!payload) {
    return { EM: 'Invalid Google token payload', EC: 1, DT: '' }
  }

  const email = (payload.email || '').trim().toLowerCase()
  if (!email) {
    return { EM: 'Google account has no email', EC: 1, DT: '' }
  }

  if (payload.email_verified !== true) {
    return { EM: 'Google email is not verified', EC: 1, DT: '' }
  }

  const googleName = (payload.name || '').trim() || null
  const picture = payload.picture || null
  const sub = payload.sub || ''

  try {
    let user = await db.User.findOne({
      where: { email },
      raw: true
    })

    if (user) {
      const status = (user.status || 'active').toLowerCase()
      if (status !== 'active') {
        if (status === 'inactive') {
          return { EM: 'Account inactive', EC: 2, DT: '' }
        }
        if (status === 'suspended') {
          return { EM: 'Account suspended', EC: 2, DT: '' }
        }
        return { EM: 'Account not allowed', EC: 2, DT: '' }
      }

      try {
        await db.User.update({ lastLogin: new Date() }, { where: { id: user.id } })
      } catch (e) {
        console.log('Update lastLogin (Google) failed:', e?.message || e)
      }

      // Tài khoản local (cùng email): Google đã chứng minh quyền sở hữu email → cấp JWT giống login thường, không sửa password
      return await issueLoginSuccess(user)
    }

    // --- Tạo user mới (Member) ---
    const t = await db.sequelize.transaction()
    try {
      const randomPass = crypto.randomBytes(32).toString('hex')
      const hashPass = hashPassword(randomPass)

      let base = slugBaseUsername(googleName, email)
      let candidate = base
      let n = 0
      const subSuffix = (sub || `${Date.now()}`).replace(/\W/g, '').slice(-10) || 'g'

      while (await checkUsernameExist(candidate)) {
        n += 1
        candidate = `${base}_${subSuffix}_${n}`.slice(0, 50)
      }

      const avatar = pickAvatarFromPicture(picture)

      await db.User.create(
        {
          email,
          username: candidate,
          password: hashPass,
          phone: null,
          groupId: 4,
          status: 'active',
          avatar,
          emailVerified: true
        },
        { transaction: t }
      )

      await t.commit()
    } catch (e) {
      await t.rollback()
      console.error('Google register/create user error:', e)
      return { EM: 'Something went wrong in service.', EC: -2, DT: '' }
    }

    user = await db.User.findOne({
      where: { email },
      raw: true
    })

    if (!user) {
      return { EM: 'Something went wrong in service.', EC: -2, DT: '' }
    }

    try {
      await db.User.update({ lastLogin: new Date() }, { where: { id: user.id } })
    } catch (e) {
      console.log('Update lastLogin (Google new user) failed:', e?.message || e)
    }

    return await issueLoginSuccess(user)
  } catch (error) {
    console.error('loginWithGoogle error:', error)
    return { EM: 'Something went wrong in service.', EC: -2, DT: '' }
  }
}

module.exports = {
  registerNewUser,
  loginUser,
  loginWithGoogle
}
