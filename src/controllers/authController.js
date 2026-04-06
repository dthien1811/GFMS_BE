import authService from "../service/authService";
const crypto = require("crypto");
const { safeSend } = require("../utils/mailer");
const db = require("../models/index");
const bcrypt = require("bcryptjs");

// ==================== GLOBAL RATE LIMITING CONFIG ====================
const RATE_LIMITS_CONFIG = {
  // GIỚI HẠN TỔNG CỦA HỆ THỐNG
  MAX_TOTAL_EMAILS_PER_DAY: 400, // dưới 500 để dự phòng Gmail limit
  MAX_UNIQUE_RECIPIENTS_PER_DAY: 150, // số người nhận khác nhau mỗi ngày

  // GIỚI HẠN CHO TỪNG EMAIL (chống spam)
  MAX_OTP_REQUESTS_PER_HOUR_PER_EMAIL: 5, // tối đa 5 OTP/giờ cho 1 email
  MAX_OTP_REQUESTS_PER_DAY_PER_EMAIL: 10, // tối đa 10 OTP/ngày cho 1 email
  MIN_SECONDS_BETWEEN_OTP: 30, // tối thiểu 30s giữa 2 lần request OTP cùng email

  // GIỚI HẠN CHO IP ADDRESS (chống bot)
  MAX_OTP_REQUESTS_PER_HOUR_PER_IP: 10, // tối đa 10 OTP/giờ cho 1 IP
  MAX_OTP_REQUESTS_PER_DAY_PER_IP: 20, // tối đa 20 OTP/ngày cho 1 IP
};

// ==================== GLOBAL TRACKING VARIABLES ====================
let stats = {
  totalEmailsToday: 0,
  uniqueRecipientsToday: new Set(),
  todayDate: getTodayDateString(), // YYYY-MM-DD
  dailyResetTime: null,
};

let rateLimits = new Map(); // Map để track từng email/IP
let otpStorage = new Map(); // Store OTP temporarily

// ==================== HELPER FUNCTIONS ====================
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function getTodayDateString() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function getCurrentHour() {
  return new Date().getHours();
}

function initializeDailyStats() {
  const today = getTodayDateString();
  const now = new Date();

  if (stats.todayDate !== today) {
    stats.totalEmailsToday = 0;
    stats.uniqueRecipientsToday = new Set();
    stats.todayDate = today;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    stats.dailyResetTime = tomorrow.getTime();

    // reset rateLimits mỗi ngày (đơn giản và hiệu quả)
    rateLimits.clear();

    console.log(`[Daily Stats] Reset cho ngày ${today}`);
  }
}

// ==================== RATE LIMITING FUNCTIONS ====================
const checkRateLimits = (email, clientIp) => {
  const now = Date.now();
  const today = getTodayDateString();
  const currentHour = getCurrentHour();

  initializeDailyStats();

  // 1) TỔNG EMAIL/NGÀY (global)
  if (stats.totalEmailsToday >= RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY) {
    return {
      allowed: false,
      message: `Hệ thống đã đạt giới hạn ${RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY} email/ngày. Vui lòng thử lại ngày mai.`,
      code: "GLOBAL_DAILY_LIMIT",
    };
  }

  // 2) UNIQUE RECIPIENTS/NGÀY (global)
  if (
    stats.uniqueRecipientsToday.size >= RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY &&
    !stats.uniqueRecipientsToday.has(email)
  ) {
    return {
      allowed: false,
      message: `Hệ thống đã đạt giới hạn người nhận khác nhau hôm nay (${stats.uniqueRecipientsToday.size}/${RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY}).`,
      code: "UNIQUE_RECIPIENTS_LIMIT",
    };
  }

  // 3) EMAIL DAILY LIMIT
  const emailDailyKey = `email_daily:${email}:${today}`;
  const emailDailyData = rateLimits.get(emailDailyKey) || { count: 0, firstRequest: now };

  // reset “cửa sổ” nếu quá 24h kể từ firstRequest
  if (now - emailDailyData.firstRequest > 24 * 60 * 60 * 1000) {
    emailDailyData.count = 0;
    emailDailyData.firstRequest = now;
  }

  if (emailDailyData.count >= RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_EMAIL) {
    return {
      allowed: false,
      message: `Email đã yêu cầu OTP quá nhiều hôm nay (${emailDailyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_EMAIL}). Vui lòng thử lại ngày mai.`,
      code: "EMAIL_DAILY_LIMIT",
    };
  }

  // 4) EMAIL HOURLY LIMIT
  const emailHourlyKey = `email_hourly:${email}:${today}:${currentHour}`;
  const emailHourlyData = rateLimits.get(emailHourlyKey) || { count: 0 };

  if (emailHourlyData.count >= RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_EMAIL) {
    return {
      allowed: false,
      message: `Email đã yêu cầu OTP quá nhiều trong giờ này (${emailHourlyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_EMAIL}). Vui lòng thử lại sau.`,
      code: "EMAIL_HOURLY_LIMIT",
    };
  }

  // 5) MIN INTERVAL giữa 2 lần gửi cho cùng email
  const lastSentKey = `email_last:${email}`;
  const lastSentTime = rateLimits.get(lastSentKey);
  if (lastSentTime && now - lastSentTime < RATE_LIMITS_CONFIG.MIN_SECONDS_BETWEEN_OTP * 1000) {
    const secondsLeft = Math.ceil(
      (RATE_LIMITS_CONFIG.MIN_SECONDS_BETWEEN_OTP * 1000 - (now - lastSentTime)) / 1000
    );
    return {
      allowed: false,
      message: `Vui lòng đợi ${secondsLeft} giây trước khi yêu cầu OTP mới.`,
      code: "EMAIL_INTERVAL_LIMIT",
    };
  }

  // 6) IP DAILY LIMIT
  const ipDailyKey = `ip_daily:${clientIp}:${today}`;
  const ipDailyData = rateLimits.get(ipDailyKey) || { count: 0 };

  if (ipDailyData.count >= RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_IP) {
    return {
      allowed: false,
      message: `IP của bạn đã gửi quá nhiều yêu cầu hôm nay (${ipDailyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_IP}).`,
      code: "IP_DAILY_LIMIT",
    };
  }

  // 7) IP HOURLY LIMIT
  const ipHourlyKey = `ip_hourly:${clientIp}:${today}:${currentHour}`;
  const ipHourlyData = rateLimits.get(ipHourlyKey) || { count: 0 };

  if (ipHourlyData.count >= RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_IP) {
    return {
      allowed: false,
      message: `IP của bạn đã gửi quá nhiều yêu cầu trong giờ này (${ipHourlyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_IP}).`,
      code: "IP_HOURLY_LIMIT",
    };
  }

  return { allowed: true };
};

const updateRateLimits = (email, clientIp) => {
  const now = Date.now();
  const today = getTodayDateString();
  const currentHour = getCurrentHour();

  initializeDailyStats();

  // update global
  stats.totalEmailsToday++;
  stats.uniqueRecipientsToday.add(email);

  // email daily
  const emailDailyKey = `email_daily:${email}:${today}`;
  const emailDailyData = rateLimits.get(emailDailyKey) || { count: 0, firstRequest: now };
  emailDailyData.count++;
  rateLimits.set(emailDailyKey, emailDailyData);

  // email hourly
  const emailHourlyKey = `email_hourly:${email}:${today}:${currentHour}`;
  const emailHourlyData = rateLimits.get(emailHourlyKey) || { count: 0 };
  emailHourlyData.count++;
  rateLimits.set(emailHourlyKey, emailHourlyData);

  // last sent
  rateLimits.set(`email_last:${email}`, now);

  // ip daily
  const ipDailyKey = `ip_daily:${clientIp}:${today}`;
  const ipDailyData = rateLimits.get(ipDailyKey) || { count: 0 };
  ipDailyData.count++;
  rateLimits.set(ipDailyKey, ipDailyData);

  // ip hourly
  const ipHourlyKey = `ip_hourly:${clientIp}:${today}:${currentHour}`;
  const ipHourlyData = rateLimits.get(ipHourlyKey) || { count: 0 };
  ipHourlyData.count++;
  rateLimits.set(ipHourlyKey, ipHourlyData);

  console.log(
    `[RateLimit] ${email} | Email(daily:${emailDailyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_EMAIL}, hourly:${emailHourlyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_EMAIL}) | IP(daily:${ipDailyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_DAY_PER_IP}, hourly:${ipHourlyData.count}/${RATE_LIMITS_CONFIG.MAX_OTP_REQUESTS_PER_HOUR_PER_IP}) | Global:${stats.totalEmailsToday}/${RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY}`
  );
};

// ==================== CLEANUP TASKS ====================
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

  if (deletedCount > 0) console.log(`[OTP Cleanup] Đã xóa ${deletedCount} OTP hết hạn`);
}, 5 * 60 * 1000);

// Dọn rateLimits cũ mỗi giờ (optional)
setInterval(() => {
  const now = Date.now();
  const twoDaysAgo = now - 48 * 60 * 60 * 1000;
  let cleanedCount = 0;

  for (const [key, value] of rateLimits.entries()) {
    if (typeof value === "object" && value.firstRequest && value.firstRequest < twoDaysAgo) {
      rateLimits.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) console.log(`[RateLimit Cleanup] Đã dọn ${cleanedCount} bản ghi cũ`);
}, 60 * 60 * 1000);

// ==================== API HANDLERS ====================

// 1) Register
const handleRegister = async (req, res) => {
  try {
    if (!req.body.email || !req.body.phone || !req.body.password || !req.body.username) {
      return res.status(200).json({ EM: "Missing required fields", EC: 1, DT: "" });
    }

    const data = await authService.registerNewUser(req.body);

    // giữ style trả về 200 như code gốc của bạn
    return res.status(200).json({
      EM: data.EM,
      EC: data.EC,
      DT: data.DT,
    });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ EM: "error from server", EC: -1, DT: "" });
  }
};

// 2) Login
const handleLogin = async (req, res) => {
  try {
    if (!req.body.email || !req.body.password) {
      return res.status(400).json({ EM: "Missing required fields", EC: 1, DT: "" });
    }

    const data = await authService.loginUser(req.body);

    const token = data?.DT?.accessToken;
    if (data.EC === 0 && token) {
      res.cookie("jwt", token, { httpOnly: true, maxAge: 60 * 60 * 1000 });
    }

    if (data.EC === 0) return res.status(200).json({ EM: data.EM, EC: data.EC, DT: data.DT });

    return res.status(401).json({ EM: data.EM, EC: data.EC, DT: data.DT });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ EM: "error from server", EC: -1, DT: "" });
  }
};

// 2.4) Login with Google (ID token từ @react-oauth/google)
const handleGoogleLogin = async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ EM: "Missing Google credential", EC: 1, DT: "" });
    }

    const data = await authService.loginWithGoogle({ credential });

    const token = data?.DT?.accessToken;
    if (data.EC === 0 && token) {
      res.cookie("jwt", token, { httpOnly: true, maxAge: 60 * 60 * 1000 });
    }

    if (data.EC === 0) {
      return res.status(200).json({ EM: data.EM, EC: data.EC, DT: data.DT });
    }

    if (data.EC === 2) {
      return res.status(403).json({ EM: data.EM, EC: data.EC, DT: data.DT });
    }

    return res.status(401).json({ EM: data.EM, EC: data.EC, DT: data.DT });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ EM: "error from server", EC: -1, DT: "" });
  }
};

// 2.5) Logout
const handleLogout = async (req, res) => {
  try {
    res.clearCookie("jwt", { httpOnly: true, path: "/" });
    return res.status(200).json({ EM: "Logout success", EC: 0, DT: "" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ EM: "error from server", EC: -1, DT: "" });
  }
};

// 3) Gửi OTP để reset password
const handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const clientIp = req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress;

    if (!email) return res.status(400).json({ EM: "Email là bắt buộc", EC: 1, DT: "" });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ EM: "Email không hợp lệ", EC: 1, DT: "" });
    }

    // rate limit
    const limitCheck = checkRateLimits(email, clientIp);
    if (!limitCheck.allowed) {
      return res.status(429).json({ EM: limitCheck.message, EC: 2, DT: { code: limitCheck.code } });
    }

    // verify user exists
    const user = await db.User.findOne({ where: { email } });
    if (!user) {
      // Enterprise hardening: tránh lộ thông tin tồn tại email (user enumeration)
      return res.status(200).json({
        EM: "Nếu email tồn tại trong hệ thống, mã OTP sẽ được gửi. Vui lòng kiểm tra hộp thư (cả Spam).",
        EC: 0,
        DT: { email },
      });
    }

    // generate + store OTP (10 phút)
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    otpStorage.set(email, {
      otp,
      expiresAt,
      verified: false,
      createdAt: new Date(),
      ip: clientIp,
      attempts: 0,
    });

    // send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Mã OTP đặt lại mật khẩu - GFMS",
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
      `,
    };

    let mailResult = null;
    try {
      mailResult = await safeSend({
        to: email,
        subject: mailOptions.subject,
        html: mailOptions.html,
      });
    } catch (e) {
      // DEV fallback: nếu mail lỗi thì vẫn cho test bằng OTP trả về
      if (String(process.env.NODE_ENV || "development").toLowerCase() !== "production") {
        console.warn("[ForgotPassword] Mail send failed (dev fallback).", e?.message || e);
        return res.status(200).json({
          EM: "Môi trường dev: email không gửi được. Dùng OTP trong phản hồi để test.",
          EC: 0,
          DT: { email, otp, devOnly: true },
        });
      }

      return res.status(500).json({
        EM: "Không thể gửi email OTP. Vui lòng thử lại sau hoặc liên hệ quản trị viên.",
        EC: -1,
        DT: "",
      });
    }

    // Nếu MAIL_ENABLED=false → safeSend sẽ skipped
    if (mailResult?.skipped) {
      if (String(process.env.NODE_ENV || "development").toLowerCase() !== "production") {
        return res.status(200).json({
          EM: "Môi trường dev: hệ thống email đang tắt. Dùng OTP trong phản hồi để test.",
          EC: 0,
          DT: { email, otp, devOnly: true },
        });
      }

      return res.status(500).json({
        EM: "Hệ thống email đang tạm ngưng. Vui lòng thử lại sau.",
        EC: -1,
        DT: "",
      });
    }

    // update rate limits sau khi gửi thành công
    updateRateLimits(email, clientIp);

    return res.status(200).json({
      EM: "OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (cả Spam).",
      EC: 0,
      DT: { email },
    });
  } catch (error) {
    console.error("[Forgot Password Error]:", error);
    return res.status(500).json({ EM: "Lỗi server khi gửi OTP", EC: -1, DT: "" });
  }
};

// 4) Verify OTP
const handleVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) return res.status(400).json({ EM: "Email và OTP là bắt buộc", EC: 1, DT: "" });
    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      return res.status(400).json({ EM: "OTP phải là 6 chữ số", EC: 1, DT: "" });
    }

    const storedData = otpStorage.get(email);
    if (!storedData) return res.status(400).json({ EM: "OTP không tồn tại hoặc đã hết hạn", EC: 1, DT: "" });

    // attempts (tối đa 5)
    storedData.attempts = (storedData.attempts || 0) + 1;
    otpStorage.set(email, storedData);

    if (storedData.attempts > 5) {
      otpStorage.delete(email);
      return res.status(400).json({
        EM: "OTP đã bị khóa do quá nhiều lần thử sai. Vui lòng yêu cầu mã mới",
        EC: 1,
        DT: "",
      });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStorage.delete(email);
      return res.status(400).json({ EM: "OTP đã hết hạn. Vui lòng yêu cầu mã mới", EC: 1, DT: "" });
    }

    if (storedData.otp !== otp) {
      const attemptsLeft = 5 - storedData.attempts;
      return res.status(400).json({
        EM: `OTP không chính xác. Bạn còn ${attemptsLeft} lần thử`,
        EC: 1,
        DT: { attemptsLeft },
      });
    }

    storedData.verified = true;
    storedData.verifiedAt = new Date();
    otpStorage.set(email, storedData);

    return res.status(200).json({
      EM: "OTP hợp lệ. Vui lòng đặt mật khẩu mới.",
      EC: 0,
      DT: { email, verified: true, expiresAt: storedData.expiresAt },
    });
  } catch (error) {
    console.error("[Verify OTP Error]:", error);
    return res.status(500).json({ EM: "Có lỗi xảy ra khi xác thực OTP", EC: -1, DT: "" });
  }
};

// 5) Reset Password (đặt mật khẩu mới)
const handleResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ EM: "Email, OTP và mật khẩu mới là bắt buộc", EC: 1, DT: "" });
    }

    const storedData = otpStorage.get(email);
    if (!storedData) return res.status(400).json({ EM: "Phiên đặt lại mật khẩu không tồn tại", EC: 1, DT: "" });

    if (Date.now() > storedData.expiresAt) {
      otpStorage.delete(email);
      return res.status(400).json({ EM: "OTP đã hết hạn. Vui lòng yêu cầu mã mới", EC: 1, DT: "" });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ EM: "OTP không chính xác", EC: 1, DT: "" });
    }

    if (!storedData.verified) {
      return res.status(400).json({ EM: "OTP chưa được xác thực. Vui lòng xác thực OTP trước", EC: 1, DT: "" });
    }

    // Hash mật khẩu mới
    const salt = bcrypt.genSaltSync(10);
    const hashPass = bcrypt.hashSync(newPassword, salt);

    // Update DB
    const [affectedRows] = await db.User.update({ password: hashPass }, { where: { email } });
    if (affectedRows === 0) {
      return res.status(404).json({ EM: "Không tìm thấy tài khoản", EC: 1, DT: "" });
    }

    // Xóa OTP sau khi đổi pass
    otpStorage.delete(email);

    return res.status(200).json({ EM: "Đổi mật khẩu thành công", EC: 0, DT: { email } });
  } catch (error) {
    console.error("[Reset Password Error]:", error);
    return res.status(500).json({ EM: "Lỗi server khi reset password", EC: -1, DT: "" });
  }
};

// Monitoring
const handleCheckRateLimit = async (req, res) => {
  try {
    initializeDailyStats();
    return res.status(200).json({
      EM: "Rate limit status",
      EC: 0,
      DT: {
        totalEmailsToday: stats.totalEmailsToday,
        uniqueRecipientsToday: stats.uniqueRecipientsToday.size,
        maxTotalEmailsPerDay: RATE_LIMITS_CONFIG.MAX_TOTAL_EMAILS_PER_DAY,
        maxUniqueRecipientsPerDay: RATE_LIMITS_CONFIG.MAX_UNIQUE_RECIPIENTS_PER_DAY,
        todayDate: stats.todayDate,
        otpStorageSize: otpStorage.size,
        rateLimitsSize: rateLimits.size,
      },
    });
  } catch (error) {
    console.error("[Check Rate Limit Error]:", error);
    return res.status(500).json({ EM: "Error checking rate limit", EC: -1, DT: "" });
  }
};

module.exports = {
  handleRegister,
  handleLogin,
  handleGoogleLogin,
  handleLogout,
  handleForgotPassword,
  handleVerifyOTP,
  handleResetPassword,
  handleCheckRateLimit,
  getStats: () => ({
    totalEmailsToday: stats.totalEmailsToday,
    uniqueRecipientsToday: stats.uniqueRecipientsToday.size,
    todayDate: stats.todayDate,
    otpStorageSize: otpStorage.size,
    rateLimitsSize: rateLimits.size,
  }),
};
