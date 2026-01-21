# 🚀 Hướng dẫn chạy Seeder tạo gói test PayOS

## 📋 Tổng quan

Seeder này sẽ tạo **3 gói tập test** để bạn test chức năng thanh toán PayOS:
- **PayOS Test - Gói 1 Tháng**: 500,000 VNĐ, 8 buổi PT
- **PayOS Test - Gói 3 Tháng**: 1,500,000 VNĐ, 20 buổi PT  
- **PayOS Test - Gói Rẻ**: 100,000 VNĐ, 4 buổi PT (để test nhanh)

---

## 🔧 Cách chạy Seeder

### Option 1: Chạy seeder riêng lẻ (Khuyến nghị)

```bash
cd GFMS_BE
npx sequelize-cli db:seed --seed 40-demo-package-payos-test.js
```

**Kết quả:**
```
[Seeder] ✅ Đã tạo 3 gói test PayOS thành công!
   - PayOS Test - Gói 1 Tháng (500k, 8 buổi)
   - PayOS Test - Gói 3 Tháng (1.5M, 20 buổi)
   - PayOS Test - Gói Rẻ (100k, 4 buổi)
```

### Option 2: Chạy tất cả seeders

```bash
cd GFMS_BE
npx sequelize-cli db:seed:all
```

⚠️ **Lưu ý:** Sẽ chạy tất cả seeders, có thể tạo duplicate data nếu đã chạy trước đó.

### Option 3: Undo seeder (xóa gói test)

```bash
cd GFMS_BE
npx sequelize-cli db:seed:undo --seed 40-demo-package-payos-test.js
```

---

## ✅ Kiểm tra sau khi chạy

### 1. Kiểm tra Database

```sql
-- Xem các gói test PayOS
SELECT 
  id,
  name,
  price,
  sessions,
  durationDays,
  gymId,
  isActive,
  status
FROM Package
WHERE name LIKE '%PayOS Test%'
ORDER BY price ASC;
```

**Kỳ vọng:** 3 gói với giá 100k, 500k, 1.5M

### 2. Kiểm tra trên Frontend

1. **Đăng nhập với tài khoản Member**
2. **Vào trang:** `/member/packages`
3. **Kiểm tra:** 3 gói test PayOS hiển thị với nút "Mua gói"

---

## 🎯 Sử dụng gói test

### Test với gói rẻ nhất (100k):

1. Vào `/member/packages`
2. Tìm gói **"PayOS Test - Gói Rẻ (100k)"**
3. Click **"Mua gói"** → Chọn **PayOS** → Xác nhận
4. Thanh toán trên PayOS (sandbox mode)
5. Kiểm tra webhook và kích hoạt gói

### Test với gói trung bình (500k):

- Tương tự, nhưng dùng gói **"PayOS Test - Gói 1 Tháng"**

---

## 🐛 Troubleshooting

### Lỗi: "Table 'Package' doesn't exist"

**Nguyên nhân:** Chưa chạy migrations

**Giải pháp:**
```bash
npx sequelize-cli db:migrate
```

### Lỗi: "Gym not found"

**Nguyên nhân:** Chưa có Gym trong database

**Giải pháp:**
```bash
# Chạy seeder Gym trước
npx sequelize-cli db:seed --seed 09-demo-gym.js
```

### Lỗi: "Duplicate entry"

**Nguyên nhân:** Đã chạy seeder trước đó

**Giải pháp:**
```bash
# Xóa gói test cũ
npx sequelize-cli db:seed:undo --seed 40-demo-package-payos-test.js

# Chạy lại
npx sequelize-cli db:seed --seed 40-demo-package-payos-test.js
```

---

## 📝 Lưu ý

1. **GymId:** Seeder tự động lấy `gymId` đầu tiên từ database. Nếu bạn có nhiều gym, có thể chỉnh trong file seeder.

2. **Giá test:** 
   - Gói 100k: Để test nhanh, không tốn nhiều tiền
   - Gói 500k: Giá trung bình, test thực tế hơn
   - Gói 1.5M: Giá cao, test với số tiền lớn

3. **isActive = true:** Tất cả gói test đều `isActive = true` để hiển thị trên FE.

4. **Tránh duplicate:** Seeder có check để không tạo duplicate nếu đã chạy trước đó.

---

## 🔄 Reset và chạy lại

Nếu muốn reset hoàn toàn:

```bash
# 1. Xóa gói test cũ
npx sequelize-cli db:seed:undo --seed 40-demo-package-payos-test.js

# 2. Chạy lại
npx sequelize-cli db:seed --seed 40-demo-package-payos-test.js
```

---

## ✅ Checklist

- [ ] Đã chạy migrations (`db:migrate`)
- [ ] Đã có Gym trong database
- [ ] Đã chạy seeder: `npx sequelize-cli db:seed --seed 40-demo-package-payos-test.js`
- [ ] Đã kiểm tra database có 3 gói test
- [ ] Đã kiểm tra FE hiển thị gói test
- [ ] Sẵn sàng test thanh toán PayOS!
