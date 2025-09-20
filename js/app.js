// /js/app.js - fixed version_0917
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ---------- config ----------
const ADMIN_EMAILS = ["rob@protnut.com"]; 
const FREE_EMAIL_PROVIDERS = ["gmail.com","yahoo.com","hotmail.com","outlook.com","protonmail.com","yahoo.com.tw"];
const ALLOWED_TLDS = [".com", ".com.tw", ".net"];
// --------------------------------------------------------

// workflow
const WORKFLOW = ["uploaded", "dfm", "quoted", "po_received", "prototyping", "delivery"];
const WORKFLOW_LABELS = {
  uploaded: "估價_上傳檔案",
  dfm: "公司進行 DFM",
  quoted: "公司完成報價",
  po_received: "客戶已上傳 PO",
  prototyping: "公司打樣中",
  delivery: "產品與檢驗報告交付"
};

// UI 元件
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
const notificationsContainer = document.getElementById('notifications');

// helpers
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

function isAdmin(udata) {
  return udata && udata.role === 'admin';
}
function isFreeEmail(email){
  const lower = String(email || '').toLowerCase();
  return FREE_EMAIL_PROVIDERS.some(d => lower.endsWith('@'+d));
}
function isAllowedTld(email){
  const parts = String(email || '').split('@');
  if(parts.length !== 2) return false;
  const domain = parts[1].toLowerCase();
  return ALLOWED_TLDS.some(t => domain.endsWith(t));
}

function nextStatus(curr){
  const idx = WORKFLOW.indexOf(curr);
  if(idx === -1) return curr;
  if(idx === WORKFLOW.length - 1) return curr;
  return WORKFLOW[idx + 1];
}

// 新增: 驗證檔案（禁止.exe）
window.validateFiles = function(input) {
  const files = input.files;
  for (let file of files) {
    if (file.name.endsWith('.exe')) {
      alert('禁止上傳.exe檔案');
      input.value = ''; // 清空輸入
      return;
    }
  }
};

// ================ Signup ===================
if(btnSignup){
  btnSignup.onclick = async () => {
    const email = (suEmail.value || '').trim();
    const pw = suPw.value || '';
    if(!email || !pw){ alert('請填 email 與密碼'); return; }

    if(isFreeEmail(email)){
      alert('免費信箱不得註冊');
      return;
    }
    if(!isAllowedTld(email)){
      alert(`僅允許 ${ALLOWED_TLDS.join(', ')} 公司信箱`);
      return;
    }

    try{
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      await cred.user.sendEmailVerification();

      await db.collection('users').doc(cred.user.uid).set({
        email: email,
        approved: false,
        role: 'customer',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await db.collection('notifications').add({
        type: 'new_signup',
        email: email,
        uid: cred.user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'unread'
      });

      alert('註冊成功，請驗證 Email 並等待管理員審核');
      suEmail.value = ''; suPw.value = '';
    }catch(e){
      alert('註冊失敗：' + e.message);
    }
  };
}

// ================ Login ===================
if(btnLogin){
  btnLogin.onclick = async () => {
    const email = (liEmail.value || '').trim();
    const pw = liPw.value || '';
    try{
      const { user } = await auth.signInWithEmailAndPassword(email, pw);
      if(!user.emailVerified){
        authMsg.innerText = '請先完成 Email 驗證';
        await auth.signOut();
        return;
      }
      const ud = await db.collection('users').doc(user.uid).get();
      if(!ud.exists){
        authMsg.innerText = '帳號資料不存在';
        await auth.signOut();
        return;
      }
      const udata = ud.data();
      if(!udata.approved){
        authMsg.innerText = '帳號尚未審核通過';
        await auth.signOut();
        return;
      }
      setupUIForUser(user, udata);
    }catch(e){
      alert('登入失敗：' + e.message);
    }
  };
}

if(btnLogout){
  btnLogout.onclick = async ()=>{ await auth.signOut(); location.reload(); };
}

// ================ Auth state change ===================
auth.onAuthStateChanged(async user => {
  if(!user){
    hide(userArea); hide(adminArea); hide(btnLogout);
    show(document.getElementById('signup-form')); show(document.getElementById('login-form'));
    return;
  }

  const udRef = db.collection('users').doc(user.uid);
  const udSnap = await udRef.get();
  if(!udSnap.exists){
    await udRef.set({
      email: user.email,
      approved: false,
      role: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('notifications').add({
      type: 'new_signup',
      email: user.email,
      uid: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'unread'
    });
    alert('帳號資料已建立，請等待管理員審核');
    await auth.signOut();
    location.reload();
    return;
  }

  const udata = udSnap.data();
  if(!udata.approved){
    alert('您的帳號尚未審核通過');
    await auth.signOut();
    location.reload();
    return;
  }

  setupUIForUser(user, udata);
});

// ================ UI & App functions ===================
async function setupUIForUser(user, udata) {
  document.getElementById('auth-area').classList.add('hidden');
  show(btnLogout);
  show(userArea);
  userEmailEl.innerText = user.email;
  userNote.innerText = udata.role === 'admin' ? '（管理員）' : '';

  if (isAdmin(udata)) { // 使用角色檢查
    show(adminArea);
    loadPendingUsers();
    loadAllProjectsForAdmin();
    loadNotificationsForAdmin();
  } else {
    hide(adminArea);
  }

  if(btnNewProject) btnNewProject.onclick = ()=> show(newProjectArea);
              // ✅ 登入後自動載入「我的專案」
          loadMyProjects();
          show(projectsList);
    if (btnCreateProject) {
      btnCreateProject.onclick = async () => {
        const title = (projTitle.value || '').trim();
        const files = document.getElementById('proj-files').files;
        if (!title || files.length === 0) { alert('請填名稱並選檔案'); return; }
        btnCreateProject.disabled = true;
        try {
          const pRef = await db.collection('projects').add({
            owner: user.uid,
            title: title,
            status: WORKFLOW[0],
            attachments: [],
            history: [{ status: WORKFLOW[0], by: user.email, ts: Date.now(), note: '客戶上傳估價檔' }],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          const projectId = pRef.id;
          const uid = user.uid;
          let attachments = [];

          // 多檔上傳迴圈
          for (let file of files) {
            const filePath = `user_uploads/${uid}/projects/${projectId}/${Date.now()}_${file.name}`;
            const storageRef = storage.ref().child(filePath);
            await storageRef.put(file); // 上傳檔案
            const url = await storageRef.getDownloadURL(); // 取下載URL
            attachments.push({
              name: file.name,
              storagePath: filePath,
              downloadUrl: url,
              type: 'estimate-file',
              uploadedBy: user.email,
              uploadedAt: Date.now()
            });
          }

          // 更新專案資料
          await pRef.update({
            attachments: attachments,
            status: nextStatus(WORKFLOW[0]),
            history: firebase.firestore.FieldValue.arrayUnion({
              status: nextStatus(WORKFLOW[0]), by: 'system', ts: Date.now(), note: '系統自動：上傳估價後進入下一階段'
            }),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          // 新增通知到DB（email在步驟3處理）
          await db.collection('notifications').add({
            type: 'new_project', projectId: projectId, ownerEmail: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), status: 'unread'
          });

          alert('專案建立成功');
          projTitle.value = ''; document.getElementById('proj-files').value = '';
          loadMyProjects(); // 自動載入並刷新清單
          show(projectsList); // 自動顯示"我的專案"區塊
        } catch (e) {
          alert('建立失敗: ' + e.message);
        }
        btnCreateProject.disabled = false;
      };
    };
}

// ================ Projects (client) ===================
async function loadMyProjects() {
  projectsContainer.innerHTML = '<p>讀取中...</p>';
  try {
    const user = auth.currentUser;
    const q = await db.collection('projects').where('owner', '==', user.uid).orderBy('createdAt', 'desc').get();
    if (q.empty) { 
      projectsContainer.innerHTML = '<i>尚無案件</i>'; 
      return; 
    }

    let html = `<table class="table table-striped table-hover">
      <thead><tr><th>標題</th><th>目前狀態</th><th>進度</th><th>附件下載</th><th>操作</th></tr></thead><tbody>`;
    q.forEach(doc => {
      const d = doc.data(); const id = doc.id;
      const progressIdx = WORKFLOW.indexOf(d.status);
      const progressPct = Math.round((progressIdx / (WORKFLOW.length - 1)) * 100);
      const attachmentsHtml = (d.attachments || []).map(a => `<a href="${a.downloadUrl}" target="_blank">${a.name} (${a.type})</a>`).join('<br>') || '-';

      html += `<tr>
        <td>${d.title}</td>
        <td>${WORKFLOW_LABELS[d.status] || d.status}</td>
        <td><div class="progress"><div class="progress-bar" style="width: ${progressPct}%">${progressPct}%</div></div></td>
        <td>${attachmentsHtml}</td>
        <td><button class="btn btn-sm btn-info" onclick="viewProject('${id}')">詳細檢視</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    projectsContainer.innerHTML = html;
  } catch (e) {
  console.error('載入專案失敗:', e.message, e.code, e);  // 詳細錯誤日誌
  let errorMsg = '載入失敗，請檢查網路或權限';
  if (e.code === 'permission-denied') {
    errorMsg = '權限不足，請確認規則設定';
  } else if (e.code === 'unavailable') {
    errorMsg = '網路問題，請重試';
  }
  projectsContainer.innerHTML = `<p class="text-danger">${errorMsg}</p>`;
}
}

// 詳細任務定義（誰負責 / 顯示名稱）
const WORKFLOW_DETAIL = {
  uploaded: { label: "客戶上傳估價檔", role: "customer" },
  dfm: { label: "公司進行 DFM", role: "admin" },
  quoted: { label: "公司完成報價", role: "admin" },
  po_received: { label: "客戶上傳 PO", role: "customer" },
  prototyping: { label: "公司打樣中", role: "admin" },
  delivery: { label: "產品與檢驗報告交付", role: "admin" }
};

// ================ 顯示專案（含流程表） ===================
window.viewProject = async function(projectId){
  const snap = await db.collection('projects').doc(projectId).get();
  if(!snap.exists){ alert('找不到案件'); return; }
  const d = snap.data();

  let html = `<h4>${d.title} — ${WORKFLOW_LABELS[d.status] || d.status}</h4>`;

  // 流程表
  html += `<table class="table table-dark table-bordered">
    <thead><tr>
      <th>任務</th><th>負責</th><th>狀態</th><th>附件</th><th>操作</th>
    </tr></thead><tbody>`;

  WORKFLOW.forEach(s=>{
    const wf = WORKFLOW_DETAIL[s];
    const idx = WORKFLOW.indexOf(s);
    const currIdx = WORKFLOW.indexOf(d.status);
    const done = idx < currIdx;
    const current = idx === currIdx;

    // 抓取該任務相關附件
    const files = (d.attachments||[])
      .filter(a => a.type === s 
                || (s==='uploaded' && a.type==='estimate-file')
                || (s==='quoted' && a.type==='quotation')
                || (s==='po_received' && a.type==='po')
                || (s==='delivery' && (a.type==='inspection-report' || a.type==='delivery')))
      .map(a=> `<a target="_blank" href="${a.downloadUrl}">${a.name}</a>` )
      .join('<br>');

    // 操作按鈕：只有當前任務、且是該角色負責人
    let action = '';
    if(current){
      if(wf.role==='customer' && auth.currentUser.uid===d.owner){
        // 客戶當前任務
        action = `<button class="btn btn-sm btn-success" onclick="completeTask('${projectId}','${s}')">確認完成</button>`;
      }
      if(wf.role==='admin' && isAdmin(auth.currentUser.email)){
        // 管理員當前任務
        action = `<button class="btn btn-sm btn-warning" onclick="completeTask('${projectId}','${s}')">確認完成</button>`;
      }
    }

    html += `<tr>
      <td>${wf.label}</td>
      <td>${wf.role==='customer'?'客戶':'公司'}</td>
      <td>${done? '✅ 完成' : current? '⏳ 進行中' : '❌ 未開始'}</td>
      <td>${files || '-'}</td>
      <td>${action}</td>
    </tr>`;
  });

  html += `</tbody></table>`;

  // 歷史紀錄
  html += '<h5>歷史紀錄</h5><ul>';
  (d.history||[]).forEach(h=>{
    const time = h.ts ? new Date(h.ts).toLocaleString() : '';
    html += `<li>${WORKFLOW_LABELS[h.status] || h.status} / ${h.by} / ${h.note||''} / ${time}</li>`;
  });
  html += '</ul>';

  document.getElementById('projects-container').innerHTML = html;
  show(projectsList);
}

// ================ 任務完成 ===================
window.completeTask = async function(pid, status){
  const docRef = db.collection('projects').doc(pid);
  const snap = await docRef.get();
  if(!snap.exists) return;
  const d = snap.data();
  const next = nextStatus(status);

  await docRef.update({
    status: next,
    history: firebase.firestore.FieldValue.arrayUnion({
      status: next,
      by: auth.currentUser.email,
      ts: Date.now(),
      note: '任務完成，自動進入下一階段'
    }),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await db.collection('notifications').add({
    type: 'task_completed',
    projectId: pid,
    completed: status,
    next: next,
    by: auth.currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'unread'
  });

  alert(`已完成「${WORKFLOW_LABELS[status]}」，進入「${WORKFLOW_LABELS[next]}」`);
  viewProject(pid);
};

window.uploadPO = async function(projectId){
  const f = document.getElementById(`po-file-${projectId}`).files[0];
  if(!f) { alert('請選擇檔案'); return; }
  try{
    const uid = auth.currentUser.uid;
    const path = `user_uploads/${uid}/projects/${projectId}/po_${Date.now()}_${f.name}`;
    const storageRef = storage.ref().child(path);
    await storageRef.put(f);
    const url = await storageRef.getDownloadURL();
    await db.collection('projects').doc(projectId).update({
      attachments: firebase.firestore.FieldValue.arrayUnion({
        name: f.name,
        storagePath: path,
        downloadUrl: url,
        type: 'po',
        uploadedBy: auth.currentUser.email,
        uploadedAt: Date.now()
      }),
      status: nextStatus('po_received'),
      history: firebase.firestore.FieldValue.arrayUnion({
        status: 'po_received',
        by: auth.currentUser.email,
        ts: Date.now(),
        note: '客戶上傳 PO'
      }),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('notifications').add({
      type: 'po_uploaded',
      projectId: projectId,
      ownerEmail: auth.currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'unread'
    });
    alert('PO 已上傳');
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
  await db.collection('users').doc(uid).update({ approved: true, role: 'customer', approvedAt: Date.now() });
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

// 新增: admin手動加用戶（給非允許域名）
window.adminAddUser = async function(email, pw) {
  if (!isAdmin(auth.currentUser.email)) { alert('僅管理員可操作'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    await db.collection('users').doc(cred.user.uid).set({
      email: email, approved: true, role: 'customer', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('用戶已手動加入');
  } catch (e) { alert('失敗: ' + e.message); }
};

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
  const path = `admin_uploads/${pid}/${Date.now()}_${f.name}`;
  const storageRef = storage.ref().child(path);
  await storageRef.put(f);
  const url = await storageRef.getDownloadURL();

  const updateObj = {
    attachments: firebase.firestore.FieldValue.arrayUnion({
      name: f.name, storagePath: path, downloadUrl: url, type: type,
      uploadedBy: auth.currentUser.email, uploadedAt: Date.now()
    }),
    history: firebase.firestore.FieldValue.arrayUnion({
      status: type, by: auth.currentUser.email, ts: Date.now(), note: '管理員上傳'
    }),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if(type === 'quotation'){
    updateObj.status = 'quoted';
  }
  await db.collection('projects').doc(pid).update(updateObj);

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
      status: s, by: auth.currentUser.email, ts: Date.now(), note: '管理員手動設置'
    }),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('狀態已更新');
  loadAllProjectsForAdmin();
};

// ================ Notifications ===================
async function loadNotificationsForAdmin(){
  if(!notificationsContainer) return;
  const q = await db.collection('notifications').where('status','==','unread').orderBy('createdAt','desc').get();
  if(q.empty){ notificationsContainer.innerHTML = '<i>無新通知</i>'; return; }
  let html = '';
  q.forEach(doc=>{
    const d = doc.data();
    html += `<div class="card">${d.type} - ${d.email || d.ownerEmail || d.projectId || ''} - ${d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString() : ''} <button onclick="markNotificationRead('${doc.id}')">標示已讀</button></div>`;
  });
  notificationsContainer.innerHTML = html;
}
window.markNotificationRead = async function(nid){
  await db.collection('notifications').doc(nid).update({ status: 'read', readAt: Date.now() });
  loadNotificationsForAdmin();
};