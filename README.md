# nodejs-jwt
Authenticate a Node ES6 API with JSON Web Tokens 

sequenlize
----
-Tạo mới : create
 await db.User.create({
          username: username,
          email: email,
          password: hashPass
   }); 
----
-READ : findAll
  let users = [];
    users = await db.User.findAll();
    return users;
-----
-
-----
DELETE : destroy
await db.User.destroy({
  where: { id: id }
})
-----
-getbyId:
const getUserById = async (id) => {
  try {
    let user = {};
    user = await db.User.findOne({
    where: { id: id }
  });
  return user.get({ plain: true })
  } catch (error) {
    console.log(">>> check error:", error)
  }
}
-----

https://sequelize.org/docs/v6/other-topics/migrations/

npx sequelize-cli model:generate --name User --attributes firstName:string,lastName:string,email:string

Câu lệnh tạo model (model là table )
—-

Thay đổi key value ở model user, migration ( 2 cnay phải luôn đồng nhất về attribute )

—-
Chạy migration để tạo db ( dùng code tạo db kh tạo thủ công)
npx sequelize-cli db:migrate ( Tạo migrate )
Sau khi tạo xong migration file thì đưa về dạng số ít database
npx sequelize-cli db:migrate:undo 

—-
seeder - generate fake data

Tạo seeder file
npx sequelize-cli seed:generate --name demo-user

Sau đó tự code tạo dữ liệu fake
Sau đó chạy lệnh để seed dữ liệu
npx sequelize-cli db:seed:all
=>KHI DÙNG MiGRATION TẤT CẢ ĐỀU QUY VỀ SỐ ÍT
---
https://sequelize.org/docs/v6/core-concepts/model-querying-basics/
all query
---
lpnd xtvd uidk owxy
pass mail