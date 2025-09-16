// /js/signup.js - 客戶註冊邏輯 (for contact.html)
const suEmail = document.getElementById('su-email');
const suPw = document.getElementById('su-pw');
const btnSignup = document.getElementById('btn-signup');

// 禁止的免費信箱清單
const FREE_EMAIL_PROVIDERS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "protonmail.com", "yahoo.com.tw"
];

// 允許的公司信箱結尾
const ALLOWED_TLDS = [".com", ".com.tw", ".net"];

// 檢查是否免費信箱
function isFreeEmail(email) {
  const lower = (email || "").toLowerCase();
  return FREE_EMAIL_PROVIDERS.some(p => lower.endsWith("@" + p));
}

// 檢查是否允許的網域
function isAllowedTld(email) {
  const parts = (email || "").split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase();
  return ALLOWED_TLDS.some(tld => domain.endsWith(tld));
}

// 註冊事件
btnSignup.onclick = async () => {
  const email = (suEmail.value || "").trim();
  const pw = suPw.value || "";

  if (!email || !pw) {
    alert("請填寫公司信箱與密碼");
    return;
  }

  if (isFreeEmail(email)) {
    alert("禁止免費信箱註冊，請改用公司信箱。如需協助請聯絡管理員。");
    return;
  }

  if (!isAllowedTld(email)) {
    alert("僅允許 .com / .com.tw / .net 公司信箱註冊，其他網域請聯絡管理員。");
    return;
  }

  try {
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, pw);

    // 發送驗證信
    await cred.user.sendEmailVerification();

    // 建立 user 文件
    await firebase.firestore().collection("users").doc(cred.user.uid).set({
      email: email,
      approved: false,
      role: "customer",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 新增通知 (讓管理員收到提醒)
    await firebase.firestore().collection("notifications").add({
      type: "new_signup",
      email: email,
      uid: cred.user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "unread"
    });

    alert("註冊成功！已寄出驗證信，請完成驗證並等待管理員審核。審核通過後，即可登入 Portal 系統。");
    suEmail.value = "";
    suPw.value = "";

  } catch (e) {
    console.error(e);
    alert("註冊失敗：" + e.message);
  }
};