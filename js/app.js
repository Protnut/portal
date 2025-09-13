// app.js - OEM portal frontend (compat SDK)
// Requires: index.html includes firebase compat SDKs and firebase.initializeApp(firebaseConfig)
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ====================== TODO: 你需要編輯的參數 ======================
const ADMIN_EMAILS = ["rob@protnut.com"]; // <-- put one or more admin emails
const FREE_EMAIL_PROVIDERS = ["gmail.com","yahoo.com","hotmail.com","outlook.com","protonmail.com"]; // optional add more
const ALLOWED_TLD = ".com"; // 僅允許 .com 自動註冊；非 .com 的帳號要管理員手動新增
// =================================================================

// Workflow（可擴充 / 修改）
const WORKFLOW = ["uploaded", "dfm", "quoted", "po_received", "prototyping", "delivery"];
// human readable labels (可改中文描述)
const WORKFLOW_LABELS = {
  uploaded: "估價_上傳檔案",
  dfm: "公司進行 DFM",
  quoted: "公司完成報價",
  po_received: "客戶已上傳 PO",
  prototyping: "公司打樣中",
  delivery: "產品與檢驗報告交付"
};

// ---------- UI 元素 (假設 index.html 含這些 id) ----------
const suEmail = document.getElementById('su-email');
const suPw = document.getElementById('su-pw');
const btnSignup = document.getElementById('btn-signup');

const liEmail = document.getElementById('li-email');
const liPw = document.getElementById('li-pw');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const authMsg = document.getElementById('auth-msg');

const userArea = document.getElementById('user-area');
const userEmailEl = document.getElementById('user-email');
const userNote = document.getElementById('user-note');
const btnNewProject = document.getElementById('btn-new-project');
const btnViewProjects = document.getElementById('btn-view-projects');

const newProjectArea = document.getElementById('new-project-area');
const projTitle = document.getElementById('proj-title');
const projFile = document.getElementById('proj-file');
const btnCreateProject = document.getElementById('btn-create-project');

const projectsList = document.getElementById('projects-list');
const projectsContainer = document.getElementById('projects-container');

const adminArea = document.getElementById('admin-area');
const pendingList = document.getElementById('pending-list');
const adminProjects = document.getElementById('admin-projects');
const notificationsContainer = document.getElementById('notifications'); // optional place for admin to see notifications

// helpers
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

function isAdminEmail(email){
  return ADMIN_EMAILS.includes(String(email).toLowerCase());
}
function isFreeEmail(email){
  const lower = String(email).toLowerCase();
  return FREE_EMAIL_PROVIDERS.some(d => lower.endsWith('@'+d));
}
function isAllowedTld(email){
  // 簡單檢查 email domain 結尾是否為 ALLOWED_TLD
  const parts = String(email).split('@');
  if(parts.length !== 2) return false;
  return parts[1].toLowerCase().endsWith(ALLOWED_TLD.toLowerCase());
}

// find next workflow status
function nextStatus(curr){
  const idx = WORKFLOW.indexOf(curr);
  if(idx === -1) return curr;
  if(idx === WORKFLOW.length - 1) return curr;
  return WORKFLOW[idx + 1];
}

// ================ Signup ===================
btnSignup.onclick = async () => {
  const email = (suEmail.value || '').trim();
  const pw = suPw.value || '';
  if(!email || !pw){ alert('請填 email 與密碼'); return; }

  // 禁止免費信箱
  if(isFreeEmail(email)){
    alert('免費信箱（如 Gmail / Yahoo / Outlook 等）不得線上註冊。如需使用請聯絡管理員由管理員新增帳號。');
    return;
  }

  // 只允許 ALLOWED_TLD (.com) 自動註冊
  if(!isAllowedTld(email)){
    alert(`僅允許 ${ALLOWED_TLD} 公司信箱線上註冊。其他網域請聯絡管理員由管理員手動新增。`);
    return;
  }

  try{
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    await cred.user.sendEmailVerification();

    // create user doc (approved=false) - admin will approve later
    await db.collection('users').doc(cred.user.uid).set({
      email: email,
      approved: false,
      role: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // write a notification for admin (admin UI reads this)
    await db.collection('notifications').add({
      type: 'new_signup',
      email: email,
      uid: cred.user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'unread'
    });

    alert('註冊成功，已發送驗證信。請完成驗證並等待管理員審核。管理員會收到通知。');
    suEmail.value = ''; suPw.value = '';
  }catch(e){
    alert('註冊失敗：' + e.message);
  }
};

// ================ Login / Logout ===================
btnLogin.onclick = async () => {
  const email = (liEmail.value || '').trim();
  const pw = liPw.value || '';
  try{
    const { user } = await auth.signInWithEmailAndPassword(email, pw);
    if(!user.emailVerified){
      authMsg.innerText = '請先完成 Email 驗證';
      return;
    }
    // fetch user doc
    const ud = await db.collection('users').doc(user.uid).get();
    if(!ud.exists){
      authMsg.innerText = '帳號尚未建立資料，若為管理員請先在後台新增，或聯絡管理員';
      return;
    }
    const udata = ud.data();
    if(!udata.approved){
      authMsg.innerText = '帳號尚未審核通過，請等待管理員';
      return;
    }
    // setup UI
    setupUIForUser(user, udata);
  }catch(e){
    alert('登入失敗：' + e.message);
  }
};

btnLogout.onclick = async ()=>{
  await auth.signOut();
  location.reload();
};

// ================ Auth state change ===================
auth.onAuthStateChanged(async user => {
  if(!user){
    hide(userArea); hide(adminArea); hide(btnLogout);
    show(document.getElementById('signup-form')); show(document.getElementById('login-form'));
    return;
  }

  // ensure user doc exists: if missing and allowedTld -> create; otherwise sign out and alert
  const udRef = db.collection('users').doc(user.uid);
  const udSnap = await udRef.get();
  if(!udSnap.exists){
    // If user comes from allowed TLD, create doc (but approved=false)
    if(isAllowedTld(user.email) && !isFreeEmail(user.email)){
      await udRef.set({
        email: user.email,
        approved: false,
        role: 'customer',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      // also notify admins
      await db.collection('notifications').add({
        type: 'new_signup',
        email: user.email,
        uid: user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'unread'
      });
      alert('已建立帳號資料，請等待管理員審核。');
      await auth.signOut();
      location.reload();
      return;
    } else {
      // not allowed to auto-create -> sign out
      alert('此帳號無法自動建立資料，請聯絡管理員。');
      await auth.signOut();
      location.reload();
      return;
    }
  }

  const udata = udSnap.data();
  if(!udata.approved){
    alert('您的帳號尚未審核通過 (請稍候或聯絡管理員)。');
    await auth.signOut();
    location.reload();
    return;
  }

  setupUIForUser(user, udata);
});

// ================ UI & App functions ===================
async function setupUIForUser(user, udata){
  document.getElementById('auth-area').classList.add('hidden');
  show(btnLogout);
  show(userArea);
  userEmailEl.innerText = user.email;
  userNote.innerText = udata.role === 'admin' ? '（管理員）' : '';

  if(isAdminEmail(user.email) || udata.role === 'admin'){
    show(adminArea);
    loadPendingUsers();
    loadAllProjectsForAdmin();
    loadNotificationsForAdmin();
  } else {
    hide(adminArea);
  }

  // client UI controls
  btnNewProject.onclick = ()=> show(newProjectArea);
  btnViewProjects.onclick = ()=> {
    loadMyProjects();
    show(projectsList);
  };

  btnCreateProject.onclick = async () => {
    const title = (projTitle.value || '').trim();
    const file = projFile.files[0];
    if(!title || !file){ alert('請填案件名稱並選擇檔案'); return; }
    btnCreateProject.disabled = true;
    try{
      const pRef = await db.collection('projects').add({
        owner: user.uid,
        title: title,
        status: WORKFLOW[0], // 'uploaded'
        attachments: [],
        history: [{
          status: WORKFLOW[0],
          by: user.email,
          ts: firebase.firestore.FieldValue.serverTimestamp(),
          note: '客戶上傳估價檔'
        }],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const projectId = pRef.id;

      // upload to user-specific folder to match storage rules
      const uid = user.uid;
      const filePath = `user_uploads/${uid}/projects/${projectId}/${Date.now()}_${file.name}`;
      const storageRef = storage.ref().child(filePath);
      const uploadTask = storageRef.put(file);
      uploadTask.on('state_changed', null, err => { throw err; }, async ()=>{
        const url = await storageRef.getDownloadURL();
        await pRef.update({
          attachments: firebase.firestore.FieldValue.arrayUnion({
            name: file.name,
            storagePath: filePath,
            downloadUrl: url,
            type: 'estimate-file',
            uploadedBy: user.email,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
          }),
          // advance status to next (auto push to DFM)
          status: nextStatus(WORKFLOW[0]),
          history: firebase.firestore.FieldValue.arrayUnion({
            status: nextStatus(WORKFLOW[0]),
            by: 'system',
            ts: firebase.firestore.FieldValue.serverTimestamp(),
            note: '系統自動：上傳估價後進入下一階段'
          }),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // notify admins of new project
        await db.collection('notifications').add({
          type: 'new_project',
          projectId: projectId,
          ownerEmail: user.email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: 'unread'
        });

        alert('估價案件建立成功，狀態已移至下一階段（DFM）');
        projTitle.value=''; projFile.value='';
        loadMyProjects();
      });
    }catch(e){
      alert('建立失敗: '+e.message);
    }
    btnCreateProject.disabled = false;
  };
}

// ================ Projects (client) ===================
async function loadMyProjects(){
  projectsContainer.innerHTML = '讀取中...';
  const user = auth.currentUser;
  const q = await db.collection('projects').where('owner','==',user.uid).orderBy('createdAt','desc').get();
  if(q.empty){ projectsContainer.innerHTML = '<i>尚無案件</i>'; return; }
  projectsContainer.innerHTML = '';
  q.forEach(doc => {
    const d = doc.data(); const id = doc.id;
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `<strong>${d.title}</strong><br>Status: ${WORKFLOW_LABELS[d.status] || d.status}<br>
      <button onclick="viewProject('${id}')">檢視</button>`;
    projectsContainer.appendChild(div);
  });
}

window.viewProject = async function(projectId){
  const doc = await db.collection('projects').doc(projectId).get();
  if(!doc.exists){ alert('找不到案件'); return; }
  const d = doc.data();
  let html = `<h4>${d.title} — ${WORKFLOW_LABELS[d.status] || d.status}</h4>`;
  html += '<h5>歷史</h5><ul>';
  (d.history||[]).forEach(h=>{
    const time = h.ts ? new Date(h.ts.seconds*1000).toLocaleString() : '';
    html += `<li>${WORKFLOW_LABELS[h.status] || h.status} / ${h.by} / ${h.note||''} / ${time}</li>`;
  });
  html += '</ul>';
  html += '<h5>附件</h5><ul>';
  (d.attachments||[]).forEach(a=>{
    html += `<li>${a.name} - <a target="_blank" href="${a.downloadUrl}">下載</a> (${a.type})</li>`;
  });
  html += '</ul>';

  // 如果是 owner 且目前為 quoted，顯示 PO 上傳
  if(auth.currentUser.uid === d.owner){
    if(d.status === 'quoted'){
      html += `<h5>上傳 PO 單</h5>
        <input type="file" id="po-file-${projectId}"><br><button onclick="uploadPO('${projectId}')">上傳 PO</button>`;
    }
  }

  document.getElementById('projects-container').innerHTML = html;
  show(projectsList);
};

// 客戶上傳 PO（自動推進狀態）
window.uploadPO = async function(projectId){
  const f = document.getElementById(`po-file-${projectId}`).files[0];
  if(!f) { alert('請選擇檔案'); return; }
  try{
    const uid = auth.currentUser.uid;
    const path = `user_uploads/${uid}/projects/${projectId}/po_${Date.now()}_${f.name}`;
    const storageRef = storage.ref().child(path);
    await storageRef.put(f);
    const url = await storageRef.getDownloadURL();
    // update project: add attachment, set po_received then advance to prototyping
    await db.collection('projects').doc(projectId).update({
      attachments: firebase.firestore.FieldValue.arrayUnion({
        name: f.name,
        storagePath: path,
        downloadUrl: url,
        type: 'po',
        uploadedBy: auth.currentUser.email,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      }),
      status: nextStatus('po_received'), // move to prototyping
      history: firebase.firestore.FieldValue.arrayUnion({
        status: 'po_received',
        by: auth.currentUser.email,
        ts: firebase.firestore.FieldValue.serverTimestamp(),
        note: '客戶上傳 PO'
      }),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // notify admins
    await db.collection('notifications').add({
      type: 'po_uploaded',
      projectId: projectId,
      ownerEmail: auth.currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'unread'
    });
    alert('PO 已上傳，狀態已自動更新為打樣（prototyping）');
    loadMyProjects();
  }catch(e){ alert('PO 上傳失敗: '+e.message); }
};

// ================ Admin functions ===================
async function loadPendingUsers(){
  pendingList.innerHTML = '讀取中...';
  const q = await db.collection('users').where('approved','==',false).get();
  if(q.empty){ pendingList.innerHTML = '<i>無待審核帳號</i>'; return; }
  pendingList.innerHTML = '';
  q.forEach(doc=>{
    const d = doc.data(); const id = doc.id;
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `${d.email} <button onclick="approveUser('${id}')">核准</button>`;
    pendingList.appendChild(div);
  });
}
window.approveUser = async function(uid){
  if(!confirm('確定要核准嗎？')) return;
  await db.collection('users').doc(uid).update({ approved: true, role: 'customer', approvedAt: firebase.firestore.FieldValue.serverTimestamp() });
  // notify the user (push a notification doc)
  await db.collection('notifications').add({
    type: 'approved_user',
    uid: uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'unread'
  });
  alert('已核准');
  loadPendingUsers();
  loadAllProjectsForAdmin();
};

async function loadAllProjectsForAdmin(){
  adminProjects.innerHTML = '讀取中...';
  const q = await db.collection('projects').orderBy('createdAt','desc').limit(100).get();
  if(q.empty){ adminProjects.innerHTML = '<i>無案件</i>'; return; }
  adminProjects.innerHTML = '';
  q.forEach(doc=>{
    const d = doc.data(); const id = doc.id;
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `<strong>${d.title}</strong><br>Owner: ${d.owner}<br>Status: ${WORKFLOW_LABELS[d.status] || d.status}
      <br><button onclick="adminViewProject('${id}')">檢視 / 上傳報價 / 改狀態</button>`;
    adminProjects.appendChild(div);
  });
}

window.adminViewProject = async function(pid){
  const doc = await db.collection('projects').doc(pid).get();
  if(!doc.exists){ alert('找不到'); return; }
  const d = doc.data();
  let html = `<h4>${d.title} — ${WORKFLOW_LABELS[d.status] || d.status}</h4>`;
  html += '<h5>附件</h5><ul>';
  (d.attachments||[]).forEach(a=> html += `<li>${a.name} - <a target="_blank" href="${a.downloadUrl}">下載</a> (${a.type})</li>`);
  html += '</ul>';
  html += `<h5>上傳報價單或檢驗報告</h5>
    <select id="admin-new-type">
      <option value="quotation">報價單</option>
      <option value="process-photo">製程照片</option>
      <option value="inspection-report">檢驗報告</option>
    </select><br><input type="file" id="admin-file"><br>
    <button onclick="adminUpload('${pid}')">上傳並設定狀態</button>
    <h5>手動改狀態</h5>
    <select id="admin-set-status">
      ${WORKFLOW.map(s => `<option value="${s}">${WORKFLOW_LABELS[s]||s}</option>`).join('')}
    </select>
    <button onclick="adminSetStatus('${pid}')">變更狀態</button>
    `;
  document.getElementById('admin-projects').innerHTML = html;
};

window.adminUpload = async function(pid){
  const f = document.getElementById('admin-file').files[0];
  const type = document.getElementById('admin-new-type').value;
  if(!f){ alert('請選檔案'); return; }
  // upload to admin folder
  const path = `admin_uploads/${pid}/${Date.now()}_${f.name}`;
  const storageRef = storage.ref().child(path);
  await storageRef.put(f);
  const url = await storageRef.getDownloadURL();
  await db.collection('projects').doc(pid).update({
    attachments: firebase.firestore.FieldValue.arrayUnion({
      name: f.name, storagePath: path, downloadUrl: url, type: type,
      uploadedBy: auth.currentUser.email, uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    }),
    // 若上傳報價單，改為 quoted (可按需調整)
    status: type === 'quotation' ? 'quoted' : firebase.firestore.FieldValue.delete(),
    history: firebase.firestore.FieldValue.arrayUnion({
      status: type, by: auth.currentUser.email, ts: firebase.firestore.FieldValue.serverTimestamp(), note: '管理員上傳'
    }),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  // notify owner
  await db.collection('notifications').add({
    type: type === 'quotation' ? 'quote_uploaded' : 'report_uploaded',
    projectId: pid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'unread'
  });
  alert('上傳完成');
  loadAllProjectsForAdmin();
};

window.adminSetStatus = async function(pid){
  const s = document.getElementById('admin-set-status').value;
  await db.collection('projects').doc(pid).update({
    status: s,
    history: firebase.firestore.FieldValue.arrayUnion({
      status: s, by: auth.currentUser.email, ts: firebase.firestore.FieldValue.serverTimestamp(), note: '管理員手動設置'
    }),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('狀態已更新');
  loadAllProjectsForAdmin();
};

// ================ Notifications for Admin (simple) ===================
async function loadNotificationsForAdmin(){
  if(!notificationsContainer) return;
  const q = await db.collection('notifications').where('status','==','unread').orderBy('createdAt','desc').get();
  if(q.empty){ notificationsContainer.innerHTML = '<i>無新通知</i>'; return; }
  let html = '';
  q.forEach(doc=>{
    const d = doc.data(); html += `<div class="card">${d.type} - ${d.email || d.ownerEmail || d.projectId || ''} - ${d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString() : ''} <button onclick="markNotificationRead('${doc.id}')">標示已讀</button></div>`;
  });
  notificationsContainer.innerHTML = html;
}
window.markNotificationRead = async function(nid){
  await db.collection('notifications').doc(nid).update({ status: 'read', readAt: firebase.firestore.FieldValue.serverTimestamp() });
  loadNotificationsForAdmin();
};
