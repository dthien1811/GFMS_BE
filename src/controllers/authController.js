import authService from '../service/authService';
const crypto = require('crypto');
const transporter = require('../config/emailConfig');
const db = require('../models/index');

// ==================== GLOBAL RATE LIMITING CONFIG ====================
const RATE_LIMITS_CONFIG = {
  // GIỚI HẠN TỔNG CỦA HỆ THỐNG
  MAX_TOTAL_EMAILS_PER_DAY: 400,           // Dưới 500 để dự phòng Gmail limit
  MAX_UNIQUE_RECIPIENTS_PER_DAY: 400,      // Tối đa 400 email khác nhau/ngày

  // GIỚI HẠN THEO EMAIL
  MAX_OTP_PER_EMAIL_PER_DAY: 5,            // 5 OTP/email/ngày
  MAX_OTP_PER_EMAIL_PER_HOUR: 3,           // 3 OTP/email/giờ
  MIN_SECONDS_BETWEEN_OTP: 60,             // 60 giây giữa 2 lần gửi

  // GIỚI HẠN THEO IP
  MAX_REQUESTS_PER_IP_PER_DAY: 50,         // 50 requests từ 1 IP/ngày
  MAX_REQUESTS_PER_IP_PER_HOUR: 20,        // 20 requests từ 1 IP/giờ
};

// ==================== STORAGE & TRACKING ====================
const otpStorage = new Map(); // Lưu trữ OTP trong RAM
const rateLimits = new Map(); // Lưu rate limiting data
let stats = {
  totalEmailsToday: 0,
  uniqueRecipientsToday: new Set(),
  dailyResetTime: null,
  todayDate: null
};

// ==================== HELPER FUNCTIONS ====================
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const getTodayDateString = () => {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
};

const getCurrentHour = () => {
  return new Date().getHours();
};

const formatTimeRemaining = (ms) => {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} giờ`;
};

// ==================== RATE LIMITING FUNCTIONS ====================
const initializeDailyStats = () => {
  const today = getTodayDateString();
  const now = new Date();

  if (stats.todayDate !== today) {
    stats.totalEmailsToday = 0;
    stats.uniqueRecipientsToday = new Set();
    stats.todayDate = today;

    // Set thời gian reset cho ngày mai 00:00
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    stats.dailyResetTime = tomorrow.getTime();

    console.log(`[Daily Stats] Đã reset cho ngày ${today}`);
  }
};

const checkRateLimits = (email, clientIp) => {
  const now = Date.now();
  const today = getTodayDateString();
  const currentHour = getCurrentHour();

  // KHỞI TẠO STATS HẰNG NGÀY
  initializeDailyStats();

  // 1. KIỂM TRA TỔNG EMAIL/NGÀY
  if (stats.totalEmailsToday >= RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY) {
    const resetTime = new Date(stats.dailyResetTime);
    return {
      allowed: false,
      message: `Hệ thống đã đạt giới hạn gửi email hôm nay (${stats.totalEmailsToday}/${RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY}). Vui lòng thử lại sau ${resetTime.toLocaleTimeString()}`,
      code: 'SYSTEM_DAILY_LIMIT'
    };
  }

  // 2. KIỂM TRA UNIQUE RECIPIENTS/NGÀY
  if (stats.uniqueRecipientsToday.size >= RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY) {
    if (!stats.uniqueRecipientsToday.has(email)) {
      return {
        allowed: false,
        message: `Hệ thống đã đạt giới hạn người dùng khác nhau hôm nay (${stats.uniqueRecipientsToday.size}/${RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY})`,
        code: 'UNIQUE_RECIPIENTS_LIMIT'
      };
    }
  }

  // 3. KIỂM TRA EMAIL DAILY LIMIT
  const dailyKey = `email_daily:${email}:${today}`;
  const emailDailyData = rateLimits.get(dailyKey) || { count: 0, firstRequest: now };

  if (now - emailDailyData.firstRequest > 24 * 60 * 60 * 1000) {
    emailDailyData.count = 0;
    emailDailyData.firstRequest = now;
  }

  if (emailDailyData.count >= RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_DAY) {
    const resetTime = new Date(emailDailyData.firstRequest + 24 * 60 * 60 * 1000);
    return {
      allowed: false,
      message: `Bạn đã yêu cầu quá nhiều OTP hôm nay (${emailDailyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_DAY}). Thử lại sau ${resetTime.toLocaleTimeString()}`,
      code: 'EMAIL_DAILY_LIMIT'
    };
  }

  // 4. KIỂM TRA EMAIL HOURLY LIMIT
  const hourlyKey = `email_hourly:${email}:${today}:${currentHour}`;
  const emailHourlyData = rateLimits.get(hourlyKey) || { count: 0 };

  if (emailHourlyData.count >= RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_HOUR) {
    const nextHour = new Date();
    nextHour.setHours(currentHour + 1, 0, 0, 0);
    const minutesLeft = Math.ceil((nextHour - now) / (60 * 1000));
    return {
      allowed: false,
      message: `Bạn đã yêu cầu quá nhiều OTP trong giờ này (${emailHourlyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_HOUR}). Thử lại sau ${minutesLeft} phút`,
      code: 'EMAIL_HOURLY_LIMIT'
    };
  }

  // 5. KIỂM TRA INTERVAL GIỮA 2 LẦN GỬI
  const lastSentKey = `email_last:${email}`;
  const lastSentTime = rateLimits.get(lastSentKey);

  if (lastSentTime && (now - lastSentTime < RATE_LIMITS_CONFIG.MIN_SECONDS_BETWEEN_OTP * 1000)) {
    const secondsLeft = Math.ceil((RATE_LIMITS_CONFIG.MIN_SECONDS_BETWEEN_OTP * 1000 - (now - lastSentTime)) / 1000);
    return {
      allowed: false,
      message: `Vui lòng đợi ${secondsLeft} giây trước khi yêu cầu OTP mới`,
      code: 'EMAIL_INTERVAL_LIMIT'
    };
  }

  // 6. KIỂM TRA IP DAILY LIMIT
  const ipDailyKey = `ip_daily:${clientIp}:${today}`;
  const ipDailyData = rateLimits.get(ipDailyKey) || { count: 0 };

  if (ipDailyData.count >= RATE_LIMITS_CONFIG.MAX_REQUESTS_PER_IP_PER_DAY) {
    return {
      allowed: false,
      message: `IP của bạn đã gửi quá nhiều yêu cầu hôm nay (${ipDailyData.count}/${RATE_LIMITS_CONFIG.MAX_REQUESTS_PER_IP_PER_DAY})`,
      code: 'IP_DAILY_LIMIT'
    };
  }

  // 7. KIỂM TRA IP HOURLY LIMIT
  const ipHourlyKey = `ip_hourly:${clientIp}:${today}:${currentHour}`;
  const ipHourlyData = rateLimits.get(ipHourlyKey) || { count: 0 };

  if (ipHourlyData.count >= RATE_LIMITS_CONFIG.MAX_REQUESTS_PER_IP_PER_HOUR) {
    const nextHour = new Date();
    nextHour.setHours(currentHour + 1, 0, 0, 0);
    const minutesLeft = Math.ceil((nextHour - now) / (60 * 1000));
    return {
      allowed: false,
      message: `IP của bạn đã gửi quá nhiều yêu cầu trong giờ này. Thử lại sau ${minutesLeft} phút`,
      code: 'IP_HOURLY_LIMIT'
    };
  }

  return { allowed: true };
};

const updateRateLimits = (email, clientIp) => {
  const now = Date.now();
  const today = getTodayDateString();
  const currentHour = getCurrentHour();

  // 1. UPDATE TỔNG EMAIL/NGÀY
  stats.totalEmailsToday++;

  // 2. UPDATE UNIQUE RECIPIENTS
  stats.uniqueRecipientsToday.add(email);

  // 3. UPDATE EMAIL DAILY COUNT
  const dailyKey = `email_daily:${email}:${today}`;
  const emailDailyData = rateLimits.get(dailyKey) || { count: 0, firstRequest: now };
  emailDailyData.count++;
  rateLimits.set(dailyKey, emailDailyData);

  // 4. UPDATE EMAIL HOURLY COUNT
  const hourlyKey = `email_hourly:${email}:${today}:${currentHour}`;
  const emailHourlyData = rateLimits.get(hourlyKey) || { count: 0 };
  emailHourlyData.count++;
  rateLimits.set(hourlyKey, emailHourlyData);

  // 5. UPDATE LAST SENT TIME
  rateLimits.set(`email_last:${email}`, now);

  // 6. UPDATE IP DAILY COUNT
  const ipDailyKey = `ip_daily:${clientIp}:${today}`;
  const ipDailyData = rateLimits.get(ipDailyKey) || { count: 0 };
  ipDailyData.count++;
  rateLimits.set(ipDailyKey, ipDailyData);

  // 7. UPDATE IP HOURLY COUNT
  const ipHourlyKey = `ip_hourly:${clientIp}:${today}:${currentHour}`;
  const ipHourlyData = rateLimits.get(ipHourlyKey) || { count: 0 };
  ipHourlyData.count++;
  rateLimits.set(ipHourlyKey, ipHourlyData);

  console.log(`[Rate Limit Updated] ${email} | Daily: ${emailDailyData.count}/5 | Hourly: ${emailHourlyData.count}/3 | Total: ${stats.totalEmailsToday}/400`);
};

// ==================== AUTO CLEANUP FUNCTIONS ====================
// Dọn OTP hết hạn mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;

  for (const [email, data] of otpStorage.entries()) {
    if (now > data.expiresAt) {
      otpStorage.delete(email);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    console.log(`[OTP Cleanup] Đã xóa ${deletedCount} OTP hết hạn`);
  }
}, 5 * 60 * 1000);

// Dọn rate limits cũ mỗi giờ
setInterval(() => {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const twoDaysAgo = now - 48 * 60 * 60 * 1000;
  let cleanedCount = 0;

  for (const [key, value] of rateLimits.entries()) {
    if (key.includes('_daily:') || key.includes('_hourly:')) {
      if (typeof value === 'object' && value.firstRequest && value.firstRequest < twoDaysAgo) {
        rateLimits.delete(key);
        cleanedCount++;
      }
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Rate Limit Cleanup] Đã dọn ${cleanedCount} bản ghi cũ`);
  }
}, 60 * 60 * 1000); // Mỗi giờ

// ==================== API HANDLERS ====================

// 1. Register
const handleRegister = async (req, res) => {
  try {
    if (!req.body.email || !req.body.phone || !req.body.password || !req.body.username) {
      return res.status(400).json({
        EM: 'Missing required fields',
        EC: '1',
        DT: '',
      });
    }

    let data = await authService.registerNewUser(req.body);

    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: '',
      });
    } else {
      return res.status(400).json({
        EM: data.EM,
        EC: data.EC,
        DT: '',
      });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      EM: 'error from server',
      EC: '-1',
      DT: '',
    });
  }
};

// 2. Login
const handleLogin = async (req, res) => {
  try {
    if (!req.body.email || !req.body.password) {
      return res.status(400).json({
        EM: 'Missing required fields',
        EC: '1',
        DT: '',
      });
    }

    let data = await authService.loginUser(req.body);

    // set cookie (optional)
    if (data?.DT?.accessToken) {
      res.cookie("jwt", data.DT.accessToken, {
        httpOnly: true,
        maxAge: 60 * 60 * 1000
      });
    }

    if (data.EC === 0) {
      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT, // { user, accessToken }
      });
    } else {
      return res.status(401).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT,
      });
    }

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      EM: 'error from server',
      EC: '-1',
      DT: '',
    });
  }
};

// 3. Gửi OTP để reset password (ĐÃ THÊM RATE LIMITING)
const handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!email) {
      return res.status(400).json({
        EM: 'Email là bắt buộc',
        EC: 1,
        DT: ''
      });
    }

    // Kiểm tra email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        EM: 'Email không hợp lệ',
        EC: 1,
        DT: ''
      });
    }

    // Kiểm tra rate limits
    const limitCheck = checkRateLimits(email, clientIp);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        EM: limitCheck.message,
        EC: 1,
        DT: { code: limitCheck.code }
      });
    }

    // Kiểm tra email có tồn tại trong hệ thống không
    const user = await db.User.findOne({
      where: { email: email }
    });

    if (!user) {
      // Vẫn trừ rate limit kể cả email không tồn tại (security measure)
      updateRateLimits(email, clientIp);
      return res.status(404).json({
        EM: 'Email không tồn tại trong hệ thống',
        EC: 1,
        DT: ''
      });
    }

    // Tạo OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 phút

    // Lưu vào storage
    otpStorage.set(email, {
      otp,
      expiresAt,
      verified: false,
      createdAt: new Date(),
      ip: clientIp,
      attempts: 0 // Số lần thử OTP
    });

    // Update rate limits
    updateRateLimits(email, clientIp);

    console.log(`[OTP Created] ${email}: ${otp} (expires: ${new Date(expiresAt).toLocaleTimeString()})`);

    // Gửi email với OTP
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: 'Mã OTP đặt lại mật khẩu - GFMS',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #ff6b00; text-align: center;">🔐 GFMS - Đặt lại mật khẩu</h2>
          <p>Xin chào,</p>
          <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản GFMS.</p>
          <p>Mã OTP của bạn là:</p>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; border: 2px dashed #ff6b00;">
            <h1 style="color: #ff6b00; margin: 0; font-size: 36px; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p><strong>⚠️ Lưu ý quan trọng:</strong></p>
          <ul>
            <li>Mã OTP có hiệu lực trong <strong>5 phút</strong></li>
            <li>Bạn có thể yêu cầu tối đa <strong>5 OTP/ngày</strong></li>
            <li>Không chia sẻ mã này với bất kỳ ai</li>
            <li>Nếu bạn không yêu cầu, vui lòng bỏ qua email này</li>
          </ul>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            Đây là email tự động, vui lòng không trả lời.<br>
            © ${new Date().getFullYear()} GFMS - Gym Franchise Management System
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      EM: 'OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (cả Spam).',
      EC: 0,
      DT: {
        email: email,
        limits: {
          daily: {
            used: rateLimits.get(`email_daily:${email}:${getTodayDateString()}`)?.count || 0,
            max: RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_DAY,
            remaining: RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_DAY - (rateLimits.get(`email_daily:${email}:${getTodayDateString()}`)?.count || 0)
          },
          hourly: {
            used: rateLimits.get(`email_hourly:${email}:${getTodayDateString()}:${getCurrentHour()}`)?.count || 0,
            max: RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_HOUR,
            remaining: RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_HOUR - (rateLimits.get(`email_hourly:${email}:${getTodayDateString()}:${getCurrentHour()}`)?.count || 0)
          },
          system: {
            totalToday: stats.totalEmailsToday,
            maxDaily: RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY
          }
        }
      }
    });

  } catch (error) {
    console.error('[Forgot Password Error]:', error);

    let errorMessage = 'Có lỗi xảy ra khi gửi OTP';
    if (error.code === 'EAUTH') {
      errorMessage = 'Lỗi xác thực email. Vui lòng kiểm tra EMAIL_USER và EMAIL_PASS trong .env';
    }

    return res.status(500).json({
      EM: errorMessage,
      EC: -1,
      DT: ''
    });
  }
};

// 4. Xác thực OTP (ĐÃ THÊM ATTEMPT LIMITING)
const handleVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        EM: 'Email và OTP là bắt buộc',
        EC: 1,
        DT: ''
      });
    }

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      return res.status(400).json({
        EM: 'OTP phải là 6 chữ số',
        EC: 1,
        DT: ''
      });
    }

    // Lấy OTP từ storage
    const storedData = otpStorage.get(email);

    if (!storedData) {
      return res.status(400).json({
        EM: 'OTP không tồn tại hoặc đã hết hạn',
        EC: 1,
        DT: ''
      });
    }

    // Kiểm tra số lần thử OTP (tối đa 5 lần)
    storedData.attempts = (storedData.attempts || 0) + 1;
    otpStorage.set(email, storedData);

    if (storedData.attempts > 5) {
      otpStorage.delete(email);
      return res.status(400).json({
        EM: 'OTP đã bị khóa do quá nhiều lần thử sai. Vui lòng yêu cầu mã mới',
        EC: 1,
        DT: ''
      });
    }

    // Kiểm tra OTP có khớp không
    if (storedData.otp !== otp) {
      const attemptsLeft = 5 - storedData.attempts;
      return res.status(400).json({
        EM: `OTP không chính xác. Bạn còn ${attemptsLeft} lần thử`,
        EC: 1,
        DT: { attemptsLeft: attemptsLeft }
      });
    }

    // Kiểm tra thời hạn
    if (Date.now() > storedData.expiresAt) {
      otpStorage.delete(email);
      return res.status(400).json({
        EM: 'OTP đã hết hạn. Vui lòng yêu cầu mã mới',
        EC: 1,
        DT: ''
      });
    }

    // Đánh dấu đã xác thực
    storedData.verified = true;
    storedData.verifiedAt = new Date();
    otpStorage.set(email, storedData);

    console.log(`[OTP Verified] ${email}: OTP hợp lệ (attempts: ${storedData.attempts})`);

    return res.status(200).json({
      EM: 'OTP hợp lệ. Vui lòng đặt mật khẩu mới.',
      EC: 0,
      DT: {
        email: email,
        verified: true,
        expiresAt: storedData.expiresAt
      }
    });

  } catch (error) {
    console.error('[Verify OTP Error]:', error);
    return res.status(500).json({
      EM: 'Có lỗi xảy ra khi xác thực OTP',
      EC: -1,
      DT: ''
    });
  }
};

// 5. Đặt lại mật khẩu mới
const handleResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Validation
    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        EM: 'Thiếu thông tin bắt buộc',
        EC: 1,
        DT: ''
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        EM: 'Mật khẩu mới phải có ít nhất 8 ký tự',
        EC: 1,
        DT: ''
      });
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({
        EM: 'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 số',
        EC: 1,
        DT: ''
      });
    }

    // Kiểm tra OTP
    const storedData = otpStorage.get(email);

    if (!storedData) {
      return res.status(400).json({
        EM: 'Phiên đặt lại mật khẩu không tồn tại',
        EC: 1,
        DT: ''
      });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({
        EM: 'OTP không chính xác',
        EC: 1,
        DT: ''
      });
    }

    if (!storedData.verified) {
      return res.status(400).json({
        EM: 'OTP chưa được xác thực. Vui lòng xác thực OTP trước',
        EC: 1,
        DT: ''
      });
    }

    // Hash mật khẩu mới
    const bcrypt = require('bcryptjs');
    const salt = bcrypt.genSaltSync(10);
    const hashPass = bcrypt.hashSync(newPassword, salt);

    // Cập nhật mật khẩu mới cho user
    const [affectedRows] = await db.User.update(
      { password: hashPass },
      { where: { email: email } }
    );

    if (affectedRows === 0) {
      return res.status(404).json({
        EM: 'Không tìm thấy tài khoản',
        EC: 1,
        DT: ''
      });
    }

    // Xóa OTP khỏi storage sau khi đổi mật khẩu thành công
    otpStorage.delete(email);

    console.log(`[Password Reset] ${email}: Đã đổi mật khẩu thành công`);

    // Log activity
    const resetLog = {
      email: email,
      resetAt: new Date(),
      ip: storedData.ip,
      success: true
    };
    console.log('[Password Reset Log]', resetLog);

    return res.status(200).json({
      EM: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.',
      EC: 0,
      DT: ''
    });

  } catch (error) {
    console.error('[Reset Password Error]:', error);
    return res.status(500).json({
      EM: 'Có lỗi xảy ra khi đặt lại mật khẩu',
      EC: -1,
      DT: ''
    });
  }
};

// 6. API kiểm tra rate limit status
const handleCheckRateLimit = (req, res) => {
  try {
    const { email } = req.query;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!email) {
      return res.status(400).json({
        EM: 'Email là bắt buộc',
        EC: 1,
        DT: ''
      });
    }

    const limitCheck = checkRateLimits(email, clientIp);
    const today = getTodayDateString();
    const currentHour = getCurrentHour();

    return res.status(200).json({
      EM: 'Rate limit status',
      EC: 0,
      DT: {
        email: email,
        ip: clientIp,
        canSend: limitCheck.allowed,
        message: limitCheck.allowed ? 'Có thể gửi OTP' : limitCheck.message,
        limits: {
          perEmail: {
            daily: {
              used: rateLimits.get(`email_daily:${email}:${today}`)?.count || 0,
              max: RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_DAY,
              remaining: RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_DAY - (rateLimits.get(`email_daily:${email}:${today}`)?.count || 0)
            },
            hourly: {
              used: rateLimits.get(`email_hourly:${email}:${today}:${currentHour}`)?.count || 0,
              max: RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_HOUR,
              remaining: RATE_LIMITS_CONFIG.MAX_OTP_PER_EMAIL_PER_HOUR - (rateLimits.get(`email_hourly:${email}:${today}:${currentHour}`)?.count || 0)
            },
            lastSent: rateLimits.get(`email_last:${email}`) || null
          },
          system: {
            totalEmailsToday: stats.totalEmailsToday,
            maxDaily: RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY,
            uniqueRecipients: stats.uniqueRecipientsToday.size,
            maxUnique: RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY
          },
          perIp: {
            daily: rateLimits.get(`ip_daily:${clientIp}:${today}`)?.count || 0,
            hourly: rateLimits.get(`ip_hourly:${clientIp}:${today}:${currentHour}`)?.count || 0
          }
        }
      }
    });

  } catch (error) {
    console.error('[Check Rate Limit Error]:', error);
    return res.status(500).json({
      EM: 'Có lỗi xảy ra khi kiểm tra rate limit',
      EC: -1,
      DT: ''
    });
  }
};

// ==================== EXPORT ====================
module.exports = {
  handleRegister,
  handleLogin,
  handleForgotPassword,
  handleVerifyOTP,
  handleResetPassword,
  handleCheckRateLimit,
  // Export stats for monitoring (optional)
  getStats: () => ({
    totalEmailsToday: stats.totalEmailsToday,
    uniqueRecipientsToday: stats.uniqueRecipientsToday.size,
    todayDate: stats.todayDate,
    otpStorageSize: otpStorage.size,
    rateLimitsSize: rateLimits.size
  })
};