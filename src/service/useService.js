import bcrypt from 'bcryptjs';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync("B4c0/\/", salt);
import mysql  from 'mysql2/promise';
const bluebird = require('bluebird');
import db from '../models/index.js';
// create the connection to database
//bluebird giúp async hóa các hàm callback tức là chạy từng dòng 1
const hashPassword = (userPassword)=>
{
     let hashUserPassword = bcrypt.hashSync(userPassword, salt);
    // let check = bcrypt.compareSync (password, hashPassword); // true
    return hashUserPassword;
}
const createNewUser = async (email, password, username) =>{
    let hashPass = hashPassword (password);
    try {
      await db.User.create({
          username: username,
          email: email,
          password: hashPass
   }); 
    } catch (error) {
      
      console.log(">>> check error:", error)
    }
}
const getUserList = async () => {
    try {
    let newUser = await db.User.findOne({
  where: { id: 1 },
  attributes: ["id", "username", "email"],
  include: { model: db.Group, attributes: ["name", "description"] },
  raw: true,
  nest: true
})

    let r = await db.Role.findAll({
         include: {model: db.Group, where: { id: 1 }},
        raw: true,
         nest: true
      })
//Role và Group là mối quan hệ n-n nhờ vào bảng trung gian GroupRole nên lấy được dữ liệu
console.log(">>> check new users: ", newUser)
console.log(">>> check new g: ", r)
    let users = [];
    users = await db.User.findAll();
    return users;
  } catch (error) {
    console.log(">>> check error:", error)
  }
}
const deleteUser = async (id) => {  
  try {
  await db.User.destroy({
  where: { id: id }
  });
} catch (error) {
  console.log(">>> check error:", error)
}
}
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
const updateUserInfor = async (email, username, id) => {
    
    try {
    await db.User.update(
      { email: email, username: username },
      { where: { id: id } }
)
    } catch (error) {
        // Xử lý lỗi
        console.log(">>> check error: ", error);
    }
}
module.exports={
createNewUser,getUserList,deleteUser,getUserById,updateUserInfor
}