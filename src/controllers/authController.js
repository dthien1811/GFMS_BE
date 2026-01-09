import authService from '../service/authService';
const crypto = require('crypto');
const transporter = require('../config/emailConfig');
const db = require('../models/index');

// ==================== GLOBAL RATE LIMITING CONFIG ====================
const RATE_LIMITS_CONFIG = {
  // GIỚI HẠN TỔNG CỦA HỆ THỐNG
  MAX_TOTAL_EMAILS_PER_DAY: 400,           // Dưới 500 để dự phòng Gmail limit
  MAX_UNIQUE_RECIPIENTS_PER_DAY: 150,      // Số người nhận khác nhau mỗi ngày
  
  // GIỚI HẠN CHO TỪNG EMAIL (chống spam)
  MAX_OTP_REQUESTS_PER_HOUR_PER_EMAIL: 5,  // Tối đa 5 OTP/giờ cho 1 email
  MAX_OTP_REQUESTS_PER_DAY_PER_EMAIL: 10,  // Tối đa 10 OTP/ngày cho 1 email
  
  // GIỚI HẠN CHO IP ADDRESS (chống bot)
  MAX_OTP_REQUESTS_PER_HOUR_PER_IP: 10,    // Tối đa 10 OTP/giờ cho 1 IP
  MAX_OTP_REQUESTS_PER_DAY_PER_IP: 20,     // Tối đa 20 OTP/ngày cho 1 IP
  
  // THỜI GIAN RESET
  RESET_HOUR: 0,                           // Reset counter lúc 0h hàng ngày
};

// ==================== GLOBAL TRACKING VARIABLES ====================
let stats = {
  totalEmailsToday: 0,
  uniqueRecipientsToday: new Set(),
  todayDate: new Date().toDateString(),
};

let rateLimits = new Map(); // Map để track từng email/IP
let otpStorage = new Map(); // Store OTP temporarily

// ==================== HELPER FUNCTIONS ====================
const resetDailyStats = () => {
  const currentDate = new Date().toDateString();
  if (stats.todayDate !== currentDate) {
    console.log('🔄 Reset daily email stats');
    stats = {
      totalEmailsToday: 0,
      uniqueRecipientsToday: new Set(),
      todayDate: currentDate,
    };
    rateLimits.clear(); // Reset rate limits daily
  }
};

const checkGlobalLimits = (email) => {
  resetDailyStats();
  
  // Check tổng email trong ngày
  if (stats.totalEmailsToday >= RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY) {
    return {
      allowed: false,
      message: `Hệ thống đã đạt giới hạn ${RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY} email/ngày. Vui lòng thử lại ngày mai.`
    };
  }
  
  // Check số unique recipients
  stats.uniqueRecipientsToday.add(email);
  if (stats.uniqueRecipientsToday.size > RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY) {
    return {
      allowed: false,
      message: `Hệ thống đã đạt giới hạn ${RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY} người nhận/ngày. Vui lòng thử lại ngày mai.`
    };
  }
  
  return { allowed: true };
};

const checkRateLimit = (email, ip) => {
  resetDailyStats();
  
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  
  // Create key for email and IP
  const emailKey = `email_${email}`;
  const ipKey = `ip_${ip}`;
  
  // Get or initialize rate limit data
  if (!rateLimits.has(emailKey)) {
    rateLimits.set(emailKey, { hourly: [], daily: 0 });
  }
  if (!rateLimits.has(ipKey)) {
    rateLimits.set(ipKey, { hourly: [], daily: 0 });
  }
  
  const emailData = rateLimits.get(emailKey);
  const ipData = rateLimits.get(ipKey);
  
  // Clean old hourly data (keep only last hour)
  emailData.hourly = emailData.hourly.filter(timestamp => timestamp > hourAgo);
  ipData.hourly = ipData.hourly.filter(timestamp => timestamp > hourAgo);
  
  // Check email limits
  if (emailData.hourly.length >= RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_EMAIL) {
    return {
      allowed: false,
      message: `Email này đã yêu cầu OTP quá nhiều (${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_EMAIL} lần/giờ). Vui lòng thử lại sau 1 giờ.`
    };
  }
  if (emailData.daily >= RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_EMAIL) {
    return {
      allowed: false,
      message: `Email này đã yêu cầu OTP quá nhiều (${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_EMAIL} lần/ngày). Vui lòng thử lại ngày mai.`
    };
  }
  
  // Check IP limits
  if (ipData.hourly.length >= RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_IP) {
    return {
      allowed: false,
      message: `IP này đã yêu cầu OTP quá nhiều (${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_IP} lần/giờ). Vui lòng thử lại sau 1 giờ.`
    };
  }
  if (ipData.daily >= RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_IP) {
    return {
      allowed: false,
      message: `IP này đã yêu cầu OTP quá nhiều (${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_IP} lần/ngày). Vui lòng thử lại ngày mai.`
    };
  }
  
  return { allowed: true };
};

const updateRateLimit = (email, ip) => {
  const now = Date.now();
  const emailKey = `email_${email}`;
  const ipKey = `ip_${ip}`;
  
  // Update email data
  const emailData = rateLimits.get(emailKey);
  emailData.hourly.push(now);
  emailData.daily++;
  
  // Update IP data
  const ipData = rateLimits.get(ipKey);
  ipData.hourly.push(now);
  ipData.daily++;
  
  // Update global stats
  stats.totalEmailsToday++;
  stats.uniqueRecipientsToday.add(email);
  
  console.log(`📊 Rate limit updated - Total emails today: ${stats.totalEmailsToday}`);
};

// 1. Register
const handleRegister = async (req, res) => {
  try {
    // validate
    if (!req.body.email || !req.body.phone || !req.body.password || !req.body.username) {
      return res.status(200).json({
        EM: 'Missing required fields',
        EC: '1',
        DT: '',
      });
    }

    // service: create user
    let data = await authService.registerNewUser(req.body);

    return res.status(200).json({
      EM: data.EM,
      EC: data.EC,
      DT: data.DT,
    });
  } catch (e) {
    console.log(e);
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

    // ✅ Chỉ set cookie khi login thành công và có token
    if (data.EC === 0 && data?.DT?.access_Token) {
      res.cookie('jwt', data.DT.access_Token, {
        httpOnly: true,
        maxAge: 60 * 60 * 1000,
      });

      return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT,
      });
    }

    return res.status(401).json({
      EM: data.EM,
      EC: data.EC,
      DT: data.DT,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      EM: 'error from server',
      EC: '-1',
      DT: '',
    });
  }
};

// 2. Logout (clear cookie jwt)
const handleLogout = async (req, res) => {
  try {
    // ✅ Xóa cookie jwt thật sự để Back/Next không vào lại được
    res.clearCookie('jwt', {
      httpOnly: true,
      path: '/', // quan trọng
    });

    return res.status(200).json({
      EM: 'Logout success',
      EC: 0,
      DT: '',
    });
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
        EC: '1',
        DT: '',
      });
    }

    // 1. Check global limits
    const globalLimitCheck = checkGlobalLimits(email);
    if (!globalLimitCheck.allowed) {
      return res.status(429).json({
        EM: globalLimitCheck.message,
        EC: '2',
        DT: '',
      });
    }

    // 2. Check rate limits for this email and IP
    const rateLimitCheck = checkRateLimit(email, clientIp);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        EM: rateLimitCheck.message,
        EC: '2',
        DT: '',
      });
    }

    // 3. Verify user exists
    const user = await db.User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({
        EM: 'Email không tồn tại trong hệ thống',
        EC: '1',
        DT: '',
      });
    }

    // 4. Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = Date.now() + (10 * 60 * 1000); // 10 minutes

    // Store OTP
    otpStorage.set(email, { otp, expires: otpExpires });

    // 5. Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Mã OTP đặt lại mật khẩu - GFMS',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Đặt lại mật khẩu</h2>
          <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản GFMS.</p>
          <p>Mã OTP của bạn là:</p>
          <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 3px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #666;">Mã này có hiệu lực trong 10 phút.</p>
          <p style="color: #666;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
          <hr style="margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">GFMS - Gym Franchise Management System</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    // 6. Update rate limits
    updateRateLimit(email, clientIp);

    return res.status(200).json({
      EM: 'OTP đã được gửi đến email của bạn',
      EC: '0',
      DT: { email },
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      EM: 'Lỗi server khi gửi OTP',
      EC: '-1',
      DT: '',
    });
  }
};

// 4. Verify OTP
const handleVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        EM: 'Email và OTP là bắt buộc',
        EC: '1',
        DT: '',
      });
    }

    const storedData = otpStorage.get(email);
    if (!storedData) {
      return res.status(400).json({
        EM: 'OTP không tồn tại hoặc đã hết hạn',
        EC: '1',
        DT: '',
      });
    }

    if (Date.now() > storedData.expires) {
      otpStorage.delete(email);
      return res.status(400).json({
        EM: 'OTP đã hết hạn',
        EC: '1',
        DT: '',
      });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({
        EM: 'OTP không chính xác',
        EC: '1',
        DT: '',
      });
    }

    return res.status(200).json({
      EM: 'OTP hợp lệ',
      EC: '0',
      DT: { email },
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      EM: 'Lỗi server khi verify OTP',
      EC: '-1',
      DT: '',
    });
  }
};

// 5. Reset Password
const handleResetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({
        EM: 'Email và mật khẩu mới là bắt buộc',
        EC: '1',
        DT: '',
      });
    }

    const data = await authService.resetPassword(email, newPassword);

    // Clear OTP after successful reset
    if (data.EC === 0) {
      otpStorage.delete(email);
    }

    return res.status(200).json({
      EM: data.EM,
      EC: data.EC,
      DT: data.DT,
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      EM: 'Lỗi server khi reset password',
      EC: '-1',
      DT: '',
    });
  }
};

// Check Rate Limit Status (for monitoring)
const handleCheckRateLimit = async (req, res) => {
  try {
    resetDailyStats();
    return res.status(200).json({
      EM: 'Rate limit status',
      EC: '0',
      DT: {
        totalEmailsToday: stats.totalEmailsToday,
        uniqueRecipientsToday: stats.uniqueRecipientsToday.size,
        maxTotalEmailsPerDay: RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY,
        maxUniqueRecipientsPerDay: RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY,
        todayDate: stats.todayDate
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      EM: 'Error checking rate limit',
      EC: '-1',
      DT: ''
    });
  }
};

module.exports = {
  handleRegister,
  handleLogin,
  handleLogout,
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
